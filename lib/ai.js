import { supabase } from './supabase'

// All AI calls go through /api/ai. The Anthropic key never reaches the browser.

export async function callAI({ systemPrompt, prompt, schema = null, maxTokens = 2000 }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in to use Anchor AI.')

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ systemPrompt, prompt, schema, maxTokens }),
  })

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
