'use client'
import { useState } from 'react'
import FirstRead from './bible/FirstRead'

const FORMAT_ICONS  = { screenplay: 'SC', novel: 'NV', short_story: 'SS' }
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
    let project
    try {
      project = await onCreate(form)
    } catch (error) {
      alert('Could not create the story bible: ' + error.message)
      setSaving(false)
      return
    }

    // If they pasted a script, save it then launch First Read
    if (scriptPaste.trim() && project) {
      const { supabase } = await import('../lib/supabase')
      const { error: scriptError } = await supabase.from('scripts').insert({
        project_id: project.id,
        title:      form.title,
        content:    scriptPaste.trim(),
      })
      if (scriptError) {
        alert('The story bible was created, but the script could not be saved: ' + scriptError.message)
        setSaving(false)
        onSelect(project)
        return
      }
      setCreating(false)
      setSaving(false)
      setFirstRead({
        projectId: project.id,
        project,
        scriptText: scriptPaste.trim(),
        format: form.format,
      })
      setForm({ title: '', logline: '', genre: '', format: 'screenplay' })
      setScriptPaste('')
      return
    }

    setForm({ title: '', logline: '', genre: '', format: 'screenplay' })
    setScriptPaste('')
    setCreating(false)
    setSaving(false)
    if (project) onSelect(project)
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
    <div className="project-library">

      {/* First Read overlay */}
      {firstRead && (
        <FirstRead
          scriptText={firstRead.scriptText}
          format={firstRead.format}
          projectId={firstRead.projectId}
          onComplete={handleFirstReadComplete}
          onCancel={handleFirstReadCancel}
        />
      )}

      {/* Hero */}
      <header className="project-hero">
        <div className="project-hero-orbit" aria-hidden="true" />
        <div className="project-hero-kicker"><span /> Story intelligence for writers <span /></div>
        <div className="project-wordmark">
          Anchor
        </div>
        <div className="project-tagline">
          We don't write your story. We help you stay true to it.
        </div>
      </header>

      {/* Body */}
      <main className="project-library-body">
        <div className="project-library-heading">
          <div>
            <span className="project-library-eyebrow">Private workspace</span>
            <h1>Your stories</h1>
            <p>{projects.length === 0 ? 'Create your first story bible.' : `${projects.length} ${projects.length === 1 ? 'world' : 'worlds'} waiting for you.`}</p>
          </div>
          <button className="btn btn-gold btn-sm" onClick={() => setCreating(true)}><span aria-hidden="true">＋</span> New story bible</button>
        </div>

        {/* Create form */}
        {creating && (
          <div className="card project-create-card fade-in">
            <div className="project-create-heading">
              <span>New world</span>
              <h2>Start a story bible</h2>
            </div>

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
        <div className="project-grid">
          {projects.map(p => (
            <article key={p.id} className="project-card" onClick={() => onSelect(p)} tabIndex={0} onKeyDown={event => event.key === 'Enter' && onSelect(p)}>
              <div className="project-card-shine" aria-hidden="true" />
              <div className="project-card-topline">
                <span className="project-format-icon">{FORMAT_ICONS[p.format]}</span>
                <span className="project-format-label">{FORMAT_LABELS[p.format]}</span>
              </div>
              <h2>{p.title}</h2>
              {p.logline ? <p>{p.logline}</p> : <p className="project-card-empty">Your story is ready for its next page.</p>}
              <div className="project-card-footer">
                <span>{p.genre || FORMAT_LABELS[p.format]}</span>
                <b>Open <span aria-hidden="true">→</span></b>
              </div>
              <button
                onClick={e => { e.stopPropagation(); if (confirm(`Delete "${p.title}"?`)) onDelete(p.id) }}
                className="project-delete"
                aria-label={`Delete ${p.title}`}
              >✕</button>
            </article>
          ))}

          {!creating && (
            <button className="project-new-card" onClick={() => setCreating(true)}>
              <span aria-hidden="true">＋</span>
              <b>New story bible</b>
              <small>Build a world from the first page</small>
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
