import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('AI runs only after an explicit writer action', async () => {
  const editor = await read('components/editor/WritingEditor.js')
  assert.match(editor, /Scan Scene/)
  assert.match(editor, /Scan Draft/)
  assert.doesNotMatch(editor, /setTimeout\([^)]*runLivingScan/s)
  assert.doesNotMatch(editor, /4000/)
})

test('AI credentials remain server-side and requests require a session', async () => {
  const client = await read('lib/ai.js')
  const route = await read('app/api/ai/route.js')
  assert.doesNotMatch(client, /ANTHROPIC_API_KEY|sessionStorage/)
  assert.match(client, /Authorization: `Bearer \$\{session\.access_token\}`/)
  assert.match(route, /process\.env\.ANTHROPIC_API_KEY/)
  assert.match(route, /status: 401/)
})

test('Google is the primary sign-in path with email retained as a backup', async () => {
  const auth = await read('components/AuthGate.js')
  assert.match(auth, /signInWithOAuth/)
  assert.match(auth, /provider:'google'/)
  assert.match(auth, /Continue with Google/)
  assert.match(auth, /Email backup/)
  assert.match(auth, /redirectTo:window\.location\.origin/)
})

test('every AI workflow uses a closed structured schema with evidence', async () => {
  const ai = await read('lib/ai.js')
  const consumers = await Promise.all([
    read('components/bible/FirstRead.js'),
    read('components/bible/BibleDashboard.js'),
    read('components/editor/WritingEditor.js'),
  ])
  assert.match(ai, /PRESSURE_TEST_SCHEMA/)
  assert.match(ai, /RELATIONSHIP_SCAN_SCHEMA/)
  assert.match(ai, /FIRST_READ_SCHEMA/)
  assert.match(ai, /FULL_READ_SCHEMA/)
  assert.match(ai, /evidence/)
  assert.ok(consumers.every(source => source.includes('schema:')))
})

test('story chronology and character life state are persisted as owned records', async () => {
  const schema = await read('supabase-schema.sql')
  const firstRead = await read('components/bible/FirstRead.js')
  const ties = await read('components/bible/TiesThatBind.js')
  assert.match(schema, /owner_id uuid not null default auth\.uid\(\)/)
  assert.match(schema, /create table if not exists public\.relationship_events/)
  assert.match(schema, /create table if not exists public\.character_state_events/)
  assert.doesNotMatch(schema, /using \(true\)/)
  assert.match(firstRead, /life_state/)
  assert.match(firstRead, /relationship_events/)
  assert.match(firstRead, /character_state_events/)
  assert.match(ties, /sequence_index/)
})
