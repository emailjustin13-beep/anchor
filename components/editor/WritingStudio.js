'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  callAI,
  buildDraftScanPrompt,
  buildPressureTestPrompt,
  buildRelationshipScanPrompt,
  DRAFT_SCAN_SCHEMA,
  PRESSURE_TEST_SCHEMA,
  RELATIONSHIP_SCAN_SCHEMA,
} from '../../lib/ai'
import {
  SCREENPLAY_ELEMENTS,
  SCREENPLAY_ELEMENT_ORDER,
  countWords,
  documentToFdx,
  documentToLegacy,
  documentToPlainText,
  downloadTextFile,
  estimateScreenplayPages,
  fdxToDocument,
  legacyToDocument,
  safeFilename,
  titlePageFromFdx,
} from '../../lib/screenplay'
import FirstRead from '../bible/FirstRead'
import { ScreenplayKeyboard, ScreenplayParagraph } from './screenplayExtensions'
import { findEvidenceRange, findingFingerprint, normalizeFindingText } from '../../lib/draftReview'
import {
  buildStoryMemory,
  canReuseIssueLedger,
  diffStoryMemory,
  emptyIssueLedger,
  ISSUE_LEDGER_VERSION,
  issueLedgerReview,
  mergeIssueLedger,
  setIssueLedgerStatus,
} from '../../lib/storyMemory'

const REL_COLORS = { ally:'#3FB950', rival:'#F85149', romantic:'#DB61A2', family:'#58A6FF', mentor:'#D2A8FF', enemy:'#FF7B72', complicated:'#FFA657', stranger:'#6A6A88' }
const DRAFT_CATEGORY_LABELS = {
  continuity:'Continuity',
  character:'Character',
  relationship:'Relationship',
  life_state:'Life state',
  timeline:'Timeline',
}

function documentOutline(editor) {
  const scenes = []
  if (!editor) return scenes
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'screenplayParagraph' && node.attrs.elementType === 'scene' && node.textContent.trim()) {
      scenes.push({ number: scenes.length + 1, label: node.textContent.trim().toUpperCase(), pos })
    }
  })
  return scenes
}

function currentParagraph(editor) {
  if (!editor) return { type:'action', text:'', from:0, to:0 }
  const { $from } = editor.state.selection
  return {
    type: $from.parent.attrs.elementType || 'action',
    text: $from.parent.textContent,
    from: $from.start(),
    to: $from.end(),
  }
}

function selectedText(editor) {
  if (!editor) return ''
  const { from, to } = editor.state.selection
  return from === to ? '' : editor.state.doc.textBetween(from, to, '\n').trim()
}

function currentSceneText(editor) {
  if (!editor) return ''
  const cursor = editor.state.selection.from
  let start = 0
  let end = editor.state.doc.content.size
  const headings = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'screenplayParagraph' && node.attrs.elementType === 'scene') headings.push(pos)
  })
  for (const pos of headings) {
    if (pos <= cursor) start = pos
    else { end = pos; break }
  }
  return editor.state.doc.textBetween(start, end, '\n').trim()
}

function suggestionsFor(type, query, characters, scenes) {
  const value = query.trim().toUpperCase()
  if (type === 'character') {
    const names = characters.flatMap(character => [
      character.name,
      `${character.name} (V.O.)`,
      `${character.name} (O.S.)`,
      `${character.name} (CONT’D)`,
    ])
    return names.filter(name => !value || name.toUpperCase().startsWith(value)).slice(0, 8)
  }
  if (type === 'scene') {
    const defaults = ['INT. ', 'EXT. ', 'INT./EXT. ']
    const previous = scenes.map(scene => scene.label)
    return [...new Set([...defaults, ...previous])].filter(item => !value || item.startsWith(value)).slice(0, 8)
  }
  if (type === 'parenthetical') {
    return ['(beat)', '(quietly)', '(whispering)', '(to himself)', '(CONT’D)'].filter(item => !value || item.toUpperCase().includes(value)).slice(0, 8)
  }
  return []
}

function findCharacterBeforeSelection(editor, characters) {
  if (!editor) return characters[0]
  const cursor = editor.state.selection.from
  let name = ''
  editor.state.doc.descendants((node, pos) => {
    if (pos >= cursor) return false
    if (node.type.name === 'screenplayParagraph' && node.attrs.elementType === 'character') name = node.textContent.replace(/\s*\(.+\)\s*$/, '').trim()
  })
  return characters.find(character => character.name.toLowerCase() === name.toLowerCase()) || characters[0]
}

export default function WritingStudio({
  project,
  script,
  characters,
  relationships,
  relationshipEvents = [],
  characterStateEvents = [],
  scriptVersions = [],
  onSaveScript,
  onCreateRelationship,
  onUpdateRelationship,
  onCreateRelationshipEvent,
  onCreateScriptVersion,
  onReload,
}) {
  const [title, setTitle] = useState(script?.title || project.title)
  const [titlePage, setTitlePage] = useState(script?.title_page || { title:project.title, author:'', contact:'', draftDate:'' })
  const [saveState, setSaveState] = useState('saved')
  const [activeType, setActiveType] = useState('scene')
  const [outline, setOutline] = useState([])
  const [stats, setStats] = useState({ words:0, pages:1 })
  const [queryText, setQueryText] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [titlePageOpen, setTitlePageOpen] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [xrayOpen, setXrayOpen] = useState(true)
  const [showFirstRead, setShowFirstRead] = useState(false)
  const [firstReadDismissed, setFirstReadDismissed] = useState(false)
  const [aiBusy, setAiBusy] = useState('')
  const [aiElapsed, setAiElapsed] = useState(0)
  const [review, setReview] = useState(null)
  const [message, setMessage] = useState('')
  const [draftIssueLedger, setDraftIssueLedger] = useState(emptyIssueLedger)
  const [storyMemoryState, setStoryMemoryState] = useState({ status:'ready', scenes:0, facts:0 })

  const saveTimer = useRef(null)
  const memoryTimer = useRef(null)
  const importRef = useRef(null)
  const suggestionsRef = useRef([])
  const suggestionIndexRef = useRef(0)
  const titleRef = useRef(title)
  const titlePageRef = useRef(titlePage)
  const saveFnRef = useRef(onSaveScript)
  const storyMemoryRef = useRef(null)
  const legacyDecisionsRef = useRef([])
  const recoveryKey = `anchor-recovery:${project.id}`
  const draftDecisionKey = `anchor-draft-decisions:${project.id}`
  const storyMemoryKey = `anchor-story-memory:${project.id}`
  const issueLedgerKey = `anchor-issue-ledger:${project.id}`

  useEffect(() => { titleRef.current = title }, [title])
  useEffect(() => { titlePageRef.current = titlePage }, [titlePage])
  useEffect(() => { saveFnRef.current = onSaveScript }, [onSaveScript])
  useEffect(() => {
    if (!aiBusy) {
      setAiElapsed(0)
      return undefined
    }
    const startedAt = Date.now()
    const timer = setInterval(() => setAiElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [aiBusy])
  useEffect(() => {
    try {
      const savedLedger = JSON.parse(localStorage.getItem(issueLedgerKey) || 'null')
      const legacyDecisions = JSON.parse(localStorage.getItem(draftDecisionKey) || '[]')
      legacyDecisionsRef.current = Array.isArray(legacyDecisions) ? legacyDecisions : []
      setDraftIssueLedger(savedLedger?.version === ISSUE_LEDGER_VERSION ? savedLedger : emptyIssueLedger())
    } catch {
      legacyDecisionsRef.current = []
      setDraftIssueLedger(emptyIssueLedger())
    }
  }, [draftDecisionKey, issueLedgerKey])

  function persistIssueLedger(next) {
    try {
      localStorage.setItem(issueLedgerKey, JSON.stringify(next))
    } catch {
      setMessage('Story Memory could not save the issue ledger in this browser.')
    }
    return next
  }

  function dismissDraftFinding(finding) {
    const issueId = finding.id
    setDraftIssueLedger(current => persistIssueLedger(setIssueLedgerStatus(current, issueId, 'dismissed')))
    setReview(current => current?.kind === 'draft' ? {
      ...current,
      findings:current.findings.map(issue => issue.id === issueId ? { ...issue, status:'dismissed' } : issue),
    } : current)
  }

  function restoreDraftFinding(issueId) {
    setDraftIssueLedger(current => persistIssueLedger(setIssueLedgerStatus(current, issueId, 'open')))
    setReview(current => current?.kind === 'draft' ? {
      ...current,
      findings:current.findings.map(issue => issue.id === issueId ? { ...issue, status:'open' } : issue),
    } : current)
  }

  function clearDraftFindingDecisions() {
    legacyDecisionsRef.current = []
    localStorage.removeItem(draftDecisionKey)
    setDraftIssueLedger(current => {
      const next = {
        ...current,
        issues:current.issues.map(issue => issue.status === 'dismissed' ? { ...issue, status:'open', dismissedAt:null } : issue),
      }
      setReview(reviewValue => reviewValue?.kind === 'draft' ? issueLedgerReview(next, { cached:true }) : reviewValue)
      return persistIssueLedger(next)
    })
  }

  function saveStoryMemory(memory) {
    storyMemoryRef.current = memory
    setStoryMemoryState({ status:'ready', scenes:memory.sceneCount, facts:memory.factCount })
    try {
      localStorage.setItem(storyMemoryKey, JSON.stringify(memory))
    } catch {
      setMessage('Story Memory could not be saved in this browser.')
    }
  }

  function queueStoryMemory(doc) {
    setStoryMemoryState(current => ({ ...current, status:'updating' }))
    clearTimeout(memoryTimer.current)
    memoryTimer.current = setTimeout(() => saveStoryMemory(buildStoryMemory(doc)), 650)
  }

  function queueSave(editorInstance, nextTitle = titleRef.current, nextTitlePage = titlePageRef.current) {
    if (!editorInstance) return
    const contentJson = editorInstance.getJSON()
    const legacy = documentToLegacy(contentJson)
    const recovery = { contentJson, title:nextTitle, titlePage:nextTitlePage, savedAt:new Date().toISOString() }
    localStorage.setItem(recoveryKey, JSON.stringify(recovery))
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveFnRef.current(legacy, nextTitle, { contentJson, titlePage:nextTitlePage })
        setSaveState('saved')
      } catch (error) {
        setSaveState('failed')
        setMessage('Save failed: ' + error.message)
      }
    }, 850)
  }

  const extensions = useMemo(() => [
    StarterKit.configure({
      paragraph:false,
      heading:false,
      blockquote:false,
      bulletList:false,
      orderedList:false,
      listItem:false,
      codeBlock:false,
      horizontalRule:false,
    }),
    ScreenplayParagraph,
    ScreenplayKeyboard,
    Placeholder.configure({
      placeholder: ({ node }) => SCREENPLAY_ELEMENTS[node.attrs?.elementType]?.label || 'Write…',
    }),
  ], [])

  const editor = useEditor({
    immediatelyRender:false,
    extensions,
    content:legacyToDocument(script?.content || ''),
    editorProps:{
      attributes:{ class:'anchor-screenplay-editor', spellcheck:'true', autocapitalize:'sentences' },
      handleKeyDown:(view, event) => {
        if (suggestionsRef.current.length === 0) return false
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const direction = event.key === 'ArrowDown' ? 1 : -1
          const next = (suggestionIndexRef.current + direction + suggestionsRef.current.length) % suggestionsRef.current.length
          suggestionIndexRef.current = next
          setSuggestionIndex(next)
          return true
        }
        if (event.key === 'Escape') {
          suggestionsRef.current = []
          setSuggestions([])
          return true
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const value = suggestionsRef.current[suggestionIndexRef.current]
          const { $from } = view.state.selection
          view.dispatch(view.state.tr.insertText(value, $from.start(), $from.end()))
          suggestionsRef.current = []
          setSuggestions([])
          view.focus()
          return true
        }
        return false
      },
    },
    onUpdate:({ editor:instance }) => {
      const json = instance.getJSON()
      setOutline(documentOutline(instance))
      setStats({ words:countWords(json), pages:estimateScreenplayPages(json) })
      const paragraph = currentParagraph(instance)
      setActiveType(paragraph.type)
      setQueryText(paragraph.text)
      queueSave(instance)
      queueStoryMemory(json)
    },
    onSelectionUpdate:({ editor:instance }) => {
      const paragraph = currentParagraph(instance)
      setActiveType(paragraph.type)
      setQueryText(paragraph.text)
    },
  })

  useEffect(() => {
    if (!editor) return
    let initial = script?.content_json || legacyToDocument(script?.content || '')
    let initialTitle = script?.title || project.title
    let initialTitlePage = script?.title_page || { title:project.title, author:'', contact:'', draftDate:'' }
    try {
      const recovery = JSON.parse(localStorage.getItem(recoveryKey) || 'null')
      const serverTime = script?.updated_at ? new Date(script.updated_at).getTime() : 0
      if (recovery?.contentJson && new Date(recovery.savedAt).getTime() > serverTime + 2000) {
        if (confirm('Anchor found newer unsaved writing on this device. Recover it?')) {
          initial = recovery.contentJson
          initialTitle = recovery.title || initialTitle
          initialTitlePage = recovery.titlePage || initialTitlePage
          setMessage('Recovered the newest local draft.')
        }
      }
    } catch {}
    titleRef.current = initialTitle
    titlePageRef.current = initialTitlePage
    setTitle(initialTitle)
    setTitlePage(initialTitlePage)
    editor.commands.setContent(initial, { emitUpdate:false })
    setOutline(documentOutline(editor))
    const initialDocument = editor.getJSON()
    setStats({ words:countWords(initialDocument), pages:estimateScreenplayPages(initialDocument) })
    saveStoryMemory(buildStoryMemory(initialDocument))
    setSaveState('saved')
  }, [editor, script?.id, project.id])

  useEffect(() => {
    if (!editor) return
    const next = suggestionsFor(activeType, queryText, characters, outline)
    suggestionsRef.current = next
    suggestionIndexRef.current = 0
    setSuggestions(next)
    setSuggestionIndex(0)
  }, [editor, activeType, queryText, characters, outline.length])

  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    clearTimeout(memoryTimer.current)
  }, [])

  useEffect(() => {
    const handleShortcut = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  function setElement(type) {
    editor?.chain().focus().setScreenplayElement(type).run()
    if (type === 'parenthetical' && editor) {
      const paragraph = currentParagraph(editor)
      if (!paragraph.text) editor.chain().insertContent('()').setTextSelection(paragraph.from + 1).run()
    }
  }

  function acceptSuggestion(value) {
    if (!editor) return
    const paragraph = currentParagraph(editor)
    editor.chain().focus().setTextSelection({ from:paragraph.from, to:paragraph.to }).insertContent(value).run()
    suggestionsRef.current = []
    setSuggestions([])
  }

  function jumpToScene(scene) {
    editor?.chain().focus().setTextSelection(scene.pos + 1).scrollIntoView().run()
  }

  function findNext() {
    if (!editor || !findText) return
    const needle = findText.toLowerCase()
    const matches = []
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      const haystack = node.text.toLowerCase()
      let offset = 0
      while ((offset = haystack.indexOf(needle, offset)) >= 0) {
        matches.push({ from:pos + offset, to:pos + offset + needle.length })
        offset += Math.max(needle.length, 1)
      }
    })
    const next = matches.find(match => match.from > editor.state.selection.from) || matches[0]
    if (!next) return setMessage('No matches found.')
    editor.chain().focus().setTextSelection(next).scrollIntoView().run()
  }

  function replaceCurrent() {
    if (!editor || !findText) return
    const current = selectedText(editor)
    if (current.toLowerCase() !== findText.toLowerCase()) return findNext()
    editor.chain().focus().insertContent(replaceText).run()
    findNext()
  }

  function replaceAll() {
    if (!editor || !findText) return
    const needle = findText.toLowerCase()
    const matches = []
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      const haystack = node.text.toLowerCase()
      let offset = 0
      while ((offset = haystack.indexOf(needle, offset)) >= 0) {
        matches.push({ from:pos + offset, to:pos + offset + needle.length })
        offset += Math.max(needle.length, 1)
      }
    })
    let transaction = editor.state.tr
    matches.reverse().forEach(match => {
      transaction = replaceText
        ? transaction.replaceWith(match.from, match.to, editor.state.schema.text(replaceText))
        : transaction.delete(match.from, match.to)
    })
    editor.view.dispatch(transaction)
    setMessage(`Replaced ${matches.length} match${matches.length === 1 ? '' : 'es'}.`)
  }

  async function importScript(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !editor) return
    if (!confirm(`Replace the current draft with “${file.name}”? A local recovery copy will remain available.`)) return
    try {
      const text = await file.text()
      const isFdx = file.name.toLowerCase().endsWith('.fdx')
      const document = isFdx ? fdxToDocument(text) : legacyToDocument(text)
      editor.commands.setContent(document)
      if (isFdx) {
        const importedPage = titlePageFromFdx(text)
        titlePageRef.current = importedPage
        setTitlePage(importedPage)
      }
      setMessage(`Imported ${file.name}.`)
    } catch (error) {
      setMessage('Import failed: ' + error.message)
    }
  }

  function exportFile(format) {
    if (!editor) return
    const filename = safeFilename(title)
    if (format === 'fdx') downloadTextFile(`${filename}.fdx`, documentToFdx(editor.getJSON(), titlePageRef.current), 'application/xml;charset=utf-8')
    if (format === 'txt') downloadTextFile(`${filename}.txt`, documentToPlainText(editor.getJSON()))
    if (format === 'pdf') window.print()
    setFileMenuOpen(false)
  }

  async function saveNamedVersion() {
    if (!editor || !onCreateScriptVersion) return
    const label = prompt('Name this version:', `Draft ${new Date().toLocaleString()}`)
    if (!label) return
    try {
      await onCreateScriptVersion({
        label,
        title:titleRef.current,
        content:documentToLegacy(editor.getJSON()),
        content_json:editor.getJSON(),
        title_page:titlePageRef.current,
      })
      setMessage('Version saved.')
    } catch (error) {
      setMessage('Version could not be saved: ' + error.message)
    }
  }

  function restoreVersion(version) {
    if (!editor || !confirm(`Restore “${version.label}”? The current draft will remain in local recovery.`)) return
    editor.commands.setContent(version.content_json || legacyToDocument(version.content || ''))
    setTitle(version.title || title)
    titleRef.current = version.title || title
    if (version.title_page) {
      setTitlePage(version.title_page)
      titlePageRef.current = version.title_page
    }
    setVersionsOpen(false)
    setMessage(`Restored ${version.label}.`)
  }

  async function runPressureTest() {
    const passage = selectedText(editor)
    if (!passage) return setMessage('Select a passage first.')
    const character = findCharacterBeforeSelection(editor, characters)
    if (!character) return setMessage('Add a character to the Story Bible first.')
    const context = currentSceneText(editor)
    const other = characters.find(item => item.id !== character.id && context.toLowerCase().includes(item.name.toLowerCase()))
    const relationship = other ? relationships.find(item =>
      (item.character_a === character.id && item.character_b === other.id) ||
      (item.character_a === other.id && item.character_b === character.id)
    ) : null
    setAiBusy('Pressure testing')
    setReview(null)
    try {
      const prompt = buildPressureTestPrompt({ character, selectedText:passage, surroundingContext:context, relationship, otherCharacter:other })
      const result = await callAI({ ...prompt, schema:PRESSURE_TEST_SCHEMA, maxTokens:1800 })
      setReview({ kind:'pressure', ...result, character })
    } catch (error) { setMessage('Pressure Test failed: ' + error.message) }
    setAiBusy('')
  }

  async function runSceneScan() {
    if (!editor || characters.length < 1) return setMessage('Add at least one character first.')
    const passage = currentSceneText(editor)
    if (passage.length < 40) return setMessage('There is not enough writing to scan yet.')
    setAiBusy('Scanning scene')
    setReview(null)
    try {
      const prompt = buildRelationshipScanPrompt({ scriptChunk:passage, characters, relationships })
      const result = await callAI({ ...prompt, schema:RELATIONSHIP_SCAN_SCHEMA, maxTokens:1800 })
      const charA = characters.find(character => character.name.toLowerCase() === result.character_a?.toLowerCase())
      const charB = characters.find(character => character.name.toLowerCase() === result.character_b?.toLowerCase())
      setReview({ kind:'scan', scope:'scene', ...result, charA, charB })
    } catch (error) { setMessage('Scan failed: ' + error.message) }
    setAiBusy('')
  }

  async function runDraftScan() {
    if (!editor || characters.length < 1) return setMessage('Add at least one character first.')
    const document = editor.getJSON()
    const scriptText = documentToPlainText(document)
    if (scriptText.length < 80) return setMessage('There is not enough writing to scan yet.')

    const currentMemory = buildStoryMemory(document)
    saveStoryMemory(currentMemory)
    if (canReuseIssueLedger(draftIssueLedger, currentMemory)) {
      setReview(issueLedgerReview(draftIssueLedger, { cached:true, scanMode:'saved' }))
      setMessage('No writing changed. Showing the exact saved review—no new AI scan was needed.')
      return
    }

    const changes = diffStoryMemory(draftIssueLedger.lastScannedMemory, currentMemory)
    const changedCount = changes.changedScenes.length + changes.removedScenes.length
    const incrementalLimit = Math.max(3, Math.ceil(currentMemory.sceneCount * 0.6))
    const incremental = Boolean(draftIssueLedger.lastScannedDraftHash) && changedCount > 0 && changedCount <= incrementalLimit
    setAiBusy(incremental ? `Checking ${changedCount} changed scene${changedCount === 1 ? '' : 's'}` : 'Building story memory')
    setReview(null)
    try {
      const normalizedDraft = normalizeFindingText(scriptText)
      const ledgerDecisions = draftIssueLedger.issues
        .filter(issue => issue.status === 'dismissed')
        .map(issue => ({ ...issue, fingerprint:issue.fingerprint || findingFingerprint(issue) }))
      const activeDecisions = [...ledgerDecisions, ...legacyDecisionsRef.current].filter(decision =>
        (decision.evidence || []).some(item => {
          const quote = normalizeFindingText(item.quote)
          return quote.length >= 12 && normalizedDraft.includes(quote)
        })
      )
      const prompt = buildDraftScanPrompt({
        scriptText,
        characters,
        relationships,
        relationshipEvents,
        characterStateEvents,
        dismissedFindings:activeDecisions,
        storyMemory:currentMemory,
        previousIssues:draftIssueLedger.issues,
        changedScenes:incremental ? changes.changedScenes : [],
        removedScenes:incremental ? changes.removedScenes : [],
        incremental,
      })
      const result = await callAI({
        ...prompt,
        schema:DRAFT_SCAN_SCHEMA,
        maxTokens:3200,
        profile:'draft_scan',
        timeoutMs:50000,
      })
      const scanResult = {
        ...result,
        findings:(result.findings || []).slice(0, 5).map(finding => ({
          ...finding,
          possibilities:(finding.possibilities || []).slice(0, 2),
          evidence:(finding.evidence || []).slice(0, 2),
        })),
        resolved_issue_ids:(result.resolved_issue_ids || []).slice(0, 100),
      }
      const nextLedger = mergeIssueLedger({
        previousLedger:draftIssueLedger,
        scanResult,
        memory:currentMemory,
        draftText:scriptText,
        reviewedDecisions:activeDecisions,
      })
      persistIssueLedger(nextLedger)
      setDraftIssueLedger(nextLedger)
      setReview(issueLedgerReview(nextLedger, {
        cached:false,
        scanMode:incremental ? 'incremental' : 'initial',
        changedSceneCount:incremental ? changedCount : currentMemory.sceneCount,
      }))
    } catch (error) { setMessage('Draft scan failed: ' + error.message) }
    setAiBusy('')
  }

  function jumpToDraftEvidence(evidence) {
    const range = findEvidenceRange(editor, evidence)
    if (!range) {
      setMessage(`Could not locate that exact text${evidence?.location ? ` in ${evidence.location}` : ''}.`)
      return
    }
    setReview(null)
    requestAnimationFrame(() => {
      editor.chain().focus().setTextSelection({ from:range.from, to:range.to }).scrollIntoView().run()
      setMessage(`Jumped to ${evidence.location || 'the cited text'}.`)
    })
  }

  async function confirmScan() {
    if (!review?.shift_detected || review.type !== 'relationship_shift' || !review.charA || !review.charB) return setReview(null)
    let relationship = relationships.find(item =>
      (item.character_a === review.charA.id && item.character_b === review.charB.id) ||
      (item.character_a === review.charB.id && item.character_b === review.charA.id)
    )
    if (!relationship) relationship = await onCreateRelationship?.(review.charA.id, review.charB.id)
    if (!relationship) return setMessage('Could not create this relationship.')
    const tension = Math.max(0, Math.min(100, Math.round(review.proposed_tension || 0)))
    await onUpdateRelationship(relationship.id, { type:review.proposed_type, tension, ai_reasoning:(review.reasoning || []).join('\n') })
    await onCreateRelationshipEvent?.(relationship.id, {
      sequence_index:Math.max(0, ...relationshipEvents.map(event => event.sequence_index || 0)) + 1,
      segment_type:'scene',
      segment_label:review.segment_label || currentParagraph(editor).text || 'Writer-selected scan',
      relationship_type:review.proposed_type,
      tension,
      summary:review.summary,
      evidence:review.evidence,
      source:review.scope === 'scene' ? 'scene_scan' : 'draft_scan',
    })
    setReview(null)
    setMessage('Relationship update confirmed and added to the timeline.')
  }

  const sceneText = currentSceneText(editor)
  const sceneCharacters = characters.filter(character => sceneText.toLowerCase().includes(character.name.toLowerCase()))
  const showFirstReadBanner = script?.content && characters.length === 0 && !firstReadDismissed && !showFirstRead

  return (
    <div className="screenplay-workspace">
      {showFirstRead && script?.content && (
        <FirstRead
          scriptText={documentToPlainText(editor?.getJSON())}
          format={project.format}
          projectId={project.id}
          onComplete={async () => { setShowFirstRead(false); await onReload?.() }}
          onCancel={() => { setShowFirstRead(false); setFirstReadDismissed(true) }}
        />
      )}

      <aside className="screenplay-scenes">
        <div className="screenplay-panel-title">Scenes</div>
        <div className="screenplay-scene-list">
          {outline.length === 0 && <div className="screenplay-empty">Scene headings appear here.</div>}
          {outline.map(scene => (
            <button key={`${scene.pos}-${scene.label}`} onClick={() => jumpToScene(scene)}>
              <span>{scene.number}</span>{scene.label}
            </button>
          ))}
        </div>
      </aside>

      <section className="screenplay-main">
        <div className="screenplay-toolbar no-print">
          <span className="screenplay-studio-version">Studio 0.4.1</span>
          <input
            className="screenplay-title-input"
            value={title}
            onChange={event => {
              const value = event.target.value
              setTitle(value)
              titleRef.current = value
              queueSave(editor, value)
            }}
            placeholder="Script title"
          />
          <select value={activeType} onChange={event => setElement(event.target.value)} aria-label="Screenplay element">
            {SCREENPLAY_ELEMENT_ORDER.map(type => <option key={type} value={type}>{SCREENPLAY_ELEMENTS[type].label}</option>)}
          </select>
          <button onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} title="Undo">↶</button>
          <button onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} title="Redo">↷</button>
          <button onClick={() => setSearchOpen(value => !value)}>Find</button>
          <button onClick={() => setTitlePageOpen(true)}>Title Page</button>
          <button onClick={saveNamedVersion}>Save Version</button>
          <button onClick={() => setVersionsOpen(true)}>Versions</button>
          <div className="screenplay-file-menu">
            <button onClick={() => setFileMenuOpen(value => !value)}>File ▾</button>
            {fileMenuOpen && (
              <div>
                <button onClick={() => importRef.current?.click()}>Import FDX/TXT</button>
                <button onClick={() => exportFile('fdx')}>Export FDX</button>
                <button onClick={() => exportFile('txt')}>Export TXT</button>
                <button onClick={() => exportFile('pdf')}>Print / Save PDF</button>
              </div>
            )}
          </div>
          <input ref={importRef} type="file" accept=".fdx,.txt,text/plain,application/xml" onChange={importScript} hidden />
          <span className={`screenplay-save-state ${saveState}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Save failed' : 'Saved'}</span>
        </div>

        <div className="screenplay-review-toolbar no-print">
          <span>{stats.words.toLocaleString()} words · {stats.pages} page{stats.pages === 1 ? '' : 's'}</span>
          <em className={`screenplay-memory-state ${storyMemoryState.status}`}>
            {storyMemoryState.status === 'updating'
              ? 'Story Memory updating…'
              : `Story Memory ready · ${storyMemoryState.scenes} scene${storyMemoryState.scenes === 1 ? '' : 's'}`}
          </em>
          <button onClick={runPressureTest} disabled={!!aiBusy || !selectedText(editor)}>Pressure Test</button>
          <button onClick={runSceneScan} disabled={!!aiBusy}>Scan Scene</button>
          <button onClick={runDraftScan} disabled={!!aiBusy}>Scan Draft</button>
          <button onClick={() => setXrayOpen(value => !value)} className={xrayOpen ? 'active' : ''}>X-Ray</button>
          {aiBusy && <b>{aiBusy}{aiElapsed ? ` · ${aiElapsed}s` : ''}…</b>}
        </div>

        {searchOpen && (
          <div className="screenplay-search no-print">
            <input value={findText} onChange={event => setFindText(event.target.value)} placeholder="Find" autoFocus onKeyDown={event => { if (event.key === 'Enter') findNext() }} />
            <input value={replaceText} onChange={event => setReplaceText(event.target.value)} placeholder="Replace with" />
            <button onClick={findNext}>Next</button>
            <button onClick={replaceCurrent}>Replace</button>
            <button onClick={replaceAll}>Replace all</button>
            <button onClick={() => setSearchOpen(false)}>✕</button>
          </div>
        )}

        {showFirstReadBanner && (
          <div className="screenplay-first-read no-print">
            <span>First Read can propose characters, relationships and timeline events for your review.</span>
            <button onClick={() => setShowFirstRead(true)}>Start First Read</button>
            <button onClick={() => setFirstReadDismissed(true)}>Dismiss</button>
          </div>
        )}

        {suggestions.length > 0 && editor?.isFocused && (
          <div className="screenplay-suggestions no-print">
            <span>{SCREENPLAY_ELEMENTS[activeType]?.label} suggestions</span>
            {suggestions.map((suggestion, index) => (
              <button key={suggestion} className={index === suggestionIndex ? 'active' : ''} onMouseDown={event => { event.preventDefault(); acceptSuggestion(suggestion) }}>
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {message && <div className="screenplay-message no-print"><span>{message}</span><button onClick={() => setMessage('')}>✕</button></div>}

        <div className="screenplay-scroll">
          <section className="screenplay-print-title">
            <h1>{titlePage.title || title}</h1>
            <p>Written by</p>
            <h2>{titlePage.author || ''}</h2>
            <div>{titlePage.contact || ''}</div>
            <footer>{titlePage.draftDate || ''}</footer>
          </section>
          <article className="screenplay-page">
            <EditorContent editor={editor} />
          </article>
        </div>
      </section>

      {xrayOpen && (
        <aside className="screenplay-xray no-print">
          <div className="screenplay-panel-title">X-Ray · Current Scene</div>
          {sceneCharacters.length === 0 && <div className="screenplay-empty">No Story Bible characters detected in this scene.</div>}
          {sceneCharacters.map(character => (
            <div key={character.id} className="screenplay-xray-card">
              <div><i style={{ background:character.color }} /> <b>{character.name}</b></div>
              {character.goals && <p><strong>Wants:</strong> {character.goals}</p>}
              {character.fears && <p><strong>Fears:</strong> {character.fears}</p>}
              {character.voice && <p><strong>Voice:</strong> {character.voice}</p>}
            </div>
          ))}
        </aside>
      )}

      {review && (
        <Modal title={review.kind === 'pressure' ? `Pressure Test · ${review.character?.name}` : review.kind === 'draft' ? 'Draft integrity review' : 'Story-integrity review'} onClose={() => setReview(null)} wide={review.kind === 'draft'}>
          {review.kind === 'pressure' ? (
            <>
              <ReviewVerdict verdict={review.verdict} summary={review.summary} />
              <Evidence evidence={review.evidence} />
              {review.question && <p className="screenplay-question"><b>Question:</b> {review.question}</p>}
              {(review.notes || []).map((note, index) => <p key={index}><b>{note.type}:</b> {note.text}</p>)}
            </>
          ) : review.kind === 'draft' ? (
            <DraftReview
              review={review}
              onDismiss={dismissDraftFinding}
              onRestore={restoreDraftFinding}
              onClearDecisions={clearDraftFindingDecisions}
              onJump={jumpToDraftEvidence}
            />
          ) : review.shift_detected ? (
            <>
              <ReviewVerdict verdict="question" summary={review.summary} />
              <Evidence evidence={review.evidence} />
              {review.question && <p className="screenplay-question"><b>Question:</b> {review.question}</p>}
              {(review.reasoning || []).map((reason, index) => <p key={index}>{index + 1}. {reason}</p>)}
              {review.type === 'relationship_shift' && review.charA && review.charB && (
                <div className="screenplay-confirm-row">
                  <span>{review.charA.name} &amp; {review.charB.name}: {review.proposed_type} · {Math.round(review.proposed_tension || 0)}/100</span>
                  <button className="btn btn-gold" onClick={confirmScan}>Confirm update</button>
                </div>
              )}
            </>
          ) : <ReviewVerdict verdict="pass" summary="No meaningful story-integrity concern was found in this selection." />}
        </Modal>
      )}

      {titlePageOpen && (
        <Modal title="Title Page" onClose={() => setTitlePageOpen(false)}>
          <div className="screenplay-modal-fields">
            <label>Title<input value={titlePage.title || ''} onChange={event => setTitlePage(value => ({ ...value, title:event.target.value }))} /></label>
            <label>Written by<input value={titlePage.author || ''} onChange={event => setTitlePage(value => ({ ...value, author:event.target.value }))} /></label>
            <label>Contact<textarea rows={3} value={titlePage.contact || ''} onChange={event => setTitlePage(value => ({ ...value, contact:event.target.value }))} /></label>
            <label>Draft date<input value={titlePage.draftDate || ''} onChange={event => setTitlePage(value => ({ ...value, draftDate:event.target.value }))} /></label>
            <button className="btn btn-gold" onClick={() => { titlePageRef.current = titlePage; queueSave(editor, titleRef.current, titlePage); setTitlePageOpen(false) }}>Save title page</button>
          </div>
        </Modal>
      )}

      {versionsOpen && (
        <Modal title="Version History" onClose={() => setVersionsOpen(false)}>
          {scriptVersions.length === 0 && <div className="screenplay-empty">No named versions saved yet.</div>}
          <div className="screenplay-version-list">
            {scriptVersions.map(version => (
              <button key={version.id} onClick={() => restoreVersion(version)}>
                <b>{version.label}</b><span>{new Date(version.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function DraftReview({ review, onDismiss, onRestore, onClearDecisions, onJump }) {
  const [showReviewed, setShowReviewed] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const activeFindings = review.findings.filter(finding => !finding.status || finding.status === 'open')
  const reviewedFindings = review.findings.filter(finding => finding.status === 'dismissed')
  const resolvedFindings = review.findings.filter(finding => finding.status === 'resolved')
  const scanLabel = review.scanMode === 'saved'
    ? 'Saved review · screenplay unchanged'
    : review.scanMode === 'incremental'
      ? `Story Memory checked ${review.changedSceneCount} changed scene${review.changedSceneCount === 1 ? '' : 's'}`
      : 'Story Memory baseline created from the complete draft'

  if (review.findings.length === 0) {
    return <ReviewVerdict verdict="pass" summary={review.overall || 'No meaningful story-integrity concern was found in this draft.'} />
  }

  return (
    <>
      <div className="screenplay-draft-summary">
        <b>{activeFindings.length === 0 ? 'All returned questions have been reviewed' : `${activeFindings.length} question${activeFindings.length === 1 ? '' : 's'} to review`}</b>
        <span>{review.overall || 'Anchor compared the complete draft with the confirmed Story Bible.'}</span>
        <small className="screenplay-scan-source">{scanLabel}</small>
        <small>Review only — nothing here changes your Story Bible. Decisions apply only to the cited evidence.</small>
      </div>
      <div className="screenplay-draft-findings">
        {activeFindings.map(finding => (
          <DraftFindingCard finding={finding} key={finding.id || finding.fingerprint} onDismiss={onDismiss} onJump={onJump} />
        ))}
      </div>
      {reviewedFindings.length > 0 && (
        <div className="screenplay-reviewed-findings">
          <button onClick={() => setShowReviewed(value => !value)}>
            {showReviewed ? 'Hide' : 'Show'} reviewed findings ({reviewedFindings.length})
          </button>
          {showReviewed && (
            <div className="screenplay-draft-findings">
              {reviewedFindings.map(finding => (
                <DraftFindingCard finding={finding} key={finding.id || finding.fingerprint} reviewed onRestore={onRestore} onJump={onJump} />
              ))}
            </div>
          )}
        </div>
      )}
      {resolvedFindings.length > 0 && (
        <div className="screenplay-reviewed-findings">
          <button onClick={() => setShowResolved(value => !value)}>
            {showResolved ? 'Hide' : 'Show'} resolved findings ({resolvedFindings.length})
          </button>
          {showResolved && (
            <div className="screenplay-draft-findings">
              {resolvedFindings.map(finding => (
                <DraftFindingCard finding={finding} key={finding.id || finding.fingerprint} resolved onJump={onJump} />
              ))}
            </div>
          )}
        </div>
      )}
      {reviewedFindings.length > 0 && (
        <button className="screenplay-reset-decisions" onClick={onClearDecisions}>Reset all “Not a problem” decisions</button>
      )}
    </>
  )
}

function DraftFindingCard({ finding, reviewed = false, resolved = false, onDismiss, onRestore, onJump }) {
  return (
    <article className={`screenplay-draft-finding${reviewed ? ' reviewed' : ''}${resolved ? ' resolved' : ''}`}>
      <header>
        <span>{DRAFT_CATEGORY_LABELS[finding.category] || finding.category}</span>
        <i className={`priority-${finding.priority}`}>{finding.priority}</i>
      </header>
      <h3>{finding.title}</h3>
      <p>{finding.summary}</p>
      {(finding.evidence || []).slice(0, 2).map((item, evidenceIndex) => (
        <blockquote className="screenplay-evidence" key={evidenceIndex}>
          “{item.quote}”
          {item.location && <cite>{item.location}</cite>}
          <button onClick={() => onJump(item)}>Go to text →</button>
        </blockquote>
      ))}
      {finding.question && <p className="screenplay-question"><b>Question:</b> {finding.question}</p>}
      {(finding.possibilities || []).length > 0 && (
        <details className="screenplay-possibilities">
          <summary>Possible interpretations ({Math.min(finding.possibilities.length, 2)})</summary>
          <ul>{finding.possibilities.slice(0, 2).map((item, index) => <li key={index}>{item}</li>)}</ul>
        </details>
      )}
      <div className="screenplay-finding-actions">
        {resolved
          ? <span>Resolved because the supporting evidence changed or was removed.</span>
          : reviewed
            ? <button onClick={() => onRestore(finding.id)}>Restore question</button>
            : <button onClick={() => onDismiss(finding)}>✓ Not a problem</button>}
        {!resolved && <span>{reviewed ? 'Anchor will ignore this underlying evidence conflict.' : 'Keep this issue dismissed unless its evidence materially changes.'}</span>}
      </div>
    </article>
  )
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="screenplay-modal-backdrop no-print" onMouseDown={onClose}>
      <section className={`screenplay-modal${wide ? ' screenplay-modal-wide' : ''}`} onMouseDown={event => event.stopPropagation()}>
        <header><h2>{title}</h2><button onClick={onClose}>✕</button></header>
        <div>{children}</div>
      </section>
    </div>
  )
}

function ReviewVerdict({ verdict, summary }) {
  return <div className={`screenplay-verdict ${verdict || 'question'}`}><b>{verdict === 'pass' ? 'Pass' : verdict === 'concern' ? 'Possible concern' : 'Question'}</b><span>{summary}</span></div>
}

function Evidence({ evidence }) {
  return evidence ? <blockquote className="screenplay-evidence">“{evidence}”</blockquote> : null
}
