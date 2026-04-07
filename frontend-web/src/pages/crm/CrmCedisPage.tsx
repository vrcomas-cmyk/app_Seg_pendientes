import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getCachedUser } from '../../lib/supabase'
import toast from 'react-hot-toast'
import CedisTable from '../../components/CedisTable'

export default function CrmCedisPage() {
  const { clientId, orderId } = useParams()
  const nav = useNavigate()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState<any[]>([])

  const emptyForm = {
    centro_origen: '', almacen_origen: '',
    centro_destino: '', almacen_destino: '',
    codigo: '', descripcion: '', cantidad: '',
    um: '', lote: '', fecha_caducidad: '',
    comentarios: '', condicion: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    const { data: o } = await supabase
      .from('crm_orders')
      .select('*, crm_order_items(*, crm_materials(*))')
      .eq('id', orderId).single()
    setOrder(o)
    setItems(o?.crm_order_items ?? [])

    const { data: r } = await supabase
      .from('crm_cedis_requests')
      .select('*, crm_cedis_history(*)')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
    setRequests(r ?? [])
  }

  useEffect(() => { load() }, [orderId])

  // Auto-generar comentario según condición y número de pedido
  const generateComment = (condicion: string, numeroPedido: string) => {
    const map: Record<string, string> = {
      corta_caducidad: 'Corta caducidad',
      danado: 'Dañado',
      obsoleto: 'Material Obsoleto',
      otro: 'Otro',
    }
    const prefix = map[condicion] ?? 'Material Obsoleto'
    return numeroPedido ? `${prefix} // Pedido ${numeroPedido}` : prefix
  }

  const handleCondicionChange = (condicion: string) => {
    const comentario = generateComment(condicion, order?.numero_pedido ?? '')
    setForm(f => ({ ...f, condicion, comentarios: comentario }))
  }

  // Pre-llenar desde un item del pedido
  const fillFromItem = (item: any) => {
    const mat = item.crm_materials
    const comentario = generateComment(mat?.condicion ?? 'obsoleto', order?.numero_pedido ?? '')
    setForm({
      centro_origen: '', almacen_origen: '',
      centro_destino: '', almacen_destino: '',
      codigo:        mat?.material ?? '',
      descripcion:   mat?.descripcion ?? '',
      cantidad:      item.cantidad?.toString() ?? '',
      um:            item.um ?? '',
      lote:          mat?.lote ?? '',
      fecha_caducidad: mat?.caducidad ?? '',
      comentarios:   comentario,
      condicion:     mat?.condicion ?? 'obsoleto',
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.centro_origen || !form.centro_destino || !form.codigo || !form.cantidad) {
      return toast.error('Completa los campos obligatorios: origen, destino, código y cantidad')
    }
    setLoading(true)
    const user = await getCachedUser()

    const { data: req, error } = await supabase.from('crm_cedis_requests').insert({
      order_id:        orderId,
      fecha_solicitud: new Date().toISOString().split('T')[0],
      centro_origen:   form.centro_origen,
      almacen_origen:  form.almacen_origen || null,
      centro_destino:  form.centro_destino,
      almacen_destino: form.almacen_destino || null,
      codigo:          form.codigo,
      descripcion:     form.descripcion || null,
      cantidad:        parseFloat(form.cantidad),
      um:              form.um || null,
      lote:            form.lote || null,
      fecha_caducidad: form.fecha_caducidad || null,
      comentarios:     form.comentarios || null,
      estatus:         'solicitado',
      created_by:      user?.id,
    }).select().single()

    if (error) {
      toast.error(error.message)
    } else {
      // Entrada inicial en historial
      await supabase.from('crm_cedis_history').insert({
        request_id:      req.id,
        estatus_anterior: null,
        estatus_nuevo:   'solicitado',
        comentario:      'Requerimiento creado',
        created_by:      user?.id,
      })
      toast.success('Requerimiento CEDIS generado')
      setForm(emptyForm)
      setShowForm(false)
      load()
    }
    setLoading(false)
  }

  const updateEstatus = async (reqId: string, estatusActual: string, nuevoEstatus: string, comentario: string) => {
    const user = await getCachedUser()
    await supabase.from('crm_cedis_requests').update({ estatus: nuevoEstatus }).eq('id', reqId)
    await supabase.from('crm_cedis_history').insert({
      request_id:      reqId,
      estatus_anterior: estatusActual,
      estatus_nuevo:   nuevoEstatus,
      comentario:      comentario || `Cambio a ${nuevoEstatus}`,
      created_by:      user?.id,
    })
    load()
  }

  const ESTATUS_FLOW = ['solicitado', 'en_revision', 'aprobado', 'en_transito', 'recibido']
  const ESTATUS_COLOR: Record<string, string> = {
    solicitado:  'bg-yellow-100 text-yellow-700',
    en_revision: 'bg-blue-100 text-blue-700',
    aprobado:    'bg-purple-100 text-purple-700',
    en_transito: 'bg-orange-100 text-orange-700',
    recibido:    'bg-green-100 text-green-700',
    cancelado:   'bg-gray-100 text-gray-500',
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => nav(`/crm/${clientId}`)}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver al cliente
      </button>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Requerimientos CEDIS</h1>
          {order && (
            <p className="text-sm text-gray-400 mt-1">
              Pedido: <span className="font-semibold text-gray-600">{order.numero_pedido}</span>
              {' · '}Estatus: <span className="font-medium">{order.estatus}</span>
            </p>
          )}
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          + Nuevo requerimiento
        </button>
        {order && (
          <CedisTable
            orderId={orderId!}
            numeroPedido={order.numero_pedido}
            onRefresh={load} />
        )}
      </div>

      {/* Pre-llenar desde materiales del pedido */}
      {items.length > 0 && !showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-medium text-blue-700 mb-3">
            Materiales del pedido — haz clic para pre-llenar el formulario:
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map(item => (
              <button key={item.id} onClick={() => fillFromItem(item)}
                className="bg-white border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-100">
                {item.crm_materials?.material} — {item.cantidad} {item.um}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Formulario nuevo requerimiento */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-700 mb-4">Nuevo requerimiento</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Centro Origen *</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.centro_origen} onChange={e => setForm(f => ({ ...f, centro_origen: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Almacén Origen</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.almacen_origen} onChange={e => setForm(f => ({ ...f, almacen_origen: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Centro Destino *</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.centro_destino} onChange={e => setForm(f => ({ ...f, centro_destino: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Almacén Destino</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.almacen_destino} onChange={e => setForm(f => ({ ...f, almacen_destino: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Código *</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cantidad *</label>
              <input type="number" min="0" step="0.001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">UM</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                placeholder="Ej. PZA, KG, LT"
                value={form.um} onChange={e => setForm(f => ({ ...f, um: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Lote</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Fecha Caducidad</label>
              <input type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.fecha_caducidad} onChange={e => setForm(f => ({ ...f, fecha_caducidad: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Condición del material</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
                value={form.condicion} onChange={e => handleCondicionChange(e.target.value)}>
                <option value="">Sin condición especial</option>
                <option value="corta_caducidad">Corta caducidad</option>
                <option value="danado">Dañado</option>
                <option value="obsoleto">Material Obsoleto</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">
                Comentarios
                <span className="text-teal-600 ml-2">(auto-generado según condición y pedido)</span>
              </label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form.comentarios} onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSubmit} disabled={loading}
              className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {loading ? 'Guardando...' : 'Crear requerimiento'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(emptyForm) }}
              className="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de requerimientos */}
      {requests.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-400 text-sm">No hay requerimientos CEDIS para este pedido.</p>
          <button onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-teal-600 hover:text-teal-700 font-medium">
            Crear el primero
          </button>
        </div>
      )}

      {requests.map(req => {
        const nextEstatus = ESTATUS_FLOW[ESTATUS_FLOW.indexOf(req.estatus) + 1]
        return (
          <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-800">{req.codigo}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ESTATUS_COLOR[req.estatus]}`}>
                    {req.estatus.replace('_', ' ')}
                  </span>
                </div>
                {req.descripcion && <p className="text-sm text-gray-500">{req.descripcion}</p>}
              </div>
              <p className="text-xs text-gray-400">{req.fecha_solicitud}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs text-gray-500 mb-3">
              <p><span className="font-medium">Origen:</span> {req.centro_origen}{req.almacen_origen ? ` / ${req.almacen_origen}` : ''}</p>
              <p><span className="font-medium">Destino:</span> {req.centro_destino}{req.almacen_destino ? ` / ${req.almacen_destino}` : ''}</p>
              <p><span className="font-medium">Cantidad:</span> {req.cantidad} {req.um}</p>
              {req.lote && <p><span className="font-medium">Lote:</span> {req.lote}</p>}
              {req.fecha_caducidad && <p><span className="font-medium">Cad:</span> {req.fecha_caducidad}</p>}
              {req.comentarios && <p className="col-span-3"><span className="font-medium">Comentario:</span> {req.comentarios}</p>}
            </div>

            {/* Avanzar estatus */}
            {nextEstatus && req.estatus !== 'cancelado' && (
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button
                  onClick={() => {
                    const comentario = window.prompt(`Comentario para cambiar a "${nextEstatus}" (opcional):`) ?? ''
                    updateEstatus(req.id, req.estatus, nextEstatus, comentario)
                  }}
                  className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700">
                  Avanzar a: {nextEstatus.replace('_', ' ')}
                </button>
                <button
                  onClick={() => {
                    const comentario = window.prompt('Motivo de cancelación:') ?? ''
                    updateEstatus(req.id, req.estatus, 'cancelado', comentario)
                  }}
                  className="bg-red-50 text-red-600 px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100">
                  Cancelar
                </button>
              </div>
            )}

            {/* Historial del requerimiento */}
            {req.crm_cedis_history?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Historial</p>
                {req.crm_cedis_history.map((h: any) => (
                  <div key={h.id} className="text-xs text-gray-400 flex gap-2 mb-1">
                    <span>{new Date(h.created_at).toLocaleDateString('es-MX')}</span>
                    <span className="text-gray-300">·</span>
                    <span>{h.estatus_anterior ? `${h.estatus_anterior} → ` : ''}{h.estatus_nuevo}</span>
                    {h.comentario && <span className="text-gray-400">— {h.comentario}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
