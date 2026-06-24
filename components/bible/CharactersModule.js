'use client'
import { useState } from 'react'

const FIELDS = [
  {key:'role',        label:'Role in story',       placeholder:'Protagonist, antagonist…',          rows:1},
  {key:'age',         label:'Age',                  placeholder:'Age or range',                       rows:1},
  {key:'backstory',   label:'Backstory',            placeholder:'Who are they before the story?',    rows:3},
  {key:'goals',       label:'Goals',                placeholder:'What do they want above all else?', rows:2},
  {key:'fears',       label:'Fears',                placeholder:'What would break them?',            rows:2},
  {key:'motivations', label:'Motivations',          placeholder:'Why do they want what they want?',  rows:2},
  {key:'personality', label:'Personality',          placeholder:'How do they move through the world?',rows:2},
  {key:'voice',       label:'Voice & speech patterns',placeholder:'How do they talk? Rhythm, vocabulary, what they avoid…',rows:2},
  {key:'notes',       label:'Notes',                placeholder:'Anything else worth tracking…',     rows:2},
]

const COLORS = ['#C8A96A','#58A6FF','#3FB950','#DB61A2','#FF7B72','#D2A8FF','#FFA657','#38BDAE']

export default function CharactersModule({ characters, onCreateCharacter, onUpdateCharacter, onDeleteCharacter }) {
  const [sel, setSel]       = useState(null)
  const [form, setForm]     = useState({})
  const [dirty, setDirty]   = useState(false)
  const [saving, setSaving] = useState(false)

  function select(c) { setSel(c); setForm({...c}); setDirty(false) }

  function field(k,v) { setForm(f=>({...f,[k]:v})); setDirty(true) }

  async function save() {
    if (!sel) return
    setSaving(true)
    await onUpdateCharacter(sel.id, form)
    setSaving(false); setDirty(false)
  }

  async function create() {
    const c = await onCreateCharacter()
    if (c) select(c)
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      {/* List */}
      <div style={{ width:210, flexShrink:0, background:'var(--s1)', borderRight:'1px solid var(--edge)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'12px 10px', borderBottom:'1px solid var(--edge)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:10, fontWeight:500, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'.08em' }}>Characters</span>
          <button className="btn btn-gold btn-xs" onClick={create} style={{ padding:'3px 9px', fontSize:11 }}>+ Add</button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:'8px 6px' }}>
          {characters.length === 0 && <div style={{ fontSize:12, color:'var(--dim)', padding:'12px 8px', fontStyle:'italic', fontWeight:300 }}>No characters yet</div>}
          {characters.map(c => (
            <div key={c.id} onClick={() => select(c)} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 8px', borderRadius:6, marginBottom:2, cursor:'pointer', background:sel?.id===c.id?'var(--gold-bg)':'transparent', border:`1px solid ${sel?.id===c.id?'rgba(200,169,106,.2)':'transparent'}`, transition:'all .1s' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:c.color+'14', border:`1px solid ${c.color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:c.color, fontWeight:500, flexShrink:0 }}>{c.name?.charAt(0)}</div>
              <div style={{ overflow:'hidden' }}>
                <div style={{ fontSize:12, color:sel?.id===c.id?'var(--text)':'var(--muted)', fontWeight:sel?.id===c.id?400:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
                {c.role && <div style={{ fontSize:10, color:'var(--dim)', fontWeight:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.role}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      {sel ? (
        <div style={{ flex:1, overflow:'auto', padding:'28px 32px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:24 }}>
            <div style={{ width:50, height:50, borderRadius:'50%', background:form.color+'14', border:`2px solid ${form.color}50`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, color:form.color, fontWeight:500, flexShrink:0 }}>{form.name?.charAt(0)}</div>
            <div style={{ flex:1 }}>
              <input value={form.name||''} onChange={e=>field('name',e.target.value)} style={{ background:'none', border:'none', fontSize:26, fontFamily:'var(--font-display)', color:'var(--text)', fontWeight:300, width:'100%', padding:0, marginBottom:8 }} placeholder="Character name" />
              <div style={{ display:'flex', gap:5 }}>
                {COLORS.map(col => (
                  <div key={col} onClick={()=>field('color',col)} style={{ width:16, height:16, borderRadius:'50%', background:col, cursor:'pointer', border:`2px solid ${form.color===col?'white':'transparent'}`, transition:'border .1s' }} />
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              {dirty && <button className="btn btn-gold btn-sm" onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button>}
              <button className="btn btn-danger btn-sm" onClick={()=>{ if(confirm(`Delete ${sel.name}?`)){onDeleteCharacter(sel.id);setSel(null)} }}>Delete</button>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, maxWidth:820 }}>
            {FIELDS.map(f => (
              <div key={f.key} className="field">
                <label>{f.label}</label>
                {f.rows===1
                  ? <input value={form[f.key]||''} onChange={e=>field(f.key,e.target.value)} placeholder={f.placeholder} />
                  : <textarea value={form[f.key]||''} onChange={e=>field(f.key,e.target.value)} placeholder={f.placeholder} rows={f.rows} />
                }
              </div>
            ))}
          </div>

          {dirty && <div style={{ marginTop:20 }}><button className="btn btn-gold" onClick={save} disabled={saving}>{saving?'Saving…':'Save changes'}</button></div>}
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--muted)' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:22, color:'var(--dim)', fontWeight:300 }}>Select a character</div>
          <div style={{ fontSize:13, fontWeight:300 }}>or add a new one to begin</div>
        </div>
      )}
    </div>
  )
}
