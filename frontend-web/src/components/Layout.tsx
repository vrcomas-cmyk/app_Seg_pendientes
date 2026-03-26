import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useState, useEffect } from 'react'
import GlobalSearch from './GlobalSearch'
import { useAlerts } from '../hooks/useAlerts'

export default function Layout() {
  const [email, setEmail] = useState('')
  const [isTeam, setIsTeam] = useState(false)
  const alerts = useAlerts()
  const nav = useNavigate()

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

  const totalAlerts = alerts.offersStalled + alerts.followupsDue + alerts.materialsInTransit

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 overflow-x-auto flex-shrink-0">
          <span className="font-bold text-teal-600 text-lg flex-shrink-0">Pendientes</span>
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/tasks"     className={linkClass}>Pendientes</NavLink>
          <NavLink to="/crm"       className={linkClass}>CRM</NavLink>
          <NavLink to="/catalog"   className={linkClass}>Catálogo</NavLink>
          {isTeam && <NavLink to="/admin" className={linkClass}>Admin</NavLink>}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Búsqueda global */}
          <GlobalSearch />

          {/* Campana de alertas */}
          {totalAlerts > 0 && (
            <div className="relative">
              <button
                onClick={() => nav('/crm/offers')}
                className="relative text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition"
                title="Ver alertas">
                <span className="text-lg">🔔</span>
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {totalAlerts > 9 ? '9+' : totalAlerts}
                </span>
              </button>

              {/* Tooltip con detalle */}
              <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-50 p-3 hidden group-hover:block">
                {alerts.offersStalled > 0 && (
                  <div className="flex justify-between items-center py-1 text-sm">
                    <span className="text-gray-600">Ofertas sin movimiento</span>
                    <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-medium">{alerts.offersStalled}</span>
                  </div>
                )}
                {alerts.followupsDue > 0 && (
                  <div className="flex justify-between items-center py-1 text-sm">
                    <span className="text-gray-600">Seguimientos vencidos</span>
                    <span className="bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full text-xs font-medium">{alerts.followupsDue}</span>
                  </div>
                )}
                {alerts.materialsInTransit > 0 && (
                  <div className="flex justify-between items-center py-1 text-sm">
                    <span className="text-gray-600">Materiales en tránsito</span>
                    <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full text-xs font-medium">{alerts.materialsInTransit}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <NavLink to="/profile" className={linkClass}>
            {email ? email.split('@')[0] : 'Mi cuenta'}
          </NavLink>
          <button onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-400 hover:text-gray-600">
            Salir
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
