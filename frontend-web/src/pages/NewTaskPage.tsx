import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getCachedUser } from '../lib/supabase'
import { useCalendar } from '../hooks/useCalendar'
import DescriptionEditor from '../components/DescriptionEditor'
import toast from 'react-hot-toast'

const SOLICITANTES_KEY = 'recent_solicitantes_v1'
const MAX_SUGGESTIONS = 20

const suggestDate = (priority: string) => {
  const days: Record<string, number> = { alta: 1, media: 3, baja: 7 }
  const d = new Date()
  d.setDate(d.getDate() + days[priority])
  return d.toISOString().split('T')[0]
}

function loadSolicitantes(): string[] {
  try {
    const raw = localStorage.getItem(SOLICITANTES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveSolicitante(name: string) {
  const clean = name.trim()
  if (!clean) return
  const existing = loadSolicitantes()
  const updated = [clean, ...existing.filter(s => s.toLowerCase() !== clean.toLowerCase())]
    .slice(0, MAX_SUGGESTIONS)
  localStorage.setItem(SOLICITANTES_KEY, JSON.stringify(updated))
}

interface StepDraft {
  tmpId: string
  title: string
  description: string
  due_date: string
  assigned_to: string
  imagePaths: string[]
}

interface AttDraft {
  path: string
  url: string
  name: string
  type: 'image' | 'file'
  size_kb: number
  mime: string
}

// ============================================================
// StepRow
// ============================================================

interface StepRowProps {
  step: StepDraft
  index: number
  total: number
  isEditing: boolean
  showTitleError: boolean
  taskId: string
  onStartEdit: () => void
  onCollapse: () => void
  onDiscard: () => void
  onSaveAndNew: () => void
  onUpdate: (patch: Partial<StepDraft>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onImageUploaded: (path: string) => void
}

function StepRow({
  step, index, total, isEditing, showTitleError, taskId,
  onStartEdit, onCollapse, onDiscard, onSaveAndNew,
  onUpdate, onRemove, onMoveUp, onMoveDown, onImageUploaded,
}: StepRowProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isEditing) {
      requestAnimationFrame(() => titleRef.current?.focus())
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) return
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onCollapse()
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [isEditing, onCollapse])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    const isTitleInput = target === titleRef.current

    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSaveAndNew()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && isTitleInput) {
      e.preventDefault()
      onCollapse()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      const isEmpty = !step.title.trim() && !step.description.trim()
        && !step.due_date && !step.assigned_to.trim()
      if (isEmpty) onDiscard()
      else onCollapse()
    }
  }

  const imageCount = (step.description.match(/!\[.*?\]\(.*?\)/g) ?? []).length
  const isOverdue = step.due_date && step.due_date < new Date().toISOString().split('T')[0]

  if (!isEditing) {
    return (
      <div className="border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition group">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="flex flex-col gap-0.5 flex-shrink-0">
            <button type="button" onClick={onMoveUp} disabled={index === 0}
              className="w-5 h-4 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
              title="Subir">
              ▲
            </button>
            <button type="button" onClick={onMoveDown} disabled={index === total - 1}
              className="w-5 h-4 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
              title="Bajar">
              ▼
            </button>
          </div>

          <span className="text-xs text-gray-400 font-semibold w-5 flex-shrink-0">
            {index + 1}.
          </span>

          <button type="button" onClick={onStartEdit}
            className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-gray-800 truncate">
              {step.title || <span className="text-gray-400 italic">Sin título</span>}
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {step.assigned_to && (
                <span className="text-xs text-gray-400">👤 {step.assigned_to}</span>
              )}
              {step.due_date && (
                <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                  📅 {step.due_date}
                </span>
              )}
              {imageCount > 0 && (
                <span className="text-xs text-teal-600">🖼 {imageCount}</span>
              )}
              {step.description && !imageCount && (
                <span className="text-xs text-gray-400 truncate max-w-[12rem]">
                  {step.description.slice(0, 40)}{step.description.length > 40 ? '…' : ''}
                </span>
              )}
            </div>
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button type="button" onClick={onStartEdit}
              className="text-xs text-gray-400 hover:text-teal-600 px-2 py-1 rounded hover:bg-teal-50"
              title="Editar">
              ✎
            </button>
            <button type="button" onClick={onRemove}
              className="text-xs text-gray-300 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50"
              title="Eliminar">
              ✕
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} onKeyDown={handleKeyDown}
      className="border-2 border-teal-300 rounded-xl bg-teal-50/30 p-3 space-y-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs text-teal-700 font-semibold w-5 flex-shrink-0">
          {index + 1}.
        </span>
        <input
          ref={titleRef}
          className={`flex-1 border rounded-lg px-3 py-2 text-sm outline-none bg-white ${
            showTitleError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-teal-400'
          }`}
          placeholder="Título del paso *"
          value={step.title}
          onChange={e => onUpdate({ title: e.target.value })} />
        <button type="button" onClick={onRemove}
          className="text-xs text-gray-400 hover:text-red-500 px-2 py-2 rounded hover:bg-red-50 flex-shrink-0"
          title="Eliminar paso">
          ✕
        </button>
      </div>

      {showTitleError && (
        <p className="text-xs text-red-500 ml-7">
          Ponle un título al paso antes de continuar.
        </p>
      )}

      <div className="ml-7 space-y-2">
        <DescriptionEditor
          value={step.description}
          onChange={v => onUpdate({ description: v })}
          folderId={`${taskId}/steps/${step.tmpId}`}
          placeholder="Detalle o pega capturas con Ctrl+V... (opcional)"
          rows={2}
          onImageUploaded={onImageUploaded}
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Fecha límite</label>
            <input type="date"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400 bg-white"
              value={step.due_date}
              onChange={e => onUpdate({ due_date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-0.5">Responsable</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400 bg-white"
              placeholder="Nombre o área"
              value={step.assigned_to}
              onChange={e => onUpdate({ assigned_to: e.target.value })} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
          <p className="text-[10px] text-gray-400">
            <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">Enter</kbd> guardar · <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">Ctrl+Enter</kbd> nuevo · <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded text-[10px]">Esc</kbd> cerrar
          </p>
          <button type="button" onClick={onCollapse}
            className="bg-teal-600 text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-teal-700">
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// NewTaskPage
// ============================================================

export default function NewTaskPage() {
  const nav = useNavigate()
  const { createEvent, connectGoogle } = useCalendar()
  const [taskId] = useState(() => crypto.randomUUID())

  const [form, setForm] = useState({
    requested_by: '',
    title: '',
    description: '',
    priority: 'media',
    due_date: suggestDate('media'),
  })

  const [solicitantes, setSolicitantes] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const solicitanteBoxRef = useRef<HTMLDivElement>(null)

  const [steps, setSteps] = useState<StepDraft[]>([])
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [titleErrorId, setTitleErrorId] = useState<string | null>(null)
  const [stepsExpanded, setStepsExpanded] = useState(false)

  const [attachments, setAttachments] = useState<AttDraft[]>([])
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [calEnabled, setCalEnabled] = useState(false)
  const [eventDate, setEventDate] = useState(form.due_date)
  const [eventTime, setEventTime] = useState('09:00')

  const [loading, setLoading] = useState(false)

  useEffect(() => { setSolicitantes(loadSolicitantes()) }, [])
  useEffect(() => { setEventDate(form.due_date) }, [form.due_date])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (solicitanteBoxRef.current && !solicitanteBoxRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handlePriority = (p: string) =>
    setForm(f => ({ ...f, priority: p, due_date: suggestDate(p) }))

  // ===== Subtareas =====

  const tryCollapseEditing = (): boolean => {
    if (!editingStepId) return true
    const current = steps.find(s => s.tmpId === editingStepId)
    if (!current) { setEditingStepId(null); setTitleErrorId(null); return true }
    if (!current.title.trim()) {
      setTitleErrorId(editingStepId)
      return false
    }
    setEditingStepId(null)
    setTitleErrorId(null)
    return true
  }

  const addStep = () => {
    if (!tryCollapseEditing()) {
      toast.error('Completa el paso actual antes de agregar uno nuevo')
      return
    }
    const newStep: StepDraft = {
      tmpId: crypto.randomUUID(),
      title: '', description: '', due_date: '', assigned_to: '',
      imagePaths: [],
    }
    setSteps(s => [newStep, ...s])
    setEditingStepId(newStep.tmpId)
    setStepsExpanded(true)
  }

  const updateStep = (tmpId: string, patch: Partial<StepDraft>) => {
    setSteps(s => s.map(st => st.tmpId === tmpId ? { ...st, ...patch } : st))
    if (titleErrorId === tmpId && patch.title !== undefined && patch.title.trim()) {
      setTitleErrorId(null)
    }
  }

  const removeStep = async (tmpId: string) => {
    const step = steps.find(s => s.tmpId === tmpId)
    if (step && step.imagePaths.length > 0) {
      await supabase.storage.from('attachments').remove(step.imagePaths).catch(() => {})
    }
    setSteps(s => s.filter(st => st.tmpId !== tmpId))
    if (editingStepId === tmpId) setEditingStepId(null)
    if (titleErrorId === tmpId) setTitleErrorId(null)
  }

  const discardStep = (tmpId: string) => {
    setSteps(s => s.filter(st => st.tmpId !== tmpId))
    if (editingStepId === tmpId) setEditingStepId(null)
    if (titleErrorId === tmpId) setTitleErrorId(null)
  }

  const moveStep = (tmpId: string, direction: -1 | 1) => {
    setSteps(s => {
      const idx = s.findIndex(st => st.tmpId === tmpId)
      if (idx < 0) return s
      const newIdx = idx + direction
      if (newIdx < 0 || newIdx >= s.length) return s
      const copy = [...s]
      ;[copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]]
      return copy
    })
  }

  const saveAndNew = (tmpId: string) => {
    const current = steps.find(s => s.tmpId === tmpId)
    if (current && !current.title.trim()) {
      setTitleErrorId(tmpId)
      return
    }
    setEditingStepId(null)
    setTitleErrorId(null)
    setTimeout(() => {
      const newStep: StepDraft = {
        tmpId: crypto.randomUUID(),
        title: '', description: '', due_date: '', assigned_to: '',
        imagePaths: [],
      }
      setSteps(s => [newStep, ...s])
      setEditingStepId(newStep.tmpId)
    }, 0)
  }

  const addImagePathToStep = (tmpId: string, path: string) => {
    setSteps(s => s.map(st =>
      st.tmpId === tmpId ? { ...st, imagePaths: [...st.imagePaths, path] } : st
    ))
  }

  // ===== Adjuntos =====

  const uploadAttachmentFile = async (file: File) => {
    setUploadingFile(true)
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase()
    const filename = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    const path = `${taskId}/${filename}`
    const { error } = await supabase.storage
      .from('attachments')
      .upload(path, file, { contentType: file.type, upsert: false })
    setUploadingFile(false)
    if (error) { toast.error('Error al subir: ' + error.message); return }
    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
    setAttachments(prev => [...prev, {
      path, url: publicUrl, name: file.name,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      size_kb: Math.round(file.size / 1024),
      mime: file.type,
    }])
    toast.success(`${file.name} agregado`)
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const f of files) await uploadAttachmentFile(f)
    e.target.value = ''
  }

  const openFilePicker = () => {
    setAttachmentsExpanded(true)
    fileInputRef.current?.click()
  }

  const removeAttachment = async (att: AttDraft) => {
    await supabase.storage.from('attachments').remove([att.path]).catch(() => {})
    setAttachments(prev => prev.filter(a => a.path !== att.path))
  }

  // ===== Cancelar =====

  const cleanupUploads = async () => {
    const allPaths: string[] = []
    allPaths.push(...attachments.map(a => a.path))
    for (const step of steps) allPaths.push(...step.imagePaths)
    const descMatches = Array.from(form.description.matchAll(/!\[.*?\]\(.*?\/attachments\/(.+?)\)/g))
    allPaths.push(...descMatches.map(m => m[1].split('?')[0]))
    if (allPaths.length > 0) await supabase.storage.from('attachments').remove(allPaths).catch(() => {})
  }

  const handleCancel = async () => {
    const hasContent = attachments.length > 0 || steps.length > 0
      || form.description.trim() || form.title.trim() || form.requested_by.trim()
    if (!hasContent) { nav('/tasks'); return }
    if (!window.confirm('¿Descartar este pendiente? Se eliminarán adjuntos e imágenes cargadas.')) return
    await cleanupUploads()
    nav('/tasks')
  }

  // ===== Guardar =====

  const handleSubmit = async () => {
    if (!form.requested_by.trim()) return toast.error('Quién lo solicita es obligatorio')
    if (!form.title.trim()) return toast.error('El título es obligatorio')

    if (!tryCollapseEditing()) {
      toast.error('Completa el paso en edición o elimínalo antes de guardar')
      return
    }
    const invalidSteps = steps.filter(s => !s.title.trim())
    if (invalidSteps.length > 0) {
      toast.error(`Hay ${invalidSteps.length} paso(s) sin título. Revisa o elimínalos.`)
      return
    }

    setLoading(true)
    const user = await getCachedUser()

    try {
      const { error: taskErr } = await supabase.from('tasks').insert({
        id: taskId,
        title: form.title.trim(),
        description: form.description,
        priority: form.priority,
        requested_by: form.requested_by.trim(),
        due_date: form.due_date,
        created_by: user?.id,
      })
      if (taskErr) throw new Error('No se pudo crear el pendiente: ' + taskErr.message)

      if (steps.length > 0) {
        const stepRows = steps.map((s, idx) => ({
          task_id: taskId,
          title: s.title.trim(),
          description: s.description.trim() || null,
          due_date: s.due_date || null,
          assigned_to: s.assigned_to.trim() || null,
          order_index: idx,
          created_by: user?.id,
        }))
        const { error: stepsErr } = await supabase.from('task_steps').insert(stepRows)
        if (stepsErr) console.error('Error insertando pasos:', stepsErr.message)
      }

      if (attachments.length > 0) {
        const attRows = attachments.map(a => ({
          task_id: taskId,
          url: a.url,
          name: a.name,
          type: a.type,
          filename: a.name,
          file_url: a.url,
          file_path: a.path,
          file_type: a.mime,
          file_size_kb: a.size_kb,
          uploaded_by: user?.id,
          created_by: user?.id,
        }))
        const { error: attErr } = await supabase.from('attachments').insert(attRows)
        if (attErr) console.error('Error insertando adjuntos:', attErr.message)
      }

      if (calEnabled) {
        const result = await createEvent(taskId, eventDate, eventTime)
        if (result.needsAuth) {
          toast('Conecta tu Google Calendar y vuelve a intentar', { icon: '📅' })
          setTimeout(() => connectGoogle(), 1200)
        } else if (result.success) {
          toast.success('Evento agregado a Calendar')
        } else if (result.error) {
          toast.error('Evento: ' + result.error)
        }
      }

      saveSolicitante(form.requested_by)
      toast.success('Pendiente creado')
      nav(`/tasks/${taskId}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar')
      setLoading(false)
    }
  }

  const filteredSuggestions = solicitantes.filter(s =>
    form.requested_by.trim() === '' ||
    (s.toLowerCase().includes(form.requested_by.toLowerCase()) &&
     s.toLowerCase() !== form.requested_by.toLowerCase())
  ).slice(0, 6)

  // ===== Render =====

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Nuevo pendiente</h1>
        <button onClick={handleCancel}
          className="text-sm text-gray-400 hover:text-gray-600">
          Cancelar
        </button>
      </div>

      <div className="space-y-4">
        {/* ======= DATOS BÁSICOS ======= */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 space-y-4">

          {/* Solicitante */}
          <div ref={solicitanteBoxRef} className="relative">
            <label className="text-xs text-gray-500 mb-1 block">
              Quién lo solicita <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
              placeholder="Nombre del solicitante"
              value={form.requested_by}
              onChange={e => { setForm(f => ({ ...f, requested_by: e.target.value })); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              autoFocus
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 px-3 pt-2 pb-1 font-semibold">
                  Recientes
                </p>
                {filteredSuggestions.map(s => (
                  <button key={s} type="button"
                    onClick={() => { setForm(f => ({ ...f, requested_by: s })); setShowSuggestions(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Título */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
              placeholder="Describe el pendiente"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Descripción
              <span className="ml-2 text-gray-400 font-normal">· Ctrl+V para capturas</span>
            </label>
            <DescriptionEditor
              value={form.description}
              onChange={v => setForm(f => ({ ...f, description: v }))}
              folderId={taskId}
              isDraft={false}
              placeholder="Detalle opcional. Pega capturas con Ctrl+V, arrastra imágenes o usa 📎."
              rows={4}
            />
          </div>

          {/* Prioridad y fecha */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-2 block">Prioridad</label>
              <div className="flex gap-2">
                {['alta', 'media', 'baja'].map(p => (
                  <button key={p} type="button" onClick={() => handlePriority(p)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      form.priority === p
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Fecha límite <span className="text-gray-400">(sugerida)</span>
              </label>
              <input type="date"
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* ======= SUBTAREAS (COLAPSABLE) ======= */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 sm:py-4 gap-2">
            <button type="button"
              onClick={() => setStepsExpanded(v => !v)}
              className="flex items-center gap-2 text-left flex-1 min-w-0 min-h-[32px]">
              <span className={`text-gray-400 text-xs transition-transform ${stepsExpanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
              <h2 className="text-sm font-semibold text-gray-700">
                Subtareas / Pasos
              </h2>
              {steps.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {steps.length}
                </span>
              )}
              {!stepsExpanded && steps.length === 0 && (
                <span className="text-xs text-gray-400">— opcional</span>
              )}
            </button>
            <button type="button" onClick={addStep}
              className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 flex-shrink-0">
              + Agregar paso
            </button>
          </div>

          {stepsExpanded && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-3 space-y-2">
              {steps.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-lg">
                  Agrega subtareas que desglosen el pendiente.
                </p>
              )}
              {steps.map((s, idx) => (
                <StepRow
                  key={s.tmpId}
                  step={s}
                  index={idx}
                  total={steps.length}
                  isEditing={editingStepId === s.tmpId}
                  showTitleError={titleErrorId === s.tmpId}
                  taskId={taskId}
                  onStartEdit={() => {
                    if (editingStepId && editingStepId !== s.tmpId) {
                      if (!tryCollapseEditing()) {
                        toast.error('Completa el paso actual primero')
                        return
                      }
                    }
                    setEditingStepId(s.tmpId)
                  }}
                  onCollapse={() => tryCollapseEditing()}
                  onDiscard={() => discardStep(s.tmpId)}
                  onSaveAndNew={() => saveAndNew(s.tmpId)}
                  onUpdate={patch => updateStep(s.tmpId, patch)}
                  onRemove={() => removeStep(s.tmpId)}
                  onMoveUp={() => moveStep(s.tmpId, -1)}
                  onMoveDown={() => moveStep(s.tmpId, 1)}
                  onImageUploaded={path => addImagePathToStep(s.tmpId, path)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ======= ADJUNTOS (COLAPSABLE) ======= */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 sm:py-4 gap-2">
            <button type="button"
              onClick={() => setAttachmentsExpanded(v => !v)}
              className="flex items-center gap-2 text-left flex-1 min-w-0 min-h-[32px]">
              <span className={`text-gray-400 text-xs transition-transform ${attachmentsExpanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
              <h2 className="text-sm font-semibold text-gray-700">
                Archivos adjuntos
              </h2>
              {attachments.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {attachments.length}
                </span>
              )}
              {!attachmentsExpanded && attachments.length === 0 && (
                <span className="text-xs text-gray-400">— opcional</span>
              )}
            </button>
            <button type="button" onClick={openFilePicker} disabled={uploadingFile}
              className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50 flex-shrink-0">
              {uploadingFile ? 'Subiendo...' : '+ Subir archivo'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" multiple
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls,.docx,.doc,.txt,.csv"
              onChange={handleFileInput} />
          </div>

          {attachmentsExpanded && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-3">
              {attachments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-lg">
                  Sube imágenes, PDFs u otros archivos de referencia.
                </p>
              ) : (
                <div className="space-y-2">
                  {attachments.map(a => (
                    <div key={a.path}
                      className="flex items-center justify-between gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-center gap-3 min-w-0">
                        {a.type === 'image' ? (
                          <img src={a.url} alt={a.name}
                            className="w-10 h-10 object-cover rounded border border-gray-200 flex-shrink-0" />
                        ) : (
                          <span className="w-10 h-10 flex items-center justify-center bg-white rounded border border-gray-200 text-lg flex-shrink-0">
                            📄
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{a.name}</p>
                          <p className="text-xs text-gray-400">{a.size_kb} KB</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeAttachment(a)}
                        className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 flex-shrink-0">
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======= CALENDARIO ======= */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={calEnabled}
              onChange={e => setCalEnabled(e.target.checked)}
              className="w-4 h-4 accent-teal-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-700">
                Crear evento en Google Calendar
              </p>
              <p className="text-xs text-gray-400">
                Agrega un recordatorio con notificaciones por correo y popup.
              </p>
            </div>
          </label>

          {calEnabled && (
            <div className="mt-4 grid grid-cols-2 gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fecha</label>
                <input type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
                  value={eventDate} onChange={e => setEventDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Hora</label>
                <input type="time"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
                  value={eventTime} onChange={e => setEventTime(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* ======= ACCIONES ======= */}
        <div className="flex gap-3 sticky bottom-0 bg-gray-50 py-3 -mx-2 px-2">
          <button onClick={handleCancel} disabled={loading}
            className="flex-1 sm:flex-none sm:px-8 border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-white disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-teal-700 transition">
            {loading ? 'Guardando...' : 'Crear pendiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
