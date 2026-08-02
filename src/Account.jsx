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
  const [pending, setPending] = useState(null)   // 'signup' | 'unconfirmed'
  const [resent, setResent] = useState(null)

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
          <div className="slip-line">
            <span>Verified</span>
            <b className={auth.emailConfirmed ? 'win' : 'push'}>
              {auth.emailConfirmed ? '✓ Confirmed' : 'Not confirmed yet'}
            </b>
          </div>
          <div className="slip-line"><span>Balance</span><b>{fmtBtc(w.btc)}</b></div>
          <div className="slip-line"><span>Sync</span><b className="win">Cloud — follows you everywhere</b></div>
          <button className="bet-btn secondary" onClick={auth.signOut}>Sign out</button>
        </div>
      </div>
    )
  }

  const submit = async e => {
    e.preventDefault()
    setBusy(true); setMsg(null); setResent(null)
    const res = mode === 'signup'
      ? await auth.signUp(email, password, username)
      : await auth.signIn(email, password)
    setBusy(false)

    // unverified sign-in isn't a dead end — offer the resend
    if (res.unconfirmed) return setPending('unconfirmed')
    if (res.error) return setMsg({ cls: 'lose', text: res.error })
    if (mode === 'signup') return setPending('signup')
  }

  const resend = async () => {
    setBusy(true); setResent(null)
    const res = await auth.resendConfirmation(email)
    setBusy(false)
    setResent(res.error
      ? { cls: 'lose', text: res.error }
      : { cls: 'win', text: `Sent again to ${email}. Give it a minute, and check spam.` })
  }

  // waiting on the emailed link
  if (pending) {
    return (
      <div>
        <h2 style={{ marginBottom: 14 }}>👤 Account</h2>
        <div className="panel" style={{ maxWidth: 460 }}>
          <div className="verify-icon">📬</div>
          <h2 style={{ marginBottom: 8 }}>
            {pending === 'signup' ? 'Confirm your email' : 'Email not confirmed yet'}
          </h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
            {pending === 'signup'
              ? <>Account created for <b>{email}</b>. Click the link in that email to verify, then come back and sign in.</>
              : <>You need to click the link sent to <b>{email}</b> before you can sign in.</>}
          </p>
          <button className="bet-btn" onClick={resend} disabled={busy}>
            {busy ? 'Sending…' : 'Resend confirmation email'}
          </button>
          <button className="bet-btn secondary" onClick={() => { setPending(null); setMode('signin'); setResent(null) }}>
            Back to sign in
          </button>
          {resent && <div className={`result-msg ${resent.cls}`} style={{ fontSize: 14 }}>{resent.text}</div>}
          <div className="paytable">
            Nothing arriving? The default mail service is rate-limited to a few
            messages an hour and often lands in spam.
          </div>
        </div>
      </div>
    )
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
