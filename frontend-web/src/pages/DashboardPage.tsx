import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

export default function DashboardPage() {
  const [stats, setStats] = useState({ active: 0, overdue: 0, completed: 0 })
  const [recent, setRecent] = useState<any[]>([])
  const [overdueOrders, setOverdueOrders] = useState<any[]>([])
  const [overdueCedis, setOverdueCedis] = useState<any[]>([])
  const [overdueFollowups, setOverdueFollowups] = useState<any[]>([])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

    Promise.all([
      // Stats pendientes
      supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'reactivado']),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'reactivado']).lt('due_date', today),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completado'),
      // Pendientes recientes
      supabase.from('tasks').select('*').in('status', ['pendiente', 'reactivado']).order('due_date').limit(5),
      // Pedidos sin cerrar +7 días
      supabase.from('crm_orders').select('*, crm_clients(solicitante)')
        .not('estatus', 'in', '("entregado","cancelado")')
        .lt('created_at', sevenDaysAgo),
      // CEDIS sin cerrar +7 días
      supabase.from('crm_cedis_requests').select('*, crm_orders(numero_pedido)')
        .not('estatus', 'in', '("recibido","cancelado")')
        .lt('created_at', sevenDaysAgo),
      // Seguimientos CRM vencidos
      supabase.from('crm_followups').select('*, crm_clients(id, solicitante)')
        .not('estatus', 'in', '("completado","cancelado")')
        .lt('fecha_seguimiento', today)
        .not('fecha_seguimiento', 'is', null),
    ]).then(([active, overdue, completed, recentRes, orders, cedis, followups]) => {
      setStats({ active: active.count ?? 0, overdue: overdue.count ?? 0, completed: completed.count ?? 0 })
      setRecent(recentRes.data ?? [])
      setOverdueOrders(orders.data ?? [])
      setOverdueCedis(cedis.data ?? [])
      setOverdueFollowups(followups.data ?? [])
    })
  }, [])

  const priorityColor: Record<string, string> = {
    alta: 'bg-red-100 text-red-700',
    media: 'bg-yellow-100 text-yellow-700',
    baja: 'bg-green-100 text-green-700',
  }

  const totalAlerts = overdueOrders.length + overdueCedis.length + overdueFollowups.length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      {/* Métricas pendientes */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Activos</p>
          <p className="text-3xl font-bold text-gray-800">{stats.active}</p>
        </div>
        <div className={`rounded-xl border p-5 ${stats.overdue > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
          <p className={`text-xs uppercase tracking-wide mb-1 ${stats.overdue > 0 ? 'text-red-400' : 'text-gray-400'}`}>Vencidos</p>
          <p className={`text-3xl font-bold ${stats.overdue > 0 ? 'text-red-600' : 'text-gray-800'}`}>{stats.overdue}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Completados</p>
          <p className="text-3xl font-bold text-gray-800">{stats.completed}</p>
        </div>
      </div>

      {/* Alertas CRM */}
      {totalAlerts > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-amber-600 text-lg">⚠️</span>
            <h2 className="font-semibold text-amber-800">
              {totalAlerts} alerta{totalAlerts > 1 ? 's' : ''} requieren atención
            </h2>
          </div>

          {/* Pedidos sin cerrar */}
          {overdueOrders.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
                Pedidos sin cerrar +7 días ({overdueOrders.length})
              </p>
              <div className="space-y-2">
                {overdueOrders.map(o => (
                  <Link key={o.id} to={`/crm/${o.client_id}/order/${o.id}/cedis`}
                    className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-4 py-2.5 hover:bg-amber-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        Pedido {o.numero_pedido}
                      </p>
                      <p className="text-xs text-gray-400">{o.crm_clients?.solicitante} · {o.estatus}</p>
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                      Sin cerrar
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* CEDIS sin cerrar */}
          {overdueCedis.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
                Requerimientos CEDIS sin cerrar +7 días ({overdueCedis.length})
              </p>
              <div className="space-y-2">
                {overdueCedis.map(c => (
                  <div key={c.id}
                    className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.codigo}</p>
                      <p className="text-xs text-gray-400">
                        Pedido {c.crm_orders?.numero_pedido} · {c.estatus.replace('_', ' ')}
                      </p>
                    </div>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                      {c.estatus.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seguimientos CRM vencidos */}
          {overdueFollowups.length > 0 && (
            <div>
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
                Seguimientos CRM vencidos ({overdueFollowups.length})
              </p>
              <div className="space-y-2">
                {overdueFollowups.map(f => (
                  <Link key={f.id} to={`/crm/${f.client_id}/followup/${f.id}`}
                    className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-4 py-2.5 hover:bg-amber-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {f.crm_clients?.solicitante}
                      </p>
                      <p className="text-xs text-gray-400">
                        {f.descripcion?.slice(0, 60)}... · vencía {f.fecha_seguimiento}
                      </p>
                    </div>
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-medium">
                      Vencido
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pendientes próximos a vencer */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-700">Próximos a vencer</h2>
          <Link to="/tasks/new"
            className="text-sm bg-teal-600 text-white px-4 py-1.5 rounded-lg hover:bg-teal-700">
            + Nuevo
          </Link>
        </div>
        {recent.length === 0 && <p className="text-sm text-gray-400">No hay pendientes activos.</p>}
        {recent.map(t => {
          const today = new Date().toISOString().split('T')[0]
          const isOverdue = t.due_date < today
          return (
            <Link to={`/tasks/${t.id}`} key={t.id}
              className={`flex items-center justify-between py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 px-2 rounded ${isOverdue ? 'bg-red-50' : ''}`}>
              <div>
                <p className="text-sm font-medium text-gray-700">{t.title}</p>
                <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                  {t.requested_by} · {isOverdue ? '⚠️ Vencido: ' : 'Vence: '}{t.due_date}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor[t.priority]}`}>
                {t.priority}
              </span>
            </Link>
          )
        })}
        {recent.length > 0 && (
          <Link to="/tasks" className="block text-center text-xs text-teal-600 hover:text-teal-700 mt-3 font-medium">
            Ver todos los pendientes →
          </Link>
        )}
      </div>
    </div>
  )
}
