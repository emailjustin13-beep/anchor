-- Anchor — secure fresh-install schema
-- Run in the Supabase SQL Editor for a new project.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled Project',
  logline text not null default '',
  genre text not null default '',
  format text not null default 'screenplay' check (format in ('screenplay','novel','short_story')),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'New Character',
  age text not null default '',
  gender text not null default '',
  physical text not null default '',
  role text not null default '',
  backstory text not null default '',
  goals text not null default '',
  fears text not null default '',
  motivations text not null default '',
  personality text not null default '',
  voice text not null default '',
  notes text not null default '',
  life_state text not null default 'alive' check (life_state in ('alive','missing','presumed_dead','deceased','unknown')),
  color text not null default '#C8A96A',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  character_a uuid not null references public.characters(id) on delete cascade,
  character_b uuid not null references public.characters(id) on delete cascade,
  type text not null default 'stranger' check (type in ('ally','rival','romantic','family','mentor','stranger','enemy','complicated')),
  status text not null default '',
  history text not null default '',
  notes text not null default '',
  tension int not null default 0 check (tension between 0 and 100),
  ai_reasoning text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_a, character_b),
  check (character_a <> character_b)
);

create table if not exists public.relationship_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  sequence_index bigint not null default 0,
  segment_type text not null default 'scene',
  segment_label text not null default '',
  relationship_type text not null default 'stranger' check (relationship_type in ('ally','rival','romantic','family','mentor','stranger','enemy','complicated')),
  tension int not null default 0 check (tension between 0 and 100),
  summary text not null default '',
  evidence text not null default '',
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.character_state_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  sequence_index bigint not null default 0,
  segment_type text not null default 'scene',
  segment_label text not null default '',
  state text not null default 'unknown' check (state in ('alive','missing','presumed_dead','deceased','unknown')),
  summary text not null default '',
  evidence text not null default '',
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'New Location',
  description text not null default '',
  atmosphere text not null default '',
  notes text not null default '',
  image_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'Untitled',
  content text not null default '',
  content_json jsonb,
  title_page jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.script_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  script_id uuid not null references public.scripts(id) on delete cascade,
  label text not null,
  title text not null default 'Untitled',
  content text not null default '',
  content_json jsonb,
  title_page jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists characters_project_idx on public.characters(project_id);
create index if not exists relationships_project_idx on public.relationships(project_id);
create index if not exists relationships_character_b_idx on public.relationships(character_b);
create index if not exists relationship_events_order_idx on public.relationship_events(project_id, sequence_index);
create index if not exists relationship_events_relationship_idx on public.relationship_events(relationship_id);
create index if not exists character_state_events_order_idx on public.character_state_events(project_id, sequence_index);
create index if not exists character_state_events_character_idx on public.character_state_events(character_id);
create index if not exists locations_project_idx on public.locations(project_id);
create index if not exists scripts_project_idx on public.scripts(project_id);
create index if not exists script_versions_project_idx on public.script_versions(project_id);
create index if not exists script_versions_script_idx on public.script_versions(script_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists projects_updated_at on public.projects;
drop trigger if exists characters_updated_at on public.characters;
drop trigger if exists relationships_updated_at on public.relationships;
drop trigger if exists locations_updated_at on public.locations;
drop trigger if exists scripts_updated_at on public.scripts;
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger characters_updated_at before update on public.characters for each row execute function public.set_updated_at();
create trigger relationships_updated_at before update on public.relationships for each row execute function public.set_updated_at();
create trigger locations_updated_at before update on public.locations for each row execute function public.set_updated_at();
create trigger scripts_updated_at before update on public.scripts for each row execute function public.set_updated_at();

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

alter table public.projects enable row level security;
alter table public.characters enable row level security;
alter table public.relationships enable row level security;
alter table public.relationship_events enable row level security;
alter table public.character_state_events enable row level security;
alter table public.locations enable row level security;
alter table public.scripts enable row level security;
alter table public.script_versions enable row level security;

drop policy if exists "owners read projects" on public.projects;
drop policy if exists "owners create projects" on public.projects;
drop policy if exists "owners update projects" on public.projects;
drop policy if exists "owners delete projects" on public.projects;
drop policy if exists "owners manage characters" on public.characters;
drop policy if exists "owners manage relationships" on public.relationships;
drop policy if exists "owners manage relationship events" on public.relationship_events;
drop policy if exists "owners manage character state events" on public.character_state_events;
drop policy if exists "owners manage locations" on public.locations;
drop policy if exists "owners manage scripts" on public.scripts;
drop policy if exists "owners manage script versions" on public.script_versions;

create policy "owners read projects" on public.projects for select to authenticated
using (owner_id = (select auth.uid()));
create policy "owners create projects" on public.projects for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy "owners update projects" on public.projects for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owners delete projects" on public.projects for delete to authenticated
using (owner_id = (select auth.uid()));

create policy "owners manage characters" on public.characters for all to authenticated
using (exists (select 1 from public.projects p where p.id = characters.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = characters.project_id and p.owner_id = (select auth.uid())));
create policy "owners manage relationships" on public.relationships for all to authenticated
using (exists (select 1 from public.projects p where p.id = relationships.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = relationships.project_id and p.owner_id = (select auth.uid())));
create policy "owners manage relationship events" on public.relationship_events for all to authenticated
using (exists (select 1 from public.projects p where p.id = relationship_events.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = relationship_events.project_id and p.owner_id = (select auth.uid())));
create policy "owners manage character state events" on public.character_state_events for all to authenticated
using (exists (select 1 from public.projects p where p.id = character_state_events.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = character_state_events.project_id and p.owner_id = (select auth.uid())));
create policy "owners manage locations" on public.locations for all to authenticated
using (exists (select 1 from public.projects p where p.id = locations.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = locations.project_id and p.owner_id = (select auth.uid())));
create policy "owners manage scripts" on public.scripts for all to authenticated
using (exists (select 1 from public.projects p where p.id = scripts.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = scripts.project_id and p.owner_id = (select auth.uid())));
create policy "owners manage script versions" on public.script_versions for all to authenticated
using (exists (select 1 from public.projects p where p.id = script_versions.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = script_versions.project_id and p.owner_id = (select auth.uid())));

revoke all on table
  public.projects,
  public.characters,
  public.relationships,
  public.relationship_events,
  public.character_state_events,
  public.locations,
  public.scripts,
  public.script_versions
from anon;

grant select, insert, update, delete on table
  public.projects,
  public.characters,
  public.relationships,
  public.relationship_events,
  public.character_state_events,
  public.locations,
  public.scripts,
  public.script_versions
to authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

insert into storage.buckets (id, name, public) values ('location-images', 'location-images', false)
on conflict (id) do update set public = false;

drop policy if exists "public location images" on storage.objects;
drop policy if exists "owners read location images" on storage.objects;
drop policy if exists "owners upload location images" on storage.objects;
drop policy if exists "owners update location images" on storage.objects;
drop policy if exists "owners delete location images" on storage.objects;

create policy "owners read location images" on storage.objects for select to authenticated
using (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = (select auth.uid()) and p.id::text = (storage.foldername(name))[1]));
create policy "owners upload location images" on storage.objects for insert to authenticated
with check (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = (select auth.uid()) and p.id::text = (storage.foldername(name))[1]));
create policy "owners update location images" on storage.objects for update to authenticated
using (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = (select auth.uid()) and p.id::text = (storage.foldername(name))[1]))
with check (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = (select auth.uid()) and p.id::text = (storage.foldername(name))[1]));
create policy "owners delete location images" on storage.objects for delete to authenticated
using (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = (select auth.uid()) and p.id::text = (storage.foldername(name))[1]));
