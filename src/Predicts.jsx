import React, { useEffect, useState } from 'react'
import { useWallet, fmtBtc } from './wallet.jsx'
import { loadBets, saveBets } from './bets.js'
import { predicts } from './api.js'

const cents = p => `${Math.round(p * 100)}¢`
const fmtVol = v =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`

export default function Predicts() {
  const w = useWallet()
  const [markets, setMarkets] = useState(null)
  const [error, setError] = useState(null)
  const [pick, setPick] = useState(null) // {m, side}
  const [stake, setStake] = useState('0.01')
  const [placed, setPlaced] = useState(null)

  useEffect(() => {
    let alive = true
    predicts()
      .then(d => {
        if (!alive) return
        setMarkets(d.markets)
      })
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [])

  const select = (m, side) => {
    setPlaced(null)
    setPick(p => (p && p.m.id === m.id && p.side === side ? null : { m, side }))
  }
  const isSel = (m, side) => pick && pick.m.id === m.id && pick.side === side

  const price = pick ? pick.m[pick.side] : null
  const payout = pick ? (parseFloat(stake) || 0) / price : 0

  const place = () => {
    const amt = parseFloat(stake)
    if (!pick) return
    if (!w.canAfford(amt)) return setPlaced({ cls: 'lose', text: 'Insufficient balance' })
    const { m, side } = pick
    w.debit(amt, `Predict: ${side.toUpperCase()} ${m.question.slice(0, 40)}`)
    const bet = {
      id: `predict-${m.id}-${side}-${Date.now()}`,
      market: 'predict',
      league: 'predict',
      predictId: m.id,
      question: m.question,
      side,
      price,
      label: `${side === 'yes' ? 'YES' : 'NO'} @ ${cents(price)}`,
      matchup: m.question,
      odds: null,
      stake: amt,
      simulated: false,
      eventDate: m.endDate,
      status: 'open',
      placedAt: Date.now()
    }
    saveBets([bet, ...loadBets()])
    setPick(null)
    setPlaced({ cls: 'win', text: `Position opened: ${bet.label} — pays ${fmtBtc(amt / price)} if it hits` })
  }

  return (
    <div className="sb-wrap">
      <div>
        <div className="banner">
          Real event markets with <b>live prices from Polymarket</b>. Buy Yes or No with play
          money — a winning contract pays out at 1.00 (so 40¢ → 2.5x). Settles when the market resolves.
        </div>
        {error && <div className="empty">Couldn't load markets: {error}</div>}
        {!markets && !error && <div className="spin">Loading live markets…</div>}
        {markets && markets.map(m => (
          <div key={m.id} className="event-card">
            <div className="ev-teams" style={{ flex: 1, minWidth: 200 }}>
              <div className="ev-team" style={{ fontSize: 15 }}>{m.question}</div>
              <div className="ev-meta">
                {m.category && <>{m.category} · </>}
                {fmtVol(m.volume)} traded · ends {new Date(m.endDate).toLocaleDateString()}
              </div>
            </div>
            <div className="mkts">
              <div className="mkt-col">
                <div className="mkt-h">Yes</div>
                <button className={`ml-btn yes ${isSel(m, 'yes') ? 'sel' : ''}`}
                  onClick={() => select(m, 'yes')}>
                  {cents(m.yes)}
                  <span className="lbl">{(1 / m.yes).toFixed(2)}x</span>
                </button>
              </div>
              <div className="mkt-col">
                <div className="mkt-h">No</div>
                <button className={`ml-btn no ${isSel(m, 'no') ? 'sel' : ''}`}
                  onClick={() => select(m, 'no')}>
                  {cents(m.no)}
                  <span className="lbl">{(1 / m.no).toFixed(2)}x</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel betslip">
        <h2>🔮 Position</h2>
        {!pick && <div className="empty" style={{ padding: '20px 0' }}>Pick Yes or No on any market</div>}
        {pick && (
          <>
            <div className="slip-line" style={{ gap: 8 }}><span>Market</span><b style={{ textAlign: 'right' }}>{pick.m.question}</b></div>
            <div className="slip-line"><span>Side</span><b>{pick.side.toUpperCase()} @ {cents(price)}</b></div>
            <div className="field-label">Stake (BTC)</div>
            <input className="input" type="number" step="0.001" min="0.0001" value={stake}
              onChange={e => setStake(e.target.value)} />
            <div className="quick-row">
              {['0.001', '0.01', '0.05', '0.1'].map(v => (
                <button key={v} className="chip-btn" onClick={() => setStake(v)}>{v}</button>
              ))}
            </div>
            <div className="slip-line" style={{ marginTop: 12 }}>
              <span>Pays if right</span>
              <b className="win">{fmtBtc(payout)} ({(1 / price).toFixed(2)}x)</b>
            </div>
            <button className="bet-btn" onClick={place}>Buy {pick.side.toUpperCase()}</button>
            <button className="bet-btn secondary" onClick={() => setPick(null)}>Clear</button>
          </>
        )}
        {placed && <div className={`result-msg ${placed.cls}`} style={{ fontSize: 14 }}>{placed.text}</div>}
      </div>
    </div>
  )
}
