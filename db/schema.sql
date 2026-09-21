-- UZ News — SQLite schema (standard SQL: easy to port to MySQL / PostgreSQL)

PRAGMA foreign_keys = ON;

-- Bo'limlar (Siyosat, Iqtisod, Sport ...)
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  icon        TEXT    NOT NULL,
  color       TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Yangiliklar (title/excerpt/content = O'zbekcha, *_ru = ruscha, ixtiyoriy)
CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   TEXT    NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  title         TEXT    NOT NULL,
  excerpt       TEXT    NOT NULL,
  content       TEXT    NOT NULL,
  title_ru      TEXT,
  excerpt_ru    TEXT,
  content_ru    TEXT,
  image         TEXT    NOT NULL,
  author        TEXT    NOT NULL DEFAULT 'Admin',
  views         INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_category  ON articles(category_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);

-- Sozlamalar (admin kodining hash'i shu yerda saqlanadi)
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Admin sessiyalari (token'ning o'zi emas, faqat SHA-256 hash'i saqlanadi)
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  TEXT    PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
