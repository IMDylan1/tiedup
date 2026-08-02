import React, { useEffect, useState } from 'react'
import { useWallet, fmtBtc } from './wallet.jsx'
import { loadBets, saveBets, fmtOdds, payoutFor } from './bets.js'
import {
  FUTURES_LEAGUES, STAT_MARKETS, teamsList, roster, athleteStats,
  latestSeasonWith, projectLine, futuresSeason, seasonSettles
} from './api.js'

const JUICE = -115           // both sides, like a real total
const MAX_PLAYERS = 24       // cap the roster fan-out
const BATCH = 6              // stat requests in flight at once

const DEFAULT_TEAM = { nfl: 'Bengals', cfb: 'Alabama' }

// fetch in small waves so we don't fire 30 requests at ESPN at once
async function inBatches(items, size, fn) {
  const out = []
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  }
  return out
}

export default function Futures() {
  const w = useWallet()
  const season = futuresSeason()

  const [league, setLeague] = useState('cfb')
  const [teams, setTeams] = useState(null)
  const [teamId, setTeamId] = useState(null)
  const [players, setPlayers] = useState(null)
  const [error, setError] = useState(null)
  const [pick, setPick] = useState(null)
  const [stake, setStake] = useState('0.01')
  const [placed, setPlaced] = useState(null)
  const [q, setQ] = useState('')

  // team list per league
  useEffect(() => {
    let alive = true
    setTeams(null); setPlayers(null); setTeamId(null); setError(null); setPick(null)
    teamsList(league)
      .then(ts => {
        if (!alive) return
        setTeams(ts)
        const pref = ts.find(t => new RegExp(DEFAULT_TEAM[league], 'i').test(t.name))
        setTeamId((pref || ts[0])?.id ?? null)
      })
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [league])

  // roster + season stats for the chosen team
  useEffect(() => {
    if (!teamId) return
    let alive = true
    setPlayers(null); setError(null); setPick(null); setPlaced(null)
    const growth = FUTURES_LEAGUES[league].growth

    ;(async () => {
      try {
        const r = await roster(league, teamId)
        const trimmed = r.slice(0, MAX_PLAYERS)
        const withStats = await inBatches(trimmed, BATCH, async p => {
          try {
            const st = await athleteStats(league, p.id)
            const markets = []
            for (const [key, m] of Object.entries(STAT_MARKETS)) {
              if (!m.positions.includes(p.pos)) continue
              const prior = latestSeasonWith(st, key, season)
              // needs a prior season big enough that the line means something
              if (!prior || prior.value < m.min) continue
              markets.push({
                key,
                label: m.label,
                priorYear: prior.year,
                prior: prior.value,
                line: projectLine(prior.value, m.step, growth)
              })
            }
            return { ...p, markets }
          } catch {
            return { ...p, markets: [] }
          }
        })
        if (!alive) return
        const usable = withStats
          .filter(p => p.markets.length)
          .sort((a, b) => b.markets[0].prior - a.markets[0].prior)
        setPlayers(usable)
      } catch (e) {
        if (alive) setError(e.message)
      }
    })()
    return () => { alive = false }
  }, [league, teamId, season])

  const team = teams?.find(t => t.id === teamId)

  const place = () => {
    const amt = parseFloat(stake)
    if (!pick) return
    if (!w.canAfford(amt)) return setPlaced({ cls: 'lose', text: 'Insufficient balance' })
    const { player, market, dir } = pick
    const label = `${player.name} ${dir === 'over' ? 'Over' : 'Under'} ${market.line} ${market.label}`
    w.debit(amt, `Future: ${label}`)
    saveBets([{
      id: `fut-${player.id}-${market.key}-${dir}-${Date.now()}`,
      market: 'future',
      league,
      athleteId: player.id,
      athlete: player.name,
      pos: player.pos,
      team: team?.name ?? '',
      statKey: market.key,
      statLabel: market.label,
      line: market.line,
      dir,
      odds: JUICE,
      stake: amt,
      season,
      settlesAt: seasonSettles(league, season),
      matchup: `${team?.abbr ?? ''} · ${season} season`,
      label,
      eventDate: seasonSettles(league, season),
      projected: true,
      status: 'open',
      placedAt: Date.now()
    }, ...loadBets()])
    setPick(null)
    setPlaced({ cls: 'win', text: `Bet placed: ${label} for ${fmtBtc(amt)}` })
  }

  const shown = (players || []).filter(p =>
    !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())
  )

  return (
    <div className="game-wrap" style={{ gridTemplateColumns: '1fr 280px' }}>
      <div>
        <h2 style={{ marginBottom: 12 }}>📈 Player Futures — {season} season</h2>

        <div className="league-tabs">
          {Object.entries(FUTURES_LEAGUES).map(([id, cfg]) => (
            <button key={id} className={`league-tab ${league === id ? 'active' : ''}`}
              onClick={() => setLeague(id)}>🏈 {cfg.label}</button>
          ))}
        </div>

        <div className="fut-controls">
          <select className="input" value={teamId ?? ''} disabled={!teams}
            onChange={e => setTeamId(e.target.value)}>
            {!teams && <option>Loading teams…</option>}
            {(teams || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input className="input" placeholder="Filter players…" value={q}
            onChange={e => setQ(e.target.value)} />
        </div>

        <div className="banner">
          No sportsbook posts player season futures publicly, so these lines are{' '}
          <b>our own projection</b> — last completed season nudged by a league factor
          ({FUTURES_LEAGUES[league].growth > 1 ? 'college players usually improve' : 'NFL players regress slightly'}),
          landed on a half-point so nothing can push. Prior-season numbers are real, from ESPN.
        </div>

        {error && <div className="empty">Couldn't load: {error}</div>}
        {!players && !error && <div className="spin">Loading roster and season stats…</div>}
        {players && shown.length === 0 && (
          <div className="empty">
            {q ? 'No player matches that filter.' : 'No players on this roster have prior-season stats to price.'}
          </div>
        )}

        {shown.map(p => (
          <div key={p.id} className="fut-card">
            <div className="fut-head">
              {p.headshot && <img src={p.headshot} alt="" className="fut-img" />}
              <div>
                <b>{p.name}</b>
                <div className="sub">{p.pos} · {team?.abbr} {p.jersey ? `· #${p.jersey}` : ''}</div>
              </div>
            </div>
            {p.markets.map(m => (
              <div key={m.key} className="fut-market">
                <div className="fut-stat">
                  <b>{m.label}</b>
                  <div className="sub">{m.priorYear}: {m.prior.toLocaleString()} · <span className="sim-tag">PROJECTED LINE</span></div>
                </div>
                <div className="mkts">
                  {['over', 'under'].map(dir => {
                    const on = pick?.player.id === p.id && pick?.market.key === m.key && pick?.dir === dir
                    return (
                      <button key={dir} className={`ml-btn ${on ? 'sel' : ''}`}
                        onClick={() => { setPlaced(null); setPick({ player: p, market: m, dir }) }}>
                        <span className="lbl">{dir === 'over' ? '▲ Over' : '▼ Under'}</span>
                        {m.line} <span className="odds-sm">{fmtOdds(JUICE)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="panel betslip">
        <h2>🧾 Bet Slip</h2>
        {!pick && <div className="empty" style={{ padding: '20px 0' }}>Pick an Over or Under to start</div>}
        {pick && (
          <>
            <div className="slip-line"><span>Player</span><b>{pick.player.name}</b></div>
            <div className="slip-line"><span>Market</span><b>{pick.market.label}</b></div>
            <div className="slip-line">
              <span>Pick</span>
              <b>{pick.dir === 'over' ? 'Over' : 'Under'} {pick.market.line}</b>
            </div>
            <div className="slip-line"><span>Odds</span><b>{fmtOdds(JUICE)}</b></div>
            <div className="slip-line"><span>Settles</span><b>{new Date(seasonSettles(league, season)).toLocaleDateString()}</b></div>
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
              <b className="win">{fmtBtc(payoutFor(parseFloat(stake) || 0, JUICE))}</b>
            </div>
            <button className="bet-btn" onClick={place}>Place Bet</button>
            <button className="bet-btn secondary" onClick={() => setPick(null)}>Clear</button>
          </>
        )}
        {placed && <div className={`result-msg ${placed.cls}`} style={{ fontSize: 14 }}>{placed.text}</div>}
        <div className="paytable">
          Futures ride the whole season — they stay open in My Bets until the
          {' '}{season} numbers are final.
        </div>
      </div>
    </div>
  )
}
