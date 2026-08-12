import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyToDocument } from '../lib/screenplay.js'
import {
  applyAudienceInferenceGate,
  buildStoryMemory,
  canReuseIssueLedger,
  diffStoryMemory,
  emptyIssueLedger,
  mergeIssueLedger,
  passesIntegrityDisplayGate,
  reconcileDraftScanResult,
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

test('reasonable audience inference suppresses a candidate and resolves its ledger issue', () => {
  const memory = buildStoryMemory(legacyToDocument(firstDraft))
  const initial = mergeIssueLedger({
    previousLedger:emptyIssueLedger(),
    scanResult:{ findings:[keyFinding], resolved_issue_ids:[], overall:'Initial review.' },
    memory,
    draftText:firstDraft,
  })
  const issueId = initial.issues[0].id
  const gated = applyAudienceInferenceGate({
    findings:[{
      ...keyFinding,
      previous_issue_id:issueId,
      plausible_inference:true,
      inference_explanation:'Scratches around the keyhole reasonably imply lock manipulation.',
    }],
    resolved_issue_ids:[],
    overall:'No unsupported integrity concern remains.',
  }, initial.issues)

  assert.equal(gated.findings.length, 0)
  assert.deepEqual(gated.resolved_issue_ids, [issueId])
  assert.equal(gated.suppressed_inference_count, 1)
})

const knowledgeFinding = {
  category:'continuity',
  priority:'high',
  title:'Kira knows the private transfer details',
  summary:'Kira uses information she was not present to hear and could not read from Marcus’s palm.',
  question:'How did Kira learn the entrance and password?',
  integrity_basis:'unsupported_knowledge',
  conflicting_fact_a:'Kira was absent and could not read Marcus’s palm.',
  conflicting_fact_b:'Kira later states both the entrance and password.',
  plausible_inference:false,
  inference_explanation:'The original draft supplies no evidence-supported path for the information.',
  possibilities:[],
  characters:['Kira', 'Marcus'],
  evidence:[
    { quote:'Kira studies the writing on Marcus’s palm, but his hand closes before she can read it.', location:'INT. CITY HOSPITAL - CAFETERIA - NIGHT' },
    { quote:'When the driver arrives, ask for the word “bluebird.”', location:'INT. CITY HOSPITAL - SECURITY DESK - LATER' },
  ],
}

const folderMystery = {
  ...knowledgeFinding,
  title:'The red folder is missing',
  integrity_basis:'intentional_mystery',
  conflicting_fact_a:'The folder was placed in a safe.',
  conflicting_fact_b:'The folder is later gone.',
  evidence:[
    { quote:'Lena places the red folder inside a wall safe.', location:'INT. CITY HOSPITAL - RECORDS ROOM - NIGHT' },
    { quote:'The red folder is gone.', location:'INT. CITY HOSPITAL - RECORDS ROOM - MOMENTS LATER' },
  ],
}

const weakCharacterCommentary = {
  ...knowledgeFinding,
  category:'character',
  priority:'low',
  title:'Kira tells Daniels the transfer details',
  integrity_basis:'general_craft',
  conflicting_fact_a:'Kira knows confidential information.',
  conflicting_fact_b:'Kira tells a security officer.',
}

test('Case 02 initial scan displays unsupported knowledge but suppresses mystery and motivation commentary', () => {
  const reconciled = reconcileDraftScanResult({
    existing_issue_decisions:[],
    new_findings:[knowledgeFinding, folderMystery, weakCharacterCommentary],
    overall:'One supported knowledge conflict.',
  })

  assert.equal(reconciled.findings.length, 1)
  assert.equal(reconciled.findings[0].title, knowledgeFinding.title)
  assert.equal(reconciled.suppressed_finding_count, 2)
  assert.equal(passesIntegrityDisplayGate(folderMystery), false)
  assert.equal(passesIntegrityDisplayGate(weakCharacterCommentary), false)
})

test('Case 02 resolution wins over a duplicate finding and removing the bridge reopens the same issue', () => {
  const originalDraft = `[scene]INT. CITY HOSPITAL - CAFETERIA - NIGHT\n[action]${knowledgeFinding.evidence[0].quote}\n[scene]INT. CITY HOSPITAL - SECURITY DESK - LATER\n[dialogue]${knowledgeFinding.evidence[1].quote}`
  const originalMemory = buildStoryMemory(legacyToDocument(originalDraft))
  const initialResult = reconcileDraftScanResult({
    existing_issue_decisions:[],
    new_findings:[knowledgeFinding],
    overall:'Kira’s knowledge has no on-page bridge.',
  })
  const initialLedger = mergeIssueLedger({
    previousLedger:emptyIssueLedger(),
    scanResult:initialResult,
    memory:originalMemory,
    draftText:originalDraft,
  })
  const issueId = initialLedger.issues[0].id

  const recorderDraft = `${originalDraft}\n[action]A recorder blinks beneath the records cart. Kira plays the captured conversation through her earpiece.`
  const recorderMemory = buildStoryMemory(legacyToDocument(recorderDraft))
  const resolvedResult = reconcileDraftScanResult({
    existing_issue_decisions:[{
      issue_id:issueId,
      status:'resolved',
      decision_explanation:'The recorder and playback provide the information path.',
      ...knowledgeFinding,
      plausible_inference:true,
      inference_explanation:'The recorder supplies a reasonable on-page bridge.',
    }],
    new_findings:[knowledgeFinding],
    overall:`The recorder resolves (${issueId}).`,
  }, initialLedger.issues)
  const resolvedLedger = mergeIssueLedger({
    previousLedger:initialLedger,
    scanResult:resolvedResult,
    memory:recorderMemory,
    draftText:recorderDraft,
  })

  assert.equal(resolvedResult.findings.length, 0)
  assert.deepEqual(resolvedResult.resolved_issue_ids, [issueId])
  assert.equal(resolvedLedger.issues.length, 1)
  assert.equal(resolvedLedger.issues[0].status, 'resolved')
  assert.doesNotMatch(resolvedLedger.overall, /issue:/)

  const reopenedResult = reconcileDraftScanResult({
    existing_issue_decisions:[{
      issue_id:issueId,
      status:'still_open',
      decision_explanation:'The recorder bridge was removed.',
      ...knowledgeFinding,
    }],
    new_findings:[],
    overall:'The knowledge conflict returned.',
  }, resolvedLedger.issues)
  const reopenedLedger = mergeIssueLedger({
    previousLedger:resolvedLedger,
    scanResult:reopenedResult,
    memory:originalMemory,
    draftText:originalDraft,
  })

  assert.equal(reopenedLedger.issues.length, 1)
  assert.equal(reopenedLedger.issues[0].id, issueId)
  assert.equal(reopenedLedger.issues[0].status, 'open')
})
