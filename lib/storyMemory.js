import { documentToBlocks } from './screenplay.js'
import { findingFingerprint, findingMatchesDecision, normalizeFindingText } from './draftReview.js'

export const STORY_MEMORY_VERSION = 2
export const ISSUE_LEDGER_VERSION = 4

const displayableIntegrityBases = new Set([
  'incompatible_facts',
  'unsupported_knowledge',
  'unsupported_state_change',
  'timeline_impossibility',
  'unearned_character_reversal',
  'unearned_relationship_reversal',
])

const categoryIntegrityBases = {
  continuity:new Set(['incompatible_facts', 'unsupported_knowledge']),
  character:new Set(['unsupported_knowledge', 'unearned_character_reversal']),
  relationship:new Set(['unearned_relationship_reversal']),
  life_state:new Set(['incompatible_facts', 'unsupported_state_change']),
  timeline:new Set(['incompatible_facts', 'timeline_impossibility']),
}

const constraintPatterns = [
  ['exclusive', /\b(only|sole|single|one and only|no other|nobody else)\b/i],
  ['absolute', /\b(never|always|must|cannot|can't|impossible)\b/i],
  ['access', /\b(key|keys|keycard|keyhole|badge|code|password|locked|unlocked|lock|door|entered|access|picked?|picking|pried?|forced|tampered?)\b/i],
  ['possession', /\b(has|have|holds|keeps|kept|attached|carrying|carries|pocket|possess|possession|gave|gives)\b/i],
  ['condition', /\b(undamaged|damage|damaged|broken|intact|open|closed|missing|gone|empty|scratches?|scratched|marks?|marked|bent|cracked|cut|shattered|pried?|forced|tampered?)\b/i],
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
  return Boolean(
    ledger?.version === ISSUE_LEDGER_VERSION &&
    ledger.lastScannedDraftHash &&
    ledger.lastScannedDraftHash === memory?.draftHash
  )
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

function evidenceSignature(evidence = []) {
  return evidence
    .map(item => normalizeFindingText(item.quote))
    .filter(Boolean)
    .sort()
    .join('|')
}

function applyCurrentFinding(issue, finding) {
  issue.category = finding.category
  issue.priority = finding.priority
  issue.title = finding.title
  issue.summary = finding.summary
  issue.question = finding.question
  issue.possibilities = finding.possibilities
  issue.characters = finding.characters
  issue.evidence = finding.evidence
  issue.fingerprint = findingFingerprint(finding)
}

function writerFacingText(value) {
  return String(value || '')
    .replace(/\s*\(?\bissue:[a-z0-9]+\)?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function passesIntegrityDisplayGate(finding) {
  if (!finding || finding.plausible_inference === true) return false
  if (!displayableIntegrityBases.has(finding.integrity_basis)) return false
  if (!categoryIntegrityBases[finding.category]?.has(finding.integrity_basis)) return false
  return Boolean(
    String(finding.conflicting_fact_a || '').trim() &&
    String(finding.conflicting_fact_b || '').trim()
  )
}

function findingFromDecision(decision) {
  const { issue_id, status, decision_explanation, ...finding } = decision
  return { ...finding, previous_issue_id:issue_id }
}

export function reconcileDraftScanResult(scanResult, previousIssues = []) {
  const knownIssues = new Map(previousIssues.map(issue => [issue.id, issue]))
  const decisions = scanResult?.existing_issue_decisions || []
  const resolvedIds = new Set()
  const findings = []
  let suppressedCount = 0

  for (const decision of decisions) {
    if (!knownIssues.has(decision.issue_id)) continue
    const finding = findingFromDecision(decision)
    if (decision.status === 'resolved' || !passesIntegrityDisplayGate(finding)) {
      resolvedIds.add(decision.issue_id)
      if (decision.status !== 'resolved') suppressedCount += 1
    }
  }

  for (const decision of decisions) {
    if (!knownIssues.has(decision.issue_id) || resolvedIds.has(decision.issue_id)) continue
    const finding = findingFromDecision(decision)
    if (decision.status === 'still_open' && passesIntegrityDisplayGate(finding)) findings.push(finding)
  }

  for (const candidate of scanResult?.new_findings || []) {
    if (!passesIntegrityDisplayGate(candidate)) {
      suppressedCount += 1
      continue
    }

    const previousMatch = previousIssues.find(issue => findingMatchesDecision(candidate, issue))
    if (previousMatch && resolvedIds.has(previousMatch.id)) {
      suppressedCount += 1
      continue
    }

    const finding = {
      ...candidate,
      previous_issue_id:previousMatch?.id || '',
    }
    if (findings.some(existing => findingMatchesDecision(finding, existing))) {
      suppressedCount += 1
      continue
    }
    findings.push(finding)
  }

  return {
    findings,
    resolved_issue_ids:[...resolvedIds],
    overall:writerFacingText(scanResult?.overall),
    suppressed_finding_count:suppressedCount,
  }
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
    if (explicitId && resolvedIds.has(explicitId)) continue
    let match = explicitId ? issues.find(issue => issue.id === explicitId) : null
    if (!match) match = issues.find(issue => findingMatchesDecision(finding, issue))
    if (match && resolvedIds.has(match.id)) continue

    if (match) {
      const priorEvidenceStillExists = evidenceStillExists(match, draftText)
      const evidenceChanged = evidenceSignature(match.evidence) !== evidenceSignature(finding.evidence)
      if (!priorEvidenceStillExists || evidenceChanged) {
        applyCurrentFinding(match, finding)
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
    overall:writerFacingText(scanResult.overall || previous.overall),
    issues:issues.slice(-100),
    scannedAt:now,
  }
}

export function applyAudienceInferenceGate(scanResult, previousIssues = []) {
  const findings = scanResult?.findings || []
  const suppressed = findings.filter(finding => finding.plausible_inference === true)
  const inferredResolvedIds = suppressed.map(finding => {
    const explicitId = finding.previous_issue_id?.trim()
    if (explicitId) return explicitId
    return previousIssues.find(issue => findingMatchesDecision(finding, issue))?.id || ''
  }).filter(Boolean)

  return {
    ...scanResult,
    findings:findings.filter(finding => finding.plausible_inference !== true),
    resolved_issue_ids:[...new Set([
      ...(scanResult?.resolved_issue_ids || []),
      ...inferredResolvedIds,
    ])],
    suppressed_inference_count:suppressed.length,
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
