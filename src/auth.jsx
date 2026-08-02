import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isConfigured } from './supabase.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  // keep the profile row (username + balance) in step with the session
  const refreshProfile = async () => {
    if (!isConfigured || !session?.user) { setProfile(null); return null }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, balance')
      .eq('id', session.user.id)
      .single()
    if (error) return null
    setProfile(data)
    return data
  }

  useEffect(() => { refreshProfile() }, [session?.user?.id])

  const signUp = async (email, password, username) => {
    const clean = (username || '').trim()
    if (clean.length < 3) return { error: 'Username must be at least 3 characters' }
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) return { error: 'Letters, numbers and underscores only' }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: clean } }
    })
    if (error) return { error: error.message }
    return { ok: true }
  }

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return { ok: true }
    // surface the unverified case distinctly so the UI can offer a resend
    if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)) {
      return { error: error.message, unconfirmed: true }
    }
    return { error: error.message }
  }

  const resendConfirmation = async email => {
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    return error ? { error: error.message } : { ok: true }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthCtx.Provider value={{
      enabled: isConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      refreshProfile,
      signUp,
      signIn,
      signOut,
      resendConfirmation,
      emailConfirmed: Boolean(session?.user?.email_confirmed_at)
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
