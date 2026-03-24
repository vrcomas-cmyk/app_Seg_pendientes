import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCalendar } from '../hooks/useCalendar'
import FileUploader from '../components/FileUploader'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL

export default function TaskDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { connectGoogle, createEvent, rescheduleEvent, cancelEvent, loading: calLoading } = useCalendar()
  const [task, setTask] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [calEvents, setCalEvents] = useState<any[]>([])
  const [attachments, setAttachments] = useState<any[]>([])
  const [comment, setComment] = useState('')
  const [reviewedWith, setReviewedWith] = useState('')
  const [loading, setLoading] = useState(false)
  const [calMode, setCalMode] = useState<'none' | 'create' | 'reschedule'>('none')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('09:00')

  const loadAttachments = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${API_URL}/tasks/${id}/attachments`, {
      headers: { Authorization: `Bearer ${session?.access_token}` }
    })
    const data = await res.json()
    setAttachments(Array.isArray(data) ? data : [])
  }

  const load = async () => {
    const [t, h, c] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', id).single(),
      supabase.from('task_history').select('*, users:created_by(full_name, email)').eq('task_id', id).order('created_at'),
      supabase.from('calendar_events').select('*').eq('task_id', id).eq('is_active', true),
    ])
    setTask(t.data)
    setHistory(h.data ?? [])
    setCalEvents(c.data ?? [])
    if (t.data?.due_date) setEventDate(t.data.due_date)
    await loadAttachments()
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('calendar') === 'connected') toast.success('Google Calendar conectado')
  }, [])

  const addHistory = async () => {
    if (!comment) return toast.error('Escribe un comentario')
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('task_history').insert({
      task_id: id, comment, reviewed_with: reviewedWith || null, created_by: user?.id
    })
    setComment(''); setReviewedWith('')
    toast.success('Comentario agregado')
    load()
  }

  const changeStatus = async (status: string, removeCalendar: boolean) => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (removeCalendar && hasCalendarEvent) await cancelEvent(id!)
    await supabase.from('tasks').update({ status }).eq('id', id)
    await supabase.from('task_history').insert({
      task_id: id, comment: `Pendiente marcado como ${status}.`, created_by: user?.id
    })
    toast.success(`Marcado como ${status}`)
    load()
    setLoading(false)
  }

  const handleComplete = async () => {
    if (hasCalendarEvent) {
      const remove = window.confirm('¿También quieres eliminar el evento de Google Calendar?')
      await changeStatus('completado', remove)
    } else {
      await changeStatus('completado', false)
    }
  }

  const handleReactivate = async () => {
    if (hasCalendarEvent) {
      const remove = window.confirm('¿También quieres eliminar el evento de Google Calendar?')
      await changeStatus('reactivado', remove)
    } else {
      await changeStatus('reactivado', false)
    }
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
      setCalMode('none')
      load()
    } else {
      toast.error(result.error ?? 'Error al crear evento')
    }
  }

  const handleReschedule = async () => {
    if (!eventDate || !eventTime) return toast.error('Selecciona fecha y hora')
    const result = await rescheduleEvent(id!, eventDate, eventTime)
    if (result.success) {
      toast.success('Evento reagendado en Google Calendar')
      setCalMode('none')
      load()
    } else {
      toast.error(result.error ?? 'Error al reagendar')
    }
  }

  const handleCancel = async () => {
    const result = await cancelEvent(id!)
    if (result.success) {
      toast.success('Evento eliminado de Google Calendar')
      load()
    } else {
      toast.error(result.error ?? 'Error al eliminar evento')
    }
  }

  if (!task) return <div className="text-sm text-gray-400 p-6">Cargando...</div>

  const priorityColor: Record<string, string> = {
    alta: 'bg-red-100 text-red-700',
    media: 'bg-yellow-100 text-yellow-700',
    baja: 'bg-green-100 text-green-700'
  }
  const hasCalendarEvent = calEvents.length > 0
  const activeEvent = calEvents[0]

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => nav('/tasks')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">← Volver</button>

      {/* Info del pendiente */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex justify-between items-start mb-3">
          <h1 className="text-xl font-bold text-gray-800">{task.title}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${priorityColor[task.priority]}`}>{task.priority}</span>
        </div>
        {task.description && <p className="text-sm text-gray-500 mb-3">{task.description}</p>}
        <div className="text-xs text-gray-400 space-y-1">
          <p>Solicitante: <span className="text-gray-600">{task.requested_by}</span></p>
          <p>Fecha límite: <span className="text-gray-600">{task.due_date}</span></p>
          <p>Estatus: <span className="text-gray-600 font-medium">{task.status}</span></p>
          {hasCalendarEvent && (
            <p>Evento Calendar: <span className="text-blue-600">
              {new Date(activeEvent.event_date).toLocaleString('es-MX')}
            </span></p>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {task.status !== 'completado' && (
            <button onClick={handleComplete} disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Completar
            </button>
          )}
          {task.status === 'completado' && (
            <button onClick={handleReactivate} disabled={loading}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50">
              Reactivar
            </button>
          )}
          {!hasCalendarEvent && calMode === 'none' && (
            <button onClick={() => setCalMode('create')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
              📅 Agregar a Calendar
            </button>
          )}
          {hasCalendarEvent && calMode === 'none' && (
            <>
              <button onClick={() => { setCalMode('reschedule'); setEventDate(activeEvent.event_date.split('T')[0]); setEventTime(activeEvent.event_date.split('T')[1]?.slice(0,5) ?? '09:00') }}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600">
                📅 Reagendar
              </button>
              <button onClick={handleCancel} disabled={calLoading}
                className="bg-red-100 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-200 disabled:opacity-50">
                🗑 Quitar evento
              </button>
            </>
          )}
        </div>

        {/* Formulario crear/reagendar Calendar */}
        {(calMode === 'create' || calMode === 'reschedule') && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-700 mb-3">
              {calMode === 'create' ? 'Selecciona fecha y hora del recordatorio' : 'Nueva fecha y hora del evento'}
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
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Archivos adjuntos */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <FileUploader
          taskId={id!}
          attachments={attachments}
          onRefresh={loadAttachments} />
      </div>

      {/* Seguimiento */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-700 mb-4">Agregar seguimiento</h2>
        <textarea className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm h-20 resize-none outline-none focus:border-teal-400 mb-3"
          placeholder="Comentario u observación" value={comment} onChange={e => setComment(e.target.value)} />
        <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400 mb-3"
          placeholder="Con quién se revisó (opcional)" value={reviewedWith} onChange={e => setReviewedWith(e.target.value)} />
        <button onClick={addHistory} className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          Agregar
        </button>
      </div>

      {/* Historial */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-700 mb-4">Historial</h2>
        {history.length === 0 && <p className="text-sm text-gray-400">Sin comentarios aún.</p>}
        {history.map(h => (
          <div key={h.id} className="border-b border-gray-100 last:border-0 py-3">
            <p className="text-sm text-gray-700">{h.comment}</p>
            {h.reviewed_with && <p className="text-xs text-gray-400 mt-1">Con: {h.reviewed_with}</p>}
            <p className="text-xs text-gray-300 mt-1">
              {new Date(h.created_at).toLocaleString('es-MX')} · {h.users?.full_name || h.users?.email || 'Usuario'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
