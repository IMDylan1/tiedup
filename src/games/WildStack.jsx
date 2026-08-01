import React, { useEffect, useRef, useState } from 'react'
import { useWallet, fmtBtc } from '../wallet.jsx'

// UNO-style rules, original branding. 2-player: Reverse behaves like Skip.
// House rules:
//  · every copy of the same value can be stacked in one turn (last card sets the color)
//  · +2 / +4 penalties stack, but never mix — only the same draw card counters
//    (+2 on +2, +4 on +4); otherwise take the whole pile and forfeit your turn
import {
  COLORS, COLOR_NAMES, NO_DRAW,
  buildDeck, isAction, drawValue, playable, growDraw
} from './wildStackRules.js'

export default function WildStack() {
  const w = useWallet()
  const [bet, setBet] = useState('0.01')
  const [g, setG] = useState(null)
  const [sel, setSel] = useState([])
  const [pendingWild, setPendingWild] = useState(null)
  const tickRef = useRef(0)

  const start = () => {
    const amt = parseFloat(bet)
    if (!w.canAfford(amt)) return setG(s => s ? { ...s, msg: 'Insufficient balance' } : { phase: 'idle', msg: 'Insufficient balance' })
    w.debit(amt, 'Wild Stack bet')
    const deck = buildDeck()
    const player = deck.splice(0, 7)
    const bot = deck.splice(0, 7)
    let top
    do { top = deck.shift() } while (top.c === 'W' || isAction(top.v))
    setPendingWild(null)
    setSel([])
    setG({
      phase: 'play', turn: 'player', deck, discard: [top], curColor: top.c,
      player, bot, draw: NO_DRAW, stake: amt,
      msg: 'Your turn — match the color or number', winner: null, tick: 0
    })
  }

  const takeCards = (s, n) => {
    const out = []
    for (let i = 0; i < n; i++) {
      if (s.deck.length === 0) {
        const top = s.discard[s.discard.length - 1]
        const rest = s.discard.slice(0, -1)
        for (let k = rest.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1))
          ;[rest[k], rest[j]] = [rest[j], rest[k]]
        }
        s.deck = rest
        s.discard = [top]
        if (s.deck.length === 0) break
      }
      out.push(s.deck.shift())
    }
    return out
  }

  const finish = (s, winner) => {
    s.phase = 'done'
    s.winner = winner
    if (winner === 'player') {
      w.credit(s.stake * 1.95, 'Wild Stack win')
      s.msg = `You win! +${fmtBtc(s.stake * 0.95)}`
    } else {
      s.msg = 'House bot wins — better luck next hand'
    }
  }

  // play one or more same-value cards; the last card played sets the color
  const applyStack = (s, who, idxs, chosenColor) => {
    const hand = s[who]
    const cards = idxs.map(i => hand[i])
    s[who] = hand.filter((_, i) => !idxs.includes(i))
    s.discard = [...s.discard, ...cards]
    const last = cards[cards.length - 1]
    s.curColor = last.c === 'W' ? chosenColor : last.c

    const v = cards[0].v
    const n = cards.length
    const opp = who === 'player' ? 'bot' : 'player'
    const played = n > 1 ? `${n}× ${v}` : v

    if (s[who].length === 0) { finish(s, who); return s }

    // draw cards build a pile the opponent must answer or swallow
    if (drawValue(v) > 0) {
      s.draw = growDraw(s.draw, v, n)
      s.turn = opp
      s.msg = who === 'player'
        ? `You played ${played} — bot owes ${s.draw.count} cards`
        : `Bot played ${played} — you owe ${s.draw.count} cards. Counter or take them.`
      if (who === 'bot' && last.c === 'W') s.msg += ` (color: ${COLOR_NAMES[chosenColor]})`
      return s
    }

    const again = v === '⊘' || v === '⇄'
    s.turn = again ? who : opp
    s.msg = who === 'player'
      ? (again ? `You played ${played} — play again!` : 'Bot is thinking…')
      : (again ? `Bot played ${played} — it goes again` : `Bot played ${played} — your turn`)
    if (who === 'bot' && cards.some(c => c.c === 'W')) s.msg += ` (color: ${COLOR_NAMES[chosenColor]})`
    return s
  }

  const clone = s => ({ ...s, tick: ++tickRef.current })

  const commitStack = idxs => {
    const cards = idxs.map(i => g.player[i])
    if (cards[cards.length - 1].c === 'W') return setPendingWild(idxs)
    setSel([])
    setG(applyStack(clone(g), 'player', idxs))
  }

  const clickCard = idx => {
    if (!g || g.phase !== 'play' || g.turn !== 'player' || pendingWild !== null) return
    const top = g.discard[g.discard.length - 1]
    const card = g.player[idx]

    if (sel.length > 0) {
      const anchorV = g.player[sel[0]].v
      if (idx === sel[0]) return setSel([])
      if (sel.includes(idx)) return setSel(sel.filter(i => i !== idx))
      if (card.v === anchorV) return setSel([...sel, idx])
      if (playable(card, top, g.curColor, g.draw)) return startSelection(idx, card)
      return
    }
    if (!playable(card, top, g.curColor, g.draw)) return
    startSelection(idx, card)
  }

  const startSelection = (idx, card) => {
    const dupes = g.player.filter((c, i) => i !== idx && c.v === card.v)
    if (dupes.length === 0) return commitStack([idx])
    setSel([idx])
  }

  const pickColor = c => {
    setSel([])
    setG(applyStack(clone(g), 'player', pendingWild, c))
    setPendingWild(null)
  }

  // swallow the pending draw pile and forfeit the turn
  const takePenalty = () => {
    if (!g || g.draw.count === 0 || g.turn !== 'player') return
    const s = clone(g)
    const n = s.draw.count
    s.player = [...s.player, ...takeCards(s, n)]
    s.draw = NO_DRAW
    s.turn = 'bot'
    s.msg = `You drew ${n} cards — bot's turn`
    setSel([])
    setG(s)
  }

  const drawCard = () => {
    if (!g || g.phase !== 'play' || g.turn !== 'player' || sel.length > 0 || g.draw.count > 0) return
    const s = clone(g)
    const [card] = takeCards(s, 1)
    if (!card) { s.turn = 'bot'; setG(s); return }
    const top = s.discard[s.discard.length - 1]
    s.player = [...s.player, card]
    if (playable(card, top, s.curColor, s.draw)) {
      if (card.c === 'W') {
        setG(s)
        setPendingWild([s.player.length - 1])
        return
      }
      setG(applyStack(s, 'player', [s.player.length - 1]))
    } else {
      s.turn = 'bot'
      s.msg = 'No luck — bot is thinking…'
      setG(s)
    }
  }

  const bestColor = hand => {
    const counts = { R: 0, Y: 0, G: 0, B: 0 }
    for (const c of hand) if (c.c !== 'W') counts[c.c]++
    return COLORS.reduce((a, b) => (counts[b] > counts[a] ? b : a), 'R')
  }

  useEffect(() => {
    if (!g || g.phase !== 'play' || g.turn !== 'bot') return
    const t = setTimeout(() => {
      setG(prev => {
        if (!prev || prev.phase !== 'play' || prev.turn !== 'bot') return prev
        const s = clone(prev)
        const top = s.discard[s.discard.length - 1]
        const options = s.bot
          .map((card, i) => ({ card, i }))
          .filter(o => playable(o.card, top, s.curColor, s.draw))

        // owes a draw pile and can't counter → swallow it
        if (s.draw.count > 0 && options.length === 0) {
          const n = s.draw.count
          s.bot = [...s.bot, ...takeCards(s, n)]
          s.draw = NO_DRAW
          s.turn = 'player'
          s.msg = `Bot drew ${n} cards — your turn`
          return s
        }

        if (options.length === 0) {
          const [card] = takeCards(s, 1)
          if (card && playable(card, top, s.curColor, s.draw)) {
            s.bot = [...s.bot, card]
            return applyStack(s, 'bot', [s.bot.length - 1], bestColor(s.bot.slice(0, -1)))
          }
          if (card) s.bot = [...s.bot, card]
          s.turn = 'player'
          s.msg = 'Bot drew a card — your turn'
          return s
        }

        const urgent = s.player.length <= 2
        options.sort((a, b) => {
          const score = o =>
            (urgent && isAction(o.card.v) ? -2 : 0) + (o.card.c === 'W' ? 1 : 0)
          return score(a) - score(b)
        })
        const anchor = options[0]
        const idxs = [anchor.i, ...s.bot
          .map((c, i) => ({ c, i }))
          .filter(o => o.i !== anchor.i && o.c.v === anchor.card.v)
          .map(o => o.i)]
        const remaining = s.bot.filter((_, i) => !idxs.includes(i))
        const fav = bestColor(remaining)
        idxs.sort((a, b) => {
          if (a === anchor.i) return -1
          if (b === anchor.i) return 1
          return (s.bot[a].c === fav ? 1 : 0) - (s.bot[b].c === fav ? 1 : 0)
        })
        return applyStack(s, 'bot', idxs, fav)
      })
    }, 900)
    return () => clearTimeout(t)
  }, [g?.tick, g?.turn, g?.phase])

  const top = g?.discard[g.discard.length - 1]
  const myTurn = g?.phase === 'play' && g.turn === 'player' && pendingWild === null
  const anchorV = sel.length > 0 ? g.player[sel[0]].v : null
  const owes = g?.draw?.count > 0 && g.turn === 'player'
  const canCounter = owes && g.player.some(c => playable(c, top, g.curColor, g.draw))

  return (
    <div className="game-wrap">
      <div className="panel">
        <h2>🌈 Wild Stack</h2>
        <div className="field-label">Bet amount (BTC)</div>
        <input className="input" type="number" step="0.001" min="0.0001" value={bet}
          onChange={e => setBet(e.target.value)} disabled={g?.phase === 'play'} />
        <div className="quick-row">
          {['0.001', '0.01', '0.05', '0.1'].map(v => (
            <button key={v} className="chip-btn" onClick={() => setBet(v)} disabled={g?.phase === 'play'}>{v}</button>
          ))}
        </div>
        {(!g || g.phase !== 'play') && <button className="bet-btn" onClick={start}>Deal</button>}
        {myTurn && sel.length > 0 && (
          <>
            <button className="bet-btn" onClick={() => commitStack(sel)}>
              Play {sel.length} card{sel.length > 1 ? 's' : ''}
            </button>
            <button className="bet-btn secondary" onClick={() => setSel([])}>Cancel</button>
          </>
        )}
        {myTurn && sel.length === 0 && owes && (
          <button className="bet-btn secondary" onClick={takePenalty}>
            Take {g.draw.count} cards
          </button>
        )}
        {myTurn && sel.length === 0 && !owes && (
          <button className="bet-btn secondary" onClick={drawCard}>Draw a card</button>
        )}
        <div className="paytable">
          Match the top card by color or number. Got copies of the same value? Stack them all in
          one turn — the last card sets the color. <b>+2 and +4 pile up, but never mix:</b> a +2
          can only be answered with another +2, a +4 only with another +4 — the whole stack then
          rolls onto the bot, and whoever can't counter draws the lot.
          ⊘ skips, ⇄ reverses (skips heads-up), ★ picks the color.
          Empty your hand first — win pays 1.95x.
        </div>
      </div>

      <div className="stage">
        {!g && <div className="empty">Place a bet and deal to start</div>}
        {g && (
          <>
            <div className="hand-label">House bot · {g.bot.length} cards</div>
            <div className="hand-row">
              {g.bot.map((_, i) => <div key={i} className="wcard back" />)}
            </div>

            <div className="ws-table">
              {top && <div className={`wcard big c-${top.c}`}>{top.v}</div>}
              {g.phase === 'play' && (
                <div className="ws-color">color: <span className={`dot c-${g.curColor}`} /></div>
              )}
            </div>

            {g.draw.count > 0 && g.phase === 'play' && (
              <div className="draw-pile">
                ⚠️ {g.draw.count} card penalty pending —{' '}
                {g.turn === 'player'
                  ? (canCounter ? `counter with another ${g.draw.type} or take them`
                                : `you have no ${g.draw.type} — take them`)
                  : 'bot must answer it'}
              </div>
            )}

            <div className="hand-label">
              You · {g.player.length} cards
              {sel.length > 0 && <> · stacking {anchorV}s — tap more {anchorV}s, then Play</>}
            </div>
            <div className="hand-row wrap">
              {g.player.map((card, i) => {
                const selected = sel.includes(i)
                const ok = g.phase === 'play' && g.turn === 'player' && (
                  sel.length > 0
                    ? card.v === anchorV || playable(card, top, g.curColor, g.draw)
                    : playable(card, top, g.curColor, g.draw)
                )
                return (
                  <button key={i}
                    className={`wcard c-${card.c} ${selected ? 'picked' : ok ? 'ok' : 'dim'}`}
                    onClick={() => clickCard(i)}
                    disabled={(!ok && !selected) || pendingWild !== null}>
                    {card.v}
                  </button>
                )
              })}
            </div>

            {pendingWild !== null && (
              <div className="ws-picker">
                Pick a color:
                {COLORS.map(c => (
                  <button key={c} className={`dot-btn c-${c}`} onClick={() => pickColor(c)} />
                ))}
              </div>
            )}

            <div className={`result-msg ${g.winner === 'player' ? 'win' : g.winner === 'bot' ? 'lose' : 'push'}`}>
              {g.msg}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
