'use client'
import { useState, useEffect, useRef } from 'react'
import { callAI, buildFirstReadPrompt, FIRST_READ_SCHEMA } from '../../lib/ai'

const REL_TYPES = ['ally','rival','romantic','family','mentor','enemy','complicated','stranger']
const REL_COLORS = { ally:'#3FB950',rival:'#F85149',romantic:'#DB61A2',family:'#58A6FF',mentor:'#D2A8FF',enemy:'#FF7B72',complicated:'#FFA657',stranger:'#6A6A88' }
const CHAR_COLORS = ['#C8A96A','#58A6FF','#3FB950','#DB61A2','#FF7B72','#D2A8FF','#FFA657','#38BDAE']

export default function FirstRead({ scriptText, format, projectId, onComplete, onCancel }) {
  const [step, setStep]               = useState('reading') // reading | characters | relationships | events | saving
  const [characters, setCharacters]   = useState([])
  const [relationships, setRelationships] = useState([])
  const [relationshipEvents, setRelationshipEvents] = useState([])
  const [characterStates, setCharacterStates] = useState([])
  const [error, setError]             = useState('')
  const [errorCode, setErrorCode]     = useState('')
  const [reading, setReading]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const requestInFlight               = useRef(false)

  // Run on mount
  useEffect(() => { runRead() }, [])

  async function runRead() {
    if (requestInFlight.current) return
    requestInFlight.current = true
    setReading(true)
    setStep('reading')
    setError('')
    setErrorCode('')
    try {
      if (!scriptText?.trim()) throw new Error('No script text was provided.')
      const wordCount = scriptText.trim().split(/\s+/).filter(Boolean).length
      if (wordCount < 25) {
        const shortScriptError = new Error('First Read needs at least 25 words. Add a little action or dialogue, then try again.')
        shortScriptError.code = 'SCRIPT_TOO_SHORT'
        throw shortScriptError
      }
      const prompt = buildFirstReadPrompt(scriptText, format)
      const result = await callAI({ ...prompt, schema: FIRST_READ_SCHEMA, maxTokens: 8000 })
      // Assign colors and temp IDs
      const chars = (result.characters || []).map((c, i) => ({
        ...c,
        _tempId: `temp_${i}`,
        color: CHAR_COLORS[i % CHAR_COLORS.length],
        _keep: true,
      }))
      const rels = (result.relationships || []).map((r, i) => ({
        ...r,
        _tempId: `rel_${i}`,
        tension: r.tension ?? 30,
        _keep: true,
      }))
      const relEvents = (result.relationship_events || []).map((event, i) => ({
        ...event,
        _tempId: `rel_event_${i}`,
        _keep: true,
      }))
      const stateEvents = (result.character_state_events || []).map((event, i) => ({
        ...event,
        _tempId: `state_event_${i}`,
        _keep: true,
      }))
      setCharacters(chars)
      setRelationships(rels)
      setRelationshipEvents(relEvents)
      setCharacterStates(stateEvents)
      setStep('characters')
    } catch(e) {
      setErrorCode(e.code || 'AI_REQUEST_FAILED')
      setError(e.message || 'First Read could not finish. Please try again.')
    } finally {
      requestInFlight.current = false
      setReading(false)
    }
  }

  function updateChar(tempId, patch) {
    setCharacters(cs => cs.map(c => c._tempId === tempId ? { ...c, ...patch } : c))
  }

  function updateRel(tempId, patch) {
    setRelationships(rs => rs.map(r => r._tempId === tempId ? { ...r, ...patch } : r))
  }

  function toggleTimelineEvent(tempId) {
    setRelationshipEvents(events => events.map(event => event._tempId === tempId ? { ...event, _keep: !event._keep } : event))
    setCharacterStates(events => events.map(event => event._tempId === tempId ? { ...event, _keep: !event._keep } : event))
  }

  async function save() {
    setSaving(true)
    setStep('saving')
    try {
      const { supabase } = await import('../../lib/supabase')
      const keptChars = characters.filter(c => c._keep)
      const keptRels  = relationships.filter(r => r._keep)
      const keptRelEvents = relationshipEvents.filter(event => event._keep)
      const keptStateEvents = characterStates.filter(event => event._keep)
      const byName = (items, name) => items.find(item => item.name.trim().toLowerCase() === name?.trim().toLowerCase())

      // Insert characters
      const insertedChars = []
      for (const c of keptChars) {
        const { data, error: charError } = await supabase.from('characters').insert({
          project_id:  projectId,
          name:        c.name,
          role:        c.role || '',
          goals:       c.goals || '',
          fears:       c.fears || '',
          voice:       c.voice || '',
          personality: c.personality || '',
          life_state:  c.life_state || 'alive',
          color:       c.color,
        }).select().single()
        if (charError) throw charError
        if (data) insertedChars.push({ tempId: c._tempId, name: c.name, id: data.id })
      }

      // Insert relationships
      const insertedRels = []
      for (const r of keptRels) {
        const a = byName(insertedChars, r.character_a)
        const b = byName(insertedChars, r.character_b)
        if (!a || !b) continue
        const { data, error: relError } = await supabase.from('relationships').insert({
          project_id:  projectId,
          character_a: a.id,
          character_b: b.id,
          type:        r.type || 'stranger',
          tension:     r.tension ?? 30,
          status:      r.status || '',
          history:     r.history || '',
        }).select().single()
        if (relError) throw relError
        if (data) insertedRels.push({ ...data, characterAName: a.name, characterBName: b.name })
      }

      // Insert only writer-confirmed chronology. These rows are the source of truth
      // for Ties That Bind; the relationship row remains the latest snapshot.
      for (const event of keptRelEvents) {
        const rel = insertedRels.find(item => {
          const names = [item.characterAName.toLowerCase(), item.characterBName.toLowerCase()]
          return names.includes(event.character_a?.toLowerCase()) && names.includes(event.character_b?.toLowerCase())
        })
        if (!rel) continue
        const { error: eventError } = await supabase.from('relationship_events').insert({
          project_id: projectId,
          relationship_id: rel.id,
          sequence_index: Math.round(event.sequence_index || 0),
          segment_type: event.segment_type || 'section',
          segment_label: event.segment_label || 'Unlabeled section',
          relationship_type: event.type || 'stranger',
          tension: Math.max(0, Math.min(100, Math.round(event.tension || 0))),
          summary: event.summary || '',
          evidence: event.evidence || '',
          source: 'first_read',
        })
        if (eventError) throw eventError
      }

      for (const event of keptStateEvents) {
        const character = byName(insertedChars, event.character)
        if (!character) continue
        const { error: stateError } = await supabase.from('character_state_events').insert({
          project_id: projectId,
          character_id: character.id,
          sequence_index: Math.round(event.sequence_index || 0),
          segment_type: event.segment_type || 'section',
          segment_label: event.segment_label || 'Unlabeled section',
          state: event.state || 'unknown',
          summary: event.summary || '',
          evidence: event.evidence || '',
          source: 'first_read',
        })
        if (stateError) throw stateError
      }

      onComplete(insertedChars.length, insertedRels.length)
    } catch(e) {
      setError('Something went wrong saving: ' + e.message)
      setStep('events')
    }
    setSaving(false)
  }

  // ── Reading screen ──────────────────────────────────────────
  if (step === 'reading') return (
    <Overlay>
      <div style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:22, color:'var(--gold)', fontWeight:300, marginBottom:16 }}>First Read</div>
        {reading && (
          <div style={{ display:'flex', justifyContent:'center', gap:5, marginBottom:18 }}>
            <Dot delay={0}/><Dot delay={0.2}/><Dot delay={0.4}/>
          </div>
        )}
        <div style={{ fontSize:13, color:'var(--muted)', fontWeight:300 }}>{reading ? 'Anchor is reading your script…' : 'First Read paused'}</div>
        <div style={{ fontSize:11, color:'var(--dim)', marginTop:6, fontWeight:300 }}>{reading ? 'Detecting characters, relationships, and story chronology' : 'Nothing was changed or lost'}</div>
      </div>
      {error && (
        <div style={{ padding:'14px 20px', background:'rgba(248,81,73,.08)', border:'1px solid rgba(248,81,73,.2)', borderRadius:8, margin:'0 24px 24px', fontSize:13, color:'var(--danger)', fontWeight:300 }}>
          {error}
          {['AI_OVERLOADED', 'AI_TEMPORARY_FAILURE', 'AI_CONNECTION_FAILURE'].includes(errorCode) && (
            <div style={{ marginTop:8 }}>
              <a href="https://status.anthropic.com/" target="_blank" rel="noreferrer" style={{ color:'var(--gold)' }}>Check Anthropic status ↗</a>
            </div>
          )}
          <div style={{ marginTop:10, display:'flex', gap:8 }}>
            <button className="btn btn-gold btn-sm" onClick={runRead} disabled={reading}>{reading ? 'Trying…' : 'Try again'}</button>
            <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
    </Overlay>
  )

  // ── Saving screen ───────────────────────────────────────────
  if (step === 'saving') return (
    <Overlay>
      <div style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:22, color:'var(--gold)', fontWeight:300, marginBottom:16 }}>Building your bible…</div>
        <div style={{ display:'flex', justifyContent:'center', gap:5 }}>
          <Dot delay={0}/><Dot delay={0.2}/><Dot delay={0.4}/>
        </div>
      </div>
    </Overlay>
  )

  // ── Step 1: Characters ──────────────────────────────────────
  if (step === 'characters') return (
    <Overlay>
      <Header
        step={1}
        title="Characters detected"
        sub={`Anchor found ${characters.length} character${characters.length !== 1 ? 's' : ''} in your script. Edit or dismiss any that are wrong.`}
      />
      <div style={{ flex:1, overflow:'auto', padding:'0 24px 16px' }}>
        {characters.map(c => (
          <CharCard key={c._tempId} char={c}
            onChange={patch => updateChar(c._tempId, patch)}
            onToggle={() => updateChar(c._tempId, { _keep: !c._keep })}
          />
        ))}
      </div>
      <Footer
        onBack={onCancel} backLabel="Cancel"
        onNext={() => setStep('relationships')} nextLabel={`Relationships →`}
        nextDisabled={!characters.some(c => c._keep)}
      />
    </Overlay>
  )

  // ── Step 2: Relationships ───────────────────────────────────
  const keptNames = new Set(characters.filter(c => c._keep).map(c => c.name.trim().toLowerCase()))
  const validRels = relationships.filter(r => keptNames.has(r.character_a?.trim().toLowerCase()) && keptNames.has(r.character_b?.trim().toLowerCase()))

  if (step === 'relationships') return (
    <Overlay>
      <Header
        step={2}
        title="Relationships mapped"
        sub={`Anchor mapped ${validRels.length} relationship${validRels.length !== 1 ? 's' : ''}. Adjust types, tension, or dismiss any that are wrong.`}
      />
      <div style={{ flex:1, overflow:'auto', padding:'0 24px 16px' }}>
        {validRels.length === 0 && (
          <div style={{ fontSize:13, color:'var(--dim)', fontStyle:'italic', fontWeight:300, padding:'20px 0' }}>No relationships detected — you can add them manually in Ties That Bind.</div>
        )}
        {validRels.map(r => (
          <RelCard key={r._tempId} rel={r}
            characters={characters}
            onChange={patch => updateRel(r._tempId, patch)}
            onToggle={() => updateRel(r._tempId, { _keep: !r._keep })}
          />
        ))}
      </div>
      <Footer
        onBack={() => setStep('characters')} backLabel="← Characters"
        onNext={() => setStep('events')} nextLabel="Review timeline →"
      />
    </Overlay>
  )

  const timeline = [
    ...relationshipEvents.map(event => ({ ...event, _kind: 'relationship' })),
    ...characterStates.map(event => ({ ...event, _kind: 'character' })),
  ].sort((a, b) => a.sequence_index - b.sequence_index)

  if (step === 'events') return (
    <Overlay>
      <Header
        step={3}
        title="Story timeline proposed"
        sub="Nothing below becomes canon until you confirm it. Dismiss anything Anchor misunderstood."
      />
      <div style={{ flex:1, overflow:'auto', padding:'0 24px 16px' }}>
        {timeline.length === 0 && (
          <div style={{ fontSize:13, color:'var(--dim)', fontStyle:'italic', fontWeight:300, padding:'20px 0' }}>No meaningful relationship or character-state changes were detected.</div>
        )}
        {timeline.map(event => (
          <TimelineEventCard key={event._tempId} event={event} onToggle={() => toggleTimelineEvent(event._tempId)} />
        ))}
      </div>
      {error && <div style={{ padding:'0 24px 10px', color:'var(--danger)', fontSize:12 }}>{error}</div>}
      <Footer
        onBack={() => setStep('relationships')} backLabel="← Relationships"
        onNext={save} nextLabel="Confirm & build bible"
        saving={saving}
      />
    </Overlay>
  )

  return null
}

// ── Character card ──────────────────────────────────────────────
function CharCard({ char, onChange, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ background:'var(--s2)', border:`1px solid ${char._keep ? 'var(--edge)' : 'rgba(255,255,255,.04)'}`, borderRadius:10, marginBottom:10, overflow:'hidden', opacity: char._keep ? 1 : 0.4, transition:'all .15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', cursor:'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width:30, height:30, borderRadius:'50%', background:char.color+'18', border:`1px solid ${char.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:char.color, fontWeight:500, flexShrink:0 }}>
          {char.name?.charAt(0)}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, color:'var(--text)', fontWeight:400 }}>{char.name}</div>
          {char.role && <div style={{ fontSize:11, color:'var(--muted)', fontWeight:300 }}>{char.role}</div>}
        </div>
        <span style={{ fontSize:10, color:'var(--dim)', marginRight:4 }}>{expanded ? '▾' : '▸'}</span>
        <button
          onClick={e => { e.stopPropagation(); onToggle() }}
          style={{ fontSize:11, padding:'3px 9px', borderRadius:4, border:`1px solid ${char._keep ? 'var(--edge)' : 'rgba(248,81,73,.3)'}`, background: char._keep ? 'transparent' : 'rgba(248,81,73,.08)', color: char._keep ? 'var(--dim)' : 'var(--danger)', cursor:'pointer', fontFamily:'var(--font-ui)', flexShrink:0 }}
        >
          {char._keep ? 'Dismiss' : 'Restore'}
        </button>
      </div>
      {expanded && char._keep && (
        <div style={{ padding:'0 14px 14px', display:'flex', flexDirection:'column', gap:10 }} className="fade-in">
          {[
            ['Role', 'role', 'Their role in the story'],
            ['Goals', 'goals', 'What they want…'],
            ['Fears', 'fears', 'What they fear or avoid…'],
            ['Voice', 'voice', 'How they speak…'],
            ['Personality', 'personality', 'Key traits…'],
          ].map(([label, key, placeholder]) => (
            <div key={key} className="field" style={{ marginBottom:0 }}>
              <label style={{ fontSize:9 }}>{label.toUpperCase()}</label>
              <textarea
                value={char[key] || ''}
                onChange={e => onChange({ [key]: e.target.value })}
                placeholder={placeholder}
                rows={2}
                style={{ fontSize:12, fontWeight:300 }}
              />
            </div>
          ))}
          <div className="field" style={{ marginBottom:0 }}>
            <label style={{ fontSize:9 }}>LIFE STATE</label>
            <select value={char.life_state || 'alive'} onChange={e => onChange({ life_state: e.target.value })} style={{ fontSize:12 }}>
              <option value="alive">Alive</option>
              <option value="missing">Missing</option>
              <option value="presumed_dead">Presumed dead</option>
              <option value="deceased">Deceased</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Relationship card ───────────────────────────────────────────
function RelCard({ rel, characters, onChange, onToggle }) {
  const color = REL_COLORS[rel.type] || 'var(--muted)'
  return (
    <div style={{ background:'var(--s2)', border:`1px solid ${rel._keep ? 'var(--edge)' : 'rgba(255,255,255,.04)'}`, borderRadius:10, marginBottom:10, padding:'14px', opacity: rel._keep ? 1 : 0.4, transition:'all .15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: rel._keep ? 12 : 0 }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:13, color:'var(--text)', fontWeight:400 }}>{rel.character_a}</span>
          <span style={{ fontSize:10, color:color, background:color+'14', padding:'2px 8px', borderRadius:3, textTransform:'capitalize', fontWeight:400 }}>{rel.type}</span>
          <span style={{ fontSize:13, color:'var(--text)', fontWeight:400 }}>{rel.character_b}</span>
        </div>
        <button
          onClick={onToggle}
          style={{ fontSize:11, padding:'3px 9px', borderRadius:4, border:`1px solid ${rel._keep ? 'var(--edge)' : 'rgba(248,81,73,.3)'}`, background: rel._keep ? 'transparent' : 'rgba(248,81,73,.08)', color: rel._keep ? 'var(--dim)' : 'var(--danger)', cursor:'pointer', fontFamily:'var(--font-ui)', flexShrink:0 }}
        >
          {rel._keep ? 'Dismiss' : 'Restore'}
        </button>
      </div>

      {rel._keep && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="fade-in">
          {/* Type selector */}
          <div>
            <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6, fontWeight:500 }}>Relationship type</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {REL_TYPES.map(t => {
                const tc = REL_COLORS[t]
                const active = rel.type === t
                return (
                  <button key={t} onClick={() => onChange({ type: t })} style={{ padding:'3px 9px', borderRadius:4, fontSize:11, cursor:'pointer', background: active ? tc+'18' : 'transparent', border:`1px solid ${active ? tc : 'var(--edge)'}`, color: active ? tc : 'var(--dim)', textTransform:'capitalize', fontFamily:'var(--font-ui)' }}>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tension */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', fontWeight:500 }}>Tension</div>
              <div style={{ fontSize:11, color: rel.tension > 60 ? '#FFA657' : 'var(--muted)', fontWeight:400 }}>{rel.tension}/100{rel.tension > 60 ? ' ⚡' : ''}</div>
            </div>
            <input type="range" min={0} max={100} value={rel.tension}
              onChange={e => onChange({ tension: Number(e.target.value) })}
              style={{ width:'100%', accentColor:'var(--gold)' }}
            />
          </div>

          {/* Status */}
          {rel.status && (
            <div className="field" style={{ marginBottom:0 }}>
              <label style={{ fontSize:9 }}>CURRENT STATUS</label>
              <textarea value={rel.status} onChange={e => onChange({ status: e.target.value })} rows={2} style={{ fontSize:12, fontWeight:300 }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TimelineEventCard({ event, onToggle }) {
  const isRelationship = event._kind === 'relationship'
  const color = isRelationship ? (REL_COLORS[event.type] || 'var(--gold)') : event.state === 'deceased' ? 'var(--danger)' : 'var(--gold)'
  const title = isRelationship
    ? `${event.character_a} & ${event.character_b}`
    : `${event.character} — ${String(event.state || 'unknown').replace('_', ' ')}`

  return (
    <div style={{ background:'var(--s2)', border:`1px solid ${event._keep ? 'var(--edge)' : 'rgba(255,255,255,.04)'}`, borderRadius:10, marginBottom:10, padding:'13px 14px', opacity:event._keep ? 1 : .4 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:color, marginTop:5, flexShrink:0 }} />
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap', marginBottom:4 }}>
            <span style={{ fontSize:12, color:'var(--text)', fontWeight:500 }}>{title}</span>
            <span style={{ fontSize:10, color:'var(--gold)', background:'var(--gold-bg)', padding:'1px 7px', borderRadius:3 }}>{event.segment_label || 'Unlabeled section'}</span>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.55, marginBottom:5 }}>{event.summary}</div>
          {event.evidence && <div style={{ fontSize:11, color:'var(--dim)', fontStyle:'italic', lineHeight:1.5 }}>“{event.evidence}”</div>}
        </div>
        <button onClick={onToggle} style={{ fontSize:11, padding:'3px 9px', borderRadius:4, border:'1px solid var(--edge)', background:'transparent', color:'var(--dim)', cursor:'pointer', fontFamily:'var(--font-ui)' }}>
          {event._keep ? 'Dismiss' : 'Restore'}
        </button>
      </div>
    </div>
  )
}

// ── Shared UI ───────────────────────────────────────────────────
function Overlay({ children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', backdropFilter:'blur(12px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:14, width:'100%', maxWidth:560, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Header({ step, title, sub }) {
  return (
    <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--edge)', flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:11, color:'var(--gold)', fontWeight:300, letterSpacing:2, textTransform:'uppercase' }}>First Read</div>
        <div style={{ display:'flex', gap:4 }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ width:18, height:3, borderRadius:2, background: n <= step ? 'var(--gold)' : 'var(--edge)' }} />
          ))}
        </div>
      </div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:20, color:'var(--text)', fontWeight:300, marginBottom:4 }}>{title}</div>
      <div style={{ fontSize:12, color:'var(--muted)', fontWeight:300, lineHeight:1.5 }}>{sub}</div>
    </div>
  )
}

function Footer({ onBack, backLabel, onNext, nextLabel, nextDisabled, saving }) {
  return (
    <div style={{ padding:'14px 24px', borderTop:'1px solid var(--edge)', display:'flex', gap:8, flexShrink:0 }}>
      <button className="btn btn-ghost" onClick={onBack} style={{ fontSize:12 }}>{backLabel}</button>
      <button className="btn btn-gold" onClick={onNext} disabled={nextDisabled || saving} style={{ marginLeft:'auto', fontSize:12 }}>
        {saving ? 'Saving…' : nextLabel}
      </button>
    </div>
  )
}

function Dot({ delay }) {
  return (
    <span style={{ display:'inline-block', width:7, height:7, borderRadius:'50%', background:'var(--gold)', opacity:0.5, animation:`pulse 1.2s ease-in-out ${delay}s infinite` }} />
  )
}
