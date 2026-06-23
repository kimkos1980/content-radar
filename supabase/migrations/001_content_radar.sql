create extension if not exists "pgcrypto";

create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('youtube', 'google_news', 'rss', 'manual')),
  name text not null,
  url text,
  query text,
  language text not null default 'ru',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.content_sources(id) on delete set null,
  source_type text not null check (source_type in ('youtube', 'google_news', 'rss', 'manual')),
  source_name text not null,
  source_url text not null,
  title text not null,
  description text,
  thumbnail_url text,
  language text,
  category text,
  score integer not null default 0,
  status text not null default 'new' check (status in ('new', 'approved', 'rejected', 'in_work', 'urgent', 'remake', 'used')),
  found_at timestamptz not null default now(),
  published_at timestamptz,
  editor_note text,
  constraint content_items_source_url_unique unique (source_url)
);

create table if not exists public.content_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  language text not null default 'ru',
  category text not null,
  weight integer not null default 1,
  enabled boolean not null default true
);

create index if not exists content_sources_enabled_idx on public.content_sources(enabled);
create index if not exists content_items_status_idx on public.content_items(status);
create index if not exists content_items_category_idx on public.content_items(category);
create index if not exists content_items_found_at_idx on public.content_items(found_at desc);
create index if not exists content_keywords_enabled_language_idx on public.content_keywords(enabled, language);
