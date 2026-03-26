import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const VENTA_ESTATUS = [
  { value: 'aceptado',          label: 'Aceptado',           color: 'bg-green-100 text-green-700' },
  { value: 'asignado_pedido',   label: 'Asignado en SAP',    color: 'bg-blue-100 text-blue-700' },
  { value: 'solicitud_cedis',   label: 'Solicitud CEDIS',    color: 'bg-yellow-100 text-yellow-700' },
  { value: 'en_transito',       label: 'En tránsito',        color: 'bg-orange-100 text-orange-700' },
  { value: 'recibido_cedis',    label: 'Recibido CEDIS',     color: 'bg-teal-100 text-teal-700' },
  { value: 'disponible',        label: 'Disponible',         color: 'bg-indigo-100 text-indigo-700' },
  { value: 'surtido',           label: 'Surtido',            color: 'bg-cyan-100 text-cyan-700' },
  { value: 'facturado',         label: 'Facturado',          color: 'bg-green-200 text-green-800' },
  { value: 'entregado',         label: 'Entregado',          color: 'bg-emerald-200 text-emerald-800' },
]

const DONE_ESTATUS = ['entregado']
const estatusColor = (e: string) => VENTA_ESTATUS.find(x => x.value === e)?.color ?? 'bg-gray-100 text-gray-500'
const estatusLabel = (e: string) => VENTA_ESTATUS.find(x => x.value === e)?.label ?? e

export default function CrmVentasPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [search, setSearch] = useState('')
  const [filterEstatus, setFilterEstatus] = useState('')
  const [filterCliente, setFilterCliente] = useState('')

  // Panel de detalle
  const [activeItem, setActiveItem] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  // Campos editables del panel
  const [newEstatus, setNewEstatus] = useState('')
  const [newFactura, setNewFactura] = useState('')
  const [newFolio, setNewFolio] = useState('')
  const [newComentario, setNewComentario] = useState('')

  // CEDIS inline
  const [showCedisForm, setShowCedisForm] = useState(false)
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
        crm_offers(id, tipo, estatus, crm_clients(id, solicitante))
      `)
      .eq('aceptado', true)
      .not('crm_offers.estatus', 'in', '("cancelado")')
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
        i.numero_factura?.toLowerCase().includes(s) ||
        i.crm_offers?.crm_clients?.solicitante?.toLowerCase().includes(s)
    }
    return true
  })

  const clientes = [...new Set(items.map(i => i.crm_offers?.crm_clients?.solicitante).filter(Boolean))].sort()

  const countByEstatus = VENTA_ESTATUS.reduce((acc, e) => {
    acc[e.value] = items.filter(i => i.estatus === e.value).length
    return acc
  }, {} as Record<string, number>)

  const openItem = (item: any) => {
    const parsed = { ...item, lotes: typeof item.lotes === 'string' ? JSON.parse(item.lotes) : (item.lotes ?? []) }
    setActiveItem(parsed)
    setNewEstatus(parsed.estatus)
    setNewFactura(parsed.numero_factura ?? '')
    setNewFolio(parsed.folio_entrega_salida ?? '')
    setNewComentario('')
    setShowCedisForm(false)
    setCedisForm({ centro_origen: parsed.centro_origen ?? '', almacen_origen: parsed.almacen_origen ?? '',
      centro_destino: parsed.centro_destino ?? '', almacen_destino: parsed.almacen_destino ?? '',
      cantidad: String(parsed.cantidad_ofertada ?? ''), um: parsed.um ?? '', comentarios: '' })
  }

  const saveUpdate = async () => {
    if (!activeItem) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const updates: any = { estatus: newEstatus }
    if (newFactura) { updates.numero_factura = newFactura; updates.fecha_factura = new Date().toISOString().split('T')[0] }
    if (newFolio)   { updates.folio_entrega_salida = newFolio; updates.fecha_entrega_salida = new Date().toISOString().split('T')[0] }
    if (newEstatus === 'entregado') {
      updates.entregado_cliente = true
      updates.fecha_confirmacion_entrega = new Date().toISOString().split('T')[0]
    }
    await supabase.from('crm_offer_items').update(updates).eq('id', activeItem.id)
    await supabase.from('crm_offer_item_history').insert({
      item_id: activeItem.id, estatus_anterior: activeItem.estatus,
      estatus_nuevo: newEstatus, comentario: newComentario || null, created_by: user?.id,
    })
    toast.success('Venta actualizada')
    setNewComentario('')
    await load()
    const { data: updated } = await supabase.from('crm_offer_items')
      .select('*, crm_offers(id, tipo, estatus, crm_clients(id, solicitante))')
      .eq('id', activeItem.id).single()
    if (updated) {
      const parsed = { ...updated, lotes: typeof updated.lotes === 'string' ? JSON.parse(updated.lotes) : (updated.lotes ?? []) }
      setActiveItem(parsed)
      setNewEstatus(parsed.estatus)
    }
    setSaving(false)
  }

  const saveCedis = async () => {
    if (!activeItem) return
    if (!cedisForm.centro_origen || !cedisForm.centro_destino || !cedisForm.cantidad)
      return toast.error('Centro origen, destino y cantidad son obligatorios')
    setSavingCedis(true)
    const { data: { user } } = await supabase.auth.getUser()
    const lotes = activeItem.lotes ?? []
    const primerLote = lotes[0] ?? {}
    const clientId = activeItem.crm_offers?.crm_clients?.id
    const pedidoNum = activeItem.numero_pedido ?? `VTA-${activeItem.id?.slice(0,8)}`

    let orderId: string | null = null
    const { data: existingOrder } = await supabase.from('crm_orders')
      .select('id').eq('client_id', clientId).eq('numero_pedido', pedidoNum).single()
    if (existingOrder) {
      orderId = existingOrder.id
    } else {
      const { data: newOrder } = await supabase.from('crm_orders').insert({
        client_id: clientId, numero_pedido: pedidoNum,
        estatus: 'en_proceso', comentarios: `Venta — ${activeItem.material}`,
        created_by: user?.id,
      }).select('id').single()
      orderId = newOrder?.id ?? null
    }

    const { data: req } = await supabase.from('crm_cedis_requests').insert({
      order_id:           orderId,
      fecha_solicitud:    new Date().toISOString().split('T')[0],
      centro_origen:      cedisForm.centro_origen,
      almacen_origen:     cedisForm.almacen_origen || null,
      centro_destino:     cedisForm.centro_destino,
      almacen_destino:    cedisForm.almacen_destino || null,
      codigo:             activeItem.material,
      descripcion:        activeItem.descripcion,
      cantidad:           parseFloat(cedisForm.cantidad),
      um:                 cedisForm.um || null,
      lote:               primerLote.lote || null,
      fecha_caducidad:    primerLote.fecha_caducidad || null,
      comentarios:        cedisForm.comentarios || `Pedido ${pedidoNum}`,
      cantidad_recibida:  0,
      cantidad_pendiente: parseFloat(cedisForm.cantidad),
      estatus:            'solicitado',
      created_by:         user?.id,
    }).select('id').single()

    if (req) {
      await supabase.from('crm_cedis_history').insert({
        request_id: req.id, estatus_nuevo: 'solicitado',
        comentario: 'Creado desde Ventas', created_by: user?.id,
      })
      await supabase.from('crm_offer_items').update({
        cedis_request_id: req.id, requiere_traslado: true,
        estatus: 'solicitud_cedis',
        centro_origen:   cedisForm.centro_origen, almacen_origen:  cedisForm.almacen_origen,
        centro_destino:  cedisForm.centro_destino, almacen_destino: cedisForm.almacen_destino,
      }).eq('id', activeItem.id)
      await supabase.from('crm_offer_item_history').insert({
        item_id: activeItem.id, estatus_anterior: activeItem.estatus,
        estatus_nuevo: 'solicitud_cedis',
        comentario: `CEDIS: ${cedisForm.centro_origen} → ${cedisForm.centro_destino}`,
        created_by: user?.id,
      })
      toast.success('Solicitud CEDIS generada — visible en Materiales en tránsito')
      setShowCedisForm(false)
      setNewEstatus('solicitud_cedis')
      await load()
      const { data: updatedItem } = await supabase.from('crm_offer_items')
        .select('*, crm_offers(id, tipo, estatus, crm_clients(id, solicitante))')
        .eq('id', activeItem.id).single()
      if (updatedItem) {
        const parsed = { ...updatedItem, lotes: typeof updatedItem.lotes === 'string' ? JSON.parse(updatedItem.lotes) : (updatedItem.lotes ?? []) }
        setActiveItem(parsed)
      }
    }
    setSavingCedis(false)
  }

  // Resumen
  const totalVentas      = items.length
  const facturados       = items.filter(i => ['facturado','entregado'].includes(i.estatus)).length
  const entregados       = items.filter(i => i.estatus === 'entregado').length
  const pendientes       = items.filter(i => !['facturado','entregado'].includes(i.estatus)).length
  const importeTotal     = items.filter(i => i.precio_oferta && i.cantidad_ofertada)
    .reduce((acc, i) => acc + (Number(i.precio_oferta) * Number(i.cantidad_ofertada)), 0)
  const importeFacturado = items.filter(i => ['facturado','entregado'].includes(i.estatus) && i.precio_oferta && i.cantidad_ofertada)
    .reduce((acc, i) => acc + (Number(i.precio_oferta) * Number(i.cantidad_ofertada)), 0)

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/crm" className="text-sm text-gray-400 hover:text-gray-600">← CRM</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Ventas</h1>
          </div>
          <p className="text-sm text-gray-400">Materiales aceptados en proceso de surtido y facturación</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 w-56"
            placeholder="Buscar material, pedido, factura..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showDone}
              onChange={e => setShowDone(e.target.checked)} />
            Ver entregados
          </label>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Total ventas',      value: totalVentas,  color: 'border-gray-200' },
          { label: 'Pendientes',        value: pendientes,   color: 'border-yellow-200 bg-yellow-50' },
          { label: 'Facturados',        value: facturados,   color: 'border-green-200 bg-green-50' },
          { label: 'Entregados',        value: entregados,   color: 'border-emerald-200 bg-emerald-50' },
          { label: 'Importe pendiente',
            value: `$${(importeTotal - importeFacturado).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`,
            color: 'border-orange-200 bg-orange-50' },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl border p-4 ${s.color}`}>
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className="text-xl font-bold text-gray-800">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros por estatus */}
      <div className="flex gap-2 flex-wrap mb-4 items-center">
        {VENTA_ESTATUS.filter(e => (countByEstatus[e.value] ?? 0) > 0).map(e => (
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
        <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white ml-auto"
          value={filterCliente} onChange={e => setFilterCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {clientes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterEstatus || filterCliente) && (
          <button onClick={() => { setFilterEstatus(''); setFilterCliente('') }}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2">
            Limpiar ×
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {/* Tabla */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
            {!loading && visibleItems.length === 0 && (
              <div className="p-10 text-center">
                <p className="text-gray-400 text-sm">No hay ventas activas.</p>
                <p className="text-xs text-gray-300 mt-1">
                  Los materiales aparecen aquí cuando se marcan como aceptados en una oferta.
                </p>
              </div>
            )}
            {!loading && visibleItems.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Cliente','Material','Descripción','Pedido','Cant.','Precio','UM',
                        'Lote / Cad.','Folio Salida','Factura','Estatus',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map(item => {
                      const lotes = typeof item.lotes === 'string' ? JSON.parse(item.lotes) : (item.lotes ?? [])
                      const lote = lotes[0] ?? {}
                      const isActive = activeItem?.id === item.id
                      const isDone = DONE_ESTATUS.includes(item.estatus)
                      return (
                        <tr key={item.id}
                          onClick={() => openItem(item)}
                          className={`border-b border-gray-100 cursor-pointer transition ${
                            isActive ? 'bg-teal-50' :
                            isDone ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'
                          }`}>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Link to={`/crm/${item.crm_offers?.crm_clients?.id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-teal-600 hover:underline text-xs font-medium">
                              {item.crm_offers?.crm_clients?.solicitante}
                            </Link>
                          </td>
                          <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{item.material}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{item.descripcion}</td>
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                            {item.numero_pedido ?? <span className="text-gray-300 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">{item.cantidad_ofertada ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {item.precio_oferta ? `$${Number(item.precio_oferta).toLocaleString('es-MX')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{item.um ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {lote.lote ? `${lote.lote}${lote.fecha_caducidad ? ` / ${lote.fecha_caducidad}` : ''}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{item.folio_entrega_salida ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {item.numero_factura
                              ? <span className="text-green-700 font-medium">{item.numero_factura}</span>
                              : '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full font-medium ${estatusColor(item.estatus)}`}>
                              {estatusLabel(item.estatus)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-teal-600 text-xs font-medium">
                            {isActive ? '▶' : '›'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Panel lateral */}
        {activeItem && (
          <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col"
            style={{ maxHeight: '80vh' }}>
            {/* Header panel */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 sticky top-0">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-gray-800">{activeItem.material}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{activeItem.descripcion}</p>
                  <Link to={`/crm/${activeItem.crm_offers?.crm_clients?.id}`}
                    className="text-xs text-teal-600 hover:underline mt-1 block">
                    {activeItem.crm_offers?.crm_clients?.solicitante}
                  </Link>
                </div>
                <button onClick={() => setActiveItem(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg ml-2">×</button>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-2 inline-block ${estatusColor(activeItem.estatus)}`}>
                {estatusLabel(activeItem.estatus)}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Info */}
              <div className="space-y-1.5">
                <p><span className="text-gray-400">Pedido:</span> <span className="font-medium">{activeItem.numero_pedido ?? '—'}</span></p>
                <p><span className="text-gray-400">Cantidad:</span> <span className="font-medium">{activeItem.cantidad_ofertada ?? '—'} {activeItem.um}</span></p>
                <p><span className="text-gray-400">Precio:</span> <span className="font-medium">
                  {activeItem.precio_oferta ? `$${Number(activeItem.precio_oferta).toLocaleString('es-MX')}` : '—'}
                </span></p>
                {(activeItem.lotes ?? []).length > 0 && (
                  <div>
                    <p className="text-gray-400 mb-0.5">Lotes:</p>
                    {(activeItem.lotes ?? []).map((l: any, i: number) => (
                      <p key={i} className="font-medium">{l.lote}{l.fecha_caducidad ? ` · Cad: ${l.fecha_caducidad}` : ''}</p>
                    ))}
                  </div>
                )}
                {activeItem.numero_factura && (
                  <p><span className="text-gray-400">Factura:</span> <span className="font-medium text-green-700">{activeItem.numero_factura}</span></p>
                )}
                {activeItem.folio_entrega_salida && (
                  <p><span className="text-gray-400">Folio salida:</span> <span className="font-medium text-blue-600">{activeItem.folio_entrega_salida}</span></p>
                )}
                {activeItem.entregado_cliente && (
                  <p className="text-emerald-600 font-semibold">✓ Entregado al cliente</p>
                )}
                {activeItem.cedis_request_id && (
                  <button onClick={() => nav('/crm/materials')}
                    className="text-xs text-amber-600 hover:underline block">
                    🚚 Ver en Materiales en tránsito →
                  </button>
                )}
              </div>

              {/* Solicitar CEDIS */}
              {['aceptado','asignado_pedido'].includes(activeItem.estatus) && (
                <div className="border-t border-gray-100 pt-3">
                  <button onClick={() => setShowCedisForm(!showCedisForm)}
                    className={`w-full py-2 rounded-lg text-xs font-medium transition ${
                      showCedisForm
                        ? 'bg-amber-500 text-white'
                        : 'border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                    }`}>
                    🚚 {showCedisForm ? 'Cancelar CEDIS' : 'Solicitar traslado CEDIS'}
                  </button>

                  {showCedisForm && (
                    <div className="mt-2 space-y-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                      {[
                        { label: 'Centro Origen *', key: 'centro_origen' },
                        { label: 'Almacén Origen',  key: 'almacen_origen' },
                        { label: 'Centro Destino *', key: 'centro_destino' },
                        { label: 'Almacén Destino',  key: 'almacen_destino' },
                        { label: 'Cantidad *',       key: 'cantidad', type: 'number' },
                        { label: 'UM',               key: 'um' },
                        { label: 'Comentario',       key: 'comentarios' },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="text-xs text-gray-500 block mb-0.5">{f.label}</label>
                          <input type={f.type ?? 'text'}
                            className="w-full border border-amber-200 rounded-lg px-2 py-1.5 text-xs bg-white outline-none focus:border-amber-400"
                            value={cedisForm[f.key as keyof typeof cedisForm]}
                            onChange={e => setCedisForm(x => ({ ...x, [f.key]: e.target.value }))} />
                        </div>
                      ))}
                      <button onClick={saveCedis} disabled={savingCedis}
                        className="w-full bg-amber-500 text-white py-2 rounded-lg text-xs font-medium hover:bg-amber-600 disabled:opacity-50">
                        {savingCedis ? 'Guardando...' : 'Crear solicitud CEDIS'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Actualizar estatus */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Actualizar venta</p>
                <div>
                  <label className="text-gray-500 block mb-1">Estatus</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                    value={newEstatus} onChange={e => setNewEstatus(e.target.value)}>
                    {VENTA_ESTATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-500 block mb-1">Folio de entrega de salida (SAP)</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Ej: 80001234 (opcional)"
                    value={newFolio} onChange={e => setNewFolio(e.target.value)} />
                </div>
                {(newEstatus === 'facturado' || newEstatus === 'entregado') && (
                  <div>
                    <label className="text-gray-500 block mb-1">Número de factura</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                      placeholder="Ej: F-001234"
                      value={newFactura} onChange={e => setNewFactura(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="text-gray-500 block mb-1">Comentario (opcional)</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-14 resize-none outline-none focus:border-teal-400"
                    placeholder="Notas del seguimiento..."
                    value={newComentario} onChange={e => setNewComentario(e.target.value)} />
                </div>
                <button onClick={saveUpdate} disabled={saving}
                  className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>

              {/* Links */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <Link to={`/crm/${activeItem.crm_offers?.crm_clients?.id}/offer/${activeItem.offer_id}`}
                  className="block text-xs text-teal-600 hover:underline">
                  Ver oferta original →
                </Link>
                <Link to={`/crm/${activeItem.crm_offers?.crm_clients?.id}`}
                  className="block text-xs text-teal-600 hover:underline">
                  Ver ficha del cliente →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
