'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { callAI, buildPressureTestPrompt, buildRelationshipScanPrompt } from '../../lib/ai'
import FirstRead from '../bible/FirstRead'

// ── Block types ────────────────────────────────────────────────
const BLOCKS = {
  scene:         { label: 'Scene Heading', hint: 'INT. LOCATION — DAY',      upper: true,  shortcut: 'Ctrl+1' },
  action:        { label: 'Action',        hint: 'Describe what we see…',    upper: false, shortcut: 'Ctrl+2' },
  character:     { label: 'Character',     hint: 'CHARACTER NAME',            upper: true,  shortcut: 'Ctrl+3' },
  dialogue:      { label: 'Dialogue',      hint: 'What they say…',           upper: false, shortcut: 'Ctrl+4' },
  parenthetical: { label: 'Parenthetical', hint: '(beat)',                    upper: false, shortcut: 'Ctrl+5' },
  transition:    { label: 'Transition',    hint: 'CUT TO:',                   upper: true,  shortcut: 'Ctrl+6' },
  shot:          { label: 'Shot',          hint: 'CLOSE ON — DETAIL',         upper: true,  shortcut: 'Ctrl+7' },
  text:          { label: 'Text',          hint: 'General text or notes…',    upper: false, shortcut: 'Ctrl+8' },
}
const TAB_CYCLE    = Object.keys(BLOCKS)
const SHORTCUT_MAP = { '1':'scene','2':'action','3':'character','4':'dialogue','5':'parenthetical','6':'transition','7':'shot','8':'text' }

const BLOCK_LINES = { scene:2, action:1.5, character:1, dialogue:1.2, parenthetical:1, transition:1, shot:1, text:1 }
const LINES_PER_PAGE = 54

function uid() { return Math.random().toString(36).slice(2,9) + Date.now().toString(36) }
function makeBlock(type='action', text='') { return { id: uid(), type, text } }
function smartNext(type) {
  if (type === 'character' || type === 'parenthetical') return 'dialogue'
  if (type === 'dialogue') return 'character'
  return 'action'
}

function serialize(blocks)   { return blocks.map(b => `[${b.type}]${b.text}`).join('\n') }
function deserialize(content) {
  if (!content) return [makeBlock('scene')]
  if (!content.includes('[')) return [makeBlock('action', content)]
  return content.split('\n').map(line => {
    const m = line.match(/^\[(\w+)\](.*)$/)
    return m && BLOCKS[m[1]] ? makeBlock(m[1], m[2]) : makeBlock('action', line)
  })
}

function estimateLines(block) {
  const textLines = block.text ? Math.max(1, Math.ceil(block.text.length / 60)) : 1
  return (BLOCK_LINES[block.type] || 1) * textLines
}

function paginateBlocks(blocks) {
  const pages = []
  let current = []
  let lineCount = 0
  for (const block of blocks) {
    const lines = estimateLines(block)
    if (lineCount + lines > LINES_PER_PAGE && current.length > 0) {
      pages.push(current)
      current = []
      lineCount = 0
    }
    current.push(block)
    lineCount += lines
  }
  if (current.length > 0) pages.push(current)
  return pages.length > 0 ? pages : [[]]
}

function getBlockCSS(type) {
  const base = {
    fontFamily: "'Courier Prime', 'Courier New', monospace",
    fontSize: '13px', lineHeight: '1.8', color: '#111',
    outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    minHeight: '1.8em', width: '100%', display: 'block', cursor: 'text',
  }
  switch (type) {
    case 'scene':         return { ...base, fontWeight:'700', marginTop:'22px', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'.02em' }
    case 'action':        return { ...base, marginBottom:'8px' }
    case 'character':     return { ...base, fontWeight:'700', marginTop:'16px', marginBottom:'0', marginLeft:'37%', width:'26%', textTransform:'uppercase' }
    case 'dialogue':      return { ...base, marginLeft:'22%', width:'56%', marginBottom:'4px' }
    case 'parenthetical': return { ...base, marginLeft:'30%', width:'40%', fontStyle:'italic' }
    case 'transition':    return { ...base, textAlign:'right', fontWeight:'700', marginTop:'12px', textTransform:'uppercase' }
    case 'shot':          return { ...base, fontWeight:'700', marginTop:'14px', marginBottom:'2px', textTransform:'uppercase', letterSpacing:'.01em' }
    case 'text':          return { ...base, marginBottom:'6px', color:'#444', fontStyle:'italic' }
    default:              return base
  }
}

function getSelectedText() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return ''
  return sel.toString().trim()
}

// Get all selected block ids from the DOM selection
function getSelectedBlockIds(sel, refs) {
  if (!sel || sel.isCollapsed) return []
  const ids = []
  for (const [id, el] of Object.entries(refs.current)) {
    if (!el) continue
    if (sel.containsNode(el, true)) ids.push(id)
  }
  return ids
}

function detectCharsInScene(blocks, characters) {
  const text = blocks.map(b => b.text.toUpperCase()).join(' ')
  return characters.filter(c => c.name && text.includes(c.name.toUpperCase()))
}

const VERDICT_STYLE = {
  pass:     { color:'#3FB950', bg:'rgba(63,185,80,.08)',  border:'rgba(63,185,80,.2)',  icon:'✓', label:'In voice'         },
  tension:  { color:'#FFA657', bg:'rgba(255,166,87,.08)', border:'rgba(255,166,87,.2)', icon:'⚠', label:'Some tension'     },
  conflict: { color:'#F85149', bg:'rgba(248,81,73,.08)',  border:'rgba(248,81,73,.2)',  icon:'✕', label:'Conflict detected' },
}

export default function WritingEditor({ project, script, characters, relationships, locations, onSaveScript, onUpdateRelationship }) {
  const [blocks, setBlocks]         = useState([makeBlock('scene')])
  const [title, setTitle]           = useState('')
  const [focusId, setFocusId]       = useState(null)
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState(null)
  const [xrayOpen, setXrayOpen]     = useState(true)
  const [xrayExpanded, setExpanded] = useState({})
  const [dropdownOpen, setDropdown] = useState(false)

  // Pressure test
  const [ptCard, setPtCard]       = useState(null)
  const [contextMenu, setCtxMenu] = useState(null)

  // Living bible
  const [whisper, setWhisper]     = useState(null)
  const [whyOpen, setWhyOpen]     = useState(false)
  const [aiReading, setAiReading] = useState(false)

  // First Read
  const [showFirstRead, setShowFirstRead]           = useState(false)
  const [firstReadDismissed, setFirstReadDismissed] = useState(false)

  const refs      = useRef({})   // blockId → contentEditable DOM el
  const blocksRef = useRef(blocks) // always-current blocks for event handlers
  const saveTimer = useRef(null)
  const scanTimer = useRef(null)
  const scrollRef = useRef(null)

  // Keep blocksRef in sync
  useEffect(() => { blocksRef.current = blocks }, [blocks])

  // Load script
  useEffect(() => {
    if (script) {
      const parsed = deserialize(script.content)
      setBlocks(parsed)
      setTitle(script.title || project.title)
      // Sync DOM after render
      setTimeout(() => {
        for (const b of parsed) {
          const el = refs.current[b.id]
          if (el && el.innerText !== b.text) el.innerText = b.text
        }
      }, 50)
    }
  }, [script?.id])

  // Auto-save
  const scheduleAutoSave = useCallback((newBlocks, newTitle) => {
    setSaveMsg(null); setSaving(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await onSaveScript(serialize(newBlocks), newTitle)
      setSaving(false); setSaveMsg('saved')
      setTimeout(() => setSaveMsg(null), 3000)
    }, 900)
  }, [onSaveScript])

  // Living bible scan
  const scheduleLivingScan = useCallback((newBlocks) => {
    clearTimeout(scanTimer.current)
    scanTimer.current = setTimeout(() => runLivingScan(newBlocks), 4000)
  }, [characters, relationships])

  async function runLivingScan(currentBlocks) {
    if (characters.length < 2) return
    setAiReading(true)
    try {
      const recentText = currentBlocks.slice(-12).map(b => b.text).filter(Boolean).join('\n')
      if (recentText.trim().length < 80) return
      const { systemPrompt, prompt } = buildRelationshipScanPrompt({ scriptChunk: recentText, characters, relationships })
      const raw = await callAI({ systemPrompt, prompt })
      console.log('Living Bible raw:', raw.slice(0, 200))
      const jsonMatch = raw.match(/\{[\s\S]*\}/); if (!jsonMatch) return; const result = JSON.parse(jsonMatch[0])
      if (result.shift_detected) {
        const charA = characters.find(c => c.name === result.character_a)
        const charB = characters.find(c => c.name === result.character_b)
        if (!charA || !charB) return
        const existingRel = relationships.find(r =>
          (r.character_a === charA.id && r.character_b === charB.id) ||
          (r.character_a === charB.id && r.character_b === charA.id)
        )
        setWhisper({
          relId: existingRel?.id || null,
          charAId: charA.id, charBId: charB.id,
          charAName: result.character_a, charBName: result.character_b,
          proposedType: result.proposed_type,
          proposedTension: result.proposed_tension,
          reasoning: result.reasoning || [],
          summary: result.summary,
        })
      }
    } catch (e) { console.error('Living Bible scan error:', e.message) }
    finally { setAiReading(false) }
  }

  function push(newBlocks, newTitle) {
    setBlocks(newBlocks)
    scheduleAutoSave(newBlocks, newTitle ?? title)
    scheduleLivingScan(newBlocks)
  }

  // ── contentEditable handlers ────────────────────────────────

  function handleInput(e, block) {
    const el   = e.currentTarget
    let text   = el.innerText
    // Strip any HTML that might sneak in
    if (BLOCKS[block.type]?.upper) text = text.toUpperCase()
    // Don't re-render if text unchanged (avoids cursor jump)
    const current = blocksRef.current
    const updated = current.map(b => b.id === block.id ? { ...b, text } : b)
    blocksRef.current = updated
    setBlocks(updated)
    scheduleAutoSave(updated, title)
    scheduleLivingScan(updated)
  }

  function handleKeyDown(e, block) {
    // Ctrl/Cmd + 1–8 shortcut
    if ((e.ctrlKey || e.metaKey) && SHORTCUT_MAP[e.key]) {
      e.preventDefault()
      changeType(block.id, SHORTCUT_MAP[e.key])
      return
    }

    // Tab → cycle block type
    if (e.key === 'Tab') {
      e.preventDefault()
      changeType(block.id, TAB_CYCLE[(TAB_CYCLE.indexOf(block.type)+1) % TAB_CYCLE.length])
      return
    }

    // Enter → insert new block
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const nextType = smartNext(block.type)
      const nb = makeBlock(nextType)
      const current = blocksRef.current
      const idx = current.findIndex(b => b.id === block.id)
      const updated = [...current.slice(0, idx+1), nb, ...current.slice(idx+1)]
      push(updated)
      setTimeout(() => {
        const el = refs.current[nb.id]
        if (el) { el.focus(); placeCaretAtStart(el) }
      }, 30)
      return
    }

    // Backspace on empty block → delete it
    if (e.key === 'Backspace') {
      const el = e.currentTarget
      if (el.innerText === '' || el.innerText === '\n') {
        e.preventDefault()
        const current = blocksRef.current
        if (current.length === 1) return
        const idx = current.findIndex(b => b.id === block.id)
        const updated = current.filter(b => b.id !== block.id)
        push(updated)
        setTimeout(() => {
          const prevId = updated[Math.max(0, idx-1)]?.id
          const prevEl = refs.current[prevId]
          if (prevEl) { prevEl.focus(); placeCaretAtEnd(prevEl) }
        }, 30)
      }
      return
    }

    if (contextMenu) setCtxMenu(null)
    if (dropdownOpen) setDropdown(false)
  }

  function changeType(id, type) {
    const current = blocksRef.current
    const block   = current.find(b => b.id === id)
    if (!block) return
    const meta    = BLOCKS[type]
    const newText = meta.upper ? block.text.toUpperCase() : block.text
    const updated = current.map(b => b.id === id ? { ...b, type, text: newText } : b)
    push(updated)
    setDropdown(false)
    // Update DOM text if case changed
    setTimeout(() => {
      const el = refs.current[id]
      if (el && el.innerText !== newText) {
        el.innerText = newText
        placeCaretAtEnd(el)
      }
      el?.focus()
    }, 20)
  }

  // Right-click: capture cross-block selection
  function handleContextMenu(e) {
    const selectedText = getSelectedText()
    if (!selectedText) return
    e.preventDefault()
    const scrollRect = scrollRef.current?.getBoundingClientRect()
    // Gather surrounding context from all blocks
    const surrounding = blocksRef.current.map(b => b.text).join('\n')
    // Find which block the anchor node is in
    const sel     = window.getSelection()
    let blockId   = null
    if (sel?.anchorNode) {
      for (const [id, el] of Object.entries(refs.current)) {
        if (el && el.contains(sel.anchorNode)) { blockId = id; break }
      }
    }
    setCtxMenu({
      x: e.clientX - (scrollRect?.left || 0),
      y: e.clientY - (scrollRect?.top  || 0) + (scrollRef.current?.scrollTop || 0),
      blockId,
      selectedText,
      surroundingContext: surrounding,
    })
    setPtCard(null)
  }

  async function runPressureTest() {
    if (!contextMenu) return
    // Find character context
    const current    = blocksRef.current
    const blockIdx   = contextMenu.blockId ? current.findIndex(b => b.id === contextMenu.blockId) : 0
    const preceding  = current.slice(Math.max(0, blockIdx-5), blockIdx)
    const charBlock  = [...preceding].reverse().find(b => b.type === 'character')
    const character  = characters.find(c => charBlock && c.name.toUpperCase() === charBlock.text.trim()) || characters[0]
    if (!character) { alert('Add characters to your story bible first.'); return }
    const sceneChars = detectCharsInScene(current.slice(Math.max(0, blockIdx-8), blockIdx+2), characters).filter(c => c.id !== character.id)
    const otherChar  = sceneChars[0] || null
    const rel        = otherChar ? relationships.find(r =>
      (r.character_a === character.id && r.character_b === otherChar.id) ||
      (r.character_a === otherChar.id && r.character_b === character.id)
    ) : null
    setCtxMenu(null)
    setPtCard({ loading:true, verdict:null, summary:'', notes:[], character, otherChar, rel })
    try {
      const { systemPrompt, prompt } = buildPressureTestPrompt({
        character, selectedText: contextMenu.selectedText,
        surroundingContext: contextMenu.surroundingContext,
        relationship: rel, otherCharacter: otherChar,
      })
      const raw    = await callAI({ systemPrompt, prompt })
      const jsonMatch = raw.match(/\{[\s\S]*\}/); if (!jsonMatch) return; const result = JSON.parse(jsonMatch[0])
      setPtCard({ loading:false, ...result, character, otherChar, rel })
    } catch (err) {
      setPtCard({ loading:false, verdict:'tension', summary:err.message, notes:[], character, otherChar, rel })
    }
  }

  async function confirmWhisperUpdate() {
    if (!whisper) return
    const patch = { type:whisper.proposedType, tension:whisper.proposedTension, ai_reasoning:whisper.reasoning.join('\n') }
    if (whisper.relId) await onUpdateRelationship(whisper.relId, patch)
    setWhisper(null); setWhyOpen(false)
  }

  const focusedBlock = blocks.find(b => b.id === focusId)
  const pages        = paginateBlocks(blocks)
  const words        = blocks.reduce((n,b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0)
  const showBanner   = script?.content && characters.length === 0 && !firstReadDismissed && !showFirstRead
  const activePage   = pages[activePageIdx] || pages[0] || []
  const sceneChars   = detectCharsInScene(activePage, characters)

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* ── First Read overlay ── */}
      {showFirstRead && script?.content && (
        <FirstRead
          scriptText={script.content.replace(/\[\w+\]/g, '')}
          format={project.format}
          projectId={project.id}
          onComplete={() => { setShowFirstRead(false); window.location.reload() }}
          onCancel={() => { setShowFirstRead(false); setFirstReadDismissed(true) }}
        />
      )}

      {/* ── Editor column ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 16px', borderBottom:'1px solid var(--edge)', background:'var(--s1)', flexShrink:0 }}>
          <input value={title}
            onChange={e => { setTitle(e.target.value); scheduleAutoSave(blocks, e.target.value) }}
            style={{ background:'none', border:'none', fontSize:13, fontWeight:500, color:'var(--text)', width:180, padding:'2px 4px', borderRadius:4, fontFamily:'var(--font-ui)' }}
            onFocus={e => e.target.style.background='var(--edge)'}
            onBlur={e => e.target.style.background='none'}
            placeholder="Script title…" spellCheck={false}
          />
          <div style={{ width:1, height:16, background:'var(--edge)' }} />

          {/* Block type dropdown */}
          <div style={{ position:'relative' }}>
            <button
              onClick={() => setDropdown(v => !v)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:5, fontSize:12, fontWeight:500, background:dropdownOpen?'var(--s3)':'var(--s2)', color:'var(--text)', border:'1px solid var(--edge)', cursor:'pointer', fontFamily:'var(--font-ui)', minWidth:150 }}
            >
              <span style={{ flex:1, textAlign:'left' }}>{focusedBlock ? BLOCKS[focusedBlock.type]?.label : 'Block type'}</span>
              <span style={{ fontSize:9, color:'var(--dim)' }}>▾</span>
            </button>
            {dropdownOpen && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:80, background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:8, overflow:'hidden', minWidth:230, boxShadow:'0 8px 32px rgba(0,0,0,.6)' }}>
                <div style={{ padding:'6px 12px 4px', fontSize:9, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'.08em', borderBottom:'1px solid var(--edge)', fontWeight:500 }}>Tab to cycle · Ctrl+1–8</div>
                {Object.entries(BLOCKS).map(([type, { label, shortcut }]) => {
                  const active = focusedBlock?.type === type
                  return (
                    <button key={type}
                      onMouseDown={e => { e.preventDefault(); if (focusId) changeType(focusId, type) }}
                      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'8px 12px', fontSize:12, cursor:'pointer', background:active?'var(--gold-bg)':'transparent', color:active?'var(--gold)':'var(--text)', border:'none', fontFamily:'var(--font-ui)', textAlign:'left' }}
                    >
                      <span>{label}</span>
                      <span style={{ fontSize:10, color:'var(--dim)', fontWeight:300 }}>{shortcut}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
            {saving
              ? <span style={{ fontSize:11, color:'var(--gold)', display:'flex', alignItems:'center', gap:5 }}><Spinner/> Saving…</span>
              : saveMsg === 'saved'
                ? <span style={{ fontSize:11, color:'var(--gold)', fontWeight:300 }}>✓ Saved</span>
                : <span style={{ fontSize:11, color:'var(--dim)', fontWeight:300 }}>Auto-saves</span>
            }
            <span style={{ fontSize:11, color:'var(--dim)', fontWeight:300, borderLeft:'1px solid var(--edge)', paddingLeft:10 }}>
              {words.toLocaleString()} words · {pages.length}p
            </span>
            <button onClick={() => setXrayOpen(v => !v)} style={{ fontSize:11, padding:'3px 9px', borderRadius:5, background:xrayOpen?'var(--gold-bg)':'transparent', color:xrayOpen?'var(--gold)':'var(--dim)', border:`1px solid ${xrayOpen?'rgba(200,169,106,.2)':'transparent'}`, cursor:'pointer', fontFamily:'var(--font-ui)' }}>
              X-Ray
            </button>
          </div>
        </div>

        {/* Hint bar */}
        <div style={{ padding:'3px 16px', background:'var(--bg)', borderBottom:'1px solid var(--edge)', flexShrink:0, fontSize:10, color:'var(--dim)', fontWeight:300 }}>
          <b style={{ color:'var(--muted)', fontWeight:500 }}>Ctrl+1–8</b> block type &nbsp;·&nbsp;
          <b style={{ color:'var(--muted)', fontWeight:500 }}>Tab</b> cycle &nbsp;·&nbsp;
          <b style={{ color:'var(--muted)', fontWeight:500 }}>Enter</b> new block &nbsp;·&nbsp;
          <b style={{ color:'var(--muted)', fontWeight:500 }}>Select + right-click</b> Pressure Test
        </div>

        {/* First Read banner */}
        {showBanner && (
          <div style={{ padding:'9px 16px', background:'rgba(200,169,106,.06)', borderBottom:'1px solid rgba(200,169,106,.15)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <div style={{ display:'flex', gap:3 }}><Dot/><Dot/><Dot/></div>
            <span style={{ fontSize:12, color:'var(--muted)', fontWeight:300, flex:1 }}>Anchor can read this script and build your story bible automatically</span>
            <button className="btn btn-gold" onClick={() => setShowFirstRead(true)} style={{ fontSize:11, padding:'4px 12px' }}>✦ First Read</button>
            <button onClick={() => setFirstReadDismissed(true)} style={{ fontSize:11, color:'var(--dim)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-ui)' }}>✕</button>
          </div>
        )}

        {/* Script scroll area */}
        <div
          ref={scrollRef}
          style={{ flex:1, overflow:'auto', padding:'32px 24px 120px', background:'#2A2A2A', position:'relative' }}
          onClick={() => { setCtxMenu(null); setDropdown(false) }}
          onContextMenu={handleContextMenu}
        >
          {pages.map((pageBlocks, pageIndex) => (
            <div key={pageIndex} style={{ maxWidth:680, margin:'0 auto' }}>
              <div style={{ textAlign:'right', fontSize:10, color:'#888', fontFamily:"'Courier Prime', monospace", marginBottom:4, paddingRight:4 }}>
                {pageIndex + 1}.
              </div>
              <div style={{
                background:'#F8F8F6', borderRadius:2,
                padding: project.format === 'screenplay' ? '52px 72px 60px' : '48px 60px 60px',
                minHeight:880, boxShadow:'0 4px 24px rgba(0,0,0,.5)',
                position:'relative', marginBottom:32,
              }}>
                {pageBlocks.map(block => (
                  <div
                    key={block.id}
                    ref={el => refs.current[block.id] = el}
                    contentEditable
                    suppressContentEditableWarning
                    data-block-id={block.id}
                    data-placeholder={BLOCKS[block.type]?.hint}
                    onInput={e => handleInput(e, block)}
                    onKeyDown={e => handleKeyDown(e, block)}
                    onFocus={() => { setFocusId(block.id); setDropdown(false); setActivePageIdx(pageIndex) }}
                    onBlur={() => setFocusId(id => id === block.id ? null : id)}
                    style={{
                      ...getBlockCSS(block.type),
                      borderLeft: focusId===block.id ? '2px solid rgba(200,169,106,.45)' : '2px solid transparent',
                      paddingLeft:'4px',
                      background: focusId===block.id ? 'rgba(200,169,106,.03)' : 'transparent',
                      transition:'background .1s',
                      position:'relative',
                    }}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Context menu */}
          {contextMenu && (
            <div onClick={e => e.stopPropagation()} style={{
              position:'absolute', left:Math.min(contextMenu.x, (scrollRef.current?.clientWidth||600)-210), top:contextMenu.y,
              zIndex:60, background:'rgba(8,8,13,.97)', backdropFilter:'blur(20px)',
              border:'1px solid rgba(255,255,255,.08)', borderRadius:8,
              padding:5, minWidth:200, boxShadow:'0 8px 40px rgba(0,0,0,.8)',
            }}>
              <button onClick={runPressureTest} style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 11px', borderRadius:5, fontSize:12, fontWeight:500, color:'var(--gold)', background:'var(--gold-bg)', border:'1px solid rgba(200,169,106,.18)', cursor:'pointer', fontFamily:'var(--font-ui)' }}>
                <span style={{ fontSize:11 }}>⚡</span> Pressure Test
              </button>
            </div>
          )}

          {/* Pressure test card */}
          {ptCard && (
            <div style={{ position:'sticky', bottom:80, zIndex:55, maxWidth:360, margin:'16px auto 0', pointerEvents:'auto' }}>
              <PressureTestCard card={ptCard} onClose={() => setPtCard(null)} />
            </div>
          )}

          {/* Whisper banner */}
          {whisper && !whyOpen && (
            <div className="whisper">
              <div style={{ display:'flex', gap:3 }}>
                <div className="breath-dot"/><div className="breath-dot"/><div className="breath-dot"/>
              </div>
              <div style={{ flex:1, fontSize:12, color:'var(--muted)', fontWeight:300 }}>
                <b style={{ color:'var(--text)', fontWeight:400 }}>{whisper.charAName} & {whisper.charBName}</b> — {whisper.summary}
              </div>
              <button onClick={() => setWhyOpen(true)} style={{ fontSize:11, color:'var(--muted)', border:'1px solid var(--edge)', borderRadius:4, padding:'3px 9px', cursor:'pointer', background:'none', fontFamily:'var(--font-ui)', flexShrink:0 }}>Why?</button>
              <button onClick={confirmWhisperUpdate} style={{ fontSize:11, fontWeight:500, color:'var(--bg)', background:'var(--gold)', border:'none', borderRadius:5, padding:'5px 12px', cursor:'pointer', fontFamily:'var(--font-ui)', flexShrink:0 }}>Confirm update</button>
              <button onClick={() => setWhisper(null)} style={{ fontSize:11, color:'var(--dim)', background:'none', border:'none', cursor:'pointer', fontFamily:'var(--font-ui)', flexShrink:0, fontWeight:300 }}>Dismiss</button>
            </div>
          )}

          {/* Why card */}
          {whisper && whyOpen && (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setWhyOpen(false)}>
              <WhyCard whisper={whisper} onConfirm={confirmWhisperUpdate} onEdit={() => setWhyOpen(false)} onClose={() => setWhyOpen(false)} />
            </div>
          )}
        </div>
      </div>

      {/* ── X-Ray Panel ── */}
      {xrayOpen && (
        <div style={{ width:240, flexShrink:0, background:'var(--s1)', borderLeft:'1px solid var(--edge)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--edge)', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, fontWeight:500, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.08em' }}>X-Ray</span>
            <span style={{ fontSize:10, color:'var(--dim)', fontWeight:300, flex:1 }}>characters in scene</span>
          </div>
          <div style={{ padding:'6px 14px 8px', borderBottom:'1px solid var(--edge)', background:aiReading?'rgba(200,169,106,.04)':'transparent', display:'flex', alignItems:'center', gap:7, transition:'background .3s' }}>
            <div style={{ display:'flex', gap:3 }}>
              <div className="breath-dot"/><div className="breath-dot"/><div className="breath-dot"/>
            </div>
            <span style={{ fontSize:10, color:'var(--gold)', fontWeight:300, opacity:.7 }}>
              {aiReading ? 'Reading your script…' : 'Watching your story'}
            </span>
          </div>
          <div style={{ flex:1, overflow:'auto', padding:'12px 14px' }}>
            {sceneChars.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:9, fontWeight:500, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>Detected ({sceneChars.length})</div>
                {sceneChars.map(c => <XRayChar key={c.id} char={c} relationships={relationships} characters={characters} expanded={!!xrayExpanded[c.id]} onToggle={() => setExpanded(x=>({...x,[c.id]:!x[c.id]}))} />)}
              </div>
            )}
            <div>
              <div style={{ fontSize:9, fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>All characters</div>
              {characters.length === 0
                ? <div style={{ fontSize:11, color:'var(--dim)', fontStyle:'italic', fontWeight:300 }}>Add characters in the Characters module</div>
                : characters.map(c => (
                    <XRayChar key={c.id} char={c} relationships={relationships} characters={characters}
                      expanded={!!xrayExpanded[c.id]}
                      onToggle={() => setExpanded(x=>({...x,[c.id]:!x[c.id]}))}
                      dimmed={sceneChars.length > 0 && !sceneChars.find(s => s.id === c.id)}
                    />
                  ))
              }
            </div>
            {locations.length > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:9, fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.1em', marginBottom:8 }}>Locations</div>
                {locations.map(l => (
                  <div key={l.id} style={{ padding:'6px 0', borderBottom:'1px solid var(--edge)' }}>
                    <div style={{ fontSize:12, color:'var(--text)', fontWeight:400 }}>{l.name}</div>
                    {l.atmosphere && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2, lineHeight:1.5, fontWeight:300 }}>{l.atmosphere.slice(0,70)}{l.atmosphere.length>70?'…':''}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Placeholder CSS injection ──────────────────────────────────
// Injected once at module level so contentEditable divs show hint text
if (typeof document !== 'undefined') {
  const styleId = 'anchor-editor-placeholders'
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style')
    s.id = styleId
    s.textContent = `
      [contenteditable][data-placeholder]:empty::before {
        content: attr(data-placeholder);
        color: #999;
        pointer-events: none;
        font-style: italic;
      }
    `
    document.head.appendChild(s)
  }
}

// ── Caret helpers ──────────────────────────────────────────────
function placeCaretAtEnd(el) {
  const range = document.createRange()
  const sel   = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function placeCaretAtStart(el) {
  const range = document.createRange()
  const sel   = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

// ── X-Ray character card ───────────────────────────────────────
function XRayChar({ char, relationships, characters, expanded, onToggle, dimmed }) {
  const rels = relationships.filter(r => r.character_a === char.id || r.character_b === char.id)
  return (
    <div style={{ marginBottom:4, opacity:dimmed?0.35:1, transition:'opacity .15s' }}>
      <div onClick={onToggle} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'1px solid var(--edge)', cursor:'pointer' }}>
        <div style={{ width:22, height:22, borderRadius:'50%', background:char.color+'18', border:`1px solid ${char.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:char.color, fontWeight:500, flexShrink:0 }}>
          {char.name?.charAt(0)}
        </div>
        <span style={{ fontSize:12, color:'var(--text)', fontWeight:400, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{char.name}</span>
        <span style={{ fontSize:9, color:'var(--dim)' }}>{expanded?'▾':'▸'}</span>
      </div>
      {expanded && (
        <div style={{ padding:'8px 0 4px 30px', fontSize:11, color:'var(--muted)', lineHeight:1.7, fontWeight:300 }} className="fade-in">
          {char.goals && <div><b style={{ color:'var(--dim)', fontWeight:400 }}>Wants</b> — {char.goals.slice(0,90)}</div>}
          {char.fears && <div><b style={{ color:'var(--dim)', fontWeight:400 }}>Fears</b> — {char.fears.slice(0,90)}</div>}
          {char.voice && <div><b style={{ color:'var(--dim)', fontWeight:400 }}>Voice</b> — {char.voice.slice(0,90)}</div>}
          {rels.length > 0 && (
            <div style={{ marginTop:5 }}>
              {rels.map(r => {
                const otherId = r.character_a===char.id?r.character_b:r.character_a
                const other   = characters.find(c=>c.id===otherId)
                const color   = REL_COLORS[r.type]||'var(--muted)'
                return (
                  <div key={r.id} style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                    <div style={{ width:4, height:4, borderRadius:'50%', background:color, flexShrink:0 }}/>
                    <span style={{ fontSize:10, color:'var(--dim)', fontWeight:300 }}>{other?.name}</span>
                    <span style={{ fontSize:10, color, textTransform:'capitalize' }}>{r.type}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Pressure Test Card ─────────────────────────────────────────
function PressureTestCard({ card, onClose }) {
  if (card.loading) return (
    <div className="lore-card" style={{ padding:20, display:'flex', alignItems:'center', gap:12 }}>
      <Spinner/> <span style={{ fontSize:13, color:'var(--muted)', fontWeight:300 }}>Pressure testing…</span>
    </div>
  )
  const v = VERDICT_STYLE[card.verdict] || VERDICT_STYLE.tension
  return (
    <div className="lore-card">
      <div className="lore-bar" style={{ background:v.color }}/>
      <div className="lore-inner">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div className="lore-eyebrow">Pressure Test — {card.character?.name}</div>
          <button onClick={onClose} style={{ fontSize:10, color:'var(--dim)', cursor:'pointer', background:'none', border:'none', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 12px', borderRadius:5, marginBottom:12, background:v.bg, border:`1px solid ${v.border}` }}>
          <span style={{ fontSize:16 }}>{v.icon}</span>
          <div>
            <div style={{ fontSize:13, fontWeight:500, color:v.color }}>{v.label}</div>
            <div style={{ fontSize:11, color:'var(--muted)', fontWeight:300, marginTop:1 }}>{card.summary}</div>
          </div>
        </div>
        {card.rel && card.otherChar && (
          <>
            <div className="lore-label" style={{ marginBottom:6 }}>Relationship context</div>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:5, background:'rgba(255,255,255,.02)', border:'1px solid var(--edge)', marginBottom:12 }}>
              <div style={{ width:20, height:20, borderRadius:'50%', background:card.character.color+'18', border:`1px solid ${card.character.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:card.character.color, fontWeight:500 }}>{card.character.name?.charAt(0)}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'var(--text)', fontWeight:400 }}>{card.character.name} &amp; {card.otherChar.name}</div>
                <div style={{ fontSize:10, color:REL_COLORS[card.rel.type]||'var(--muted)', textTransform:'capitalize', fontWeight:300 }}>{card.rel.type} · tension {card.rel.tension}/100</div>
              </div>
              <div style={{ width:20, height:20, borderRadius:'50%', background:card.otherChar.color+'18', border:`1px solid ${card.otherChar.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:card.otherChar.color, fontWeight:500 }}>{card.otherChar.name?.charAt(0)}</div>
            </div>
          </>
        )}
        {card.notes?.length > 0 && (
          <>
            <div className="lore-divider"/>
            <div className="lore-label" style={{ marginBottom:8 }}>Why</div>
            {card.notes.map((n,i) => (
              <div key={i} style={{ display:'flex', gap:8, marginBottom:8 }}>
                <div style={{ width:4, height:4, borderRadius:'50%', background:v.color, flexShrink:0, marginTop:6 }}/>
                <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.6, fontWeight:300 }}>
                  <b style={{ color:'var(--text)', fontWeight:400, textTransform:'capitalize' }}>{n.type}: </b>{n.text}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ── Why Card ───────────────────────────────────────────────────
function WhyCard({ whisper, onConfirm, onEdit, onClose }) {
  return (
    <div className="lore-card" style={{ width:340 }} onClick={e => e.stopPropagation()}>
      <div className="lore-bar" style={{ background:'linear-gradient(90deg, var(--gold), var(--gold-dim))' }}/>
      <div className="lore-inner">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
          <div className="lore-eyebrow">Living Bible — AI reasoning</div>
          <button onClick={onClose} style={{ fontSize:10, color:'var(--dim)', cursor:'pointer', background:'none', border:'none' }}>✕</button>
        </div>
        <div className="lore-name">Why we think {whisper.charAName} & {whisper.charBName} have shifted</div>
        <div className="lore-divider"/>
        {whisper.reasoning.map((r,i) => (
          <div key={i} style={{ display:'flex', gap:9, marginBottom:10 }}>
            <span style={{ fontSize:10, color:'var(--gold)', fontWeight:500, flexShrink:0, marginTop:1 }}>{i+1}</span>
            <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.6, fontWeight:300 }}>{r}</div>
          </div>
        ))}
        <div className="lore-divider"/>
        <div style={{ fontSize:10, color:'var(--dim)', fontWeight:300, marginBottom:6 }}>Proposed update</div>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'rgba(255,255,255,.02)', border:'1px solid var(--edge)', borderRadius:5, marginBottom:14 }}>
          <span style={{ fontSize:11, color:'var(--dim)', fontWeight:300, textDecoration:'line-through' }}>Current</span>
          <span style={{ fontSize:10, color:'var(--dim)' }}>→</span>
          <span style={{ fontSize:11, color:'var(--gold)', fontWeight:400, textTransform:'capitalize' }}>{whisper.proposedType} · tension {whisper.proposedTension}</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-gold" style={{ flex:1, justifyContent:'center', fontSize:12 }} onClick={onConfirm}>Confirm update</button>
          <button className="btn btn-ghost" style={{ flex:1, justifyContent:'center', fontSize:12 }} onClick={onEdit}>Edit first</button>
        </div>
      </div>
    </div>
  )
}

function Dot() {
  return <span style={{ display:'inline-block', width:5, height:5, borderRadius:'50%', background:'var(--gold)', opacity:0.5, animation:'pulse 1.2s ease-in-out infinite' }}/>
}
function Spinner() {
  return <span style={{ display:'inline-block', width:11, height:11, borderRadius:'50%', border:'1.5px solid var(--edge)', borderTopColor:'var(--gold)', animation:'spin .7s linear infinite' }}/>
}

const REL_COLORS = { ally:'#3FB950', rival:'#F85149', romantic:'#DB61A2', family:'#58A6FF', mentor:'#D2A8FF', enemy:'#FF7B72', complicated:'#FFA657', stranger:'#6A6A88' }
