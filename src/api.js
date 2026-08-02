// All data is fetched straight from the public APIs — every one of them sends
// `access-control-allow-origin: *`, so no backend/proxy is needed and the built
// site can be hosted as plain static files.

const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports'
const ESPN_V2 = 'https://site.api.espn.com/apis/v2/sports'
const GAMMA = 'https://gamma-api.polymarket.com'

export const LEAGUE_PATHS = {
  nba: 'basketball/nba',
  nfl: 'football/nfl',
  mlb: 'baseball/mlb',
  cfb: 'football/college-football',
  wnba: 'basketball/wnba',
  nhl: 'hockey/nhl',
  mls: 'soccer/usa.1',
  epl: 'soccer/eng.1',
  ufc: 'mma/ufc'
}

const getJSON = async url => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${new URL(url).hostname} responded ${r.status}`)
  return r.json()
}

export async function scoreboard(league, params = {}) {
  const path = LEAGUE_PATHS[league]
  if (!path) throw new Error('unknown league')
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, v)
  return getJSON(`${ESPN_SITE}/${path}/scoreboard${qs.size ? `?${qs}` : ''}`)
}

export async function summary(league, eventId) {
  const path = LEAGUE_PATHS[league]
  if (!path) throw new Error('unknown league')
  return getJSON(`${ESPN_SITE}/${path}/summary?event=${encodeURIComponent(eventId)}`)
}

// ---- BTC price (cached in-tab so a busy session doesn't hammer CoinGecko) ----
let priceCache = { at: 0, data: null }
export async function prices() {
  if (priceCache.data && Date.now() - priceCache.at < 60_000) return priceCache.data
  try {
    const d = await getJSON('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd')
    priceCache = { at: Date.now(), data: d }
    return d
  } catch {
    return priceCache.data || { bitcoin: { usd: 100000 }, ethereum: { usd: 4000 } }
  }
}

// ---- prediction markets ----
let predictCache = { at: 0, data: null }
export async function predicts() {
  if (predictCache.data && Date.now() - predictCache.at < 120_000) return predictCache.data
  const all = await getJSON(`${GAMMA}/markets?limit=150&active=true&closed=false&order=volume24hr&ascending=false`)
  const markets = all.flatMap(m => {
    try {
      const p = JSON.parse(m.outcomePrices || '[]').map(Number)
      const outcomes = JSON.parse(m.outcomes || '[]')
      if (outcomes[0] !== 'Yes' || outcomes[1] !== 'No') return []
      if (!(p[0] >= 0.03 && p[0] <= 0.97)) return [] // skip near-settled longshots
      return [{
        id: m.id, question: m.question, yes: p[0], no: p[1],
        volume: Math.round(m.volumeNum || 0), endDate: m.endDate, category: m.category || ''
      }]
    } catch { return [] }
  }).slice(0, 40)
  const data = { markets }
  predictCache = { at: Date.now(), data }
  return data
}

export async function predictOne(id) {
  const m = await getJSON(`${GAMMA}/markets/${encodeURIComponent(id)}`)
  const p = JSON.parse(m.outcomePrices || '[]').map(Number)
  return { id: m.id, closed: !!m.closed, yesFinal: p[0] ?? null, question: m.question }
}

// ---- season win totals ----
// No public API posts win-total markets, so the line is our own projection:
// prior-season wins regressed toward the league mean.
export const WT = {
  nfl: { path: 'football/nfl', games: 17, mean: 8.5, label: 'NFL' },
  nba: { path: 'basketball/nba', games: 82, mean: 41, label: 'NBA' },
  sec: { path: 'football/college-football', games: 12, mean: 6, group: 8, label: 'SEC' }
}

const collectEntries = node => {
  const out = []
  const walk = n => {
    for (const c of n.children || []) walk(c)
    for (const e of n.standings?.entries || []) out.push(e)
  }
  walk(node)
  return out
}

const recordOf = entry => {
  const overall = entry.stats?.find(s => s.name === 'overall')?.displayValue
  if (overall && /^\d+-\d+/.test(overall)) {
    const [w, l] = overall.split('-').map(Number)
    return { wins: w, losses: l }
  }
  const stat = n => entry.stats?.find(s => s.name === n)?.value
  const w = stat('wins'), l = stat('losses')
  return Number.isFinite(w) ? { wins: w, losses: l ?? 0 } : null
}

const standings = async (path, year, group) => {
  const g = group ? `&group=${group}` : ''
  const d = await getJSON(`${ESPN_V2}/${path}/standings?season=${year}${g}`)
  return collectEntries(d)
}

const wtCache = {}
export async function winTotals(league) {
  const cfg = WT[league]
  if (!cfg) throw new Error('unknown league')
  const hit = wtCache[league]
  if (hit && Date.now() - hit.at < 600_000) return hit.data

  const now = new Date()
  const season = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  const [prior, current] = await Promise.all([
    standings(cfg.path, season - 1, cfg.group),
    standings(cfg.path, season, cfg.group).catch(() => [])
  ])

  const curBy = {}
  for (const e of current) {
    const rec = recordOf(e)
    if (rec) curBy[e.team?.id] = rec
  }

  const teams = prior.flatMap(e => {
    const rec = recordOf(e)
    const t = e.team || {}
    if (!rec || !t.id) return []
    const raw = 0.62 * rec.wins + 0.38 * cfg.mean
    const line = Math.min(cfg.games - 0.5, Math.max(0.5, Math.round(raw * 2) / 2))
    const cur = curBy[t.id]
    return [{
      id: t.id,
      name: t.displayName,
      abbr: t.abbreviation,
      logo: (t.logos || [])[0]?.href || null,
      priorWins: rec.wins,
      priorLosses: rec.losses,
      line,
      curWins: cur?.wins ?? 0,
      curPlayed: cur ? cur.wins + cur.losses : 0
    }]
  }).sort((a, b) => b.line - a.line || a.name.localeCompare(b.name))

  const data = { league: cfg.label, season, games: cfg.games, teams }
  wtCache[league] = { at: Date.now(), data }
  return data
}

// ------------------------------------------------------- player season props
// Futures on a player's full-season totals, priced off their last completed
// season. ESPN has no posted player futures market, so these lines are ours.

const WEB_V3 = 'https://site.web.api.espn.com/apis/common/v3/sports'

// `growth` nudges last season's number: NFL players regress a little, college
// players usually take a step forward as they move up a class.
export const FUTURES_LEAGUES = {
  nfl: { path: 'football/nfl', label: 'NFL', games: 17, endsMonth: 2, growth: 0.95 },
  cfb: { path: 'football/college-football', label: 'CFB', games: 12, endsMonth: 1, growth: 1.08 }
}

// stat key → how the market is shown and rounded.
// `min` is the smallest prior-season number worth pricing: below it the snap
// floor would inflate a trivial total into a fake-looking market (a receiver
// with 21 rushing yards should not get a 50.5 rushing line).
export const STAT_MARKETS = {
  receivingYards:      { label: 'Receiving Yards', cat: 'receiving', step: 50,  min: 150, positions: ['WR', 'TE', 'RB'] },
  receptions:          { label: 'Receptions',      cat: 'receiving', step: 5,   min: 15,  positions: ['WR', 'TE', 'RB'] },
  receivingTouchdowns: { label: 'Receiving TDs',   cat: 'receiving', step: 0.5, min: 2,   positions: ['WR', 'TE'] },
  rushingYards:        { label: 'Rushing Yards',   cat: 'rushing',   step: 50,  min: 150, positions: ['RB', 'QB', 'WR'] },
  rushingTouchdowns:   { label: 'Rushing TDs',     cat: 'rushing',   step: 0.5, min: 2,   positions: ['RB', 'QB'] },
  passingYards:        { label: 'Passing Yards',   cat: 'passing',   step: 250, min: 750, positions: ['QB'] },
  passingTouchdowns:   { label: 'Passing TDs',     cat: 'passing',   step: 0.5, min: 5,   positions: ['QB'] }
}

const num = v => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

// The season a futures bet is *about*: the one starting this autumn.
export const futuresSeason = (now = new Date()) =>
  now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1

// When that season's numbers are final, so a bet can be graded.
export const seasonSettles = (league, season) => {
  const cfg = FUTURES_LEAGUES[league]
  return new Date(season + 1, cfg?.endsMonth ?? 2, 15).getTime()
}

// NOTE: `/teams?limit=400` on site.api and site.web.api returns 200 but sends
// no access-control-allow-origin, so the browser blocks it. The standings
// endpoint carries every team and *is* CORS-open, so we read the roster of
// teams from there instead — same source the Season Wins page already uses.
const teamCache = {}
export async function teamsList(league) {
  const cfg = FUTURES_LEAGUES[league]
  if (!cfg) throw new Error('unknown league')
  if (teamCache[league]) return teamCache[league]

  const season = futuresSeason()
  const group = league === 'cfb' ? 80 : undefined // 80 = FBS
  let entries = await standings(cfg.path, season, group)
  if (!entries.length) entries = await standings(cfg.path, season - 1, group)

  const seen = new Set()
  const list = entries.flatMap(e => {
    const t = e.team || {}
    if (!t.id || seen.has(t.id) || /tbd/i.test(t.displayName || '')) return []
    seen.add(t.id)
    return [{
      id: String(t.id),
      name: t.displayName,
      abbr: t.abbreviation,
      logo: (t.logos || [])[0]?.href || null
    }]
  }).sort((a, b) => a.name.localeCompare(b.name))

  teamCache[league] = list
  return list
}

export async function roster(league, teamId) {
  const cfg = FUTURES_LEAGUES[league]
  const d = await getJSON(`${ESPN_SITE}/${cfg.path}/teams/${teamId}/roster`)
  const out = []
  for (const g of d?.athletes || []) {
    for (const a of g.items || []) {
      const pos = a.position?.abbreviation
      if (!['QB', 'RB', 'WR', 'TE'].includes(pos)) continue
      out.push({
        id: a.id,
        name: a.displayName,
        pos,
        jersey: a.jersey,
        headshot: a.headshot?.href || null
      })
    }
  }
  return out
}

export async function athleteStats(league, athleteId) {
  const cfg = FUTURES_LEAGUES[league]
  return getJSON(`${WEB_V3}/${cfg.path}/athletes/${athleteId}/stats`)
}

// Pull one stat for one season out of the categories payload.
export function statFor(payload, statKey, year) {
  const market = STAT_MARKETS[statKey]
  if (!market) return null
  const cat = (payload?.categories || []).find(c => c.name === market.cat)
  if (!cat) return null
  const idx = (cat.names || []).indexOf(statKey)
  if (idx < 0) return null
  const row = (cat.statistics || []).find(s => Number(s.season?.year) === Number(year))
  if (!row) return null
  return num(row.stats?.[idx])
}

// Most recent season on record at or before `before`.
export function latestSeasonWith(payload, statKey, before) {
  const market = STAT_MARKETS[statKey]
  const cat = (payload?.categories || []).find(c => c.name === market?.cat)
  if (!cat) return null
  const idx = (cat.names || []).indexOf(statKey)
  if (idx < 0) return null
  const rows = (cat.statistics || [])
    .map(s => ({ year: Number(s.season?.year), value: num(s.stats?.[idx]) }))
    .filter(r => Number.isFinite(r.year) && r.value != null && r.year < before)
    .sort((a, b) => b.year - a.year)
  return rows[0] || null
}

// Line = last season nudged by the league growth factor, snapped to a clean
// number, then always landed on a half-point so a season total can never tie
// the line and push. Deliberately simple, and always labelled PROJECTED so it
// is never mistaken for a real market.
export function projectLine(prior, step, growth = 1) {
  const raw = prior * growth
  if (step < 1) {
    const half = Math.round(raw * 2) / 2
    return Math.max(0.5, half % 1 === 0 ? half + 0.5 : half)
  }
  const snapped = Math.max(step, Math.round(raw / step) * step)
  return snapped + 0.5
}
