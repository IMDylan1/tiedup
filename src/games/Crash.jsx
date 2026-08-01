import React, { useEffect, useRef, useState } from 'react'
import { useWallet, fmtBtc } from '../wallet.jsx'

// standard crash distribution with ~1% house edge
const rollCrashPoint = () => {
  const r = Math.random()
  if (r < 0.01) return 1.0
  return Math.max(1.0, Math.floor((0.99 / (1 - r)) * 100) / 100)
}

export default function Crash() {
  const w = useWallet()
  const [bet, setBet] = useState('0.01')
  const [mult, setMult] = useState(1.0)
  const [phase, setPhase] = useState('idle') // idle | flying | crashed | cashed
  const [msg, setMsg] = useState(null)
  const [history, setHistory] = useState([])
  const raf = useRef(null)
  const runRef = useRef(null)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const start = () => {
    const amt = parseFloat(bet)
    if (!w.canAfford(amt)) return setMsg({ cls: 'lose', text: 'Insufficient balance' })
    w.debit(amt, 'Crash bet')
    const crashAt = rollCrashPoint()
    runRef.current = { amt, crashAt, t0: performance.now() }
    setPhase('flying'); setMsg(null); setMult(1.0)

    const tick = now => {
      const { crashAt, amt, t0 } = runRef.current
      const secs = (now - t0) / 1000
      const m = Math.pow(1.07, secs * 2.2) // smooth exponential climb
      if (m >= crashAt) {
        setMult(crashAt)
        setPhase('crashed')
        setHistory(h => [crashAt, ...h].slice(0, 12))
        setMsg({ cls: 'lose', text: `Crashed at ${crashAt.toFixed(2)}x — -${fmtBtc(amt)}` })
        return
      }
      setMult(m)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const cashOut = () => {
    cancelAnimationFrame(raf.current)
    const { amt, crashAt } = runRef.current
    const m = Math.min(mult, crashAt)
    w.credit(amt * m, `Crash cashout ${m.toFixed(2)}x`)
    setPhase('cashed')
    setHistory(h => [crashAt, ...h].slice(0, 12))
    setMsg({ cls: 'win', text: `Cashed out at ${m.toFixed(2)}x! +${fmtBtc(amt * m - amt)} (round crashed at ${crashAt.toFixed(2)}x)` })
  }

  const flying = phase === 'flying'

  return (
    <div className="game-wrap">
      <div className="panel">
        <h2>🚀 Crash</h2>
        <div className="field-label">Bet amount (BTC)</div>
        <input className="input" type="number" step="0.001" min="0.0001" value={bet}
          onChange={e => setBet(e.target.value)} disabled={flying} />
        <div className="quick-row">
          {['0.001', '0.01', '0.05', '0.1'].map(v => (
            <button key={v} className="chip-btn" onClick={() => setBet(v)} disabled={flying}>{v}</button>
          ))}
        </div>
        {!flying && <button className="bet-btn" onClick={start}>Place Bet</button>}
        {flying && (
          <button className="bet-btn" onClick={cashOut}>
            Cash Out {fmtBtc(parseFloat(bet) * mult)}
          </button>
        )}
        <div className="paytable">Multiplier climbs until it crashes. Cash out before it does. ~1% house edge.</div>
      </div>

      <div className="stage">
        <div className={`crash-mult ${phase === 'crashed' ? 'crashed' : flying ? 'flying' : ''}`}>
          {mult.toFixed(2)}x
        </div>
        {msg && <div className={`result-msg ${msg.cls}`}>{msg.text}</div>}
        {history.length > 0 && (
          <div className="crash-history">
            {history.map((h, i) => (
              <span key={i} className={`crash-pill ${h >= 2 ? 'hi' : 'lo'}`}>{h.toFixed(2)}x</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
