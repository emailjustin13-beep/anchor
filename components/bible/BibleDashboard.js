'use client'
import { useState, useEffect } from 'react'
import { callAI, buildFullReadPrompt } from '../../lib/ai'

const REL_COLORS = { ally:'#3FB950',rival:'#F85149',romantic:'#DB61A2',family:'#58A6FF',mentor:'#D2A8FF',enemy:'#FF7B72',complicated:'#FFA657',stranger:'#6A6A88' }
const FORMAT_LABELS = { screenplay:'Screenplay',novel:'Novel',short_story:'Short Story' }

function buildInsightsPrompt({ project, characters, relationships, script }) {
  const scriptText = script?.content ? script.content.replace(/\[\w+\]/g, '').trim() : ''
  const charSummaries = characters.map(c =>
    `${c.name} (${c.role || 'no role'}): Goals — ${c.goals || 'none listed'}. Fears — ${c.fears || 'none listed'}.`
  ).join('\n')
  const relSummaries = relationships.map(r => {
    const a = characters.find(c => c.id === r.character_a)
    const b = characters.find(c => c.id === r.character_b)
    return `${a?.name} ↔ ${b?.name}: ${r.type}, tension ${r.tension ?? 0}/100. ${r.status || ''}`
  }).join('\n')

  return {
    systemPrompt: `You are Anchor — a story bible reader, not a writer. You read what the writer has built and reflect it back clearly. You never suggest what should happen next. You never generate new content. You only surface what is already there — patterns, tensions, states. Be concise. Respond only in the JSON format requested.`,
    prompt: `Here is the story bible for "${project.title}":

CHARACTERS:
${charSummaries || 'None yet.'}

RELATIONSHIPS:
${relSummaries || 'None yet.'}

SCRIPT SO FAR:
${scriptText ? scriptText.slice(0, 3000) : 'Nothing written yet.'}

Return a JSON object with exactly these three keys:
{
  "whereYouAre": "One paragraph (2-4 sentences) reflecting where the story currently stands based only on what has been written. No suggestions. Just a clear-eyed summary of the current state.",
  "dynamics": ["Up to 3 short observations about character dynamics or relationship tensions that are already present in the bible. Each under 20 words. Only observations, never suggestions."],
  "pulse": ["Up to 4 short scene or story beat labels in chronological order from the script, each under 8 words. If no script, return empty array."]
}

Return only valid JSON. No preamble, no markdown.`
  }
}

export default function BibleDashboard({ project, characters, relationships, locations, script, onNavigate, onUpdateRelationship, pulseCache, setPulseCache, pulseScriptId, setPulseScriptId }) {
  const words = script?.content ? script.content.replace(/\[\w+\]/g,'').split(/\s+/).filter(Boolean).length : 0
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  // Use cached pulse if available, fall back to local state
  const insights    = pulseCache || null
  const setInsights = setPulseCache || (() => {})

  // Full Read state
  const [fullRead, setFullRead]           = useState(null)
  const [fullReadLoading, setFullReadLoading] = useState(false)
  const [fullReadError, setFullReadError] = useState('')
  const [fullReadOpen, setFullReadOpen]   = useState(false)
  const [confirmingShifts, setConfirmingShifts] = useState({}) // relKey → bool

  useEffect(() => {
    if (characters.length === 0) return
    // Run if no cache exists, or if script has changed since last run
    if (!pulseCache || (script?.id && script.id !== pulseScriptId)) {
      loadInsights()
    }
  }, [project.id])

  async function loadInsights() {
    setInsightsLoading(true)
    setInsightsError('')
    try {
      const prompt = buildInsightsPrompt({ project, characters, relationships, script })
      const raw = await callAI(prompt)
      const clean = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setInsights(parsed)
      if (setPulseScriptId && script?.id) setPulseScriptId(script.id)
    } catch(e) {
      setInsightsError('Insights unavailable')
    }
    setInsightsLoading(false)
  }

  async function runFullRead() {
    if (!script?.content) return
    setFullReadLoading(true)
    setFullReadError('')
    setFullRead(null)
    setFullReadOpen(true)
    try {
      const prompt = buildFullReadPrompt({ project, characters, relationships, script })
      const raw    = await callAI(prompt)
      const clean  = raw.replace(/```json|```/g, '').trim()
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON returned')
      setFullRead(JSON.parse(jsonMatch[0]))
    } catch(e) {
      setFullReadError('Full Read failed: ' + e.message)
    }
    setFullReadLoading(false)
  }

  async function confirmRelShift(shift) {
    const key = `${shift.characterA}-${shift.characterB}`
    const charA = characters.find(c => c.name === shift.characterA)
    const charB = characters.find(c => c.name === shift.characterB)
    if (!charA || !charB || !onUpdateRelationship) return
    const rel = relationships.find(r =>
      (r.character_a === charA.id && r.character_b === charB.id) ||
      (r.character_a === charB.id && r.character_b === charA.id)
    )
    if (!rel) return
    setConfirmingShifts(s => ({ ...s, [key]: true }))
    const currentArc = Array.isArray(rel.arc) ? rel.arc : []
    const newEntry = {
      act:       shift.act,
      type:      shift.type,
      tension:   shift.tension,
      note:      shift.shift,
      timestamp: new Date().toISOString(),
    }
    await onUpdateRelationship(rel.id, {
      type:    shift.type,
      tension: shift.tension,
      arc:     [...currentArc, newEntry],
    })
    setConfirmingShifts(s => ({ ...s, [key]: true }))
  }

  return (
    <div style={{ flex:1, overflow:'auto', padding:'28px 32px', background:'var(--bg)' }}>

      {/* Header */}
      <div style={{ marginBottom:28, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:30, color:'var(--gold)', fontWeight:300, marginBottom:5 }}>{project.title}</div>
          {project.logline && <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontStyle:'italic', color:'var(--muted)', maxWidth:520, lineHeight:1.55, marginBottom:10, fontWeight:300 }}>{project.logline}</div>}
          <div style={{ display:'flex', gap:8 }}>
            {project.genre && <span style={{ fontSize:10, color:'var(--muted)', background:'var(--s2)', border:'1px solid var(--edge)', padding:'2px 9px', borderRadius:4, fontWeight:500 }}>{project.genre}</span>}
            <span style={{ fontSize:10, color:'var(--muted)', background:'var(--s2)', border:'1px solid var(--edge)', padding:'2px 9px', borderRadius:4, fontWeight:500 }}>{FORMAT_LABELS[project.format]}</span>
          </div>
        </div>

        {/* Full Read button */}
        {script?.content && characters.length > 0 && (
          <button
            onClick={runFullRead}
            disabled={fullReadLoading}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 18px', borderRadius:8, background:'var(--s1)', border:'1px solid rgba(200,169,106,.3)', color:'var(--gold)', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'var(--font-ui)', flexShrink:0, transition:'all .15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--gold)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='rgba(200,169,106,.3)'}
          >
            {fullReadLoading
              ? <><Dot delay={0}/><Dot delay={0.2}/><Dot delay={0.4}/> Running Full Read…</>
              : <>✦ Full Read</>
            }
          </button>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:24 }}>
        {[['◉','Characters',characters.length,'characters'],['⬡','Relationships',relationships.length,'ties'],['◎','Locations',locations.length,'locations'],['▤','Words',words.toLocaleString(),'write']].map(([icon,label,val,mod]) => (
          <div key={label} style={{ background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:10, padding:'14px 16px', cursor:'pointer', transition:'border-color .15s' }}
            onClick={() => onNavigate(mod)}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--gold-dim)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--edge)'}
          >
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6, fontWeight:300 }}>{icon} {label}</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:28, color:'var(--gold)', fontWeight:300 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Full Read results panel */}
      {fullReadOpen && (
        <div style={{ background:'var(--s1)', border:'1px solid rgba(200,169,106,.2)', borderRadius:10, padding:'18px 20px', marginBottom:24 }} className="fade-in">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <span style={{ fontSize:10, fontWeight:500, color:'var(--gold)', textTransform:'uppercase', letterSpacing:'.08em' }}>Full Read</span>
              <span style={{ fontSize:10, color:'var(--dim)', marginLeft:8, fontWeight:300 }}>Complete audit of your script against your bible</span>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={runFullRead} disabled={fullReadLoading} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontWeight:300, opacity: fullReadLoading ? 0.4 : 1 }}>↻ Re-run</button>
              <button onClick={() => setFullReadOpen(false)} style={{ fontSize:11, color:'var(--dim)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
            </div>
          </div>

          {fullReadLoading && (
            <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--dim)', fontSize:13, fontWeight:300, padding:'20px 0' }}>
              <span style={{ display:'inline-flex', gap:4 }}><Dot delay={0}/><Dot delay={0.2}/><Dot delay={0.4}/></span>
              Anchor is reading your full script…
            </div>
          )}

          {fullReadError && !fullReadLoading && (
            <div style={{ fontSize:12, color:'var(--danger)', fontWeight:300 }}>{fullReadError}</div>
          )}

          {fullRead && !fullReadLoading && (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

              {/* Overall note */}
              {fullRead.overallNote && (
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8, fontWeight:500 }}>Overall</div>
                  <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, fontWeight:300, fontFamily:'var(--font-display)', fontStyle:'italic' }}>{fullRead.overallNote}</div>
                </div>
              )}

              {/* Act breaks */}
              {fullRead.actBreaks?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10, fontWeight:500 }}>Act structure</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                    {fullRead.actBreaks.map((act, i) => (
                      <div key={i} style={{ display:'flex', gap:12, position:'relative' }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0, width:16 }}>
                          <div style={{ width:10, height:10, borderRadius:'50%', background: i === fullRead.actBreaks.length-1 ? 'var(--gold)' : 'var(--s3)', border:`2px solid var(--gold)`, marginTop:3, flexShrink:0 }} />
                          {i < fullRead.actBreaks.length-1 && <div style={{ width:1, flex:1, background:'var(--edge)', margin:'3px 0' }} />}
                        </div>
                        <div style={{ flex:1, paddingBottom: i < fullRead.actBreaks.length-1 ? 14 : 0 }}>
                          <div style={{ fontSize:12, color:'var(--gold)', fontWeight:500, marginBottom:2 }}>{act.act}</div>
                          <div style={{ fontSize:12, color:'var(--muted)', fontWeight:300, lineHeight:1.5 }}>{act.description}</div>
                          {act.endsAt && <div style={{ fontSize:11, color:'var(--dim)', marginTop:3, fontWeight:300 }}>Ends: {act.endsAt}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Relationship shifts — confirm to update Ties That Bind */}
              {fullRead.relationshipShifts?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10, fontWeight:500 }}>
                    Relationship shifts found — confirm to update Ties That Bind
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {fullRead.relationshipShifts.map((shift, i) => {
                      const key       = `${shift.characterA}-${shift.characterB}`
                      const color     = REL_COLORS[shift.type] || 'var(--muted)'
                      const confirmed = confirmingShifts[key]
                      return (
                        <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', background:'var(--s2)', border:`1px solid ${confirmed ? 'var(--success)' : 'var(--edge)'}`, borderRadius:8, transition:'border-color .2s' }}>
                          <div style={{ flex:1 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                              <span style={{ fontSize:13, color:'var(--text)', fontWeight:400 }}>{shift.characterA}</span>
                              <span style={{ fontSize:10, color, background:color+'14', padding:'2px 8px', borderRadius:3, textTransform:'capitalize' }}>{shift.type}</span>
                              <span style={{ fontSize:13, color:'var(--text)', fontWeight:400 }}>{shift.characterB}</span>
                              <span style={{ fontSize:10, color:'var(--dim)', marginLeft:'auto' }}>{shift.act} · {shift.tension}/100</span>
                            </div>
                            <div style={{ fontSize:12, color:'var(--muted)', fontWeight:300, lineHeight:1.5 }}>{shift.shift}</div>
                          </div>
                          <button
                            onClick={() => confirmRelShift(shift)}
                            disabled={confirmed}
                            style={{ fontSize:11, padding:'5px 12px', borderRadius:5, border:'none', background: confirmed ? 'var(--success)' : 'var(--gold)', color:'var(--bg)', fontWeight:500, cursor: confirmed ? 'default' : 'pointer', fontFamily:'var(--font-ui)', flexShrink:0, opacity: confirmed ? 0.7 : 1 }}
                          >
                            {confirmed ? '✓ Added' : 'Add to arc'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Character drift */}
              {fullRead.characterDrift?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:10, fontWeight:500 }}>Character drift detected</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {fullRead.characterDrift.map((drift, i) => {
                      const char = characters.find(c => c.name === drift.character)
                      return (
                        <div key={i} style={{ display:'flex', gap:12, padding:'12px 14px', background:'var(--s2)', border:'1px solid rgba(248,81,73,.15)', borderRadius:8 }}>
                          {char && (
                            <div style={{ width:28, height:28, borderRadius:'50%', background:char.color+'18', border:`1px solid ${char.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:char.color, fontWeight:500, flexShrink:0 }}>{char.name?.charAt(0)}</div>
                          )}
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, color:'var(--text)', fontWeight:500, marginBottom:3 }}>{drift.character}</div>
                            <div style={{ fontSize:12, color:'var(--muted)', fontWeight:300, lineHeight:1.5, marginBottom:3 }}>{drift.observation}</div>
                            <div style={{ fontSize:11, color:'var(--dim)', fontWeight:300 }}>Bible says: {drift.bibleEntry}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Nothing found */}
              {!fullRead.characterDrift?.length && !fullRead.relationshipShifts?.length && (
                <div style={{ fontSize:13, color:'var(--success)', fontWeight:300 }}>✓ No drift or contradictions found — your script is consistent with your bible.</div>
              )}

            </div>
          )}
        </div>
      )}

      {/* Story Pulse panel */}
      {characters.length > 0 && (
        <div style={{ background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:10, padding:'18px 20px', marginBottom:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div>
              <span style={{ fontSize:10, fontWeight:500, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'.08em' }}>Story Pulse</span>
              <span style={{ fontSize:10, color:'var(--dim)', marginLeft:8, fontWeight:300 }}>Anchor reading your bible</span>
            </div>
            <button onClick={loadInsights} disabled={insightsLoading} style={{ fontSize:10, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontWeight:300, opacity: insightsLoading ? 0.4 : 1 }}>
              {insightsLoading ? '···' : '↻ Refresh'}
            </button>
          </div>

          {insightsLoading && (
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--dim)', fontSize:12, fontWeight:300 }}>
              <span style={{ display:'inline-flex', gap:3 }}><Dot delay={0}/><Dot delay={0.2}/><Dot delay={0.4}/></span>
              Reading your story…
            </div>
          )}

          {insightsError && !insightsLoading && (
            <div style={{ fontSize:12, color:'var(--dim)', fontStyle:'italic', fontWeight:300 }}>{insightsError}</div>
          )}

          {insights && !insightsLoading && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div style={{ gridColumn:'1 / -1' }}>
                <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6, fontWeight:500 }}>Where you are</div>
                <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, fontWeight:300, fontFamily:'var(--font-display)', fontStyle:'italic' }}>{insights.whereYouAre}</div>
              </div>
              {insights.dynamics?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8, fontWeight:500 }}>Character dynamics</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {insights.dynamics.map((d, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <span style={{ color:'var(--gold)', fontSize:10, marginTop:3, flexShrink:0 }}>◆</span>
                        <span style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5, fontWeight:300 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {insights.pulse?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8, fontWeight:500 }}>Story pulse</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                    {insights.pulse.map((beat, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                          <div style={{ width:7, height:7, borderRadius:'50%', background: i === insights.pulse.length-1 ? 'var(--gold)' : 'var(--edge)', border:`1px solid ${i === insights.pulse.length-1 ? 'var(--gold)' : 'var(--dim)'}`, marginTop:4 }} />
                          {i < insights.pulse.length-1 && <div style={{ width:1, height:18, background:'var(--edge)' }} />}
                        </div>
                        <span style={{ fontSize:12, color: i === insights.pulse.length-1 ? 'var(--text)' : 'var(--muted)', lineHeight:1.5, fontWeight: i === insights.pulse.length-1 ? 400 : 300, paddingBottom: i < insights.pulse.length-1 ? 10 : 0 }}>{beat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mini panels */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <Mini title="Characters" onMore={() => onNavigate('characters')}>
          {characters.length === 0 ? <Empty>No characters yet</Empty> : characters.slice(0,4).map(c => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 0', borderBottom:'1px solid var(--edge)' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:c.color+'14', border:`1px solid ${c.color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:c.color, fontWeight:500, flexShrink:0 }}>{c.name?.charAt(0)}</div>
              <div><div style={{ fontSize:12, color:'var(--text)', fontWeight:400 }}>{c.name}</div>{c.role && <div style={{ fontSize:10, color:'var(--muted)', fontWeight:300 }}>{c.role}</div>}</div>
            </div>
          ))}
        </Mini>

        <Mini title="Ties That Bind" onMore={() => onNavigate('ties')}>
          {relationships.length === 0 ? <Empty>No relationships mapped yet</Empty> : relationships.slice(0,4).map(r => {
            const a = characters.find(c=>c.id===r.character_a), b = characters.find(c=>c.id===r.character_b)
            const color = REL_COLORS[r.type]||'var(--muted)'
            return (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid var(--edge)' }}>
                <span style={{ fontSize:12, color:'var(--text)', fontWeight:400 }}>{a?.name}</span>
                <span style={{ fontSize:10, color, background:color+'12', padding:'1px 7px', borderRadius:3, textTransform:'capitalize', fontWeight:400 }}>{r.type}</span>
                <span style={{ fontSize:12, color:'var(--text)', fontWeight:400 }}>{b?.name}</span>
              </div>
            )
          })}
        </Mini>

        <Mini title="Locations" onMore={() => onNavigate('locations')}>
          {locations.length === 0 ? <Empty>No locations yet</Empty> : locations.slice(0,3).map(l => (
            <div key={l.id} style={{ padding:'7px 0', borderBottom:'1px solid var(--edge)' }}>
              <div style={{ fontSize:12, color:'var(--text)', fontWeight:400, marginBottom:2 }}>{l.name}</div>
              {l.atmosphere && <div style={{ fontSize:11, color:'var(--muted)', fontWeight:300 }}>{l.atmosphere.slice(0,70)}{l.atmosphere.length>70?'…':''}</div>}
            </div>
          ))}
        </Mini>

        <Mini title="Story" onMore={() => onNavigate('write')}>
          {!script ? <Empty>No script yet — start writing</Empty> : (
            <div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8, fontWeight:300 }}>{words.toLocaleString()} words</div>
              <div style={{ fontFamily:'var(--font-script)', fontSize:11, color:'var(--muted)', lineHeight:1.7, maxHeight:90, overflow:'hidden', maskImage:'linear-gradient(to bottom, black 50%, transparent)', fontWeight:300 }}>
                {script.content.replace(/\[\w+\]/g,'').slice(0,280)}
              </div>
            </div>
          )}
        </Mini>
      </div>
    </div>
  )
}

function Dot({ delay }) {
  return (
    <span style={{ display:'inline-block', width:5, height:5, borderRadius:'50%', background:'var(--gold)', opacity:0.4, animation:`pulse 1.2s ease-in-out ${delay}s infinite` }} />
  )
}

function Mini({ title, onMore, children }) {
  return (
    <div style={{ background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:10, padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:10, fontWeight:500, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'.08em' }}>{title}</span>
        <button onClick={onMore} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontWeight:300 }}>View all →</button>
      </div>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <div style={{ fontSize:12, color:'var(--dim)', fontStyle:'italic', padding:'10px 0', fontWeight:300 }}>{children}</div>
}
