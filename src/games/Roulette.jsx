import React, { useEffect, useRef, useState } from 'react'
import { useWallet, fmtBtc } from '../wallet.jsx'

// authentic single-zero (European) pocket order, clockwise from 0
const WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
]
const SEG = 360 / WHEEL.length
const SPIN_MS = 5200

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
const colorOf = n => (n === 0 ? 'g' : REDS.has(n) ? 'r' : 'b')
const FILL = { r: '#c9252d', b: '#17242c', g: '#0e7c34' }

const OUTSIDE = [
  { id: 'red', label: 'Red', pays: 1, test: n => REDS.has(n) },
  { id: 'black', label: 'Black', pays: 1, test: n => n !== 0 && !REDS.has(n) },
  { id: 'odd', label: 'Odd', pays: 1, test: n => n !== 0 && n % 2 === 1 },
  { id: 'even', label: 'Even', pays: 1, test: n => n !== 0 && n % 2 === 0 },
  { id: 'low', label: '1–18', pays: 1, test: n => n >= 1 && n <= 18 },
  { id: 'high', label: '19–36', pays: 1, test: n => n >= 19 },
  { id: 'd1', label: '1st 12', pays: 2, test: n => n >= 1 && n <= 12 },
  { id: 'd2', label: '2nd 12', pays: 2, test: n => n >= 13 && n <= 24 },
  { id: 'd3', label: '3rd 12', pays: 2, test: n => n >= 25 }
]

const C = 150 // wheel center in viewBox units
const polar = (r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)]
}
const wedge = (rOut, rIn, a0, a1) => {
  const [x0, y0] = polar(rOut, a0)
  const [x1, y1] = polar(rOut, a1)
  const [x2, y2] = polar(rIn, a1)
  const [x3, y3] = polar(rIn, a0)
  return `M${x0},${y0} A${rOut},${rOut} 0 0 1 ${x1},${y1} L${x2},${y2} A${rIn},${rIn} 0 0 0 ${x3},${y3} Z`
}

// smallest forward rotation that parks pocket `idx` under the top pointer
const rotationFor = (current, idx, turns) => {
  const cur = ((current % 360) + 360) % 360
  const want = ((-idx * SEG) % 360 + 360) % 360
  return current + turns * 360 + (((want - cur) % 360) + 360) % 360
}

export default function Roulette() {
  const w = useWallet()
  const [bet, setBet] = useState('0.01')
  const [picks, setPicks] = useState([])
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const [msg, setMsg] = useState(null)
  const [history, setHistory] = useState([])
  const [wheelRot, setWheelRot] = useState(0)
  const [ballRot, setBallRot] = useState(0)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const toggle = pick => {
    setPicks(ps => {
      const key = p => `${p.kind}:${p.v}`
      return ps.some(p => key(p) === key(pick))
        ? ps.filter(p => key(p) !== key(pick))
        : [...ps, pick]
    })
  }
  const isSel = (kind, v) => picks.some(p => p.kind === kind && p.v === v)

  const spin = () => {
    const per = parseFloat(bet)
    const total = per * picks.length
    if (picks.length === 0) return setMsg({ cls: 'lose', text: 'Select at least one bet' })
    if (!w.canAfford(total)) return setMsg({ cls: 'lose', text: 'Insufficient balance' })
    w.debit(total, `Roulette ${picks.length} bet(s)`)

    const idx = Math.floor(Math.random() * WHEEL.length)
    const n = WHEEL[idx]

    setSpinning(true)
    setMsg(null)
    setResult(null)
    // wheel drifts clockwise into place; ball orbits the other way and lands on the pointer
    setWheelRot(r => rotationFor(r, idx, 5))
    setBallRot(r => r - 360 * 9 - (((r % 360) + 360) % 360))

    timer.current = setTimeout(() => {
      let winnings = 0
      for (const p of picks) {
        if (p.kind === 'num' && p.v === n) winnings += per * 36
        if (p.kind === 'out') {
          const o = OUTSIDE.find(x => x.id === p.v)
          if (o.test(n)) winnings += per * (o.pays + 1)
        }
      }
      if (winnings > 0) w.credit(winnings, 'Roulette win')
      setResult(n)
      setHistory(h => [n, ...h].slice(0, 12))
      setSpinning(false)
      const net = winnings - total
      setMsg(
        net > 0 ? { cls: 'win', text: `${n} ${colorOf(n) === 'g' ? 'green' : colorOf(n) === 'r' ? 'red' : 'black'} — +${fmtBtc(net)}` }
        : net === 0 ? { cls: 'push', text: `${n} — broke even` }
        : { cls: 'lose', text: `${n} — -${fmtBtc(-net)}` }
      )
    }, SPIN_MS + 120)
  }

  const spinStyle = {
    transformOrigin: `${C}px ${C}px`,
    transition: `transform ${SPIN_MS}ms cubic-bezier(.16,.75,.16,1)`
  }

  return (
    <div className="game-wrap">
      <div className="panel">
        <h2>🎡 Roulette</h2>
        <div className="field-label">Bet per selection (BTC)</div>
        <input className="input" type="number" step="0.001" min="0.0001" value={bet}
          onChange={e => setBet(e.target.value)} disabled={spinning} />
        <div className="quick-row">
          {['0.001', '0.01', '0.05', '0.1'].map(v => (
            <button key={v} className="chip-btn" onClick={() => setBet(v)} disabled={spinning}>{v}</button>
          ))}
        </div>
        <div className="field-label">
          {picks.length} selection(s) · total {fmtBtc((parseFloat(bet) || 0) * picks.length)}
        </div>
        <button className="bet-btn" onClick={spin} disabled={spinning}>
          {spinning ? 'No more bets…' : 'Spin'}
        </button>
        <button className="bet-btn secondary" onClick={() => setPicks([])} disabled={spinning}>Clear bets</button>
        <div className="paytable">Straight pays 35:1 · Dozens 2:1 · Even-money 1:1 · Single zero</div>
      </div>

      <div className="stage">
        <div className="wheel-wrap">
          <div className="wheel-pointer" />
          <svg className="wheel" viewBox="0 0 300 300">
            <circle cx={C} cy={C} r="148" fill="#3a2a12" />
            <circle cx={C} cy={C} r="142" fill="#c9a227" />
            <g style={{ ...spinStyle, transform: `rotate(${wheelRot}deg)` }}>
              {WHEEL.map((n, i) => {
                const a0 = i * SEG - SEG / 2
                return (
                  <path key={n} d={wedge(138, 92, a0, a0 + SEG)}
                    fill={FILL[colorOf(n)]} stroke="#c9a227" strokeWidth="0.7" />
                )
              })}
              {WHEEL.map((n, i) => (
                <g key={`t${n}`} transform={`rotate(${i * SEG} ${C} ${C})`}>
                  <text x={C} y="42" textAnchor="middle" fontSize="12" fontWeight="800"
                    fill="#fff" fontFamily="inherit">{n}</text>
                </g>
              ))}
              <circle cx={C} cy={C} r="92" fill="#1a2c38" stroke="#c9a227" strokeWidth="2" />
              {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                <line key={i} x1={C} y1={C} x2={polar(90, i * 45)[0]} y2={polar(90, i * 45)[1]}
                  stroke="#c9a227" strokeWidth="1.5" opacity="0.5" />
              ))}
              <circle cx={C} cy={C} r="34" fill="#c9a227" />
              <circle cx={C} cy={C} r="26" fill="#1a2c38" />
            </g>
            <g style={{ ...spinStyle, transform: `rotate(${ballRot}deg)` }}>
              <circle cx={C} cy="38" r="7" fill="#fff" stroke="#b9b9b9" strokeWidth="1" />
            </g>
          </svg>
        </div>

        {result !== null && !spinning && (
          <div className="rou-result-num" style={{ background: FILL[colorOf(result)] }}>{result}</div>
        )}

        {history.length > 0 && (
          <div className="crash-history">
            {history.map((h, i) => (
              <span key={i} className="crash-pill" style={{ background: FILL[colorOf(h)] }}>{h}</span>
            ))}
          </div>
        )}

        <div className="rou-board">
          <button className={`rou-num g ${isSel('num', 0) ? 'sel' : ''}`}
            onClick={() => toggle({ kind: 'num', v: 0 })} disabled={spinning}>0</button>
          {Array.from({ length: 36 }, (_, i) => i + 1).map(n => (
            <button key={n} className={`rou-num ${colorOf(n)} ${isSel('num', n) ? 'sel' : ''}`}
              onClick={() => toggle({ kind: 'num', v: n })} disabled={spinning}>{n}</button>
          ))}
        </div>
        <div className="rou-outside">
          {OUTSIDE.map(o => (
            <button key={o.id} className={`rou-out-btn ${isSel('out', o.id) ? 'sel' : ''}`}
              onClick={() => toggle({ kind: 'out', v: o.id })} disabled={spinning}>{o.label}</button>
          ))}
        </div>
        {msg && <div className={`result-msg ${msg.cls}`}>{msg.text}</div>}
      </div>
    </div>
  )
}
