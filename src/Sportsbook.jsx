import React, { useEffect, useState } from 'react'
import { useWallet, fmtBtc } from './wallet.jsx'
import {
  loadBets, saveBets, fmtOdds, fmtLine, payoutFor,
  simLines, SIM_SPREADS, SIM_TOTALS,
  MAX_PARLAY_LEGS, decOf, americanFromDec
} from './bets.js'
import { scoreboard } from './api.js'

const LEAGUES = [
  { id: 'mlb', label: '⚾ MLB', days: 5 },
  { id: 'nfl', label: '🏈 NFL', days: 14 },
  { id: 'cfb', label: '🏈 CFB', days: 7 },
  { id: 'nba', label: '🏀 NBA', days: 14 },
  { id: 'wnba', label: '🏀 WNBA', days: 5 },
  { id: 'nhl', label: '🏒 NHL', days: 14 },
  { id: 'mls', label: '⚽ MLS', days: 7 },
  { id: 'epl', label: '⚽ EPL', days: 7 },
  { id: 'ufc', label: '🥊 UFC', days: 30 }
]

// Power 4 conference ids on ESPN
const CFB_CONFS = [
  { id: 'p4', label: 'Power 4', ids: [1, 4, 5, 8] },
  { id: '8', label: 'SEC', ids: [8] },
  { id: '5', label: 'Big Ten', ids: [5] },
  { id: '4', label: 'Big 12', ids: [4] },
  { id: '1', label: 'ACC', ids: [1] }
]
const DAY = 86400_000
const CFB_MAX = new Date('2028-01-16').getTime() // through the 2027 season's bowls
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }

const parseNum = v => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}
const parseMl = v => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function parseTeamEvent(ev, league) {
  const comp = ev.competitions?.[0]
  if (!comp) return null
  const home = comp.competitors?.find(c => c.homeAway === 'home')
  const away = comp.competitors?.find(c => c.homeAway === 'away')
  if (!home || !away) return null

  const o = comp.odds?.[0]
  const soccer = league === 'mls' || league === 'epl'

  let ml = {
    home: parseMl(o?.moneyline?.home?.close?.odds) ?? o?.homeTeamOdds?.moneyLine ?? null,
    away: parseMl(o?.moneyline?.away?.close?.odds) ?? o?.awayTeamOdds?.moneyLine ?? null,
    draw: soccer ? (parseMl(o?.moneyline?.draw?.close?.odds) ?? o?.drawOdds?.moneyLine ?? null) : null
  }
  let mlSim = false
  if (ml.home == null || ml.away == null) {
    ml = { ...simLines(ev.id), draw: soccer ? +250 : null }
    mlSim = true
  }

  let spreadLine = o?.spread ?? parseNum(o?.pointSpread?.home?.close?.line)
  let spreadSim = false
  if (spreadLine == null) {
    spreadSim = true
    spreadLine = (ml.home < ml.away ? -1 : 1) * (SIM_SPREADS[league] ?? 1.5)
  }
  const spread = {
    line: spreadLine,
    homeOdds: parseMl(o?.pointSpread?.home?.close?.odds) ?? -110,
    awayOdds: parseMl(o?.pointSpread?.away?.close?.odds) ?? -110,
    sim: spreadSim
  }

  let totalLine = o?.overUnder ?? parseNum((o?.total?.over?.close?.line || '').replace(/^o/i, ''))
  let totalSim = false
  if (totalLine == null) {
    totalSim = true
    totalLine = SIM_TOTALS[league] ?? 44.5
  }
  const total = {
    line: totalLine,
    overOdds: parseMl(o?.total?.over?.close?.odds) ?? -110,
    underOdds: parseMl(o?.total?.under?.close?.odds) ?? -110,
    sim: totalSim
  }

  const st = ev.status?.type
  return {
    key: ev.id,
    id: ev.id,
    type: 'team',
    league,
    date: ev.date,
    matchup: ev.shortName || ev.name,
    state: st?.state,
    statusText: st?.shortDetail || '',
    confIds: [home, away].map(c => +c.team?.conferenceId).filter(Number.isFinite),
    home: {
      name: home.team?.shortDisplayName || home.team?.displayName,
      logo: home.team?.logo,
      record: home.records?.[0]?.summary,
      score: home.score
    },
    away: {
      name: away.team?.shortDisplayName || away.team?.displayName,
      logo: away.team?.logo,
      record: away.records?.[0]?.summary,
      score: away.score
    },
    ml, mlSim, spread, total,
    provider: o?.provider?.name
  }
}

function parseFights(ev, league) {
  return (ev.competitions || []).map(comp => {
    const [a, b] = comp.competitors || []
    if (!a || !b) return null
    const o = comp.odds?.[0]
    let ml = {
      home: parseMl(o?.moneyline?.home?.close?.odds) ?? o?.homeTeamOdds?.moneyLine ?? null,
      away: parseMl(o?.moneyline?.away?.close?.odds) ?? o?.awayTeamOdds?.moneyLine ?? null,
      draw: null
    }
    let mlSim = false
    if (ml.home == null || ml.away == null) {
      ml = { ...simLines(comp.id), draw: null }
      mlSim = true
    }
    const st = comp.status?.type || ev.status?.type
    return {
      key: `${ev.id}:${comp.id}`,
      id: ev.id,
      compId: comp.id,
      type: 'fight',
      league,
      date: comp.date || ev.date,
      matchup: ev.name,
      state: st?.state,
      statusText: st?.shortDetail || new Date(comp.date || ev.date).toLocaleDateString(),
      away: { name: a.athlete?.displayName || a.team?.displayName, score: a.score },
      home: { name: b.athlete?.displayName || b.team?.displayName, score: b.score },
      ml, mlSim,
      spread: null, total: null,
      provider: o?.provider?.name
    }
  }).filter(Boolean)
}

const pickKey = (ev, market, side) => `${ev.key}|${market}|${side}`

const marketLabel = (ev, market, side) => {
  if (market === 'ml') {
    if (side === 'draw') return `Draw (${ev.away.name} vs ${ev.home.name})`
    return `${ev[side].name} ML`
  }
  if (market === 'spread') {
    const line = side === 'home' ? ev.spread.line : -ev.spread.line
    return `${ev[side].name} ${fmtLine(line)}`
  }
  return `${side === 'over' ? 'Over' : 'Under'} ${ev.total.line}`
}

const oddsFor = (ev, market, side) => {
  if (market === 'ml') return ev.ml[side]
  if (market === 'spread') return side === 'home' ? ev.spread.homeOdds : ev.spread.awayOdds
  return side === 'over' ? ev.total.overOdds : ev.total.underOdds
}

const simFor = (ev, market) => {
  if (market === 'ml') return ev.mlSim
  if (market === 'spread') return ev.spread.sim
  return ev.total.sim
}

// frozen leg snapshot taken at click time
const makeLeg = (ev, market, side) => ({
  key: pickKey(ev, market, side),
  eventId: ev.id,
  compId: ev.compId || null,
  betType: ev.type,
  league: ev.league,
  market, side,
  line: market === 'spread' ? (side === 'home' ? ev.spread.line : -ev.spread.line)
    : market === 'total' ? ev.total.line : null,
  team: market === 'total' ? null : ev[side === 'draw' ? 'home' : side]?.name,
  label: marketLabel(ev, market, side),
  matchup: ev.matchup,
  odds: oddsFor(ev, market, side),
  simulated: simFor(ev, market),
  eventDate: ev.date
})

export default function Sportsbook() {
  const w = useWallet()
  const [league, setLeague] = useState('mlb')
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [picks, setPicks] = useState([]) // parlay legs, persists across league tabs
  const [stake, setStake] = useState('0.01')
  const [placed, setPlaced] = useState(null)
  const [cfbConf, setCfbConf] = useState('p4')
  const [cfbWeek, setCfbWeek] = useState(startOfToday())

  useEffect(() => {
    let alive = true
    setEvents(null); setError(null); setPlaced(null)
    const cfg = LEAGUES.find(l => l.id === league)
    const ymd = t => new Date(t).toISOString().slice(0, 10).replaceAll('-', '')
    const now = Date.now()
    const params = league === 'cfb'
      ? { dates: `${ymd(cfbWeek)}-${ymd(cfbWeek + 6 * DAY)}`, groups: 80, limit: 400 }
      : { dates: `${ymd(now)}-${ymd(now + cfg.days * DAY)}` }
    scoreboard(league, params)
      .then(d => {
        if (!alive) return
        const order = { in: 0, pre: 1, post: 2 }
        let evs = (d.events || [])
          .flatMap(e => (league === 'ufc' ? parseFights(e, league) : [parseTeamEvent(e, league)]))
          .filter(Boolean)
          .filter(e => e.home.name !== 'TBD' && e.away.name !== 'TBD') // unscheduled bowl/playoff slots
        if (league === 'cfb') {
          const ids = CFB_CONFS.find(c => c.id === cfbConf)?.ids || []
          evs = evs.filter(e => e.confIds.some(id => ids.includes(id)))
        }
        evs.sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3) || new Date(a.date) - new Date(b.date))
        setEvents(evs)
      })
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [league, cfbConf, cfbWeek])

  const toggle = (ev, market, side) => {
    if (ev.state === 'post') return
    setPlaced(null)
    const key = pickKey(ev, market, side)
    setPicks(ps => {
      if (ps.some(p => p.key === key)) return ps.filter(p => p.key !== key)
      if (ps.length >= MAX_PARLAY_LEGS) return ps
      return [...ps, makeLeg(ev, market, side)]
    })
  }
  const isSel = (ev, market, side) => picks.some(p => p.key === pickKey(ev, market, side))
  const removeLeg = key => setPicks(ps => ps.filter(p => p.key !== key))

  const dec = picks.reduce((acc, p) => acc * decOf(p.odds), 1)
  const combined = picks.length > 1 ? americanFromDec(dec) : (picks[0]?.odds ?? null)

  const placeBet = () => {
    const amt = parseFloat(stake)
    if (picks.length === 0) return
    if (!w.canAfford(amt)) return setPlaced({ cls: 'lose', text: 'Insufficient balance' })

    let bet
    if (picks.length === 1) {
      const leg = picks[0]
      w.debit(amt, `Sportsbook: ${leg.label}`)
      bet = {
        ...leg,
        id: `${leg.key}-${Date.now()}`,
        stake: amt,
        status: 'open',
        placedAt: Date.now()
      }
    } else {
      w.debit(amt, `Parlay: ${picks.length} legs`)
      bet = {
        id: `parlay-${Date.now()}`,
        market: 'parlay',
        league: 'multi',
        legs: picks,
        dec,
        odds: combined,
        label: `${picks.length}-leg parlay`,
        matchup: picks.map(p => p.label).join(' · '),
        stake: amt,
        simulated: picks.some(p => p.simulated),
        eventDate: picks.map(p => p.eventDate).sort()[0],
        status: 'open',
        placedAt: Date.now()
      }
    }
    saveBets([bet, ...loadBets()])
    setPicks([])
    setPlaced({
      cls: 'win',
      text: `Bet placed: ${bet.label} ${fmtOdds(bet.odds)} for ${fmtBtc(amt)}`
    })
  }

  const shiftWeek = weeks =>
    setCfbWeek(t => Math.min(CFB_MAX - 7 * DAY, Math.max(startOfToday(), t + weeks * 7 * DAY)))
  const weekLabel = t => {
    const f = x => new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    return `${f(t)} – ${f(t + 6 * DAY)}`
  }

  return (
    <div className="sb-wrap">
      <div>
        <div className="league-tabs">
          {LEAGUES.map(l => (
            <button key={l.id} className={`league-tab ${league === l.id ? 'active' : ''}`}
              onClick={() => setLeague(l.id)}>{l.label}</button>
          ))}
        </div>

        {league === 'cfb' && (
          <>
            <div className="league-tabs" style={{ marginBottom: 8 }}>
              {CFB_CONFS.map(c => (
                <button key={c.id} className={`league-tab sub ${cfbConf === c.id ? 'active' : ''}`}
                  onClick={() => setCfbConf(c.id)}>{c.label}</button>
              ))}
            </div>
            <div className="week-bar">
              <button className="league-tab sub" onClick={() => shiftWeek(-4)}>«</button>
              <button className="league-tab sub" onClick={() => shiftWeek(-1)}>‹</button>
              <span className="week-label">{weekLabel(cfbWeek)}</span>
              <button className="league-tab sub" onClick={() => shiftWeek(1)}>›</button>
              <button className="league-tab sub" onClick={() => shiftWeek(4)}>»</button>
            </div>
          </>
        )}

        {error && <div className="empty">Couldn't load games: {error}</div>}
        {!events && !error && <div className="spin">Loading live games…</div>}
        {events && events.length === 0 && (
          <div className="empty">
            {league === 'cfb'
              ? 'No Power 4 games this week — page ahead with › (2026 kickoff is late August).'
              : 'No games on the board — this league may be out of season.'}
          </div>
        )}

        {events && events.map(ev => {
          const sims = [ev.mlSim && 'ML', ev.spread?.sim && 'SPREAD', ev.total?.sim && 'TOTAL'].filter(Boolean)
          const done = ev.state === 'post'
          return (
            <div key={ev.key} className="event-card">
              <div className="ev-teams">
                {['away', 'home'].map(s => (
                  <div key={s} className="ev-team">
                    {ev[s].logo && <img src={ev[s].logo} alt="" />}
                    {ev[s].name}
                    {ev[s].record && <span className="ev-rec">({ev[s].record})</span>}
                    {ev.state !== 'pre' && <span className="ev-score">{ev[s].score}</span>}
                  </div>
                ))}
                <div className="ev-meta">
                  {ev.state === 'in'
                    ? <span className="live">● LIVE · {ev.statusText}</span>
                    : ev.statusText}
                  {ev.type === 'fight' && <> · {ev.matchup}</>}
                  {sims.length > 0
                    ? <> · <span className="sim-tag">SIM: {sims.join(', ')}</span></>
                    : ev.provider && <> · {ev.provider}</>}
                </div>
              </div>

              <div className="mkts">
                {ev.spread && (
                  <div className="mkt-col">
                    <div className="mkt-h">Spread</div>
                    {['away', 'home'].map(s => (
                      <button key={s} className={`ml-btn ${isSel(ev, 'spread', s) ? 'sel' : ''}`}
                        onClick={() => toggle(ev, 'spread', s)} disabled={done}>
                        {fmtLine(s === 'home' ? ev.spread.line : -ev.spread.line)}
                        <span className="lbl">{fmtOdds(s === 'home' ? ev.spread.homeOdds : ev.spread.awayOdds)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {ev.total && (
                  <div className="mkt-col">
                    <div className="mkt-h">Total</div>
                    {['over', 'under'].map(s => (
                      <button key={s} className={`ml-btn ${isSel(ev, 'total', s) ? 'sel' : ''}`}
                        onClick={() => toggle(ev, 'total', s)} disabled={done}>
                        {s === 'over' ? 'O' : 'U'} {ev.total.line}
                        <span className="lbl">{fmtOdds(s === 'over' ? ev.total.overOdds : ev.total.underOdds)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mkt-col">
                  <div className="mkt-h">ML</div>
                  {['away', 'home'].map(s => (
                    <button key={s} className={`ml-btn ${isSel(ev, 'ml', s) ? 'sel' : ''}`}
                      onClick={() => toggle(ev, 'ml', s)} disabled={done}>
                      {fmtOdds(ev.ml[s])}
                      <span className="lbl">{ev[s].name}</span>
                    </button>
                  ))}
                  {ev.ml.draw != null && (
                    <button className={`ml-btn ${isSel(ev, 'ml', 'draw') ? 'sel' : ''}`}
                      onClick={() => toggle(ev, 'ml', 'draw')} disabled={done}>
                      {fmtOdds(ev.ml.draw)}
                      <span className="lbl">Draw</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="panel betslip">
        <h2>🧾 Bet Slip {picks.length > 1 && <span className="parlay-tag">{picks.length}-leg parlay</span>}</h2>
        {picks.length === 0 && (
          <div className="empty" style={{ padding: '20px 0' }}>
            Tap lines to build your bet — add up to {MAX_PARLAY_LEGS} legs across any sports for a parlay.
          </div>
        )}
        {picks.map(p => (
          <div key={p.key} className="slip-line">
            <span>
              <button className="leg-x" onClick={() => removeLeg(p.key)} title="Remove leg">✕</button>
              {p.label}
            </span>
            <b>{fmtOdds(p.odds)}</b>
          </div>
        ))}
        {picks.length > 0 && (
          <>
            {picks.length > 1 && (
              <div className="slip-line" style={{ marginTop: 10 }}>
                <span>Combined odds</span>
                <b>{fmtOdds(combined)} ({dec.toFixed(2)}x)</b>
              </div>
            )}
            <div className="field-label">Stake (BTC)</div>
            <input className="input" type="number" step="0.001" min="0.0001" value={stake}
              onChange={e => setStake(e.target.value)} />
            <div className="quick-row">
              {['0.001', '0.01', '0.05', '0.1'].map(v => (
                <button key={v} className="chip-btn" onClick={() => setStake(v)}>{v}</button>
              ))}
            </div>
            <div className="slip-line" style={{ marginTop: 12 }}>
              <span>To win</span>
              <b className="win">
                {fmtBtc(picks.length > 1
                  ? (parseFloat(stake) || 0) * dec
                  : payoutFor(parseFloat(stake) || 0, picks[0].odds))}
              </b>
            </div>
            <button className="bet-btn" onClick={placeBet}>
              {picks.length > 1 ? `Place ${picks.length}-Leg Parlay` : 'Place Bet'}
            </button>
            <button className="bet-btn secondary" onClick={() => setPicks([])}>Clear all</button>
          </>
        )}
        {placed && <div className={`result-msg ${placed.cls}`} style={{ fontSize: 14 }}>{placed.text}</div>}
      </div>
    </div>
  )
}
