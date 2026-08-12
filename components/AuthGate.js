'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthGate() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const search = new URLSearchParams(window.location.search)
    const authError = hash.get('error_description') || search.get('error_description')
    if (!authError) return
    setError(authError.replaceAll('+', ' '))
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function signInWithGoogle() {
    setBusy('google')
    setError('')
    setMessage('')
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider:'google',
      options:{ redirectTo:window.location.origin },
    })
    if (signInError) {
      setError(signInError.message)
      setBusy('')
    }
  }

  async function signIn(event) {
    event.preventDefault()
    if (!email.trim()) return
    setBusy('email')
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
    setBusy('')
  }

  return (
    <main style={{ minHeight:'100vh', background:'var(--bg)', display:'grid', placeItems:'center', padding:24 }}>
      <section className="card fade-in" style={{ width:'100%', maxWidth:420, padding:28 }}>
        <div style={{ fontFamily:'var(--font-display)', fontSize:36, color:'var(--gold)', letterSpacing:'9px', textTransform:'uppercase', marginBottom:8 }}>Anchor</div>
        <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, fontWeight:300, marginBottom:24 }}>
          Sign in to open your private story bibles and screenplays.
        </div>
        <button className="btn" type="button" onClick={signInWithGoogle} disabled={!!busy} style={{ width:'100%', justifyContent:'center', background:'#fff', color:'#202124', border:'1px solid #dadce0', fontWeight:500 }}>
          <span aria-hidden="true" style={{ fontFamily:'Arial,sans-serif', fontWeight:700, color:'#4285F4' }}>G</span>
          {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <div style={{ display:'flex', alignItems:'center', gap:10, margin:'18px 0', color:'var(--dim)', fontSize:10, textTransform:'uppercase', letterSpacing:'.08em' }}>
          <span style={{ height:1, flex:1, background:'var(--edge)' }} />
          Email backup
          <span style={{ height:1, flex:1, background:'var(--edge)' }} />
        </div>
        <form onSubmit={signIn} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="field">
            <label htmlFor="anchor-email">Email</label>
            <input id="anchor-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="writer@example.com" required autoFocus />
          </div>
          <button className="btn btn-ghost" type="submit" disabled={!!busy || !email.trim()} style={{ justifyContent:'center' }}>
            {busy === 'email' ? 'Sending link…' : 'Email me a sign-in link'}
          </button>
        </form>
        {message && <div style={{ marginTop:14, fontSize:12, lineHeight:1.6, color:'var(--success)' }}>{message}</div>}
        {error && <div style={{ marginTop:14, fontSize:12, lineHeight:1.6, color:'var(--danger)' }}>{error}</div>}
      </section>
    </main>
  )
}
