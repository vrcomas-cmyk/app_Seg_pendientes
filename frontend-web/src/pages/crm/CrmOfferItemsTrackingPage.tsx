import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase, getCachedUser } from '../../lib/supabase'
import toast from 'react-hot-toast'

const ITEM_ESTATUS = [
  { value: 'ofertado',          label: 'Ofertado',           color: 'bg-gray-100 text-gray-600' },
  { value: 'aceptado',          label: 'Aceptado',           color: 'bg-green-100 text-green-700' },
  { value: 'rechazado',         label: 'Rechazado',          color: 'bg-red-100 text-red-600' },
  { value: 'asignado_pedido',   label: 'Asignado a pedido',  color: 'bg-blue-100 text-blue-700' },
  { value: 'solicitud_cedis',   label: 'Solicitud CEDIS',    color: 'bg-yellow-100 text-yellow-700' },
  { value: 'en_transito',       label: 'En tránsito',        color: 'bg-orange-100 text-orange-700' },
  { value: 'recibido_cedis',    label: 'Recibido en CEDIS',  color: 'bg-teal-100 text-teal-700' },
  { value: 'ingresado_almacen', label: 'Ingresado almacén',  color: 'bg-purple-100 text-purple-700' },
  { value: 'disponible',        label: 'Disponible',         color: 'bg-indigo-100 text-indigo-700' },
  { value: 'surtido',           label: 'Surtido',            color: 'bg-cyan-100 text-cyan-700' },
  { value: 'facturado',         label: 'Facturado',          color: 'bg-green-200 text-green-800' },
  { value: 'cancelado',         label: 'Cancelado',          color: 'bg-gray-100 text-gray-400' },
]

const ACTIVE_ESTATUS = ['aceptado','asignado_pedido','solicitud_cedis','en_transito',
  'recibido_cedis','ingresado_almacen','disponible','surtido']
const DONE_ESTATUS = ['facturado','cancelado','rechazado']

const estatusColor = (e: string) => ITEM_ESTATUS.find(x => x.value === e)?.color ?? 'bg-gray-100 text-gray-500'
const estatusLabel = (e: string) => ITEM_ESTATUS.find(x => x.value === e)?.label ?? e

export default function CrmOfferItemsTrackingPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [search, setSearch] = useState('')
  const [filterEstatus, setFilterEstatus] = useState('')
  const [filterCliente, setFilterCliente] = useState('')

  // Selección batch
  const [selected, setSelected] = useState<string[]>([])
  const [batchEstatus, setBatchEstatus] = useState('solicitud_cedis')
  const [batchComentario, setBatchComentario] = useState('')
  const [batchFactura, setBatchFactura] = useState('')
  const [savingBatch, setSavingBatch] = useState(false)

  // CEDIS inline
  const [cedisItemId, setCedisItemId] = useState<string | null>(null)
  const [cedisForm, setCedisForm] = useState({
    centro_origen: '', almacen_origen: '',
    centro_destino: '', almacen_destino: '',
    cantidad: '', um: '', comentarios: '',
  })
  const [savingCedis, setSavingCedis] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_offer_items')
      .select(`
        *,
        crm_offers(
          id, estatus, tipo,
          crm_clients(id, solicitante)
        )
      `)
      .not('crm_offers.estatus', 'in', '("cerrada","cancelado")')
      .order('updated_at', { ascending: false })
    setItems(data?.filter(i => i.crm_offers) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visibleItems = items.filter(i => {
    if (!showDone && DONE_ESTATUS.includes(i.estatus)) return false
    if (filterEstatus && i.estatus !== filterEstatus) return false
    if (filterCliente && i.crm_offers?.crm_clients?.solicitante !== filterCliente) return false
    if (search) {
      const s = search.toLowerCase()
      return i.material?.toLowerCase().includes(s) ||
        i.descripcion?.toLowerCase().includes(s) ||
        i.numero_pedido?.toLowerCase().includes(s) ||
        i.crm_offers?.crm_clients?.solicitante?.toLowerCase().includes(s)
    }
    return true
  })

  const clientes = [...new Set(items
    .map(i => i.crm_offers?.crm_clients?.solicitante)
    .filter(Boolean)
  )].sort()

  const toggleItem = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleAll = () =>
    setSelected(prev => prev.length === visibleItems.length ? [] : visibleItems.map(i => i.id))

  const applyBatch = async () => {
    if (selected.length === 0) return
    setSavingBatch(true)
    const user = await getCachedUser()
    const updates: any = { estatus: batchEstatus }
    if (batchEstatus === 'facturado' && batchFactura) {
      updates.numero_factura = batchFactura
      updates.fecha_factura = new Date().toISOString().split('T')[0]
    }

    for (const id of selected) {
      const item = items.find(i => i.id === id)
      await supabase.from('crm_offer_items').update(updates).eq('id', id)
      await supabase.from('crm_offer_item_history').insert({
        item_id: id,
        estatus_anterior: item?.estatus,
        estatus_nuevo: batchEstatus,
        comentario: batchComentario || null,
        created_by: user?.id,
      })
    }

    toast.success(`${selected.length} material(es) actualizados a "${estatusLabel(batchEstatus)}"`)
    setSelected([])
    setBatchComentario('')
    setBatchFactura('')
    load()
    setSavingBatch(false)
  }

  const openCedis = (item: any) => {
    setCedisItemId(item.id)
    setCedisForm({
      centro_origen:   item.centro_origen ?? '',
      almacen_origen:  item.almacen_origen ?? '',
      centro_destino:  item.centro_destino ?? '',
      almacen_destino: item.almacen_destino ?? '',
      cantidad:        String(item.cantidad_ofertada ?? ''),
      um:              item.um ?? '',
      comentarios:     '',
    })
  }

  const saveCedis = async () => {
    if (!cedisItemId) return
    if (!cedisForm.centro_origen || !cedisForm.centro_destino || !cedisForm.cantidad)
      return toast.error('Centro origen, destino y cantidad son obligatorios')

    setSavingCedis(true)
    const user = await getCachedUser()
    const item = items.find(i => i.id === cedisItemId)!
    const lotes = typeof item.lotes === 'string' ? JSON.parse(item.lotes) : (item.lotes ?? [])
    const primerLote = lotes[0] ?? {}

    // Buscar o crear pedido CRM
    let orderId: string | null = null
    const pedidoNum = item.numero_pedido ?? `OFR-${item.offer_id?.slice(0,8)}`
    const clientId = item.crm_offers?.crm_clients?.id

    const { data: existingOrder } = await supabase.from('crm_orders')
      .select('id').eq('client_id', clientId).eq('numero_pedido', pedidoNum).single()
    if (existingOrder) {
      orderId = existingOrder.id
    } else {
      const { data: newOrder } = await supabase.from('crm_orders').insert({
        client_id: clientId, numero_pedido: pedidoNum,
        estatus: 'en_proceso', comentarios: `Oferta CRM — ${item.material}`,
        created_by: user?.id,
      }).select('id').single()
      orderId = newOrder?.id ?? null
    }

    const autoComment = cedisForm.comentarios ||
      `Pedido ${item.numero_pedido ?? 'pendiente'} / oferta CRM`

    const { data: cedisReq } = await supabase.from('crm_cedis_requests').insert({
      order_id: orderId,
      fecha_solicitud: new Date().toISOString().split('T')[0],
      centro_origen:   cedisForm.centro_origen,
      almacen_origen:  cedisForm.almacen_origen || null,
      centro_destino:  cedisForm.centro_destino,
      almacen_destino: cedisForm.almacen_destino || null,
      codigo:      item.material,
      descripcion: item.descripcion,
      cantidad:    parseFloat(cedisForm.cantidad),
      um:          cedisForm.um || null,
      lote:            primerLote.lote || null,
      fecha_caducidad: primerLote.fecha_caducidad || null,
      comentarios: autoComment,
      cantidad_recibida: 0,
      cantidad_pendiente: parseFloat(cedisForm.cantidad),
      estatus: 'solicitado',
      created_by: user?.id,
    }).select('id').single()

    if (cedisReq) {
      await supabase.from('crm_cedis_history').insert({
        request_id: cedisReq.id, estatus_nuevo: 'solicitado',
        comentario: 'Creado desde seguimiento de materiales', created_by: user?.id,
      })
      await supabase.from('crm_offer_items').update({
        cedis_request_id: cedisReq.id,
        requiere_traslado: true,
        estatus: 'solicitud_cedis',
        centro_origen:   cedisForm.centro_origen,
        almacen_origen:  cedisForm.almacen_origen,
        centro_destino:  cedisForm.centro_destino,
        almacen_destino: cedisForm.almacen_destino,
      }).eq('id', cedisItemId)
      await supabase.from('crm_offer_item_history').insert({
        item_id: cedisItemId, estatus_anterior: item.estatus,
        estatus_nuevo: 'solicitud_cedis',
        comentario: `CEDIS: ${cedisForm.centro_origen} → ${cedisForm.centro_destino}`,
        created_by: user?.id,
      })
      toast.success('Solicitud CEDIS generada')
      setCedisItemId(null)
      load()
    }
    setSavingCedis(false)
  }

  // Contadores para resumen
  const countByEstatus = ITEM_ESTATUS.reduce((acc, e) => {
    acc[e.value] = items.filter(i => i.estatus === e.value).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/crm" className="text-sm text-gray-400 hover:text-gray-600">← CRM</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Materiales en proceso</h1>
          </div>
          <p className="text-sm text-gray-400">
            {visibleItems.length} materiales visibles
            {selected.length > 0 && ` · ${selected.length} seleccionados`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/crm/materials"
            className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">
            Ver tránsitos CEDIS →
          </Link>
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showDone}
              onChange={e => setShowDone(e.target.checked)} />
            Ver facturados/cancelados
          </label>
        </div>
      </div>

      {/* Resumen por estatus */}
      <div className="flex gap-2 flex-wrap mb-4">
        {ITEM_ESTATUS.filter(e => countByEstatus[e.value] > 0).map(e => (
          <button key={e.value}
            onClick={() => setFilterEstatus(filterEstatus === e.value ? '' : e.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              filterEstatus === e.value
                ? 'border-teal-400 bg-teal-50 text-teal-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}>
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${e.color}`}>
              {countByEstatus[e.value]}
            </span>
            {e.label}
          </button>
        ))}
        {filterEstatus && (
          <button onClick={() => setFilterEstatus('')}
            className="text-xs text-red-400 hover:text-red-600 px-2">
            Limpiar ×
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3 flex gap-2 flex-wrap items-center">
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 flex-1 min-w-48"
          placeholder="Buscar material, pedido, cliente..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
          value={filterCliente} onChange={e => setFilterCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
        {!loading && visibleItems.length === 0 && (
          <p className="text-sm text-gray-400 p-8 text-center">No hay materiales con estos filtros.</p>
        )}
        {!loading && visibleItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 border-b border-gray-200 w-8">
                    <input type="checkbox"
                      checked={selected.length === visibleItems.length && visibleItems.length > 0}
                      onChange={toggleAll} />
                  </th>
                  {['Material','Descripción','Cliente','Pedido','Cantidad','Precio','UM',
                    'Lote / Cad.','Estatus','Factura','Acciones'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map(item => {
                  const lotes = typeof item.lotes === 'string'
                    ? JSON.parse(item.lotes) : (item.lotes ?? [])
                  const lote = lotes[0] ?? {}
                  const isDone = DONE_ESTATUS.includes(item.estatus)
                  const isSelected = selected.includes(item.id)
                  const isCedisOpen = cedisItemId === item.id

                  return (
                    <>
                      <tr key={item.id}
                        className={`border-b border-gray-100 transition ${
                          isSelected ? 'bg-teal-50' :
                          isCedisOpen ? 'bg-amber-50' :
                          isDone ? 'opacity-40 bg-gray-50' : 'hover:bg-gray-50'
                        }`}>
                        <td className="px-3 py-2 text-center">
                          {!isDone && (
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleItem(item.id)} />
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">
                          {item.aceptado && <span className="text-green-500 mr-1">✓</span>}
                          {item.material}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{item.descripcion}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link to={`/crm/${item.crm_offers?.crm_clients?.id}`}
                            className="text-teal-600 hover:underline font-medium text-xs">
                            {item.crm_offers?.crm_clients?.solicitante}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {item.numero_pedido ?? <span className="text-gray-300 italic">pendiente</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{item.cantidad_ofertada ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {item.precio_oferta ? `$${Number(item.precio_oferta).toLocaleString('es-MX')}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{item.um ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {lote.lote
                            ? `${lote.lote}${lote.fecha_caducidad ? ` / ${lote.fecha_caducidad}` : ''}`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${estatusColor(item.estatus)}`}>
                            {estatusLabel(item.estatus)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {item.numero_factura ?? '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex gap-1">
                            {/* Botón CEDIS inline */}
                            {item.estatus === 'aceptado' && (
                              <button
                                onClick={() => isCedisOpen ? setCedisItemId(null) : openCedis(item)}
                                className={`text-xs px-2 py-1 rounded-lg font-medium transition ${
                                  isCedisOpen
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100'
                                }`}>
                                🚚 CEDIS
                              </button>
                            )}
                            <Link
                              to={`/crm/${item.crm_offers?.crm_clients?.id}/offer/${item.offer_id}`}
                              className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-200">
                              Ver oferta
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {/* Formulario CEDIS inline */}
                      {isCedisOpen && (
                        <tr key={`cedis-${item.id}`} className="bg-amber-50">
                          <td colSpan={12} className="px-5 py-4 border-b border-amber-200">
                            <div className="max-w-3xl">
                              <p className="text-xs font-bold text-amber-700 mb-3">
                                🚚 Solicitud de traslado CEDIS — {item.material}
                              </p>
                              <div className="grid grid-cols-4 gap-3 mb-3">
                                {[
                                  { label: 'Centro Origen *', key: 'centro_origen' },
                                  { label: 'Almacén Origen', key: 'almacen_origen' },
                                  { label: 'Centro Destino *', key: 'centro_destino' },
                                  { label: 'Almacén Destino', key: 'almacen_destino' },
                                  { label: 'Cantidad *', key: 'cantidad', type: 'number' },
                                  { label: 'UM', key: 'um' },
                                  { label: 'Comentario', key: 'comentarios' },
                                ].map(f => (
                                  <div key={f.key}>
                                    <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                                    <input type={f.type ?? 'text'}
                                      className="w-full border border-amber-200 rounded-lg px-3 py-1.5 text-sm bg-white outline-none focus:border-amber-400"
                                      value={cedisForm[f.key as keyof typeof cedisForm]}
                                      onChange={e => setCedisForm(x => ({ ...x, [f.key]: e.target.value }))} />
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={saveCedis} disabled={savingCedis}
                                  className="bg-amber-500 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50">
                                  {savingCedis ? 'Guardando...' : 'Crear solicitud CEDIS'}
                                </button>
                                <button onClick={() => setCedisItemId(null)}
                                  className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-200">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Barra de acción batch */}
        {selected.length > 0 && (
          <div className="px-5 py-4 bg-teal-50 border-t border-teal-200">
            <p className="text-sm font-semibold text-teal-700 mb-3">
              Actualizar {selected.length} material(es) seleccionado(s)
            </p>
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nuevo estatus</label>
                <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  value={batchEstatus} onChange={e => setBatchEstatus(e.target.value)}>
                  {ITEM_ESTATUS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {batchEstatus === 'facturado' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Número de factura</label>
                  <input
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Ej: F-00123"
                    value={batchFactura} onChange={e => setBatchFactura(e.target.value)} />
                </div>
              )}
              <div className="flex-1 min-w-48">
                <label className="text-xs text-gray-500 block mb-1">Comentario (opcional)</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  placeholder="Comentario para el historial..."
                  value={batchComentario} onChange={e => setBatchComentario(e.target.value)} />
              </div>
              <button onClick={applyBatch} disabled={savingBatch}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {savingBatch ? 'Guardando...' : 'Aplicar cambio'}
              </button>
              <button onClick={() => setSelected([])}
                className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Deseleccionar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
