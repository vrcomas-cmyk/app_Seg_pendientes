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
  cancelada:   'bg-gray-200 text-gray-500',
}

function formatMXN(n: number) {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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
  const [showReport, setShowReport]       = useState(false)
  const [reportFilters, setReportFilters] = useState({
    fechaInicio: '', fechaFin: '',
    estatus: [] as string[],
  })
  const [downloadingReport, setDownloadingReport] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    let query = supabase
      .from('msc_solicitudes')
      .select(`
        *,
        msc_items(id, codigo, descripcion, cantidad_pedida, precio_unitario, total, estatus_linea),
        msc_recepciones(id, msc_recepcion_items(codigo, cantidad_recibida)),
        msc_salidas(id, evidencia_url, msc_salida_items(solicitud_id, codigo, cantidad_entregada),
        msc_evidencias:msc_evidencias(salida_id))
      `)
      .order('created_at', { ascending: false })

    if (viewMode === 'mine') {
      query = query.eq('created_by', user.id)
    } else if (viewMode === 'team' && isGerente) {
      const { data: teamData } = await supabase
        .from('user_teams').select('miembro_id').eq('gerente_id', user.id)
      const memberIds = (teamData ?? []).map((t: any) => t.miembro_id)
      query = query.in('created_by', [user.id, ...memberIds])
    } else if (viewMode === 'user' && selectedUser) {
      query = query.eq('created_by', selectedUser)
    }

    const { data } = await query
    setSolicitudes(data ?? [])
    setLoading(false)
  }, [viewMode, selectedUser, isGerente])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const loadUsers = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      if (isGerente) {
        const { data: teamData } = await supabase
          .from('user_teams').select('miembro_id').eq('gerente_id', user.id)
        const memberIds = (teamData ?? []).map((t: any) => t.miembro_id)
        if (memberIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles').select('user_id, email').in('user_id', memberIds)
          setTeamUsers(profiles ?? [])
        }
      }
      if (isAdmin) {
        const { data: profiles } = await supabase.from('user_profiles').select('user_id, email')
        setAllUsers(profiles ?? [])
      }
    }
    loadUsers()
  }, [isAdmin, isGerente])

  // Calcular importes de una solicitud
  const calcImportes = (s: any) => {
    const items = s.msc_items ?? []
    const recepciones = s.msc_recepciones ?? []
    const salidas = s.msc_salidas ?? []

    let solicitado = 0, recibido = 0, comprobado = 0, hasPrice = false

    for (const item of items) {
      if (!item.precio_unitario) continue
      hasPrice = true
      const precio = Number(item.precio_unitario)

      // Solicitado
      solicitado += precio * (item.cantidad_pedida ?? 0)

      // Recibido — suma de recepciones para este item
      const cantRec = recepciones.reduce((acc: number, rec: any) => {
        const ri = (rec.msc_recepcion_items ?? []).find((r: any) => r.codigo === item.codigo)
        return acc + (ri?.cantidad_recibida ?? 0)
      }, 0)
      recibido += precio * cantRec

      // Comprobado — salidas con evidencia
      for (const sal of salidas) {
        const tieneEvidencia = (sal.msc_evidencias ?? []).some((e: any) => e.salida_id === sal.id)
        if (!tieneEvidencia) continue
        const si = (sal.msc_salida_items ?? []).find((x: any) =>
          x.solicitud_id === s.id && x.codigo === item.codigo
        )
        if (si) comprobado += precio * (si.cantidad_entregada ?? 0)
      }
    }

    return { solicitado, recibido, comprobado, hasPrice }
  }

  // Descargar reporte Excel
  const downloadReport = async () => {
    setDownloadingReport(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let query = supabase.from('msc_solicitudes').select(`
      *,
      msc_items(codigo, descripcion, cantidad_pedida, precio_unitario, total, estatus_linea,
        solicitud_id),
      msc_recepciones(id, msc_recepcion_items(codigo, cantidad_recibida)),
      msc_salidas(id, msc_salida_items(solicitud_id, codigo, cantidad_entregada),
        msc_evidencias:msc_evidencias(salida_id))
    `).order('created_at', { ascending: false })

    if (reportFilters.fechaInicio) query = query.gte('created_at', reportFilters.fechaInicio)
    if (reportFilters.fechaFin)    query = query.lte('created_at', reportFilters.fechaFin + 'T23:59:59')
    if (reportFilters.estatus.length > 0 && !reportFilters.estatus.includes('todos')) {
      if (reportFilters.estatus.includes('pendiente_comprobar')) {
        // Se filtra después
      } else {
        query = query.in('estatus', reportFilters.estatus)
      }
    }

    const { data } = await query
    let rows = data ?? []

    if (reportFilters.estatus.includes('pendiente_comprobar')) {
      rows = rows.filter(s => {
        const salidas = s.msc_salidas ?? []
        return salidas.some((sal: any) => {
          const tieneEv = (sal.msc_evidencias ?? []).some((e: any) => e.salida_id === sal.id)
          return !tieneEv
        })
      })
    }

    const headers = [
      'Folio SAP','Fecha','Estatus','Solicitante','Destinatario','Motivo',
      'Código','Artículo','Cant. Pedida','Cant. Recibida','Cant. Entregada',
      'Precio Unitario','Importe Pedido','Importe Recibido','Importe Comprobado',
      'Evidencia Subida'
    ].join('\t')

    const lines: string[] = [headers]

    for (const s of rows) {
      const items = s.msc_items ?? []
      const recepciones = s.msc_recepciones ?? []
      const salidas = s.msc_salidas ?? []

      for (const item of items) {
        const cantRec = recepciones.reduce((acc: number, rec: any) => {
          const ri = (rec.msc_recepcion_items ?? []).find((r: any) => r.codigo === item.codigo)
          return acc + (ri?.cantidad_recibida ?? 0)
        }, 0)

        let cantEnt = 0
        let tieneEvidencia = false
        for (const sal of salidas) {
          const si = (sal.msc_salida_items ?? []).find((x: any) =>
            x.solicitud_id === s.id && x.codigo === item.codigo
          )
          if (si) {
            cantEnt += si.cantidad_entregada ?? 0
            if ((sal.msc_evidencias ?? []).some((e: any) => e.salida_id === sal.id)) {
              tieneEvidencia = true
            }
          }
        }

        const precio = Number(item.precio_unitario ?? 0)
        lines.push([
          s.numero_pedido_sap ?? '',
          s.fecha ?? '',
          s.estatus ?? '',
          s.solicitante ?? '',
          s.destinatario_nombre ?? '',
          s.motivo ?? '',
          item.codigo ?? '',
          item.descripcion ?? '',
          item.cantidad_pedida ?? '',
          cantRec,
          cantEnt,
          precio > 0 ? precio : '',
          precio > 0 ? (precio * (item.cantidad_pedida ?? 0)).toFixed(2) : '',
          precio > 0 ? (precio * cantRec).toFixed(2) : '',
          precio > 0 ? (precio * cantEnt).toFixed(2) : '',
          tieneEvidencia ? 'Sí' : 'No',
        ].join('\t'))
      }
    }

    const content = lines.join('\n')
    const blob = new Blob(['\ufeff' + content], { type: 'text/tab-separated-values;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_msc_${new Date().toISOString().split('T')[0]}.xls`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setShowReport(false)
    setDownloadingReport(false)
  }

  const ESTATUS_OPTS = ['borrador','enviada','aprobada','en_proceso','completada','cancelada','pendiente_comprobar']

  const toggleReportEstatus = (e: string) => {
    setReportFilters(prev => ({
      ...prev,
      estatus: prev.estatus.includes(e)
        ? prev.estatus.filter(x => x !== e)
        : [...prev.estatus, e]
    }))
  }

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

  const activas     = solicitudes.filter(s => !['completada','rechazada','cancelada'].includes(s.estatus)).length
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
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowReport(true)}
            className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            Descargar reporte
          </button>
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

      {/* Selector vista admin/gerente */}
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
              <option value="">Seleccionar...</option>
              {userOptions.map((u: any) => (
                <option key={u.user_id} value={u.user_id}>{u.email}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Métricas */}
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
          {['','borrador','enviada','aprobada','en_proceso','completada','cancelada'].map(e => (
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
          const { solicitado, recibido, comprobado, hasPrice } = calcImportes(s)
          return (
            <Link key={s.id} to={`/msc/${s.id}`}
              className="flex items-start gap-4 px-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition min-h-[64px]">
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
                      <span key={i.id} className={`text-xs px-2 py-0.5 rounded font-mono ${
                        i.estatus_linea === 'cancelado' ? 'bg-red-50 text-red-400 line-through' : 'bg-gray-100 text-gray-600'
                      }`}>{i.codigo}</span>
                    ))}
                    {items.length > 4 && <span className="text-xs text-gray-400">+{items.length - 4}</span>}
                  </div>
                )}
                {/* Chips de importe */}
                {hasPrice && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg font-medium">
                      Solicitado {formatMXN(solicitado)}
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-medium">
                      Recibido {formatMXN(recibido)}
                    </span>
                    <span className="text-xs bg-teal-50 text-teal-600 px-2 py-1 rounded-lg font-medium">
                      Comprobado {formatMXN(comprobado)}
                    </span>
                  </div>
                )}
              </div>
              <span className="text-gray-300 text-lg flex-shrink-0 mt-1">›</span>
            </Link>
          )
        })}
      </div>

      {/* Modal reporte */}
      {showReport && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-800">Descargar reporte MSC</h2>
              <button onClick={() => setShowReport(false)} className="text-gray-400 hover:text-gray-600 text-xl">x</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Rango de fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Fecha inicio</label>
                  <input type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={reportFilters.fechaInicio}
                    onChange={e => setReportFilters(x => ({ ...x, fechaInicio: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Fecha fin</label>
                  <input type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={reportFilters.fechaFin}
                    onChange={e => setReportFilters(x => ({ ...x, fechaFin: e.target.value }))} />
                </div>
              </div>

              {/* Estatus */}
              <div>
                <label className="text-xs text-gray-500 block mb-2">Estatus a incluir</label>
                <div className="flex flex-wrap gap-2">
                  {ESTATUS_OPTS.map(e => {
                    const active = reportFilters.estatus.includes(e)
                    return (
                      <button key={e} onClick={() => toggleReportEstatus(e)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          active
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}>
                        {e === 'pendiente_comprobar' ? 'Pendiente comprobar' : e.replace('_',' ')}
                      </button>
                    )
                  })}
                  <button onClick={() => setReportFilters(x => ({
                    ...x, estatus: reportFilters.estatus.length === ESTATUS_OPTS.length ? [] : [...ESTATUS_OPTS]
                  }))}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400">
                    {reportFilters.estatus.length === ESTATUS_OPTS.length ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button onClick={() => setShowReport(false)}
                  className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={downloadReport} disabled={downloadingReport}
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                  {downloadingReport ? 'Generando...' : 'Descargar Excel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
