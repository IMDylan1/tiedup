import React, { useState } from 'react'
import { useWallet, fmtBtc } from './wallet.jsx'
import { loadBets, saveBets, fmtOdds, payoutFor, PROP_MULTS, decOf } from './bets.js'
import { summary, predictOne, winTotals } from './api.js'

const summaryCache = {}
async function getSummary(league, eventId) {
  const key = `${league}/${eventId}`
  if (!summaryCache[key]) summaryCache[key] = await summary(league, eventId)
  return summaryCache[key]
}

// ---- team/fight settlement: returns 'won' | 'lost' | 'push' | null (not final) ----
async function settleGameBet(bet) {
  const d = await getSummary(bet.league, bet.eventId)
  const comps = d?.header?.competitions || []
  const comp = bet.compId ? comps.find(c => String(c.id) === String(bet.compId)) : comps[0]
  if (!comp?.status?.type?.completed) return null

  const cs = comp.competitors || []
  const home = cs.find(c => c.homeAway === 'home') ?? cs[1]
  const away = cs.find(c => c.homeAway === 'away') ?? cs[0]

  if (bet.betType === 'fight') {
    const me = cs.find(c => (c.athlete?.displayName || c.team?.displayName) === bet.team)
    if (!me) return 'push'
    if (me.winner === true) return 'won'
    return cs.some(c => c.winner === true) ? 'lost' : 'push' // draw / no contest refunds
  }

  const hs = parseFloat(home?.score), as = parseFloat(away?.score)
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null

  switch (bet.market) {
    case 'ml': {
      if (bet.side === 'draw') return hs === as ? 'won' : 'lost'
      const me = bet.side === 'home' ? home : away
      if (me?.winner === true) return 'won'
      if (hs === as && !home?.winner && !away?.winner) return 'push' // 2-way line, tie game
      return 'lost'
    }
    case 'spread': {
      const own = bet.side === 'home' ? hs : as
      const opp = bet.side === 'home' ? as : hs
      const margin = own + bet.line - opp
      return margin > 0 ? 'won' : margin === 0 ? 'push' : 'lost'
    }
    case 'total': {
      const tot = hs + as
      if (tot === bet.line) return 'push'
      return (bet.side === 'over' ? tot > bet.line : tot < bet.line) ? 'won' : 'lost'
    }
    default:
      return null
  }
}

// ---- parlay settlement ----
// returns null while any needed leg is unfinished; a single lost leg kills it early
async function settleParlay(bet) {
  const outcomes = []
  for (const leg of bet.legs) {
    let out = null
    try {
      out = leg.market === 'wintotal' ? await settleWinTotal(leg) : await settleGameBet(leg)
    } catch { /* still open */ }
    outcomes.push({ leg, out })
    if (out === 'lost') return { outcome: 'lost', outcomes }
  }
  if (outcomes.some(o => o.out === null)) return null
  const liveLegs = outcomes.filter(o => o.out === 'won') // pushes drop out of the multiplier
  if (liveLegs.length === 0) return { outcome: 'push', outcomes }
  const dec = liveLegs.reduce((acc, o) => acc * decOf(o.leg.odds), 1)
  return { outcome: 'won', outcomes, dec }
}

// ---- prediction market settlement ----
async function settlePredict(bet) {
  const d = await predictOne(bet.predictId)
  if (!d.closed || d.yesFinal == null) return null
  const winner = d.yesFinal > 0.5 ? 'yes' : 'no'
  return bet.side === winner ? 'won' : 'lost'
}

// ---- season win totals: graded the moment the over clinches or is eliminated ----
async function settleWinTotal(bet) {
  const d = await winTotals(bet.wtLeague)
  const team = d?.teams?.find(t => String(t.id) === String(bet.teamId))
  if (!team) return null
  const maxPossible = team.curWins + (d.games - team.curPlayed)
  const overHit = team.curWins > bet.line
  const overDead = maxPossible < bet.line
  if (!overHit && !overDead) return null // season still in the balance
  return (bet.side === 'over') === overHit ? 'won' : 'lost'
}

// ---- props settlement ----
function statFromBox(boxTeams, pick) {
  for (const t of boxTeams) {
    for (const group of t.statistics || []) {
      const labels = group.labels || []
      let idx = null, kind = null
      if (pick.stat === 'PTS' || pick.stat === 'REB' || pick.stat === 'AST') {
        idx = labels.indexOf(pick.stat); kind = 'single'
      } else if (pick.stat === 'H' && labels.includes('AB')) {
        idx = labels.indexOf('H'); kind = 'single'
      } else if (pick.stat === 'HRR' && labels.includes('AB')) {
        kind = 'sum'
      } else if (pick.stat === 'passYds' && group.name === 'passing') {
        idx = labels.indexOf('YDS'); kind = 'single'
      } else if (pick.stat === 'rushYds' && group.name === 'rushing') {
        idx = labels.indexOf('YDS'); kind = 'single'
      } else if (pick.stat === 'recYds' && group.name === 'receiving') {
        idx = labels.indexOf('YDS'); kind = 'single'
      }
      if (kind === null || (kind === 'single' && (idx == null || idx < 0))) continue

      for (const a of group.athletes || []) {
        if (a.athlete?.displayName !== pick.athlete) continue
        const stats = a.stats || []
        if (stats.length === 0) continue
        if (kind === 'single') {
          const v = parseFloat(stats[idx])
          return Number.isFinite(v) ? v : null
        }
        // HRR = hits + runs + RBIs
        const gi = s => parseFloat(stats[labels.indexOf(s)]) || 0
        return gi('H') + gi('R') + gi('RBI')
      }
    }
  }
  return null // did not play / not found
}

async function settlePropsEntry(bet) {
  const results = []
  for (const pick of bet.picks) {
    const d = await getSummary(pick.league, pick.eventId)
    const completed = d?.header?.competitions?.[0]?.status?.type?.completed
    if (!completed) return null // entry stays open until every game is final
    const actual = statFromBox(d?.boxscore?.players || [], pick)
    if (actual === null) { results.push({ pick, void: true }); continue }
    const hit = pick.dir === 'more' ? actual > pick.line : actual < pick.line
    results.push({ pick, actual, hit })
  }
  const live = results.filter(r => !r.void)
  if (live.length < 2) return { outcome: 'push', results } // too many DNPs — refund
  const allHit = live.every(r => r.hit)
  const mult = PROP_MULTS[live.length] ?? bet.mult
  return { outcome: allHit ? 'won' : 'lost', results, mult }
}

// ---- casino rounds, reconstructed from the wallet ledger ----
const CASINO_GAMES = ['Blackjack', 'Roulette', 'Slots', 'Crash', 'Dice', 'Wild Stack']
const gameOf = label => CASINO_GAMES.find(g => label.startsWith(g)) || null
const STARTS_ROUND = /\b(bet|bets|spin|roll)\b/i
const EPS = 1e-9

function casinoRounds(history) {
  const chron = [...history].reverse() // ledger is newest-first
  const open = {}
  const out = []
  const close = g => { if (open[g]) { out.push(open[g]); delete open[g] } }

  for (const h of chron) {
    const g = gameOf(h.label)
    if (!g) continue
    if (h.delta < 0) {
      // a fresh wager closes the previous round (a loss never emits a credit);
      // follow-on debits like "Blackjack double" fold into the round in progress
      if (STARTS_ROUND.test(h.label)) close(g)
      if (!open[g]) open[g] = { game: g, at: h.at, staked: 0, returned: 0, notes: [] }
      open[g].staked += -h.delta
    } else {
      if (!open[g]) open[g] = { game: g, at: h.at, staked: 0, returned: 0, notes: [] }
      open[g].returned += h.delta
      open[g].notes.push(h.label)
      close(g)
    }
  }
  for (const g of Object.keys(open)) out.push(open[g])

  return out
    .map((r, i) => {
      const profit = r.returned - r.staked
      return {
        ...r,
        id: `casino-${r.at}-${i}`,
        kind: 'casino',
        profit,
        status: profit > EPS ? 'won' : profit < -EPS ? 'lost' : 'push'
      }
    })
    .sort((a, b) => b.at - a.at)
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'sports', label: 'Sports' },
  { id: 'casino', label: 'Casino' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' }
]

export default function MyBets() {
  const w = useWallet()
  const [bets, setBets] = useState(loadBets)
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState(null)
  const [filter, setFilter] = useState('all')

  const settle = async () => {
    setChecking(true); setNote(null)
    const open = bets.filter(b => b.status === 'open')
    let settled = 0, wonBtc = 0
    const updated = [...bets]

    for (const bet of open) {
      try {
        const i = updated.findIndex(b => b.id === bet.id)
        if (bet.market === 'wintotal') {
          const outcome = await settleWinTotal(bet)
          if (!outcome) continue
          updated[i] = { ...bet, status: outcome, settledAt: Date.now() }
          settled++
          if (outcome === 'won') {
            const pay = payoutFor(bet.stake, bet.odds)
            w.credit(pay, `Win total: ${bet.label}`)
            wonBtc += pay
          }
        } else if (bet.market === 'predict') {
          const outcome = await settlePredict(bet)
          if (!outcome) continue
          updated[i] = { ...bet, status: outcome, settledAt: Date.now() }
          settled++
          if (outcome === 'won') {
            const pay = bet.stake / bet.price
            w.credit(pay, `Predict win: ${bet.label}`)
            wonBtc += pay
          }
        } else if (bet.market === 'parlay') {
          const res = await settleParlay(bet)
          if (!res) continue
          const detail = res.outcomes
            .map(o => `${o.leg.label}: ${o.out ?? 'pending'}`)
            .join(' · ')
          updated[i] = { ...bet, status: res.outcome, detail, settledAt: Date.now() }
          settled++
          if (res.outcome === 'won') {
            const pay = bet.stake * res.dec
            w.credit(pay, `Parlay win: ${bet.label}`)
            wonBtc += pay
          } else if (res.outcome === 'push') {
            w.credit(bet.stake, `Parlay refund: ${bet.label}`)
          }
        } else if (bet.market === 'props') {
          const res = await settlePropsEntry(bet)
          if (!res) continue
          const detail = res.results
            .map(r => r.void
              ? `${r.pick.athlete}: DNP (void)`
              : `${r.pick.athlete}: ${r.actual} (${r.hit ? 'hit' : 'miss'} ${r.pick.dir} ${r.pick.line})`)
            .join(' · ')
          updated[i] = { ...bet, status: res.outcome, detail, settledAt: Date.now() }
          settled++
          if (res.outcome === 'won') {
            const pay = bet.stake * res.mult
            w.credit(pay, `Props win: ${bet.label}`)
            wonBtc += pay
          } else if (res.outcome === 'push') {
            w.credit(bet.stake, `Props refund: ${bet.label}`)
          }
        } else {
          const outcome = await settleGameBet(bet)
          if (!outcome) continue
          updated[i] = { ...bet, status: outcome, settledAt: Date.now() }
          settled++
          if (outcome === 'won') {
            const pay = payoutFor(bet.stake, bet.odds)
            w.credit(pay, `Sportsbook win: ${bet.label || bet.team}`)
            wonBtc += pay
          } else if (outcome === 'push') {
            w.credit(bet.stake, `Sportsbook push: ${bet.label || bet.team}`)
          }
        }
      } catch { /* leave open, try again later */ }
    }

    saveBets(updated)
    setBets(updated)
    setChecking(false)
    setNote(
      settled === 0
        ? 'No open bets have finished yet.'
        : `Settled ${settled} bet(s)${wonBtc > 0 ? ` — paid out ${fmtBtc(wonBtc)}` : ''}.`
    )
  }

  const clearSettled = () => {
    const remaining = bets.filter(b => b.status === 'open')
    saveBets(remaining)
    setBets(remaining)
  }

  const toWin = b =>
    b.market === 'props' ? b.stake * b.mult
    : b.market === 'parlay' ? b.stake * b.dec
    : b.market === 'predict' ? b.stake / b.price
    : payoutFor(b.stake, b.odds)

  const profitOf = b =>
    b.status === 'won' ? toWin(b) - b.stake : b.status === 'push' ? 0 : -b.stake

  const rounds = casinoRounds(w.history || [])
  const settledBets = bets.filter(b => b.status !== 'open')
  const openBets = bets.filter(b => b.status === 'open')

  const wagered = bets.reduce((s, b) => s + b.stake, 0) + rounds.reduce((s, r) => s + r.staked, 0)
  const netPL = settledBets.reduce((s, b) => s + profitOf(b), 0) + rounds.reduce((s, r) => s + r.profit, 0)
  const atRisk = openBets.reduce((s, b) => s + b.stake, 0)
  const graded = [...settledBets, ...rounds]
  const wins = graded.filter(x => x.status === 'won').length
  const losses = graded.filter(x => x.status === 'lost').length
  const pushes = graded.filter(x => x.status === 'push').length
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null

  const items = [
    ...bets.map(b => ({ ...b, kind: 'sports', at: b.placedAt ?? 0 })),
    ...rounds
  ].sort((a, b) => b.at - a.at)

  const shown = items.filter(x =>
    filter === 'all' ? true
    : filter === 'open' ? x.status === 'open'
    : filter === 'sports' ? x.kind === 'sports'
    : filter === 'casino' ? x.kind === 'casino'
    : x.status === filter
  )

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ marginRight: 'auto' }}>🧾 My Bets</h2>
        <button className="league-tab active" onClick={settle} disabled={checking}>
          {checking ? 'Checking results…' : 'Check results'}
        </button>
        <button className="league-tab" onClick={clearSettled}>Clear settled</button>
      </div>

      <div className="stats-row">
        <div className="stat-box"><div className="v">{fmtBtc(wagered)}</div><div className="k">Total wagered</div></div>
        <div className="stat-box">
          <div className={`v ${netPL > 0 ? 'win' : netPL < 0 ? 'lose' : ''}`}>
            {netPL >= 0 ? '+' : '−'}{fmtBtc(Math.abs(netPL))}
          </div>
          <div className="k">Net profit/loss</div>
        </div>
        <div className="stat-box">
          <div className="v">{wins}–{losses}{pushes ? `–${pushes}` : ''}</div>
          <div className="k">W–L{pushes ? '–P' : ''}</div>
        </div>
        <div className="stat-box"><div className="v">{winRate === null ? '—' : `${winRate}%`}</div><div className="k">Win rate</div></div>
        <div className="stat-box"><div className="v">{openBets.length}</div><div className="k">Open bets</div></div>
        <div className="stat-box"><div className="v">{fmtBtc(atRisk)}</div><div className="k">At risk</div></div>
      </div>

      <div className="league-tabs">
        {FILTERS.map(f => {
          const n = items.filter(x =>
            f.id === 'all' ? true
            : f.id === 'open' ? x.status === 'open'
            : f.id === 'sports' ? x.kind === 'sports'
            : f.id === 'casino' ? x.kind === 'casino'
            : x.status === f.id
          ).length
          return (
            <button key={f.id} className={`league-tab sub ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}>
              {f.label} <span style={{ opacity: .65 }}>{n}</span>
            </button>
          )
        })}
      </div>

      {note && <div className="banner">{note}</div>}
      {items.length === 0 && (
        <div className="empty">No bets yet — try the Sportsbook, Props board, or any casino game.</div>
      )}
      {items.length > 0 && shown.length === 0 && (
        <div className="empty">Nothing matches this filter.</div>
      )}

      {shown.filter(x => x.kind === 'casino').length > 0 && (
        <div className="banner" style={{ marginTop: 12 }}>
          Casino rounds are rebuilt from your wallet ledger, which keeps the last 200 entries —
          older plays roll off.
        </div>
      )}

      {shown.map(x => x.kind === 'casino' ? (
        <div key={x.id} className="bet-row">
          <div>
            <b>{x.game}</b>
            <span className="sub"> — {x.notes.length ? x.notes.join(' · ') : 'no return'}</span>
            <div className="sub">
              {new Date(x.at).toLocaleString()} · staked {fmtBtc(x.staked)} ·
              returned {fmtBtc(x.returned)} ·{' '}
              <span className={x.profit > EPS ? 'win' : x.profit < -EPS ? 'lose' : ''}>
                {x.profit >= 0 ? '+' : '−'}{fmtBtc(Math.abs(x.profit))}
              </span>
            </div>
          </div>
          <span className={`status-pill status-${x.status}`}>{x.status.toUpperCase()}</span>
        </div>
      ) : (
        <div key={x.id} className="bet-row">
          <div>
            <b>{x.label || `${x.team} ML`}</b>
            {x.odds != null && <> {fmtOdds(x.odds)}</>}
            {x.market === 'props' && x.mult && <> · {x.mult}x</>}
            <span className="sub"> — {x.matchup}</span>
            <div className="sub">
              {x.league.toUpperCase()} · {new Date(x.eventDate).toLocaleString()} ·
              stake {fmtBtc(x.stake)} · to win {fmtBtc(toWin(x))}
              {x.status !== 'open' && (
                <> · <span className={profitOf(x) > 0 ? 'win' : profitOf(x) < 0 ? 'lose' : ''}>
                  {profitOf(x) >= 0 ? '+' : '−'}{fmtBtc(Math.abs(profitOf(x)))}
                </span></>
              )}
              {x.simulated && <> · <span className="sim-tag">SIM LINE</span></>}
            </div>
            {x.market === 'parlay' && x.status === 'open' && (
              <div className="sub">
                {x.legs.map(l => `${l.label} (${fmtOdds(l.odds)})`).join(' · ')}
              </div>
            )}
            {x.market === 'props' && x.status === 'open' && (
              <div className="sub">
                {x.picks.map(p => `${p.dir === 'more' ? '▲' : '▼'} ${p.athlete} ${p.line} ${p.statName}`).join(' · ')}
              </div>
            )}
            {x.detail && <div className="sub">{x.detail}</div>}
          </div>
          <span className={`status-pill status-${x.status}`}>{x.status.toUpperCase()}</span>
        </div>
      ))}
    </div>
  )
}
