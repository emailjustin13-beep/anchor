'use client'
import { useState } from 'react'

const STEPS = [
  {
    id: 'welcome',
    title: 'Anchor reads your story.',
    subtitle: 'You write it.',
    body: 'Anchor never generates a single word. It reads what you write, holds it against what you said you wanted to create, and asks whether it\'s still true to your characters. That\'s all it does.',
    icon: 'A',
    iconFont: true,
    cta: 'Show me how',
  },
  {
    id: 'first_read',
    title: 'First Read',
    subtitle: 'Already have a script?',
    body: 'Paste your existing script when creating a new project — or use the First Read banner inside the Write module. Anchor will detect your characters, infer their traits, and map their relationships for you to confirm. You approve everything before it saves.',
    icon: '◈',
    cta: 'Next',
  },
  {
    id: 'xray',
    title: 'X-Ray',
    subtitle: 'Know who\'s in the room.',
    body: 'While you write, the X-Ray panel on the right reads the current page and surfaces every character present — their goals, fears, and voice patterns — without you leaving the editor. The three breathing dots mean Anchor is watching.',
    icon: '✦',
    cta: 'Next',
  },
  {
    id: 'pressure_test',
    title: 'Pressure Test',
    subtitle: 'Does this feel true?',
    body: 'Highlight any text in the editor, right-click, and hit Pressure Test. Anchor reads the selected passage against your character\'s bible entry and tells you whether it\'s in voice, shows tension, or contradicts who they are. It never rewrites. Only assesses.',
    icon: '⚡',
    cta: 'Next',
  },
  {
    id: 'living_bible',
    title: 'Living Bible',
    subtitle: 'Anchor is always reading.',
    body: 'Four seconds after you stop typing, Anchor scans what you just wrote. If a character behaves out of character or a relationship shifts, a whisper banner slides up from the bottom. You decide whether to confirm the update, ask why, or dismiss it. Nothing changes without your approval.',
    icon: '◉',
    cta: 'Start writing',
  },
]

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1
  const progress = (step / (STEPS.length - 1)) * 100

  function next() {
    if (isLast) onComplete()
    else setStep(s => s + 1)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--s1)', border: '1px solid var(--edge)',
        borderRadius: 16, width: '100%', maxWidth: 480,
        overflow: 'hidden', position: 'relative',
      }} className="fade-in">

        {/* Progress bar */}
        <div style={{ height: 2, background: 'var(--edge)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress}%`, background: 'var(--gold)', transition: 'width .3s ease' }} />
        </div>

        <div style={{ padding: '32px 36px 28px' }}>

          {/* Icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: 'var(--gold-bg)', border: '1px solid rgba(200,169,106,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
            fontFamily: current.iconFont ? 'var(--font-display)' : 'var(--font-ui)',
            fontSize: current.iconFont ? 28 : 22,
            color: 'var(--gold)', fontWeight: 300, letterSpacing: current.iconFont ? 2 : 0,
          }}>
            {current.icon}
          </div>

          {/* Step label */}
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 500, marginBottom: 8 }}>
            {step === 0 ? 'Welcome to Anchor' : `Feature ${step} of ${STEPS.length - 1}`}
          </div>

          {/* Title */}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text)', fontWeight: 300, marginBottom: 4, lineHeight: 1.2 }}>
            {current.title}
          </div>

          {/* Subtitle */}
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)', fontWeight: 300, fontStyle: 'italic', marginBottom: 16 }}>
            {current.subtitle}
          </div>

          {/* Body */}
          <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, fontWeight: 300, marginBottom: 32 }}>
            {current.body}
          </div>

          {/* Step dots */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {STEPS.map((_, i) => (
                <div key={i} onClick={() => setStep(i)} style={{
                  width: i === step ? 20 : 6, height: 6, borderRadius: 3,
                  background: i === step ? 'var(--gold)' : i < step ? 'var(--gold-dim)' : 'var(--edge)',
                  cursor: 'pointer', transition: 'all .2s',
                }} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} style={{ fontSize: 13, color: 'var(--dim)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', padding: '8px 4px' }}>
                  ← Back
                </button>
              )}
              <button onClick={next} style={{
                padding: '10px 24px', borderRadius: 8,
                background: isLast ? 'var(--gold)' : 'var(--s2)',
                color: isLast ? 'var(--bg)' : 'var(--text)',
                border: `1px solid ${isLast ? 'var(--gold)' : 'var(--edge)'}`,
                fontSize: 14, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'var(--font-ui)', transition: 'all .15s',
              }}>
                {current.cta}
              </button>
            </div>
          </div>

          {/* Skip */}
          {!isLast && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={onComplete} style={{ fontSize: 12, color: 'var(--dim)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontWeight: 300 }}>
                Skip intro
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
