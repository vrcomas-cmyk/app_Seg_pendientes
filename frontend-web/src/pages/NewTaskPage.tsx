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
}

interface AttDraft {
  path: string       // ruta en el bucket "attachments"
  url: string        // URL pública
  name: string       // nombre original
  type: 'image' | 'file'
  size_kb: number
  mime: string
}

export default function NewTaskPage() {
  const nav = useNavigate()
  const { createEvent, connectGoogle } = useCalendar()

  // Pre-generar id del task para poder usarlo como carpeta desde el principio
  const [taskId] = useState(() => crypto.randomUUID())

  // Datos principales
  const [form, setForm] = useState({
    requested_by: '',
    title: '',
    description: '',
    priority: 'media',
    due_date: suggestDate('media'),
  })

  // Sugerencias de solicitante
  const [solicitantes, setSolicitantes] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const solicitanteBoxRef = useRef<HTMLDivElement>(null)

  // Subtareas
  const [steps, setSteps] = useState<StepDraft[]>([])

  // Adjuntos
  const [attachments, setAttachments] = useState<AttDraft[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Evento de calendario
  const [calEnabled, setCalEnabled] = useState(false)
  const [eventDate, setEventDate] = useState(form.due_date)
  const [eventTime, setEventTime] = useState('09:00')

  const [loading, setLoading] = useState(false)

  useEffect(() => { setSolicitantes(loadSolicitantes()) }, [])

  useEffect(() => { setEventDate(form.due_date) }, [form.due_date])

  // Cerrar dropdown al hacer click fuera
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

  // ---- Subtareas ----
  const addStep = () => setSteps(s => [...s, {
    tmpId: crypto.randomUUID(),
    title: '', description: '', due_date: '', assigned_to: '',
  }])
  const updateStep = (tmpId: string, patch: Partial<StepDraft>) =>
    setSteps(s => s.map(st => st.tmpId === tmpId ? { ...st, ...patch } : st))
  const removeStep = (tmpId: string) =>
    setSteps(s => s.filter(st => st.tmpId !== tmpId))

  // ---- Adjuntos ----
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

  const removeAttachment = async (att: AttDraft) => {
    // Eliminar también del storage para no dejar basura
    await supabase.storage.from('attachments').remove([att.path]).catch(() => {})
    setAttachments(prev => prev.filter(a => a.path !== att.path))
  }

  // ---- Limpiar uploads si el usuario cancela sin guardar ----
  const cleanupUploads = async () => {
    const paths = attachments.map(a => a.path)
    // Las imágenes de la descripción ya quedaron referenciadas en el markdown,
    // si se cancela se borran también explícitamente abajo en handleCancel.
    if (paths.length > 0) await supabase.storage.from('attachments').remove(paths).catch(() => {})
  }

  const handleCancel = async () => {
    if (attachments.length === 0 && !form.description && !form.title) {
      nav('/tasks'); return
    }
    if (!window.confirm('¿Descartar este pendiente? Se eliminarán adjuntos e imágenes cargadas.')) return
    await cleanupUploads()
    // Borrar también capturas de descripción
    const descMatches = Array.from(form.description.matchAll(/!\[.*?\]\(.*?\/attachments\/(.+?)\)/g))
    const descPaths = descMatches.map(m => m[1].split('?')[0])
    if (descPaths.length > 0) await supabase.storage.from('attachments').remove(descPaths).catch(() => {})
    nav('/tasks')
  }

  // ---- Guardar todo ----
  const handleSubmit = async () => {
    if (!form.requested_by.trim()) return toast.error('Quién lo solicita es obligatorio')
    if (!form.title.trim()) return toast.error('El título es obligatorio')

    setLoading(true)
    const user = await getCachedUser()

    try {
      // 1. Crear el task con el id pre-generado
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

      // 2. Insertar subtareas (si hay)
      const validSteps = steps.filter(s => s.title.trim())
      if (validSteps.length > 0) {
        const stepRows = validSteps.map((s, idx) => ({
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

      // 3. Insertar adjuntos en la tabla
      if (attachments.length > 0) {
        const attRows = attachments.map(a => ({
          task_id: taskId,
          url: a.url,
          name: a.name,
          type: a.type,
          // columnas del backend — se incluyen por si el esquema las requiere
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

      // 4. Evento de calendario
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

      // 5. Guardar solicitante en sugerencias
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

          {/* 1. Solicitante (con sugerencias) */}
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

          {/* 2. Título */}
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

          {/* 3. Descripción (con screenshots) */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Descripción
              <span className="ml-2 text-gray-400 font-normal">
                · soporta capturas con Ctrl+V
              </span>
            </label>
            <DescriptionEditor
              value={form.description}
              onChange={v => setForm(f => ({ ...f, description: v }))}
              folderId={taskId}
              isDraft={false}
              placeholder="Detalle opcional. Pega capturas con Ctrl+V, arrastra imágenes o usa el botón 📎."
              rows={4}
            />
          </div>

          {/* 4. Prioridad y fecha */}
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

        {/* ======= SUBTAREAS / PASOS ======= */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Subtareas / Pasos
              {steps.length > 0 && (
                <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {steps.length}
                </span>
              )}
            </h2>
            <button type="button" onClick={addStep}
              className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700">
              + Agregar paso
            </button>
          </div>

          {steps.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-lg">
              Opcional. Agrega subtareas que desglosen el pendiente.
            </p>
          )}

          <div className="space-y-2">
            {steps.map((s, idx) => (
              <div key={s.tmpId} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 font-semibold mt-2 w-5 flex-shrink-0">
                    {idx + 1}.
                  </span>
                  <input
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white"
                    placeholder="Título del paso *"
                    value={s.title}
                    onChange={e => updateStep(s.tmpId, { title: e.target.value })} />
                  <button type="button" onClick={() => removeStep(s.tmpId)}
                    className="text-xs text-gray-300 hover:text-red-400 px-2 py-2 rounded-lg hover:bg-red-50">
                    ✕
                  </button>
                </div>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-teal-400 bg-white h-14 resize-none ml-7"
                  style={{ width: 'calc(100% - 1.75rem)' }}
                  placeholder="Descripción (opcional)"
                  value={s.description}
                  onChange={e => updateStep(s.tmpId, { description: e.target.value })} />
                <div className="grid grid-cols-2 gap-2 ml-7" style={{ width: 'calc(100% - 1.75rem)' }}>
                  <input type="date"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-teal-400 bg-white"
                    value={s.due_date}
                    onChange={e => updateStep(s.tmpId, { due_date: e.target.value })} />
                  <input
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-teal-400 bg-white"
                    placeholder="Responsable"
                    value={s.assigned_to}
                    onChange={e => updateStep(s.tmpId, { assigned_to: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ======= ADJUNTOS ======= */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Archivos adjuntos
              {attachments.length > 0 && (
                <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  {attachments.length}
                </span>
              )}
            </h2>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingFile}
              className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50">
              {uploadingFile ? 'Subiendo...' : '+ Subir archivo'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden" multiple
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls,.docx,.doc,.txt,.csv"
              onChange={handleFileInput} />
          </div>

          {attachments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6 border-2 border-dashed border-gray-100 rounded-lg">
              Opcional. Sube imágenes, PDFs u otros archivos de referencia.
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

        {/* ======= EVENTO DE CALENDARIO ======= */}
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
