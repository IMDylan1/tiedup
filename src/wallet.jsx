import React, { createContext, useContext, useEffect, useState } from 'react'
import { prices } from './api.js'

const WalletCtx = createContext(null)
const KEY = 'mb_wallet_v1'
const START_BTC = 1.0

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { btc: START_BTC, history: [] }
}

export function WalletProvider({ children }) {
  const [wallet, setWallet] = useState(load)
  const [btcUsd, setBtcUsd] = useState(null)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(wallet))
  }, [wallet])

  useEffect(() => {
    let alive = true
    const fetchPrice = () =>
      prices()
        .then(d => { if (alive && d?.bitcoin?.usd) setBtcUsd(d.bitcoin.usd) })
        .catch(() => {})
    fetchPrice()
    const t = setInterval(fetchPrice, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const record = (delta, label) =>
    setWallet(w => ({
      btc: +(w.btc + delta).toFixed(8),
      history: [{ at: Date.now(), delta, label }, ...w.history].slice(0, 200)
    }))

  const api = {
    btc: wallet.btc,
    btcUsd,
    history: wallet.history,
    canAfford: amt => amt > 0 && amt <= wallet.btc + 1e-12,
    debit: (amt, label) => record(-amt, label),
    credit: (amt, label) => record(+amt, label),
    deposit: amt => record(+amt, `Deposit ${amt} BTC`),
    reset: () => setWallet({ btc: START_BTC, history: [{ at: Date.now(), delta: START_BTC, label: 'Wallet reset' }] })
  }

  return <WalletCtx.Provider value={api}>{children}</WalletCtx.Provider>
}

export const useWallet = () => useContext(WalletCtx)

export const fmtBtc = v => `₿ ${(+v).toFixed(4)}`
export const fmtUsd = (btc, price) =>
  price ? `$${(btc * price).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '…'
