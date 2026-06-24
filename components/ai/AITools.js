'use client'
import { useState } from 'react'
import { callAI, buildCharacterSimulatorPrompt, buildDialogueCheckerPrompt, buildSceneGeneratorPrompt, buildContinuityCheckerPrompt } from '../../lib/ai'

const TOOLS = [
  {id:'simulator', icon:'◉', label:'Character Simulator',    desc:'How would this character respond?'},
  {id:'dialogue',  icon:'◎', label:'Dialogue Consistency',   desc:'Does this match their voice?'},
  {id:'scene',     icon:'▤', label:'Scene Generator',        desc:'Generate a scene from the bible.'},
  {id:'continuity',icon:'◈', label:'Continuity Checker',     desc:'Find contradictions in the script.'},
]

export default function AITools({ project, characters, relationships, locations, script }) {
  const [active, setActive]   = useState('simulator')
  const [result, setResult]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const hasKey = typeof window !== 'undefined' && !!sessionStorage.getItem('anchor_api_key')

  async function run(promptObj) {
    setLoading(true); setResult(''); setError('')
    try { setResult(await callAI(promptObj)) }
    catch(e) { setError(e.message) }
    setLoading(false)
  }

  if (!hasKey) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:14, padding:40, background:'var(--bg)' }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:24, color:'var(--dim)', fontWeight:300 }}>AI tools need an API key</div>
      <div style={{ fontSize:13, color:'var(--muted)', maxWidth:340, textAlign:'center', lineHeight:1.6, fontWeight:300 }}>Add your Anthropic key in Settings (⚙). It's stored in your browser session only — never in the database.</div>
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      <div style={{ width:230, flexShrink:0, background:'var(--s1)', borderRight:'1px solid var(--edge)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'12px 14px 10px', borderBottom:'1px solid var(--edge)' }}>
          <div style={{ fontSize:11, fontWeight:500, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.07em' }}>AI Tools</div>
          <div style={{ fontSize:10, color:'var(--dim)', marginTop:2, fontWeight:300 }}>Powered by Claude — reads your bible</div>
        </div>
        <div style={{ padding:'8px 8px' }}>
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => { setActive(t.id); setResult(''); setError('') }} style={{ display:'flex', alignItems:'flex-start', gap:10, width:'100%', textAlign:'left', padding:'10px 10px', borderRadius:7, marginBottom:2, cursor:'pointer', background:active===t.id?'var(--gold-bg)':'transparent', border:`1px solid ${active===t.id?'rgba(200,169,106,.2)':'transparent'}`, transition:'all .1s' }}>
              <span style={{ fontSize:13, color:active===t.id?'var(--gold)':'var(--dim)', flexShrink:0, marginTop:1 }}>{t.icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:500, color:active===t.id?'var(--text)':'var(--muted)' }}>{t.label}</div>
                <div style={{ fontSize:10, color:'var(--dim)', lineHeight:1.4, marginTop:2, fontWeight:300 }}>{t.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'28px 32px' }}>
        {active === 'simulator'  && <CharacterSimulator  characters={characters} relationships={relationships} onRun={run} loading={loading} />}
        {active === 'dialogue'   && <DialogueChecker     characters={characters} onRun={run} loading={loading} />}
        {active === 'scene'      && <SceneGenerator      characters={characters} locations={locations} project={project} onRun={run} loading={loading} />}
        {active === 'continuity' && <ContinuityChecker   characters={characters} relationships={relationships} script={script} onRun={run} loading={loading} />}

        {loading && <div style={{ marginTop:24, display:'flex', alignItems:'center', gap:10, color:'var(--muted)', fontSize:13, fontWeight:300 }}><Spinner /> Claude is thinking…</div>}
        {error   && <div style={{ marginTop:24, padding:14, background:'rgba(248,81,73,.08)', border:'1px solid rgba(248,81,73,.2)', borderRadius:8, fontSize:13, color:'var(--danger)', fontWeight:300 }}>{error}</div>}
        {result && !loading && (
          <div style={{ marginTop:24 }} className="fade-in">
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10, fontWeight:500 }}>Result</div>
            <pre style={{ fontFamily:'var(--font-ui)', fontSize:13, lineHeight:1.75, whiteSpace:'pre-wrap', wordBreak:'break-word', color:'var(--text)', background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:8, padding:'16px 18px', margin:0, fontWeight:300 }}>{result}</pre>
          </div>
        )}
      </div>
    </div>
  )
}

function CharacterSimulator({ characters, relationships, onRun, loading }) {
  const [charId, setCharId] = useState('')
  const [sit, setSit]       = useState('')
  function run() {
    const c = characters.find(x=>x.id===charId)
    if (!c||!sit.trim()) return
    onRun(buildCharacterSimulatorPrompt({ character:c, situation:sit, relationships, allCharacters:characters }))
  }
  return <Tool title="Character Simulator" sub="How would this character respond, in their own voice?">
    <Sel label="Character" value={charId} onChange={setCharId} options={characters} />
    <Field label="Situation"><textarea value={sit} onChange={e=>setSit(e.target.value)} placeholder="Describe the situation…" rows={3} /></Field>
    <button className="btn btn-gold" onClick={run} disabled={loading||!charId||!sit.trim()}>✦ Simulate</button>
  </Tool>
}

function DialogueChecker({ characters, onRun, loading }) {
  const [charId, setCharId] = useState('')
  const [dlg, setDlg]       = useState('')
  function run() {
    const c = characters.find(x=>x.id===charId)
    if (!c||!dlg.trim()) return
    onRun(buildDialogueCheckerPrompt({ character:c, dialogue:dlg }))
  }
  return <Tool title="Dialogue Consistency" sub="Does this dialogue match the character's established voice?">
    <Sel label="Character" value={charId} onChange={setCharId} options={characters} />
    <Field label="Dialogue to check"><textarea value={dlg} onChange={e=>setDlg(e.target.value)} placeholder="Paste dialogue lines here…" rows={5} /></Field>
    <button className="btn btn-gold" onClick={run} disabled={loading||!charId||!dlg.trim()}>✦ Check consistency</button>
  </Tool>
}

function SceneGenerator({ characters, locations, project, onRun, loading }) {
  const [charIds, setCharIds] = useState([])
  const [locId, setLocId]     = useState('')
  const [sit, setSit]         = useState('')
  const toggle = id => setCharIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id])
  function run() {
    const chars = characters.filter(c=>charIds.includes(c.id))
    const loc   = locations.find(l=>l.id===locId)
    if (!chars.length||!sit.trim()) return
    onRun(buildSceneGeneratorPrompt({ characters:chars, location:loc, situation:sit, format:project.format }))
  }
  return <Tool title="Scene Generator" sub="Pick characters, a location, and the situation — Anchor writes the scene.">
    <Field label="Characters in scene">
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:4 }}>
        {characters.map(c => (
          <button key={c.id} onClick={()=>toggle(c.id)} style={{ padding:'4px 10px', borderRadius:4, fontSize:12, cursor:'pointer', background:charIds.includes(c.id)?c.color+'18':'var(--s2)', border:`1px solid ${charIds.includes(c.id)?c.color:'var(--edge)'}`, color:charIds.includes(c.id)?c.color:'var(--muted)', fontFamily:'var(--font-ui)' }}>{c.name}</button>
        ))}
      </div>
    </Field>
    <Field label="Location (optional)">
      <select value={locId} onChange={e=>setLocId(e.target.value)}>
        <option value="">No specific location</option>
        {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </Field>
    <Field label="What happens?"><textarea value={sit} onChange={e=>setSit(e.target.value)} placeholder="The dramatic situation, conflict, or story beat…" rows={3} /></Field>
    <button className="btn btn-gold" onClick={run} disabled={loading||!charIds.length||!sit.trim()}>✦ Generate scene</button>
  </Tool>
}

function ContinuityChecker({ characters, relationships, script, onRun, loading }) {
  function run() {
    if (!script?.content) return
    onRun(buildContinuityCheckerPrompt({ scriptContent:script.content, characters, relationships }))
  }
  return <Tool title="Continuity Checker" sub="Reads your script against the bible and flags contradictions.">
    {!script?.content
      ? <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic', fontWeight:300 }}>Write something in the Write module first.</div>
      : <><div style={{ fontSize:13, color:'var(--muted)', marginBottom:16, fontWeight:300 }}>Will check {script.content.split(/\s+/).length.toLocaleString()} words against {characters.length} characters and {relationships.length} relationships.</div>
        <button className="btn btn-gold" onClick={run} disabled={loading}>✦ Check continuity</button></>
    }
  </Tool>
}

function Tool({ title, sub, children }) {
  return (
    <div style={{ maxWidth:560 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:24, color:'var(--text)', marginBottom:6, fontWeight:300 }}>{title}</div>
      <div style={{ fontSize:13, color:'var(--muted)', marginBottom:24, lineHeight:1.5, fontWeight:300 }}>{sub}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>
}

function Sel({ label, value, onChange, options }) {
  return <Field label={label}>
    <select value={value} onChange={e=>onChange(e.target.value)}>
      <option value="">Select…</option>
      {options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  </Field>
}

function Spinner() {
  return <span style={{ display:'inline-block', width:12, height:12, borderRadius:'50%', border:'1.5px solid var(--edge)', borderTopColor:'var(--gold)', animation:'spin .7s linear infinite' }} />
}
