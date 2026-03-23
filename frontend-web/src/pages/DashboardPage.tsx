import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

export default function DashboardPage() {
  const [stats, setStats] = useState({ active: 0, overdue: 0, completed: 0 })
  const [recent, setRecent] = useState<any[]>([])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'reactivado']),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'reactivado']).lt('due_date', today),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completado'),
      supabase.from('tasks').select('*').in('status', ['pendiente', 'reactivado']).order('due_date').limit(5),
    ]).then(([active, overdue, completed, recentRes]) => {
      setStats({ active: active.count ?? 0, overdue: overdue.count ?? 0, completed: completed.count ?? 0 })
      setRecent(recentRes.data ?? [])
    })
  }, [])

  const priorityColor: Record<string, string> = {
    alta: 'bg-red-100 text-red-700',
    media: 'bg-yellow-100 text-yellow-700',
    baja: 'bg-green-100 text-green-700',
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Activos</p>
          <p className="text-3xl font-bold text-gray-800">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <p className="text-xs text-red-400 uppercase tracking-wide mb-1">Vencidos</p>
          <p className="text-3xl font-bold text-red-600">{stats.overdue}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Completados</p>
          <p className="text-3xl font-bold text-gray-800">{stats.completed}</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-700">Próximos a vencer</h2>
          <Link to="/tasks/new" className="text-sm bg-teal-600 text-white px-4 py-1.5 rounded-lg hover:bg-teal-700">+ Nuevo</Link>
        </div>
        {recent.length === 0 && <p className="text-sm text-gray-400">No hay pendientes activos.</p>}
        {recent.map(t => (
          <Link to={`/tasks/${t.id}`} key={t.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 px-2 rounded">
            <div>
              <p className="text-sm font-medium text-gray-700">{t.title}</p>
              <p className="text-xs text-gray-400">{t.requested_by} · vence {t.due_date}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor[t.priority]}`}>{t.priority}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
