'use strict';
// UZ News server — no npm packages needed (Node.js 22.13+).
//   npm start         -> http://localhost:3000
//   PORT=8080 npm start
require('./lib/env');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const db = require('./lib/db');
const auth = require('./lib/auth');
const ai = require('./lib/ai');
const digest = require('./lib/digest');

// Auto-delete news older than N days (default 14). Set NEWS_RETENTION_DAYS=0 to disable.
const RETENTION_DAYS = (() => {
  const v = parseInt(process.env.NEWS_RETENTION_DAYS, 10);
  if (process.env.NEWS_RETENTION_DAYS === '0') return 0;
  return Number.isFinite(v) && v > 0 ? v : 14;
})();
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

// Same layout as the original site: index.html, css/, js/, admin/, assets/ live in the project root.
// Only these are served — server.js, lib/, db/, data/ (the database!) are never reachable from the browser.
const PUBLIC_DIR = __dirname;
const PUBLIC_ENTRIES = new Set(['index.html', 'css', 'js', 'admin', 'assets']);
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';      // behind nginx / Cloudflare etc.
const MAX_BODY = 1024 * 1024;                              // 1 MB
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff'
};

// ---------- small helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] || '';
    if (!type.includes('application/json')) return reject(new HttpError(415, 'Content-Type application/json bo\'lishi kerak'));
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "So'rov juda katta")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new HttpError(400, "Noto'g'ri JSON")); }
    });
    req.on('error', reject);
  });
}

const clientIp = (req) => (TRUST_PROXY && req.headers['x-forwarded-for'])
  ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
  : req.socket.remoteAddress || 'unknown';

const isSecure = (req) => process.env.COOKIE_SECURE === '1' ||
  (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- articles ----------
function toApi(row) {
  const hasRu = row.title_ru || row.excerpt_ru || row.content_ru;
  return {
    id: row.id,
    category: row.category_id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    image: row.image,
    author: row.author,
    date: row.published_at,
    views: row.views,
    ru: hasRu ? { title: row.title_ru || '', excerpt: row.excerpt_ru || '', content: row.content_ru || '' } : null
  };
}

async function getArticle(id) {
  const row = await db.getArticleRow(id);
  return row ? toApi(row) : null;
}

function text(v, { max, required = false, label }) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new HttpError(400, `"${label}" maydoni to'ldirilishi shart`);
  if (s.length > max) throw new HttpError(400, `"${label}" ${max} ta belgidan oshmasligi kerak`);
  return s;
}

async function cleanArticle(b) {
  if (!b || typeof b !== 'object') throw new HttpError(400, "Noto'g'ri so'rov");
  const category = typeof b.category === 'string' ? b.category : '';
  if (!(await db.categoryExists(category))) {
    throw new HttpError(400, "Bo'lim topilmadi");
  }
  let image = text(b.image, { max: 2000, label: 'Rasm URL' });
  if (!image) image = DEFAULT_IMAGE;
  if (!/^https?:\/\//i.test(image) && !image.startsWith('/')) {
    throw new HttpError(400, "Rasm URL http:// yoki https:// bilan boshlanishi kerak");
  }
  return {
    category,
    title: text(b.title, { max: 300, required: true, label: 'Sarlavha' }),
    excerpt: text(b.excerpt, { max: 800, required: true, label: 'Qisqa matn' }),
    content: text(b.content, { max: 50000, required: true, label: "To'liq matn" }),
    title_ru: text(b.title_ru, { max: 300, label: 'Sarlavha (RU)' }) || null,
    excerpt_ru: text(b.excerpt_ru, { max: 800, label: 'Qisqa matn (RU)' }) || null,
    content_ru: text(b.content_ru, { max: 50000, label: "To'liq matn (RU)" }) || null,
    image,
    author: text(b.author, { max: 100, label: 'Muallif' }) || 'Admin'
  };
}

const parseId = (s) => {
  const id = parseInt(s, 10);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Topilmadi');
  return id;
};

// ---------- API ----------
async function handleApi(req, res, pathname) {
  const method = req.method;
  const seg = pathname.split('/').filter(Boolean);   // ['api', 'news', '3', 'view']

  // CSRF: browsers always send Origin on cross-site writes — it must match our host
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = req.headers.origin;
    if (origin) {
      let ok = false;
      try { ok = new URL(origin).host === req.headers.host; } catch { /* invalid Origin */ }
      if (!ok) throw new HttpError(403, "Ruxsat yo'q");
    }
  }

  // ----- public -----
  if (seg[1] === 'news') {
    if (seg.length === 2 && method === 'GET') {
      const rows = await db.listArticles();
      return sendJson(res, 200, rows.map(toApi));
    }
    if (seg.length === 4 && seg[3] === 'view' && method === 'POST') {
      const id = parseId(seg[2]);
      const views = await db.incrementViews(id);
      if (views === null) throw new HttpError(404, 'Topilmadi');
      return sendJson(res, 200, { id, views });
    }
  }

  if (seg[1] === 'categories' && seg.length === 2 && method === 'GET') {
    const rows = await db.listCategories();
    return sendJson(res, 200, rows);
  }

  // ----- admin: login / session -----
  if (seg[1] === 'admin') {
    if (seg[2] === 'login' && method === 'POST') {
      const ip = clientIp(req);
      const locked = auth.lockRemaining(ip);
      if (locked) {
        const mins = Math.ceil(locked / 60000);
        throw new HttpError(429, `Juda ko'p noto'g'ri urinish. ${mins} daqiqadan keyin qayta urinib ko'ring`);
      }
      const body = await readJson(req);
      if (await auth.checkAdminCode(typeof body.code === 'string' ? body.code.trim() : '')) {
        auth.recordSuccess(ip);
        const token = await auth.createSession();
        return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(token, isSecure(req)) });
      }
      auth.recordFail(ip);
      await sleep(400);
      throw new HttpError(401, "Kod noto'g'ri");
    }

    if (seg[2] === 'logout' && method === 'POST') {
      await auth.destroySession(req);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie('', isSecure(req)) });
    }

    // everything below needs a valid session
    if (!(await auth.isAuthenticated(req))) throw new HttpError(401, 'Kirish talab qilinadi');

    if (seg[2] === 'me' && method === 'GET') return sendJson(res, 200, { ok: true });

    if (seg[2] === 'news') {
      if (seg.length === 3 && method === 'POST') {
        const a = await cleanArticle(await readJson(req));
        const id = await db.insertArticleRow(a);
        return sendJson(res, 201, await getArticle(id));
      }
      if (seg.length === 4 && method === 'PUT') {
        const id = parseId(seg[3]);
        const a = await cleanArticle(await readJson(req));
        const changed = await db.updateArticleRow(id, a);
        if (!changed) throw new HttpError(404, 'Yangilik topilmadi');
        return sendJson(res, 200, await getArticle(id));
      }
      if (seg.length === 4 && method === 'DELETE') {
        const changed = await db.deleteArticleRow(parseId(seg[3]));
        if (!changed) throw new HttpError(404, 'Yangilik topilmadi');
        return sendJson(res, 200, { ok: true });
      }
    }

    if (seg[2] === 'reset' && method === 'POST') {
      await db.resetArticles();
      return sendJson(res, 200, { ok: true });
    }

    if (seg[2] === 'code' && method === 'POST') {
      const ip = clientIp(req);
      const locked = auth.lockRemaining(ip);
      if (locked) throw new HttpError(429, `Juda ko'p noto'g'ri urinish. ${Math.ceil(locked / 60000)} daqiqadan keyin urinib ko'ring`);
      const body = await readJson(req);
      if (!(await auth.checkAdminCode(typeof body.current === 'string' ? body.current : ''))) {
        auth.recordFail(ip);
        await sleep(400);
        throw new HttpError(403, "Joriy kod noto'g'ri");
      }
      const problem = auth.validateNewCode(body.next);
      if (problem) throw new HttpError(400, problem);
      auth.recordSuccess(ip);
      await auth.setAdminCode(body.next);              // also signs out every session
      const token = await auth.createSession();        // ...so give this browser a fresh one
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(token, isSecure(req)) });
    }

    // ----- AI assist (admin only) -----
    if (seg[2] === 'ai') {
      if (seg[3] === 'status' && method === 'GET') {
        return sendJson(res, 200, { configured: ai.isConfigured() });
      }
      if (seg[3] === 'assist' && method === 'POST') {
        const body = await readJson(req);
        const action = typeof body.action === 'string' ? body.action.trim() : '';
        if (!action) throw new HttpError(400, 'action maydoni kerak');
        try {
          const result = await ai.assist(action, body);
          return sendJson(res, 200, { ok: true, result });
        } catch (e) {
          if (e.code === 'AI_NOT_CONFIGURED') throw new HttpError(503, e.message);
          if (e.status === 429) throw new HttpError(429, 'AI limiga yetildi. Biroz kutib qayta urinib ko\'ring');
          throw new HttpError(e.status || 502, e.message || 'AI xatosi');
        }
      }
    }

    // ----- daily digest "Kun xulosasi" (admin only) -----
    if (seg[2] === 'digest') {
      if (seg[3] === 'status' && seg.length === 4 && method === 'GET') {
        return sendJson(res, 200, await digest.status());
      }
      if (seg[3] === 'run' && seg.length === 4 && method === 'POST') {
        const body = await readJson(req);
        try {
          const result = await digest.run({ dryRun: body.dryRun === true, again: body.again === true });
          return sendJson(res, 200, { ok: true, result });
        } catch (e) {
          if (e instanceof digest.DigestError) throw new HttpError(e.status, e.message);
          throw e;
        }
      }
    }
  }

  throw new HttpError(404, 'Topilmadi');
}

// ---------- static files ----------
function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');

  let rel;
  try { rel = decodeURIComponent(pathname); } catch { throw new HttpError(400, "Noto'g'ri URL"); }
  if (rel.includes('\0')) throw new HttpError(400, "Noto'g'ri URL");

  let file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Forbidden');
  const top = path.relative(PUBLIC_DIR, file).split(path.sep)[0];
  if (top !== '' && !PUBLIC_ENTRIES.has(top)) throw new HttpError(404, 'Sahifa topilmadi');

  let stat = fs.existsSync(file) ? fs.statSync(file) : null;
  if (stat && stat.isDirectory()) {
    if (!pathname.endsWith('/')) {               // /admin -> /admin/ so relative links work
      res.writeHead(301, { Location: pathname + '/' });
      return res.end();
    }
    file = path.join(file, 'index.html');
    stat = fs.existsSync(file) ? fs.statSync(file) : null;
  }
  if (!stat || !stat.isFile()) throw new HttpError(404, 'Sahifa topilmadi');

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...(pathname.startsWith('/admin') ? { 'X-Frame-Options': 'DENY' } : {})
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api' || pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    return serveStatic(req, res, pathname);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) return res.end();
    const wantsJson = (req.url || '').startsWith('/api');
    if (wantsJson) return sendJson(res, status, { error: status === 500 ? 'Server xatosi' : err.message });
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(status === 500 ? 'Server xatosi' : err.message);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Xato: ${PORT}-port band. Boshqa portni tanlang:  PORT=8080 npm start\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

async function runPurge() {
  if (RETENTION_DAYS <= 0) return;
  try {
    const n = await db.purgeOldArticles(RETENTION_DAYS);
    if (n > 0) console.log(`  Eski yangiliklar o'chirildi: ${n} ta (${RETENTION_DAYS} kundan eski)`);
  } catch (e) {
    console.error('  Purge xatosi:', e.message);
  }
}

(async () => {
  await db.init();
  const newCode = await auth.ensureAdminCode();

  server.listen(PORT, HOST, () => {
  console.log(`\n  UZ News ishga tushdi:  http://localhost:${PORT}`);
  console.log(`  Admin panel:           http://localhost:${PORT}/admin/`);
  console.log(`  Supabase:              ${db.SUPABASE_URL}`);
  if (RETENTION_DAYS > 0) {
    console.log(`  Eski yangiliklar:      ${RETENTION_DAYS} kundan keyin avtomatik o'chiriladi`);
    runPurge();
    setInterval(runPurge, PURGE_INTERVAL_MS);
  } else {
    console.log('  Eski yangiliklar:      avtomatik o\'chirish o\'chirilgan (NEWS_RETENTION_DAYS=0)');
  }
  if (newCode) {
    console.log('\n  ================ ADMIN KODI ================');
    console.log(`    ${newCode}`);
    console.log("  Bu kod faqat bir marta ko'rsatiladi — saqlab qo'ying.");
    console.log("  O'zgartirish:  npm run set-code");
    console.log('  ============================================');
  }
  console.log('');
  digest.start().catch((e) => console.error('  Kun xulosasi ishga tushmadi:', e.message));
  });
})().catch((e) => {
  console.error('Ishga tushmadi:', e);
  process.exit(1);
});
