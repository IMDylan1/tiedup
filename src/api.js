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
