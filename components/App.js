'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import ProjectSelector from './ProjectSelector'
import Shell from './Shell'
import AuthGate from './AuthGate'

export default function App() {
  const [projects, setProjects] = useState([])
  const [active, setActive]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [session, setSession]   = useState(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session) load(data.session.user.id)
      else setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setActive(null)
      if (nextSession) load(nextSession.user.id)
      else {
        setProjects([])
        setLoading(false)
      }
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function load(userId = session?.user?.id) {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase.from('projects').select('*').eq('owner_id', userId).order('updated_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }

  async function createProject(vals) {
    if (!session?.user?.id) throw new Error('Please sign in again.')
    const { data, error } = await supabase.from('projects').insert({ ...vals, owner_id: session.user.id }).select().single()
    if (error) throw error
    if (data) setProjects(p => [data, ...p])
    return data
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

  if (!session) return <AuthGate />
  if (!active) return <ProjectSelector projects={projects} onCreate={createProject} onSelect={setActive} onDelete={deleteProject} />
  return <Shell project={active} onExit={() => setActive(null)} onSignOut={() => supabase.auth.signOut()} />
}
