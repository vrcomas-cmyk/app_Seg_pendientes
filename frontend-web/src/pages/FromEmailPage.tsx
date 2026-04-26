import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, getCachedUser } from '../lib/supabase'
import toast from 'react-hot-toast'

type Task = {
  id: string
  title: string
  priority: 'alta' | 'media' | 'baja'
  due_date: string | null
  status: string
  email_url: string | null
  email_subject: string | null
  email_from: string | null
}

const PRIORITY_COLOR: Record<string, string> = {
  alta:  'bg-red-50 text-red-600',
  media: 'bg-yellow-50 text-yellow-700',
  baja:  'bg-gray-50 text-gray-500',
}

export default function FromEmailPage() {
  const nav = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()

  // Datos del correo desde query string (los mete el bookmarklet)
  const emailUrl     = params.get('email_url')     ?? ''
  const emailSubject = params.get('email_subject') ?? ''
  const emailFrom    = params.get('email_from')    ?? ''

  const [loading, setLoading]         = useState(true)
  const [existing, setExisting]       = useState<Task | null>(null)
  const [mode, setMode]               = useState<'decision' | 'search'>('decision')
  const [candidates, setCandidates]   = useState<Task[]>([])
  const [search, setSearch]           = useState('')
  const [showAll, setShowAll]         = useState(false)
  const [associating, setAssociating] = useState<string | null>(null)

  // ── Al montar: buscar si ya existe pendiente con este email_url ─────────
  useEffect(() => {
    if (!emailUrl) { setLoading(false); return }
    let mounted = true
    ;(async () => {
      const user = await getCachedUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from('tasks')
        .select('id, title, priority, due_date, status, email_url, email_subject, email_from')
        .eq('created_by', user.id)
        .eq('email_url', emailUrl)
        .order('created_at', { ascending: false })
        .limit(1)
      if (mounted) {
        setExisting((data?.[0] as Task) ?? null)
        setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [emailUrl])

  // ── Cargar pendientes (on demand, solo si entra a "Asociar a existente") ─
  const loadCandidates = async () => {
    const user = await getCachedUser()
    if (!user) return
    let q = supabase.from('tasks')
      .select('id, title, priority, due_date, status, email_url, email_subject, email_from')
      .eq('created_by', user.id)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(100)
    if (!showAll) q = q.is('email_url', null)
    const { data, error } = await q
    if (error) {
      console.error('Error cargando pendientes:', error)
      toast.error('No se pudo cargar la lista')
      return
    }
    // Filtrar status del lado del cliente (más robusto que .not('status','in',...))
    const filtered = (data ?? []).filter((t: any) =>
      t.status !== 'completado' && t.status !== 'cancelado'
    )
    setCandidates(filtered as Task[])
  }

  useEffect(() => {
    if (mode === 'search') loadCandidates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, showAll])

  // ── Filtrado local por búsqueda ──────────────────────────────────────────
  const visible = useMemo(() => {
    if (!search.trim()) return candidates
    const q = search.toLowerCase()
    return candidates.filter(t => t.title.toLowerCase().includes(q))
  }, [candidates, search])

  // ── Asociar correo a pendiente existente ─────────────────────────────────
  const associate = async (taskId: string) => {
    setAssociating(taskId)
    try {
      const { error } = await supabase.from('tasks').update({
        email_url: emailUrl || null,
        email_subject: emailSubject || null,
        email_from: emailFrom || null,
      }).eq('id', taskId)
      if (error) throw error
      toast.success('Correo asociado')
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
      nav(`/tasks/${taskId}`)
    } catch (err: any) {
      console.error('Error asociando correo:', err)
      toast.error(err?.message ?? 'No se pudo asociar')
      setAssociating(null)
    }
  }

  // ── Crear pendiente nuevo ────────────────────────────────────────────────
  const goToNew = () => {
    const qp = new URLSearchParams()
    if (emailUrl)     qp.set('email_url', emailUrl)
    if (emailSubject) qp.set('email_subject', emailSubject)
    if (emailFrom)    qp.set('email_from', emailFrom)
    nav(`/tasks/new?${qp.toString()}`)
  }

  // ── UI: sin URL (alguien entró a la ruta directo) ────────────────────────
  if (!emailUrl) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Esta pantalla espera datos del correo en la URL.
          Abrila desde el bookmarklet <strong>📧 → Pendiente</strong> en Gmail.
        </div>
        <Link to="/tasks" className="mt-4 inline-block text-sm text-teal-600 hover:text-teal-700">
          ← Volver a pendientes
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <p className="text-sm text-gray-400">Buscando pendientes con este correo...</p>
      </div>
    )
  }

  // ── UI: cabecera común con datos del correo ──────────────────────────────
  const emailCard = (
    <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 mb-4 text-sm">
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none mt-0.5">📧</span>
        <div className="min-w-0 flex-1">
          {emailSubject && <p className="font-medium text-gray-800 truncate">{emailSubject}</p>}
          {emailFrom && <p className="text-gray-500 text-xs mt-0.5">de {emailFrom}</p>}
          <a href={emailUrl} target="_blank" rel="noopener noreferrer"
             className="text-xs text-teal-700 hover:text-teal-800 underline underline-offset-2 mt-1 inline-block">
            Abrir correo en Gmail ↗
          </a>
        </div>
      </div>
    </div>
  )

  // ── UI: ya existe pendiente con ese correo ───────────────────────────────
  if (existing && mode === 'decision') {
    return (
      <div className="max-w-xl mx-auto p-6">
        <h1 className="text-lg font-semibold text-gray-800 mb-3">Correo ya asociado</h1>
        {emailCard}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Pendiente existente con este correo:
          </p>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{existing.title}</p>
              <div className="flex gap-2 mt-1 text-xs">
                <span className={`px-2 py-0.5 rounded-full ${PRIORITY_COLOR[existing.priority]}`}>
                  {existing.priority}
                </span>
                {existing.due_date && (
                  <span className="text-gray-500">Vence: {existing.due_date}</span>
                )}
              </div>
            </div>
            <Link to={`/tasks/${existing.id}`}
              className="flex-shrink-0 text-sm font-semibold text-teal-700 hover:text-teal-800">
              Ir →
            </Link>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Link to="/tasks" className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Cancelar
          </Link>
          <button onClick={goToNew}
            className="px-4 py-2 text-sm font-semibold border border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50">
            Crear otro pendiente
          </button>
        </div>
      </div>
    )
  }

  // ── UI: modo buscador (asociar a existente) ──────────────────────────────
  if (mode === 'search') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <button onClick={() => setMode('decision')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-3">
          ← Volver
        </button>
        <h1 className="text-lg font-semibold text-gray-800 mb-3">Asociar correo a pendiente</h1>
        {emailCard}

        <div className="flex gap-2 items-center mb-3">
          <input type="text"
            placeholder="Buscar pendiente..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400" />
          <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            Ver con correo
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {visible.length === 0 && (
            <p className="text-sm text-gray-400 p-6 text-center">
              {candidates.length === 0
                ? 'No hay pendientes activos sin correo asociado.'
                : 'Ningún pendiente coincide con la búsqueda.'}
            </p>
          )}
          {visible.map(t => (
            <div key={t.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">
                  {t.email_url && <span className="text-xs mr-1" title="Ya tiene correo">📧</span>}
                  {t.title}
                </p>
                <div className="flex gap-2 mt-0.5 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${PRIORITY_COLOR[t.priority]}`}>
                    {t.priority}
                  </span>
                  {t.due_date && <span className="text-gray-500">Vence: {t.due_date}</span>}
                </div>
              </div>
              <button onClick={() => associate(t.id)}
                disabled={associating !== null}
                className="flex-shrink-0 text-sm font-semibold px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {associating === t.id ? '...' : 'Asociar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── UI default: decisión (no existe duplicado) ────────────────────────────
  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-lg font-semibold text-gray-800 mb-3">¿Qué hacemos con este correo?</h1>
      {emailCard}

      <div className="space-y-2">
        <button onClick={goToNew}
          className="w-full text-left px-4 py-3 bg-white border-2 border-teal-200 rounded-xl hover:border-teal-400 hover:bg-teal-50 transition">
          <div className="flex items-center gap-3">
            <span className="text-xl">➕</span>
            <div className="flex-1">
              <p className="font-semibold text-gray-800 text-sm">Crear pendiente nuevo</p>
              <p className="text-xs text-gray-500 mt-0.5">Con asunto y remitente pre-cargados</p>
            </div>
            <span className="text-gray-400">→</span>
          </div>
        </button>

        <button onClick={() => setMode('search')}
          className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔗</span>
            <div className="flex-1">
              <p className="font-semibold text-gray-800 text-sm">Asociar a pendiente existente</p>
              <p className="text-xs text-gray-500 mt-0.5">Buscar uno de tus pendientes activos</p>
            </div>
            <span className="text-gray-400">→</span>
          </div>
        </button>
      </div>

      <Link to="/tasks"
        className="mt-4 inline-block text-sm text-gray-400 hover:text-gray-600">
        Cancelar
      </Link>
    </div>
  )
}
