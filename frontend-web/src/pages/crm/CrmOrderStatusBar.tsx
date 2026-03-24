import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const ESTATUS_FLOW = ['generado', 'confirmado', 'en_proceso', 'enviado', 'entregado']
const ORDER_COLOR: Record<string, string> = {
  generado:    'bg-yellow-100 text-yellow-700',
  confirmado:  'bg-blue-100 text-blue-700',
  en_proceso:  'bg-purple-100 text-purple-700',
  enviado:     'bg-orange-100 text-orange-700',
  entregado:   'bg-green-100 text-green-700',
  cancelado:   'bg-gray-100 text-gray-500',
}

interface Props {
  order: any
  onRefresh: () => void
}

export default function CrmOrderStatusBar({ order, onRefresh }: Props) {
  const [loading, setLoading] = useState(false)

  const nextEstatus = ESTATUS_FLOW[ESTATUS_FLOW.indexOf(order.estatus) + 1]
  const isOverdue = !['entregado', 'cancelado'].includes(order.estatus) &&
    new Date(order.created_at) < new Date(Date.now() - 7 * 86400000)

  const advance = async () => {
    if (!nextEstatus) return
    setLoading(true)
    await supabase.from('crm_orders').update({ estatus: nextEstatus }).eq('id', order.id)
    toast.success(`Pedido actualizado a: ${nextEstatus}`)
    onRefresh()
    setLoading(false)
  }

  const cancel = async () => {
    if (!window.confirm('¿Cancelar este pedido?')) return
    setLoading(true)
    await supabase.from('crm_orders').update({ estatus: 'cancelado' }).eq('id', order.id)
    toast.success('Pedido cancelado')
    onRefresh()
    setLoading(false)
  }

  return (
    <div className={`mt-2 p-3 rounded-lg border ${isOverdue ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ORDER_COLOR[order.estatus]}`}>
            {order.estatus}
          </span>
          {isOverdue && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              ⚠️ +7 días sin cerrar
            </span>
          )}
        </div>
        {order.estatus !== 'entregado' && order.estatus !== 'cancelado' && (
          <div className="flex gap-2">
            {nextEstatus && (
              <button onClick={advance} disabled={loading}
                className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50">
                {loading ? '...' : `→ ${nextEstatus}`}
              </button>
            )}
            <button onClick={cancel} disabled={loading}
              className="text-xs bg-red-50 text-red-500 px-3 py-1.5 rounded-lg font-medium hover:bg-red-100 disabled:opacity-50">
              Cancelar
            </button>
          </div>
        )}
        {order.estatus === 'entregado' && (
          <span className="text-xs text-green-600 font-medium">✅ Completado</span>
        )}
      </div>
    </div>
  )
}
