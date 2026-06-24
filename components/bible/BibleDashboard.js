'use client'
import { useState, useEffect } from 'react'
import { callAI } from '../../lib/ai'

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
    system: `You are Anchor — a story bible reader, not a writer. You read what the writer has built and reflect it back clearly. You never suggest what should happen next. You never generate new content. You only surface what is already there — patterns, tensions, states. Be concise. Respond only in the JSON format requested.`,
    messages: [{
      role: 'user',
      content: `Here is the story bible for "${project.title}":

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
    }]
  }
}

export default function BibleDashboard({ project, characters, relationships, locations, script, onNavigate }) {
  const words = script?.content ? script.content.replace(/\[\w+\]/g,'').split(/\s+/).filter(Boolean).length : 0
  const [insights, setInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')

  useEffect(() => {
    if (characters.length > 0) loadInsights()
  }, [project.id])

  async function loadInsights() {
    setInsightsLoading(true)
    setInsightsError('')
    try {
      const prompt = buildInsightsPrompt({ project, characters, relationships, script })
      const raw = await callAI(prompt)
      const clean = raw.replace(/```json|```/g, '').trim()
      setInsights(JSON.parse(clean))
    } catch(e) {
      setInsightsError('Insights unavailable')
    }
    setInsightsLoading(false)
  }

  return (
    <div style={{ flex:1, overflow:'auto', padding:'28px 32px', background:'var(--bg)' }}>
      <div style={{ marginBottom:28 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:30, color:'var(--gold)', fontWeight:300, marginBottom:5 }}>{project.title}</div>
        {project.logline && <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontStyle:'italic', color:'var(--muted)', maxWidth:520, lineHeight:1.55, marginBottom:10, fontWeight:300 }}>{project.logline}</div>}
        <div style={{ display:'flex', gap:8 }}>
          {project.genre && <span style={{ fontSize:10, color:'var(--muted)', background:'var(--s2)', border:'1px solid var(--edge)', padding:'2px 9px', borderRadius:4, fontWeight:500 }}>{project.genre}</span>}
          <span style={{ fontSize:10, color:'var(--muted)', background:'var(--s2)', border:'1px solid var(--edge)', padding:'2px 9px', borderRadius:4, fontWeight:500 }}>{FORMAT_LABELS[project.format]}</span>
        </div>
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

      {/* AI Insights panel */}
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
              <span style={{ display:'inline-flex', gap:3 }}>
                <Dot delay={0}/><Dot delay={0.2}/><Dot delay={0.4}/>
              </span>
              Reading your story…
            </div>
          )}

          {insightsError && !insightsLoading && (
            <div style={{ fontSize:12, color:'var(--dim)', fontStyle:'italic', fontWeight:300 }}>{insightsError}</div>
          )}

          {insights && !insightsLoading && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

              {/* Where You Are */}
              <div style={{ gridColumn:'1 / -1' }}>
                <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6, fontWeight:500 }}>Where you are</div>
                <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.7, fontWeight:300, fontFamily:'var(--font-display)', fontStyle:'italic' }}>{insights.whereYouAre}</div>
              </div>

              {/* Character Dynamics */}
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

              {/* Story Pulse timeline */}
              {insights.pulse?.length > 0 && (
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:8, fontWeight:500 }}>Story pulse</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                    {insights.pulse.map((beat, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                          <div style={{ width:7, height:7, borderRadius:'50%', background: i === insights.pulse.length - 1 ? 'var(--gold)' : 'var(--edge)', border:`1px solid ${i === insights.pulse.length - 1 ? 'var(--gold)' : 'var(--dim)'}`, marginTop:4 }} />
                          {i < insights.pulse.length - 1 && <div style={{ width:1, height:18, background:'var(--edge)' }} />}
                        </div>
                        <span style={{ fontSize:12, color: i === insights.pulse.length - 1 ? 'var(--text)' : 'var(--muted)', lineHeight:1.5, fontWeight: i === insights.pulse.length - 1 ? 400 : 300, paddingBottom: i < insights.pulse.length - 1 ? 10 : 0 }}>{beat}</span>
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
    <span style={{
      display:'inline-block', width:5, height:5, borderRadius:'50%',
      background:'var(--gold)', opacity:0.4,
      animation:`pulse 1.2s ease-in-out ${delay}s infinite`
    }} />
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
