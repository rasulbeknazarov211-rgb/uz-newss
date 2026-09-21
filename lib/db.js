'use strict';
// Supabase (Postgres) — заменяет прежний node:sqlite слой.
// Сервер ходит в Supabase с SECRET (service_role) ключом: он обходит RLS, а таблицы
// закрыты для публичного (publishable/anon) ключа — см. db/schema.pg.sql.
// Ключ НИКОГДА не кладём в код/браузер/git — только в переменные окружения.
require('./env');
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n  Xato: SUPABASE_URL va SUPABASE_KEY o\'rnatilmagan.');
  console.error('  .env.example faylini .env ga nusxalab to\'ldiring (yoki hosting panelida Environment Variables).\n');
  process.exit(1);
}
if (SUPABASE_KEY.startsWith('sb_publishable_')) {
  console.warn('\n  DIQQAT: SUPABASE_KEY publishable kalit. Xavfsizlik uchun SECRET kalit (sb_secret_...) ishlating —');
  console.warn('  Supabase → Project Settings → API Keys. Publishable kalit bilan jadvallar yopilgach server ishlamaydi.\n');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const ROOT = path.join(__dirname, '..');
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'db', 'seed.json'), 'utf8'));

const ARTICLE_COLS = 'id, category_id, title, excerpt, content, title_ru, excerpt_ru, content_ru, image, author, views, published_at';

function must(res, msg) {
  if (res.error) {
    const e = new Error(`${msg}: ${res.error.message}`);
    e.cause = res.error;
    throw e;
  }
  return res.data;
}

// ---------- categories ----------
async function listCategories() {
  const res = await supabase.from('categories').select('id, name, icon, color').order('sort_order');
  return must(res, "bo'limlarni olishda xato");
}

async function categoryExists(id) {
  const res = await supabase.from('categories').select('id').eq('id', id).maybeSingle();
  must(res, "bo'limni tekshirishda xato");
  return !!res.data;
}

async function seedCategories() {
  const res = await supabase.from('categories').upsert(SEED.categories, { onConflict: 'id' });
  must(res, "bo'limlarni yuklashda xato");
}

// ---------- articles ----------
async function listArticles() {
  const res = await supabase.from('articles').select(ARTICLE_COLS)
    .order('published_at', { ascending: false }).order('id', { ascending: false });
  return must(res, 'yangiliklarni olishda xato');
}

async function getArticleRow(id) {
  const res = await supabase.from('articles').select(ARTICLE_COLS).eq('id', id).maybeSingle();
  return must(res, 'yangilikni olishda xato');
}

async function insertArticleRow(a) {
  const res = await supabase.from('articles').insert({
    category_id: a.category, title: a.title, excerpt: a.excerpt, content: a.content,
    title_ru: a.title_ru, excerpt_ru: a.excerpt_ru, content_ru: a.content_ru,
    image: a.image, author: a.author, views: 0, published_at: new Date().toISOString()
  }).select('id').single();
  return must(res, "yangilik qo'shishda xato").id;
}

async function updateArticleRow(id, a) {
  const res = await supabase.from('articles').update({
    category_id: a.category, title: a.title, excerpt: a.excerpt, content: a.content,
    title_ru: a.title_ru, excerpt_ru: a.excerpt_ru, content_ru: a.content_ru,
    image: a.image, author: a.author, updated_at: new Date().toISOString()
  }).eq('id', id).select('id').maybeSingle();
  must(res, 'yangilikni tahrirlashda xato');
  return !!res.data;
}

async function deleteArticleRow(id) {
  const res = await supabase.from('articles').delete().eq('id', id).select('id').maybeSingle();
  must(res, "yangilikni o'chirishda xato");
  return !!res.data;
}

async function incrementViews(id) {
  const res = await supabase.rpc('increment_views', { p_id: id });
  const views = must(res, "ko'rishlar sonini oshirishda xato");
  return typeof views === 'number' ? views : null;
}

// Latest published_at (ISO) in a category, or null — used by the daily digest to know if today's is out
async function latestPublishedAt(categoryId) {
  const res = await supabase.from('articles').select('published_at')
    .eq('category_id', categoryId).order('published_at', { ascending: false }).limit(1).maybeSingle();
  must(res, 'oxirgi e\'lonni olishda xato');
  return res.data ? res.data.published_at : null;
}

async function seedArticles() {
  const rows = SEED.articles.map(a => ({
    category_id: a.category, title: a.title, excerpt: a.excerpt, content: a.content,
    title_ru: a.title_ru, excerpt_ru: a.excerpt_ru, content_ru: a.content_ru,
    image: a.image, author: a.author, views: a.views, published_at: a.date
  }));
  const res = await supabase.from('articles').insert(rows);
  must(res, 'namuna yangiliklarni yuklashda xato');
}

async function resetArticles() {
  const del = await supabase.from('articles').delete().not('id', 'is', null);
  must(del, "yangiliklarni tozalashda xato");
  await seedArticles();
}

async function purgeOldArticles(days) {
  const d = Number.isFinite(days) && days > 0 ? Math.floor(days) : 14;
  const cutoff = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
  const res = await supabase.rpc('purge_old_articles', { p_cutoff: cutoff });
  const n = must(res, "eski yangiliklarni o'chirishda xato");
  return typeof n === 'number' ? n : 0;
}

// ---------- settings ----------
async function getSetting(key) {
  const res = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  must(res, 'sozlamani olishda xato');
  return res.data ? res.data.value : null;
}

async function setSetting(key, value) {
  const res = await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
  must(res, 'sozlamani saqlashda xato');
}

// ---------- admin sessions ----------
async function cleanupSessions(now) {
  const res = await supabase.from('admin_sessions').delete().lt('expires_at', now);
  must(res, 'sessiyalarni tozalashda xato');
}

async function insertSession(tokenHash, now, expiresAt) {
  const res = await supabase.from('admin_sessions')
    .insert({ token_hash: tokenHash, created_at: now, expires_at: expiresAt });
  must(res, 'sessiya yaratishda xato');
}

async function getSession(tokenHash) {
  const res = await supabase.from('admin_sessions').select('expires_at').eq('token_hash', tokenHash).maybeSingle();
  must(res, 'sessiyani tekshirishda xato');
  return res.data;
}

async function deleteSession(tokenHash) {
  const res = await supabase.from('admin_sessions').delete().eq('token_hash', tokenHash);
  must(res, 'sessiyani o\'chirishda xato');
}

async function deleteAllSessions() {
  const res = await supabase.from('admin_sessions').delete().not('token_hash', 'is', null);
  must(res, 'sessiyalarni o\'chirishda xato');
}

// First run: fill the empty database with the built-in categories and news
async function init() {
  await seedCategories();
  const countRes = await supabase.from('articles').select('id', { count: 'exact', head: true });
  must(countRes, "yangiliklar sonini olishda xato");
  const seeded = await getSetting('seeded');
  if ((countRes.count || 0) === 0 && !seeded) {
    await seedArticles();
    await setSetting('seeded', '1');
  }
}

module.exports = {
  init,
  listCategories, categoryExists,
  listArticles, getArticleRow, insertArticleRow, updateArticleRow, deleteArticleRow,
  incrementViews, resetArticles, purgeOldArticles, latestPublishedAt,
  getSetting, setSetting,
  cleanupSessions, insertSession, getSession, deleteSession, deleteAllSessions,
  SUPABASE_URL
};
