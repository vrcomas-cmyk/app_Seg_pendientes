import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

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
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEstatus, setFilterEstatus] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('msc_solicitudes')
      .select('*, msc_items(id, codigo, cantidad_pedida, descripcion)')
      .order('created_at', { ascending: false })
    setSolicitudes(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = solicitudes.filter(s => {
    if (filterEstatus && s.estatus !== filterEstatus) return false
    if (search) {
      const q = search.toLowerCase()
      return s.numero_pedido_sap?.toLowerCase().includes(q) ||
        s.destinatario_nombre?.toLowerCase().includes(q) ||
        s.oficina_ventas?.toLowerCase().includes(q) ||
        s.motivo?.toLowerCase().includes(q) ||
        s.msc_items?.some((i: any) => i.codigo?.toLowerCase().includes(q))
    }
    return true
  })

  const activas     = solicitudes.filter(s => !['completada','rechazada'].includes(s.estatus)).length
  const aprobadas   = solicitudes.filter(s => s.estatus === 'aprobada').length
  const enProceso   = solicitudes.filter(s => s.estatus === 'en_proceso').length
  const completadas = solicitudes.filter(s => s.estatus === 'completada').length

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Mercancia Sin Cargo</h1>
          <p className="text-sm text-gray-400 mt-0.5">Control de solicitudes, recepciones y entregas</p>
        </div>
        <div className="flex gap-2">
          <Link to="/msc/inventario"
            className="border border-teal-600 text-teal-600 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-50">
            Ver inventario
          </Link>
          <button onClick={() => nav('/msc/nueva')}
            className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700 shadow-sm">
            + Nueva solicitud
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap mb-5">
        {[
          { label: 'Activas',     value: activas,     color: 'bg-white border-gray-200 text-gray-700' },
          { label: 'Aprobadas',   value: aprobadas,   color: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'En proceso',  value: enProceso,   color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
          { label: 'Completadas', value: completadas, color: 'bg-teal-50 border-teal-200 text-teal-700' },
        ].map(m => (
          <div key={m.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${m.color}`}>
            <span className="text-lg font-bold">{m.value}</span>
            <span className="text-xs opacity-75">{m.label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {['','borrador','enviada','aprobada','en_proceso','completada','rechazada'].map(e => (
            <button key={e} onClick={() => setFilterEstatus(e)}
              className={`px-3 py-2 text-xs font-medium transition ${filterEstatus === e ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {e === '' ? 'Todas' : e.replace('_',' ')}
            </button>
          ))}
        </div>
        <input
          className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar por folio, cliente, codigo..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

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
              className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition">
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
                  {s.oficina_ventas && <span>Oficina: {s.oficina_ventas}</span>}
                  {s.destinatario_nombre && <span>Para: {s.destinatario_nombre}</span>}
                  {s.motivo && <span>Motivo: {s.motivo}</span>}
                  <span>{new Date(s.created_at).toLocaleDateString('es-MX')}</span>
                </div>
                {items.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {items.slice(0,4).map((i: any) => (
                      <span key={i.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{i.codigo}</span>
                    ))}
                    {items.length > 4 && <span className="text-xs text-gray-400">+{items.length - 4} mas</span>}
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
