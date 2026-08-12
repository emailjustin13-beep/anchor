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

export const DRAFT_SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ['continuity', 'character', 'relationship', 'life_state', 'timeline'] },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: string,
          summary: string,
          question: string,
          previous_issue_id: string,
          possibilities: { type: 'array', items: string },
          characters: { type: 'array', items: string },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                quote: string,
                location: string,
              },
              required: ['quote', 'location'],
            },
          },
        },
        required: ['category', 'priority', 'title', 'summary', 'question', 'previous_issue_id', 'possibilities', 'characters', 'evidence'],
      },
    },
    resolved_issue_ids: { type: 'array', items: string },
    overall: string,
  },
  required: ['findings', 'resolved_issue_ids', 'overall'],
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
    return `${issue.id} [${issue.status || 'open'}] ${issue.category}: ${issue.title}${evidence ? ` — ${evidence}` : ''}`
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

For each finding, you may return zero, one, or two brief possibilities. Possibilities are optional interpretations, not instructions: they must be labeled as uncertain, stay grounded in existing evidence, and never invent a new plot event, mechanism, dialogue line, or solution. Report a contradiction only when the draft contains facts genuinely in tension. Use one or two short exact quotes as evidence and label their locations. Each evidence quote must directly establish one side of the conflict; generic dialogue, acknowledgements, and paraphrases are not evidence. Do not repeat the same underlying issue in multiple categories. Do not assume a character noticed something unless the text establishes it. Do not flag a planted clue merely because its meaning is unresolved. Prefer specific continuity conflicts over general craft commentary. If the draft supports a reasonable explanation, acknowledge the ambiguity rather than declaring an error. If no meaningful issue exists, return an empty findings array.

"Missing" means reported absent or location unknown; it does not mean dead, nonexistent, or unable to be secretly present. A later reveal that a missing character is alive, hidden, or staged their disappearance is not itself a life-state or timeline conflict. If the draft reveals that the disappearance was a test, deception, or plan, treat that thread as intentional and resolved unless two exact physical facts still cannot both be true.

The writer may have marked exact evidence conflicts as intentional. Do not repeat those same conflicts unless materially different evidence elsewhere in the draft creates a new integrity question.

Maintain the persistent issue ledger:
- For a finding that is the same underlying issue as an existing ledger entry, put that exact ID in previous_issue_id. Keep its underlying meaning stable; Anchor preserves the writer-facing wording.
- For a genuinely new issue, set previous_issue_id to an empty string.
- Put an existing ID in resolved_issue_ids only when changed or removed evidence directly resolves that conflict.
- Never mark an unchanged issue resolved merely because it is not among the five returned findings.
- During an incremental scan, look for new issues only when they involve a changed scene. Use unchanged Story Memory only as comparison context.`,
    prompt: `SCAN MODE: ${incremental ? 'INCREMENTAL — analyze changed scenes against persistent memory' : 'INITIAL — establish the issue ledger'}\n\nCONFIRMED CHARACTERS:\n${charSummaries || 'None confirmed.'}\n\nCONFIRMED RELATIONSHIPS:\n${relSummaries || 'None confirmed.'}\n\nCONFIRMED RELATIONSHIP HISTORY:\n${relationshipHistory || 'No history confirmed.'}\n\nCONFIRMED CHARACTER-STATE HISTORY:\n${stateHistory || 'No state history confirmed.'}\n\nEXISTING ISSUE LEDGER:\n${issueLedger || 'No existing issues.'}\n\nWRITER-REVIEWED AS NOT A PROBLEM:\n${reviewedFindings || 'None.'}\n\n${scanMaterial}\n\nFirst test every explicit hard constraint against later physical facts. Return up to five new or revalidated findings in stable priority order, plus only the existing issue IDs directly resolved by the changed evidence.`,
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
