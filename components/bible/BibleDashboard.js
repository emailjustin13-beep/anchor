'use client'
const REL_COLORS = { ally:'#3FB950',rival:'#F85149',romantic:'#DB61A2',family:'#58A6FF',mentor:'#D2A8FF',enemy:'#FF7B72',complicated:'#FFA657',stranger:'#6A6A88' }
const FORMAT_LABELS = { screenplay:'Screenplay',novel:'Novel',short_story:'Short Story' }

export default function BibleDashboard({ project, characters, relationships, locations, script, onNavigate }) {
  const words = script?.content ? script.content.replace(/\[\w+\]/g,'').split(/\s+/).filter(Boolean).length : 0

  return (
    <div style={{ flex:1, overflow:'auto', padding:'28px 32px', background:'var(--bg)' }}>
      <div style={{ marginBottom:28 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:30, color:'var(--gold)', fontWeight:300, marginBottom:5 }}>{project.title}</div>
        {project.logline && <div style={{ fontFamily:'var(--font-display)', fontSize:14, fontStyle:'italic', color:'var(--muted)', maxWidth:520, lineHeight:1.55, marginBottom:10, fontWeight:300 }}>{project.logline}</div>}
        <div style={{ display:'flex', gap:8 }}>
          {project.genre && <span style={{ fontSize:10, color:'var(--muted)', background:'var(--s2)', border:'1px solid var(--edge)', padding:'2px 9px', borderRadius:4, fontWeight:500 }}>{project.genre}</span>}
          <span style={{ fontSize:10, color:'var(--muted)', background:'var(--s2)', border:'1px solid var(--edge)', padding:'2px 9px', borderRadius:4, fontWeight:500 }}>{FORMAT_LABELS[project.format]}</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:24 }}>
        {[['◉','Characters',characters.length,'characters'],['⬡','Relationships',relationships.length,'ties'],['◎','Locations',locations.length,'locations'],['▤','Words',words.toLocaleString(),'write']].map(([icon,label,val,mod]) => (
          <div key={label} style={{ background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:10, padding:'14px 16px', cursor:'pointer', transition:'border-color .15s' }}
            onClick={() => onNavigate(mod)}
            onMouseEnter={e => e.currentTarget.style.borderColor='var(--gold-dim)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--edge)'}
          >
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6, fontWeight:300 }}>{icon} {label}</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:28, color:'var(--gold)', fontWeight:300 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <Mini title="Characters" onMore={() => onNavigate('characters')}>
          {characters.length === 0 ? <Empty>No characters yet</Empty> : characters.slice(0,4).map(c => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:9, padding:'7px 0', borderBottom:'1px solid var(--edge)' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:c.color+'14', border:`1px solid ${c.color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:c.color, fontWeight:500, flexShrink:0 }}>{c.name?.charAt(0)}</div>
              <div><div style={{ fontSize:12, color:'var(--text)', fontWeight:400 }}>{c.name}</div>{c.role && <div style={{ fontSize:10, color:'var(--muted)', fontWeight:300 }}>{c.role}</div>}</div>
            </div>
          ))}
        </Mini>

        <Mini title="Ties That Bind" onMore={() => onNavigate('ties')}>
          {relationships.length === 0 ? <Empty>No relationships mapped yet</Empty> : relationships.slice(0,4).map(r => {
            const a = characters.find(c=>c.id===r.character_a), b = characters.find(c=>c.id===r.character_b)
            const color = REL_COLORS[r.type]||'var(--muted)'
            return (
              <div key={r.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid var(--edge)' }}>
                <span style={{ fontSize:12, color:'var(--text)', fontWeight:400 }}>{a?.name}</span>
                <span style={{ fontSize:10, color, background:color+'12', padding:'1px 7px', borderRadius:3, textTransform:'capitalize', fontWeight:400 }}>{r.type}</span>
                <span style={{ fontSize:12, color:'var(--text)', fontWeight:400 }}>{b?.name}</span>
              </div>
            )
          })}
        </Mini>

        <Mini title="Locations" onMore={() => onNavigate('locations')}>
          {locations.length === 0 ? <Empty>No locations yet</Empty> : locations.slice(0,3).map(l => (
            <div key={l.id} style={{ padding:'7px 0', borderBottom:'1px solid var(--edge)' }}>
              <div style={{ fontSize:12, color:'var(--text)', fontWeight:400, marginBottom:2 }}>{l.name}</div>
              {l.atmosphere && <div style={{ fontSize:11, color:'var(--muted)', fontWeight:300 }}>{l.atmosphere.slice(0,70)}{l.atmosphere.length>70?'…':''}</div>}
            </div>
          ))}
        </Mini>

        <Mini title="Story" onMore={() => onNavigate('write')}>
          {!script ? <Empty>No script yet — start writing</Empty> : (
            <div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8, fontWeight:300 }}>{words.toLocaleString()} words</div>
              <div style={{ fontFamily:'var(--font-script)', fontSize:11, color:'var(--muted)', lineHeight:1.7, maxHeight:90, overflow:'hidden', maskImage:'linear-gradient(to bottom, black 50%, transparent)', fontWeight:300 }}>
                {script.content.replace(/\[\w+\]/g,'').slice(0,280)}
              </div>
            </div>
          )}
        </Mini>
      </div>
    </div>
  )
}

function Mini({ title, onMore, children }) {
  return (
    <div style={{ background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:10, padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:10, fontWeight:500, color:'var(--dim)', textTransform:'uppercase', letterSpacing:'.08em' }}>{title}</span>
        <button onClick={onMore} style={{ fontSize:11, color:'var(--gold)', background:'none', border:'none', cursor:'pointer', fontWeight:300 }}>View all →</button>
      </div>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <div style={{ fontSize:12, color:'var(--dim)', fontStyle:'italic', padding:'10px 0', fontWeight:300 }}>{children}</div>
}
