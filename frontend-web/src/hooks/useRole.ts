import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface UserRole {
  role: string
  modules: string[]
}

export function useRole() {
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from('user_roles')
        .select('role, modules').eq('user_id', user.id).single()
      if (data) {
        setUserRole({ role: data.role, modules: data.modules ?? ['pendientes'] })
      } else {
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
