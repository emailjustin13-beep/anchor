'use client'
import { useState } from 'react'

const FEATURES = [
  {
    icon: '◈',
    name: 'First Read',
    desc: 'Paste an existing script when creating a project, or use the banner inside the Write module. Anchor detects your characters and maps their relationships. You confirm everything before it saves.',
  },
  {
    icon: '✦',
    name: 'X-Ray',
    desc: 'Open the Write module and click X-Ray in the toolbar. While you write, it reads the current page and surfaces every character present — their goals, fears, and voice — without leaving the editor.',
  },
  {
    icon: '⚡',
    name: 'Pressure Test',
    desc: 'In the Write module, highlight any text, right-click, and hit Pressure Test. Anchor checks the selected passage against your character\'s bible entry. It never rewrites — only assesses.',
  },
  {
    icon: '◉',
    name: 'Living Bible',
    desc: 'Four seconds after you stop typing, Anchor scans what you wrote. If something feels off — a character acting out of character, a relationship shifting — a whisper banner slides up from the bottom. You decide what to do with it.',
  },
  {
    icon: '⬡',
    name: 'Ties That Bind',
    desc: 'Click the ⬡ icon in the nav. Drag characters around the map. Click the midpoint indicator on any connection line to open the relationship card and view the arc timeline — how the relationship has evolved across acts.',
  },
  {
    icon: '✦',
    name: 'Full Read',
    desc: 'On the Bible Dashboard, hit the Full Read button top-right. Anchor audits your entire script against your bible — finding act breaks, character drift, and relationship shifts — and lets you log them directly into Ties That Bind.',
  },
]

export default function Settings({ onClose, onReplayOnboarding }) {
  const [copied, setCopied] = useState(false)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(8px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}
    >
      <div style={{ background:'var(--s1)', border:'1px solid var(--edge)', borderRadius:14, width:'100%', maxWidth:500, maxHeight:'85vh', overflowY:'auto', position:'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding:'24px 28px' }}>

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:22, color:'var(--gold)', fontWeight:300 }}>Settings</div>
              <div style={{ fontSize:12, color:'var(--dim)', fontWeight:300, marginTop:2 }}>Anchor</div>
            </div>
            <button onClick={onClose} style={{ fontSize:14, color:'var(--dim)', background:'none', border:'none', cursor:'pointer' }}>✕</button>
          </div>

          <div style={{ height:1, background:'var(--edge)', marginBottom:20 }} />

          {/* Replay intro */}
          {onReplayOnboarding && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', fontWeight:500, marginBottom:10 }}>Intro</div>
              <button
                onClick={() => { onReplayOnboarding(); onClose() }}
                style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'12px 14px', borderRadius:8, background:'var(--s2)', border:'1px solid var(--edge)', cursor:'pointer', fontFamily:'var(--font-ui)', textAlign:'left', transition:'border-color .15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor='var(--gold-dim)'}
                onMouseLeave={e => e.currentTarget.style.borderColor='var(--edge)'}
              >
                <span style={{ fontSize:16, color:'var(--gold)' }}>▶</span>
                <div>
                  <div style={{ fontSize:13, color:'var(--text)', fontWeight:400 }}>Replay intro</div>
                  <div style={{ fontSize:11, color:'var(--dim)', fontWeight:300, marginTop:1 }}>Walk through how Anchor works again</div>
                </div>
              </button>
            </div>
          )}

          {/* How Anchor works */}
          <div>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.08em', fontWeight:500, marginBottom:12 }}>How Anchor works</div>
            <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
              {FEATURES.map((f, i) => (
                <FeatureRow key={i} feature={f} />
              ))}
            </div>
          </div>

          <div style={{ height:1, background:'var(--edge)', margin:'20px 0' }} />

          {/* About */}
          <div style={{ fontSize:12, color:'var(--dim)', lineHeight:1.6, fontWeight:300, textAlign:'center' }}>
            Anchor — We don't write your story. We help you stay true to it.
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureRow({ feature }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius:7, overflow:'hidden', border:'1px solid transparent', transition:'border-color .1s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor='var(--edge)'}
      onMouseLeave={e => e.currentTarget.style.borderColor='transparent'}
    >
      <div onClick={() => setOpen(v => !v)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', cursor:'pointer', background:'var(--s2)', borderRadius:7 }}>
        <span style={{ fontSize:14, color:'var(--gold)', width:20, textAlign:'center', flexShrink:0 }}>{feature.icon}</span>
        <span style={{ fontSize:13, color:'var(--text)', fontWeight:400, flex:1 }}>{feature.name}</span>
        <span style={{ fontSize:10, color:'var(--dim)' }}>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ padding:'10px 12px 12px 42px', fontSize:12, color:'var(--muted)', lineHeight:1.65, fontWeight:300, background:'var(--s2)', borderTop:'1px solid var(--edge)' }} className="fade-in">
          {feature.desc}
        </div>
      )}
    </div>
  )
}
