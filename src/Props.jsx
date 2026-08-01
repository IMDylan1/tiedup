import React, { useEffect, useState } from 'react'
import { useWallet, fmtBtc } from './wallet.jsx'
import { loadBets, saveBets, PROP_MULTS, halfLine } from './bets.js'
import { scoreboard } from './api.js'

const LEAGUES = [
  { id: 'mlb', label: '⚾ MLB', days: 2 },
  { id: 'wnba', label: '🏀 WNBA', days: 2 },
  { id: 'nba', label: '🏀 NBA', days: 3 },
  { id: 'nfl', label: '🏈 NFL', days: 7 },
  { id: 'cfb', label: '🏈 CFB', days: 7 }
]

// leader-category → prop config per league family
const BBALL = {
  pointsPerGame: { stat: 'PTS', name: 'Points', line: v => halfLine(v) },
  reboundsPerGame: { stat: 'REB', name: 'Rebounds', line: v => halfLine(v) },
  assistsPerGame: { stat: 'AST', name: 'Assists', line: v => halfLine(v) }
}
const FBALL = {
  passingLeader: { stat: 'passYds', name: 'Pass Yards', line: v => (v > 30 && v < 450 ? halfLine(v) : 224.5) },
  passingYards: { stat: 'passYds', name: 'Pass Yards', line: v => (v > 30 && v < 450 ? halfLine(v) : 224.5) },
  rushingLeader: { stat: 'rushYds', name: 'Rush Yards', line: v => (v > 15 && v < 250 ? halfLine(v) : 54.5) },
  rushingYards: { stat: 'rushYds', name: 'Rush Yards', line: v => (v > 15 && v < 250 ? halfLine(v) : 54.5) },
  receivingLeader: { stat: 'recYds', name: 'Rec Yards', line: v => (v > 15 && v < 250 ? halfLine(v) : 47.5) },
  receivingYards: { stat: 'recYds', name: 'Rec Yards', line: v => (v > 15 && v < 250 ? halfLine(v) : 47.5) }
}
const CFG = {
  mlb: {
    avg: { stat: 'H', name: 'Hits', line: () => 1.5 },
    homeRuns: { stat: 'HRR', name: 'Hits+Runs+RBIs', line: () => 2.5 },
    RBIs: { stat: 'HRR', name: 'Hits+Runs+RBIs', line: () => 2.5 }
  },
  nba: BBALL, wnba: BBALL, nfl: FBALL, cfb: FBALL
}

function buildBoard(events, league) {
  const cfg = CFG[league]
  const seen = new Set()
  const cards = []
  for (const ev of events) {
    if (ev.status?.type?.state !== 'pre') continue
    const comp = ev.competitions?.[0]
    if (!comp) continue
    for (const side of comp.competitors || []) {
      const team = side.team?.abbreviation || side.team?.shortDisplayName
      for (const cat of side.leaders || []) {
        const c = cfg[cat.name]
        if (!c) continue
        const leader = cat.leaders?.[0]
        const athlete = leader?.athlete?.displayName
        if (!athlete) continue
        const key = `${athlete}|${c.stat}`
        if (seen.has(key)) continue
        seen.add(key)
        cards.push({
          id: `${ev.id}|${athlete}|${c.stat}`,
          eventId: ev.id,
          league,
          athlete,
          headshot: leader?.athlete?.headshot,
          team,
          matchup: ev.shortName || ev.name,
          date: ev.date,
          stat: c.stat,
          statName: c.name,
          line: c.line(leader?.value ?? 0),
          seasonAvg: leader?.displayValue
        })
      }
    }
  }
  return cards
}

export default function Props() {
  const w = useWallet()
  const [league, setLeague] = useState('mlb')
  const [cards, setCards] = useState(null)
  const [error, setError] = useState(null)
  const [picks, setPicks] = useState([]) // {card, dir}
  const [stake, setStake] = useState('0.01')
  const [placed, setPlaced] = useState(null)

  useEffect(() => {
    let alive = true
    setCards(null); setError(null)
    const cfg = LEAGUES.find(l => l.id === league)
    const ymd = d => d.toISOString().slice(0, 10).replaceAll('-', '')
    const today = new Date()
    const end = new Date(today.getTime() + cfg.days * 86400_000)
    scoreboard(league, { dates: `${ymd(today)}-${ymd(end)}` })
      .then(d => {
        if (!alive) return
        setCards(buildBoard(d.events || [], league))
      })
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [league])

  const toggle = (card, dir) => {
    setPlaced(null)
    setPicks(ps => {
      const existing = ps.find(p => p.card.id === card.id)
      if (existing && existing.dir === dir) return ps.filter(p => p.card.id !== card.id)
      const rest = ps.filter(p => p.card.id !== card.id)
      if (rest.length >= 6) return ps
      return [...rest, { card, dir }]
    })
  }
  const dirOf = card => picks.find(p => p.card.id === card.id)?.dir

  const mult = PROP_MULTS[picks.length]

  const placeEntry = () => {
    const amt = parseFloat(stake)
    if (picks.length < 2) return setPlaced({ cls: 'lose', text: 'Pick at least 2 players' })
    if (!w.canAfford(amt)) return setPlaced({ cls: 'lose', text: 'Insufficient balance' })
    w.debit(amt, `Props entry: ${picks.length} picks`)
    const bet = {
      id: `props-${Date.now()}`,
      market: 'props',
      league,
      label: `${picks.length}-pick entry (${mult}x)`,
      team: `${picks.length}-Pick Power Play`,
      matchup: picks.map(p => p.card.athlete).join(', '),
      picks: picks.map(p => ({
        eventId: p.card.eventId,
        league: p.card.league,
        athlete: p.card.athlete,
        stat: p.card.stat,
        statName: p.card.statName,
        line: p.card.line,
        dir: p.dir,
        team: p.card.team
      })),
      mult,
      odds: null,
      stake: amt,
      simulated: false,
      eventDate: picks[0].card.date,
      status: 'open',
      placedAt: Date.now()
    }
    saveBets([bet, ...loadBets()])
    setPicks([])
    setPlaced({ cls: 'win', text: `Entry placed: ${bet.label} to win ${fmtBtc(amt * mult)}` })
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
        <div className="banner">
          Real players from upcoming games — lines are <b>our projections</b> built from each
          player's real season stats. Picks settle against the real box score.
        </div>

        {error && <div className="empty">Couldn't load props: {error}</div>}
        {!cards && !error && <div className="spin">Building the board…</div>}
        {cards && cards.length === 0 && (
          <div className="empty">No props available — no upcoming games with player data (league may be out of season).</div>
        )}

        <div className="props-grid">
          {cards && cards.map(c => (
            <div key={c.id} className="prop-card">
              {c.headshot && <img className="prop-face" src={c.headshot} alt="" />}
              <div className="prop-name">{c.athlete}</div>
              <div className="prop-sub">{c.team} · {c.matchup}</div>
              <div className="prop-line">{c.line}</div>
              <div className="prop-stat">{c.statName}</div>
              {c.seasonAvg && <div className="prop-sub">season: {c.seasonAvg}</div>}
              <div className="prop-dirs">
                <button className={`dir-btn ${dirOf(c) === 'more' ? 'sel' : ''}`}
                  onClick={() => toggle(c, 'more')}>▲ More</button>
                <button className={`dir-btn ${dirOf(c) === 'less' ? 'sel' : ''}`}
                  onClick={() => toggle(c, 'less')}>▼ Less</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel betslip">
        <h2>🎯 Entry</h2>
        {picks.length === 0 && (
          <div className="empty" style={{ padding: '20px 0' }}>
            Pick 2–6 players: More or Less. All picks must hit.
          </div>
        )}
        {picks.map(p => (
          <div key={p.card.id} className="slip-line">
            <span>{p.dir === 'more' ? '▲' : '▼'} {p.card.athlete}</span>
            <b>{p.dir === 'more' ? 'o' : 'u'}{p.card.line} {p.card.statName}</b>
          </div>
        ))}
        {picks.length > 0 && (
          <>
            <div className="slip-line" style={{ marginTop: 10 }}>
              <span>Multiplier</span>
              <b className={mult ? 'win' : ''}>{mult ? `${mult}x` : 'need 2+ picks'}</b>
            </div>
            <div className="field-label">Entry amount (BTC)</div>
            <input className="input" type="number" step="0.001" min="0.0001" value={stake}
              onChange={e => setStake(e.target.value)} />
            <div className="quick-row">
              {['0.001', '0.01', '0.05', '0.1'].map(v => (
                <button key={v} className="chip-btn" onClick={() => setStake(v)}>{v}</button>
              ))}
            </div>
            {mult && (
              <div className="slip-line" style={{ marginTop: 12 }}>
                <span>To win</span>
                <b className="win">{fmtBtc((parseFloat(stake) || 0) * mult)}</b>
              </div>
            )}
            <button className="bet-btn" onClick={placeEntry} disabled={picks.length < 2}>
              Place Entry
            </button>
            <button className="bet-btn secondary" onClick={() => setPicks([])}>Clear</button>
          </>
        )}
        {placed && <div className={`result-msg ${placed.cls}`} style={{ fontSize: 14 }}>{placed.text}</div>}
      </div>
    </div>
  )
}
