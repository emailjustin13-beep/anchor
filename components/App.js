'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ProjectSelector from './ProjectSelector'
import Shell from './Shell'

export default function App() {
  const [projects, setProjects] = useState([])
  const [active, setActive]     = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').order('updated_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  async function createProject(vals) {
    const { data } = await supabase.from('projects').insert(vals).select().single()
    if (data) { setProjects(p => [data, ...p]); setActive(data) }
  }

  async function deleteProject(id) {
    await supabase.from('projects').delete().eq('id', id)
    setProjects(p => p.filter(x => x.id !== id))
    if (active?.id === id) setActive(null)
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 10 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--gold)', letterSpacing: '10px', textTransform: 'uppercase', paddingLeft: '10px' }}>Anchor</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 300 }}>Loading…</div>
    </div>
  )

  if (!active) return <ProjectSelector projects={projects} onCreate={createProject} onSelect={setActive} onDelete={deleteProject} />
  return <Shell project={active} onExit={() => setActive(null)} />
}
