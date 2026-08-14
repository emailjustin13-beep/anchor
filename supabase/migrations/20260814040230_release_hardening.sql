-- Anchor production release hardening
--
-- This migration deliberately stops if legacy projects still have no owner.
-- Resolve those records first so no writer's work is assigned by assumption.

begin;

do $$
begin
  if exists (select 1 from public.projects where owner_id is null) then
    raise exception using
      errcode = '23502',
      message = 'Anchor release blocked: legacy projects still have no owner.',
      hint = 'Claim or archive every ownerless project, then run this migration again.';
  end if;
end
$$;

alter table public.projects alter column owner_id set default auth.uid();
alter table public.projects alter column owner_id set not null;

-- Cover every foreign key and every owner/project lookup used by the client or RLS.
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

-- Trigger helpers use caller privileges and a fixed search path.
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

-- The former SECURITY DEFINER ownership helper was exposed through the Data API.
-- Policies below use direct, indexed ownership predicates instead.
drop policy if exists "owners manage characters" on public.characters;
drop policy if exists "owners manage relationships" on public.relationships;
drop policy if exists "owners manage relationship events" on public.relationship_events;
drop policy if exists "owners manage character state events" on public.character_state_events;
drop policy if exists "owners manage locations" on public.locations;
drop policy if exists "owners manage scripts" on public.scripts;
drop policy if exists "owners manage script versions" on public.script_versions;
drop function if exists public.owns_anchor_project(uuid);

-- Supabase's RLS-on-create event trigger is internal and must not be an RPC.
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

create policy "owners read projects"
on public.projects for select to authenticated
using (owner_id = (select auth.uid()));

create policy "owners create projects"
on public.projects for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "owners update projects"
on public.projects for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "owners delete projects"
on public.projects for delete to authenticated
using (owner_id = (select auth.uid()));

create policy "owners manage characters"
on public.characters for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = characters.project_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
  where p.id = characters.project_id and p.owner_id = (select auth.uid())
));

create policy "owners manage relationships"
on public.relationships for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = relationships.project_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
  where p.id = relationships.project_id and p.owner_id = (select auth.uid())
));

create policy "owners manage relationship events"
on public.relationship_events for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = relationship_events.project_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
  where p.id = relationship_events.project_id and p.owner_id = (select auth.uid())
));

create policy "owners manage character state events"
on public.character_state_events for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = character_state_events.project_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
  where p.id = character_state_events.project_id and p.owner_id = (select auth.uid())
));

create policy "owners manage locations"
on public.locations for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = locations.project_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
  where p.id = locations.project_id and p.owner_id = (select auth.uid())
));

create policy "owners manage scripts"
on public.scripts for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = scripts.project_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
  where p.id = scripts.project_id and p.owner_id = (select auth.uid())
));

create policy "owners manage script versions"
on public.script_versions for all to authenticated
using (exists (
  select 1 from public.projects p
  where p.id = script_versions.project_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
  where p.id = script_versions.project_id and p.owner_id = (select auth.uid())
));

-- Existing and future Data API access is explicit. Anonymous clients get no
-- table access; authenticated users remain constrained by the policies above.
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

insert into storage.buckets (id, name, public)
values ('location-images', 'location-images', false)
on conflict (id) do update set public = false;

drop policy if exists "public location images" on storage.objects;
drop policy if exists "owners read location images" on storage.objects;
drop policy if exists "owners upload location images" on storage.objects;
drop policy if exists "owners update location images" on storage.objects;
drop policy if exists "owners delete location images" on storage.objects;

create policy "owners read location images"
on storage.objects for select to authenticated
using (
  bucket_id = 'location-images'
  and exists (
    select 1 from public.projects p
    where p.owner_id = (select auth.uid())
      and p.id::text = (storage.foldername(name))[1]
  )
);

create policy "owners upload location images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'location-images'
  and exists (
    select 1 from public.projects p
    where p.owner_id = (select auth.uid())
      and p.id::text = (storage.foldername(name))[1]
  )
);

create policy "owners update location images"
on storage.objects for update to authenticated
using (
  bucket_id = 'location-images'
  and exists (
    select 1 from public.projects p
    where p.owner_id = (select auth.uid())
      and p.id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'location-images'
  and exists (
    select 1 from public.projects p
    where p.owner_id = (select auth.uid())
      and p.id::text = (storage.foldername(name))[1]
  )
);

create policy "owners delete location images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'location-images'
  and exists (
    select 1 from public.projects p
    where p.owner_id = (select auth.uid())
      and p.id::text = (storage.foldername(name))[1]
  )
);

commit;
