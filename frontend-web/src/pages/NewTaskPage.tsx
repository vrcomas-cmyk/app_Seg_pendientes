import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const suggestDate = (priority: string) => {
  const days: Record<string, number> = { alta: 1, media: 3, baja: 7 }
  const d = new Date()
  d.setDate(d.getDate() + days[priority])
  return d.toISOString().split('T')[0]
}

export default function NewTaskPage() {
  const nav = useNavigate()
  const [form, setForm] = useState({ title: '', description: '', priority: 'media', requested_by: '', due_date: suggestDate('media') })
  const [loading, setLoading] = useState(false)

  const handlePriority = (p: string) => setForm(f => ({ ...f, priority: p, due_date: suggestDate(p) }))

  const handleSubmit = async () => {
    if (!form.title || !form.requested_by) return toast.error('Título y solicitante son obligatorios')
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('tasks').insert({ ...form, created_by: user?.id })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Pendiente creado')
    nav('/tasks')
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Nuevo Pendiente</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Título *</label>
          <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
            placeholder="Describe el pendiente" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
          <textarea className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm h-24 resize-none outline-none focus:border-teal-400"
            placeholder="Detalle opcional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Quién lo solicita *</label>
          <input className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
            placeholder="Nombre del solicitante" value={form.requested_by} onChange={e => setForm(f => ({ ...f, requested_by: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Prioridad</label>
          <div className="flex gap-2">
            {['alta', 'media', 'baja'].map(p => (
              <button key={p} onClick={() => handlePriority(p)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${form.priority === p ? 'bg-teal-600 text-white border-teal-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Fecha límite (sugerida por prioridad)</label>
          <input type="date" className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
            value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
        <button onClick={handleSubmit} disabled={loading}
          className="w-full bg-teal-600 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-teal-700 transition">
          {loading ? 'Guardando...' : 'Crear Pendiente'}
        </button>
      </div>
    </div>
  )
}
