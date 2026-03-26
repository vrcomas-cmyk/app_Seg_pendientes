import { Outlet, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useState, useEffect } from 'react'

export default function Layout() {
  const [email, setEmail] = useState('')
  const [isTeam, setIsTeam] = useState(false)

  const TEAM_IDS = [
    'd8c13368-736a-480b-ba9a-4145a308934b',
    '9a38602f-7bcd-4c9b-b7bc-7c1c119cca5f',
  ]

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '')
      setIsTeam(TEAM_IDS.includes(data.user?.id ?? ''))
    })
  }, [])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm ${isActive ? 'text-teal-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6 overflow-x-auto">
          <span className="font-bold text-teal-600 text-lg flex-shrink-0">Pendientes</span>
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/tasks"     className={linkClass}>Pendientes</NavLink>
          <NavLink to="/crm"       className={linkClass}>CRM</NavLink>
          <NavLink to="/catalog"   className={linkClass}>Catálogo</NavLink>
          {isTeam && (
            <NavLink to="/admin" className={linkClass}>Admin</NavLink>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <NavLink to="/profile" className={linkClass}>
            {email ? email.split('@')[0] : 'Mi cuenta'}
          </NavLink>
          <button onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-400 hover:text-gray-600">
            Cerrar sesión
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
