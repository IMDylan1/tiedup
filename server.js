import express from 'express'

const app = express()
const PORT = 3001

const LEAGUES = {
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

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports'

app.get('/api/scoreboard/:league', async (req, res) => {
  const path = LEAGUES[req.params.league]
  if (!path) return res.status(400).json({ error: 'unknown league' })
  const params = new URLSearchParams()
  for (const k of ['dates', 'groups', 'limit']) {
    if (req.query[k]) params.set(k, req.query[k])
  }
  const qs = params.size ? `?${params}` : ''
  try {
    const r = await fetch(`${ESPN}/${path}/scoreboard${qs}`)
    if (!r.ok) throw new Error(`ESPN responded ${r.status}`)
    res.json(await r.json())
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.get('/api/summary/:league/:id', async (req, res) => {
  const path = LEAGUES[req.params.league]
  if (!path) return res.status(400).json({ error: 'unknown league' })
  try {
    const r = await fetch(`${ESPN}/${path}/summary?event=${encodeURIComponent(req.params.id)}`)
    if (!r.ok) throw new Error(`ESPN responded ${r.status}`)
    res.json(await r.json())
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// ---- season win totals ----
// ESPN publishes no win-total market, so the line is our own projection:
// prior-season wins regressed toward the league mean.
const WT = {
  nfl: { path: 'football/nfl', games: 17, mean: 8.5, label: 'NFL' },
  sec: { path: 'football/college-football', games: 12, mean: 6, group: 8, label: 'SEC' },
  nba: { path: 'basketball/nba', games: 82, mean: 41, label: 'NBA' }
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
  const r = await fetch(`https://site.api.espn.com/apis/v2/sports/${path}/standings?season=${year}${g}`)
  if (!r.ok) throw new Error(`ESPN standings responded ${r.status}`)
  return collectEntries(await r.json())
}

const wtCache = {}
app.get('/api/wintotals/:league', async (req, res) => {
  const cfg = WT[req.params.league]
  if (!cfg) return res.status(400).json({ error: 'unknown league' })
  const cached = wtCache[req.params.league]
  if (cached && Date.now() - cached.at < 600_000) return res.json(cached.data)

  const now = new Date()
  const season = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  try {
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
      // regress last season toward the mean, then snap to the nearest half-win
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
    wtCache[req.params.league] = { at: Date.now(), data }
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// real prediction markets via Polymarket's public gamma API
const GAMMA = 'https://gamma-api.polymarket.com'
let predictCache = { at: 0, data: null }
app.get('/api/predicts', async (_req, res) => {
  if (Date.now() - predictCache.at < 120_000 && predictCache.data) return res.json(predictCache.data)
  try {
    const r = await fetch(`${GAMMA}/markets?limit=150&active=true&closed=false&order=volume24hr&ascending=false`)
    if (!r.ok) throw new Error(`Polymarket responded ${r.status}`)
    const all = await r.json()
    const markets = all.flatMap(m => {
      try {
        const prices = JSON.parse(m.outcomePrices || '[]').map(Number)
        const outcomes = JSON.parse(m.outcomes || '[]')
        if (outcomes[0] !== 'Yes' || outcomes[1] !== 'No') return []
        if (!(prices[0] >= 0.03 && prices[0] <= 0.97)) return [] // skip near-settled longshots
        return [{
          id: m.id,
          question: m.question,
          yes: prices[0],
          no: prices[1],
          volume: Math.round(m.volumeNum || 0),
          endDate: m.endDate,
          category: m.category || ''
        }]
      } catch { return [] }
    }).slice(0, 40)
    const data = { markets }
    predictCache = { at: Date.now(), data }
    res.json(data)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.get('/api/predict/:id', async (req, res) => {
  try {
    const r = await fetch(`${GAMMA}/markets/${encodeURIComponent(req.params.id)}`)
    if (!r.ok) throw new Error(`Polymarket responded ${r.status}`)
    const m = await r.json()
    const prices = JSON.parse(m.outcomePrices || '[]').map(Number)
    res.json({ id: m.id, closed: !!m.closed, yesFinal: prices[0] ?? null, question: m.question })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

let priceCache = { at: 0, data: null }
app.get('/api/prices', async (_req, res) => {
  if (Date.now() - priceCache.at < 60_000 && priceCache.data) return res.json(priceCache.data)
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd')
    if (!r.ok) throw new Error(`CoinGecko responded ${r.status}`)
    const data = await r.json()
    priceCache = { at: Date.now(), data }
    res.json(data)
  } catch (e) {
    // fall back to last cached or a static price so the UI still works
    res.json(priceCache.data || { bitcoin: { usd: 100000 }, ethereum: { usd: 4000 } })
  }
})

app.listen(PORT, () => console.log(`TiedUp API on http://localhost:${PORT}`))
