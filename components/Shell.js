'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import BibleDashboard    from './bible/BibleDashboard'
import CharactersModule  from './bible/CharactersModule'
import TiesThatBind      from './bible/TiesThatBind'
import WritingStudio     from './editor/WritingStudio'
import Onboarding        from './shared/Onboarding'

const NAV = [
  { id: 'bible',      icon: '◈', label: 'Story Bible'    },
  { id: 'ties',       icon: '⬡', label: 'Ties That Bind' },
  { id: 'write',      icon: '▤', label: 'Write'           },
]

export default function Shell({ project, onExit, onSignOut }) {
  const [module, setModule]           = useState('bible')
  const [characters, setCharacters]   = useState([])
  const [relationships, setRels]      = useState([])
  const [relationshipEvents, setRelationshipEvents] = useState([])
  const [characterStateEvents, setCharacterStateEvents] = useState([])
  const [script, setScript]           = useState(null)
  const [scriptVersions, setScriptVersions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [pulseCache, setPulseCache]   = useState(null)  // cached Story Pulse result
  const [pulseScriptId, setPulseScriptId] = useState(null) // script id when pulse was last run
  const scriptRef = useRef(null)

  useEffect(() => { scriptRef.current = script }, [script])

  useEffect(() => { loadAll() }, [project.id])

  async function loadAll() {
    setLoading(true)
    const [chars, rels, relEvents, stateEvents, scr, versions] = await Promise.all([
      supabase.from('characters').select('*').eq('project_id', project.id).order('created_at'),
      supabase.from('relationships').select('*').eq('project_id', project.id),
      supabase.from('relationship_events').select('*').eq('project_id', project.id).order('sequence_index'),
      supabase.from('character_state_events').select('*').eq('project_id', project.id).order('sequence_index'),
      supabase.from('scripts').select('*').eq('project_id', project.id).order('created_at').limit(1).maybeSingle(),
      supabase.from('script_versions').select('*').eq('project_id', project.id).order('created_at', { ascending:false }),
    ])
    setCharacters(chars.data || [])
    setRels(rels.data || [])
    setRelationshipEvents(relEvents.data || [])
    setCharacterStateEvents(stateEvents.data || [])
    setScript(scr.data || null)
    scriptRef.current = scr.data || null
    setScriptVersions(versions.data || [])
    setLoading(false)
    if (project.onboarded === false) setShowOnboarding(true)
  }

  // ── Character actions ──────────────────────────────────────
  async function createCharacter() {
    const colors = ['#C8A96A','#58A6FF','#3FB950','#DB61A2','#FF7B72','#D2A8FF','#FFA657','#38BDAE']
    const color  = colors[characters.length % colors.length]
    const { data } = await supabase.from('characters')
      .insert({ project_id: project.id, name: 'New Character', color })
      .select().single()
    if (data) setCharacters(p => [...p, data])
    return data
  }

  async function updateCharacter(id, patch) {
    const { data } = await supabase.from('characters').update(patch).eq('id', id).select().single()
    if (data) setCharacters(p => p.map(c => c.id === id ? data : c))
  }

  async function deleteCharacter(id) {
    await supabase.from('characters').delete().eq('id', id)
    setCharacters(p => p.filter(c => c.id !== id))
    setRels(p => p.filter(r => r.character_a !== id && r.character_b !== id))
  }

  // ── Relationship actions ───────────────────────────────────
  async function createRelationship(aId, bId) {
    const existing = relationships.find(r =>
      (r.character_a === aId && r.character_b === bId) ||
      (r.character_a === bId && r.character_b === aId)
    )
    if (existing) return existing
    const { data } = await supabase.from('relationships')
      .insert({ project_id: project.id, character_a: aId, character_b: bId, type: 'stranger' })
      .select().single()
    if (data) setRels(p => [...p, data])
    return data
  }

  async function updateRelationship(id, patch) {
    const { data } = await supabase.from('relationships').update(patch).eq('id', id).select().single()
    if (data) setRels(p => p.map(r => r.id === id ? data : r))
  }

  async function deleteRelationship(id) {
    await supabase.from('relationships').delete().eq('id', id)
    setRels(p => p.filter(r => r.id !== id))
  }

  async function createRelationshipEvent(relationshipId, event) {
    const { data, error } = await supabase.from('relationship_events').insert({
      project_id: project.id,
      relationship_id: relationshipId,
      ...event,
    }).select().single()
    if (error) throw error
    if (data) setRelationshipEvents(items => [...items, data].sort((a, b) => a.sequence_index - b.sequence_index))
    return data
  }

  async function deleteRelationshipEvent(id) {
    const { error } = await supabase.from('relationship_events').delete().eq('id', id)
    if (error) throw error
    setRelationshipEvents(items => items.filter(event => event.id !== id))
  }

  // ── Script actions ─────────────────────────────────────────
  async function saveScript(content, title, metadata = {}) {
    const activeScript = scriptRef.current
    const payload = {
      content,
      title:title || project.title,
      content_json:metadata.contentJson || null,
      title_page:metadata.titlePage || {},
    }
    if (activeScript) {
      const { data, error } = await supabase.from('scripts').update(payload).eq('id', activeScript.id).select().single()
      if (error) throw error
      if (data) {
        scriptRef.current = data
        setScript(data)
      }
      return data
    } else {
      const { data, error } = await supabase.from('scripts')
        .insert({ project_id: project.id, ...payload })
        .select().single()
      if (error) throw error
      if (data) {
        scriptRef.current = data
        setScript(data)
      }
      return data
    }
  }

  async function createScriptVersion(version) {
    let activeScript = scriptRef.current
    if (!activeScript) {
      activeScript = await saveScript(version.content, version.title, {
        contentJson:version.content_json,
        titlePage:version.title_page,
      })
    }
    if (!activeScript) throw new Error('Save the screenplay before creating a version.')
    const { data, error } = await supabase.from('script_versions').insert({
      project_id:project.id,
      script_id:activeScript.id,
      ...version,
    }).select().single()
    if (error) throw error
    setScriptVersions(items => [data, ...items])
    return data
  }

  async function completeOnboarding() {
    setShowOnboarding(false)
    await supabase.from('projects').update({ onboarded: true }).eq('id', project.id)
  }

  const shared  = { project, characters, relationships, relationshipEvents, characterStateEvents, script, scriptVersions }
  const charOps = { onCreateCharacter: createCharacter, onUpdateCharacter: updateCharacter, onDeleteCharacter: deleteCharacter }
  const relOps  = { onCreateRelationship: createRelationship, onUpdateRelationship: updateRelationship, onDeleteRelationship: deleteRelationship }

  return (
    <div className="anchor-shell">

      {/* Icon nav */}
      <nav className="anchor-rail">
        {/* Wordmark — click to exit to projects */}
        <button className="anchor-rail-brand" onClick={onExit} title="All projects">
          A
        </button>
        <div className="anchor-rail-rule" />

        {NAV.map(n => (
          <button key={n.id} className={`anchor-rail-button${module === n.id ? ' active' : ''}`} onClick={() => setModule(n.id)} title={n.label} aria-label={n.label}>
            {n.icon}
          </button>
        ))}

        <button className="anchor-rail-button anchor-sign-out" onClick={onSignOut} title="Sign out" aria-label="Sign out">
          ↪
        </button>

      </nav>

      {/* Main */}
      <main className="anchor-shell-main">
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13, fontWeight: 300 }}>Loading story bible…</div>
        ) : (
          <>
            {module === 'bible'      && <BibleDashboard   {...shared} {...charOps} {...relOps} onCreateRelationshipEvent={createRelationshipEvent} onNavigate={setModule} pulseCache={pulseCache} setPulseCache={setPulseCache} pulseScriptId={pulseScriptId} setPulseScriptId={setPulseScriptId} />}
            {module === 'characters' && <CharactersModule  {...shared} {...charOps} />}
            {module === 'ties'       && <TiesThatBind      {...shared} {...charOps} {...relOps} onCreateRelationshipEvent={createRelationshipEvent} onDeleteRelationshipEvent={deleteRelationshipEvent} />}
            {module === 'write'      && <WritingStudio     {...shared} onSaveScript={saveScript} onCreateScriptVersion={createScriptVersion} onCreateRelationship={createRelationship} onUpdateRelationship={updateRelationship} onCreateRelationshipEvent={createRelationshipEvent} onReload={loadAll} />}
          </>
        )}
      </main>

      {showOnboarding && <Onboarding onComplete={completeOnboarding} />}
    </div>
  )
}
