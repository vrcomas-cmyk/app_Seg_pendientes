import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCalendar } from '../hooks/useCalendar'
import FileUploader from '../components/FileUploader'
import ImageLightbox from '../components/ImageLightbox'
import PasteImageUploader from '../components/PasteImageUploader'
import TaskSteps from '../components/TaskSteps'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  return `hace ${days}d`
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export default function TaskDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { connectGoogle, createEvent, rescheduleEvent, cancelEvent, loading: calLoading } = useCalendar()
  const [task, setTask] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [calEvents, setCalEvents] = useState<any[]>([])
  const [attachments, setAttachments] = useState<any[]>([])
  const [crmFollowup, setCrmFollowup] = useState<any>(null)
  const [reviewedWith, setReviewedWith] = useState('')
  const [loading, setLoading] = useState(false)
  const [calMode, setCalMode] = useState<'none' | 'create' | 'reschedule'>('none')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('09:00')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pasos' | 'historial' | 'adjuntos'>('pasos')
  const [historyLimit, setHistoryLimit] = useState(5)
  const [showAttachSection, setShowAttachSection] = useState(false)
  const historyEndRef = useRef<HTMLDivElement>(null)

  const loadAttachments = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${API_URL}/tasks/${id}/attachments`, {
      headers: { Authorization: `Bearer ${session?.access_token}` }
    })
    const data = await res.json()
    const list = Array.isArray(data) ? data : []
    setAttachments(list)
    if (list.length > 0) setShowAttachSection(true)
  }

  const load = async () => {
    const [t, h, c] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', id).single(),
      supabase.from('task_history').select('*, users:created_by(full_name, email)').eq('task_id', id).order('created_at'),
      supabase.auth.getUser().then(({ data: { user } }) =>
        supabase.from('calendar_events').select('*')
          .eq('task_id', id).eq('is_active', true).eq('created_by', user?.id)
      ),
    ])
    setTask(t.data)
    setHistory(h.data ?? [])
    setCalEvents(c.data ?? [])
    if (t.data?.due_date) setEventDate(t.data.due_date)
    await loadAttachments()
    const { data: followup } = await supabase
      .from('crm_followups').select('*, crm_clients(id, solicitante)')
      .eq('task_id', id).single()
    setCrmFollowup(followup)
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('calendar') === 'connected') toast.success('Google Calendar conectado')
  }, [])

  const changeStatus = async (status: string, removeCalendar: boolean) => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (removeCalendar && hasCalendarEvent) await cancelEvent(id!)
    await supabase.from('tasks').update({ status }).eq('id', id)
    await supabase.from('task_history').insert({
      task_id: id, comment: `Pendiente marcado como ${status}.`, created_by: user?.id
    })
    toast.success(`Marcado como ${status}`)
    load(); setLoading(false)
  }

  const handleComplete = async () => {
    if (hasCalendarEvent) {
      const remove = window.confirm('Eliminar el evento de Google Calendar tambien?')
      await changeStatus('completado', remove)
    } else { await changeStatus('completado', false) }
  }

  const handleReactivate = async () => {
    if (hasCalendarEvent) {
      const remove = window.confirm('Eliminar el evento de Google Calendar tambien?')
      await changeStatus('reactivado', remove)
    } else { await changeStatus('reactivado', false) }
  }

  const handleCreate = async () => {
    if (!eventDate || !eventTime) return toast.error('Selecciona fecha y hora')
    const result = await createEvent(id!, eventDate, eventTime)
    if (result.needsAuth) {
      toast('Conecta tu Google Calendar primero', { icon: '📅' })
      setTimeout(() => connectGoogle(), 1500)
    } else if (result.success) {
      toast.success('Evento creado en Google Calendar')
      if (result.htmlLink) window.open(result.htmlLink, '_blank')
      setCalMode('none'); load()
    } else toast.error(result.error ?? 'Error al crear evento')
  }

  const handleReschedule = async () => {
    if (!eventDate || !eventTime) return toast.error('Selecciona fecha y hora')
    const result = await rescheduleEvent(id!, eventDate, eventTime)
    if (result.success) { toast.success('Evento reagendado'); setCalMode('none'); load() }
    else toast.error(result.error ?? 'Error al reagendar')
  }

  const handleCancel = async () => {
    const result = await cancelEvent(id!)
    if (result.success) { toast.success('Evento eliminado'); load() }
    else toast.error(result.error ?? 'Error')
  }

  const renderComment = (text: string) => {
    const parts = text.split(/(!\[.*?\]\(.*?\))/)
    return parts.map((part, i) => {
      const match = part.match(/!\[(.*?)\]\((.*?)\)/)
      if (match) {
        return (
          <div key={i} className="mt-2 relative group inline-block cursor-pointer"
            onClick={() => setLightbox(match[2])}>
            <img src={match[2]} alt={match[1]}
              className="max-h-40 rounded-lg border border-gray-200 hover:opacity-90 transition object-cover" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-lg bg-black bg-opacity-30">
              <span className="text-white text-xs font-medium">Ver</span>
            </div>
          </div>
        )
      }
      return part ? <span key={i}>{part}</span> : null
    })
  }

  const isImage = (url: string) => /\.(png|jpg|jpeg|gif|webp)$/i.test(url)

  if (!task) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-sm text-gray-400">Cargando...</div>
    </div>
  )

  const priorityColor: Record<string, string> = {
    alta:  'bg-red-100 text-red-700 border-red-200',
    media: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    baja:  'bg-green-100 text-green-700 border-green-200',
  }
  const statusColor: Record<string, string> = {
    pendiente:   'bg-yellow-100 text-yellow-700',
    en_proceso:  'bg-blue-100 text-blue-700',
    completado:  'bg-green-100 text-green-700',
    reactivado:  'bg-purple-100 text-purple-700',
  }
  const hasCalendarEvent = calEvents.length > 0
  const activeEvent = calEvents[0]
  const isOverdue = task.due_date && task.status !== 'completado' && task.due_date < new Date().toISOString().split('T')[0]
  const visibleHistory = history.slice(-historyLimit)
  const hasMoreHistory = history.length > historyLimit
  const imageAttachments = attachments.filter(a => isImage(a.url ?? ''))
  const docAttachments = attachments.filter(a => !isImage(a.url ?? ''))

  return (
    <div className="max-w-6xl mx-auto">
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      {/* Botón volver */}
      <button onClick={() => nav('/tasks')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        Volver a pendientes
      </button>

      {/* Banner vencido */}
      {isOverdue && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 mb-4 flex items-center gap-3">
          <span className="text-red-500 text-lg">!</span>
          <p className="text-sm text-red-700 font-medium">
            Este pendiente vencio el {task.due_date} — requiere atencion
          </p>
        </div>
      )}

      {/* Banner CRM */}
      {crmFollowup && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-5 py-3 mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide mb-0.5">Vinculado a CRM</p>
            <p className="text-sm text-teal-800 font-medium">{crmFollowup.crm_clients?.solicitante}</p>
            <p className="text-xs text-teal-600">{crmFollowup.tipo?.replace('_', ' ')} · {crmFollowup.estatus?.replace('_', ' ')}</p>
          </div>
          <Link to={`/crm/${crmFollowup.client_id}/followup/${crmFollowup.id}`}
            className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700 flex-shrink-0">
            Ver en CRM
          </Link>
        </div>
      )}

      {/* Layout de dos columnas */}
      <div className="flex gap-5 items-start">

        {/* Columna izquierda — info principal + contenido */}
        <div className="flex-1 min-w-0">

          {/* Card principal */}
          <div className={`bg-white rounded-xl border p-6 mb-4 ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}>
            {/* Header */}
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-gray-900 mb-3">{task.title}</h1>
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${priorityColor[task.priority]}`}>
                  {task.priority}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[task.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {task.status?.replace('_', ' ')}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                  Vence: {task.due_date}
                </span>
                {hasCalendarEvent && (
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-100 text-blue-600">
                    Cal: {new Date(activeEvent.event_date).toLocaleDateString('es-MX')}
                  </span>
                )}
                <span className="text-xs text-gray-400 ml-auto">
                  Actualizado {timeAgo(task.updated_at ?? task.created_at)}
                </span>
              </div>
            </div>

            {task.description && (
              <p className="text-sm text-gray-600 mb-4 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
                {task.description}
              </p>
            )}

            <div className="flex flex-wrap gap-2 text-xs text-gray-400 mb-5">
              <span>Solicitante: <strong className="text-gray-600">{task.requested_by}</strong></span>
            </div>

            {/* Acciones principales */}
            <div className="flex gap-2 flex-wrap">
              {task.status !== 'completado' ? (
                <button onClick={handleComplete} disabled={loading}
                  className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 shadow-sm">
                  Completar pendiente
                </button>
              ) : (
                <button onClick={handleReactivate} disabled={loading}
                  className="bg-yellow-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50">
                  Reactivar
                </button>
              )}
              {!hasCalendarEvent && calMode === 'none' && (
                <button onClick={() => setCalMode('create')}
                  className="border border-blue-300 text-blue-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-50">
                  Agregar a Calendar
                </button>
              )}
              {hasCalendarEvent && calMode === 'none' && (
                <>
                  <button onClick={() => {
                    setCalMode('reschedule')
                    setEventDate(activeEvent.event_date.split('T')[0])
                    setEventTime(activeEvent.event_date.split('T')[1]?.slice(0, 5) ?? '09:00')
                  }} className="border border-blue-300 text-blue-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-50">
                    Reagendar
                  </button>
                  <button onClick={handleCancel} disabled={calLoading}
                    className="border border-red-200 text-red-500 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-50">
                    Quitar evento
                  </button>
                </>
              )}
            </div>

            {/* Form calendar */}
            {(calMode === 'create' || calMode === 'reschedule') && (
              <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-sm font-medium text-blue-700 mb-3">
                  {calMode === 'create' ? 'Fecha y hora del recordatorio' : 'Nueva fecha y hora'}
                </p>
                <div className="flex gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Fecha</label>
                    <input type="date"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
                      value={eventDate} onChange={e => setEventDate(e.target.value)} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Hora</label>
                    <input type="time"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
                      value={eventTime} onChange={e => setEventTime(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={calMode === 'create' ? handleCreate : handleReschedule} disabled={calLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                    {calLoading ? 'Guardando...' : calMode === 'create' ? 'Crear evento' : 'Reagendar'}
                  </button>
                  <button onClick={() => setCalMode('none')}
                    className="bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tabs en mobile — en desktop se ocultan porque hay dos columnas */}
          <div className="flex gap-0 bg-white rounded-xl border border-gray-200 overflow-hidden mb-4 lg:hidden">
            {(['pasos','historial','adjuntos'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-3 text-sm font-medium capitalize transition border-b-2 ${
                  activeTab === t ? 'border-teal-600 text-teal-600 bg-teal-50' : 'border-transparent text-gray-500'
                }`}>
                {t}
                {t === 'adjuntos' && attachments.length > 0 && (
                  <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{attachments.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Pasos — siempre visible en desktop, tab en mobile */}
          <div className={activeTab === 'pasos' ? '' : 'hidden lg:block'}>
            <TaskSteps taskId={task.id} />
          </div>

          {/* Adjuntos — tab en mobile */}
          <div className={activeTab === 'adjuntos' ? '' : 'hidden lg:hidden'}>
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h2 className="font-semibold text-gray-700 mb-4">Archivos adjuntos</h2>
              <FileUploader taskId={id!} attachments={attachments} onRefresh={loadAttachments} />
              {imageAttachments.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 mb-2 font-medium">Imagenes</p>
                  <div className="grid grid-cols-4 gap-2">
                    {imageAttachments.map(att => (
                      <div key={att.id ?? att.url} className="relative group cursor-pointer aspect-square"
                        onClick={() => setLightbox(att.url)}>
                        <img src={att.url} alt={att.name}
                          className="w-full h-full object-cover rounded-lg border border-gray-200 hover:opacity-90 transition" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-lg bg-black bg-opacity-30">
                          <span className="text-white text-xs font-medium">Ver</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs text-gray-500 mb-2 font-medium">Pegar captura de pantalla</p>
                <PasteImageUploader taskId={task.id} mode="zone"
                  onUploaded={async (url, name) => {
                    const { data: { user } } = await supabase.auth.getUser()
                    await supabase.from('attachments').insert({
                      task_id: task.id, url, name, type: 'image', created_by: user?.id,
                    })
                    loadAttachments()
                    toast.success('Imagen guardada')
                  }} />
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha — historial + adjuntos (solo desktop) */}
        <div className="w-96 flex-shrink-0 space-y-4 hidden lg:block">

          {/* Historial */}
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ maxHeight: '70vh' }}>
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-semibold text-gray-700">Historial</h2>
              <span className="text-xs text-gray-400">{history.length} entrada(s)</span>
            </div>

            {/* Lista de comentarios con scroll */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {history.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Sin comentarios aun.</p>
              )}
              {hasMoreHistory && (
                <button onClick={() => setHistoryLimit(prev => prev + 10)}
                  className="w-full text-xs text-teal-600 hover:text-teal-700 font-medium py-2 border border-dashed border-teal-200 rounded-lg hover:bg-teal-50">
                  Ver anteriores ({history.length - historyLimit} mas)
                </button>
              )}
              {visibleHistory.map(h => {
                const name = h.users?.full_name || h.users?.email || 'Usuario'
                return (
                  <div key={h.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {initials(name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-700">{name}</span>
                        <span className="text-xs text-gray-400">{timeAgo(h.created_at)}</span>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                        <div className="text-sm text-gray-700">{renderComment(h.comment ?? '')}</div>
                        {h.reviewed_with && (
                          <p className="text-xs text-gray-400 mt-1">Con: {h.reviewed_with}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={historyEndRef} />
            </div>

            {/* Campo comentario fijo abajo */}
            <div className="border-t border-gray-100 p-4">
              <PasteImageUploader
                taskId={task.id}
                mode="comment"
                placeholder="Comentario o Ctrl+V para imagen..."
                onComment={async (text, images) => {
                  const { data: { user } } = await supabase.auth.getUser()
                  const imageLinks = images.map(i => `\n![${i.name}](${i.url})`).join('')
                  await supabase.from('task_history').insert({
                    task_id: id, comment: text + imageLinks,
                    reviewed_with: reviewedWith || null, created_by: user?.id,
                  })
                  for (const img of images) {
                    await supabase.from('attachments').insert({
                      task_id: task.id, url: img.url, name: img.name,
                      type: 'image', created_by: user?.id,
                    })
                  }
                  toast.success('Comentario agregado')
                  setReviewedWith('')
                  load()
                  setHistoryLimit(prev => prev + 1)
                }}
              />
              <input
                className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-teal-400"
                placeholder="Con quien se reviso (opcional)"
                value={reviewedWith} onChange={e => setReviewedWith(e.target.value)} />
            </div>
          </div>

          {/* Adjuntos desktop */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <button
              onClick={() => setShowAttachSection(!showAttachSection)}
              className="w-full flex justify-between items-center">
              <h2 className="font-semibold text-gray-700 text-sm">
                Adjuntos
                {attachments.length > 0 && (
                  <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{attachments.length}</span>
                )}
              </h2>
              <span className="text-gray-400 text-xs">{showAttachSection ? 'v' : '>'}</span>
            </button>

            {showAttachSection && (
              <div className="mt-4 space-y-3">
                <FileUploader taskId={id!} attachments={attachments} onRefresh={loadAttachments} />

                {imageAttachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {imageAttachments.map(att => (
                      <div key={att.id ?? att.url} className="relative group cursor-pointer aspect-square"
                        onClick={() => setLightbox(att.url)}>
                        <img src={att.url} alt={att.name}
                          className="w-full h-full object-cover rounded-lg border border-gray-200 hover:opacity-90 transition" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-lg bg-black bg-opacity-30">
                          <span className="text-white text-xs">Ver</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {docAttachments.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {docAttachments.map(att => (
                      <a key={att.id ?? att.url} href={att.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-xs text-teal-600 hover:underline py-1">
                        <span>doc</span>
                        <span className="truncate">{att.name}</span>
                      </a>
                    ))}
                  </div>
                )}

                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-400 mb-2">Pegar captura</p>
                  <PasteImageUploader taskId={task.id} mode="zone"
                    onUploaded={async (url, name) => {
                      const { data: { user } } = await supabase.auth.getUser()
                      await supabase.from('attachments').insert({
                        task_id: task.id, url, name, type: 'image', created_by: user?.id,
                      })
                      loadAttachments()
                      toast.success('Imagen guardada')
                    }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historial mobile (tab) */}
      {activeTab === 'historial' && (
        <div className="lg:hidden bg-white rounded-xl border border-gray-200 flex flex-col mb-4" style={{ maxHeight: '60vh' }}>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {history.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Sin comentarios aun.</p>}
            {hasMoreHistory && (
              <button onClick={() => setHistoryLimit(prev => prev + 10)}
                className="w-full text-xs text-teal-600 font-medium py-2 border border-dashed border-teal-200 rounded-lg">
                Ver anteriores
              </button>
            )}
            {visibleHistory.map(h => {
              const name = h.users?.full_name || h.users?.email || 'Usuario'
              return (
                <div key={h.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {initials(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">{name}</span>
                      <span className="text-xs text-gray-400">{timeAgo(h.created_at)}</span>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
                      <div className="text-sm text-gray-700">{renderComment(h.comment ?? '')}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="border-t border-gray-100 p-4">
            <PasteImageUploader taskId={task.id} mode="comment"
              placeholder="Comentario o Ctrl+V para imagen..."
              onComment={async (text, images) => {
                const { data: { user } } = await supabase.auth.getUser()
                const imageLinks = images.map(i => `\n![${i.name}](${i.url})`).join('')
                await supabase.from('task_history').insert({
                  task_id: id, comment: text + imageLinks, created_by: user?.id,
                })
                toast.success('Comentario agregado')
                load()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
