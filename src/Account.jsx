import React, { useState } from 'react'
import { useAuth } from './auth.jsx'
import { useWallet, fmtBtc } from './wallet.jsx'

export default function Account() {
  const auth = useAuth()
  const w = useWallet()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  if (!auth.enabled) {
    return (
      <div>
        <h2 style={{ marginBottom: 14 }}>👤 Account</h2>
        <div className="panel">
          <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
            Accounts aren't switched on for this build — no Supabase keys are configured,
            so the wallet is running in local-only mode. Your balance lives in this browser
            and won't follow you to another device.
          </p>
          <p style={{ color: 'var(--muted)', marginTop: 12, lineHeight: 1.7 }}>
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> and
            everything below turns on automatically.
          </p>
        </div>
      </div>
    )
  }

  if (auth.user) {
    return (
      <div>
        <h2 style={{ marginBottom: 14 }}>👤 Account</h2>
        <div className="panel">
          <div className="slip-line"><span>Signed in as</span><b>{auth.profile?.username ?? '…'}</b></div>
          <div className="slip-line"><span>Email</span><b>{auth.user.email}</b></div>
          <div className="slip-line"><span>Balance</span><b>{fmtBtc(w.btc)}</b></div>
          <div className="slip-line"><span>Sync</span><b className="win">Cloud — follows you everywhere</b></div>
          <button className="bet-btn secondary" onClick={auth.signOut}>Sign out</button>
        </div>
      </div>
    )
  }

  const submit = async e => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const res = mode === 'signup'
      ? await auth.signUp(email, password, username)
      : await auth.signIn(email, password)
    setBusy(false)
    if (res.error) return setMsg({ cls: 'lose', text: res.error })
    if (mode === 'signup') {
      setMsg({ cls: 'win', text: 'Account created. If email confirmation is on, check your inbox — otherwise you are signed in.' })
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 14 }}>👤 Account</h2>
      <div className="league-tabs">
        <button className={`league-tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => { setMode('signin'); setMsg(null) }}>Sign in</button>
        <button className={`league-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setMsg(null) }}>Create account</button>
      </div>

      <div className="panel" style={{ maxWidth: 420 }}>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <div className="field-label">Username (shown to other players)</div>
              <input className="input" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="dylan" autoComplete="username" />
            </>
          )}
          <div className="field-label">Email</div>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email" required />
          <div className="field-label">Password</div>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="at least 6 characters" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
          <button className="bet-btn" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        {msg && <div className={`result-msg ${msg.cls}`} style={{ fontSize: 14 }}>{msg.text}</div>}
        <div className="paytable">
          Play money only — an account just carries your demo balance between devices.
          Never reuse a real password here.
        </div>
      </div>
    </div>
  )
}
