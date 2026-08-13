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
    <main className="auth-stage">
      <div className="auth-aura" aria-hidden="true" />
      <section className="auth-card fade-in">
        <div className="auth-seal">A</div>
        <div className="auth-eyebrow">Private writing studio</div>
        <div className="auth-wordmark">Anchor</div>
        <div className="auth-copy">
          Sign in to open your private writing projects.
        </div>
        <button className="btn auth-google" type="button" onClick={signInWithGoogle} disabled={!!busy}>
          <span aria-hidden="true">G</span>
          {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <div className="auth-divider">
          <span />
          Email backup
          <span />
        </div>
        <form onSubmit={signIn} style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="field">
            <label htmlFor="anchor-email">Email</label>
            <input id="anchor-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="writer@example.com" required autoFocus />
          </div>
          <button className="btn btn-ghost auth-email" type="submit" disabled={!!busy || !email.trim()}>
            {busy === 'email' ? 'Sending link…' : 'Email me a sign-in link'}
          </button>
        </form>
        {message && <div style={{ marginTop:14, fontSize:12, lineHeight:1.6, color:'var(--success)' }}>{message}</div>}
        {error && <div style={{ marginTop:14, fontSize:12, lineHeight:1.6, color:'var(--danger)' }}>{error}</div>}
        <div className="auth-footnote">Your work stays yours.</div>
      </section>
    </main>
  )
}
