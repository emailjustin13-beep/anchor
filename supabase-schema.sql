-- ============================================================
-- Anchor — Supabase Schema
-- Run this in your Supabase project's SQL Editor
-- ============================================================

-- ── Projects ──────────────────────────────────────────────────
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Untitled Project',
  logline     text not null default '',
  genre       text not null default '',
  format      text not null default 'screenplay' check (format in ('screenplay','novel','short_story')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Characters ────────────────────────────────────────────────
create table if not exists public.characters (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null default 'New Character',
  age           text not null default '',
  role          text not null default '',
  backstory     text not null default '',
  goals         text not null default '',
  fears         text not null default '',
  motivations   text not null default '',
  personality   text not null default '',
  voice         text not null default '',
  notes         text not null default '',
  color         text not null default '#C8A96A',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Relationships ─────────────────────────────────────────────
create table if not exists public.relationships (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  character_a   uuid not null references public.characters(id) on delete cascade,
  character_b   uuid not null references public.characters(id) on delete cascade,
  type          text not null default 'neutral' check (type in ('ally','rival','romantic','family','mentor','stranger','enemy','complicated')),
  status        text not null default '',
  history       text not null default '',
  notes         text not null default '',
  tension       int  not null default 0 check (tension >= 0 and tension <= 100),
  ai_reasoning  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(character_a, character_b)
);

-- ── Locations ─────────────────────────────────────────────────
create table if not exists public.locations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null default 'New Location',
  description   text not null default '',
  atmosphere    text not null default '',
  notes         text not null default '',
  image_url     text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Scripts ───────────────────────────────────────────────────
create table if not exists public.scripts (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  title         text not null default 'Untitled',
  content       text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Auto-update updated_at ────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_updated_at     on public.projects;
drop trigger if exists characters_updated_at   on public.characters;
drop trigger if exists relationships_updated_at on public.relationships;
drop trigger if exists locations_updated_at    on public.locations;
drop trigger if exists scripts_updated_at      on public.scripts;

create trigger projects_updated_at      before update on public.projects      for each row execute function public.set_updated_at();
create trigger characters_updated_at    before update on public.characters    for each row execute function public.set_updated_at();
create trigger relationships_updated_at before update on public.relationships for each row execute function public.set_updated_at();
create trigger locations_updated_at     before update on public.locations     for each row execute function public.set_updated_at();
create trigger scripts_updated_at       before update on public.scripts       for each row execute function public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────
alter table public.projects       enable row level security;
alter table public.characters     enable row level security;
alter table public.relationships  enable row level security;
alter table public.locations      enable row level security;
alter table public.scripts        enable row level security;

create policy "public projects"       on public.projects       for all using (true) with check (true);
create policy "public characters"     on public.characters     for all using (true) with check (true);
create policy "public relationships"  on public.relationships  for all using (true) with check (true);
create policy "public locations"      on public.locations      for all using (true) with check (true);
create policy "public scripts"        on public.scripts        for all using (true) with check (true);

-- ── Storage bucket for location images ───────────────────────
insert into storage.buckets (id, name, public)
values ('location-images', 'location-images', true)
on conflict (id) do nothing;

create policy "public location images"
  on storage.objects for all
  using (bucket_id = 'location-images')
  with check (bucket_id = 'location-images');
