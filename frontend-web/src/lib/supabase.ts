import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: (url, options) => {
        return fetch(url, { ...options, signal: AbortSignal.timeout(30000) })
      }
    }
  }
)

// Cache del usuario para evitar múltiples llamadas getUser()
let _cachedUser: any = null
let _lastFetch = 0

export async function getCachedUser() {
  const now = Date.now()
  if (_cachedUser && (now - _lastFetch) < 30000) return _cachedUser
  const { data: { user } } = await supabase.auth.getUser()
  _cachedUser = user
  _lastFetch = now
  supabase.auth.onAuthStateChange((event, session) => {
    _cachedUser = session?.user ?? null
  })
  return _cachedUser
}
