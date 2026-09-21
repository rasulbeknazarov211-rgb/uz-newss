-- UZ News — Supabase (Postgres) schema
-- Запусти это в Supabase → SQL Editor → New query → Run

create extension if not exists pgcrypto;

-- Bo'limlar (Siyosat, Iqtisod, Sport ...)
create table if not exists categories (
  id          text    primary key,
  name        text    not null,
  icon        text    not null,
  color       text    not null,
  sort_order  integer not null default 0
);

-- Yangiliklar
create table if not exists articles (
  id            bigint generated always as identity primary key,
  category_id   text    not null references categories(id) on update cascade on delete restrict,
  title         text    not null,
  excerpt       text    not null,
  content       text    not null,
  title_ru      text,
  excerpt_ru    text,
  content_ru    text,
  image         text    not null,
  author        text    not null default 'Admin',
  views         integer not null default 0,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_articles_category  on articles(category_id);
create index if not exists idx_articles_published on articles(published_at);

-- Sozlamalar (admin kodining hash'i shu yerda saqlanadi)
create table if not exists settings (
  key    text primary key,
  value  text not null
);

-- Admin sessiyalari (faqat token hash saqlanadi)
create table if not exists admin_sessions (
  token_hash  text primary key,
  created_at  bigint not null,
  expires_at  bigint not null
);

-- Atomik "views + 1" uchun funksiya (race condition bo'lmasligi uchun)
create or replace function increment_views(p_id bigint)
returns integer
language sql
security definer
set search_path = public
as $$
  update articles set views = views + 1 where id = p_id
  returning views;
$$;

-- Eski (14+ kunlik) yangiliklarni o'chirish funksiyasi
create or replace function purge_old_articles(p_cutoff timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from articles where published_at < p_cutoff returning id
  )
  select count(*)::integer from deleted;
$$;

-- ============================================================
-- XAVFSIZLIK: jadvallarni yopamiz.
-- Server SECRET kalit (sb_secret_... / service_role) bilan ishlaydi — u RLS'ni chetlab o'tadi.
-- Publishable (anon) kalit esa hech narsani o'qiy/yoza olmaydi (settings ichida admin kodi hash'i,
-- admin_sessions ichida sessiyalar bor — ularni ochiq qoldirish mumkin emas).
-- Bu blokni eski sxema ishga tushirilgan bo'lsa ham qayta ishga tushirish xavfsiz.
-- ============================================================
alter table categories     enable row level security;
alter table articles       enable row level security;
alter table settings       enable row level security;
alter table admin_sessions enable row level security;

revoke all on categories, articles, settings, admin_sessions from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

revoke execute on function increment_views(bigint)         from public, anon, authenticated;
revoke execute on function purge_old_articles(timestamptz) from public, anon, authenticated;
grant  execute on function increment_views(bigint)         to service_role;
grant  execute on function purge_old_articles(timestamptz) to service_role;
