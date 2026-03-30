import { useEffect, useState, useCallback } from 'react'
import CedisRequestForm from '../../components/CedisRequestForm'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const ESTATUS_COLOR: Record<string, string> = {
  solicitado:        'bg-yellow-100 text-yellow-700',
  en_transito:       'bg-orange-100 text-orange-700',
  recibido_parcial:  'bg-blue-100 text-blue-700',
  recibido_cedis:    'bg-teal-100 text-teal-700',
  ingresado_almacen: 'bg-purple-100 text-purple-700',
  disponible:        'bg-indigo-100 text-indigo-700',
  completado:        'bg-green-100 text-green-700',
  cancelado:         'bg-gray-100 text-gray-400',
  pendiente_solicitar: 'bg-purple-100 text-purple-700',
}

const ACTIVE_ESTATUS = ['pendiente_solicitar','solicitado','en_transito','recibido_parcial','recibido_cedis','ingresado_almacen','disponible']
const DONE_ESTATUS   = ['completado','cancelado']

const ESTATUS_OPTIONS = [
  { value: 'pendiente_solicitar', label: 'Pendiente de solicitar' },
  { value: 'solicitado',        label: 'Solicitado' },
  { value: 'en_transito',       label: 'En tránsito' },
  { value: 'recibido_parcial',  label: 'Recibido parcial' },
  { value: 'recibido_cedis',    label: 'Recibido en CEDIS' },
  { value: 'ingresado_almacen', label: 'Ingresado almacén' },
  { value: 'disponible',        label: 'Disponible' },
  { value: 'completado',        label: 'Completado' },
  { value: 'cancelado',         label: 'Cancelado' },
]

interface CedisRequest {
  id: string
  order_id: string
  codigo: string
  descripcion: string
  centro_origen: string
  almacen_origen: string
  centro_destino: string
  almacen_destino: string
  cantidad: number
  cantidad_recibida: number
  cantidad_pendiente: number
  um: string
  lote: string
  fecha_solicitud: string
  fecha_caducidad: string
  estatus: string
  comentarios: string
  created_at: string
  crm_orders?: { numero_pedido: string; client_id: string; crm_clients?: { solicitante: string } }
}

interface ConsolidatedGroup {
  key: string
  codigo: string
  descripcion: string
  centro_origen: string
  almacen_origen: string
  centro_destino: string
  almacen_destino: string
  total_solicitado: number
  total_recibido: number
  total_pendiente: number
  um: string
  requests: CedisRequest[]
  estatus_predominante: string
}

export default function CrmMaterialsTrackingPage() {
  const [mode, setMode] = useState<'consolidado' | 'detalle'>('consolidado')
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [requests, setRequests] = useState<CedisRequest[]>([])
  const [selectedGroup, setSelectedGroup] = useState<ConsolidatedGroup | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  // Para recepción
  const [selectedReqs, setSelectedReqs] = useState<string[]>([])
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [newEstatus, setNewEstatus] = useState('recibido_cedis')
  const [comentario, setComentario] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_cedis_requests')
      .select(`
        *,
        crm_orders(numero_pedido, client_id, crm_clients(solicitante))
      `)
      .order('created_at', { ascending: false })

    setRequests(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Filtrar activos vs historial
  const visibleRequests = requests.filter(r =>
    showHistory ? true : ACTIVE_ESTATUS.includes(r.estatus)
  ).filter(r => {
    if (!searchFilter) return true
    const s = searchFilter.toLowerCase()
    return r.codigo?.toLowerCase().includes(s) ||
      r.descripcion?.toLowerCase().includes(s) ||
      r.crm_orders?.numero_pedido?.toLowerCase().includes(s) ||
      r.crm_orders?.crm_clients?.solicitante?.toLowerCase().includes(s)
  })

  // Consolidar por material + ruta
  const consolidatedGroups: ConsolidatedGroup[] = (() => {
    const map = new Map<string, ConsolidatedGroup>()
    for (const r of visibleRequests) {
      const key = `${r.codigo}__${r.centro_origen}__${r.almacen_origen}__${r.centro_destino}__${r.almacen_destino}`
      if (!map.has(key)) {
        map.set(key, {
          key, codigo: r.codigo, descripcion: r.descripcion,
          centro_origen: r.centro_origen, almacen_origen: r.almacen_origen,
          centro_destino: r.centro_destino, almacen_destino: r.almacen_destino,
          total_solicitado: 0, total_recibido: 0, total_pendiente: 0,
          um: r.um, requests: [], estatus_predominante: r.estatus,
        })
      }
      const g = map.get(key)!
      g.requests.push(r)
      g.total_solicitado += r.cantidad ?? 0
      g.total_recibido   += r.cantidad_recibida ?? 0
      g.total_pendiente  += r.cantidad_pendiente ?? r.cantidad ?? 0
    }
    // Estatus predominante = el más avanzado activo
    const ORDER = ['solicitado','en_transito','recibido_parcial','recibido_cedis','ingresado_almacen','disponible','completado','cancelado']
    for (const g of map.values()) {
      const estatuses = g.requests.map(r => r.estatus)
      g.estatus_predominante = estatuses.reduce((a, b) =>
        ORDER.indexOf(a) > ORDER.indexOf(b) ? a : b
      )
    }
    return Array.from(map.values())
  })()

  const openGroup = (group: ConsolidatedGroup) => {
    setSelectedGroup(group)
    setSelectedReqs([])
    setCantidades({})
    setNewEstatus('recibido_cedis')
    setComentario('')
  }

  const toggleReq = (id: string) =>
    setSelectedReqs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const confirmarRecepcion = async () => {
    if (selectedReqs.length === 0) return toast.error('Selecciona al menos un requerimiento')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    for (const reqId of selectedReqs) {
      const req = selectedGroup!.requests.find(r => r.id === reqId)!
      const cantRecibida = parseFloat(cantidades[reqId] ?? String(req.cantidad_pendiente ?? req.cantidad))
      const cantPendiente = Math.max(0, (req.cantidad_pendiente ?? req.cantidad) - cantRecibida)
      const estatusFinal = cantPendiente <= 0 ? 'completado' : 'recibido_parcial'
      const newEstatusItem = newEstatus === 'completado' || cantPendiente <= 0 ? 'completado' : newEstatus

      // Actualizar requerimiento
      await supabase.from('crm_cedis_requests').update({
        cantidad_recibida: (req.cantidad_recibida ?? 0) + cantRecibida,
        cantidad_pendiente: cantPendiente,
        estatus: newEstatusItem,
      }).eq('id', reqId)

      // Historial
      await supabase.from('crm_cedis_history').insert({
        request_id: reqId,
        estatus_anterior: req.estatus,
        estatus_nuevo: newEstatusItem,
        comentario: comentario || `Recibido ${cantRecibida} ${req.um ?? ''}${cantPendiente > 0 ? ` · Pendiente: ${cantPendiente}` : ' · Completo'}`,
        created_by: user?.id,
      })

      // Actualizar estatus del offer item si está vinculado
      await supabase.from('crm_offer_items')
        .update({ estatus: newEstatusItem === 'completado' ? 'recibido_cedis' : newEstatus })
        .eq('cedis_request_id', reqId)
    }

    toast.success('Recepción confirmada')
    setSelectedReqs([])
    setCantidades({})
    setComentario('')
    await load()
    // Actualizar el grupo seleccionado
    const updated = requests.filter(r => r.id)
    const newGroup = consolidatedGroups.find(g => g.key === selectedGroup?.key)
    setSelectedGroup(newGroup ?? null)
    setSaving(false)
  }

  const updateEstatusIndividual = async (req: CedisRequest, estatus: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('crm_cedis_requests').update({ estatus }).eq('id', req.id)
    await supabase.from('crm_cedis_history').insert({
      request_id: req.id, estatus_anterior: req.estatus,
      estatus_nuevo: estatus, created_by: user?.id,
    })
    await supabase.from('crm_offer_items')
      .update({ estatus }).eq('cedis_request_id', req.id)
    toast.success('Estatus actualizado')
    load()
  }

  const copiarPendientesExcel = () => {
    const pendientes = requests.filter(r => r.estatus === 'pendiente_solicitar')
    if (pendientes.length === 0) return toast.error('No hay materiales pendientes de solicitar')
    const header = ['Fecha solicitud','Centro Origen','Almacen Origen','Centro Destino','Almacen Destino','Codigo','Descripcion','Cantidad','UM','Lote','Fecha Caducidad','','','Estatus','Comentarios','Pedido'].join('\t')
    const rows = pendientes.map(r => [
      r.fecha_solicitud ?? '',
      r.centro_origen ?? '',
      r.almacen_origen ?? '',
      r.centro_destino ?? '',
      r.almacen_destino ?? '',
      r.codigo ?? '',
      r.descripcion ?? '',
      r.cantidad ?? '',
      r.um ?? '',
      r.lote ?? '',
      r.fecha_caducidad ?? '',
      '', '',
      'Pendiente de solicitar',
      r.comentarios ?? '',
      r.crm_orders?.numero_pedido ?? '',
    ].join('\t')).join('\n')
    navigator.clipboard.writeText(header + '\n' + rows)
    toast.success(`${pendientes.length} material(es) copiados al portapapeles`)
  }

  const activeCount  = requests.filter(r => ACTIVE_ESTATUS.includes(r.estatus)).length
  const doneCount    = requests.filter(r => DONE_ESTATUS.includes(r.estatus)).length

  return (
    <>
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/crm" className="text-sm text-gray-400 hover:text-gray-600">← CRM</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Materiales en tránsito</h1>
          </div>
          <p className="text-sm text-gray-400">
            {activeCount} requerimientos activos · {doneCount} completados/cancelados
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 w-56"
            placeholder="Buscar material, pedido, cliente..."
            value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
          <button onClick={copiarPendientesExcel}
            className="border border-purple-300 text-purple-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-50">
            Copiar pendientes Excel
          </button>
          <button onClick={() => setShowNewForm(true)}
            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
            + Nueva solicitud CEDIS
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showHistory}
              onChange={e => setShowHistory(e.target.checked)} />
            Ver historial completo
          </label>
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setMode('consolidado')}
              className={`px-3 py-1.5 text-xs font-medium transition ${mode === 'consolidado' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              Consolidado
            </button>
            <button onClick={() => setMode('detalle')}
              className={`px-3 py-1.5 text-xs font-medium transition ${mode === 'detalle' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
              Detalle
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Tabla principal */}
        <div className="flex-1 min-w-0">

          {/* MODO CONSOLIDADO */}
          {mode === 'consolidado' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
              {!loading && consolidatedGroups.length === 0 && (
                <p className="text-sm text-gray-400 p-8 text-center">No hay materiales en tránsito.</p>
              )}
              {!loading && consolidatedGroups.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Material','Descripción','Ruta (Origen → Destino)','UM',
                          'Total Sol.','Recibido','Pendiente','Reqs.','Estatus',''].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {consolidatedGroups.map(g => {
                        const isSelected = selectedGroup?.key === g.key
                        const pct = g.total_solicitado > 0
                          ? Math.round((g.total_recibido / g.total_solicitado) * 100) : 0
                        return (
                          <tr key={g.key}
                            onClick={() => openGroup(g)}
                            className={`border-b border-gray-100 cursor-pointer transition ${isSelected ? 'bg-teal-50' : 'hover:bg-gray-50'}`}>
                            <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">{g.codigo}</td>
                            <td className="px-3 py-2 text-gray-500 max-w-48 truncate">{g.descripcion}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                              <span className="text-gray-400">{g.centro_origen}</span>
                              {g.almacen_origen && <span className="text-gray-300">/{g.almacen_origen}</span>}
                              <span className="text-gray-300 mx-1">→</span>
                              <span className="text-teal-600">{g.centro_destino}</span>
                              {g.almacen_destino && <span className="text-gray-400">/{g.almacen_destino}</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-500">{g.um}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-800">{g.total_solicitado}</td>
                            <td className="px-3 py-2 text-right text-green-600 font-medium">{g.total_recibido}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={g.total_pendiente > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                                {g.total_pendiente}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                {g.requests.length}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full font-medium ${ESTATUS_COLOR[g.estatus_predominante] ?? 'bg-gray-100 text-gray-500'}`}>
                                  {g.estatus_predominante.replace(/_/g,' ')}
                                </span>
                                {g.total_solicitado > 0 && (
                                  <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                    <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-teal-600 text-xs font-medium">
                              {isSelected ? '▶' : '›'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* MODO DETALLE */}
          {mode === 'detalle' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
              {!loading && visibleRequests.length === 0 && (
                <p className="text-sm text-gray-400 p-8 text-center">No hay requerimientos.</p>
              )}
              {!loading && visibleRequests.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Material','Descripción','Pedido','Cliente','Ruta',
                          'UM','Solicitado','Recibido','Pendiente','Lote','Cad.','Estatus','Acción'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRequests.map(r => (
                        <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${
                          DONE_ESTATUS.includes(r.estatus) ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{r.codigo}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{r.descripcion}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.crm_orders?.numero_pedido}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-32 truncate">
                            {r.crm_orders?.crm_clients?.solicitante}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {r.centro_origen}/{r.almacen_origen} → {r.centro_destino}/{r.almacen_destino}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{r.um}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{r.cantidad}</td>
                          <td className="px-3 py-2 text-right text-green-600">{r.cantidad_recibida ?? 0}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={r.cantidad_pendiente > 0 ? 'text-orange-600 font-medium' : 'text-green-600'}>
                              {r.cantidad_pendiente ?? r.cantidad}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.lote || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.fecha_caducidad || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full font-medium ${ESTATUS_COLOR[r.estatus] ?? 'bg-gray-100 text-gray-500'}`}>
                              {r.estatus.replace(/_/g,' ')}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {!DONE_ESTATUS.includes(r.estatus) && (
                              <select className="border border-gray-200 rounded px-1.5 py-1 text-xs outline-none bg-white"
                                value={r.estatus}
                                onChange={e => updateEstatusIndividual(r, e.target.value)}>
                                {ESTATUS_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel lateral — requerimientos del grupo seleccionado */}
        {selectedGroup && mode === 'consolidado' && (
          <div className="w-96 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col"
            style={{ maxHeight: '80vh' }}>
            {/* Header del panel */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 sticky top-0">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-gray-800">{selectedGroup.codigo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedGroup.descripcion}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedGroup.centro_origen}/{selectedGroup.almacen_origen}
                    <span className="mx-1 text-gray-300">→</span>
                    {selectedGroup.centro_destino}/{selectedGroup.almacen_destino}
                  </p>
                </div>
                <button onClick={() => setSelectedGroup(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg ml-2">×</button>
              </div>
              {/* Resumen */}
              <div className="flex gap-3 mt-2 text-xs">
                <div className="flex-1 bg-white rounded-lg border border-gray-200 px-2 py-1.5 text-center">
                  <p className="text-gray-400">Solicitado</p>
                  <p className="font-bold text-gray-800">{selectedGroup.total_solicitado} {selectedGroup.um}</p>
                </div>
                <div className="flex-1 bg-green-50 rounded-lg border border-green-200 px-2 py-1.5 text-center">
                  <p className="text-green-500">Recibido</p>
                  <p className="font-bold text-green-700">{selectedGroup.total_recibido} {selectedGroup.um}</p>
                </div>
                <div className="flex-1 bg-orange-50 rounded-lg border border-orange-200 px-2 py-1.5 text-center">
                  <p className="text-orange-500">Pendiente</p>
                  <p className="font-bold text-orange-700">{selectedGroup.total_pendiente} {selectedGroup.um}</p>
                </div>
              </div>
            </div>

            {/* Lista de requerimientos */}
            <div className="flex-1 overflow-y-auto">
              {selectedGroup.requests.map(r => {
                const isDone = DONE_ESTATUS.includes(r.estatus)
                const isChecked = selectedReqs.includes(r.id)
                return (
                  <div key={r.id}
                    className={`px-4 py-3 border-b border-gray-100 last:border-0 ${isDone ? 'opacity-40' : ''}`}>
                    <div className="flex items-start gap-2">
                      {!isDone && (
                        <input type="checkbox" checked={isChecked}
                          onChange={() => toggleReq(r.id)}
                          className="mt-0.5 flex-shrink-0" />
                      )}
                      {isDone && <span className="text-green-500 text-sm mt-0.5 flex-shrink-0">✓</span>}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-2 mb-1">
                          <p className="text-xs font-semibold text-gray-700">
                            Pedido {r.crm_orders?.numero_pedido}
                          </p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${ESTATUS_COLOR[r.estatus] ?? 'bg-gray-100 text-gray-500'}`}>
                            {r.estatus.replace(/_/g,' ')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate mb-1">
                          {r.crm_orders?.crm_clients?.solicitante}
                        </p>
                        <div className="flex gap-3 text-xs text-gray-500 mb-1">
                          <span>Sol: <strong>{r.cantidad}</strong></span>
                          <span>Rec: <strong className="text-green-600">{r.cantidad_recibida ?? 0}</strong></span>
                          <span>Pend: <strong className={r.cantidad_pendiente > 0 ? 'text-orange-500' : 'text-green-600'}>
                            {r.cantidad_pendiente ?? r.cantidad}
                          </strong></span>
                        </div>
                        {r.lote && <p className="text-xs text-gray-400">Lote: {r.lote}{r.fecha_caducidad ? ` · Cad: ${r.fecha_caducidad}` : ''}</p>}
                        {r.comentarios && <p className="text-xs text-gray-300 italic mt-0.5">{r.comentarios}</p>}

                        {/* Campo de cantidad para seleccionados */}
                        {isChecked && (
                          <div className="mt-2 flex items-center gap-2">
                            <label className="text-xs text-gray-500 whitespace-nowrap">Cant. recibida:</label>
                            <input type="number"
                              className="border border-teal-300 rounded px-2 py-1 text-xs outline-none w-20 focus:border-teal-500"
                              placeholder={String(r.cantidad_pendiente ?? r.cantidad)}
                              value={cantidades[r.id] ?? ''}
                              onChange={e => setCantidades(prev => ({ ...prev, [r.id]: e.target.value }))} />
                            <span className="text-xs text-gray-400">{r.um}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Panel de confirmación */}
            {selectedReqs.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  Confirmar recepción — {selectedReqs.length} requerimiento(s)
                </p>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 outline-none bg-white"
                  value={newEstatus} onChange={e => setNewEstatus(e.target.value)}>
                  {ESTATUS_OPTIONS.filter(o => !['solicitado'].includes(o.value)).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs h-14 resize-none outline-none focus:border-teal-400 mb-2"
                  placeholder="Comentario (opcional)..."
                  value={comentario} onChange={e => setComentario(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={confirmarRecepcion} disabled={saving}
                    className="flex-1 bg-teal-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Confirmar recepción'}
                  </button>
                  <button onClick={() => { setSelectedReqs([]); setCantidades({}) }}
                    className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-200">
                    Limpiar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* Modal nueva solicitud CEDIS */}
    {showNewForm && (
      <CedisRequestForm
        onClose={() => setShowNewForm(false)}
        onSaved={() => { setShowNewForm(false); load() }}
      />
    )}
  </>
  )
}