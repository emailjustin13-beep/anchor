// All AI calls go through the secure /api/ai route
// so the Anthropic key never touches the browser

export async function callAI({ systemPrompt, prompt }) {
  const apiKey = typeof window !== 'undefined'
    ? sessionStorage.getItem('anchor_api_key')
    : null

  const res = await fetch('/api/ai', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ systemPrompt, prompt, apiKey }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'AI request failed')
  return data.result
}

// ── Pressure Test ──────────────────────────────────────────────
export function buildPressureTestPrompt({ character, selectedText, surroundingContext, relationship, otherCharacter }) {
  const relContext = relationship && otherCharacter
    ? `\nRELATIONSHIP WITH ${otherCharacter.name.toUpperCase()}:\nType: ${relationship.type}\nTension: ${relationship.tension}/100\nStatus: ${relationship.status}\nHistory: ${relationship.history}`
    : ''

  return {
    systemPrompt: `You are a story consistency expert for Anchor, a story bible tool.
Your job is to pressure test dialogue or prose against a character's established bio.
You must reference specific details from their bio when flagging issues.
Always respond in this exact JSON format with no markdown:
{
  "verdict": "pass" | "tension" | "conflict",
  "summary": "one sentence verdict",
  "notes": [
    { "type": "voice" | "relationship" | "continuity" | "character", "text": "specific note referencing their bio" }
  ]
}`,
    prompt: `CHARACTER BIO:
Name: ${character.name}
Role: ${character.role}
Goals: ${character.goals}
Fears: ${character.fears}
Motivations: ${character.motivations}
Personality: ${character.personality}
Voice patterns: ${character.voice}
Backstory: ${character.backstory}
${relContext}

SURROUNDING SCRIPT CONTEXT:
${surroundingContext}

TEXT TO PRESSURE TEST:
${selectedText}

Does this text feel true to ${character.name}? Check voice, behavior, and relationship consistency.`
  }
}

// ── Living Bible — detect relationship shifts AND behavioral contradictions ──
export function buildRelationshipScanPrompt({ scriptChunk, characters, relationships }) {
  const charSummaries = characters.map(c =>
    `${c.name}:
  - Role: ${c.role || 'unspecified'}
  - Goals: ${c.goals || 'none listed'}
  - Fears: ${c.fears || 'none listed'}
  - Personality: ${c.personality || 'none listed'}
  - Voice: ${c.voice || 'none listed'}`
  ).join('\n\n')

  const relSummaries = relationships.map(r => {
    const a = characters.find(c => c.id === r.character_a)
    const b = characters.find(c => c.id === r.character_b)
    return `${a?.name} ↔ ${b?.name}: ${r.type}, tension ${r.tension}/100. Status: ${r.status || 'none'}`
  }).join('\n')

  return {
    systemPrompt: `You are the Living Bible engine for Anchor, a story consistency tool.
You read script passages and flag two types of problems:

1. RELATIONSHIP SHIFTS — when the dynamic between two characters meaningfully changes from what the bible says
2. BEHAVIORAL CONTRADICTIONS — when a character acts in a way that fundamentally contradicts their established personality, goals, fears, or voice — even if no relationship technically shifts

Examples of behavioral contradictions to catch:
- A character who fears vulnerability suddenly opens up with no buildup
- Two enemies spontaneously acting like friends mid-scene
- A character with an established dark/serious tone suddenly being playful or silly
- Actions that are tonally inconsistent with the scene's established conflict
- Characters doing things that contradict the emotional logic of what just happened

Be sensitive. Flag things that feel off even if they're subtle. A writer's instinct put those character details in the bible for a reason.

Respond in this exact JSON format with no markdown:
{
  "shift_detected": true | false,
  "type": "relationship_shift" | "behavioral_contradiction",
  "character_a": "name of primary character involved",
  "character_b": "name of second character if applicable, or null",
  "proposed_type": "ally|rival|romantic|family|mentor|stranger|enemy|complicated",
  "proposed_tension": 0-100,
  "reasoning": [
    "specific evidence from the text that supports this flag"
  ],
  "summary": "one line description of what's off and why"
}
If nothing is off, return { "shift_detected": false }`,
    prompt: `STORY BIBLE — CHARACTERS:
${charSummaries}

STORY BIBLE — CURRENT RELATIONSHIPS:
${relSummaries || 'None established yet.'}

SCRIPT PASSAGE TO ANALYZE:
${scriptChunk}

Does anything in this passage contradict who these characters are or how their relationships are defined? Flag relationship shifts AND any moments where a character behaves in a way that doesn't fit their established personality, fears, goals, or voice.`
  }
}

// ── Character Simulator ────────────────────────────────────────
export function buildCharacterSimulatorPrompt({ character, situation, relationships, allCharacters }) {
  const relList = relationships
    .filter(r => r.character_a === character.id || r.character_b === character.id)
    .map(r => {
      const otherId = r.character_a === character.id ? r.character_b : r.character_a
      const other   = allCharacters.find(c => c.id === otherId)
      return `${other?.name}: ${r.type} (tension ${r.tension}/100) — ${r.notes}`
    }).join('\n')

  return {
    systemPrompt: `You are a character simulator for Anchor. You embody characters with psychological accuracy.
Format your response in three sections:
WHAT THEY DO — specific physical/behavioral response
WHAT THEY SAY — dialogue in their exact voice
WHAT THEY FEEL — internal emotional state they would never say aloud`,
    prompt: `CHARACTER:
Name: ${character.name}
Goals: ${character.goals}
Fears: ${character.fears}
Personality: ${character.personality}
Voice: ${character.voice}
Backstory: ${character.backstory}

RELATIONSHIPS:
${relList || 'None established.'}

SITUATION:
${situation}

How does ${character.name} respond?`
  }
}

// ── Dialogue Consistency ───────────────────────────────────────
export function buildDialogueCheckerPrompt({ character, dialogue }) {
  return {
    systemPrompt: `You are a dialogue consistency expert for Anchor. 
Check if dialogue matches a character's established voice. Be specific.
Flag lines that feel off and suggest alternatives in their actual voice.`,
    prompt: `CHARACTER VOICE:
Name: ${character.name}
Personality: ${character.personality}
Voice patterns: ${character.voice}
Goals: ${character.goals}
Fears: ${character.fears}

DIALOGUE:
${dialogue}

Is this consistent with ${character.name}'s voice? Flag anything that feels off and rewrite it.`
  }
}

// ── Scene Generator ────────────────────────────────────────────
export function buildSceneGeneratorPrompt({ characters, location, situation, format }) {
  const charProfiles = characters.map(c =>
    `${c.name}: ${c.personality}. Voice: ${c.voice}. Wants: ${c.goals}. Fears: ${c.fears}.`
  ).join('\n')

  const formatNote = {
    screenplay:  'Write in proper screenplay format: scene headings, action lines, dialogue.',
    novel:       'Write in third-person literary prose with interiority.',
    short_story: 'Write in tight, economical short story prose.',
  }[format] || 'Write in screenplay format.'

  return {
    systemPrompt: `You are a scene writer for Anchor. ${formatNote}
Every line of dialogue must feel true to that character's established voice.
The scene should feel inevitable given these specific people in this specific place.`,
    prompt: `CHARACTERS:
${charProfiles}

LOCATION:
${location?.name || 'Unspecified'} — ${location?.description || ''} ${location?.atmosphere || ''}

SITUATION:
${situation}

Write the scene.`
  }
}

// ── Continuity Checker ─────────────────────────────────────────
export function buildContinuityCheckerPrompt({ scriptContent, characters, relationships }) {
  const charSummaries = characters.map(c =>
    `${c.name}: goals="${c.goals}" fears="${c.fears}" backstory="${c.backstory}"`
  ).join('\n')

  const relSummaries = relationships.map(r => {
    const a = characters.find(c => c.id === r.character_a)
    const b = characters.find(c => c.id === r.character_b)
    return `${a?.name} ↔ ${b?.name}: ${r.type}, tension ${r.tension}/100`
  }).join('\n')

  return {
    systemPrompt: `You are a story continuity analyst for Anchor.
Find contradictions between the story bible and the script.
Quote specific script lines and the bible entry that contradicts them.
Return a numbered list of issues. If none found, say so clearly.`,
    prompt: `STORY BIBLE — CHARACTERS:
${charSummaries}

STORY BIBLE — RELATIONSHIPS:
${relSummaries}

SCRIPT:
${scriptContent}

List all continuity issues found.`
  }
}

// ── Full Read — deep audit of script against bible ─────────────
export function buildFullReadPrompt({ project, characters, relationships, script }) {
  const scriptText = script?.content ? script.content.replace(/\[\w+\]/g, '').trim() : ''
  const charSummaries = characters.map(c =>
    `${c.name} (${c.role || 'no role'}):
  - Personality: ${c.personality || 'none listed'}
  - Goals: ${c.goals || 'none listed'}
  - Fears: ${c.fears || 'none listed'}
  - Voice: ${c.voice || 'none listed'}`
  ).join('\n\n')
  const relSummaries = relationships.map(r => {
    const a = characters.find(c => c.id === r.character_a)
    const b = characters.find(c => c.id === r.character_b)
    return `${a?.name} ↔ ${b?.name}: ${r.type}, tension ${r.tension ?? 0}/100. Status: ${r.status || 'none'}`
  }).join('\n')

  return {
    systemPrompt: `You are Anchor — a story consistency reader. You read scripts and compare them against the writer's stated intentions in their story bible. You never write. You never suggest what should happen. You only surface what is already there — drift, contradictions, patterns, and structural observations. Be specific and reference exact moments from the script. Respond only in valid JSON with no markdown.`,
    prompt: `Do a full read of this ${project.format || 'screenplay'} against its story bible.

STORY BIBLE — CHARACTERS:
${charSummaries || 'None yet.'}

STORY BIBLE — RELATIONSHIPS:
${relSummaries || 'None yet.'}

SCRIPT:
${scriptText ? scriptText.slice(0, 8000) : 'Nothing written yet.'}

Return a JSON object with exactly these keys:
{
  "actBreaks": [
    {
      "act": "Act 1",
      "description": "One sentence describing what this act covers based on the script",
      "endsAt": "Brief description of the moment or beat where this act ends, based on what's in the script"
    }
  ],
  "characterDrift": [
    {
      "character": "Character name",
      "observation": "Specific moment in the script where they act against their bible entry, with a quote or reference",
      "bibleEntry": "The specific bio field they contradicted"
    }
  ],
  "relationshipShifts": [
    {
      "characterA": "Name",
      "characterB": "Name",
      "act": "Act 1",
      "shift": "One sentence describing what changed in their relationship in this act",
      "type": "the relationship type at this point: ally|rival|romantic|family|mentor|enemy|complicated|stranger",
      "tension": 0
    }
  ],
  "overallNote": "One paragraph honest assessment of where the story stands against what the bible says it should be. No suggestions. Only observations."
}

Only include characterDrift entries where there is a genuine contradiction. Only include relationshipShifts where something actually changes. actBreaks should reflect the script's actual structure. Return only valid JSON.`
  }
}
