import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useState, useEffect } from 'react'
import GlobalSearch from './GlobalSearch'
import { useAlerts } from '../hooks/useAlerts'
import { useRole } from '../hooks/useRole'

export default function Layout() {
  const [email, setEmail] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const alerts = useAlerts()
  const { hasModule, isAdmin, loading: roleLoading } = useRole()
  const nav = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user
      if (!user) return
      setEmail(user.email ?? '')
      // Guardar perfil para panel de admin
      supabase.from('user_profiles').upsert(
        { user_id: user.id, email: user.email },
        { onConflict: 'user_id' }
      ).then(({ error }) => {
        if (error) console.error('Error upserting profile:', error)
      })

      // Crear rol si no existe (con retry en caso de rate limit)
      const createRoleIfNeeded = async (attempt = 0) => {
        try {
          const { data: roleData, error } = await supabase.from('user_roles')
            .select('user_id').eq('user_id', user.id).single()

          // Si hay error 429 (rate limit), esperar y reintentar (máx 2 intentos)
          if (error && 'status' in error && error.status === 429 && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000))
            return createRoleIfNeeded(attempt + 1)
          }

          if (!roleData) {
            supabase.from('user_roles').insert({
              user_id: user.id, role: 'user', modules: ['pendientes']
            }).then(({ error: insertError }) => {
              if (insertError) console.error('Error creating role:', insertError)
            })
          }
        } catch (e) {
          console.error('Error checking role:', e)
        }
      }

      createRoleIfNeeded()
    })
  }, [])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm ${isActive ? 'text-teal-600 font-semibold' : 'text-gray-500 hover:text-gray-700'}`

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block px-4 py-3 text-sm font-medium border-b border-gray-100 last:border-0 ${
      isActive ? 'text-teal-600 bg-teal-50' : 'text-gray-700 hover:bg-gray-50'
    }`

  const totalAlerts = alerts.offersStalled + alerts.followupsDue + alerts.materialsInTransit

  if (roleLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-sm text-gray-400">Cargando...</div>
    </div>
  )

  const navLinks = [
    { to: '/tasks',        label: 'Pendientes', module: 'pendientes', always: true },
    { to: '/crm/pipeline', label: 'CRM',        module: 'crm' },
    { to: '/msc',          label: 'MSC',        module: 'msc' },
    { to: '/cedis',        label: 'CEDIS',      module: 'cedis' },
    { to: '/catalog',      label: 'Catálogo',   module: 'catalogo' },
    { to: '/admin',        label: 'Admin',      module: 'admin' },
  ].filter(l => l.always || hasModule(l.module))

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
        {/* Logo + links desktop */}
        <div className="flex items-center gap-5 overflow-x-auto flex-shrink-0">
          <span className="font-bold text-teal-600 text-lg flex-shrink-0">Pendientes</span>
          {/* Links solo en desktop */}
          <div className="hidden sm:flex items-center gap-5">
            {navLinks.map(l => (
              <NavLink key={l.to} to={l.to} className={linkClass}>{l.label}</NavLink>
            ))}
          </div>
        </div>

        {/* Derecha */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Busqueda — oculta en mobile */}
          <div className="hidden sm:block">
            <GlobalSearch />
          </div>

          {/* Alertas */}
          {totalAlerts > 0 && hasModule('crm') && (
            <button onClick={() => nav('/crm/pipeline')}
              className="relative text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition">
              <span className="text-lg">🔔</span>
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {totalAlerts > 9 ? '9+' : totalAlerts}
              </span>
            </button>
          )}

          {/* Usuario — oculto en mobile */}
          <NavLink to="/profile" className={`hidden sm:block text-sm text-gray-500 hover:text-gray-700`}>
            {email ? email.split('@')[0] : 'Mi cuenta'}
          </NavLink>
          <button onClick={() => supabase.auth.signOut()}
            className="hidden sm:block text-sm text-gray-400 hover:text-gray-600">
            Salir
          </button>

          {/* Hamburguesa — solo mobile */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-gray-100 transition"
            aria-label="Menu">
            <span className={`block w-5 h-0.5 bg-gray-600 transition-transform ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
            <span className={`block w-5 h-0.5 bg-gray-600 transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-gray-600 transition-transform ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
          </button>
        </div>
      </nav>

      {/* Menu mobile desplegable */}
      {menuOpen && (
        <div className="sm:hidden bg-white border-b border-gray-200 shadow-lg z-20">
          {navLinks.map(l => (
            <NavLink key={l.to} to={l.to} className={mobileLinkClass}
              onClick={() => setMenuOpen(false)}>
              {l.label}
            </NavLink>
          ))}
          <div className="border-t border-gray-100">
            <NavLink to="/profile" className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
              {email ? email.split('@')[0] : 'Mi cuenta'}
            </NavLink>
            <button
              onClick={() => { supabase.auth.signOut(); setMenuOpen(false) }}
              className="block w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 font-medium">
              Salir
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 p-3 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
