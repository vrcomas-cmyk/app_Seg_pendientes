import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext<{ user: any; session: any }>({ user: null, session: null })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') { setSession(null); setUser(null); return }
      if (s) { setSession(s); setUser(s.user) }
    })
    return () => subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ user, session }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
