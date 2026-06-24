'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import BibleDashboard    from './bible/BibleDashboard'
import CharactersModule  from './bible/CharactersModule'
import TiesThatBind      from './bible/TiesThatBind'
import LocationsModule   from './bible/LocationsModule'
import WritingEditor     from './editor/WritingEditor'
import Settings          from './shared/Settings'

const NAV = [
  { id: 'bible',      icon: '◈', label: 'Story Bible'    },
  { id: 'characters', icon: '◉', label: 'Characters'      },
  { id: 'ties',       icon: '⬡', label: 'Ties That Bind' },
  { id: 'locations',  icon: '◎', label: 'Locations'       },
  { id: 'write',      icon: '▤', label: 'Write'           },
]

export default function Shell({ project, onExit }) {
  const [module, setModule]           = useState('bible')
  const [characters, setCharacters]   = useState([])
  const [relationships, setRels]      = useState([])
  const [locations, setLocations]     = useState([])
  const [script, setScript]           = useState(null)
  const [loading, setLoading]         = useState(true)
  const [showSettings, setSettings]   = useState(false)

  useEffect(() => { loadAll() }, [project.id])

  async function loadAll() {
    setLoading(true)
    const [chars, rels, locs, scr] = await Promise.all([
      supabase.from('characters').select('*').eq('project_id', project.id).order('created_at'),
      supabase.from('relationships').select('*').eq('project_id', project.id),
      supabase.from('locations').select('*').eq('project_id', project.id).order('created_at'),
      supabase.from('scripts').select('*').eq('project_id', project.id).order('created_at').limit(1).maybeSingle(),
    ])
    setCharacters(chars.data || [])
    setRels(rels.data || [])
    setLocations(locs.data || [])
    setScript(scr.data || null)
    setLoading(false)
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

  // ── Location actions ───────────────────────────────────────
  async function createLocation() {
    const { data } = await supabase.from('locations')
      .insert({ project_id: project.id, name: 'New Location' })
      .select().single()
    if (data) setLocations(p => [...p, data])
    return data
  }

  async function updateLocation(id, patch) {
    const { data } = await supabase.from('locations').update(patch).eq('id', id).select().single()
    if (data) setLocations(p => p.map(l => l.id === id ? data : l))
  }

  async function deleteLocation(id) {
    await supabase.from('locations').delete().eq('id', id)
    setLocations(p => p.filter(l => l.id !== id))
  }

  // ── Script actions ─────────────────────────────────────────
  async function saveScript(content, title) {
    if (script) {
      const { data } = await supabase.from('scripts').update({ content, title }).eq('id', script.id).select().single()
      if (data) setScript(data)
    } else {
      const { data } = await supabase.from('scripts')
        .insert({ project_id: project.id, title: title || project.title, content })
        .select().single()
      if (data) setScript(data)
    }
  }

  const shared  = { project, characters, relationships, locations, script }
  const charOps = { onCreateCharacter: createCharacter, onUpdateCharacter: updateCharacter, onDeleteCharacter: deleteCharacter }
  const relOps  = { onCreateRelationship: createRelationship, onUpdateRelationship: updateRelationship, onDeleteRelationship: deleteRelationship }
  const locOps  = { onCreateLocation: createLocation, onUpdateLocation: updateLocation, onDeleteLocation: deleteLocation }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* Icon nav */}
      <nav style={{ width: 52, flexShrink: 0, background: 'var(--bg)', borderRight: '1px solid var(--edge)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 2 }}>
        {/* Wordmark — click to exit to projects */}
        <div onClick={onExit} title="All projects" style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)', cursor: 'pointer', marginBottom: 12, fontWeight: 300, letterSpacing: 1 }}>
          A
        </div>
        <div style={{ width: 26, height: 1, background: 'var(--edge)', marginBottom: 8 }} />

        {NAV.map(n => (
          <button key={n.id} onClick={() => setModule(n.id)} title={n.label} style={{
            width: 36, height: 36, borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, cursor: 'pointer',
            background: module === n.id ? 'var(--gold-bg)' : 'transparent',
            color: module === n.id ? 'var(--gold)' : 'var(--dim)',
            border: `1px solid ${module === n.id ? 'rgba(200,169,106,.2)' : 'transparent'}`,
            transition: 'all .1s',
          }}>
            {n.icon}
          </button>
        ))}

        <div style={{ marginTop: 'auto' }}>
          <button onClick={() => setSettings(true)} title="Settings" style={{ width: 36, height: 36, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--dim)', cursor: 'pointer' }}>⚙</button>
        </div>
      </nav>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13, fontWeight: 300 }}>Loading story bible…</div>
        ) : (
          <>
            {module === 'bible'      && <BibleDashboard   {...shared} {...charOps} {...relOps} {...locOps} onNavigate={setModule} />}
            {module === 'characters' && <CharactersModule  {...shared} {...charOps} />}
            {module === 'ties'       && <TiesThatBind      {...shared} {...charOps} {...relOps} />}
            {module === 'locations'  && <LocationsModule   {...shared} {...locOps} />}
            {module === 'write'      && <WritingEditor     {...shared} onSaveScript={saveScript} onUpdateRelationship={updateRelationship} />}
          </>
        )}
      </main>

      {showSettings && <Settings onClose={() => setSettings(false)} />}
    </div>
  )
}
