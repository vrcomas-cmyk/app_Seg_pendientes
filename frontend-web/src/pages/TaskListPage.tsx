import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const priorityColor: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-yellow-100 text-yellow-700',
  baja: 'bg-green-100 text-green-700',
}

export default function TaskListPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('pendiente')
  const [priority, setPriority] = useState('')
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    setLoading(true)
    let q = supabase.from('tasks').select('*').order('due_date')
    if (status) q = q.eq('status', status)
    if (priority) q = q.eq('priority', priority)
    if (search) q = q.ilike('title', `%${search}%`)
    q.then(({ data }) => { setTasks(data ?? []); setLoading(false) })
  }, [status, priority, search])

  useEffect(() => {
    const channel = supabase.channel('tasks-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        let q = supabase.from('tasks').select('*').order('due_date')
        if (status) q = q.eq('status', status)
        q.then(({ data }) => setTasks(data ?? []))
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [status])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Pendientes</h1>
        <Link to="/tasks/new" className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">+ Nuevo</Link>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-40 outline-none focus:border-teal-400"
          placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pendiente">Activos</option>
          <option value="completado">Completados</option>
          <option value="reactivado">Reactivados</option>
          <option value="">Todos</option>
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">Todas las prioridades</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
        {!loading && tasks.length === 0 && <p className="text-sm text-gray-400 p-6">No hay pendientes.</p>}
        {tasks.map(t => {
          const overdue = t.status !== 'completado' && t.due_date < today
          return (
            <Link to={`/tasks/${t.id}`} key={t.id}
              className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${overdue ? 'border-l-2 border-l-red-400' : ''}`}>
              <div>
                <p className="text-sm font-medium text-gray-800">{t.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.requested_by} · vence {t.due_date} {overdue ? '⚠️' : ''}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${priorityColor[t.priority]}`}>{t.priority}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
