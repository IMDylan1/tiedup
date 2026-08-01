const KEY = 'mb_bets_v1'

export const loadBets = () => {
  try {
    const bets = JSON.parse(localStorage.getItem(KEY)) || []
    // migrate bets placed before markets existed (moneyline-only era)
    return bets.map(b => (b.market ? b : {
      ...b,
      market: 'ml',
      betType: 'team',
      label: `${b.team} ML`,
      matchup: `${b.team} vs ${b.opponent}`
    }))
  } catch { return [] }
}
export const saveBets = bets => localStorage.setItem(KEY, JSON.stringify(bets))

export const fmtOdds = ml => (ml > 0 ? `+${ml}` : `${ml}`)

// profit (excluding stake) for American odds
export const profitFor = (stake, ml) => (ml > 0 ? stake * (ml / 100) : stake * (100 / -ml))
export const payoutFor = (stake, ml) => stake + profitFor(stake, ml)

// PrizePicks-style entry multipliers: all picks must hit
export const PROP_MULTS = { 2: 3, 3: 5, 4: 10, 5: 20, 6: 37.5 }

// parlay math (American ↔ decimal)
export const MAX_PARLAY_LEGS = 32
export const decOf = ml => (ml > 0 ? 1 + ml / 100 : 1 + 100 / -ml)
export const americanFromDec = d =>
  d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1))

// nearest x.5 line from a season average
export const halfLine = v => Math.max(0.5, Math.floor(v) + 0.5)

export const fmtLine = v => (v > 0 ? `+${v}` : `${v}`)

// per-sport fallback lines when ESPN hasn't posted a market
export const SIM_SPREADS = { mlb: 1.5, nhl: 1.5, mls: 0.5, epl: 0.5, nba: 5.5, wnba: 4.5, nfl: 3.5, cfb: 6.5 }
export const SIM_TOTALS = { mlb: 8.5, nba: 225.5, wnba: 161.5, nfl: 44.5, cfb: 55.5, nhl: 6.5, mls: 2.5, epl: 2.5 }

// deterministic simulated moneyline for events ESPN has no line for yet
export const simLines = eventId => {
  let h = 0
  for (const ch of String(eventId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const fav = 110 + (h % 190) // -110 .. -299
  const dog = Math.round(fav * 0.85)
  return h % 2 === 0
    ? { home: -fav, away: +dog }
    : { home: +dog, away: -fav }
}
