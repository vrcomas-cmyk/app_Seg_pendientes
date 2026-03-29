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

  const hasModule = (module: string) => userRole?.modules?.includes(module) ?? false
  const isAdmin   = userRole?.role === 'admin'
  const isTeam    = userRole?.role === 'team' || isAdmin

  return { userRole, loading, hasModule, isAdmin, isTeam }
}
