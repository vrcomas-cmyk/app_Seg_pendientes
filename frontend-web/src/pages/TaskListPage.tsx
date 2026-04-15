import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, getCachedUser } from '../lib/supabase'

function daysDiff(date: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const due = new Date(date); due.setHours(0,0,0,0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

function UrgencyBadge({ daysLeft, status }: { daysLeft: number; status: string }) {
  if (status === 'completado') return null
  if (daysLeft < 0)  return <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">! Vencido hace {Math.abs(daysLeft)}d</span>
  if (daysLeft === 0) return <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">! Hoy</span>
  if (daysLeft === 1) return <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">! Manana</span>
  if (daysLeft <= 3)  return <span className="text-xs bg-yellow-50 text-yellow-600 border border-yellow-100 px-2 py-0.5 rounded-full font-medium">{daysLeft}d</span>
  return null
}

function rowBg(daysLeft: number, status: string) {
  if (status === 'completado') return 'bg-gray-50 opacity-60'
  if (daysLeft < 0)  return 'bg-red-50 border-l-4 border-l-red-400'
  if (daysLeft === 0) return 'bg-orange-50 border-l-4 border-l-orange-400'
  if (daysLeft === 1) return 'bg-yellow-50 border-l-4 border-l-yellow-400'
  return 'bg-white'
}

const PRIORITY_COLOR: Record<string, string> = {
  alta:  'bg-red-100 text-red-700',
  media: 'bg-yellow-100 text-yellow-700',
  baja:  'bg-green-100 text-green-700',
}

const STATUS_COLOR: Record<string, string> = {
  pendiente:  'bg-yellow-100 text-yellow-700',
  en_proceso: 'bg-blue-100 text-blue-700',
  completado: 'bg-green-100 text-green-700',
  reactivado: 'bg-purple-100 text-purple-700',
}

export default function TaskListPage() {
  const nav = useNavigate()
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

    // Enrich with CRM offer data for badge display
    const taskList = data ?? []
    if (taskList.length > 0) {
      const taskIds = taskList.map((t: any) => t.id)
      const { data: offers } = await supabase
        .from('crm_offers')
        .select('task_id, id, etapa, crm_clients(solicitante, razon_social)')
        .in('task_id', taskIds)
      if (offers && offers.length > 0) {
        const offerMap: Record<string, any> = {}
        offers.forEach((o: any) => { if (o.task_id) offerMap[o.task_id] = o })
        setTasks(taskList.map((t: any) => offerMap[t.id] ? { ...t, _crm_offer: offerMap[t.id] } : t))
        setLoading(false); return
      }
    }
    setTasks(taskList)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = today.toISOString().split('T')[0]
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().split('T')[0]

  const activeTasks = tasks.filter(t => t.status !== 'completado')
  const completedTasks = tasks.filter(t => t.status === 'completado')
  const overdue = activeTasks.filter(t => t.due_date && t.due_date < todayStr)
  const dueToday = activeTasks.filter(t => t.due_date === todayStr)
  const dueTomorrow = activeTasks.filter(t => t.due_date === tomorrowStr)
  const urgent = [...overdue, ...dueToday, ...dueTomorrow]
    .filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i)

  const filteredTasks = tasks.filter(t => {
    if (filter === 'completados') return t.status === 'completado'
    if (filter === 'alta')  return t.priority === 'alta'  && t.status !== 'completado'
    if (filter === 'media') return t.priority === 'media' && t.status !== 'completado'
    if (filter === 'baja')  return t.priority === 'baja'  && t.status !== 'completado'
    return t.status !== 'completado'
  }).filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return t.title?.toLowerCase().includes(s) ||
      t.requested_by?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s)
  })

  // Ordenar: vencidos → hoy → mañana → próximos → sin fecha
  const sorted = [...filteredTasks].sort((a, b) => {
    if (a.status === 'completado' && b.status !== 'completado') return 1
    if (b.status === 'completado' && a.status !== 'completado') return -1
    const da = a.due_date ? daysDiff(a.due_date) : 999
    const db = b.due_date ? daysDiff(b.due_date) : 999
    if (da < 0 && db >= 0) return -1
    if (db < 0 && da >= 0) return 1
    return da - db
  })

  const thisMonth = new Date().toISOString().slice(0, 7)
  const completedThisMonth = completedTasks.filter(t =>
    t.updated_at?.startsWith(thisMonth) || t.created_at?.startsWith(thisMonth)
  ).length

  return (
    <div className="w-full max-w-4xl mx-auto pb-24 px-0 sm:px-0">
      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Pendientes</h1>
        <Link to="/tasks/new"
          className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700 shadow-sm">
          + Nuevo pendiente
        </Link>
      </div>

      {/* Metricas compactas */}
      <div className="flex gap-3 flex-wrap mb-5">
        {[
          { label: 'Activos',    value: activeTasks.length,      color: 'bg-white border-gray-200 text-gray-700' },
          { label: 'Vencidos',   value: overdue.length,          color: overdue.length > 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-400' },
          { label: 'Vencen hoy', value: dueToday.length,         color: dueToday.length > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-gray-200 text-gray-400' },
          { label: 'Este mes',   value: completedThisMonth,      color: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Alta prioridad', value: activeTasks.filter(t => t.priority === 'alta').length, color: 'bg-white border-gray-200 text-gray-600' },
        ].map(m => (
          <div key={m.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${m.color}`}>
            <span className="text-lg font-bold">{m.value}</span>
            <span className="text-xs opacity-75">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Banner vencidos */}
      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-lg font-bold">!</span>
            <p className="text-sm text-red-700 font-medium">
              Tienes {overdue.length} pendiente(s) vencido(s) que requieren atencion
            </p>
          </div>
          <button onClick={() => setFilter('todos')}
            className="text-xs text-red-600 font-semibold hover:text-red-700 underline">
            Ver todos
          </button>
        </div>
      )}

      {/* Seccion urgente — hoy y mañana */}
      {urgent.length > 0 && filter === 'todos' && !search && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">
            Revisar hoy — {urgent.length} pendiente(s)
          </p>
          <div className="space-y-2">
            {urgent.map(t => {
              const dl = t.due_date ? daysDiff(t.due_date) : null
              return (
                <Link key={t.id} to={`/tasks/${t.id}`}
                  className="flex items-center gap-3 bg-white rounded-lg px-4 py-2.5 border border-amber-100 hover:border-amber-300 hover:shadow-sm transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{t.title}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {t._crm_offer && (
                        <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">
                          📋 {t._crm_offer.crm_clients?.razon_social ?? t._crm_offer.crm_clients?.solicitante}
                        </span>
                      )}
                      {t.requested_by && <span className="text-xs text-gray-400">{t.requested_by}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[t.priority]}`}>
                      {t.priority}
                    </span>
                    {dl !== null && <UrgencyBadge daysLeft={dl} status={t.status} />}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtros + busqueda */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {([
            { key: 'todos',      label: 'Todos' },
            { key: 'alta',       label: 'Alta' },
            { key: 'media',      label: 'Media' },
            { key: 'baja',       label: 'Baja' },
            { key: 'completados', label: 'Completados' },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-4 py-2 text-xs font-medium transition ${
                filter === f.key
                  ? 'bg-teal-600 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {f.label}
              {f.key === 'todos' && ` (${activeTasks.length})`}
              {f.key === 'alta' && activeTasks.filter(t => t.priority === 'alta').length > 0 &&
                ` (${activeTasks.filter(t => t.priority === 'alta').length})`}
              {f.key === 'completados' && ` (${completedTasks.length})`}
            </button>
          ))}
        </div>
        <input
          className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar pendiente..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Lista principal */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && (
          <div className="p-10 text-center text-sm text-gray-400">Cargando...</div>
        )}
        {!loading && sorted.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-gray-400 text-sm">No hay pendientes con estos filtros.</p>
            <Link to="/tasks/new"
              className="mt-3 inline-block text-sm text-teal-600 font-medium hover:text-teal-700">
              + Crear el primero
            </Link>
          </div>
        )}
        {!loading && sorted.map((t, i) => {
          const dl = t.due_date ? daysDiff(t.due_date) : null
          const bg = dl !== null ? rowBg(dl, t.status) : 'bg-white'
          return (
            <Link key={t.id} to={`/tasks/${t.id}`}
              className={`flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0 hover:brightness-95 transition cursor-pointer ${bg}`}>
              {/* Indicador visual izquierda */}
              <div className="flex-shrink-0">
                {t.status === 'completado' ? (
                  <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">v</div>
                ) : dl !== null && dl < 0 ? (
                  <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">!</div>
                ) : dl === 0 ? (
                  <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">!</div>
                ) : dl === 1 ? (
                  <div className="w-6 h-6 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center text-xs font-bold">!</div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs">{i + 1}</div>
                )}
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className={`text-sm font-semibold truncate ${
                    t.status === 'completado' ? 'line-through text-gray-400' :
                    dl !== null && dl < 0 ? 'text-red-700' :
                    dl === 0 ? 'text-orange-700' : 'text-gray-800'
                  }`}>
                    {t.title}
                  </p>
                  {dl !== null && <UrgencyBadge daysLeft={dl} status={t.status} />}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                  {t.requested_by && <span>{t.requested_by}</span>}
                  {t.due_date && (
                    <span className={
                      t.status !== 'completado' && dl !== null && dl < 0 ? 'text-red-500 font-medium' :
                      t.status !== 'completado' && dl === 0 ? 'text-orange-500 font-medium' :
                      t.status !== 'completado' && dl === 1 ? 'text-yellow-600 font-medium' : ''
                    }>
                      Vence: {t.due_date}
                    </span>
                  )}
                </div>
              </div>

              {/* Chips derecha */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[t.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                  {t.priority}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {t.status?.replace('_', ' ')}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
