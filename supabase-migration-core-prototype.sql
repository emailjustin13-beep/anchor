-- Anchor existing-project migration
-- 1. Sign in once through the new Anchor login.
-- 2. Replace REPLACE_WITH_YOUR_EMAIL below with that account.
-- 3. Run this entire file in Supabase SQL Editor.
-- The transaction aborts safely if the account cannot be found.

begin;

alter table public.projects add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.projects add column if not exists onboarded boolean not null default false;
alter table public.characters add column if not exists gender text not null default '';
alter table public.characters add column if not exists physical text not null default '';
alter table public.characters add column if not exists life_state text not null default 'alive';
alter table public.relationships alter column type set default 'stranger';

do $$
declare anchor_owner uuid;
begin
  select id into anchor_owner from auth.users where lower(email) = lower('REPLACE_WITH_YOUR_EMAIL') limit 1;
  if anchor_owner is null then
    raise exception 'No matching owner. Sign in first and replace REPLACE_WITH_YOUR_EMAIL.';
  end if;
  update public.projects set owner_id = anchor_owner where owner_id is null;
end $$;

alter table public.projects alter column owner_id set default auth.uid();
alter table public.projects alter column owner_id set not null;
alter table public.characters drop constraint if exists characters_life_state_check;
alter table public.characters add constraint characters_life_state_check check (life_state in ('alive','missing','presumed_dead','deceased','unknown'));

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

create index if not exists relationship_events_order_idx on public.relationship_events(project_id, sequence_index);
create index if not exists character_state_events_order_idx on public.character_state_events(project_id, sequence_index);

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

drop policy if exists "public projects" on public.projects;
drop policy if exists "public characters" on public.characters;
drop policy if exists "public relationships" on public.relationships;
drop policy if exists "public locations" on public.locations;
drop policy if exists "public scripts" on public.scripts;
drop policy if exists "public location images" on storage.objects;

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

update storage.buckets set public = false where id = 'location-images';

commit;
