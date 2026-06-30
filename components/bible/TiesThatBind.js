'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const REL_COLORS = { ally: '#3FB950', rival: '#F85149', romantic: '#DB61A2', family: '#58A6FF', mentor: '#D2A8FF', enemy: '#FF7B72', complicated: '#FFA657', stranger: '#6A6A88' }
const REL_TYPES  = Object.keys(REL_COLORS)
const NODE_R     = 30

const ACT_LABELS = ['Act 1', 'Act 2', 'Act 3', 'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5', 'Opening', 'Midpoint', 'Climax', 'Resolution']

export default function TiesThatBind({ characters, relationships, onCreateRelationship, onUpdateRelationship, onDeleteRelationship }) {
  const svgRef    = useRef(null)
  const [size, setSize] = useState({ w: 700, h: 500 })
  const [positions, setPositions] = useState({})
  const [dragging, setDragging]   = useState(null)
  const [selected, setSelected]   = useState(null)
  const [connecting, setConnecting] = useState(null)
  const [loreNode, setLoreNode]   = useState(null)
  const [loreRel, setLoreRel]     = useState(null)
  const [relForm, setRelForm]     = useState({})
  const [saving, setSaving]       = useState(false)
  const [arcForm, setArcForm]     = useState({ act: 'Act 1', note: '' })
  const [addingArc, setAddingArc] = useState(false)
  const [hoveredEdge, setHoveredEdge] = useState(null)

  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const obs = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect
      setSize({ w: width, h: height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev }
      characters.forEach((c, i) => {
        if (!next[c.id]) {
          const angle = (i / Math.max(characters.length, 1)) * Math.PI * 2 - Math.PI / 2
          const cx = size.w / 2, cy = size.h / 2
          const r  = Math.min(size.w, size.h) * 0.3
          next[c.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
        }
      })
      return next
    })
  }, [characters, size])

  const onNodeMouseDown = useCallback((e, id) => {
    if (connecting) return
    e.stopPropagation()
    const svgRect = svgRef.current.getBoundingClientRect()
    setDragging({ id, ox: e.clientX - svgRect.left - (positions[id]?.x || 0), oy: e.clientY - svgRect.top - (positions[id]?.y || 0) })
  }, [connecting, positions])

  const onMouseMove = useCallback((e) => {
    if (!dragging) return
    const svgRect = svgRef.current.getBoundingClientRect()
    setPositions(p => ({ ...p, [dragging.id]: { x: e.clientX - svgRect.left - dragging.ox, y: e.clientY - svgRect.top - dragging.oy } }))
  }, [dragging])

  const onMouseUp = useCallback(() => setDragging(null), [])

  function handleNodeClick(e, c) {
    e.stopPropagation()
    if (connecting) {
      if (connecting !== c.id) {
        onCreateRelationship(connecting, c.id).then(rel => { if (rel) openRelLore(rel) })
      }
      setConnecting(null); return
    }
    setSelected({ type: 'node', id: c.id })
    setLoreNode(c); setLoreRel(null)
  }

  function handleEdgeClick(e, rel) {
    e.stopPropagation()
    setSelected({ type: 'edge', id: rel.id })
    openRelLore(rel); setLoreNode(null)
  }

  function openRelLore(rel) {
    setLoreRel(rel)
    setRelForm({ type: rel.type, status: rel.status, history: rel.history, notes: rel.notes, tension: rel.tension })
    setAddingArc(false)
  }

  async function saveRel() {
    if (!loreRel) return
    setSaving(true)
    await onUpdateRelationship(loreRel.id, relForm)
    setSaving(false)
    setLoreRel(r => ({ ...r, ...relForm }))
  }

  async function addArcEntry() {
    if (!loreRel || !arcForm.note.trim()) return
    setSaving(true)
    const currentArc = Array.isArray(loreRel.arc) ? loreRel.arc : []
    const newEntry = {
      act: arcForm.act,
      type: relForm.type || loreRel.type,
      tension: relForm.tension ?? loreRel.tension ?? 0,
      note: arcForm.note.trim(),
      timestamp: new Date().toISOString(),
    }
    const updatedArc = [...currentArc, newEntry]
    await onUpdateRelationship(loreRel.id, { arc: updatedArc })
    setLoreRel(r => ({ ...r, arc: updatedArc }))
    setArcForm({ act: 'Act 1', note: '' })
    setAddingArc(false)
    setSaving(false)
  }

  async function removeArcEntry(index) {
    if (!loreRel) return
    const currentArc = Array.isArray(loreRel.arc) ? loreRel.arc : []
    const updatedArc = currentArc.filter((_, i) => i !== index)
    await onUpdateRelationship(loreRel.id, { arc: updatedArc })
    setLoreRel(r => ({ ...r, arc: updatedArc }))
  }

  function clearAll() { setSelected(null); setLoreNode(null); setLoreRel(null); setConnecting(null) }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }} onClick={clearAll}>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(200,169,106,.03) 0%, transparent 65%)', pointerEvents: 'none' }} />

        {/* Top bar */}
        <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'rgba(15,15,22,.9)', backdropFilter: 'blur(12px)', border: '1px solid var(--edge)', borderRadius: 7, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold)', fontWeight: 300 }}>Ties That Bind</span>
            <div style={{ width: 1, height: 12, background: 'var(--edge)' }} />
            <span style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 300 }}>{characters.length} characters · {relationships.length} connections</span>
          </div>
          {connecting && (
            <div style={{ background: 'rgba(200,169,106,.12)', border: '1px solid rgba(200,169,106,.25)', borderRadius: 7, padding: '6px 14px', fontSize: 11, color: 'var(--gold)', animation: 'breathe 1.5s ease infinite' }}>
              Click another character to connect
            </div>
          )}
        </div>

        {/* Filter pills */}
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 5, background: 'rgba(8,8,13,.85)', backdropFilter: 'blur(16px)', border: '1px solid var(--edge)', borderRadius: 24, padding: '5px 7px' }}>
          {['All', ...REL_TYPES.map(t => t.charAt(0).toUpperCase() + t.slice(1))].map((label, i) => (
            <div key={label} style={{ fontSize: 10, fontWeight: 400, padding: '3px 11px', borderRadius: 18, cursor: 'pointer', border: '1px solid transparent', color: i === 0 ? 'var(--gold)' : 'var(--muted)', background: i === 0 ? 'rgba(200,169,106,.1)' : 'transparent', borderColor: i === 0 ? 'rgba(200,169,106,.22)' : 'transparent' }}>
              {label}
            </div>
          ))}
        </div>

        {characters.length === 0 ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--dim)', fontWeight: 300 }}>The web is empty</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 300 }}>Add characters first, then map their connections here</div>
          </div>
        ) : (
          <svg ref={svgRef} width="100%" height="100%"
            onMouseMove={onMouseMove} onMouseUp={onMouseUp}
            style={{ cursor: dragging ? 'grabbing' : 'default', userSelect: 'none', position: 'absolute', inset: 0, zIndex: 1 }}
          >
            <defs>
              <filter id="ttb-glow">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* Edges */}
            {relationships.map(rel => {
              const posA   = positions[rel.character_a]
              const posB   = positions[rel.character_b]
              if (!posA || !posB) return null
              const color  = REL_COLORS[rel.type] || REL_COLORS.stranger
              const isSel  = selected?.type === 'edge' && selected.id === rel.id
              const isHov  = hoveredEdge === rel.id
              const mx     = (posA.x + posB.x) / 2
              const my     = (posA.y + posB.y) / 2
              const arc    = Array.isArray(rel.arc) ? rel.arc : []
              const active = isSel || isHov

              return (
                <g key={rel.id}
                  onClick={e => handleEdgeClick(e, rel)}
                  onMouseEnter={() => setHoveredEdge(rel.id)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <line x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y} stroke="transparent" strokeWidth={18} />
                  {active && <line x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y} stroke={color} strokeWidth={8} opacity={.12} filter="url(#ttb-glow)" />}
                  <line x1={posA.x} y1={posA.y} x2={posB.x} y2={posB.y} stroke={color} strokeWidth={isSel ? 2 : isHov ? 1.8 : 1.2} opacity={isSel ? 1 : isHov ? 0.85 : .45} />
                  {rel.tension > 60 && !active && <circle cx={mx} cy={my} r={rel.tension / 22 + 2} fill={color} opacity={.15} />}

                  {/* Always-visible midpoint pill — signals "clickable" */}
                  {!active && (
                    <g opacity={0.55}>
                      <circle cx={mx} cy={my} r={9} fill="#09090D" stroke={color} strokeWidth={1} opacity={0.8} />
                      <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={9} fill={color} fontFamily="Inter,sans-serif" style={{ pointerEvents:'none' }}>⊕</text>
                    </g>
                  )}

                  {/* Hover/selected state — bigger, shows type */}
                  {active && (
                    <g>
                      <circle cx={mx} cy={my} r={14} fill="#09090D" stroke={color} strokeWidth={1.5} />
                      <circle cx={mx} cy={my} r={4} fill={color} />
                    </g>
                  )}
                  {/* Arc count badge */}
                  {arc.length > 0 && (
                    <g transform={`translate(${mx + 14},${my - 14})`}>
                      <circle r={7} fill={color} opacity={0.9} />
                      <text textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#09090D" fontFamily="Inter,sans-serif" fontWeight="700" style={{ pointerEvents:'none' }}>{arc.length}</text>
                    </g>
                  )}
                  {active && <text x={mx} y={my - 20} textAnchor="middle" fontSize={10} fill={color} fontFamily="Inter,sans-serif" fontWeight="500" opacity={.95} style={{ pointerEvents: 'none' }}>{rel.type} · click for details</text>}
                </g>
              )
            })}

            {/* Nodes */}
            {characters.map(c => {
              const pos    = positions[c.id]
              if (!pos) return null
              const isSel  = selected?.type === 'node' && selected.id === c.id
              const isConn = connecting === c.id

              return (
                <g key={c.id} transform={`translate(${pos.x},${pos.y})`}
                  onMouseDown={e => onNodeMouseDown(e, c.id)}
                  onClick={e => handleNodeClick(e, c)}
                  style={{ cursor: connecting && connecting !== c.id ? 'crosshair' : dragging?.id === c.id ? 'grabbing' : 'grab' }}
                >
                  {(isSel || isConn) && <circle r={NODE_R + 10} fill={c.color} opacity={.07} filter="url(#ttb-glow)" />}
                  {(isSel || isConn) && <circle r={NODE_R + 5}  fill={c.color} opacity={.06} />}
                  <circle r={NODE_R} fill="#09090D" stroke={c.color} strokeWidth={isSel ? 2 : 1.2} opacity={isSel ? 1 : .8} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={500} fill={c.color} fontFamily="Inter,sans-serif" style={{ pointerEvents: 'none' }}>{c.name?.charAt(0)}</text>
                  <text textAnchor="middle" y={NODE_R + 16} fontSize={11} fill="var(--text)" fontFamily="Inter,sans-serif" fontWeight={300} style={{ pointerEvents: 'none' }}>
                    {c.name?.length > 14 ? c.name.slice(0, 12) + '…' : c.name}
                  </text>
                  {c.role && <text textAnchor="middle" y={NODE_R + 29} fontSize={9} fill="var(--muted)" fontFamily="Inter,sans-serif" fontWeight={300} style={{ pointerEvents: 'none' }}>{c.role.slice(0, 18)}</text>}
                </g>
              )
            })}
          </svg>
        )}

        {/* Node lore card */}
        {loreNode && (() => {
          const pos = positions[loreNode.id]
          const nodeRels = relationships.filter(r => r.character_a === loreNode.id || r.character_b === loreNode.id)
          const cardX = Math.min((pos?.x || 0) + NODE_R + 16, size.w - 240)
          const cardY = Math.max(60, (pos?.y || 0) - 80)

          return (
            <div style={{ position: 'absolute', left: cardX, top: cardY, width: 230, zIndex: 20 }} onClick={e => e.stopPropagation()}>
              <div className="lore-card">
                <div className="lore-bar" style={{ background: loreNode.color }} />
                <div className="lore-inner">
                  <button onClick={() => setLoreNode(null)} style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, color: 'var(--dim)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                  <div className="lore-eyebrow">Character</div>
                  <div className="lore-name">{loreNode.name}</div>
                  <div className="lore-divider" />
                  {loreNode.goals && <div className="lore-row"><div className="lore-label">Wants</div><div className="lore-val">{loreNode.goals.slice(0, 100)}</div></div>}
                  {loreNode.fears && <div className="lore-row"><div className="lore-label">Fears</div><div className="lore-val">{loreNode.fears.slice(0, 100)}</div></div>}
                  {loreNode.voice && <div className="lore-row"><div className="lore-label">Voice</div><div className="lore-val">{loreNode.voice.slice(0, 100)}</div></div>}
                  {nodeRels.length > 0 && (
                    <>
                      <div className="lore-divider" />
                      <div style={{ fontSize: 9, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6, fontWeight: 500 }}>Connections ({nodeRels.length})</div>
                      {nodeRels.map(r => {
                        const otherId = r.character_a === loreNode.id ? r.character_b : r.character_a
                        const other   = characters.find(c => c.id === otherId)
                        const color   = REL_COLORS[r.type] || 'var(--muted)'
                        return (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, cursor: 'pointer' }} onClick={() => { openRelLore(r); setLoreNode(null) }}>
                            <div style={{ width: 3, height: 18, borderRadius: 2, background: color, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 400 }}>{other?.name}</div>
                              <div style={{ fontSize: 9, color, textTransform: 'capitalize', fontWeight: 300 }}>{r.type}</div>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                  <div className="lore-divider" />
                  <button onClick={() => { setConnecting(loreNode.id); setLoreNode(null) }} className="btn btn-ghost btn-xs" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}>
                    + Connect to another character
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Relationship lore card */}
        {loreRel && (() => {
          const posA  = positions[loreRel.character_a]
          const posB  = positions[loreRel.character_b]
          const charA = characters.find(c => c.id === loreRel.character_a)
          const charB = characters.find(c => c.id === loreRel.character_b)
          const color = REL_COLORS[loreRel.type] || REL_COLORS.stranger
          const mx    = ((posA?.x || 0) + (posB?.x || 0)) / 2
          const my    = ((posA?.y || 0) + (posB?.y || 0)) / 2
          const cardX = Math.max(10, Math.min(mx - 150, size.w - 310))
          const cardY = Math.max(10, my - 180)
          const arc   = Array.isArray(loreRel.arc) ? loreRel.arc : []

          return (
            <div style={{ position: 'absolute', left: cardX, top: cardY, width: 295, zIndex: 20, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="lore-card">
                <div className="lore-bar" style={{ background: `linear-gradient(90deg, ${charA?.color || color}, ${color}, ${charB?.color || color})` }} />
                <div className="lore-inner">
                  <button onClick={() => setLoreRel(null)} style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, color: 'var(--dim)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>

                  {/* Avatar pair */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: (charA?.color || color) + '18', border: `1px solid ${charA?.color || color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: charA?.color || color, fontWeight: 500, flexShrink: 0 }}>{charA?.name?.charAt(0)}</div>
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${charA?.color || color}40, ${color}, ${charB?.color || color}40)`, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
                    </div>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: (charB?.color || color) + '18', border: `1px solid ${charB?.color || color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: charB?.color || color, fontWeight: 500, flexShrink: 0 }}>{charB?.name?.charAt(0)}</div>
                  </div>

                  <div className="lore-eyebrow">Relationship</div>
                  <div className="lore-name" style={{ fontSize: 16 }}>{charA?.name} &amp; {charB?.name}</div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 13 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color, textTransform: 'capitalize', fontWeight: 400 }}>{relForm.type}</span>
                    {relForm.tension > 60 && <span style={{ marginLeft: 'auto', fontSize: 9, color: '#F85149', background: 'rgba(248,81,73,.1)', border: '1px solid rgba(248,81,73,.2)', borderRadius: 8, padding: '1px 7px' }}>⚡ High tension</span>}
                  </div>

                  <div className="lore-divider" />

                  {/* Editable fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={{ marginBottom: 4 }}>Type</label>
                      <select value={relForm.type || 'stranger'} onChange={e => setRelForm(f => ({ ...f, type: e.target.value }))} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 5 }}>
                        {REL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ marginBottom: 4 }}>Status</label>
                      <input value={relForm.status || ''} onChange={e => setRelForm(f => ({ ...f, status: e.target.value }))} placeholder="How things stand now…" style={{ fontSize: 11, padding: '5px 8px', borderRadius: 5 }} />
                    </div>
                    <div>
                      <label style={{ marginBottom: 4 }}>History</label>
                      <textarea value={relForm.history || ''} onChange={e => setRelForm(f => ({ ...f, history: e.target.value }))} placeholder="How they met…" rows={2} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 5 }} />
                    </div>
                    <div>
                      <label style={{ marginBottom: 4 }}>Notes</label>
                      <textarea value={relForm.notes || ''} onChange={e => setRelForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything else…" rows={2} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 5 }} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                        <label style={{ margin: 0 }}>Tension</label>
                        <span style={{ fontSize: 11, color: relForm.tension > 60 ? '#F85149' : 'var(--muted)', fontWeight: 400 }}>{relForm.tension}/100</span>
                      </div>
                      <input type="range" min={0} max={100} value={relForm.tension || 0} onChange={e => setRelForm(f => ({ ...f, tension: parseInt(e.target.value) }))} style={{ width: '100%', accentColor: 'var(--gold)', cursor: 'pointer' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
                    <button className="btn btn-gold" style={{ flex: 1, justifyContent: 'center', fontSize: 11 }} onClick={saveRel} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => { if (confirm('Delete this relationship?')) { onDeleteRelationship(loreRel.id); setLoreRel(null) } }}>Delete</button>
                  </div>

                  {/* AI reasoning */}
                  {loreRel.ai_reasoning && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(200,169,106,.05)', border: '1px solid rgba(200,169,106,.12)', borderRadius: 5 }}>
                      <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Why Anchor updated this</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, fontWeight: 300 }}>{loreRel.ai_reasoning.slice(0, 200)}{loreRel.ai_reasoning.length > 200 ? '…' : ''}</div>
                    </div>
                  )}

                  {/* ── Relationship Arc Timeline ── */}
                  <div className="lore-divider" style={{ marginTop: 14 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em' }}>Relationship Arc</div>
                    <button onClick={() => setAddingArc(v => !v)} style={{ fontSize: 10, color: 'var(--gold)', background: 'none', border: '1px solid rgba(200,169,106,.25)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                      {addingArc ? 'Cancel' : '+ Add'}
                    </button>
                  </div>

                  {/* Add arc entry form */}
                  {addingArc && (
                    <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(200,169,106,.04)', border: '1px solid rgba(200,169,106,.15)', borderRadius: 6 }} className="fade-in">
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <select value={arcForm.act} onChange={e => setArcForm(f => ({ ...f, act: e.target.value }))} style={{ fontSize: 11, padding: '4px 7px', borderRadius: 4, flex: 1 }}>
                          {ACT_LABELS.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                      <textarea
                        value={arcForm.note}
                        onChange={e => setArcForm(f => ({ ...f, note: e.target.value }))}
                        placeholder="What happened to their relationship at this point…"
                        rows={2}
                        style={{ fontSize: 11, padding: '6px 8px', borderRadius: 4, marginBottom: 8 }}
                      />
                      <button className="btn btn-gold btn-xs" onClick={addArcEntry} disabled={saving || !arcForm.note.trim()} style={{ width: '100%', justifyContent: 'center' }}>
                        {saving ? 'Saving…' : 'Log this moment'}
                      </button>
                    </div>
                  )}

                  {/* Arc timeline */}
                  {arc.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', fontWeight: 300, paddingBottom: 4 }}>
                      No arc logged yet. Anchor will add entries automatically when you confirm Living Bible updates, or add them manually above.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {arc.map((entry, i) => {
                        const entryColor = REL_COLORS[entry.type] || 'var(--muted)'
                        const isLast = i === arc.length - 1
                        return (
                          <div key={i} style={{ display: 'flex', gap: 10, position: 'relative' }}>
                            {/* Timeline line + dot */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
                              <div style={{ width: 10, height: 10, borderRadius: '50%', background: isLast ? entryColor : 'var(--s2)', border: `2px solid ${entryColor}`, marginTop: 2, flexShrink: 0, boxShadow: isLast ? `0 0 6px ${entryColor}60` : 'none' }} />
                              {!isLast && <div style={{ width: 1, flex: 1, background: 'var(--edge)', margin: '2px 0' }} />}
                            </div>
                            {/* Entry content */}
                            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 500 }}>{entry.act}</span>
                                <span style={{ fontSize: 9, color: entryColor, textTransform: 'capitalize', background: entryColor + '14', padding: '1px 6px', borderRadius: 3 }}>{entry.type}</span>
                                <span style={{ fontSize: 9, color: 'var(--dim)', marginLeft: 'auto' }}>{entry.tension}/100</span>
                                <button onClick={() => removeArcEntry(i)} style={{ fontSize: 9, color: 'var(--dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, fontWeight: 300 }}>{entry.note}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
