import { supabase } from './supabase'
import { storyMemorySummary } from './storyMemory'

// All AI calls go through /api/ai. The Anthropic key never reaches the browser.

export async function callAI({ systemPrompt, prompt, schema = null, maxTokens = 2000, profile = 'standard', timeoutMs = 60000 }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in to use Anchor AI.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ systemPrompt, prompt, schema, maxTokens, profile }),
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error('This scan took too long and was stopped. Your screenplay is safe. Please try again.')
      timeoutError.code = 'AI_TIMEOUT'
      timeoutError.retryable = true
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const upstreamFailure = res.status >= 500
    const error = new Error(data.error || (upstreamFailure
      ? 'Anchor AI is temporarily unavailable. Your screenplay is safe. Wait a minute and try again.'
      : 'AI request failed'))
    error.code = data.code || 'AI_REQUEST_FAILED'
    error.retryable = Boolean(data.retryable || upstreamFailure)
    error.status = res.status
    throw error
  }
  return data.result
}

const string = { type: 'string' }
const number = { type: 'number' }

export const PRESSURE_TEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['pass', 'question', 'concern'] },
    summary: string,
    evidence: string,
    question: string,
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['voice', 'relationship', 'continuity', 'character'] },
          text: string,
        },
        required: ['type', 'text'],
      },
    },
  },
  required: ['verdict', 'summary', 'evidence', 'question', 'notes'],
}

export const RELATIONSHIP_SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shift_detected: { type: 'boolean' },
    type: { type: 'string', enum: ['relationship_shift', 'behavioral_contradiction', 'none'] },
    character_a: string,
    character_b: string,
    proposed_type: { type: 'string', enum: ['ally', 'rival', 'romantic', 'family', 'mentor', 'stranger', 'enemy', 'complicated'] },
    proposed_tension: number,
    segment_label: string,
    evidence: string,
    reasoning: { type: 'array', items: string },
    summary: string,
    question: string,
  },
  required: ['shift_detected', 'type', 'character_a', 'character_b', 'proposed_type', 'proposed_tension', 'segment_label', 'evidence', 'reasoning', 'summary', 'question'],
}

const draftEvidenceSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    quote: string,
    location: string,
  },
  required: ['quote', 'location'],
}

const draftFindingProperties = {
  category: { type: 'string', enum: ['continuity', 'character', 'relationship', 'life_state', 'timeline'] },
  priority: { type: 'string', enum: ['high', 'medium', 'low'] },
  title: string,
  summary: string,
  question: string,
  integrity_basis: {
    type: 'string',
    enum: [
      'incompatible_facts',
      'unsupported_knowledge',
      'unsupported_state_change',
      'timeline_impossibility',
      'unearned_character_reversal',
      'unearned_relationship_reversal',
      'unanswered_question',
      'intentional_mystery',
      'general_craft',
    ],
  },
  conflicting_fact_a: string,
  conflicting_fact_b: string,
  plausible_inference: { type: 'boolean' },
  inference_explanation: string,
  possibilities: { type: 'array', items: string },
  characters: { type: 'array', items: string },
  evidence: { type: 'array', items: draftEvidenceSchema },
}

const draftFindingRequired = [
  'category',
  'priority',
  'title',
  'summary',
  'question',
  'integrity_basis',
  'conflicting_fact_a',
  'conflicting_fact_b',
  'plausible_inference',
  'inference_explanation',
  'possibilities',
  'characters',
  'evidence',
]

export const DRAFT_SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    existing_issue_decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          issue_id: string,
          status: { type: 'string', enum: ['still_open', 'reopened', 'resolved'] },
          decision_explanation: string,
          resolution_basis: {
            type: 'string',
            enum: ['not_applicable', 'conflict_removed', 'on_page_bridge', 'reasonable_inference', 'intentional_mystery', 'general_craft'],
          },
          resolution_evidence: { type: 'array', items: draftEvidenceSchema },
          ...draftFindingProperties,
        },
        required: ['issue_id', 'status', 'decision_explanation', 'resolution_basis', 'resolution_evidence', ...draftFindingRequired],
      },
    },
    new_findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: draftFindingProperties,
        required: draftFindingRequired,
      },
    },
    active_issue_ids: { type: 'array', items: string },
    overall: string,
  },
  required: ['existing_issue_decisions', 'new_findings', 'active_issue_ids', 'overall'],
}

const relationshipEventSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    character_a: string,
    character_b: string,
    sequence_index: number,
    segment_type: string,
    segment_label: string,
    type: { type: 'string', enum: ['ally', 'rival', 'romantic', 'family', 'mentor', 'stranger', 'enemy', 'complicated'] },
    tension: number,
    summary: string,
    evidence: string,
  },
  required: ['character_a', 'character_b', 'sequence_index', 'segment_type', 'segment_label', 'type', 'tension', 'summary', 'evidence'],
}

const characterStateEventSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    character: string,
    sequence_index: number,
    segment_type: string,
    segment_label: string,
    state: { type: 'string', enum: ['alive', 'missing', 'presumed_dead', 'deceased', 'unknown'] },
    summary: string,
    evidence: string,
  },
  required: ['character', 'sequence_index', 'segment_type', 'segment_label', 'state', 'summary', 'evidence'],
}

export const FIRST_READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: string,
          role: string,
          goals: string,
          fears: string,
          voice: string,
          personality: string,
          life_state: { type: 'string', enum: ['alive', 'missing', 'presumed_dead', 'deceased', 'unknown'] },
        },
        required: ['name', 'role', 'goals', 'fears', 'voice', 'personality', 'life_state'],
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          character_a: string,
          character_b: string,
          type: { type: 'string', enum: ['ally', 'rival', 'romantic', 'family', 'mentor', 'stranger', 'enemy', 'complicated'] },
          tension: number,
          status: string,
          history: string,
        },
        required: ['character_a', 'character_b', 'type', 'tension', 'status', 'history'],
      },
    },
    relationship_events: { type: 'array', items: relationshipEventSchema },
    character_state_events: { type: 'array', items: characterStateEventSchema },
  },
  required: ['characters', 'relationships', 'relationship_events', 'character_state_events'],
}

export const INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    whereYouAre: string,
    dynamics: { type: 'array', items: string },
    pulse: { type: 'array', items: string },
  },
  required: ['whereYouAre', 'dynamics', 'pulse'],
}

export const FULL_READ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    actBreaks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { act: string, description: string, endsAt: string },
        required: ['act', 'description', 'endsAt'],
      },
    },
    characterDrift: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { character: string, observation: string, bibleEntry: string, evidence: string, question: string },
        required: ['character', 'observation', 'bibleEntry', 'evidence', 'question'],
      },
    },
    relationshipShifts: { type: 'array', items: relationshipEventSchema },
    overallNote: string,
  },
  required: ['actBreaks', 'characterDrift', 'relationshipShifts', 'overallNote'],
}

export function buildFirstReadPrompt(scriptText, format) {
  return {
    systemPrompt: `You are Anchor, a story-integrity reader. Extract only what the writer actually established. Never invent, rewrite, or suggest story content. Read chronologically. Every event must include a short exact quote as evidence. Treat a sudden unexplained change as an event worth surfacing, not as permission to rewrite the character.`,
    prompt: `Read this ${format || 'screenplay'} from beginning to end and build a proposed story bible.

Identify named characters, the final known relationship snapshot for each pair, every meaningful relationship change in chronological order, and explicit character-state changes such as a disappearance or death.

For story positions, use the most specific label present in the text (scene heading, act, chapter, episode, quest, or section). sequence_index must increase in story order. Do not mark someone deceased unless the text establishes it. Keep evidence quotes short and exact.

SCRIPT:
${scriptText.slice(0, 500000)}`,
  }
}

export function buildPressureTestPrompt({ character, selectedText, surroundingContext, relationship, otherCharacter }) {
  const relContext = relationship && otherCharacter
    ? `\nRELATIONSHIP WITH ${otherCharacter.name.toUpperCase()}:\nType: ${relationship.type}\nTension: ${relationship.tension}/100\nStatus: ${relationship.status}\nHistory: ${relationship.history}`
    : ''

  return {
    systemPrompt: `You are Anchor, a story-integrity reader. Pressure-test the writer's passage against the established character bible. Never rewrite or suggest replacement prose. Distinguish a real contradiction from an intentional development. Use respectful uncertainty: pass, question, or concern. Quote one short piece of evidence from the selected passage.`,
    prompt: `CHARACTER BIBLE:
Name: ${character.name}
Role: ${character.role}
Goals: ${character.goals}
Fears: ${character.fears}
Motivations: ${character.motivations}
Personality: ${character.personality}
Voice: ${character.voice}
Backstory: ${character.backstory}
${relContext}

SURROUNDING CONTEXT:
${surroundingContext}

SELECTED PASSAGE:
${selectedText}

Assess whether the passage feels earned and consistent. Ask the writer one useful question when there is uncertainty.`,
  }
}

export function buildRelationshipScanPrompt({ scriptChunk, characters, relationships }) {
  const charSummaries = characters.map(c => `${c.name}: role=${c.role || 'unspecified'}; goals=${c.goals || 'none'}; fears=${c.fears || 'none'}; personality=${c.personality || 'none'}; voice=${c.voice || 'none'}`).join('\n')
  const relSummaries = relationships.map(r => {
    const a = characters.find(c => c.id === r.character_a)
    const b = characters.find(c => c.id === r.character_b)
    return `${a?.name} ↔ ${b?.name}: ${r.type}; tension ${r.tension}/100; ${r.status || 'no status'}`
  }).join('\n')

  return {
    systemPrompt: `You are Anchor, a story-integrity reader. Check one writer-selected passage for a meaningful relationship shift or behavioral contradiction. Never rewrite. A surprising action is not automatically wrong; ask whether the transition was intentionally earned. If nothing meaningful changed, set shift_detected to false and use empty strings, type "none", proposed type "stranger", and zero tension. Evidence must be a short exact quote from the passage.`,
    prompt: `CHARACTERS:\n${charSummaries}\n\nCURRENT RELATIONSHIPS:\n${relSummaries || 'None established.'}\n\nPASSAGE:\n${scriptChunk}\n\nSurface the single most important possible shift or contradiction, if one exists.`,
  }
}

export function buildDraftScanPrompt({
  scriptText,
  characters,
  relationships,
  relationshipEvents = [],
  characterStateEvents = [],
  dismissedFindings = [],
  storyMemory = null,
  previousIssues = [],
  changedScenes = [],
  removedScenes = [],
  incremental = false,
}) {
  const characterById = new Map(characters.map(character => [character.id, character]))
  const charSummaries = characters.map(character => [
    `${character.name}:`,
    `role=${character.role || 'unspecified'}`,
    `goals=${character.goals || 'unknown'}`,
    `fears=${character.fears || 'unknown'}`,
    `personality=${character.personality || 'unknown'}`,
    `voice=${character.voice || 'unknown'}`,
    `current life state=${character.life_state || 'unknown'}`,
  ].join(' ')).join('\n')

  const relSummaries = relationships.map(relationship => {
    const a = characterById.get(relationship.character_a)
    const b = characterById.get(relationship.character_b)
    return `${a?.name || 'Unknown'} ↔ ${b?.name || 'Unknown'}: ${relationship.type}; tension ${relationship.tension ?? 0}/100; ${relationship.status || 'no confirmed status'}`
  }).join('\n')

  const relationshipHistory = relationshipEvents.map(event => {
    const relationship = relationships.find(item => item.id === event.relationship_id)
    const a = characterById.get(relationship?.character_a)
    const b = characterById.get(relationship?.character_b)
    return `${event.sequence_index}: ${a?.name || 'Unknown'} ↔ ${b?.name || 'Unknown'} at ${event.segment_label || 'unlabeled section'} — ${event.summary || event.relationship_type || 'change recorded'}`
  }).join('\n')

  const stateHistory = characterStateEvents.map(event => {
    const character = characterById.get(event.character_id)
    return `${event.sequence_index}: ${character?.name || 'Unknown'} becomes ${event.state} at ${event.segment_label || 'unlabeled section'} — ${event.summary || 'state change recorded'}`
  }).join('\n')

  const reviewedFindings = dismissedFindings.map(finding => {
    const evidence = (finding.evidence || []).map(item => `“${item.quote}”`).join(' / ')
    return `${finding.category}: ${finding.title}${evidence ? ` — ${evidence}` : ''}`
  }).join('\n')

  const issueLedger = previousIssues.map(issue => {
    const evidence = (issue.evidence || []).map(item => `“${item.quote}”`).join(' / ')
    const resolutionEvidence = (issue.resolutionEvidence || []).map(item => `“${item.quote}”`).join(' / ')
    const resolution = issue.resolutionBasis
      ? `\nPrior resolution: ${issue.resolutionBasis}${resolutionEvidence ? ` — ${resolutionEvidence}` : ''}`
      : ''
    return `${issue.id} [${issue.status || 'open'}] ${issue.category}: ${issue.title}\nHistorical summary: ${issue.summary || 'none'}\nHistorical question: ${issue.question || 'none'}${evidence ? `\nHistorical evidence: ${evidence}` : ''}${resolution}`
  }).join('\n')

  const changedSceneText = changedScenes.map(scene => (
    `--- ${scene.heading} [${scene.id}] ---\n${scene.text}`
  )).join('\n\n')

  const removedSceneText = removedScenes.map(scene => `${scene.heading} [${scene.id}]`).join('\n')
  const scanMaterial = incremental
    ? `STORY MEMORY — ALL SCENES:\n${storyMemorySummary(storyMemory) || 'No indexed facts.'}\n\nCHANGED OR NEW SCENES — FULL TEXT:\n${changedSceneText || 'None.'}\n\nREMOVED SCENES:\n${removedSceneText || 'None.'}`
    : `COMPLETE DRAFT:\n${scriptText.slice(0, 500000)}`

  return {
    systemPrompt: `You are Anchor, a conservative story-integrity auditor. Audit the complete draft against itself and the writer-confirmed Story Bible. Return no more than five distinct, high-value questions across these categories: physical or factual continuity, character behavior, relationship development, character life state, and timeline/order.

Never rewrite, recommend adding a scene, beat, explanation, or internal reaction, and never tell the writer how to fix the work. A surprising choice can be intentional development. Phrase every observation as a neutral question that helps the writer confirm intent. Keep possible explanations out of the question itself.

Follow this audit order every time:
1. Build a hard-constraint ledger from explicit words and physical facts such as only, never, always, locked, undamaged, attached, retained, entered, left, exact times, possession, access, and location.
2. Compare every later event against that ledger. Any unresolved hard factual conflict must appear before softer character, relationship, or thematic questions.
3. Check irreversible life-state conflicts, then timeline/order conflicts, then relationship or character development.
4. Return only supported findings in this stable priority order. Never fill the quota with weak possibilities.

For each issue candidate, identify two established facts and classify the integrity_basis before deciding whether it belongs in the review. The displayable bases are incompatible_facts, unsupported_knowledge, unsupported_state_change, timeline_impossibility, unearned_character_reversal, and unearned_relationship_reversal. The excluded bases are unanswered_question, intentional_mystery, and general_craft. Never put an excluded basis in new_findings, and resolve an existing issue if current evidence changes it into an excluded basis.

Two facts are not incompatible merely because the connecting event, culprit, method, or motive has not yet been revealed. "An object was secured" and "the object is later missing" can both be true; that is an unanswered question or intentional mystery unless another explicit fact makes removal impossible. A character making an unexplained choice is general craft commentary unless it conflicts with a previously established trait, promise, rule, goal, or repeated behavior. Speaking to a security officer is not a reversal merely because the officer is unfamiliar. A character may lie; conflicting dialogue is not a continuity error unless the draft presents both statements as objective truth.

For each displayed finding, you may return zero, one, or two brief possibilities. Possibilities are optional interpretations, not instructions: they must be labeled as uncertain, stay grounded in existing evidence, and never invent a new plot event, mechanism, dialogue line, or solution. Use one or two short exact quotes as evidence and label their locations. Each evidence quote must directly establish one side of the conflict; generic dialogue, acknowledgements, and paraphrases are not evidence. Do not repeat the same underlying issue in multiple categories. Do not assume a character noticed something unless the text establishes it. Do not flag a planted clue merely because its meaning is unresolved. If no meaningful new issue exists, return an empty new_findings array.

Apply a reasonable-audience inference gate before returning every finding:
- Screenplays communicate through images, behavior, juxtaposition, established skills, and implication. Do not demand explanatory dialogue when an ordinary attentive viewer can connect the on-page clues.
- Consider the combined evidence, not each line in isolation. A physical trace plus opportunity or established ability may supply a sufficient causal bridge even when the exact method is not spoken aloud.
- Examples of sufficient bridges include scratches around a keyhole implying lock manipulation, pry marks implying forced access, wet clothing implying recent exposure to water, or a blood trail implying passage through a location. These are examples of the reasoning standard, not special-case rules.
- A bridge must be supported by the current draft. A duplicate key, secret passage, unseen helper, or other fact with no textual clue is an invented explanation and does not count.
- If at least one reasonable evidence-supported inference makes the facts compatible, do not return the concern as a finding. Resolve a matching historical issue instead.
- Every still-open decision and new finding must set plausible_inference to false and briefly state in inference_explanation why the existing clues cannot reasonably bridge the conflict. Anchor defensively suppresses any item marked plausible_inference true.

"Missing" means reported absent or location unknown; it does not mean dead, nonexistent, or unable to be secretly present. A later reveal that a missing character is alive, hidden, or staged their disappearance is not itself a life-state or timeline conflict. If the draft reveals that the disappearance was a test, deception, or plan, treat that thread as intentional and resolved unless two exact physical facts still cannot both be true.

The writer may have marked exact evidence conflicts as intentional. Do not repeat those same conflicts unless materially different evidence elsewhere in the draft creates a new integrity question.

Maintain the persistent issue ledger with a mutually exclusive protocol:
- The changed scene text is current canon. Existing ledger wording and evidence are historical context only. Never repeat a factual claim that the changed text removed, contradicted, or replaced.
- Return exactly one existing_issue_decisions entry for every ledger issue, including open, dismissed, resolved, and pending_recheck items. Copy its exact issue_id and choose exactly one status: still_open, reopened, or resolved.
- Use still_open only when the present draft still contains the same genuine integrity conflict. When its evidence is unchanged, keep its underlying meaning stable. When evidence materially changed but the issue remains, update every field to describe current facts.
- Use reopened when a previously resolved or pending_recheck issue is once again an active integrity conflict because its on-page bridge was removed or contradicted. Reuse the exact issue_id; never place a reopened issue in new_findings.
- Use resolved when the conflict was removed, the current draft supplies a reasonable on-page bridge, or the item is now explicitly framed by the draft as intentional mystery or general craft. A merely possible unseen conversation, eavesdropping, helper, device, key, or action is not a bridge and cannot resolve an issue. A resolved decision cannot also appear in new_findings.
- For still_open or reopened, set resolution_basis to not_applicable and resolution_evidence to an empty array.
- For resolved, set resolution_basis to the single reason it resolved. If the reason is on_page_bridge, reasonable_inference, intentional_mystery, or general_craft, cite the exact current-draft line or lines that support that resolution in resolution_evidence. If no such current line exists, the issue is not resolved. Use conflict_removed only when at least one of the prior conflicting facts is genuinely absent from the current draft.
- Put the exact issue_id of every still_open or reopened existing issue in active_issue_ids. Never include a resolved issue. The list must agree with existing_issue_decisions; prose in overall cannot describe an issue as active unless its ID appears here.
- new_findings is for genuinely new underlying conflicts only. Never copy, paraphrase, rename, or recategorize an existing issue into new_findings.
- A reasonable physical clue can resolve a former access impossibility without dialogue spelling out the mechanism. Scratches around a keyhole, pry marks, a broken latch, or comparable on-page traces make alternate entry plausible unless another explicit fact rules it out. Resolve the old issue instead of demanding further explanation.
- During an incremental scan, look for new issues only when they involve a changed scene. Use unchanged Story Memory only as comparison context.`,
    prompt: `SCAN MODE: ${incremental ? 'INCREMENTAL — analyze changed scenes against persistent memory' : 'INITIAL — establish the issue ledger'}\n\nCONFIRMED CHARACTERS:\n${charSummaries || 'None confirmed.'}\n\nCONFIRMED RELATIONSHIPS:\n${relSummaries || 'None confirmed.'}\n\nCONFIRMED RELATIONSHIP HISTORY:\n${relationshipHistory || 'No history confirmed.'}\n\nCONFIRMED CHARACTER-STATE HISTORY:\n${stateHistory || 'No state history confirmed.'}\n\nEXISTING ISSUE LEDGER — HISTORICAL, NOT CANONICAL:\n${issueLedger || 'No existing issues.'}\n\nWRITER-REVIEWED AS NOT A PROBLEM:\n${reviewedFindings || 'None.'}\n\n${scanMaterial}\n\nFirst decide every existing ledger issue exactly once. Then test every genuinely new candidate against the contradiction, mystery, character-evidence, and reasonable-audience gates. Return no more than five new_findings in stable priority order.`,
  }
}

export function buildFullReadPrompt({ project, characters, relationships, script }) {
  const scriptText = script?.content ? script.content.replace(/\[\w+\]/g, '').trim() : ''
  const charSummaries = characters.map(c => `${c.name}: personality=${c.personality || 'none'}; goals=${c.goals || 'none'}; fears=${c.fears || 'none'}; voice=${c.voice || 'none'}`).join('\n')
  const relSummaries = relationships.map(r => {
    const a = characters.find(c => c.id === r.character_a)
    const b = characters.find(c => c.id === r.character_b)
    return `${a?.name} ↔ ${b?.name}: ${r.type}; tension ${r.tension ?? 0}/100; ${r.status || 'no status'}`
  }).join('\n')

  return {
    systemPrompt: `You are Anchor, a story-integrity reader. Audit the writer's complete draft against the confirmed story bible. Never rewrite or suggest what should happen. Report observations as respectful questions and ground every concern in a short exact quote. Read chronologically.`,
    prompt: `PROJECT: ${project.title} (${project.format || 'screenplay'})\n\nCHARACTERS:\n${charSummaries || 'None.'}\n\nRELATIONSHIPS:\n${relSummaries || 'None.'}\n\nSCRIPT:\n${scriptText.slice(0, 500000)}\n\nReturn the actual structure, genuine character concerns, chronological relationship shifts, and a concise overall observation.`,
  }
}
