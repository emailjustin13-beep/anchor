import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
  createFixtureProvider,
  gauntletInventory,
  loadGauntletCases,
  requestAnthropicForGauntlet,
  runGauntlet,
} from '../gauntlet/harness.mjs'
import { buildDraftScanPrompt, DRAFT_SCAN_SCHEMA } from '../lib/draftScan.js'

test('the permanent Gauntlet covers every Draft Scan integrity family and revision state', async () => {
  const cases = await loadGauntletCases()
  const inventory = gauntletInventory(cases)
  assert.equal(inventory.cases, 7)
  assert.equal(inventory.revisions, 22)
  assert.deepEqual(inventory.categories, ['character', 'continuity', 'life_state', 'relationship', 'timeline'])
  assert.deepEqual(inventory.integrityBases, [
    'incompatible_facts',
    'timeline_impossibility',
    'unearned_character_reversal',
    'unearned_relationship_reversal',
    'unsupported_knowledge',
    'unsupported_state_change',
  ])
  assert.ok(inventory.forbiddenTopics.includes('red folder'))
  assert.ok(inventory.forbiddenTopics.includes('recording location conflict'))
  assert.ok(cases.every(testCase => testCase.revisions.every(revision => revision.expect)))
})

test('the deterministic Gauntlet grades two full passes with stable issue identity and cache reuse', async () => {
  const cases = await loadGauntletCases()
  const report = await runGauntlet({ cases, provider:createFixtureProvider(), repeats:2, quiet:true })
  assert.equal(report.summary.passed, true)
  assert.equal(report.summary.checks, 44)
  assert.equal(report.summary.failedChecks, 0)
  assert.equal(report.summary.providerCalls, 42)
  assert.equal(report.summary.cacheHits, 2)

  const initial = report.runs.find(run => run.repetition === 1 && run.case === 'case-02-information-leak' && run.revision === 'initial-gaps')
  const reopened = report.runs.find(run => run.repetition === 1 && run.case === 'case-02-information-leak' && run.revision === 'recorder-removed-reopens-kira')
  const initialKira = initial.activeIssues.find(issue => issue.title.includes('Kira'))
  const reopenedKira = reopened.activeIssues.find(issue => issue.title.includes('Kira'))
  assert.equal(reopenedKira.id, initialKira.id)
})

test('the editor and Gauntlet share one closed Draft Scan schema and prompt contract', async () => {
  const ai = await readFile(new URL('../lib/ai.js', import.meta.url), 'utf8')
  assert.match(ai, /export \{ buildDraftScanPrompt, DRAFT_SCAN_SCHEMA \} from '\.\/draftScan'/)
  assert.equal(DRAFT_SCAN_SCHEMA.additionalProperties, false)
  assert.deepEqual(DRAFT_SCAN_SCHEMA.required, ['existing_issue_decisions', 'new_findings', 'active_issue_ids', 'overall'])

  const prompt = buildDraftScanPrompt({
    scriptText:'INT. ROOM - NIGHT\nA locked door stands open.',
    characters:[],
    relationships:[],
  })
  assert.match(prompt.systemPrompt, /reasonable-audience inference gate/)
  assert.match(prompt.systemPrompt, /Never rewrite/)
  assert.match(prompt.prompt, /INITIAL — establish the issue ledger/)
})

test('the live Gauntlet retries a temporary provider failure once without losing the scan', async () => {
  let calls = 0
  const valid = { existing_issue_decisions:[], new_findings:[], active_issue_ids:[], overall:'No issues.' }
  const fetchImpl = async () => {
    calls += 1
    if (calls === 1) return { ok:false, status:529 }
    return {
      ok:true,
      status:200,
      async json() {
        return { stop_reason:'end_turn', content:[{ type:'text', text:JSON.stringify(valid) }] }
      },
    }
  }
  const result = await requestAnthropicForGauntlet({
    key:'not-a-real-key',
    model:'claude-opus-5',
    systemPrompt:'test',
    prompt:'test',
    fetchImpl,
    wait:async () => {},
  })
  assert.equal(calls, 2)
  assert.deepEqual(result, valid)
})

test('the live Gauntlet does not retry permanent provider failures', async () => {
  let calls = 0
  await assert.rejects(
    requestAnthropicForGauntlet({
      key:'not-a-real-key',
      model:'claude-opus-5',
      systemPrompt:'test',
      prompt:'test',
      fetchImpl:async () => {
        calls += 1
        return { ok:false, status:401 }
      },
      wait:async () => {},
    }),
    /HTTP 401/
  )
  assert.equal(calls, 1)
})
