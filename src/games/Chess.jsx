import React, { useEffect, useRef, useState } from 'react'
import { useWallet, fmtBtc } from '../wallet.jsx'
import {
  initialState, legalMoves, applyMove, gameStatus, bestMove,
  nameOf, notate
} from './chessEngine.js'
import Piece from './chessPieces.jsx'

const LEVELS = [
  { id: 2, label: 'Casual', pay: 1.6 },
  { id: 3, label: 'Club', pay: 1.95 },
  { id: 4, label: 'Sharp', pay: 2.6 }
]

export default function Chess() {
  const w = useWallet()
  const [bet, setBet] = useState('0.01')
  const [depth, setDepth] = useState(3)
  const [st, setSt] = useState(null)
  const [sel, setSel] = useState(null)
  const [promo, setPromo] = useState(null) // {from,to} awaiting piece choice
  const [msg, setMsg] = useState(null)
  const [over, setOver] = useState(null)
  const [stake, setStake] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [moves, setMoves] = useState([])
  const [lastMove, setLastMove] = useState(null)
  const settled = useRef(false)

  const level = LEVELS.find(l => l.id === depth)

  const start = () => {
    const amt = parseFloat(bet)
    if (!w.canAfford(amt)) return setMsg({ cls: 'lose', text: 'Insufficient balance' })
    w.debit(amt, 'Chess bet')
    settled.current = false
    setStake(amt)
    setSt(initialState())
    setSel(null); setPromo(null); setOver(null); setMoves([]); setLastMove(null)
    setMsg({ cls: 'push', text: 'You are White — your move' })
  }

  const finish = (result, reason) => {
    if (settled.current) return
    settled.current = true
    setOver({ result, reason })
    if (result === 'white') {
      w.credit(stake * level.pay, 'Chess win')
      setMsg({ cls: 'win', text: `Checkmate — you win! +${fmtBtc(stake * (level.pay - 1))} (${reason})` })
    } else if (result === 'draw') {
      w.credit(stake, 'Chess draw refund')
      setMsg({ cls: 'push', text: `Draw by ${reason} — stake returned` })
    } else {
      setMsg({ cls: 'lose', text: `You lose by ${reason}` })
    }
  }

  const checkEnd = next => {
    const status = gameStatus(next)
    if (status.over) { finish(status.result, status.reason); return true }
    setMsg(status.checked
      ? { cls: 'lose', text: next.turn === 'w' ? 'You are in check!' : 'Bot is in check' }
      : { cls: 'push', text: next.turn === 'w' ? 'Your move' : 'Bot is thinking…' })
    return false
  }

  const doMove = mv => {
    const label = notate(st, mv)
    const { state } = applyMove(st, mv)
    setSt(state)
    setSel(null)
    setLastMove({ from: mv.from, to: mv.to })
    setMoves(m => [...m, label])
    checkEnd(state)
  }

  // bot turn
  useEffect(() => {
    if (!st || st.turn !== 'b' || over) return
    setThinking(true)
    const t = setTimeout(() => {
      const mv = bestMove(st, depth)
      if (!mv) { setThinking(false); return }
      const label = notate(st, mv)
      const { state } = applyMove(st, mv)
      setSt(state)
      setLastMove({ from: mv.from, to: mv.to })
      setMoves(m => [...m, label])
      setThinking(false)
      checkEnd(state)
    }, 260)
    return () => clearTimeout(t)
  }, [st, over, depth])

  const myTurn = st && st.turn === 'w' && !over && !thinking && !promo
  const legal = myTurn && sel !== null ? legalMoves(st, sel) : []
  const targets = new Set(legal.map(m => m.to))

  const clickSquare = i => {
    if (!myTurn) return
    const piece = st.board[i]
    if (sel !== null && targets.has(i)) {
      const opts = legal.filter(m => m.to === i)
      if (opts.some(m => m.promo)) return setPromo({ from: sel, to: i })
      return doMove(opts[0])
    }
    if (piece && piece[0] === 'w') {
      setSel(i === sel ? null : i)
    } else {
      setSel(null)
    }
  }

  const choosePromo = pr => {
    const mv = legalMoves(st, promo.from).find(m => m.to === promo.to && m.promo === pr)
    setPromo(null)
    if (mv) doMove(mv)
  }

  const resign = () => finish('black', 'resignation')

  const playing = st && !over

  return (
    <div className="game-wrap">
      <div className="panel">
        <h2>♟️ Chess</h2>
        <div className="field-label">Bet amount (BTC)</div>
        <input className="input" type="number" step="0.001" min="0.0001" value={bet}
          onChange={e => setBet(e.target.value)} disabled={playing} />
        <div className="quick-row">
          {['0.001', '0.01', '0.05', '0.1'].map(v => (
            <button key={v} className="chip-btn" onClick={() => setBet(v)} disabled={playing}>{v}</button>
          ))}
        </div>
        <div className="field-label">Opponent strength</div>
        <div className="quick-row">
          {LEVELS.map(l => (
            <button key={l.id} className={`chip-btn ${depth === l.id ? 'sel-chip' : ''}`}
              onClick={() => setDepth(l.id)} disabled={playing}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="field-label">Win pays {level.pay}x · draw refunds your stake</div>

        {!playing && <button className="bet-btn" onClick={start}>New game</button>}
        {playing && <button className="bet-btn secondary" onClick={resign}>Resign</button>}

        {moves.length > 0 && (
          <div className="movelist">
            {moves.map((m, i) => (
              <span key={i} className="move-item">
                {i % 2 === 0 && <b>{i / 2 + 1}.</b>} {m}
              </span>
            ))}
          </div>
        )}
        <div className="paytable">
          Full rules: castling, en passant, promotion, check, checkmate, stalemate,
          the 50-move rule and threefold repetition. You play White.
        </div>
      </div>

      <div className="stage">
        {!st && <div className="empty">Place a bet and start a new game</div>}
        {st && (
          <>
            <div className="hand-label">
              Bot (Black) {thinking && '· thinking…'}
            </div>
            <div className="chessboard">
              {st.board.map((piece, i) => {
                const f = i % 8, r = Math.floor(i / 8)
                const dark = (r + f) % 2 === 1
                const isTarget = targets.has(i)
                const isLast = lastMove && (lastMove.from === i || lastMove.to === i)
                return (
                  <button key={i}
                    className={`csq ${dark ? 'dark' : 'light'} ${sel === i ? 'sel' : ''} ${isLast ? 'last' : ''}`}
                    onClick={() => clickSquare(i)}
                    title={nameOf(i)}>
                    {r === 7 && <span className="csq-file">{'abcdefgh'[f]}</span>}
                    {f === 0 && <span className="csq-rank">{8 - r}</span>}
                    {isTarget && st.board[i] && <span className="cap-ring" />}
                    {piece && <Piece piece={piece} />}
                    {isTarget && !st.board[i] && <span className="move-dot" />}
                  </button>
                )
              })}
            </div>

            {promo && (
              <div className="ws-picker">
                Promote to:
                {['Q', 'R', 'B', 'N'].map(p => (
                  <button key={p} className="promo-btn" onClick={() => choosePromo(p)}>
                    <Piece piece={'w' + p} />
                  </button>
                ))}
              </div>
            )}

            <div className="hand-label">You (White)</div>
            {msg && <div className={`result-msg ${msg.cls}`}>{msg.text}</div>}
          </>
        )}
      </div>
    </div>
  )
}
