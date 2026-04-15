import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase, getCachedUser } from '../lib/supabase'
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
  return `hace ${Math.floor(hrs / 24)}d`
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
  const [crmOffer, setCrmOffer] = useState<any>(null)
  const [reviewedWith, setReviewedWith] = useState('')
  const [loading, setLoading] = useState(false)
  const [calMode, setCalMode] = useState<'none'|'create'|'reschedule'>('none')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('09:00')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pasos'|'historial'|'adjuntos'>('pasos')
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

    const { data: offer } = await supabase
      .from('crm_offers')
      .select(`id, etapa, folio_pedido, tipo_negocio, fecha_venta, client_id,
        crm_clients(id, solicitante, razon_social),
        crm_offer_items(id, material, descripcion, cantidad_aceptada, cantidad_ofertada, precio_aceptado, precio_oferta)`)
      .eq('task_id', id).single()
    if (offer) setCrmOffer(offer)
  }

  useEffect(() => { load() }, [id])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('calendar') === 'connected') toast.success('Google Calendar conectado')
  }, [])

  const changeStatus = async (status: string, removeCalendar: boolean) => {
    setLoading(true)
    const user = await getCachedUser()
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
    } else await changeStatus('completado', false)
  }

  const handleReactivate = async () => {
    if (hasCalendarEvent) {
      const remove = window.confirm('Eliminar el evento de Google Calendar tambien?')
      await changeStatus('reactivado', remove)
    } else await changeStatus('reactivado', false)
  }

  const handleCreate = async () => {
    if (!eventDate || !eventTime) return toast.error('Selecciona fecha y hora')
    const result = await createEvent(id!, eventDate, eventTime)
    if (result.needsAuth) {
      toast('Conecta tu Google Calendar primero', { icon: '📅' })
      setTimeout(() => connectGoogle(), 1500)
    } else if (result.success) {
      toast.success('Evento creado')
      if (result.htmlLink) window.open(result.htmlLink, '_blank')
      setCalMode('none'); load()
    } else toast.error(result.error ?? 'Error')
  }

  const handleReschedule = async () => {
    if (!eventDate || !eventTime) return toast.error('Selecciona fecha y hora')
    const result = await rescheduleEvent(id!, eventDate, eventTime)
    if (result.success) { toast.success('Reagendado'); setCalMode('none'); load() }
    else toast.error(result.error ?? 'Error')
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
    pendiente:  'bg-yellow-100 text-yellow-700',
    en_proceso: 'bg-blue-100 text-blue-700',
    completado: 'bg-green-100 text-green-700',
    reactivado: 'bg-purple-100 text-purple-700',
  }
  const hasCalendarEvent = calEvents.length > 0
  const activeEvent = calEvents[0]
  const isOverdue = task.due_date && task.status !== 'completado' &&
    task.due_date < new Date().toISOString().split('T')[0]
  const visibleHistory = history.slice(-historyLimit)
  const hasMoreHistory = history.length > historyLimit
  const imageAttachments = attachments.filter(a => isImage(a.url ?? ''))
  const docAttachments   = attachments.filter(a => !isImage(a.url ?? ''))

  return (
    <div className="max-w-6xl mx-auto pb-8">
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}

      {/* Volver */}
      <button onClick={() => nav('/tasks')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1 min-h-[44px]">
        Volver
      </button>

      {/* Banner vencido */}
      {isOverdue && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 flex items-center gap-2">
          <span className="text-red-500 font-bold">!</span>
          <p className="text-sm text-red-700 font-medium">Vencido el {task.due_date}</p>
        </div>
      )}

      {/* Banner CRM */}
      {crmFollowup && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide mb-0.5">Vinculado a CRM</p>
            <p className="text-sm text-teal-800 font-medium">{crmFollowup.crm_clients?.solicitante}</p>
          </div>
          <Link to={`/crm/${crmFollowup.client_id}/followup/${crmFollowup.id}`}
            className="text-xs bg-teal-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-teal-700 flex-shrink-0 min-h-[36px] flex items-center">
            Ver CRM
          </Link>
        </div>
      )}

      {crmOffer && (() => {
        const cli = crmOffer.crm_clients
        const items = crmOffer.crm_offer_items ?? []
        const total = items.reduce((a: number, i: any) =>
          a + ((i.cantidad_aceptada??i.cantidad_ofertada??0)*(i.precio_aceptado??i.precio_oferta??0)), 0)
        const ETAPA_COLORS: Record<string,string> = {
          oferta:'bg-gray-100 text-gray-600', venta:'bg-blue-100 text-blue-700',
          cedis:'bg-amber-100 text-amber-700', transmision:'bg-purple-100 text-purple-700',
          facturado:'bg-green-100 text-green-700', cancelado:'bg-gray-100 text-gray-400',
        }
        return (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">📋 Oferta CRM vinculada</p>
                <p className="text-sm font-bold text-gray-800">{cli?.razon_social ?? cli?.solicitante ?? '—'}</p>
                <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ETAPA_COLORS[crmOffer.etapa]??'bg-gray-100 text-gray-500'}`}>
                    {crmOffer.etapa}
                  </span>
                  {crmOffer.folio_pedido && (
                    <span className="text-xs font-mono text-blue-700 font-semibold">{crmOffer.folio_pedido}</span>
                  )}
                  <span className="text-xs text-gray-400">{items.length} material(es)</span>
                  {total > 0 && (
                    <span className="text-xs font-semibold text-gray-700">
                      ${total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                    </span>
                  )}
                </div>
                {items.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {items.slice(0, 3).map((i: any) => (
                      <p key={i.id} className="text-xs text-gray-500">
                        <span className="font-mono font-semibold">{i.material}</span>
                        {i.descripcion ? ` — ${i.descripcion}` : ''}
                      </p>
                    ))}
                    {items.length > 3 && <p className="text-xs text-gray-400 mt-0.5">+{items.length - 3} más</p>}
                  </div>
                )}
              </div>
              <Link to={`/crm/pipeline?id=${crmOffer.id}`}
                className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-blue-700 flex-shrink-0 min-h-[36px] flex items-center whitespace-nowrap">
                Ver Pipeline →
              </Link>
            </div>
          </div>
        )
      })()}

      {/* Layout: una columna en mobile, dos en desktop */}
      <div className="flex flex-col lg:flex-row gap-4">

        {/* Columna izquierda */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Card principal */}
          <div className={`bg-white rounded-xl border p-4 sm:p-6 ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 leading-tight">{task.title}</h1>

            {/* Chips — scroll horizontal en mobile */}
            <div className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-1 px-1">
              <span className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-full font-medium border ${priorityColor[task.priority]}`}>
                {task.priority}
              </span>
              <span className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-full font-medium ${statusColor[task.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {task.status?.replace('_',' ')}
              </span>
              <span className={`flex-shrink-0 text-xs px-2.5 py-1.5 rounded-full font-medium ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                Vence: {task.due_date}
              </span>
              {hasCalendarEvent && (
                <span className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-full font-medium bg-blue-100 text-blue-600">
                  Cal: {new Date(activeEvent.event_date).toLocaleDateString('es-MX')}
                </span>
              )}
            </div>

            {task.description && (
              <p className="text-sm text-gray-600 mb-3 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                {task.description}
              </p>
            )}
            {task.requested_by && (
              <p className="text-xs text-gray-400 mb-4">
                Solicitante: <strong className="text-gray-600">{task.requested_by}</strong>
              </p>
            )}
            <p className="text-xs text-gray-400 mb-4">
              Actualizado {timeAgo(task.updated_at ?? task.created_at)}
            </p>

            {/* Acciones — botones grandes para touch */}
            <div className="flex gap-2 flex-wrap">
              {task.status !== 'completado' ? (
                <button onClick={handleComplete} disabled={loading}
                  className="flex-1 sm:flex-none bg-green-600 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 min-h-[48px]">
                  Completar
                </button>
              ) : (
                <button onClick={handleReactivate} disabled={loading}
                  className="flex-1 sm:flex-none bg-yellow-500 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50 min-h-[48px]">
                  Reactivar
                </button>
              )}
              {!hasCalendarEvent && calMode === 'none' && (
                <button onClick={() => setCalMode('create')}
                  className="flex-1 sm:flex-none border border-blue-300 text-blue-600 px-4 py-3 rounded-xl text-sm font-medium hover:bg-blue-50 min-h-[48px]">
                  Agregar a Calendar
                </button>
              )}
              {hasCalendarEvent && calMode === 'none' && (
                <>
                  <button onClick={() => {
                    setCalMode('reschedule')
                    setEventDate(activeEvent.event_date.split('T')[0])
                    setEventTime(activeEvent.event_date.split('T')[1]?.slice(0,5) ?? '09:00')
                  }} className="border border-blue-300 text-blue-600 px-4 py-3 rounded-xl text-sm font-medium hover:bg-blue-50 min-h-[48px]">
                    Reagendar
                  </button>
                  <button onClick={handleCancel} disabled={calLoading}
                    className="border border-red-200 text-red-500 px-4 py-3 rounded-xl text-sm font-medium hover:bg-red-50 min-h-[48px] disabled:opacity-50">
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
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Fecha</label>
                    <input type="date"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                      value={eventDate} onChange={e => setEventDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Hora</label>
                    <input type="time"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                      value={eventTime} onChange={e => setEventTime(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={calMode === 'create' ? handleCreate : handleReschedule} disabled={calLoading}
                    className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px]">
                    {calLoading ? 'Guardando...' : calMode === 'create' ? 'Crear evento' : 'Reagendar'}
                  </button>
                  <button onClick={() => setCalMode('none')}
                    className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tabs mobile */}
          <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden lg:hidden">
            {(['pasos','historial','adjuntos'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`flex-1 py-3 text-sm font-medium capitalize transition border-b-2 min-h-[48px] ${
                  activeTab === t ? 'border-teal-600 text-teal-600 bg-teal-50' : 'border-transparent text-gray-500'
                }`}>
                {t}
                {t === 'adjuntos' && attachments.length > 0 && (
                  <span className="ml-1 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{attachments.length}</span>
                )}
              </button>
            ))}
          </div>

          {/* Pasos */}
          <div className={activeTab === 'pasos' ? '' : 'hidden lg:block'}>
            <TaskSteps taskId={task.id} />
          </div>

          {/* Adjuntos mobile */}
          <div className={activeTab === 'adjuntos' ? 'lg:hidden' : 'hidden'}>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-700 mb-3">Archivos adjuntos</h2>
              <FileUploader taskId={id!} attachments={attachments} onRefresh={loadAttachments} />
              {imageAttachments.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {imageAttachments.map(att => (
                    <div key={att.id ?? att.url} className="relative group cursor-pointer aspect-square"
                      onClick={() => setLightbox(att.url)}>
                      <img src={att.url} alt={att.name}
                        className="w-full h-full object-cover rounded-lg border border-gray-200" />
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 mb-2">Pegar captura</p>
                <PasteImageUploader taskId={task.id} mode="zone"
                  onUploaded={async (url, name) => {
                    const user = await getCachedUser()
                    await supabase.from('attachments').insert({
                      task_id: task.id, url, name, type: 'image', created_by: user?.id,
                    })
                    loadAttachments()
                  }} />
              </div>
            </div>
          </div>

          {/* Historial mobile */}
          <div className={activeTab === 'historial' ? 'lg:hidden' : 'hidden'}>
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ maxHeight: '60vh' }}>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
                {history.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Sin comentarios.</p>}
                {hasMoreHistory && (
                  <button onClick={() => setHistoryLimit(p => p + 10)}
                    className="w-full text-xs text-teal-600 font-medium py-2.5 border border-dashed border-teal-200 rounded-lg min-h-[44px]">
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
              <div className="border-t border-gray-100 p-3">
                <PasteImageUploader taskId={task.id} mode="comment"
                  placeholder="Comentario o Ctrl+V para imagen..."
                  onComment={async (text, images) => {
                    const user = await getCachedUser()
                    const imageLinks = images.map(i => `\n![${i.name}](${i.url})`).join('')
                    await supabase.from('task_history').insert({
                      task_id: id, comment: text + imageLinks, created_by: user?.id,
                    })
                    toast.success('Comentario agregado'); load()
                  }} />
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha — solo desktop */}
        <div className="w-96 flex-shrink-0 space-y-4 hidden lg:block">

          {/* Historial desktop */}
          <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ maxHeight: '70vh' }}>
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-semibold text-gray-700">Historial</h2>
              <span className="text-xs text-gray-400">{history.length} entrada(s)</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {history.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Sin comentarios.</p>
              )}
              {hasMoreHistory && (
                <button onClick={() => setHistoryLimit(p => p + 10)}
                  className="w-full text-xs text-teal-600 font-medium py-2 border border-dashed border-teal-200 rounded-lg hover:bg-teal-50">
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
                        {h.reviewed_with && <p className="text-xs text-gray-400 mt-1">Con: {h.reviewed_with}</p>}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={historyEndRef} />
            </div>
            <div className="border-t border-gray-100 p-4">
              <PasteImageUploader taskId={task.id} mode="comment"
                placeholder="Comentario o Ctrl+V para imagen..."
                onComment={async (text, images) => {
                  const user = await getCachedUser()
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
                  setHistoryLimit(p => p + 1)
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
            <button onClick={() => setShowAttachSection(!showAttachSection)}
              className="w-full flex justify-between items-center min-h-[44px]">
              <h2 className="font-semibold text-gray-700 text-sm">
                Adjuntos
                {attachments.length > 0 && (
                  <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{attachments.length}</span>
                )}
              </h2>
              <span className="text-gray-400 text-xs">{showAttachSection ? 'v' : '>'}</span>
            </button>
            {showAttachSection && (
              <div className="mt-3 space-y-3">
                <FileUploader taskId={id!} attachments={attachments} onRefresh={loadAttachments} />
                {imageAttachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
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
                  <div className="space-y-1">
                    {docAttachments.map(att => (
                      <a key={att.id ?? att.url} href={att.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-xs text-teal-600 hover:underline py-1 min-h-[36px]">
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
                      const user = await getCachedUser()
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
    </div>
  )
}
