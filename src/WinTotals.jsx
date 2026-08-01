import React, { useEffect, useState } from 'react'
import { useWallet, fmtBtc } from './wallet.jsx'
import {
  loadBets, saveBets, fmtOdds, payoutFor,
  MAX_PARLAY_LEGS, decOf, americanFromDec
} from './bets.js'
import { winTotals } from './api.js'

const LEAGUES = [
  { id: 'nfl', label: '🏈 NFL' },
  { id: 'nba', label: '🏀 NBA' },
  { id: 'sec', label: '🏈 SEC' }
]
const ODDS = -110 // standard juice both ways

export default function WinTotals() {
  const w = useWallet()
  const [league, setLeague] = useState('nfl')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [picks, setPicks] = useState([]) // legs, kept across league tabs
  const [stake, setStake] = useState('0.01')
  const [placed, setPlaced] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null); setError(null); setPlaced(null)
    winTotals(league)
      .then(d => {
        if (!alive) return
        setData(d)
      })
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
  }, [league])

  const keyOf = (team, side) => `${league}|${team.id}|${side}`

  const toggle = (team, side) => {
    setPlaced(null)
    const key = keyOf(team, side)
    setPicks(ps => {
      if (ps.some(p => p.key === key)) return ps.filter(p => p.key !== key)
      // one side per team — flipping over/under replaces the pick
      const rest = ps.filter(p => !(p.teamId === team.id && p.wtLeague === league))
      if (rest.length >= MAX_PARLAY_LEGS) return ps
      return [...rest, {
        key,
        market: 'wintotal',
        wtLeague: league,
        league,
        teamId: team.id,
        team: team.name,
        side,
        line: team.line,
        odds: ODDS,
        label: `${team.name} ${side === 'over' ? 'OVER' : 'UNDER'} ${team.line} wins`,
        matchup: `${data.season} season · ${data.games} games`,
        simulated: true, // projected line, not a posted market
        eventDate: new Date(data.season, 11, 31).toISOString()
      }]
    })
  }
  const isSel = (team, side) => picks.some(p => p.key === keyOf(team, side))
  const removeLeg = key => setPicks(ps => ps.filter(p => p.key !== key))

  const dec = picks.reduce((acc, p) => acc * decOf(p.odds), 1)
  const combined = picks.length > 1 ? americanFromDec(dec) : (picks[0]?.odds ?? null)

  const place = () => {
    const amt = parseFloat(stake)
    if (picks.length === 0) return
    if (!w.canAfford(amt)) return setPlaced({ cls: 'lose', text: 'Insufficient balance' })

    let bet
    if (picks.length === 1) {
      const leg = picks[0]
      w.debit(amt, `Win total: ${leg.label}`)
      bet = { ...leg, id: `${leg.key}-${Date.now()}`, stake: amt, status: 'open', placedAt: Date.now() }
    } else {
      w.debit(amt, `Win-total parlay: ${picks.length} legs`)
      bet = {
        id: `wtparlay-${Date.now()}`,
        market: 'parlay',
        league: 'multi',
        legs: picks,
        dec,
        odds: combined,
        label: `${picks.length}-leg win-total parlay`,
        matchup: picks.map(p => p.label).join(' · '),
        stake: amt,
        simulated: true,
        eventDate: picks.map(p => p.eventDate).sort()[0],
        status: 'open',
        placedAt: Date.now()
      }
    }
    saveBets([bet, ...loadBets()])
    setPicks([])
    setPlaced({ cls: 'win', text: `Bet placed: ${bet.label} ${fmtOdds(bet.odds)} for ${fmtBtc(amt)}` })
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
          Season win totals for {data ? data.season : 'the upcoming season'}. Records shown are each
          team's real prior-season result from ESPN — the <b>lines are our own projections</b> (last
          season regressed toward the league average), not a posted market. Stack picks from any
          league to build a parlay; each leg settles the moment that team clinches the over or is
          eliminated from reaching it.
        </div>

        {error && <div className="empty">Couldn't load win totals: {error}</div>}
        {!data && !error && <div className="spin">Loading teams…</div>}

        {data && data.teams.map(t => (
          <div key={t.id} className="event-card">
            <div className="ev-teams" style={{ flex: 1, minWidth: 180 }}>
              <div className="ev-team">
                {t.logo && <img src={t.logo} alt="" className="wt-logo" />}
                {t.name}
              </div>
              <div className="ev-meta">
                {data.season - 1}: {t.priorWins}–{t.priorLosses}
                {t.curPlayed > 0 && <> · now {t.curWins}–{t.curPlayed - t.curWins}</>}
                {' '}· <span className="sim-tag">PROJECTED LINE</span>
              </div>
            </div>
            <div className="mkts">
              {['over', 'under'].map(side => (
                <div className="mkt-col" key={side}>
                  <div className="mkt-h">{side === 'over' ? 'Over' : 'Under'}</div>
                  <button className={`ml-btn ${isSel(t, side) ? 'sel' : ''}`}
                    onClick={() => toggle(t, side)}>
                    {side === 'over' ? 'O' : 'U'} {t.line}
                    <span className="lbl">{fmtOdds(ODDS)}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel betslip">
        <h2>
          🏆 Win Totals
          {picks.length > 1 && <span className="parlay-tag">{picks.length}-leg parlay</span>}
        </h2>
        {picks.length === 0 && (
          <div className="empty" style={{ padding: '20px 0' }}>
            Tap an over or under — stack up to {MAX_PARLAY_LEGS} teams for a parlay.
          </div>
        )}
        {picks.map(p => (
          <div key={p.key} className="slip-line">
            <span>
              <button className="leg-x" onClick={() => removeLeg(p.key)} title="Remove leg">✕</button>
              {p.team} {p.side === 'over' ? 'O' : 'U'}{p.line}
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
            <button className="bet-btn" onClick={place}>
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
