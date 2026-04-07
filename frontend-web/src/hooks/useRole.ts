import { useEffect, useState } from 'react'
import { supabase, getCachedUser } from '../lib/supabase'

interface UserRole {
  role: string
  modules: string[]
}

export function useRole() {
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async (attempt = 0) => {
      try {
        const user = await getCachedUser()
        if (!user) { setLoading(false); return }
        const { data, error } = await supabase.from('user_roles')
          .select('role, modules').eq('user_id', user.id).single()

        // Si hay error 429 (rate limit), esperar y reintentar (máx 3 intentos)
        if (error && 'status' in error && error.status === 429 && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000))
          return load(attempt + 1)
        }

        if (data) {
          setUserRole({ role: data.role, modules: data.modules ?? ['pendientes'] })
        } else {
          setUserRole({ role: 'user', modules: ['pendientes'] })
        }
      } catch (e) {
        console.error('Error loading user role:', e)
        setUserRole({ role: 'user', modules: ['pendientes'] })
      }
      setLoading(false)
    }
    load()
  }, [])

  const hasModule  = (m: string)  => userRole?.modules?.includes(m) ?? false
  const isAdmin    = userRole?.role === 'admin'
  const isGerente  = userRole?.role === 'gerente'
  const isEducador = userRole?.role === 'educador_clinico'
  const isTeam     = isAdmin || isGerente
  const canSeeCedis = isAdmin || isGerente

  return { userRole, loading, hasModule, isAdmin, isGerente, isEducador, isTeam, canSeeCedis }
}
