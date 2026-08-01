import React, { useRef, useState } from 'react'
import { useWallet, fmtBtc } from '../wallet.jsx'

// weighted symbol pool
const POOL = [
  ...Array(5).fill('🍒'),
  ...Array(5).fill('🍋'),
  ...Array(4).fill('🍊'),
  ...Array(3).fill('🔔'),
  ...Array(2).fill('💎'),
  ...Array(1).fill('7️⃣')
]
const pick = () => POOL[Math.floor(Math.random() * POOL.length)]

const TRIPLE_PAY = { '🍒': 8, '🍋': 10, '🍊': 14, '🔔': 25, '💎': 60, '7️⃣': 150 }

export default function Slots() {
  const w = useWallet()
  const [bet, setBet] = useState('0.01')
  const [reels, setReels] = useState(['🍒', '🔔', '7️⃣'])
  const [spinning, setSpinning] = useState(false)
  const [msg, setMsg] = useState(null)
  const timer = useRef(null)

  const spin = () => {
    const amt = parseFloat(bet)
    if (!w.canAfford(amt)) return setMsg({ cls: 'lose', text: 'Insufficient balance' })
    w.debit(amt, 'Slots spin')
    setSpinning(true); setMsg(null)

    timer.current = setInterval(() => setReels([pick(), pick(), pick()]), 90)

    setTimeout(() => {
      clearInterval(timer.current)
      const final = [pick(), pick(), pick()]
      setReels(final)
      setSpinning(false)

      const [a, b, c] = final
      let mult = 0
      if (a === b && b === c) mult = TRIPLE_PAY[a]
      else if ([a, b, c].filter(x => x === '🍒').length === 2) mult = 2
      if (mult > 0) {
        w.credit(amt * mult, `Slots win x${mult}`)
        setMsg({ cls: 'win', text: `${mult}x! +${fmtBtc(amt * mult)}` })
      } else {
        setMsg({ cls: 'lose', text: 'No match — spin again?' })
      }
    }, 1200)
  }

  return (
    <div className="game-wrap">
      <div className="panel">
        <h2>🎰 Slots</h2>
        <div className="field-label">Bet amount (BTC)</div>
        <input className="input" type="number" step="0.001" min="0.0001" value={bet}
          onChange={e => setBet(e.target.value)} disabled={spinning} />
        <div className="quick-row">
          {['0.001', '0.01', '0.05', '0.1'].map(v => (
            <button key={v} className="chip-btn" onClick={() => setBet(v)} disabled={spinning}>{v}</button>
          ))}
        </div>
        <button className="bet-btn" onClick={spin} disabled={spinning}>
          {spinning ? 'Spinning…' : 'Spin'}
        </button>
        <div className="paytable">
          7️⃣7️⃣7️⃣ — 150x<br />💎💎💎 — 60x<br />🔔🔔🔔 — 25x<br />🍊🍊🍊 — 14x<br />
          🍋🍋🍋 — 10x<br />🍒🍒🍒 — 8x<br />Any two 🍒 — 2x
        </div>
      </div>

      <div className="stage">
        <div className="reels">
          {reels.map((s, i) => (
            <div key={i} className={`reel ${spinning ? 'spinning' : ''}`}>{s}</div>
          ))}
        </div>
        {msg && <div className={`result-msg ${msg.cls}`}>{msg.text}</div>}
      </div>
    </div>
  )
}
