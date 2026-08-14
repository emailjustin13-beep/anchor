import { readFile, readdir } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { buildDraftScanPrompt, DRAFT_SCAN_SCHEMA } from '../lib/draftScan.js'
import { findingMatchesDecision, normalizeFindingText } from '../lib/draftReview.js'
import { documentToPlainText, legacyToDocument } from '../lib/screenplay.js'
import {
  buildStoryMemory,
  canReuseIssueLedger,
  diffStoryMemory,
  emptyIssueLedger,
  markResolvedIssuesForRecheck,
  mergeIssueLedger,
  reconcileDraftScanResult,
  setIssueLedgerStatus,
} from '../lib/storyMemory.js'

const DEFAULT_MODEL = 'claude-opus-5'
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504, 529])
const DISPLAYED_STATUSES = new Set(['open', 'pending_recheck'])
const INSTRUCTION_PATTERN = /\b(add|change|insert|remove|replace|rewrite)\b.{0,50}\b(beat|dialogue|line|passage|prose|reaction|scene|text)\b/i

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const unique = values => [...new Set(values)]

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function issueText(issue) {
  return [
    issue.title,
    issue.summary,
    issue.question,
    issue.conflicting_fact_a,
    issue.conflicting_fact_b,
    issue.inference_explanation,
    ...normalizeArray(issue.possibilities),
    ...normalizeArray(issue.evidence).flatMap(item => [item.quote, item.location]),
  ].join(' ')
}

function canonicalIssue(testCase, key) {
  const issue = testCase.issues?.[key]
  if (!issue?.finding) throw new Error(`${testCase.id} references unknown issue key "${key}".`)
  return issue
}

function issueMatchesSpec(issue, definition) {
  const match = definition.match || {}
  const categories = match.categories || [definition.finding.category]
  const bases = match.integrity_bases || [definition.finding.integrity_basis]
  if (categories.length && !categories.includes(issue.category)) return false
  if (bases.length && !bases.includes(issue.integrity_basis)) return false

  const issueCharacters = normalizeArray(issue.characters).map(normalizeFindingText)
  if (normalizeArray(match.characters).some(name => !issueCharacters.includes(normalizeFindingText(name)))) return false

  const evidenceText = normalizeArray(issue.evidence).map(item => normalizeFindingText(item.quote)).join(' | ')
  return normalizeArray(match.evidence_all).every(quote => evidenceText.includes(normalizeFindingText(quote)))
}

function hydrateDecision(testCase, key, config, ledger, keyIds) {
  const definition = canonicalIssue(testCase, key)
  const issueId = keyIds[key]
  const previous = ledger.issues.find(issue => issue.id === issueId)
  if (!previous) throw new Error(`${testCase.id} cannot decide ${key} before it has a stable issue ID.`)
  const status = config.status || 'still_open'
  return {
    ...definition.finding,
    ...previous,
    ...config.finding,
    issue_id:issueId,
    status,
    decision_explanation:config.decision_explanation || `${key} is ${status.replace('_', ' ')} in this fixture.`,
    resolution_basis:config.resolution_basis || (status === 'resolved' ? 'conflict_removed' : 'not_applicable'),
    resolution_evidence:config.resolution_evidence || [],
    plausible_inference:config.plausible_inference ?? (status === 'resolved'),
    inference_explanation:config.inference_explanation || previous.inference_explanation || definition.finding.inference_explanation,
  }
}

export function buildFixtureResponse(testCase, revision, ledger, keyIds) {
  const mock = revision.mock || {}
  const configuredDecisions = mock.decisions || {}
  const knownKeys = Object.entries(keyIds)
    .filter(([, issueId]) => ledger.issues.some(issue => issue.id === issueId))
    .map(([key]) => key)
  const decisions = knownKeys.map(key => hydrateDecision(
    testCase,
    key,
    configuredDecisions[key] || { status:'still_open' },
    ledger,
    keyIds
  ))
  const activeIssueIds = decisions
    .filter(decision => ['still_open', 'reopened'].includes(decision.status))
    .map(decision => decision.issue_id)

  const newKeys = [...normalizeArray(mock.new), ...normalizeArray(mock.duplicate_new)]
  return {
    existing_issue_decisions:decisions,
    new_findings:[
      ...newKeys.map(key => ({ ...canonicalIssue(testCase, key).finding })),
      ...normalizeArray(mock.extra_findings),
    ],
    active_issue_ids:mock.active_issue_ids || activeIssueIds,
    overall:mock.overall || `Fixture review for ${testCase.id}/${revision.id}.`,
  }
}

function applyWriterActions(ledger, actions = {}) {
  let next = ledger
  for (const issueId of normalizeArray(actions.dismiss)) next = setIssueLedgerStatus(next, issueId, 'dismissed')
  for (const issueId of normalizeArray(actions.restore)) next = setIssueLedgerStatus(next, issueId, 'open')
  return next
}

function gradeProtocol(raw, previousIssues) {
  const failures = []
  const warnings = []
  const decisions = normalizeArray(raw?.existing_issue_decisions)
  const previousIds = previousIssues.map(issue => issue.id).sort()
  const decisionIds = decisions.map(decision => decision.issue_id).sort()
  if (new Set(decisionIds).size !== decisionIds.length) failures.push('The model decided the same existing issue more than once.')
  if (previousIds.join('|') !== decisionIds.join('|')) failures.push('The model did not decide every existing ledger issue exactly once.')

  const activeFromDecisions = decisions
    .filter(decision => ['still_open', 'reopened'].includes(decision.status))
    .map(decision => decision.issue_id)
    .sort()
  const declaredActive = normalizeArray(raw?.active_issue_ids).sort()
  if (activeFromDecisions.join('|') !== declaredActive.join('|')) failures.push('active_issue_ids disagrees with existing issue decisions.')
  if (normalizeArray(raw?.new_findings).length > 5) failures.push('The model returned more than five new findings.')

  for (const finding of normalizeArray(raw?.new_findings)) {
    if (previousIssues.some(issue => findingMatchesDecision(finding, issue))) {
      warnings.push('The model reworded an existing issue as new; application reconciliation suppressed it.')
    }
  }
  return { failures, warnings }
}

function gradeIssueQuality(issues, plainScript, memory) {
  const failures = []
  const normalizedDraft = normalizeFindingText(plainScript)
  const headings = memory.scenes.map(scene => normalizeFindingText(scene.heading))

  for (const issue of issues) {
    const evidence = normalizeArray(issue.evidence)
    if (evidence.length < 1 || evidence.length > 2) failures.push(`${issue.id} must display one or two evidence quotes.`)
    for (const item of evidence) {
      const quote = normalizeFindingText(item.quote)
      if (quote.length < 12 || !normalizedDraft.includes(quote)) failures.push(`${issue.id} cites text that is not an exact current-draft quote.`)
      const location = normalizeFindingText(item.location)
      if (!location || !headings.some(heading => heading.includes(location) || location.includes(heading))) {
        failures.push(`${issue.id} cites an invalid scene location.`)
      }
    }
    if (!String(issue.question || '').trim().endsWith('?')) failures.push(`${issue.id} does not ask a neutral writer-facing question.`)
    if (INSTRUCTION_PATTERN.test(issue.question || '')) failures.push(`${issue.id} tells the writer how to change the screenplay.`)
    if (normalizeArray(issue.possibilities).length > 2) failures.push(`${issue.id} contains more than two possible interpretations.`)
    if (normalizeArray(issue.possibilities).some(possibility => INSTRUCTION_PATTERN.test(possibility))) {
      failures.push(`${issue.id} uses a possible interpretation to prescribe a rewrite.`)
    }
  }
  return failures
}

export function gradeRevision({ testCase, revision, raw, ledger, previousIssues, keyIds, plainScript, memory, cacheHit, scanMode }) {
  const failures = []
  const warnings = []
  const protocol = raw ? gradeProtocol(raw, previousIssues) : { failures:[], warnings:[] }
  failures.push(...protocol.failures)
  warnings.push(...protocol.warnings)

  const activeIssues = ledger.issues.filter(issue => DISPLAYED_STATUSES.has(issue.status))
  const dismissedIssues = ledger.issues.filter(issue => issue.status === 'dismissed')
  const expected = revision.expect || {}
  const matchedActiveIds = new Set()

  for (const key of normalizeArray(expected.active)) {
    const definition = canonicalIssue(testCase, key)
    let issue = keyIds[key] ? activeIssues.find(candidate => candidate.id === keyIds[key]) : null
    if (!issue) issue = activeIssues.find(candidate => !matchedActiveIds.has(candidate.id) && issueMatchesSpec(candidate, definition))
    if (!issue) {
      failures.push(`Expected active issue "${key}" was not displayed.`)
      continue
    }
    if (!issueMatchesSpec(issue, definition)) failures.push(`Issue "${key}" no longer matches its planted facts.`)
    if (keyIds[key] && keyIds[key] !== issue.id) failures.push(`Issue "${key}" changed identity across revisions.`)
    keyIds[key] ||= issue.id
    matchedActiveIds.add(issue.id)
  }

  for (const key of normalizeArray(expected.resolved)) {
    const issueId = keyIds[key]
    const issue = ledger.issues.find(candidate => candidate.id === issueId)
    if (!issueId || issue?.status !== 'resolved') failures.push(`Expected issue "${key}" to be resolved with its original identity.`)
  }

  for (const key of normalizeArray(expected.dismissed)) {
    const issueId = keyIds[key]
    if (!issueId || !dismissedIssues.some(issue => issue.id === issueId)) failures.push(`Writer decision for "${key}" did not remain dismissed.`)
  }

  if (expected.allow_unexpected_active !== true) {
    const unexpected = activeIssues.filter(issue => !matchedActiveIds.has(issue.id))
    if (unexpected.length) failures.push(`Unexpected active issues: ${unexpected.map(issue => issue.title).join('; ')}`)
  }

  const activeText = normalizeFindingText(activeIssues.map(issueText).join(' | '))
  for (const forbidden of normalizeArray(expected.forbidden)) {
    if (activeText.includes(normalizeFindingText(forbidden))) failures.push(`Forbidden finding reached the writer: ${forbidden}`)
  }

  failures.push(...gradeIssueQuality(activeIssues, plainScript, memory))
  if (activeIssues.length > (expected.max_findings ?? 5)) failures.push('More than five active findings reached the writer.')
  if (expected.cache === true && !cacheHit) failures.push('The unchanged draft triggered a provider scan instead of the saved review.')
  if (expected.cache !== true && cacheHit) failures.push('A changed draft incorrectly reused the prior review.')
  if (expected.scan_mode && expected.scan_mode !== scanMode) failures.push(`Expected ${expected.scan_mode} scan mode but used ${scanMode}.`)
  if (!canReuseIssueLedger(ledger, memory)) failures.push('The completed scan cannot be reused for the unchanged draft.')

  return { failures:unique(failures), warnings:unique(warnings), keyIds }
}

export async function loadGauntletCases(directory = new URL('./cases/', import.meta.url)) {
  const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort()
  return Promise.all(names.map(async name => JSON.parse(await readFile(new URL(name, directory), 'utf8'))))
}

export function gauntletInventory(cases) {
  const revisions = cases.flatMap(testCase => testCase.revisions)
  const issueDefinitions = cases.flatMap(testCase => Object.values(testCase.issues || {}))
  return {
    cases:cases.length,
    revisions:revisions.length,
    integrityBases:unique(issueDefinitions.map(issue => issue.finding.integrity_basis)).sort(),
    categories:unique(issueDefinitions.map(issue => issue.finding.category)).sort(),
    forbiddenTopics:unique(revisions.flatMap(revision => revision.expect?.forbidden || [])).sort(),
  }
}

export async function requestAnthropicForGauntlet({
  key,
  model,
  systemPrompt,
  prompt,
  timeoutMs = 55000,
  fetchImpl = fetch,
  wait = sleep,
}) {
  const body = {
    model,
    max_tokens:5000,
    system:systemPrompt,
    messages:[{ role:'user', content:prompt }],
    output_config:{ format:{ type:'json_schema', schema:DRAFT_SCAN_SCHEMA } },
  }
  if (/claude-(?:sonnet|opus)-5/.test(model)) {
    body.thinking = { type:'adaptive', display:'omitted' }
    body.output_config.effort = 'medium'
  }

  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'x-api-key':key,
          'anthropic-version':'2023-06-01',
          'content-type':'application/json',
        },
        body:JSON.stringify(body),
        signal:controller.signal,
      })
      clearTimeout(timeout)
      if (!response.ok) {
        const providerError = new Error(`Anthropic returned HTTP ${response.status}.`)
        providerError.status = response.status
        if (TRANSIENT_STATUSES.has(response.status) && attempt === 0) {
          lastError = providerError
          await wait(750)
          continue
        }
        throw providerError
      }
      const data = await response.json()
      const text = data?.content?.find(block => block.type === 'text')?.text
      if (!text || ['refusal', 'max_tokens', 'model_context_window_exceeded'].includes(data?.stop_reason)) {
        throw new Error(`Anthropic returned an incomplete ${data?.stop_reason || 'empty'} response.`)
      }
      return JSON.parse(text)
    } catch (error) {
      clearTimeout(timeout)
      lastError = controller.signal.aborted ? new Error('Anthropic exceeded the Gauntlet response deadline.') : error
      if (attempt === 0 && !error?.status) {
        await wait(750)
        continue
      }
      throw lastError
    }
  }
  throw lastError
}

export function createLiveProvider({ apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.ANTHROPIC_DRAFT_SCAN_MODEL || DEFAULT_MODEL } = {}) {
  if (!apiKey) throw new Error('Live Gauntlet requires ANTHROPIC_API_KEY. Add it as a GitHub Actions secret; never paste it into a report or chat.')
  return {
    name:'anthropic',
    model,
    async scan({ prompt }) {
      return requestAnthropicForGauntlet({ key:apiKey, model, ...prompt })
    },
  }
}

export function createFixtureProvider() {
  return {
    name:'fixture',
    model:'deterministic-fixture',
    async scan({ testCase, revision, ledger, keyIds }) {
      return buildFixtureResponse(testCase, revision, ledger, keyIds)
    },
  }
}

export async function runGauntlet({ cases, provider = createFixtureProvider(), repeats = 1, quiet = false } = {}) {
  const startedAt = new Date().toISOString()
  const runs = []
  const stableIds = new Map()
  let providerCalls = 0

  for (let repetition = 1; repetition <= repeats; repetition += 1) {
    for (const testCase of cases) {
      let ledger = emptyIssueLedger()
      const keyIds = {}

      for (const revision of testCase.revisions) {
        const document = legacyToDocument(revision.script)
        const plainScript = documentToPlainText(document)
        const memory = buildStoryMemory(document)
        const writerActions = {
          dismiss:normalizeArray(revision.writer_actions?.dismiss).map(key => keyIds[key]).filter(Boolean),
          restore:normalizeArray(revision.writer_actions?.restore).map(key => keyIds[key]).filter(Boolean),
        }
        ledger = applyWriterActions(ledger, writerActions)

        const cacheHit = canReuseIssueLedger(ledger, memory)
        let raw = null
        let elapsedMs = 0
        let scanMode = 'saved'
        let failure = null
        const previousIssues = ledger.issues.map(issue => ({ ...issue }))

        if (!cacheHit) {
          const changes = diffStoryMemory(ledger.lastScannedMemory, memory)
          const changedCount = changes.changedScenes.length + changes.removedScenes.length
          const incrementalLimit = Math.max(3, Math.ceil(memory.sceneCount * 0.6))
          const incremental = Boolean(ledger.lastScannedDraftHash) && changedCount > 0 && changedCount <= incrementalLimit
          scanMode = incremental ? 'incremental' : 'initial'
          const ledgerForScan = markResolvedIssuesForRecheck(ledger, plainScript)
          const dismissedFindings = ledgerForScan.issues.filter(issue => issue.status === 'dismissed')
          const prompt = buildDraftScanPrompt({
            scriptText:plainScript,
            characters:testCase.characters || [],
            relationships:testCase.relationships || [],
            relationshipEvents:testCase.relationship_events || [],
            characterStateEvents:testCase.character_state_events || [],
            dismissedFindings,
            storyMemory:memory,
            previousIssues:ledgerForScan.issues,
            changedScenes:incremental ? changes.changedScenes : [],
            removedScenes:incremental ? changes.removedScenes : [],
            incremental,
          })

          const start = performance.now()
          try {
            providerCalls += 1
            raw = await provider.scan({ testCase, revision, ledger:ledgerForScan, keyIds, prompt })
            elapsedMs = Math.round(performance.now() - start)
            const reconciled = reconcileDraftScanResult(raw, ledgerForScan.issues, plainScript)
            const scanResult = {
              ...reconciled,
              findings:normalizeArray(reconciled.findings).slice(0, 5).map(finding => ({
                ...finding,
                possibilities:normalizeArray(finding.possibilities).slice(0, 2),
                evidence:normalizeArray(finding.evidence).slice(0, 2),
              })),
              resolved_issue_ids:normalizeArray(reconciled.resolved_issue_ids).slice(0, 100),
              issue_resolutions:normalizeArray(reconciled.issue_resolutions).slice(0, 100),
            }
            ledger = mergeIssueLedger({
              previousLedger:ledgerForScan,
              scanResult,
              memory,
              draftText:plainScript,
              reviewedDecisions:dismissedFindings,
            })
          } catch (error) {
            elapsedMs = Math.round(performance.now() - start)
            failure = error?.message || String(error)
          }
        }

        const grade = failure
          ? { failures:[failure], warnings:[], keyIds }
          : gradeRevision({ testCase, revision, raw, ledger, previousIssues, keyIds, plainScript, memory, cacheHit, scanMode })
        if (elapsedMs > 55000) grade.failures.push(`Scan latency ${elapsedMs}ms exceeded the 55-second user deadline.`)

        for (const [key, issueId] of Object.entries(keyIds)) {
          const stabilityKey = `${testCase.id}:${key}`
          if (stableIds.has(stabilityKey) && stableIds.get(stabilityKey) !== issueId) {
            grade.failures.push(`Issue "${key}" changed identity across repeated Gauntlet runs.`)
          } else stableIds.set(stabilityKey, issueId)
        }

        const result = {
          repetition,
          case:testCase.id,
          revision:revision.id,
          scanMode,
          cacheHit,
          providerCalled:!cacheHit,
          elapsedMs,
          activeIssues:ledger.issues.filter(issue => DISPLAYED_STATUSES.has(issue.status)).map(issue => ({ id:issue.id, category:issue.category, basis:issue.integrity_basis, title:issue.title })),
          resolvedIssues:ledger.issues.filter(issue => issue.status === 'resolved').map(issue => issue.id),
          dismissedIssues:ledger.issues.filter(issue => issue.status === 'dismissed').map(issue => issue.id),
          failures:unique(grade.failures),
          warnings:unique(grade.warnings),
        }
        runs.push(result)
        if (!quiet) {
          const status = result.failures.length ? 'FAIL' : 'PASS'
          console.log(`${status} ${testCase.id}/${revision.id} [${scanMode}] ${elapsedMs}ms`)
          for (const message of result.failures) console.log(`  - ${message}`)
          for (const message of result.warnings) console.log(`  ! ${message}`)
        }
      }
    }
  }

  const latencies = runs.filter(run => run.providerCalled).map(run => run.elapsedMs)
  const failures = runs.reduce((total, run) => total + run.failures.length, 0)
  const report = {
    version:1,
    startedAt,
    completedAt:new Date().toISOString(),
    provider:provider.name,
    model:provider.model,
    repeats,
    inventory:gauntletInventory(cases),
    summary:{
      passed:failures === 0,
      checks:runs.length,
      failedChecks:runs.filter(run => run.failures.length).length,
      failures,
      warnings:runs.reduce((total, run) => total + run.warnings.length, 0),
      providerCalls,
      cacheHits:runs.filter(run => run.cacheHit).length,
      latencyMs:{ min:latencies.length ? Math.min(...latencies) : 0, p50:percentile(latencies, 0.5), p95:percentile(latencies, 0.95), max:latencies.length ? Math.max(...latencies) : 0 },
    },
    runs,
  }
  return report
}

export const GAUNTLET_ROOT = fileURLToPath(new URL('./', import.meta.url))
