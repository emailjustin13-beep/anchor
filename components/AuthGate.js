'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthGate() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function signIn(event) {
    event.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError('')
    setMessage('')
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: true,
      },
    })
    if (signInError) setError(signInError.message)
    else setMessage('Check your email for the secure sign-in link.')
    setBusy(false)
  }

  return (
    <main style={{ minHeight:'100vh', background:'var(--bg)', display:'grid', placeItems:'center', padding:24 }}>
      <section className="card fade-in" style={{ width:'100%', maxWidth:420, padding:28 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:36, color:'var(--gold)', letterSpacing:'9px', textTransform:'uppercase', marginBottom:8 }}>Anchor</div>
        <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, fontWeight:300, marginBottom:24 }}>
          Sign in to open your private story bibles. Anchor will email you a one-time secure link—no password needed.
        </div>
        <form onSubmit={signIn} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="field">
            <label htmlFor="anchor-email">Email</label>
            <input id="anchor-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="writer@example.com" required autoFocus />
          </div>
          <button className="btn btn-gold" type="submit" disabled={busy || !email.trim()} style={{ justifyContent:'center' }}>
            {busy ? 'Sending link…' : 'Email me a sign-in link'}
          </button>
        </form>
        {message && <div style={{ marginTop:14, fontSize:12, lineHeight:1.6, color:'var(--success)' }}>{message}</div>}
        {error && <div style={{ marginTop:14, fontSize:12, lineHeight:1.6, color:'var(--danger)' }}>{error}</div>}
      </section>
    </main>
  )
}
