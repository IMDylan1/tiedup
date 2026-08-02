import React, { useMemo, useState } from 'react'
import { useWallet, fmtBtc, CURRENCIES } from './wallet.jsx'
import { useAuth } from './auth.jsx'

const DEPOSITS = [0.1, 0.5, 1, 5, 25]

// walk the ledger backwards from the current balance to reconstruct the curve
function balanceSeries(history, current) {
  const pts = []
  let bal = current
  for (const h of history) {
    pts.push({ at: h.at, bal })
    bal = bal - h.delta
  }
  pts.push({ at: history.length ? history[history.length - 1].at - 1 : Date.now(), bal })
  return pts.reverse()
}

function BalanceChart({ history, current }) {
  const pts = useMemo(() => balanceSeries(history, current), [history, current])
  if (pts.length < 3) {
    return <div className="empty" style={{ padding: '26px 0' }}>Play a few rounds and your balance curve shows up here.</div>
  }

  const W = 640, H = 170, PAD = 6
  const vals = pts.map(p => p.bal)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const x = i => PAD + (i / (pts.length - 1)) * (W - PAD * 2)
  const y = v => H - PAD - ((v - min) / span) * (H - PAD * 2)

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.bal).toFixed(1)}`).join(' ')
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`
  const up = pts[pts.length - 1].bal >= pts[0].bal
  const stroke = up ? 'var(--green)' : 'var(--red)'

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bal-chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="balfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#balfill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="chart-axis">
        <span>low {fmtBtc(min)}</span>
        <span>{pts.length - 1} transactions</span>
        <span>high {fmtBtc(max)}</span>
      </div>
    </div>
  )
}

export default function WalletPage({ go }) {
  const w = useWallet()
  const auth = useAuth()
  const [custom, setCustom] = useState('')
  const [to, setTo] = useState('')
  const [amt, setAmt] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')

  const send = async e => {
    e.preventDefault()
    const n = parseFloat(amt)
    if (!(n > 0)) return setMsg({ cls: 'lose', text: 'Enter an amount' })
    if (!w.canAfford(n)) return setMsg({ cls: 'lose', text: 'Insufficient balance' })
    setBusy(true); setMsg(null)
    const res = await w.transfer(to.trim(), n)
    setBusy(false)
    if (res.error) return setMsg({ cls: 'lose', text: res.error })
    setMsg({ cls: 'win', text: `Sent ${fmtBtc(n)} to ${to.trim()}` })
    setTo(''); setAmt('')
  }

  const shown =
    filter === 'in' ? w.history.filter(h => h.delta > 0)
    : filter === 'out' ? w.history.filter(h => h.delta < 0)
    : filter === 'dep' ? w.history.filter(h => /deposit|reset|received|sent/i.test(h.label))
    : w.history

  const totalIn = w.history.filter(h => h.delta > 0).reduce((s, h) => s + h.delta, 0)
  const totalOut = w.history.filter(h => h.delta < 0).reduce((s, h) => s - h.delta, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ marginRight: 'auto' }}>💰 Wallet</h2>
        <div className="cur-toggle">
          {CURRENCIES.map(c => (
            <button key={c} className={`cur-btn ${w.currency === c ? 'active' : ''}`}
              onClick={() => w.setCurrency(c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="bal-big">{fmtBtc(w.btc)}</div>
        <div className="bal-sub">
          {w.cloud
            ? <>☁️ Synced as <b>{auth.profile?.username ?? '…'}</b> — same balance on every device</>
            : <>📱 Local to this browser — <button className="linkish" onClick={() => go?.('account')}>sign in</button> to sync everywhere</>}
        </div>
        <BalanceChart history={w.history} current={w.btc} />
      </div>

      <div className="stats-row">
        <div className="stat-box"><div className="v win">{fmtBtc(totalIn)}</div><div className="k">Total in</div></div>
        <div className="stat-box"><div className="v lose">{fmtBtc(totalOut)}</div><div className="k">Total out</div></div>
        <div className="stat-box"><div className="v">{w.history.length}</div><div className="k">Transactions</div></div>
        {w.btcUsd && <div className="stat-box"><div className="v">${w.btcUsd.toLocaleString()}</div><div className="k">BTC / USD</div></div>}
        {w.ethUsd && <div className="stat-box"><div className="v">${w.ethUsd.toLocaleString()}</div><div className="k">ETH / USD</div></div>}
      </div>

      <div className="game-wrap" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="panel">
          <h2>Deposit play money</h2>
          <div className="wm-grid">
            {DEPOSITS.map(a => (
              <button key={a} className="chip-btn" onClick={() => w.deposit(a)}>+{a} ₿</button>
            ))}
          </div>
          <div className="field-label">Custom amount (BTC)</div>
          <div className="wm-row">
            <input className="input" type="number" step="0.1" min="0" value={custom}
              onChange={e => setCustom(e.target.value)} placeholder="0.00" />
            <button className="chip-btn" onClick={() => {
              const n = parseFloat(custom)
              if (n > 0) { w.deposit(n); setCustom('') }
            }}>Add</button>
          </div>
          <button className="wm-reset" onClick={w.reset}>Reset wallet to 1 ₿</button>
          <div className="paytable">
            Fake money with no cash value — this button mints it out of thin air.
          </div>
        </div>

        <div className="panel">
          <h2>Send to a player</h2>
          {!w.cloud ? (
            <div className="empty" style={{ padding: '22px 0' }}>
              Sending needs an account — transfers move funds between real players,
              so they can't work in local-only mode.
            </div>
          ) : (
            <form onSubmit={send}>
              <div className="field-label">Recipient username</div>
              <input className="input" value={to} onChange={e => setTo(e.target.value)}
                placeholder="theirusername" autoCapitalize="off" />
              <div className="field-label">Amount (BTC)</div>
              <input className="input" type="number" step="0.001" min="0" value={amt}
                onChange={e => setAmt(e.target.value)} placeholder="0.00" />
              <button className="bet-btn" type="submit" disabled={busy || !to || !amt}>
                {busy ? 'Sending…' : 'Send'}
              </button>
            </form>
          )}
          {msg && <div className={`result-msg ${msg.cls}`} style={{ fontSize: 14 }}>{msg.text}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 12px', flexWrap: 'wrap' }}>
        <h2 style={{ marginRight: 'auto' }}>Transaction ledger</h2>
        {w.cloud && (
          <button className="league-tab" onClick={w.refresh}>
            {w.syncing ? 'Syncing…' : 'Refresh'}
          </button>
        )}
      </div>
      <div className="league-tabs">
        {[['all', 'All'], ['in', 'Money in'], ['out', 'Money out'], ['dep', 'Transfers & deposits']].map(([id, label]) => (
          <button key={id} className={`league-tab ${filter === id ? 'active' : ''}`}
            onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      {shown.length === 0 && <div className="empty">Nothing here yet.</div>}
      {shown.map((h, i) => (
        <div key={`${h.at}-${i}`} className="bet-row">
          <div>
            <b>{h.label}</b>
            <div className="sub">{new Date(h.at).toLocaleString()}</div>
          </div>
          <span className={h.delta >= 0 ? 'win' : 'lose'} style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
            {h.delta >= 0 ? '+' : '−'}{fmtBtc(Math.abs(h.delta))}
          </span>
        </div>
      ))}

      <div className="banner" style={{ marginTop: 14 }}>
        The ledger keeps the most recent 200 entries.
      </div>
    </div>
  )
}
