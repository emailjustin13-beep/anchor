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
  assert.equal(inventory.cases, 10)
  assert.equal(inventory.revisions, 34)
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
  assert.ok(inventory.forbiddenTopics.includes('bootstrap paradox'))
  assert.ok(inventory.forbiddenTopics.includes('duplicate ilya'))
  assert.ok(inventory.forbiddenTopics.includes('alive after death'))
  assert.ok(cases.every(testCase => testCase.revisions.every(revision => revision.expect)))
})

test('the deterministic Gauntlet grades two full passes with stable issue identity and cache reuse', async () => {
  const cases = await loadGauntletCases()
  const report = await runGauntlet({ cases, provider:createFixtureProvider(), repeats:2, quiet:true })
  assert.equal(report.summary.passed, true)
  assert.equal(report.summary.checks, 68)
  assert.equal(report.summary.failedChecks, 0)
  assert.equal(report.summary.providerCalls, 66)
  assert.equal(report.summary.cacheHits, 2)
  assert.equal(report.version, 2)
  assert.ok(report.runs.filter(run => run.providerCalled).every(run => run.modelOutput))
  assert.ok(report.runs.filter(run => run.cacheHit).every(run => run.modelOutput === null))

  const initial = report.runs.find(run => run.repetition === 1 && run.case === 'case-02-information-leak' && run.revision === 'initial-gaps')
  const reopened = report.runs.find(run => run.repetition === 1 && run.case === 'case-02-information-leak' && run.revision === 'recorder-removed-reopens-kira')
  const initialKira = initial.activeIssues.find(issue => issue.title.includes('Kira'))
  const reopenedKira = reopened.activeIssues.find(issue => issue.title.includes('Kira'))
  assert.equal(reopenedKira.id, initialKira.id)

  const firstOffset = report.runs.find(run => run.repetition === 1 && run.case === 'case-08-time-travel-fixed-offset' && run.revision === 'fixed-offset-violated')
  const reopenedOffset = report.runs.find(run => run.repetition === 1 && run.case === 'case-08-time-travel-fixed-offset' && run.revision === 'wrong-arrival-restored')
  assert.equal(reopenedOffset.activeIssues[0].id, firstOffset.activeIssues[0].id)

  const consistentTimeTravel = report.runs.filter(run =>
    run.repetition === 1 && ['consistent-bootstrap-loop', 'branching-logic-is-consistent', 'predestination-loop-is-consistent'].includes(run.revision)
  )
  assert.equal(consistentTimeTravel.length, 3)
  assert.ok(consistentTimeTravel.every(run => run.activeIssues.length === 0 && run.failures.length === 0))
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
    previousIssues:[{ id:'issue:test', status:'open', category:'continuity', title:'Test issue', summary:'Test', question:'Intentional?', evidence:[] }],
  })
  assert.match(prompt.systemPrompt, /reasonable-audience inference gate/)
  assert.match(prompt.systemPrompt, /Never rewrite/)
  assert.match(prompt.systemPrompt, /A recording can be played from a different location/)
  assert.match(prompt.prompt, /INITIAL — establish the issue ledger/)
  assert.match(prompt.prompt, /REQUIRED LEDGER DECISIONS: 1/)
  assert.match(prompt.prompt, /REQUIRED ISSUE IDS: issue:test/)
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
