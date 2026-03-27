import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import ImageLightbox from './ImageLightbox'
import PasteImageUploader from './PasteImageUploader'
import toast from 'react-hot-toast'

interface Props {
  taskId: string
}

export default function TaskSteps({ taskId }: Props) {
  const [steps, setSteps] = useState<any[]>([])
  const [stepHistories, setStepHistories] = useState<Record<string, any[]>>({})
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [showNewStep, setShowNewStep] = useState(false)
  const [newStep, setNewStep] = useState({ title: '', description: '', due_date: '', assigned_to: '' })
  const [saving, setSaving] = useState(false)
  const [editingStep, setEditingStep] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  const load = async () => {
    const { data } = await supabase.from('task_steps')
      .select('*').eq('task_id', taskId).order('order_index').order('created_at')
    setSteps(data ?? [])
  }

  const loadHistory = async (stepId: string) => {
    const { data } = await supabase.from('task_step_history')
      .select('*, users:created_by(full_name, email)')
      .eq('step_id', stepId).order('created_at')
    setStepHistories(prev => ({ ...prev, [stepId]: data ?? [] }))
  }

  useEffect(() => { load() }, [taskId])

  const addStep = async () => {
    if (!newStep.title.trim()) return toast.error('El titulo es obligatorio')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const maxOrder = steps.length > 0 ? Math.max(...steps.map(s => s.order_index ?? 0)) + 1 : 0
    await supabase.from('task_steps').insert({
      task_id: taskId, title: newStep.title.trim(),
      description: newStep.description || null, due_date: newStep.due_date || null,
      assigned_to: newStep.assigned_to || null, order_index: maxOrder, created_by: user?.id,
    })
    setNewStep({ title: '', description: '', due_date: '', assigned_to: '' })
    setShowNewStep(false)
    toast.success('Paso agregado')
    load(); setSaving(false)
  }

  const toggleComplete = async (step: any) => {
    const { data: { user } } = await supabase.auth.getUser()
    const completado = !step.completado
    await supabase.from('task_steps').update({
      completado, completed_at: completado ? new Date().toISOString() : null,
      completed_by: completado ? user?.id : null,
    }).eq('id', step.id)
    await supabase.from('task_step_history').insert({
      step_id: step.id, comment: completado ? 'Paso completado' : 'Paso reabierto', created_by: user?.id,
    })
    load()
    if (expandedStep === step.id) loadHistory(step.id)
  }

  const deleteStep = async (stepId: string) => {
    if (!window.confirm('Eliminar este paso?')) return
    await supabase.from('task_steps').delete().eq('id', stepId)
    toast.success('Paso eliminado'); load()
  }

  const saveEdit = async (stepId: string) => {
    await supabase.from('task_steps').update({
      title: editForm.title, description: editForm.description || null,
      due_date: editForm.due_date || null, assigned_to: editForm.assigned_to || null,
    }).eq('id', stepId)
    setEditingStep(null); toast.success('Paso actualizado'); load()
  }

  const toggleExpand = (stepId: string) => {
    if (expandedStep === stepId) { setExpandedStep(null) }
    else { setExpandedStep(stepId); loadHistory(stepId) }
  }

  const renderComment = (text: string) => {
    const parts = text.split(/(!\[.*?\]\(.*?\))/)
    return parts.map((part, i) => {
      const match = part.match(/!\[(.*?)\]\((.*?)\)/)
      if (match) {
        return (
          <div key={i} className="mt-1 relative group inline-block cursor-pointer"
            onClick={() => setLightbox(match[2])}>
            <img src={match[2]} alt={match[1]}
              className="max-h-32 rounded-lg border border-gray-200 hover:opacity-90 transition object-cover" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition rounded-lg bg-black bg-opacity-30">
              <span className="text-white text-xs font-medium">Ver</span>
            </div>
          </div>
        )
      }
      return part ? <span key={i}>{part}</span> : null
    })
  }

  const completados = steps.filter(s => s.completado).length
  const total = steps.length
  const today = new Date().toISOString().split('T')[0]

  return (
    <>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-semibold text-gray-700">Pasos / Subtareas</h2>
            {total > 0 && <p className="text-xs text-gray-400 mt-0.5">{completados} de {total} completados</p>}
          </div>
          <button onClick={() => setShowNewStep(!showNewStep)}
            className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700">
            + Agregar paso
          </button>
        </div>

        {total > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
            <div className="bg-teal-500 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.round((completados / total) * 100)}%` }} />
          </div>
        )}

        {showNewStep && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4 space-y-2">
            <p className="text-xs font-semibold text-teal-700 mb-2">Nuevo paso</p>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white"
              placeholder="Titulo del paso *" value={newStep.title}
              onChange={e => setNewStep(x => ({ ...x, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addStep()} />
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white h-16 resize-none"
              placeholder="Descripcion (opcional)" value={newStep.description}
              onChange={e => setNewStep(x => ({ ...x, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha limite</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white"
                  value={newStep.due_date} onChange={e => setNewStep(x => ({ ...x, due_date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Responsable</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white"
                  placeholder="Nombre o area" value={newStep.assigned_to}
                  onChange={e => setNewStep(x => ({ ...x, assigned_to: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={addStep} disabled={saving}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Agregar'}
              </button>
              <button onClick={() => setShowNewStep(false)}
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {steps.length === 0 && !showNewStep && (
          <p className="text-sm text-gray-400 text-center py-4">Sin pasos aun. Agrega el primero arriba.</p>
        )}

        <div className="space-y-2">
          {steps.map((step, idx) => {
            const isExpanded = expandedStep === step.id
            const isEditing = editingStep === step.id
            const hist = stepHistories[step.id] ?? []
            const isOverdue = step.due_date && !step.completado && step.due_date < today
            return (
              <div key={step.id} className={`border rounded-xl overflow-hidden transition ${step.completado ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-start gap-3 px-4 py-3">
                  <button onClick={() => toggleComplete(step)}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${step.completado ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-300 hover:border-teal-400'}`}>
                    {step.completado && <span className="text-xs">v</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400"
                          value={editForm.title} onChange={e => setEditForm((x: any) => ({ ...x, title: e.target.value }))} />
                        <textarea className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-teal-400 h-14 resize-none"
                          value={editForm.description ?? ''} onChange={e => setEditForm((x: any) => ({ ...x, description: e.target.value }))} placeholder="Descripcion" />
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-teal-400"
                            value={editForm.due_date ?? ''} onChange={e => setEditForm((x: any) => ({ ...x, due_date: e.target.value }))} />
                          <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-teal-400"
                            placeholder="Responsable" value={editForm.assigned_to ?? ''} onChange={e => setEditForm((x: any) => ({ ...x, assigned_to: e.target.value }))} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(step.id)} className="bg-teal-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-teal-700">Guardar</button>
                          <button onClick={() => setEditingStep(null)} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-xs font-medium hover:bg-gray-200">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400 font-medium">{idx + 1}.</span>
                          <p className={`text-sm font-medium ${step.completado ? 'line-through text-gray-400' : 'text-gray-800'}`}>{step.title}</p>
                          {step.completado && <span className="text-xs bg-teal-100 text-teal-600 px-2 py-0.5 rounded-full font-medium">Completado</span>}
                          {isOverdue && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Vencido</span>}
                        </div>
                        {step.description && <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>}
                        <div className="flex gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          {step.due_date && <span className={isOverdue ? 'text-red-500' : ''}>Fecha: {step.due_date}</span>}
                          {step.assigned_to && <span>Responsable: {step.assigned_to}</span>}
                          {step.completed_at && <span className="text-teal-500">Completado: {new Date(step.completed_at).toLocaleDateString('es-MX')}</span>}
                        </div>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => toggleExpand(step.id)}
                        className={`text-xs px-2 py-1 rounded-lg transition font-medium ${isExpanded ? 'bg-teal-100 text-teal-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
                        {isExpanded ? 'A' : 'V'} {hist.length > 0 ? hist.length : ''}
                      </button>
                      <button onClick={() => { setEditingStep(step.id); setEditForm({ ...step }) }}
                        className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">
                        E
                      </button>
                      <button onClick={() => deleteStep(step.id)}
                        className="text-xs text-gray-300 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50">
                        X
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                    {hist.length > 0 && (
                      <div className="mb-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historial</p>
                        {hist.map(h => (
                          <div key={h.id} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                            <div className="text-xs text-gray-700">{renderComment(h.comment ?? '')}</div>
                            <p className="text-xs text-gray-300 mt-1">
                              {new Date(h.created_at).toLocaleString('es-MX')} · {h.users?.full_name || h.users?.email || 'Usuario'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Agregar nota</p>
                    <PasteImageUploader
                      taskId={taskId}
                      mode="comment"
                      placeholder="Nota sobre este paso o pega una imagen con Ctrl+V..."
                      onComment={async (text, images) => {
                        const { data: { user } } = await supabase.auth.getUser()
                        const imageLinks = images.map(i => `\n![${i.name}](${i.url})`).join('')
                        await supabase.from('task_step_history').insert({
                          step_id: step.id, comment: text + imageLinks, created_by: user?.id,
                        })
                        loadHistory(step.id)
                        toast.success('Nota agregada')
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
