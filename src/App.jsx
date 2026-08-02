import React, { useEffect, useState } from 'react'
import { useWallet, fmtBtc, fmtUsd } from './wallet.jsx'
import Blackjack from './games/Blackjack.jsx'
import Roulette from './games/Roulette.jsx'
import Slots from './games/Slots.jsx'
import Crash from './games/Crash.jsx'
import Dice from './games/Dice.jsx'
import WildStack from './games/WildStack.jsx'
import Chess from './games/Chess.jsx'
import Sportsbook from './Sportsbook.jsx'
import Props from './Props.jsx'
import Predicts from './Predicts.jsx'
import WinTotals from './WinTotals.jsx'
import MyBets from './MyBets.jsx'
import WalletPage from './WalletPage.jsx'
import Account from './Account.jsx'
import { useAuth } from './auth.jsx'

const CASINO = [
  { id: 'blackjack', label: 'Blackjack', ico: '🂡' },
  { id: 'roulette', label: 'Roulette', ico: '🎡' },
  { id: 'slots', label: 'Slots', ico: '🎰' },
  { id: 'crash', label: 'Crash', ico: '🚀' },
  { id: 'dice', label: 'Dice', ico: '🎲' },
  { id: 'wildstack', label: 'Wild Stack', ico: '🌈' },
  { id: 'chess', label: 'Chess', ico: '♟️' }
]
const SPORTS = [
  { id: 'sports', label: 'Sportsbook', ico: '🏟️' },
  { id: 'props', label: 'Player Props', ico: '🎯' },
  { id: 'wintotals', label: 'Season Wins', ico: '🏆' },
  { id: 'predicts', label: 'Predicts', ico: '🔮' },
  { id: 'mybets', label: 'My Bets', ico: '🧾' }
]
const ACCOUNT = [
  { id: 'wallet', label: 'Wallet', ico: '💰' },
  { id: 'account', label: 'Account', ico: '👤' }
]

const DEPOSITS = [0.1, 0.5, 1, 5, 25]

function WalletMenu({ go }) {
  const w = useWallet()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const addCustom = () => {
    const amt = parseFloat(custom)
    if (!(amt > 0)) return
    w.deposit(amt)
    setCustom('')
    setOpen(false)
  }

  return (
    <div className="wallet-pill" onClick={e => e.stopPropagation()}>
      <div className="wallet-balance">
        {fmtBtc(w.btc)}
        <span className="wallet-usd">{fmtUsd(w.btc, w.btcUsd)}</span>
      </div>
      <button className="btn-green" onClick={() => setOpen(o => !o)}>
        ＋ Add BTC
      </button>
      {open && (
        <div className="wallet-menu">
          <div className="wm-title">Deposit play money</div>
          <div className="wm-grid">
            {DEPOSITS.map(amt => (
              <button key={amt} className="chip-btn"
                onClick={() => { w.deposit(amt); setOpen(false) }}>
                +{amt} ₿
              </button>
            ))}
          </div>
          <div className="wm-row">
            <input className="input" type="number" step="0.1" min="0" placeholder="Custom"
              value={custom} onChange={e => setCustom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustom()} />
            <button className="chip-btn" onClick={addCustom}>Add</button>
          </div>
          <button className="wm-reset" onClick={() => { w.reset(); setOpen(false) }}>
            Reset wallet to 1 ₿
          </button>
          <button className="wm-reset" onClick={() => { go('wallet'); setOpen(false) }}>
            Open full wallet →
          </button>
        </div>
      )}
    </div>
  )
}

// Shows who you are, or nudges you to sign in so the balance follows you.
function AccountPill({ go }) {
  const auth = useAuth()
  const w = useWallet()
  if (!auth.enabled) return null
  if (auth.user) {
    return (
      <button className="acct-pill" onClick={() => go('account')} title="Account">
        <span className="acct-dot" />
        {auth.profile?.username ?? 'account'}
      </button>
    )
  }
  return (
    <button className="acct-pill guest" onClick={() => go('account')}>
      Sign in
    </button>
  )
}

function Home({ go }) {
  return (
    <>
      <div className="hero">
        <h1>Welcome to <span style={{ color: 'var(--green)' }}>TiedUp</span></h1>
        <p>
          Casino originals and a live sportsbook with real games, real team records, and real
          money lines — played with a demo crypto balance. Hit the faucet any time you bust.
        </p>
      </div>
      <div className="section-title">🎰 Casino</div>
      <div className="tile-grid">
        <button className="game-tile tile-bj" onClick={() => go('blackjack')}><span className="big">🂡</span>Blackjack</button>
        <button className="game-tile tile-ro" onClick={() => go('roulette')}><span className="big">🎡</span>Roulette</button>
        <button className="game-tile tile-sl" onClick={() => go('slots')}><span className="big">🎰</span>Slots</button>
        <button className="game-tile tile-cr" onClick={() => go('crash')}><span className="big">🚀</span>Crash</button>
        <button className="game-tile tile-di" onClick={() => go('dice')}><span className="big">🎲</span>Dice</button>
        <button className="game-tile tile-ws" onClick={() => go('wildstack')}><span className="big">🌈</span>Wild Stack</button>
        <button className="game-tile tile-ch" onClick={() => go('chess')}><span className="big">♟️</span>Chess</button>
      </div>
      <div className="section-title">🏟️ Sports</div>
      <div className="tile-grid">
        <button className="game-tile tile-sp" onClick={() => go('sports')}><span className="big">🏈</span>Sportsbook</button>
        <button className="game-tile tile-pp" onClick={() => go('props')}><span className="big">🎯</span>Player Props</button>
        <button className="game-tile tile-wt" onClick={() => go('wintotals')}><span className="big">🏆</span>Season Wins</button>
        <button className="game-tile tile-pr" onClick={() => go('predicts')}><span className="big">🔮</span>Predicts</button>
      </div>
    </>
  )
}

export default function App() {
  const [page, setPage] = useState('home')
  const w = useWallet()

  const pages = {
    home: <Home go={setPage} />,
    blackjack: <Blackjack />,
    roulette: <Roulette />,
    slots: <Slots />,
    crash: <Crash />,
    dice: <Dice />,
    wildstack: <WildStack />,
    chess: <Chess />,
    sports: <Sportsbook />,
    props: <Props />,
    wintotals: <WinTotals />,
    predicts: <Predicts />,
    mybets: <MyBets />,
    wallet: <WalletPage go={setPage} />,
    account: <Account />
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">Tied<span>Up</span></div>
        <button className={`side-link ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>
          <span className="ico">🏠</span>Home
        </button>
        <div className="side-section">Casino</div>
        {CASINO.map(g => (
          <button key={g.id} className={`side-link ${page === g.id ? 'active' : ''}`} onClick={() => setPage(g.id)}>
            <span className="ico">{g.ico}</span>{g.label}
          </button>
        ))}
        <div className="side-section">Sports</div>
        {SPORTS.map(g => (
          <button key={g.id} className={`side-link ${page === g.id ? 'active' : ''}`} onClick={() => setPage(g.id)}>
            <span className="ico">{g.ico}</span>{g.label}
          </button>
        ))}
        <div className="side-section">You</div>
        {ACCOUNT.map(g => (
          <button key={g.id} className={`side-link ${page === g.id ? 'active' : ''}`} onClick={() => setPage(g.id)}>
            <span className="ico">{g.ico}</span>{g.label}
          </button>
        ))}
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="demo-tag">Demo · play money</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AccountPill go={setPage} />
            <WalletMenu go={setPage} />
          </div>
        </header>

        <div className="content">
          <div className="banner">
            <b>Play money only.</b> Nothing on this site is real gambling — the wallet is a demo
            balance with no cash value. Sports lines and stats are real, courtesy of ESPN.
          </div>
          {pages[page]}
        </div>
      </div>
    </div>
  )
}
