import { Outlet, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useState, useEffect } from 'react'

export default function Layout() {
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '')
    })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-teal-600 text-lg">Pendientes</span>
          <NavLink to="/dashboard"
            className={({ isActive }) =>
              `text-sm ${isActive ? 'text-teal-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`
            }>Dashboard</NavLink>
          <NavLink to="/tasks"
            className={({ isActive }) =>
              `text-sm ${isActive ? 'text-teal-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`
            }>Pendientes</NavLink>
        </div>
        <div className="flex items-center gap-4">
          <NavLink to="/profile"
            className={({ isActive }) =>
              `text-sm ${isActive ? 'text-teal-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`
            }>
            {email ? email.split('@')[0] : 'Mi cuenta'}
          </NavLink>
          <button
            onClick={() => supabase.auth.signOut()}
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
