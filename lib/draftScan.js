import { storyMemorySummary } from './storyMemory.js'

const string = { type:'string' }

const draftEvidenceSchema = {
  type:'object',
  additionalProperties:false,
  properties:{ quote:string, location:string },
  required:['quote', 'location'],
}

const draftFindingProperties = {
  category:{ type:'string', enum:['continuity', 'character', 'relationship', 'life_state', 'timeline'] },
  priority:{ type:'string', enum:['high', 'medium', 'low'] },
  title:string,
  summary:string,
  question:string,
  integrity_basis:{
    type:'string',
    enum:[
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
  conflicting_fact_a:string,
  conflicting_fact_b:string,
  plausible_inference:{ type:'boolean' },
  inference_explanation:string,
  possibilities:{ type:'array', items:string },
  characters:{ type:'array', items:string },
  evidence:{ type:'array', items:draftEvidenceSchema },
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
  type:'object',
  additionalProperties:false,
  properties:{
    existing_issue_decisions:{
      type:'array',
      items:{
        type:'object',
        additionalProperties:false,
        properties:{
          issue_id:string,
          status:{ type:'string', enum:['still_open', 'reopened', 'resolved'] },
          decision_explanation:string,
          resolution_basis:{
            type:'string',
            enum:['not_applicable', 'conflict_removed', 'on_page_bridge', 'reasonable_inference', 'intentional_mystery', 'general_craft'],
          },
          resolution_evidence:{ type:'array', items:draftEvidenceSchema },
          ...draftFindingProperties,
        },
        required:['issue_id', 'status', 'decision_explanation', 'resolution_basis', 'resolution_evidence', ...draftFindingRequired],
      },
    },
    new_findings:{
      type:'array',
      items:{
        type:'object',
        additionalProperties:false,
        properties:draftFindingProperties,
        required:draftFindingRequired,
      },
    },
    active_issue_ids:{ type:'array', items:string },
    overall:string,
  },
  required:['existing_issue_decisions', 'new_findings', 'active_issue_ids', 'overall'],
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

  const changedSceneText = changedScenes.map(scene => `--- ${scene.heading} [${scene.id}] ---\n${scene.text}`).join('\n\n')
  const removedSceneText = removedScenes.map(scene => `${scene.heading} [${scene.id}]`).join('\n')
  const scanMaterial = incremental
    ? `STORY MEMORY — ALL SCENES:\n${storyMemorySummary(storyMemory) || 'No indexed facts.'}\n\nCHANGED OR NEW SCENES — FULL TEXT:\n${changedSceneText || 'None.'}\n\nREMOVED SCENES:\n${removedSceneText || 'None.'}`
    : `COMPLETE DRAFT:\n${scriptText.slice(0, 500000)}`

  return {
    systemPrompt:`You are Anchor, a conservative story-integrity auditor. Audit the complete draft against itself and the writer-confirmed Story Bible. Return no more than five distinct, high-value questions across these categories: physical or factual continuity, character behavior, relationship development, character life state, and timeline/order.

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
    prompt:`SCAN MODE: ${incremental ? 'INCREMENTAL — analyze changed scenes against persistent memory' : 'INITIAL — establish the issue ledger'}\n\nCONFIRMED CHARACTERS:\n${charSummaries || 'None confirmed.'}\n\nCONFIRMED RELATIONSHIPS:\n${relSummaries || 'None confirmed.'}\n\nCONFIRMED RELATIONSHIP HISTORY:\n${relationshipHistory || 'No history confirmed.'}\n\nCONFIRMED CHARACTER-STATE HISTORY:\n${stateHistory || 'No state history confirmed.'}\n\nEXISTING ISSUE LEDGER — HISTORICAL, NOT CANONICAL:\n${issueLedger || 'No existing issues.'}\n\nWRITER-REVIEWED AS NOT A PROBLEM:\n${reviewedFindings || 'None.'}\n\n${scanMaterial}\n\nFirst decide every existing ledger issue exactly once. Then test every genuinely new candidate against the contradiction, mystery, character-evidence, and reasonable-audience gates. Return no more than five new_findings in stable priority order.`,
  }
}
