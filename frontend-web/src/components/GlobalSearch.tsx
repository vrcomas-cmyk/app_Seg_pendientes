import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Result {
  type: 'cliente' | 'oferta' | 'pendiente' | 'material'
  id: string
  title: string
  subtitle: string
  url: string
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Abrir con Ctrl+K o Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Cerrar al click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Buscar con debounce
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults([]); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(query), 300)
  }, [query])

  const search = async (q: string) => {
    setLoading(true)
    const s = q.toLowerCase()
    const results: Result[] = []

    const [clients, tasks, offers] = await Promise.all([
      supabase.from('crm_clients').select('id, solicitante, razon_social')
        .or(`solicitante.ilike.%${s}%,razon_social.ilike.%${s}%`).limit(5),
      supabase.from('tasks').select('id, title, status, priority')
        .ilike('title', `%${s}%`).limit(5),
      supabase.from('crm_offers').select('id, client_id, tipo, estatus, crm_clients(solicitante)')
        .or(`tipo.ilike.%${s}%`)
        .limit(3),
    ])

    clients.data?.forEach(c => results.push({
      type: 'cliente', id: c.id,
      title: c.solicitante,
      subtitle: c.razon_social ?? 'Cliente CRM',
      url: `/crm/${c.id}`,
    }))

    tasks.data?.forEach(t => results.push({
      type: 'pendiente', id: t.id,
      title: t.title,
      subtitle: `${t.status} · ${t.priority}`,
      url: `/tasks/${t.id}`,
    }))

    // Buscar también por número de pedido en offers
    const { data: offerItems } = await supabase
      .from('crm_offer_items').select('offer_id, material, numero_pedido')
      .or(`material.ilike.%${s}%,numero_pedido.ilike.%${s}%`).limit(5)

    const offerIds = [...new Set(offerItems?.map(i => i.offer_id) ?? [])]
    if (offerIds.length > 0) {
      const { data: offersData } = await supabase
        .from('crm_offers').select('id, client_id, crm_clients(solicitante)')
        .in('id', offerIds)
      offersData?.forEach(o => {
        const item = offerItems?.find(i => i.offer_id === o.id)
        results.push({
          type: 'oferta', id: o.id,
          title: `Material ${item?.material} · Pedido ${item?.numero_pedido ?? '—'}`,
          subtitle: (o.crm_clients as any)?.solicitante ?? 'Oferta CRM',
          url: `/crm/${o.client_id}/offer/${o.id}`,
        })
      })
    }

    setResults(results)
    setLoading(false)
  }

  const ICONS: Record<string, string> = {
    cliente: '👥', oferta: '📦', pendiente: '✅', material: '🏷️'
  }
  const TYPE_COLOR: Record<string, string> = {
    cliente: 'bg-teal-100 text-teal-700',
    oferta: 'bg-blue-100 text-blue-700',
    pendiente: 'bg-yellow-100 text-yellow-700',
    material: 'bg-purple-100 text-purple-700',
  }

  const go = (url: string) => {
    nav(url); setOpen(false); setQuery(''); setResults([])
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:border-teal-300 hover:text-gray-600 transition bg-white w-48">
        <span>🔍</span>
        <span className="flex-1 text-left">Buscar...</span>
        <kbd className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-400">⌘K</kbd>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-96 bg-white rounded-xl border border-gray-200 shadow-xl z-50">
          <div className="p-2 border-b border-gray-100">
            <input ref={inputRef}
              className="w-full px-3 py-2 text-sm outline-none text-gray-700 placeholder-gray-400"
              placeholder="Buscar clientes, materiales, pedidos, pendientes..."
              value={query} onChange={e => setQuery(e.target.value)}
              autoFocus />
          </div>

          {loading && (
            <div className="p-4 text-center text-sm text-gray-400">Buscando...</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="p-4 text-center text-sm text-gray-400">Sin resultados para "{query}"</div>
          )}

          {!loading && results.length > 0 && (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.map(r => (
                <button key={`${r.type}-${r.id}`}
                  onClick={() => go(r.url)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition">
                  <span className="text-lg">{ICONS[r.type]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.title}</p>
                    <p className="text-xs text-gray-400 truncate">{r.subtitle}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${TYPE_COLOR[r.type]}`}>
                    {r.type}
                  </span>
                </button>
              ))}
            </div>
          )}

          {query.length < 2 && (
            <div className="p-4 text-xs text-gray-400 space-y-1">
              <p>Busca por:</p>
              <p>• Nombre de cliente o razón social</p>
              <p>• Número de pedido o código de material</p>
              <p>• Título de pendiente</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
