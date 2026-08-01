import React, { useState } from 'react'
import { useWallet, fmtBtc } from '../wallet.jsx'

export default function Dice() {
  const w = useWallet()
  const [bet, setBet] = useState('0.01')
  const [target, setTarget] = useState(50) // win if roll < target
  const [roll, setRoll] = useState(null)
  const [msg, setMsg] = useState(null)
  const [rolling, setRolling] = useState(false)

  const chance = target
  const payout = 99 / chance // 1% house edge

  const play = () => {
    const amt = parseFloat(bet)
    if (!w.canAfford(amt)) return setMsg({ cls: 'lose', text: 'Insufficient balance' })
    w.debit(amt, 'Dice roll')
    setRolling(true); setMsg(null)
    setTimeout(() => {
      const r = +(Math.random() * 100).toFixed(2)
      setRoll(r)
      setRolling(false)
      if (r < target) {
        w.credit(amt * payout, `Dice win x${payout.toFixed(2)}`)
        setMsg({ cls: 'win', text: `${r} rolls under ${target}! +${fmtBtc(amt * payout - amt)}` })
      } else {
        setMsg({ cls: 'lose', text: `${r} — needed under ${target}` })
      }
    }, 500)
  }

  return (
    <div className="game-wrap">
      <div className="panel">
        <h2>🎲 Dice</h2>
        <div className="field-label">Bet amount (BTC)</div>
        <input className="input" type="number" step="0.001" min="0.0001" value={bet}
          onChange={e => setBet(e.target.value)} disabled={rolling} />
        <div className="quick-row">
          {['0.001', '0.01', '0.05', '0.1'].map(v => (
            <button key={v} className="chip-btn" onClick={() => setBet(v)} disabled={rolling}>{v}</button>
          ))}
        </div>
        <div className="field-label">Roll under: {target} ({chance}% win chance)</div>
        <input className="input" type="range" min="2" max="95" value={target}
          onChange={e => setTarget(+e.target.value)} disabled={rolling} />
        <button className="bet-btn" onClick={play} disabled={rolling}>
          {rolling ? 'Rolling…' : `Roll · pays ${payout.toFixed(2)}x`}
        </button>
        <div className="paytable">Roll 0–100. Win if the roll lands under your target. Payout = 99 ÷ chance.</div>
      </div>

      <div className="stage">
        <div className="dice-roll-num">{rolling ? '…' : roll === null ? '—' : roll}</div>
        <div className="dice-bar">
          <div className="fill" style={{ width: `${target}%` }} />
          {roll !== null && !rolling && <div className="marker" style={{ left: `${roll}%` }} />}
        </div>
        <div className="dice-stats">
          <div className="stat-box"><div className="v">{chance}%</div><div className="k">Win chance</div></div>
          <div className="stat-box"><div className="v">{payout.toFixed(2)}x</div><div className="k">Multiplier</div></div>
          <div className="stat-box"><div className="v">{fmtBtc((parseFloat(bet) || 0) * payout)}</div><div className="k">Payout</div></div>
        </div>
        {msg && <div className={`result-msg ${msg.cls}`}>{msg.text}</div>}
      </div>
    </div>
  )
}
