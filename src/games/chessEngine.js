// Complete chess rules: legal move generation with pins/checks, castling,
// en passant, promotion, and draw detection. Board is a 64-char array,
// index 0 = a8 ... 63 = h1. Pieces are 'wP','bK' etc; empty is null.

export const START = (() => {
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  const b = Array(64).fill(null)
  back.forEach((p, i) => { b[i] = 'b' + p; b[56 + i] = 'w' + p })
  for (let i = 0; i < 8; i++) { b[8 + i] = 'bP'; b[48 + i] = 'wP' }
  return b
})()

// solid glyphs for both sides — the outline set reads as a different piece style;
// colour is applied in CSS so white and black match like a real set
export const GLYPH = {
  wK: '♚', wQ: '♛', wR: '♜', wB: '♝', wN: '♞', wP: '♟',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
}
const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 }

const rank = i => Math.floor(i / 8)
const file = i => i % 8
const colorOf = p => (p ? p[0] : null)
const typeOf = p => (p ? p[1] : null)
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8
export const sq = (f, r) => r * 8 + f
export const nameOf = i => 'abcdefgh'[file(i)] + (8 - rank(i))

export const initialState = () => ({
  board: [...START],
  turn: 'w',
  castle: { wK: true, wQ: true, bK: true, bQ: true },
  ep: null,        // en-passant target square
  halfmove: 0,     // plies since capture/pawn move (50-move rule)
  history: []      // position keys for repetition
})

const SLIDES = {
  B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  R: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  Q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
}
const JUMPS = {
  N: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
  K: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]
}

// pseudo-legal moves (may leave own king in check)
function pseudoMoves(st, from) {
  const { board } = st
  const piece = board[from]
  if (!piece) return []
  const me = colorOf(piece), t = typeOf(piece)
  const f = file(from), r = rank(from)
  const out = []
  const push = (to, extra) => out.push({ from, to, ...extra })

  if (t === 'P') {
    const dir = me === 'w' ? -1 : 1
    const startRank = me === 'w' ? 6 : 1
    const lastRank = me === 'w' ? 0 : 7
    const one = sq(f, r + dir)
    if (onBoard(f, r + dir) && !board[one]) {
      if (r + dir === lastRank) for (const pr of ['Q', 'R', 'B', 'N']) push(one, { promo: pr })
      else push(one)
      const two = sq(f, r + 2 * dir)
      if (r === startRank && !board[two]) push(two, { double: true })
    }
    for (const df of [-1, 1]) {
      const cf = f + df, cr = r + dir
      if (!onBoard(cf, cr)) continue
      const to = sq(cf, cr)
      if (board[to] && colorOf(board[to]) !== me) {
        if (cr === lastRank) for (const pr of ['Q', 'R', 'B', 'N']) push(to, { promo: pr })
        else push(to)
      } else if (to === st.ep) {
        push(to, { ep: true })
      }
    }
    return out
  }

  if (JUMPS[t]) {
    for (const [df, dr] of JUMPS[t]) {
      const cf = f + df, cr = r + dr
      if (!onBoard(cf, cr)) continue
      const to = sq(cf, cr)
      if (!board[to] || colorOf(board[to]) !== me) push(to)
    }
    if (t === 'K') {
      // castling: rights present, squares empty; legality checked later
      const homeRank = me === 'w' ? 7 : 0
      if (r === homeRank && f === 4) {
        if (st.castle[me + 'K'] && !board[sq(5, r)] && !board[sq(6, r)]) push(sq(6, r), { castle: 'K' })
        if (st.castle[me + 'Q'] && !board[sq(3, r)] && !board[sq(2, r)] && !board[sq(1, r)]) push(sq(2, r), { castle: 'Q' })
      }
    }
    return out
  }

  for (const [df, dr] of SLIDES[t]) {
    let cf = f + df, cr = r + dr
    while (onBoard(cf, cr)) {
      const to = sq(cf, cr)
      if (!board[to]) push(to)
      else {
        if (colorOf(board[to]) !== me) push(to)
        break
      }
      cf += df; cr += dr
    }
  }
  return out
}

// is `target` attacked by `by`? (pawn attacks handled directionally)
function attacked(board, target, by) {
  const tf = file(target), tr = rank(target)
  const pawnDir = by === 'w' ? 1 : -1 // a white pawn attacking upward sits below
  for (const df of [-1, 1]) {
    const cf = tf + df, cr = tr + pawnDir
    if (onBoard(cf, cr) && board[sq(cf, cr)] === by + 'P') return true
  }
  for (const [df, dr] of JUMPS.N) {
    const cf = tf + df, cr = tr + dr
    if (onBoard(cf, cr) && board[sq(cf, cr)] === by + 'N') return true
  }
  for (const [df, dr] of JUMPS.K) {
    const cf = tf + df, cr = tr + dr
    if (onBoard(cf, cr) && board[sq(cf, cr)] === by + 'K') return true
  }
  const rays = [
    [SLIDES.R, ['R', 'Q']],
    [SLIDES.B, ['B', 'Q']]
  ]
  for (const [dirs, types] of rays) {
    for (const [df, dr] of dirs) {
      let cf = tf + df, cr = tr + dr
      while (onBoard(cf, cr)) {
        const p = board[sq(cf, cr)]
        if (p) {
          if (colorOf(p) === by && types.includes(typeOf(p))) return true
          break
        }
        cf += df; cr += dr
      }
    }
  }
  return false
}

const kingSquare = (board, color) => board.indexOf(color + 'K')

export const inCheck = st => attacked(st.board, kingSquare(st.board, st.turn), st.turn === 'w' ? 'b' : 'w')

// apply a move, returning the next state (no legality check)
export function applyMove(st, mv) {
  const board = [...st.board]
  const piece = board[mv.from]
  const me = colorOf(piece)
  const them = me === 'w' ? 'b' : 'w'
  const captured = mv.ep ? board[sq(file(mv.to), rank(mv.from))] : board[mv.to]

  board[mv.to] = mv.promo ? me + mv.promo : piece
  board[mv.from] = null
  if (mv.ep) board[sq(file(mv.to), rank(mv.from))] = null
  if (mv.castle) {
    const r = rank(mv.from)
    if (mv.castle === 'K') { board[sq(5, r)] = board[sq(7, r)]; board[sq(7, r)] = null }
    else { board[sq(3, r)] = board[sq(0, r)]; board[sq(0, r)] = null }
  }

  const castle = { ...st.castle }
  if (typeOf(piece) === 'K') { castle[me + 'K'] = false; castle[me + 'Q'] = false }
  if (typeOf(piece) === 'R') {
    if (mv.from === sq(0, me === 'w' ? 7 : 0)) castle[me + 'Q'] = false
    if (mv.from === sq(7, me === 'w' ? 7 : 0)) castle[me + 'K'] = false
  }
  if (mv.to === sq(0, them === 'w' ? 7 : 0)) castle[them + 'Q'] = false
  if (mv.to === sq(7, them === 'w' ? 7 : 0)) castle[them + 'K'] = false

  const next = {
    board,
    turn: them,
    castle,
    ep: mv.double ? sq(file(mv.from), (rank(mv.from) + rank(mv.to)) / 2) : null,
    halfmove: (typeOf(piece) === 'P' || captured) ? 0 : st.halfmove + 1,
    history: [...st.history, board.join(',') + st.turn]
  }
  return { state: next, captured }
}

export function legalMoves(st, from = null) {
  const squares = from !== null ? [from] : st.board.map((_, i) => i)
  const out = []
  for (const i of squares) {
    const p = st.board[i]
    if (!p || colorOf(p) !== st.turn) continue
    for (const mv of pseudoMoves(st, i)) {
      if (mv.castle) {
        // can't castle out of, through, or into check
        const r = rank(mv.from)
        const step = mv.castle === 'K' ? 5 : 3
        const them = st.turn === 'w' ? 'b' : 'w'
        if (attacked(st.board, mv.from, them)) continue
        if (attacked(st.board, sq(step, r), them)) continue
        if (attacked(st.board, mv.to, them)) continue
      }
      const { state } = applyMove(st, mv)
      // after the move it's their turn — make sure OUR king is safe
      if (!attacked(state.board, kingSquare(state.board, st.turn), state.turn)) out.push(mv)
    }
  }
  return out
}

function insufficientMaterial(board) {
  const pieces = board.filter(Boolean).map(typeOf)
  if (pieces.some(t => t === 'P' || t === 'Q' || t === 'R')) return false
  const minors = pieces.filter(t => t === 'B' || t === 'N').length
  return minors <= 1 // K v K, K+minor v K
}

export function gameStatus(st) {
  const moves = legalMoves(st)
  const checked = inCheck(st)
  if (moves.length === 0) {
    return checked
      ? { over: true, result: st.turn === 'w' ? 'black' : 'white', reason: 'checkmate' }
      : { over: true, result: 'draw', reason: 'stalemate' }
  }
  if (st.halfmove >= 100) return { over: true, result: 'draw', reason: '50-move rule' }
  if (insufficientMaterial(st.board)) return { over: true, result: 'draw', reason: 'insufficient material' }
  const key = st.board.join(',') + st.turn
  if (st.history.filter(h => h === key).length >= 2) {
    return { over: true, result: 'draw', reason: 'threefold repetition' }
  }
  return { over: false, checked, moves }
}

// ---- engine: negamax + alpha-beta over material and simple placement ----
const CENTER = i => {
  const d = Math.abs(3.5 - file(i)) + Math.abs(3.5 - rank(i))
  return (7 - d) * 3
}

function evaluate(st) {
  let score = 0
  for (let i = 0; i < 64; i++) {
    const p = st.board[i]
    if (!p) continue
    const t = typeOf(p)
    let v = VALUE[t]
    if (t === 'N' || t === 'B') v += CENTER(i)
    if (t === 'P') {
      const advance = colorOf(p) === 'w' ? 6 - rank(i) : rank(i) - 1
      v += advance * 6 + CENTER(i) * 0.4
    }
    score += colorOf(p) === st.turn ? v : -v
  }
  return score
}

function search(st, depth, alpha, beta) {
  const status = gameStatus(st)
  if (status.over) {
    if (status.reason === 'checkmate') return -100000 - depth // prefer faster mates
    return 0
  }
  if (depth === 0) return evaluate(st)

  // captures first — better pruning
  const moves = status.moves.slice().sort((a, b) => {
    const cap = m => (st.board[m.to] ? VALUE[typeOf(st.board[m.to])] : 0) + (m.promo ? 800 : 0)
    return cap(b) - cap(a)
  })

  let best = -Infinity
  for (const mv of moves) {
    const { state } = applyMove(st, mv)
    const score = -search(state, depth - 1, -beta, -alpha)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

export function bestMove(st, depth = 3) {
  const status = gameStatus(st)
  if (status.over) return null
  const moves = status.moves.slice().sort((a, b) => {
    const cap = m => (st.board[m.to] ? VALUE[typeOf(st.board[m.to])] : 0) + (m.promo ? 800 : 0)
    return cap(b) - cap(a)
  })
  let best = null, bestScore = -Infinity
  for (const mv of moves) {
    const { state } = applyMove(st, mv)
    const score = -search(state, depth - 1, -Infinity, Infinity)
    if (score > bestScore) { bestScore = score; best = mv }
  }
  return best
}

// short algebraic-ish notation for the move list
export function notate(st, mv) {
  const piece = st.board[mv.from]
  const t = typeOf(piece)
  if (mv.castle) return mv.castle === 'K' ? 'O-O' : 'O-O-O'
  const capture = st.board[mv.to] || mv.ep
  const letter = t === 'P' ? (capture ? 'abcdefgh'[file(mv.from)] : '') : t
  return `${letter}${capture ? 'x' : ''}${nameOf(mv.to)}${mv.promo ? '=' + mv.promo : ''}`
}
