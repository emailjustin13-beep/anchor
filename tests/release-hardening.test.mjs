import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  LOCATION_IMAGE_BUCKET,
  LOCATION_IMAGE_URL_TTL_SECONDS,
  locationImageExtension,
  locationImageStoragePath,
  resolveLocationImageUrl,
} from '../lib/locationImages.js'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('private location image paths stay stable and legacy Supabase URLs are recovered', () => {
  assert.equal(locationImageStoragePath('project-1/location-1.jpg'), 'project-1/location-1.jpg')
  assert.equal(
    locationImageStoragePath('https://example.supabase.co/storage/v1/object/public/location-images/project-1/location-1.jpg'),
    'project-1/location-1.jpg'
  )
  assert.equal(
    locationImageStoragePath('https://example.supabase.co/storage/v1/object/sign/location-images/project-1/location%202.png?token=private'),
    'project-1/location 2.png'
  )
  assert.equal(locationImageStoragePath('https://images.example.com/reference.jpg'), '')
})

test('private location images resolve through a short-lived signed URL', async () => {
  const calls = []
  const client = {
    storage: {
      from(bucket) {
        calls.push({ bucket })
        return {
          async createSignedUrl(path, expiresIn) {
            calls.push({ path, expiresIn })
            return { data:{ signedUrl:`https://signed.example/${path}` }, error:null }
          },
        }
      },
    },
  }

  const result = await resolveLocationImageUrl(client, 'project-1/location-1.jpg')
  assert.equal(result, 'https://signed.example/project-1/location-1.jpg')
  assert.deepEqual(calls, [
    { bucket:LOCATION_IMAGE_BUCKET },
    { path:'project-1/location-1.jpg', expiresIn:LOCATION_IMAGE_URL_TTL_SECONDS },
  ])
})

test('external location images remain external and upload extensions are sanitized', async () => {
  const external = 'https://images.example.com/reference.jpg'
  const client = { storage:{ from:() => { throw new Error('Storage should not be called') } } }
  assert.equal(await resolveLocationImageUrl(client, external), external)
  assert.equal(locationImageExtension({ type:'image/jpeg', name:'camera.final.JPEG' }), 'jpg')
  assert.equal(locationImageExtension({ type:'', name:'reference.SV G' }), 'svg')
  assert.equal(locationImageExtension({ type:'', name:'' }), 'image')
})

test('release migration blocks ownerless projects and removes exposed definer helpers', async () => {
  const migration = await read('supabase/migrations/20260814040230_release_hardening.sql')
  const executableSql = migration.replace(/--.*$/gm, '')
  assert.match(migration, /where owner_id is null/)
  assert.match(migration, /alter column owner_id set not null/)
  assert.match(migration, /drop function if exists public\.owns_anchor_project\(uuid\)/)
  assert.match(migration, /revoke execute on function public\.rls_auto_enable\(\)/)
  assert.doesNotMatch(executableSql, /security definer/i)
  assert.match(migration, /security invoker/)
})

test('schema access is explicit, indexed, owner-scoped, and Storage supports upsert', async () => {
  const [schema, migration, component] = await Promise.all([
    read('supabase-schema.sql'),
    read('supabase/migrations/20260814040230_release_hardening.sql'),
    read('components/bible/LocationsModule.js'),
  ])

  for (const sql of [schema, migration]) {
    assert.match(sql, /revoke all on table[\s\S]*from anon/)
    assert.match(sql, /grant select, insert, update, delete on table[\s\S]*to authenticated, service_role/)
    assert.match(sql, /alter default privileges for role postgres/)
    assert.match(sql, /projects_owner_idx/)
    assert.match(sql, /relationships_character_b_idx/)
    assert.match(sql, /relationship_events_relationship_idx/)
    assert.match(sql, /character_state_events_character_idx/)
    assert.match(sql, /script_versions_project_idx/)
    assert.match(sql, /owners read location images/)
    assert.match(sql, /owners upload location images/)
    assert.match(sql, /owners update location images/)
    assert.match(sql, /owners delete location images/)
    assert.match(sql, /owner_id = \(select auth\.uid\(\)\)/)
  }

  assert.doesNotMatch(component, /getPublicUrl/)
  assert.match(component, /resolveLocationImageUrl/)
  assert.match(component, /upload\(path, file, \{ upsert:true \}\)/)
})
