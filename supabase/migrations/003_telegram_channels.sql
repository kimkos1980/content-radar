create table if not exists public.telegram_channels (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  username text,
  url text,
  language text default 'ru',
  category text,
  weight int default 1,
  enabled boolean default true,
  last_message_id bigint default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists telegram_channels_enabled_idx
  on public.telegram_channels(enabled);

create or replace function public.set_telegram_channels_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_telegram_channels_updated_at on public.telegram_channels;

create trigger set_telegram_channels_updated_at
before update on public.telegram_channels
for each row
execute function public.set_telegram_channels_updated_at();
