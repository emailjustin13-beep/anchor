'use client'
import { useState, useEffect } from 'react'

export default function Settings({ onClose }) {
  const [key, setKey]     = useState('')
  const [saved, setSaved] = useState(false)
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    const k = sessionStorage.getItem('anchor_api_key')
    if (k) { setKey(k); setHasKey(true) }
  }, [])

  function save() {
    if (!key.trim()) return
    sessionStorage.setItem('anchor_api_key', key.trim())
    setHasKey(true); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function remove() {
    sessionStorage.removeItem('anchor_api_key')
    setKey(''); setHasKey(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div className="card" style={{ width:420, padding:'28px 30px' }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:24, color:'var(--gold)', fontWeight:300, marginBottom:4 }}>Settings</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:24, fontWeight:300 }}>Anchor</div>

        <div style={{ borderTop:'1px solid var(--edge)', paddingTop:20, marginBottom:20 }}>
          <div style={{ fontWeight:500, fontSize:13, marginBottom:6 }}>Anthropic API Key</div>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6, marginBottom:14, fontWeight:300 }}>
            Required for all AI features. Stored in your browser session only — never saved to the database or sent anywhere except Anthropic.{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color:'var(--gold)' }}>Get a key →</a>
          </div>

          {hasKey && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'8px 12px', background:'rgba(63,185,80,.08)', border:'1px solid rgba(63,185,80,.18)', borderRadius:6 }}>
              <span style={{ fontSize:12, color:'var(--success)' }}>✓ API key active</span>
              <button onClick={remove} style={{ marginLeft:'auto', fontSize:11, color:'var(--danger)', cursor:'pointer', background:'none', border:'none', fontFamily:'var(--font-ui)' }}>Remove</button>
            </div>
          )}

          <div className="field">
            <label>{hasKey?'Replace key':'Anthropic key'}</label>
            <input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="sk-ant-…" onKeyDown={e=>e.key==='Enter'&&save()} />
          </div>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-gold" onClick={save} disabled={!key.trim()}>{saved?'✓ Saved':'Save key'}</button>
        </div>
      </div>
    </div>
  )
}
