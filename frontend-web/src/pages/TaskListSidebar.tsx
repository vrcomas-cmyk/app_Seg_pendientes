import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase, getCachedUser } from '../lib/supabase'

function daysDiff(date: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const due = new Date(date); due.setHours(0,0,0,0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function urgencyLabel(daysLeft: number, status: string) {
  if (status === 'completado') return null
  if (daysLeft < 0) return { text: `Vencido ${Math.abs(daysLeft)}d`, cls: 'bg-red-100 text-red-700 border-red-200' }
  if (daysLeft === 0) return { text: 'Hoy', cls: 'bg-orange-100 text-orange-700 border-orange-200' }
  if (daysLeft === 1) return { text: 'Mañana', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
  if (daysLeft <= 3) return { text: `${daysLeft}d`, cls: 'bg-yellow-50 text-yellow-600 border-yellow-100' }
  return null
}

const PRIORITY_DOT: Record<string, string> = {
  alta: 'bg-red-400',
  media: 'bg-yellow-400',
  baja: 'bg-green-400',
}

interface Props {
  activeId: string | null
}

export default function TaskListSidebar({ activeId }: Props) {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todos' | 'alta' | 'media' | 'baja' | 'completados'>('todos')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const user = await getCachedUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('tasks')
      .select('*')
      .eq('created_by', user.id)
      .order('due_date', { ascending: true })
    setTasks(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Refrescar lista si navegamos y hubo cambios en otro panel
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [load])

  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = today.toISOString().split('T')[0]

  const activeTasks = tasks.filter(t => t.status !== 'completado')
  const completedTasks = tasks.filter(t => t.status === 'completado')
  const overdue = activeTasks.filter(t => t.due_date && t.due_date < todayStr)

  const filteredTasks = tasks.filter(t => {
    if (filter === 'completados') return t.status === 'completado'
    if (filter === 'alta') return t.priority === 'alta' && t.status !== 'completado'
    if (filter === 'media') return t.priority === 'media' && t.status !== 'completado'
    if (filter === 'baja') return t.priority === 'baja' && t.status !== 'completado'
    return t.status !== 'completado'
  }).filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return t.title?.toLowerCase().includes(s) ||
      t.requested_by?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s)
  })

  const sorted = [...filteredTasks].sort((a, b) => {
    if (a.status === 'completado' && b.status !== 'completado') return 1
    if (b.status === 'completado' && a.status !== 'completado') return -1
    const da = a.due_date ? daysDiff(a.due_date) : 999
    const db = b.due_date ? daysDiff(b.due_date) : 999
    if (da < 0 && db >= 0) return -1
    if (db < 0 && da >= 0) return 1
    return da - db
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-[calc(100vh-120px)] sticky top-20">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold text-gray-800">Pendientes</h1>
          <p className="text-xs text-gray-400">
            {activeTasks.length} activos
            {overdue.length > 0 && (
              <span className="text-red-500 font-medium"> · {overdue.length} vencidos</span>
            )}
          </p>
        </div>
        <Link to="/tasks/new"
          className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-teal-700 flex-shrink-0">
          + Nuevo
        </Link>
      </div>

      {/* Filtros */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100 space-y-2">
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-teal-400"
          placeholder="Buscar..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
          {([
            { key: 'todos', label: 'Todos', count: activeTasks.length },
            { key: 'alta', label: 'Alta', count: activeTasks.filter(t => t.priority === 'alta').length },
            { key: 'media', label: 'Media', count: null },
            { key: 'baja', label: 'Baja', count: null },
            { key: 'completados', label: 'Listos', count: completedTasks.length },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                filter === f.key
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {f.label}{f.count !== null && f.count !== undefined ? ` ${f.count}` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-8 text-center text-xs text-gray-400">Cargando...</div>
        )}
        {!loading && sorted.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-xs text-gray-400">Sin resultados.</p>
            <Link to="/tasks/new"
              className="mt-2 inline-block text-xs text-teal-600 font-medium hover:text-teal-700">
              + Crear uno
            </Link>
          </div>
        )}
        {!loading && sorted.map(t => {
          const dl = t.due_date ? daysDiff(t.due_date) : null
          const isActive = activeId === t.id
          const urg = dl !== null ? urgencyLabel(dl, t.status) : null
          return (
            <Link key={t.id} to={`/tasks/${t.id}`}
              className={`block px-3 py-2.5 border-b border-gray-50 transition ${
                isActive
                  ? 'bg-teal-50 border-l-4 border-l-teal-500 -ml-0.5'
                  : 'hover:bg-gray-50 border-l-4 border-l-transparent'
              }`}>
              <div className="flex items-start gap-2">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  t.status === 'completado' ? 'bg-gray-300' : PRIORITY_DOT[t.priority] ?? 'bg-gray-300'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate leading-snug ${
                    t.status === 'completado'
                      ? 'line-through text-gray-400'
                      : isActive ? 'text-teal-800' : 'text-gray-800'
                  }`}>
                    {t.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {t.requested_by && (
                      <span className="text-xs text-gray-400 truncate max-w-[8rem]">
                        {t.requested_by}
                      </span>
                    )}
                    {urg && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${urg.cls}`}>
                        {urg.text}
                      </span>
                    )}
                    {t.status === 'completado' && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                        listo
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
