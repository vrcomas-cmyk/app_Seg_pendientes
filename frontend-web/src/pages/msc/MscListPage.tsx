import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../hooks/useRole'

const ESTATUS_COLOR: Record<string, string> = {
  borrador:    'bg-gray-100 text-gray-500',
  enviada:     'bg-blue-100 text-blue-700',
  aprobada:    'bg-green-100 text-green-700',
  rechazada:   'bg-red-100 text-red-600',
  en_proceso:  'bg-yellow-100 text-yellow-700',
  completada:  'bg-teal-100 text-teal-700',
}

export default function MscListPage() {
  const nav = useNavigate()
  const { isAdmin, isGerente } = useRole()
  const [solicitudes, setSolicitudes]     = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [filterEstatus, setFilterEstatus] = useState('')
  const [search, setSearch]               = useState('')
  const [viewMode, setViewMode]           = useState<'mine'|'team'|'all'|'user'>('mine')
  const [teamUsers, setTeamUsers]         = useState<any[]>([])
  const [allUsers, setAllUsers]           = useState<any[]>([])
  const [selectedUser, setSelectedUser]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    let query = supabase
      .from('msc_solicitudes')
      .select('*, msc_items(id, codigo, cantidad_pedida, descripcion)')
      .order('created_at', { ascending: false })

    if (viewMode === 'mine') {
      query = query.eq('created_by', user.id)
    } else if (viewMode === 'team' && isGerente) {
      const { data: teamData } = await supabase
        .from('user_teams').select('miembro_id').eq('gerente_id', user.id)
      const memberIds = (teamData ?? []).map(t => t.miembro_id)
      query = query.in('created_by', [user.id, ...memberIds])
    } else if (viewMode === 'user' && selectedUser) {
      query = query.eq('created_by', selectedUser)
    }
    // viewMode === 'all' → sin filtro adicional (admin ve todo por RLS)

    const { data } = await query
    setSolicitudes(data ?? [])
    setLoading(false)
  }, [viewMode, selectedUser, isGerente])

  useEffect(() => { load() }, [load])

  // Cargar usuarios para filtros
  useEffect(() => {
    const loadUsers = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (isGerente) {
        const { data: teamData } = await supabase
          .from('user_teams').select('miembro_id').eq('gerente_id', user.id)
        const memberIds = (teamData ?? []).map(t => t.miembro_id)
        if (memberIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles').select('user_id, email').in('user_id', memberIds)
          setTeamUsers(profiles ?? [])
        }
      }
      if (isAdmin) {
        const { data: profiles } = await supabase
          .from('user_profiles').select('user_id, email')
        setAllUsers(profiles ?? [])
      }
    }
    loadUsers()
  }, [isAdmin, isGerente])

  const visible = solicitudes.filter(s => {
    if (filterEstatus && s.estatus !== filterEstatus) return false
    if (search) {
      const q = search.toLowerCase()
      return s.numero_pedido_sap?.toLowerCase().includes(q) ||
        s.destinatario_nombre?.toLowerCase().includes(q) ||
        s.motivo?.toLowerCase().includes(q) ||
        s.msc_items?.some((i: any) => i.codigo?.toLowerCase().includes(q))
    }
    return true
  })

  const activas     = solicitudes.filter(s => !['completada','rechazada'].includes(s.estatus)).length
  const aprobadas   = solicitudes.filter(s => s.estatus === 'aprobada').length
  const enProceso   = solicitudes.filter(s => s.estatus === 'en_proceso').length
  const completadas = solicitudes.filter(s => s.estatus === 'completada').length

  const userOptions = isAdmin ? allUsers : teamUsers

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Mercancia Sin Cargo</h1>
          <p className="text-sm text-gray-400 mt-0.5">Control de solicitudes, recepciones y entregas</p>
        </div>
        <div className="flex gap-2">
          <Link to="/msc/inventario"
            className="border border-teal-600 text-teal-600 px-3 py-2 rounded-xl text-sm font-semibold hover:bg-teal-50">
            Inventario
          </Link>
          <button onClick={() => nav('/msc/nueva')}
            className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700 shadow-sm">
            + Nueva
          </button>
        </div>
      </div>

      {/* Selector de vista — solo admin y gerente */}
      {(isAdmin || isGerente) && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ver:</p>
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'mine', label: 'Mis registros' },
              { key: isGerente ? 'team' : 'all', label: isGerente ? 'Mi equipo' : 'Todos' },
              { key: 'user', label: 'Por usuario' },
            ].map(v => (
              <button key={v.key}
                onClick={() => { setViewMode(v.key as any); setSelectedUser('') }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  viewMode === v.key
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {v.label}
              </button>
            ))}
          </div>
          {viewMode === 'user' && (
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}>
              <option value="">Seleccionar usuario...</option>
              {userOptions.map(u => (
                <option key={u.user_id} value={u.user_id}>{u.email}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Metricas */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-4">
        {[
          { label: 'Activas',     value: activas,     color: 'bg-white border-gray-200 text-gray-700' },
          { label: 'Aprobadas',   value: aprobadas,   color: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'En proceso',  value: enProceso,   color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
          { label: 'Completadas', value: completadas, color: 'bg-teal-50 border-teal-200 text-teal-700' },
        ].map(m => (
          <div key={m.label} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium ${m.color}`}>
            <span className="text-lg font-bold">{m.value}</span>
            <span className="text-xs opacity-75">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-x-auto">
          {['','borrador','enviada','aprobada','en_proceso','completada','rechazada'].map(e => (
            <button key={e} onClick={() => setFilterEstatus(e)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium transition ${
                filterEstatus === e ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {e === '' ? 'Todas' : e.replace('_',' ')}
            </button>
          ))}
        </div>
        <input
          className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar folio, cliente, codigo..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-8 text-center">Cargando...</p>}
        {!loading && visible.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">No hay solicitudes.</p>
            <button onClick={() => nav('/msc/nueva')}
              className="mt-3 text-sm text-teal-600 font-medium hover:text-teal-700">
              + Crear primera solicitud
            </button>
          </div>
        )}
        {!loading && visible.map(s => {
          const items = s.msc_items ?? []
          return (
            <Link key={s.id} to={`/msc/${s.id}`}
              className="flex items-center gap-4 px-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition min-h-[64px]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-semibold text-gray-800">
                    {s.numero_pedido_sap ? `Folio: ${s.numero_pedido_sap}` : 'Sin folio SAP'}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTATUS_COLOR[s.estatus] ?? 'bg-gray-100 text-gray-500'}`}>
                    {s.estatus?.replace('_',' ')}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                  {s.destinatario_nombre && <span>Para: {s.destinatario_nombre}</span>}
                  {s.motivo && <span>{s.motivo}</span>}
                  <span>{new Date(s.created_at).toLocaleDateString('es-MX')}</span>
                </div>
                {items.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {items.slice(0,4).map((i: any) => (
                      <span key={i.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                        {i.codigo}
                      </span>
                    ))}
                    {items.length > 4 && <span className="text-xs text-gray-400">+{items.length - 4}</span>}
                  </div>
                )}
              </div>
              <span className="text-gray-300 text-lg flex-shrink-0">›</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
