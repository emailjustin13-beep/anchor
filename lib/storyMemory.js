import { documentToBlocks } from './screenplay.js'
import { findingFingerprint, findingMatchesDecision, normalizeFindingText } from './draftReview.js'

export const STORY_MEMORY_VERSION = 1
export const ISSUE_LEDGER_VERSION = 1

const constraintPatterns = [
  ['exclusive', /\b(only|sole|single|one and only|no other|nobody else)\b/i],
  ['absolute', /\b(never|always|must|cannot|can't|impossible)\b/i],
  ['access', /\b(key|keys|keycard|badge|code|password|locked|unlocked|lock|door|entered|access)\b/i],
  ['possession', /\b(has|have|holds|keeps|kept|attached|carrying|carries|pocket|possess|possession|gave|gives)\b/i],
  ['condition', /\b(undamaged|damage|damaged|broken|intact|open|closed|missing|gone|empty)\b/i],
  ['life_state', /\b(alive|dead|deceased|killed|missing|presumed dead|failed to check in)\b/i],
  ['movement', /\b(arrives?|leaves?|left|returns?|remains?|inside|outside|upstairs|downstairs|hallway|room|building)\b/i],
  ['time', /\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b(?:morning|afternoon|evening|night|midnight|noon|dawn|dusk)\b/i],
]

function stableHash(value) {
  const source = String(value || '')
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function sceneId(heading, occurrence) {
  return `scene:${stableHash(`${normalizeFindingText(heading) || 'opening'}|${occurrence}`)}`
}

function factsForScene(scene) {
  return scene.blocks.flatMap((block, blockOffset) => {
    const quote = block.text.trim()
    if (!quote) return []
    const kinds = constraintPatterns.filter(([, pattern]) => pattern.test(quote)).map(([kind]) => kind)
    if (!kinds.length) return []
    return [{
      id:`fact:${stableHash(`${scene.id}|${blockOffset}|${normalizeFindingText(quote)}`)}`,
      kinds,
      quote,
      location:scene.heading,
      blockIndex:block.index,
    }]
  })
}

export function buildStoryMemory(doc) {
  const blocks = documentToBlocks(doc).map((block, index) => ({ ...block, index }))
  const scenes = []
  const headingCounts = new Map()
  let current = { heading:'Opening', blocks:[] }

  const pushScene = () => {
    if (!current.blocks.length) return
    const normalizedHeading = normalizeFindingText(current.heading) || 'opening'
    const occurrence = (headingCounts.get(normalizedHeading) || 0) + 1
    headingCounts.set(normalizedHeading, occurrence)
    const id = sceneId(current.heading, occurrence)
    const text = current.blocks.map(block => block.text).join('\n').trim()
    const characters = [...new Set(current.blocks
      .filter(block => block.type === 'character')
      .map(block => block.text.replace(/\s*\(.+\)\s*$/, '').trim())
      .filter(Boolean))]
    const scene = {
      id,
      number:scenes.length + 1,
      heading:current.heading,
      hash:stableHash(current.blocks.map(block => `${block.type}:${normalizeFindingText(block.text)}`).join('|')),
      text,
      characters,
      blocks:current.blocks,
    }
    scene.facts = factsForScene(scene)
    scenes.push(scene)
  }

  for (const block of blocks) {
    if (block.type === 'scene' && block.text.trim()) {
      pushScene()
      current = { heading:block.text.trim(), blocks:[block] }
    } else {
      current.blocks.push(block)
    }
  }
  pushScene()

  const normalizedDocument = blocks.map(block => `${block.type}:${normalizeFindingText(block.text)}`).join('|')
  return {
    version:STORY_MEMORY_VERSION,
    draftHash:`draft:${stableHash(normalizedDocument)}`,
    sceneCount:scenes.length,
    factCount:scenes.reduce((total, scene) => total + scene.facts.length, 0),
    scenes,
    updatedAt:new Date().toISOString(),
  }
}

export function diffStoryMemory(previous, current) {
  if (!previous?.scenes?.length) {
    return {
      initial:true,
      changedScenes:current.scenes,
      removedScenes:[],
      unchangedScenes:[],
    }
  }

  const previousById = new Map(previous.scenes.map(scene => [scene.id, scene]))
  const currentById = new Map(current.scenes.map(scene => [scene.id, scene]))
  const changedScenes = current.scenes.filter(scene => previousById.get(scene.id)?.hash !== scene.hash)
  const removedScenes = previous.scenes.filter(scene => !currentById.has(scene.id))
  const unchangedScenes = current.scenes.filter(scene => previousById.get(scene.id)?.hash === scene.hash)
  return { initial:false, changedScenes, removedScenes, unchangedScenes }
}

export function storyMemorySummary(memory) {
  return (memory?.scenes || []).map(scene => {
    const facts = scene.facts.map(fact => `[${fact.kinds.join(', ')}] “${fact.quote}”`).join(' | ')
    const characters = scene.characters.length ? scene.characters.join(', ') : 'none detected'
    return `${scene.number}. ${scene.heading}\nCharacters: ${characters}\nHard facts: ${facts || 'none indexed'}`
  }).join('\n\n')
}

export function emptyIssueLedger() {
  return {
    version:ISSUE_LEDGER_VERSION,
    lastScannedDraftHash:'',
    lastScannedMemory:null,
    overall:'',
    issues:[],
    scannedAt:null,
  }
}

export function canReuseIssueLedger(ledger, memory) {
  return Boolean(ledger?.lastScannedDraftHash && ledger.lastScannedDraftHash === memory?.draftHash)
}

function issueId(finding) {
  const evidence = (finding.evidence || [])
    .map(item => normalizeFindingText(item.quote))
    .filter(Boolean)
    .sort()
    .join('|')
  return `issue:${stableHash(evidence || `${finding.category}|${normalizeFindingText(finding.title)}`)}`
}

function evidenceStillExists(issue, draftText) {
  const normalizedDraft = normalizeFindingText(draftText)
  const evidence = (issue.evidence || [])
    .map(item => normalizeFindingText(item.quote))
    .filter(quote => quote.length >= 12)
  return evidence.length > 0 && evidence.every(quote => normalizedDraft.includes(quote))
}

function newIssue(finding, memory, reviewedDecisions, now) {
  const fingerprint = findingFingerprint(finding)
  const dismissed = reviewedDecisions.some(decision => findingMatchesDecision(finding, decision))
  return {
    ...finding,
    id:issueId(finding),
    fingerprint,
    previous_issue_id:undefined,
    status:dismissed ? 'dismissed' : 'open',
    createdAt:now,
    updatedAt:now,
    dismissedAt:dismissed ? now : null,
    resolvedAt:null,
    lastSeenDraftHash:memory.draftHash,
  }
}

export function mergeIssueLedger({ previousLedger, scanResult, memory, draftText, reviewedDecisions = [], now = new Date().toISOString() }) {
  const previous = previousLedger?.version === ISSUE_LEDGER_VERSION ? previousLedger : emptyIssueLedger()
  const issues = previous.issues.map(issue => ({ ...issue }))
  const resolvedIds = new Set(scanResult.resolved_issue_ids || [])

  for (const finding of scanResult.findings || []) {
    const explicitId = finding.previous_issue_id?.trim()
    let match = explicitId ? issues.find(issue => issue.id === explicitId) : null
    if (!match) match = issues.find(issue => findingMatchesDecision(finding, issue))

    if (match) {
      const priorEvidenceStillExists = evidenceStillExists(match, draftText)
      if (!priorEvidenceStillExists) {
        match.evidence = finding.evidence
        match.fingerprint = findingFingerprint({ ...match, evidence:finding.evidence })
        match.status = 'open'
        match.dismissedAt = null
      }
      match.lastSeenDraftHash = memory.draftHash
      match.updatedAt = now
      match.resolvedAt = null
      if (match.status === 'resolved') match.status = 'open'
      continue
    }

    const created = newIssue(finding, memory, reviewedDecisions, now)
    const duplicateIndex = issues.findIndex(issue => issue.id === created.id)
    if (duplicateIndex >= 0) issues[duplicateIndex] = { ...issues[duplicateIndex], ...created }
    else issues.push(created)
  }

  for (const issue of issues) {
    if (issue.status === 'dismissed') continue
    const evidenceRemoved = !evidenceStillExists(issue, draftText)
    if (resolvedIds.has(issue.id) || evidenceRemoved) {
      issue.status = 'resolved'
      issue.resolvedAt = issue.resolvedAt || now
      issue.updatedAt = now
    }
  }

  return {
    version:ISSUE_LEDGER_VERSION,
    lastScannedDraftHash:memory.draftHash,
    lastScannedMemory:memory,
    overall:scanResult.overall || previous.overall || '',
    issues:issues.slice(-100),
    scannedAt:now,
  }
}

export function issueLedgerReview(ledger, metadata = {}) {
  return {
    kind:'draft',
    findings:ledger.issues || [],
    overall:ledger.overall || '',
    scannedAt:ledger.scannedAt,
    ...metadata,
  }
}

export function setIssueLedgerStatus(ledger, issueIdValue, status) {
  const now = new Date().toISOString()
  return {
    ...ledger,
    issues:(ledger.issues || []).map(issue => issue.id === issueIdValue ? {
      ...issue,
      status,
      updatedAt:now,
      dismissedAt:status === 'dismissed' ? now : issue.dismissedAt,
      resolvedAt:status === 'resolved' ? now : null,
    } : issue),
  }
}
