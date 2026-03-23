import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function TaskDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [task, setTask] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [comment, setComment] = useState('')
  const [reviewedWith, setReviewedWith] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    const [t, h] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', id).single(),
      supabase.from('task_history').select('*, users:created_by(full_name, email)').eq('task_id', id).order('created_at'),
    ])
    setTask(t.data)
    setHistory(h.data ?? [])
  }

  useEffect(() => { load() }, [id])

  const addHistory = async () => {
    if (!comment) return toast.error('Escribe un comentario')
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('task_history').insert({ task_id: id, comment, reviewed_with: reviewedWith || null, created_by: user?.id })
    setComment(''); setReviewedWith('')
    toast.success('Comentario agregado')
    load()
  }

  const changeStatus = async (status: string) => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('tasks').update({ status }).eq('id', id)
    await supabase.from('task_history').insert({ task_id: id, comment: `Pendiente marcado como ${status}.`, created_by: user?.id })
    toast.success(`Marcado como ${status}`)
    load()
    setLoading(false)
  }

  if (!task) return <div className="text-sm text-gray-400 p-6">Cargando...</div>

  const priorityColor: Record<string, string> = { alta: 'bg-red-100 text-red-700', media: 'bg-yellow-100 text-yellow-700', baja: 'bg-green-100 text-green-700' }

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => nav('/tasks')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">← Volver</button>
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
        </div>
        <div className="flex gap-2 mt-4">
          {task.status !== 'completado' && (
            <button onClick={() => changeStatus('completado')} disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Completar
            </button>
          )}
          {task.status === 'completado' && (
            <button onClick={() => changeStatus('reactivado')} disabled={loading}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50">
              Reactivar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-700 mb-4">Agregar seguimiento</h2>
        <textarea className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm h-20 resize-none outline-none focus:border-teal-400 mb-3"
          placeholder="Comentario u observación" value={comment} onChange={e => setComment(e.target.value)} />
        <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400 mb-3"
          placeholder="Con quién se revisó (opcional)" value={reviewedWith} onChange={e => setReviewedWith(e.target.value)} />
        <button onClick={addHistory} className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">Agregar</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-700 mb-4">Historial</h2>
        {history.length === 0 && <p className="text-sm text-gray-400">Sin comentarios aún.</p>}
        {history.map(h => (
          <div key={h.id} className="border-b border-gray-100 last:border-0 py-3">
            <p className="text-sm text-gray-700">{h.comment}</p>
            {h.reviewed_with && <p className="text-xs text-gray-400 mt-1">Con: {h.reviewed_with}</p>}
            <p className="text-xs text-gray-300 mt-1">{new Date(h.created_at).toLocaleString('es-MX')} · {h.users?.full_name || h.users?.email || 'Usuario'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
