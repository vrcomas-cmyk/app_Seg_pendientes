import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function CrmOrderPage() {
  const { clientId, followupId } = useParams()
  const nav = useNavigate()
  const [client, setClient] = useState<any>(null)
  const [recipients, setRecipients] = useState<any[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    numero_pedido: '',
    recipient_id: '',
    comentarios: '',
  })
  const [quantities, setQuantities] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.from('crm_clients').select('*').eq('id', clientId).single()
      .then(({ data }) => setClient(data))
    supabase.from('crm_recipients').select('*').eq('client_id', clientId)
      .then(({ data }) => setRecipients(data ?? []))
    supabase.from('crm_materials').select('*')
      .eq('followup_id', followupId).eq('aceptado', true)
      .then(({ data }) => {
        setMaterials(data ?? [])
        // Inicializar cantidades
        const q: Record<string, string> = {}
        data?.forEach(m => { q[m.id] = '1' })
        setQuantities(q)
      })
  }, [clientId, followupId])

  const handleSubmit = async () => {
    if (!form.numero_pedido.trim()) return toast.error('Ingresa el número de pedido')
    if (materials.length === 0) return toast.error('No hay materiales aceptados')
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    // Crear pedido
    const { data: order, error } = await supabase.from('crm_orders').insert({
      followup_id:   followupId,
      client_id:     clientId,
      recipient_id:  form.recipient_id || null,
      numero_pedido: form.numero_pedido.trim(),
      comentarios:   form.comentarios || null,
      estatus:       'generado',
      created_by:    user?.id,
    }).select().single()

    if (error || !order) {
      toast.error(error?.message ?? 'Error al crear el pedido')
      setLoading(false)
      return
    }

    // Crear items del pedido
    const items = materials.map(m => ({
      order_id:    order.id,
      material_id: m.id,
      cantidad:    parseFloat(quantities[m.id] ?? '1'),
      precio_final: m.precio_ofertado,
    }))
    await supabase.from('crm_order_items').insert(items)

    toast.success(`Pedido ${form.numero_pedido} generado exitosamente`)
    nav(`/crm/${clientId}`)
  }

  const CONDICION_LABEL: Record<string, string> = {
    corta_caducidad: 'Corta caducidad',
    danado: 'Dañado',
    obsoleto: 'Material Obsoleto',
    otro: 'Otro',
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => nav(-1)}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver
      </button>

      <h1 className="text-xl font-bold text-gray-800 mb-1">Generar pedido</h1>
      {client && <p className="text-sm text-gray-400 mb-6">Cliente: {client.solicitante}</p>}

      {/* Materiales aceptados */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-700 mb-4">
          Materiales aceptados ({materials.length})
        </h2>
        {materials.length === 0 && (
          <p className="text-sm text-gray-400">
            No hay materiales marcados como aceptados en este seguimiento.
          </p>
        )}
        {materials.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-400 font-semibold py-2 pr-3">Material</th>
                  <th className="text-left text-xs text-gray-400 font-semibold py-2 pr-3">Condición</th>
                  <th className="text-left text-xs text-gray-400 font-semibold py-2 pr-3">Precio</th>
                  <th className="text-left text-xs text-gray-400 font-semibold py-2 pr-3">Caducidad</th>
                  <th className="text-left text-xs text-gray-400 font-semibold py-2">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {materials.map(m => (
                  <tr key={m.id} className="border-b border-gray-50">
                    <td className="py-3 pr-3">
                      <p className="font-medium text-gray-800">{m.material}</p>
                      {m.descripcion && <p className="text-xs text-gray-400">{m.descripcion}</p>}
                      {m.lote && <p className="text-xs text-gray-400">Lote: {m.lote}</p>}
                    </td>
                    <td className="py-3 pr-3">
                      {m.condicion ? (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          {CONDICION_LABEL[m.condicion] ?? m.condicion}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3 pr-3 text-gray-600">
                      {m.precio_ofertado
                        ? `$${Number(m.precio_ofertado).toLocaleString('es-MX')}`
                        : '—'}
                    </td>
                    <td className="py-3 pr-3 text-gray-500 text-xs">
                      {m.caducidad ?? '—'}
                    </td>
                    <td className="py-3">
                      <input
                        type="number" min="0.001" step="0.001"
                        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-teal-400"
                        value={quantities[m.id] ?? '1'}
                        onChange={e => setQuantities(q => ({ ...q, [m.id]: e.target.value }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Datos del pedido */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-700 mb-4">Datos del pedido</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Número de pedido *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400"
              placeholder="Ej. 1801005997"
              value={form.numero_pedido}
              onChange={e => setForm(f => ({ ...f, numero_pedido: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Destinatario</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              value={form.recipient_id}
              onChange={e => setForm(f => ({ ...f, recipient_id: e.target.value }))}>
              <option value="">Sin destinatario</option>
              {recipients.map(r => (
                <option key={r.id} value={r.id}>{r.destinatario}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Comentarios</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm h-20 resize-none outline-none focus:border-teal-400"
              placeholder="Notas adicionales del pedido..."
              value={form.comentarios}
              onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))} />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={handleSubmit}
            disabled={loading || materials.length === 0 || !form.numero_pedido}
            className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Guardando...' : 'Confirmar pedido'}
          </button>
          <button
            onClick={() => nav(-1)}
            className="bg-gray-100 text-gray-600 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200">
            Cancelar
          </button>
        </div>
      </div>

      {/* Info: siguiente paso CEDIS */}
      {materials.some(m => m.condicion) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-700 font-medium mb-1">
            Algunos materiales requieren requerimiento CEDIS
          </p>
          <p className="text-xs text-amber-600">
            Después de confirmar el pedido podrás generar el requerimiento de traslado
            desde la ficha del cliente.
          </p>
        </div>
      )}
    </div>
  )
}
