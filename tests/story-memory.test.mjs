import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyToDocument } from '../lib/screenplay.js'
import {
  buildStoryMemory,
  canReuseIssueLedger,
  diffStoryMemory,
  emptyIssueLedger,
  mergeIssueLedger,
  setIssueLedgerStatus,
} from '../lib/storyMemory.js'

const firstDraft = `[scene]INT. CITY ARCHIVE - NIGHT
[action]Nora gives Maya a brass key.
[character]NORA
[dialogue]This is the only key.
[scene]INT. CITY ARCHIVE - LATER
[action]Locker 214 stands open. The brass key is still attached to Maya's belt. There is no visible damage.`

const keyFinding = {
  category:'continuity',
  priority:'high',
  title:'The locker’s lock mechanism',
  summary:'The only key remains with Maya while the locker is opened without damage.',
  question:'How was the locker opened?',
  previous_issue_id:'',
  possibilities:[],
  characters:['Maya', 'Nora'],
  evidence:[
    { quote:'This is the only key.', location:'INT. CITY ARCHIVE - NIGHT' },
    { quote:"Locker 214 stands open. The brass key is still attached to Maya's belt. There is no visible damage.", location:'INT. CITY ARCHIVE - LATER' },
  ],
}

test('Story Memory continuously indexes scenes and explicit hard facts', () => {
  const memory = buildStoryMemory(legacyToDocument(firstDraft))
  assert.equal(memory.sceneCount, 2)
  assert.ok(memory.factCount >= 3)
  assert.ok(memory.scenes[0].facts.some(fact => fact.kinds.includes('exclusive')))
  assert.ok(memory.scenes[1].facts.some(fact => fact.kinds.includes('possession')))
  assert.ok(memory.scenes[1].facts.some(fact => fact.kinds.includes('condition')))
})

test('Story Memory identifies only the scene that changed', () => {
  const before = buildStoryMemory(legacyToDocument(firstDraft))
  const after = buildStoryMemory(legacyToDocument(firstDraft.replace('no visible damage', 'a broken lock')))
  const changes = diffStoryMemory(before, after)
  assert.equal(changes.changedScenes.length, 1)
  assert.equal(changes.changedScenes[0].heading, 'INT. CITY ARCHIVE - LATER')
  assert.equal(changes.unchangedScenes.length, 1)
})

test('an unchanged screenplay reuses the exact saved issue ledger', () => {
  const memory = buildStoryMemory(legacyToDocument(firstDraft))
  const ledger = { ...emptyIssueLedger(), lastScannedDraftHash:memory.draftHash }
  assert.equal(canReuseIssueLedger(ledger, buildStoryMemory(legacyToDocument(firstDraft))), true)
  assert.equal(canReuseIssueLedger(ledger, buildStoryMemory(legacyToDocument(`${firstDraft}\n[action]Maya turns.`))), false)
})

test('the issue ledger preserves original wording when AI wording changes', () => {
  const memory = buildStoryMemory(legacyToDocument(firstDraft))
  const initial = mergeIssueLedger({
    previousLedger:emptyIssueLedger(),
    scanResult:{ findings:[keyFinding], resolved_issue_ids:[], overall:'Initial review.' },
    memory,
    draftText:firstDraft,
    now:'2026-08-12T12:00:00.000Z',
  })
  const issue = initial.issues[0]
  const rerunFinding = {
    ...keyFinding,
    title:'How did Eli obtain access?',
    summary:'Reworded by a later scan.',
    question:'Was there another entry method?',
    previous_issue_id:issue.id,
  }
  const rerun = mergeIssueLedger({
    previousLedger:initial,
    scanResult:{ findings:[rerunFinding], resolved_issue_ids:[], overall:'Updated review.' },
    memory,
    draftText:firstDraft,
    now:'2026-08-12T12:05:00.000Z',
  })
  assert.equal(rerun.issues.length, 1)
  assert.equal(rerun.issues[0].title, keyFinding.title)
  assert.equal(rerun.issues[0].summary, keyFinding.summary)
})

test('an issue resolves when its supporting evidence is removed', () => {
  const memory = buildStoryMemory(legacyToDocument(firstDraft))
  const initial = mergeIssueLedger({
    previousLedger:emptyIssueLedger(),
    scanResult:{ findings:[keyFinding], resolved_issue_ids:[], overall:'Initial review.' },
    memory,
    draftText:firstDraft,
  })
  const revisedDraft = firstDraft.replace('[dialogue]This is the only key.\n', '')
  const revisedMemory = buildStoryMemory(legacyToDocument(revisedDraft))
  const revised = mergeIssueLedger({
    previousLedger:initial,
    scanResult:{ findings:[], resolved_issue_ids:[], overall:'Incremental review.' },
    memory:revisedMemory,
    draftText:revisedDraft,
  })
  assert.equal(revised.issues[0].status, 'resolved')
})

test('materially changed evidence reopens a dismissed issue with current wording', () => {
  const memory = buildStoryMemory(legacyToDocument(firstDraft))
  const initial = mergeIssueLedger({
    previousLedger:emptyIssueLedger(),
    scanResult:{ findings:[keyFinding], resolved_issue_ids:[], overall:'Initial review.' },
    memory,
    draftText:firstDraft,
  })
  const dismissed = setIssueLedgerStatus(initial, initial.issues[0].id, 'dismissed')
  const revisedDraft = firstDraft.replace('This is the only key.', 'There is no duplicate key.')
  const revisedMemory = buildStoryMemory(legacyToDocument(revisedDraft))
  const revisedFinding = {
    ...keyFinding,
    previous_issue_id:initial.issues[0].id,
    title:'A newly worded access question',
    evidence:[
      { quote:'There is no duplicate key.', location:'INT. CITY ARCHIVE - NIGHT' },
      keyFinding.evidence[1],
    ],
  }
  const revised = mergeIssueLedger({
    previousLedger:dismissed,
    scanResult:{ findings:[revisedFinding], resolved_issue_ids:[], overall:'Incremental review.' },
    memory:revisedMemory,
    draftText:revisedDraft,
  })
  assert.equal(revised.issues[0].status, 'open')
  assert.equal(revised.issues[0].title, revisedFinding.title)
  assert.equal(revised.issues[0].evidence[0].quote, 'There is no duplicate key.')
})

test('scratched keyhole evidence can resolve the old no-damage issue even when dismissed', () => {
  const memory = buildStoryMemory(legacyToDocument(firstDraft))
  const initial = mergeIssueLedger({
    previousLedger:emptyIssueLedger(),
    scanResult:{ findings:[keyFinding], resolved_issue_ids:[], overall:'Initial review.' },
    memory,
    draftText:firstDraft,
  })
  const dismissed = setIssueLedgerStatus(initial, initial.issues[0].id, 'dismissed')
  const revisedDraft = firstDraft.replace(
    'There is no visible damage.',
    'Omar examines it. Scratches run along the keyhole.'
  )
  const revisedMemory = buildStoryMemory(legacyToDocument(revisedDraft))
  assert.ok(revisedMemory.scenes[1].facts.some(fact =>
    fact.quote.includes('Scratches') && fact.kinds.includes('condition') && fact.kinds.includes('access')
  ))

  const revised = mergeIssueLedger({
    previousLedger:dismissed,
    scanResult:{
      findings:[],
      resolved_issue_ids:[initial.issues[0].id],
      overall:'The scratches provide a plausible alternate access mechanism.',
    },
    memory:revisedMemory,
    draftText:revisedDraft,
  })

  assert.equal(revised.issues[0].status, 'resolved')
  assert.equal(revised.issues[0].resolvedAt !== null, true)
})
