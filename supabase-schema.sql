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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_project_idx on public.characters(project_id);
create index if not exists relationships_project_idx on public.relationships(project_id);
create index if not exists relationship_events_order_idx on public.relationship_events(project_id, sequence_index);
create index if not exists character_state_events_order_idx on public.character_state_events(project_id, sequence_index);
create index if not exists locations_project_idx on public.locations(project_id);
create index if not exists scripts_project_idx on public.scripts(project_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

create or replace function public.owns_anchor_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = target_project_id and owner_id = auth.uid());
$$;

alter table public.projects enable row level security;
alter table public.characters enable row level security;
alter table public.relationships enable row level security;
alter table public.relationship_events enable row level security;
alter table public.character_state_events enable row level security;
alter table public.locations enable row level security;
alter table public.scripts enable row level security;

create policy "owners read projects" on public.projects for select to authenticated using (owner_id = auth.uid());
create policy "owners create projects" on public.projects for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update projects" on public.projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete projects" on public.projects for delete to authenticated using (owner_id = auth.uid());
create policy "owners manage characters" on public.characters for all to authenticated using (public.owns_anchor_project(project_id)) with check (public.owns_anchor_project(project_id));
create policy "owners manage relationships" on public.relationships for all to authenticated using (public.owns_anchor_project(project_id)) with check (public.owns_anchor_project(project_id));
create policy "owners manage relationship events" on public.relationship_events for all to authenticated using (public.owns_anchor_project(project_id)) with check (public.owns_anchor_project(project_id));
create policy "owners manage character state events" on public.character_state_events for all to authenticated using (public.owns_anchor_project(project_id)) with check (public.owns_anchor_project(project_id));
create policy "owners manage locations" on public.locations for all to authenticated using (public.owns_anchor_project(project_id)) with check (public.owns_anchor_project(project_id));
create policy "owners manage scripts" on public.scripts for all to authenticated using (public.owns_anchor_project(project_id)) with check (public.owns_anchor_project(project_id));

insert into storage.buckets (id, name, public) values ('location-images', 'location-images', false)
on conflict (id) do update set public = false;

create policy "owners read location images" on storage.objects for select to authenticated
using (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = auth.uid() and p.id::text = (storage.foldername(name))[1]));
create policy "owners upload location images" on storage.objects for insert to authenticated
with check (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = auth.uid() and p.id::text = (storage.foldername(name))[1]));
create policy "owners update location images" on storage.objects for update to authenticated
using (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = auth.uid() and p.id::text = (storage.foldername(name))[1]))
with check (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = auth.uid() and p.id::text = (storage.foldername(name))[1]));
create policy "owners delete location images" on storage.objects for delete to authenticated
using (bucket_id = 'location-images' and exists (select 1 from public.projects p where p.owner_id = auth.uid() and p.id::text = (storage.foldername(name))[1]));
