'use client'
import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const FIELDS = [
  {key:'description', label:'Description',       placeholder:'What does this place look like?',   rows:3},
  {key:'atmosphere',  label:'Atmosphere & mood', placeholder:'What does it feel like to be here?', rows:2},
  {key:'notes',       label:'Notes',             placeholder:'Story significance, events…',        rows:2},
]

export default function LocationsModule({ project, locations, onCreateLocation, onUpdateLocation, onDeleteLocation }) {
  const [sel, setSel]         = useState(null)
  const [form, setForm]       = useState({})
  const [dirty, setDirty]     = useState(false)
  const [saving, setSaving]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  function select(l) { setSel(l); setForm({...l}); setDirty(false) }
  function field(k,v) { setForm(f=>({...f,[k]:v})); setDirty(true) }

  async function save() {
    if (!sel) return
    setSaving(true)
    await onUpdateLocation(sel.id, form)
    setSaving(false); setDirty(false)
  }

  async function create() {
    const l = await onCreateLocation()
    if (l) select(l)
  }

  async function uploadImage(e) {
    const file = e.target.files?.[0]
    if (!file || !sel) return
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `${project.id}/${sel.id}.${ext}`
    const { error } = await supabase.storage.from('location-images').upload(path, file, { upsert:true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('location-images').getPublicUrl(path)
      field('image_url', publicUrl)
      await onUpdateLocation(sel.id, { ...form, image_url: publicUrl })
    }
    setUploading(false)
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', background:'var(--bg)' }}>
      <div style={{ width:200, flexShrink:0, background:'var(--s1)', borderRight:'1px solid var(--edge)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'12px 10px', borderBottom:'1px solid var(--edge)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:10, fontWeight:500, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'.08em' }}>Locations</span>
          <button className="btn btn-gold btn-xs" onClick={create} style={{ padding:'3px 9px', fontSize:11 }}>+ Add</button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:'8px 6px' }}>
          {locations.length === 0 && <div style={{ fontSize:12, color:'var(--dim)', padding:'12px 8px', fontStyle:'italic', fontWeight:300 }}>No locations yet</div>}
          {locations.map(l => (
            <div key={l.id} onClick={()=>select(l)} style={{ padding:'9px 8px', borderRadius:6, marginBottom:2, cursor:'pointer', background:sel?.id===l.id?'var(--gold-bg)':'transparent', border:`1px solid ${sel?.id===l.id?'rgba(200,169,106,.2)':'transparent'}` }}>
              {l.image_url && <div style={{ width:'100%', height:44, borderRadius:4, overflow:'hidden', marginBottom:5 }}><img src={l.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /></div>}
              <div style={{ fontSize:12, color:sel?.id===l.id?'var(--text)':'var(--muted)', fontWeight:sel?.id===l.id?400:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.name}</div>
            </div>
          ))}
        </div>
      </div>

      {sel ? (
        <div style={{ flex:1, overflow:'auto', padding:'28px 32px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22, gap:12 }}>
            <input value={form.name||''} onChange={e=>field('name',e.target.value)} style={{ background:'none', border:'none', fontSize:28, fontFamily:'var(--font-display)', color:'var(--text)', fontWeight:300, flex:1, padding:0 }} placeholder="Location name" />
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              {dirty && <button className="btn btn-gold btn-sm" onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button>}
              <button className="btn btn-danger btn-sm" onClick={()=>{ if(confirm('Delete this location?')){onDeleteLocation(sel.id);setSel(null)} }}>Delete</button>
            </div>
          </div>

          {form.image_url ? (
            <div style={{ position:'relative', borderRadius:8, overflow:'hidden', marginBottom:20, maxHeight:240 }}>
              <img src={form.image_url} alt={form.name} style={{ width:'100%', objectFit:'cover', display:'block' }} />
              <button onClick={()=>fileRef.current?.click()} style={{ position:'absolute', bottom:10, right:10, background:'rgba(0,0,0,.7)', color:'white', border:'1px solid rgba(255,255,255,.2)', borderRadius:5, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>
                {uploading?'Uploading…':'Replace image'}
              </button>
            </div>
          ) : (
            <div onClick={()=>fileRef.current?.click()} style={{ border:'1px dashed var(--edge)', borderRadius:8, padding:32, textAlign:'center', cursor:'pointer', color:'var(--dim)', fontSize:13, marginBottom:20, fontWeight:300 }}>
              {uploading?'Uploading…':'+ Add reference image'}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={uploadImage} style={{ display:'none' }} />

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, maxWidth:780 }}>
            {FIELDS.map(f => (
              <div key={f.key} className="field">
                <label>{f.label}</label>
                <textarea value={form[f.key]||''} onChange={e=>field(f.key,e.target.value)} placeholder={f.placeholder} rows={f.rows} />
              </div>
            ))}
          </div>

          {dirty && <div style={{ marginTop:20 }}><button className="btn btn-gold" onClick={save} disabled={saving}>{saving?'Saving…':'Save changes'}</button></div>}
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--muted)' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:22, color:'var(--dim)', fontWeight:300 }}>Select a location</div>
          <div style={{ fontSize:13, fontWeight:300 }}>or add a new one to begin</div>
        </div>
      )}
    </div>
  )
}
