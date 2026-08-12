import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('AI runs only after an explicit writer action', async () => {
  const editor = await read('components/editor/WritingStudio.js')
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

test('temporary AI overloads retry safely and First Read cannot double-submit', async () => {
  const [client, route, firstRead] = await Promise.all([
    read('lib/ai.js'),
    read('app/api/ai/route.js'),
    read('components/bible/FirstRead.js'),
  ])
  assert.match(route, /transientAIStatuses/)
  assert.match(route, /maxAIAttempts = 3/)
  assert.match(route, /retry-after/)
  assert.match(route, /AI_OVERLOADED/)
  assert.match(route, /Your screenplay is safe/)
  assert.match(client, /error\.retryable/)
  assert.match(firstRead, /requestInFlight/)
  assert.match(firstRead, /wordCount < 25/)
  assert.match(firstRead, /status\.anthropic\.com/)
})

test('successful HTTP responses are checked for empty, truncated, and refused generations', async () => {
  const route = await read('app/api/ai/route.js')
  assert.match(route, /requestAnthropicMessage/)
  assert.match(route, /data\.stop_reason === 'refusal'/)
  assert.match(route, /ANTHROPIC_FALLBACK_MODEL/)
  assert.match(route, /claude-haiku-4-5-20251001/)
  assert.match(route, /data\.stop_reason === 'max_tokens'/)
  assert.match(route, /AI_INCOMPLETE_RESPONSE/)
  assert.match(route, /AI_EMPTY_RESPONSE/)
  assert.match(route, /Anchor received a blank AI response twice/)
})

test('draft scan is a multi-finding audit distinct from the scene scan', async () => {
  const [ai, editor] = await Promise.all([
    read('lib/ai.js'),
    read('components/editor/WritingStudio.js'),
  ])
  assert.match(ai, /DRAFT_SCAN_SCHEMA/)
  assert.doesNotMatch(ai, /minItems|maxItems/)
  assert.match(ai, /continuity.*character.*relationship.*life_state.*timeline/)
  assert.match(ai, /Never rewrite, recommend adding a scene, beat, explanation, or internal reaction/)
  assert.match(ai, /Do not repeat the same underlying issue/)
  assert.match(ai, /WRITER-REVIEWED AS NOT A PROBLEM/)
  assert.match(ai, /possibilities/)
  assert.match(editor, /buildDraftScanPrompt/)
  assert.match(editor, /schema:DRAFT_SCAN_SCHEMA/)
  assert.match(editor, /const findings = \(result\.findings \|\| \[\]\)\.slice\(0, 5\)/)
  assert.match(editor, /finding\.evidence \|\| \[\]\)\.slice\(0, 2\)/)
  assert.match(editor, /Review only — nothing here changes your Story Bible/)
  assert.match(editor, /onClick=\{runSceneScan\}/)
  assert.match(editor, /onClick=\{runDraftScan\}/)
  assert.match(editor, /anchor-draft-decisions:/)
  assert.match(editor, /findingFingerprint/)
  assert.match(editor, /findEvidenceRange/)
  assert.match(editor, /Go to text →/)
  assert.match(editor, /✓ Not a problem/)
  assert.match(editor, /Restore question/)
})

test('Google is the primary sign-in path with email retained as a backup', async () => {
  const auth = await read('components/AuthGate.js')
  assert.match(auth, /signInWithOAuth/)
  assert.match(auth, /provider:'google'/)
  assert.match(auth, /Continue with Google/)
  assert.match(auth, /Email backup/)
  assert.match(auth, /redirectTo:window\.location\.origin/)
})

test('same-user auth refreshes preserve and restore the open project', async () => {
  const [app, layout] = await Promise.all([read('components/App.js'), read('app/layout.js')])
  assert.match(app, /anchor-active-project:/)
  assert.match(app, /searchParams\.set\('project', project\.id\)/)
  assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\('project'\)/)
  assert.match(app, /previousUserId && previousUserId !== nextUserId/)
  assert.match(app, /SIGNED_IN can fire again when a browser tab regains focus/)
  assert.match(app, /onSelect=\{openProject\}/)
  assert.doesNotMatch(app, /onAuthStateChange\(\(_event, nextSession\)/)
  assert.match(layout, /Editor 0\.3\.8 Clean/)
})

test('every AI workflow uses a closed structured schema with evidence', async () => {
  const ai = await read('lib/ai.js')
  const consumers = await Promise.all([
    read('components/bible/FirstRead.js'),
    read('components/bible/BibleDashboard.js'),
    read('components/editor/WritingStudio.js'),
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
