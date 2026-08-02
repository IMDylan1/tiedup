import React, { createContext, useContext, useEffect, useState } from 'react'
import { prices } from './api.js'
import { supabase, isConfigured } from './supabase.js'
import { useAuth } from './auth.jsx'

const WalletCtx = createContext(null)
const KEY = 'mb_wallet_v1'
const START_BTC = 1.0

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { btc: START_BTC, history: [] }
}

// ---------------------------------------------------------------- currency
// Display currency lives in a module singleton so every existing `fmtBtc(...)`
// call site converts without needing to be rewritten. Changing it re-renders
// the tree through the provider, so components pick up the new rate.
let display = { code: 'BTC', symbol: '₿', rate: 1, decimals: 4 }

export const CURRENCIES = ['BTC', 'ETH', 'USD']

export const fmtBtc = v => {
  const n = (+v || 0) * display.rate
  if (display.code === 'USD') {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
  }
  return `${display.symbol} ${n.toFixed(display.decimals)}`
}

export const fmtUsd = (btc, price) =>
  price ? `$${(btc * price).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '…'

// -------------------------------------------------------------- provider
export function WalletProvider({ children }) {
  const auth = useAuth()
  const [wallet, setWallet] = useState(loadLocal)
  const [rates, setRates] = useState(null)
  const [currency, setCurrency] = useState(
    () => localStorage.getItem('mb_currency') || 'BTC'
  )
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)

  const cloud = Boolean(isConfigured && auth?.user)

  // keep the module singleton in step with state + live rates
  const btcUsd = rates?.bitcoin?.usd ?? null
  const ethUsd = rates?.ethereum?.usd ?? null
  if (currency === 'USD' && btcUsd) display = { code: 'USD', symbol: '$', rate: btcUsd, decimals: 2 }
  else if (currency === 'ETH' && btcUsd && ethUsd) display = { code: 'ETH', symbol: 'Ξ', rate: btcUsd / ethUsd, decimals: 3 }
  else display = { code: 'BTC', symbol: '₿', rate: 1, decimals: 4 }

  useEffect(() => { localStorage.setItem('mb_currency', currency) }, [currency])

  // local mode persists to localStorage; cloud mode is the server's job
  useEffect(() => {
    if (!cloud) localStorage.setItem(KEY, JSON.stringify(wallet))
  }, [wallet, cloud])

  useEffect(() => {
    let alive = true
    const tick = () =>
      prices().then(d => { if (alive && d) setRates(d) }).catch(() => {})
    tick()
    const t = setInterval(tick, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // ------------------------------------------------------------ cloud load
  const pullCloud = async () => {
    if (!cloud) return
    setSyncing(true)
    const [{ data: prof }, { data: txs }] = await Promise.all([
      supabase.from('profiles').select('balance').eq('id', auth.user.id).single(),
      supabase.from('transactions')
        .select('delta, label, created_at')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(200)
    ])
    if (prof) {
      setWallet({
        btc: Number(prof.balance),
        history: (txs || []).map(t => ({
          at: new Date(t.created_at).getTime(),
          delta: Number(t.delta),
          label: t.label
        }))
      })
    }
    setSyncing(false)
  }

  // on sign-in pull the cloud balance; on sign-out fall back to the local one
  useEffect(() => {
    if (cloud) pullCloud()
    else setWallet(loadLocal())
  }, [cloud, auth?.user?.id])

  // ------------------------------------------------------------- mutations
  // Games call these synchronously and never await, so cloud writes are
  // optimistic: update the UI now, reconcile with the server after.
  const record = (delta, label) => {
    setWallet(w => ({
      btc: +(w.btc + delta).toFixed(8),
      history: [{ at: Date.now(), delta, label }, ...w.history].slice(0, 200)
    }))
    if (cloud) {
      supabase.rpc('apply_delta', { amount: delta, note: label })
        .then(({ data, error }) => {
          if (error) { setError(error.message); pullCloud() }
          else if (data != null) setWallet(w => ({ ...w, btc: Number(data) }))
        })
    }
  }

  const transfer = async (recipient, amount) => {
    if (!cloud) return { error: 'Sign in to send funds' }
    const { data, error } = await supabase.rpc('transfer_funds', { recipient, amount })
    if (error) return { error: error.message }
    setWallet(w => ({ ...w, btc: Number(data) }))
    await pullCloud()
    return { ok: true }
  }

  const api = {
    btc: wallet.btc,
    btcUsd,
    ethUsd,
    history: wallet.history,
    cloud,
    syncing,
    error,
    clearError: () => setError(null),
    currency,
    setCurrency,
    canAfford: amt => amt > 0 && amt <= wallet.btc + 1e-12,
    debit: (amt, label) => record(-amt, label),
    credit: (amt, label) => record(+amt, label),
    deposit: amt => record(+amt, `Deposit ${amt} BTC`),
    transfer,
    refresh: pullCloud,
    reset: () => {
      if (cloud) {
        record(+(START_BTC - wallet.btc).toFixed(8), 'Wallet reset')
      } else {
        setWallet({ btc: START_BTC, history: [{ at: Date.now(), delta: START_BTC, label: 'Wallet reset' }] })
      }
    }
  }

  return <WalletCtx.Provider value={api}>{children}</WalletCtx.Provider>
}

export const useWallet = () => useContext(WalletCtx)
