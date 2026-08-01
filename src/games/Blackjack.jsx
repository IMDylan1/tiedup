import React, { useState } from 'react'
import { useWallet, fmtBtc } from '../wallet.jsx'

const SUITS = ['♠', '♥', '♦', '♣']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

const freshDeck = () => {
  const d = []
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s })
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

const handValue = cards => {
  let total = 0, aces = 0
  for (const c of cards) {
    if (c.r === 'A') { total += 11; aces++ }
    else if (['J', 'Q', 'K'].includes(c.r)) total += 10
    else total += +c.r
  }
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

const Card = ({ c, hidden }) =>
  hidden ? <div className="pcard back" /> : (
    <div className={`pcard ${['♥', '♦'].includes(c.s) ? 'red' : ''}`}>
      <div>{c.r}</div>
      <div>{c.s}</div>
    </div>
  )

export default function Blackjack() {
  const w = useWallet()
  const [bet, setBet] = useState('0.01')
  const [deck, setDeck] = useState([])
  const [player, setPlayer] = useState([])
  const [dealer, setDealer] = useState([])
  const [phase, setPhase] = useState('idle') // idle | playing | done
  const [msg, setMsg] = useState(null)
  const [stake, setStake] = useState(0)

  const deal = () => {
    const amt = parseFloat(bet)
    if (!w.canAfford(amt)) return setMsg({ cls: 'lose', text: 'Insufficient balance' })
    w.debit(amt, 'Blackjack bet')
    setStake(amt)
    const d = freshDeck()
    const p = [d.pop(), d.pop()]
    const dl = [d.pop(), d.pop()]
    setDeck(d); setPlayer(p); setDealer(dl); setMsg(null)
    if (handValue(p) === 21) {
      finish(p, dl, d, amt, true)
    } else {
      setPhase('playing')
    }
  }

  const finish = (p, dl, d, amt, isBlackjack = false) => {
    const pv = handValue(p)
    let dealerHand = [...dl]
    if (pv <= 21 && !isBlackjack) {
      while (handValue(dealerHand) < 17) dealerHand.push(d.pop())
    }
    const dv = handValue(dealerHand)
    setDealer(dealerHand); setDeck(d); setPhase('done')

    if (isBlackjack) {
      if (dv === 21 && dealerHand.length === 2) {
        w.credit(amt, 'Blackjack push')
        setMsg({ cls: 'push', text: 'Both blackjack — push' })
      } else {
        w.credit(amt * 2.5, 'Blackjack win 3:2')
        setMsg({ cls: 'win', text: `Blackjack! +${fmtBtc(amt * 1.5)}` })
      }
    } else if (pv > 21) {
      setMsg({ cls: 'lose', text: `Bust with ${pv} — you lose` })
    } else if (dv > 21) {
      w.credit(amt * 2, 'Blackjack win')
      setMsg({ cls: 'win', text: `Dealer busts with ${dv}! +${fmtBtc(amt)}` })
    } else if (pv > dv) {
      w.credit(amt * 2, 'Blackjack win')
      setMsg({ cls: 'win', text: `${pv} beats ${dv}! +${fmtBtc(amt)}` })
    } else if (pv < dv) {
      setMsg({ cls: 'lose', text: `${dv} beats ${pv} — you lose` })
    } else {
      w.credit(amt, 'Blackjack push')
      setMsg({ cls: 'push', text: `Push at ${pv}` })
    }
  }

  const hit = () => {
    const d = [...deck]
    const p = [...player, d.pop()]
    setDeck(d); setPlayer(p)
    if (handValue(p) > 21) finish(p, dealer, d, stake)
  }

  const stand = () => finish(player, dealer, [...deck], stake)

  const double = () => {
    if (!w.canAfford(stake)) return
    w.debit(stake, 'Blackjack double')
    const d = [...deck]
    const p = [...player, d.pop()]
    setDeck(d); setPlayer(p); setStake(stake * 2)
    finish(p, dealer, d, stake * 2)
  }

  const playing = phase === 'playing'

  return (
    <div className="game-wrap">
      <div className="panel">
        <h2>🂡 Blackjack</h2>
        <div className="field-label">Bet amount (BTC)</div>
        <input className="input" type="number" step="0.001" min="0.0001" value={bet}
          onChange={e => setBet(e.target.value)} disabled={playing} />
        <div className="quick-row">
          {['0.001', '0.01', '0.05', '0.1'].map(v => (
            <button key={v} className="chip-btn" onClick={() => setBet(v)} disabled={playing}>{v}</button>
          ))}
        </div>
        {!playing && <button className="bet-btn" onClick={deal}>Deal</button>}
        {playing && (
          <>
            <button className="bet-btn" onClick={hit}>Hit</button>
            <button className="bet-btn secondary" onClick={stand}>Stand</button>
            {player.length === 2 && (
              <button className="bet-btn secondary" onClick={double} disabled={!w.canAfford(stake)}>
                Double Down
              </button>
            )}
          </>
        )}
        <div className="paytable">Blackjack pays 3:2 · Dealer stands on 17 · Double on first two cards</div>
      </div>

      <div className="stage">
        {player.length === 0 ? (
          <div className="empty">Place a bet and deal to start</div>
        ) : (
          <>
            <div className="hand-label">Dealer {phase === 'done' ? `· ${handValue(dealer)}` : ''}</div>
            <div className="hand-row">
              {dealer.map((c, i) => <Card key={i} c={c} hidden={playing && i === 1} />)}
            </div>
            <div className="hand-label">You · {handValue(player)}</div>
            <div className="hand-row">
              {player.map((c, i) => <Card key={i} c={c} />)}
            </div>
            {msg && <div className={`result-msg ${msg.cls}`}>{msg.text}</div>}
          </>
        )}
      </div>
    </div>
  )
}
