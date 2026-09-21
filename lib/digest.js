'use strict';
// "Kun xulosasi" — daily digest.
//   1. reads RSS feeds (last 24 h)         2. asks the AI for a short list of points, each citing its sources
//   3. drops every point that has no valid source or contains a number that is not in its sources
//   4. adds the exchange rates straight from the Central Bank of Uzbekistan (never from the AI)
//   5. publishes the result as an article in the "digest" category
// No npm packages: native fetch + a tiny RSS/Atom parser.
const db = require('./db');
const ai = require('./ai');

const CATEGORY = 'digest';
const AUTHOR = 'UZ News AI';
const IMAGE = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80';
const TZ_OFFSET_H = 5;                                   // Asia/Tashkent is UTC+5 all year (no DST)
const WINDOW_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 30 * 60 * 1000;
const TICK_MS = 60 * 1000;
const FEED_REFRESH_MS = 30 * 60 * 1000;
const FEED_TIMEOUT_MS = 10000;
const MAX_FEED_BYTES = 3 * 1024 * 1024;
const MAX_ITEMS_TOTAL = 40;
const MAX_ITEMS_PER_FEED = 12;
const CBU_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/';
const STATE_KEY = 'digest_state';

const DEFAULT_FEEDS = [
  'Kun.uz|https://kun.uz/news/rss',
  'Daryo|https://daryo.uz/feed/',
  'Gazeta.uz|https://www.gazeta.uz/uz/rss/',
  "BBC O'zbek|https://feeds.bbci.co.uk/uzbek/rss.xml"
].join(',');

// ---------- config (read once at start) ----------
const intEnv = (name, def, min, max) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v >= min && v <= max ? v : def;
};
const ENABLED = process.env.DIGEST_ENABLED !== '0';
const MIN_ITEMS = intEnv('DIGEST_MIN_ITEMS', 8, 1, 200);
const MIN_POINTS = intEnv('DIGEST_MIN_POINTS', 3, 1, 20);
const MAX_ATTEMPTS = intEnv('DIGEST_MAX_ATTEMPTS', 3, 1, 10);
const SCHEDULE = (() => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((process.env.DIGEST_TIME || '').trim());
  if (m && +m[1] < 24 && +m[2] < 60) return { h: +m[1], m: +m[2] };
  return { h: 8, m: 0 };
})();
const scheduleLabel = () => `${String(SCHEDULE.h).padStart(2, '0')}:${String(SCHEDULE.m).padStart(2, '0')} (Toshkent vaqti)`;

const FEEDS = (process.env.DIGEST_FEEDS || DEFAULT_FEEDS).split(',').map(s => s.trim()).filter(Boolean).map(s => {
  const i = s.indexOf('|');
  const name = (i > 0 ? s.slice(0, i) : '').trim();
  const url = (i > 0 ? s.slice(i + 1) : s).trim();
  return { name: name || safeHost(url), url };
}).filter(f => /^https?:\/\//i.test(f.url));

function safeHost(u) { try { return new URL(u).host; } catch { return u; } }

class DigestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- Tashkent time ----------
const shifted = (ms) => new Date(ms + TZ_OFFSET_H * 3600 * 1000);            // read with getUTC* = Tashkent wall clock
const dayKey = (ms) => shifted(ms).toISOString().slice(0, 10);              // YYYY-MM-DD in Tashkent
const scheduledAt = (key) => {
  const [y, mo, d] = key.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, SCHEDULE.h - TZ_OFFSET_H, SCHEDULE.m);
};
const nextDayKey = (key) => dayKey(scheduledAt(key) + 24 * 3600 * 1000);
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];

// ---------- RSS / Atom ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…' };
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function safeChar(cp) { try { return String.fromCodePoint(cp); } catch { return ' '; } }

function clean(raw) {
  if (!raw) return '';
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = decode(s);                                   // entity-encoded HTML (&lt;p&gt;) becomes real tags...
  s = s.replace(/<[^>]*>/g, ' ');                  // ...which are stripped here
  s = decode(s);
  return s.replace(/\s+/g, ' ').trim();
}

function tag(block, names) {
  for (const n of names) {
    const m = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i').exec(block);
    if (m) return m[1];
  }
  return '';
}

function parseFeed(xml, source) {
  const items = [];
  const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[2];
    const title = clean(tag(b, ['title']));
    const desc = clean(tag(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 400);
    const when = Date.parse(clean(tag(b, ['pubDate', 'published', 'updated', 'dc:date'])));
    if (!title || !Number.isFinite(when)) continue;    // without a date we cannot know it is from the last 24 h
    items.push({ source, title, desc, at: when });
  }
  return items;
}

async function fetchLimited(url, timeoutMs, accept) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'UZNewsDigest/1.0', Accept: accept },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FEED_BYTES) throw new Error('javob juda katta');
  return buf.toString('utf8');
}

// ---------- feed cache ----------
let cache = { at: 0, items: [] };
const feedState = new Map(FEEDS.map(f => [f.name, { name: f.name, url: f.url, ok: null, count: 0, error: '' }]));
let refreshing = null;

async function refreshFeeds() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const all = [];
    await Promise.all(FEEDS.map(async (f) => {
      const st = feedState.get(f.name);
      try {
        const items = parseFeed(await fetchLimited(f.url, FEED_TIMEOUT_MS, 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'), f.name);
        if (!items.length) throw new Error("yangiliklar topilmadi (RSS emas yoki bo'sh)");
        Object.assign(st, { ok: true, count: items.length, error: '' });
        all.push(...items);
      } catch (e) {
        Object.assign(st, { ok: false, count: 0, error: (e.name === 'TimeoutError' ? 'vaqt tugadi' : e.message || 'xato').slice(0, 120) });
      }
    }));
    cache = { at: Date.now(), items: all };
    return all;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

const recentItems = (items = cache.items, now = Date.now()) =>
  items.filter(i => i.at <= now + 10 * 60 * 1000 && now - i.at <= WINDOW_MS);

// ---------- Central Bank rates ----------
const CCY = [['USD', 'AQSh dollari'], ['EUR', 'Yevro'], ['RUB', 'Rossiya rubli']];
const fmtRate = (n) => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

async function fetchRates() {
  const list = JSON.parse(await fetchLimited(CBU_URL, 8000, 'application/json'));
  if (!Array.isArray(list)) throw new Error('kutilmagan javob');
  const rows = [];
  let date = '';
  for (const [code, name] of CCY) {
    const r = list.find(x => x && x.Ccy === code);
    const rate = r ? parseFloat(r.Rate) : NaN;
    if (Number.isFinite(rate) && rate > 0) { rows.push(`1 ${name} = ${fmtRate(rate)} so'm`); date = date || String(r.Date || ''); }
  }
  if (!rows.length) throw new Error("kurslar topilmadi");
  return `Valyuta kurslari (O'zbekiston Markaziy banki${date ? ', ' + date : ''}): ${rows.join('; ')}.`;
}

// ---------- AI step + fact check ----------
const digitRuns = (s) => new Set(String(s).match(/\d+/g) || []);

function buildPrompt(items) {
  const list = items.map((it, i) => `[${i + 1}] (${it.source}) ${it.title}${it.desc ? ' — ' + it.desc : ''}`).join('\n');
  return `Quyida oxirgi 24 soatdagi yangiliklar ro'yxati (manba raqami bilan). Ulardan kunning eng muhim 5–8 ta voqeasini tanlab, qisqa xulosa tuz.

QOIDALAR:
- Faqat ro'yxatdagi ma'lumotdan foydalan. O'zingdan hech narsa qo'shma, taxmin qilma, izoh yozma.
- Har bir band 1–2 jumla, o'zbek tilida (lotin yozuvida). Manba rus yoki ingliz tilida bo'lsa, tarjima qil.
- Har bir band uchun "sources" maydonida shu ma'lumot olingan manba raqamlarini (1–3 ta) ko'rsat.
- Raqam, foiz, summa va sanalarni FAQAT manbadagi ko'rinishida yoz. Manbada yo'q raqamni yozma. Bugungi sanani yozma.
- Valyuta kurslari haqida yozma (ular alohida qo'shiladi).
- Bir voqea bir marta bo'lsin.

Faqat shu JSON formatida qaytar:
{"points":[{"text":"...","sources":[1,3]}]}

YANGILIKLAR:
${list}`;
}

function verifyPoints(rawPoints, items) {
  const kept = [];
  let dropped = 0;
  const seen = new Set();
  for (const p of Array.isArray(rawPoints) ? rawPoints : []) {
    const text = typeof p?.text === 'string' ? p.text.replace(/\s+/g, ' ').trim() : '';
    const ids = [...new Set((Array.isArray(p?.sources) ? p.sources : []).map(Number))]
      .filter(n => Number.isInteger(n) && n >= 1 && n <= items.length).slice(0, 3);
    const key = text.toLowerCase();
    if (!text || text.length > 600 || !ids.length || seen.has(key)) { dropped++; continue; }
    const src = ids.map(n => items[n - 1]);
    const allowed = digitRuns(src.map(s => `${s.title} ${s.desc}`).join(' '));
    const ok = [...digitRuns(text)].every(d => allowed.has(d));
    if (!ok) { dropped++; continue; }
    seen.add(key);
    kept.push({ text, sources: [...new Set(src.map(s => s.source))] });
  }
  return { kept, dropped };
}

function shorten(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max).replace(/\s+\S*$/, '');
  return cut + '…';
}

// ---------- generate / publish ----------
async function generate() {
  if (!ai.isConfigured()) {
    throw new DigestError(503, "GROQ_API_KEY o'rnatilmagan. Terminalda: GROQ_API_KEY=gsk_... npm start");
  }
  await refreshFeeds();
  const now = Date.now();
  const pool = recentItems(cache.items, now);
  if (pool.length < MIN_ITEMS) {
    const bad = [...feedState.values()].filter(f => f.ok === false).length;
    throw new DigestError(422, `Oxirgi 24 soatda yangiliklar yetarli emas: ${pool.length} ta (kamida ${MIN_ITEMS} ta kerak)` +
      (bad ? `. ${bad} ta manba ishlamadi` : ''));
  }

  // newest first, but no single feed dominates
  const perFeed = new Map();
  const items = pool.sort((a, b) => b.at - a.at).filter(it => {
    const n = (perFeed.get(it.source) || 0) + 1;
    perFeed.set(it.source, n);
    return n <= MAX_ITEMS_PER_FEED;
  }).slice(0, MAX_ITEMS_TOTAL);

  let raw;
  try {
    raw = await ai.chat([
      { role: 'system', content: "Sen ehtiyotkor o'zbek muharririsan. Faqat berilgan manbalarga tayanasan. Javob faqat JSON." },
      { role: 'user', content: buildPrompt(items) }
    ], { temperature: 0.2, maxTokens: 1800, json: true });
  } catch (e) {
    if (e.code === 'AI_NOT_CONFIGURED') throw new DigestError(503, e.message);
    if (e.status === 429) throw new DigestError(429, "AI limiga yetildi. Biroz kutib qayta urinib ko'ring");
    throw new DigestError(502, e.message || 'AI xatosi');
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new DigestError(502, 'AI JSON qaytara olmadi'); }

  const { kept, dropped } = verifyPoints(parsed.points, items);
  if (kept.length < MIN_POINTS) {
    throw new DigestError(422, `Fakt tekshiruvidan keyin yetarli band qolmadi: ${kept.length} ta (kamida ${MIN_POINTS} ta kerak, ${dropped} ta tashlandi)`);
  }

  let rates = '';
  let warning = '';
  try { rates = await fetchRates(); } catch (e) { warning = `Valyuta kurslari olinmadi (${e.message}).`; }

  const t = shifted(now);
  const title = `Kun xulosasi — ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`;
  const bullets = kept.map(p => `• ${p.text} (Manba: ${p.sources.join(', ')})`);
  const content = [
    "Oxirgi 24 soatdagi asosiy voqealar (ochiq RSS manbalar asosida sun'iy intellekt tayyorlagan):",
    ...bullets,
    ...(rates ? [rates] : [])
  ].join('\n\n');
  const excerpt = shorten('Oxirgi 24 soatdagi asosiy voqealar: ' + kept.slice(0, 2).map(p => (/[.!?…]$/.test(p.text) ? p.text : p.text + '.')).join(' '), 400);

  return {
    article: { category: CATEGORY, title, excerpt, content, image: IMAGE, author: AUTHOR, title_ru: null, excerpt_ru: null, content_ru: null },
    stats: { points: kept.length, droppedPoints: dropped, items: items.length, warning }
  };
}

// ---------- persisted state (survives restarts, so no duplicate posts / lost attempt counter) ----------
let state = { day: '', attempts: 0, lastAttemptAt: 0, lastRun: null };
let running = false;

async function loadState() {
  try {
    const v = await db.getSetting(STATE_KEY);
    if (v) state = { ...state, ...JSON.parse(v) };
  } catch (e) { console.error('  Digest holatini o\'qib bo\'lmadi:', e.message); }
}
async function saveState() {
  try { await db.setSetting(STATE_KEY, JSON.stringify(state)); }
  catch (e) { console.error('  Digest holatini saqlab bo\'lmadi:', e.message); }
}
function rollDay(now) {
  const k = dayKey(now);
  if (state.day !== k) state = { ...state, day: k, attempts: 0, lastAttemptAt: 0 };
}

async function publishedToday(now = Date.now()) {
  const last = await db.latestPublishedAt(CATEGORY);
  return !!last && dayKey(Date.parse(last)) === dayKey(now);
}

// opts: { dryRun, again, auto }
async function run({ dryRun = false, again = false, auto = false } = {}) {
  if (running) throw new DigestError(409, 'Xulosa hozir tayyorlanmoqda, biroz kuting');
  running = true;
  const now = Date.now();
  try {
    if (!dryRun && !again && await publishedToday(now)) {
      throw new DigestError(409, "Bugungi xulosa allaqachon e'lon qilingan");
    }
    rollDay(now);
    if (auto) { state.attempts += 1; state.lastAttemptAt = now; await saveState(); }

    let out;
    try {
      out = await generate();
    } catch (e) {
      if (!dryRun) {
        state.lastRun = { at: new Date().toISOString(), ok: false, message: e.message };
        await saveState();
      }
      throw e;
    }
    if (dryRun) return { dryRun: true, article: out.article, stats: out.stats };

    const a = out.article;
    try {   // best effort: Russian version
      const ru = await ai.assist('translate_ru', { title: a.title, excerpt: a.excerpt, content: a.content });
      a.title_ru = ru.title_ru || null; a.excerpt_ru = ru.excerpt_ru || null; a.content_ru = ru.content_ru || null;
      if (!a.title_ru || !a.content_ru) { a.title_ru = a.excerpt_ru = a.content_ru = null; throw new Error('bo\'sh javob'); }
    } catch (e) {
      out.stats.warning = [out.stats.warning, `Ruscha tarjima qilinmadi (${e.message}).`].filter(Boolean).join(' ');
    }
    let id;
    try {
      id = await db.insertArticleRow(a);
    } catch (e) {
      state.lastRun = { at: new Date().toISOString(), ok: false, message: e.message };
      await saveState();
      throw new DigestError(500, e.message);
    }
    state.lastRun = { at: new Date().toISOString(), ok: true, message: `E'lon qilindi (${out.stats.points} band)` };
    await saveState();
    return { dryRun: false, id, title: a.title, stats: out.stats };
  } finally {
    running = false;
  }
}

// ---------- status (for the admin tab) ----------
async function status() {
  const now = Date.now();
  rollDay(now);
  let pub = false;
  try { pub = await publishedToday(now); } catch (e) { console.error('  Digest status:', e.message); }
  const configured = ai.isConfigured();
  const gaveUp = !pub && state.attempts >= MAX_ATTEMPTS;
  const failed = !!(state.lastRun && !state.lastRun.ok);
  const retrying = ENABLED && configured && !pub && !gaveUp && failed && state.attempts > 0;

  const today = dayKey(now);
  let next;
  if (pub || gaveUp) next = scheduledAt(nextDayKey(today));
  else if (now < scheduledAt(today)) next = scheduledAt(today);
  else if (state.lastAttemptAt) next = Math.max(now, state.lastAttemptAt + RETRY_MS);
  else next = now;

  return {
    enabled: ENABLED,
    aiConfigured: configured,
    publishedToday: pub,
    gaveUpToday: ENABLED && configured && gaveUp,
    retrying,
    attemptsToday: state.attempts,
    maxAttempts: MAX_ATTEMPTS,
    nextRunAt: new Date(next).toISOString(),
    schedule: scheduleLabel(),
    model: ai.MODEL,
    lastRun: state.lastRun,
    cachedItems: recentItems().length,
    minItems: MIN_ITEMS,
    feeds: [...feedState.values()]
  };
}

// ---------- scheduler ----------
async function tick() {
  if (!ENABLED || running || !ai.isConfigured()) return;
  const now = Date.now();
  rollDay(now);
  if (now < scheduledAt(state.day)) return;
  if (state.attempts >= MAX_ATTEMPTS) return;
  if (state.lastAttemptAt && now - state.lastAttemptAt < RETRY_MS) return;
  try {
    if (await publishedToday(now)) return;
    const r = await run({ auto: true });
    console.log(`  Kun xulosasi e'lon qilindi: ${r.title} (${r.stats.points} band)`);
  } catch (e) {
    console.error(`  Kun xulosasi xatosi (urinish ${state.attempts}/${MAX_ATTEMPTS}): ${e.message}`);
  }
}

async function start() {
  await loadState();
  if (ENABLED) console.log(`  Kun xulosasi:          har kuni ${scheduleLabel()}${ai.isConfigured() ? '' : ' (GROQ_API_KEY yo\'q — ishlamaydi)'}`);
  else console.log("  Kun xulosasi:          avtomatik e'lon o'chirilgan (DIGEST_ENABLED=0)");
  setTimeout(() => refreshFeeds().catch(() => {}), 3000).unref();
  setInterval(() => refreshFeeds().catch(() => {}), FEED_REFRESH_MS).unref();
  setInterval(() => { tick().catch(e => console.error('  Digest tick:', e.message)); }, TICK_MS).unref();
}

module.exports = { start, run, status, DigestError, _test: { parseFeed, verifyPoints, dayKey, scheduledAt } };
