'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import ProjectSelector from './ProjectSelector'
import Shell from './Shell'
import AuthGate from './AuthGate'

export default function App() {
  const [projects, setProjects] = useState([])
  const [active, setActive]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [session, setSession]   = useState(null)
  const userIdRef = useRef(null)

  function projectStorageKey(userId) {
    return `anchor-active-project:${userId}`
  }

  function openProject(project) {
    if (session?.user?.id) localStorage.setItem(projectStorageKey(session.user.id), project.id)
    const url = new URL(window.location.href)
    url.searchParams.set('project', project.id)
    window.history.replaceState({}, '', url)
    setActive(project)
  }

  function exitProject() {
    if (session?.user?.id) localStorage.removeItem(projectStorageKey(session.user.id))
    const url = new URL(window.location.href)
    url.searchParams.delete('project')
    window.history.replaceState({}, '', url)
    setActive(null)
  }

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      userIdRef.current = data.session?.user?.id || null
      if (data.session) load(data.session.user.id, true)
      else setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      const previousUserId = userIdRef.current
      const nextUserId = nextSession?.user?.id || null
      setSession(nextSession)

      if (!nextUserId) {
        userIdRef.current = null
        setActive(null)
        setProjects([])
        setLoading(false)
        return
      }

      userIdRef.current = nextUserId
      if (previousUserId && previousUserId !== nextUserId) setActive(null)

      // SIGNED_IN can fire again when a browser tab regains focus. Preserve the
      // open project for same-user auth refreshes and only reload on a new user.
      if (!previousUserId || previousUserId !== nextUserId || event === 'USER_UPDATED') {
        load(nextUserId, true)
      }
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function load(userId = session?.user?.id, restoreProject = false) {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase.from('projects').select('*').eq('owner_id', userId).order('updated_at', { ascending: false })
    const nextProjects = error ? [] : (data || [])
    setProjects(nextProjects)
    if (restoreProject) {
      const requestedId = new URLSearchParams(window.location.search).get('project')
      const rememberedId = localStorage.getItem(projectStorageKey(userId))
      setActive(current => {
        const projectId = current?.id || requestedId || rememberedId
        const restored = nextProjects.find(project => project.id === projectId) || null
        if (restored) {
          localStorage.setItem(projectStorageKey(userId), restored.id)
          const url = new URL(window.location.href)
          url.searchParams.set('project', restored.id)
          window.history.replaceState({}, '', url)
        }
        return restored
      })
    }
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
    if (active?.id === id) exitProject()
  }

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 10 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--gold)', letterSpacing: '10px', textTransform: 'uppercase', paddingLeft: '10px' }}>Anchor</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 300 }}>Loading…</div>
    </div>
  )

  if (!session) return <AuthGate />
  if (!active) return <ProjectSelector projects={projects} onCreate={createProject} onSelect={openProject} onDelete={deleteProject} />
  return <Shell project={active} onExit={exitProject} onSignOut={() => supabase.auth.signOut()} />
}
