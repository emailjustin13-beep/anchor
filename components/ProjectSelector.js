'use client'
import { useState } from 'react'
import FirstRead from './bible/FirstRead'

const FORMAT_ICONS  = { screenplay: '🎬', novel: '📖', short_story: '✍️' }
const FORMAT_LABELS = { screenplay: 'Screenplay', novel: 'Novel', short_story: 'Short Story' }

export default function ProjectSelector({ projects, onCreate, onSelect, onDelete }) {
  const [creating, setCreating]       = useState(false)
  const [form, setForm]               = useState({ title: '', logline: '', genre: '', format: 'screenplay' })
  const [scriptPaste, setScriptPaste] = useState('')
  const [saving, setSaving]           = useState(false)
  const [firstRead, setFirstRead]     = useState(null) // { projectId } when active

  async function submit() {
    if (!form.title.trim()) return
    setSaving(true)
    const project = await onCreate(form)

    // If they pasted a script, save it then launch First Read
    if (scriptPaste.trim() && project) {
      const { supabase } = await import('../lib/supabase')
      await supabase.from('scripts').insert({
        project_id: project.id,
        title:      form.title,
        content:    scriptPaste.trim(),
      })
      setCreating(false)
      setSaving(false)
      setFirstRead({ projectId: project.id, project })
      return
    }

    setForm({ title: '', logline: '', genre: '', format: 'screenplay' })
    setScriptPaste('')
    setCreating(false)
    setSaving(false)
  }

  function cancelCreate() {
    setCreating(false)
    setForm({ title: '', logline: '', genre: '', format: 'screenplay' })
    setScriptPaste('')
  }

  function handleFirstReadComplete(charCount, relCount) {
    // Navigate into the project
    if (firstRead?.project) onSelect(firstRead.project)
    setFirstRead(null)
  }

  function handleFirstReadCancel() {
    // Still open the project, just without First Read
    if (firstRead?.project) onSelect(firstRead.project)
    setFirstRead(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* First Read overlay */}
      {firstRead && (
        <FirstRead
          scriptText={scriptPaste}
          format={form.format}
          projectId={firstRead.projectId}
          onComplete={handleFirstReadComplete}
          onCancel={handleFirstReadCancel}
        />
      )}

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '80px 24px 64px', borderBottom: '1px solid var(--edge)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(200,169,106,.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ width: 28, height: 1, background: 'var(--gold)', opacity: .35, margin: '0 auto 28px' }} />
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 58, fontWeight: 200, color: 'var(--gold)', letterSpacing: '18px', textTransform: 'uppercase', paddingLeft: '18px', marginBottom: 20, lineHeight: 1 }}>
          Anchor
        </div>
        <div style={{ fontSize: 13, fontWeight: 300, color: 'var(--muted)', letterSpacing: '.04em' }}>
          We don't write your story. We help you stay true to it.
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 860, margin: '0 auto', width: '100%', padding: '40px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Your story bibles</span>
          <button className="btn btn-gold btn-sm" onClick={() => setCreating(true)}>+ New story bible</button>
        </div>

        {/* Create form */}
        {creating && (
          <div className="card fade-in" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--gold)', fontWeight: 300 }}>New story bible</div>

            <div className="field">
              <label>Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What's this story called?" autoFocus />
            </div>

            <div className="field">
              <label>Logline</label>
              <textarea value={form.logline} onChange={e => setForm(f => ({ ...f, logline: e.target.value }))} placeholder="One sentence. What is this story about at its core?" rows={2} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Genre</label>
                <input value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} placeholder="e.g. Thriller, Drama, Sci-Fi" />
              </div>
              <div className="field">
                <label>Format</label>
                <select value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>
                  <option value="screenplay">Screenplay</option>
                  <option value="novel">Novel</option>
                  <option value="short_story">Short Story</option>
                </select>
              </div>
            </div>

            {/* First Read section */}
            <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <div style={{ fontSize:12, color:'var(--text)', fontWeight:400 }}>Have an existing script?</div>
                <div style={{ fontSize:11, color:'var(--dim)', fontWeight:300 }}>Paste it below — Anchor will do a First Read</div>
              </div>
              <textarea
                value={scriptPaste}
                onChange={e => setScriptPaste(e.target.value)}
                placeholder="Paste your script here and Anchor will detect your characters, infer their traits, and map their relationships for you to confirm…"
                rows={6}
                style={{ fontSize: 12, fontWeight: 300, fontFamily: 'var(--font-script)', lineHeight: 1.7 }}
              />
              {scriptPaste.trim() && (
                <div style={{ fontSize:11, color:'var(--gold)', marginTop:6, fontWeight:300 }}>
                  ✦ First Read will run after you create the bible
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-gold" onClick={submit} disabled={saving || !form.title.trim()}>
                {saving ? 'Creating…' : scriptPaste.trim() ? 'Create + First Read' : 'Create'}
              </button>
              <button className="btn btn-ghost" onClick={cancelCreate}>Cancel</button>
            </div>
          </div>
        )}

        {/* Project grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {projects.map(p => (
            <div key={p.id} className="card" onClick={() => onSelect(p)}
              style={{ cursor: 'pointer', transition: 'border-color .15s', position: 'relative' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold-dim)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--edge)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <span style={{ fontSize: 15 }}>{FORMAT_ICONS[p.format]}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--s3)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>{FORMAT_LABELS[p.format]}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: 'var(--text)', fontWeight: 300, marginBottom: 6 }}>{p.title}</div>
              {p.logline && <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 12, fontWeight: 300 }}>{p.logline}</div>}
              <div style={{ fontSize: 10, color: 'var(--dim)', borderTop: '1px solid var(--edge)', paddingTop: 10, marginTop: p.logline ? 0 : 12 }}>
                {p.genre && <span>{p.genre} &nbsp;·&nbsp; </span>}
                {FORMAT_LABELS[p.format]}
              </div>
              <button
                onClick={e => { e.stopPropagation(); if (confirm(`Delete "${p.title}"?`)) onDelete(p.id) }}
                style={{ position: 'absolute', top: 12, right: 12, fontSize: 11, color: 'var(--dim)', opacity: 0, background:'none', border:'none', cursor:'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--danger)' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = 0 }}
              >✕</button>
            </div>
          ))}

          {!creating && (
            <div onClick={() => setCreating(true)}
              style={{ border: '1px dashed var(--edge)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 160, cursor: 'pointer', transition: 'border-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--dim)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--edge)'}
            >
              <div style={{ fontSize: 20, color: 'var(--dim)' }}>+</div>
              <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 300 }}>New story bible</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
