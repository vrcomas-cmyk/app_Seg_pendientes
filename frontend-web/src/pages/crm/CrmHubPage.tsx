import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const TIPO_BADGE: Record<string, { label: string; bg: string; color: string; emoji: string }> = {
  oferta:     { label: 'Oferta',     bg: '#F3F4F6', color: '#374151', emoji: '📋' },
  venta:      { label: 'Venta',      bg: '#EFF6FF', color: '#1D4ED8', emoji: '💰' },
  cedis:      { label: 'CEDIS',      bg: '#FEF3C7', color: '#92400E', emoji: '🏭' },
  transmision:{ label: 'Transmisión',bg: '#EDE9FE', color: '#5B21B6', emoji: '🚚' },
  facturado:  { label: 'Facturado',  bg: '#D1FAE5', color: '#065F46', emoji: '✅' },
  cancelado:  { label: 'Cancelado',  bg: '#FEE2E2', color: '#991B1B', emoji: '❌' },
  cerrada:    { label: 'Cerrada',    bg: '#F3F4F6', color: '#9CA3AF', emoji: '🔒' },
  donativo:   { label: 'Donativo',   bg: '#EDE9FE', color: '#5B21B6', emoji: '🎁' },
  prospecto:  { label: 'Prospecto',  bg: '#F0FDF4', color: '#166534', emoji: '🔵' },
  seguimiento:{ label: 'Seguimiento',bg: '#FFF7ED', color: '#9A3412', emoji: '📅' },
}

const today = new Date().toISOString().split('T')[0]

function Badge({ etapa, tipoNegocio }: { etapa: string; tipoNegocio?: string }) {
  const key = tipoNegocio === 'donativo' && etapa === 'oferta' ? 'donativo' : etapa
  const b = TIPO_BADGE[key] ?? TIPO_BADGE.oferta
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
      style={{ background: b.bg, color: b.color }}>
      {b.emoji} {b.label}
    </span>
  )
}

export default function CrmHubPage() {
  const nav = useNavigate()
  const [offers, setOffers] = useState<any[]>([])
  const [followups, setFollowups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'activo' | 'todo' | 'cancelado'>('activo')
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: off }, { data: fup }] = await Promise.all([
      supabase.from('crm_offers')
        .select(`id, tipo, tipo_negocio, etapa, estatus, notas, created_at, fecha_venta,
          client_id, folio_pedido, gpo_cliente, gpo_vendedor,
          crm_clients(id, solicitante, razon_social, no_cliente),
          crm_offer_items(id, material, cantidad_aceptada, precio_aceptado, estatus)`)
        .order('created_at', { ascending: false }),
      supabase.from('crm_followups')
        .select('id, tipo, notas, fecha_seguimiento, created_at, client_id, crm_clients(solicitante, razon_social, no_cliente)')
        .order('fecha_seguimiento', { ascending: true, nullsFirst: false }),
    ])
    setOffers(off ?? [])
    setFollowups(fup ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Merge offers + followups into unified list
  const unified = useMemo(() => {
    const offerRows = (offers).map(o => ({
      _id:      o.id,
      _type:    'offer' as const,
      etapa:    o.etapa,
      tipo_negocio: o.tipo_negocio,
      cliente:  o.crm_clients,
      folio:    o.folio_pedido,
      fecha:    o.fecha_venta ?? o.created_at,
      notas:    o.notas,
      items:    o.crm_offer_items ?? [],
      raw:      o,
    }))
    const fupRows = (followups).map(f => ({
      _id:      f.id,
      _type:    'followup' as const,
      etapa:    'seguimiento',
      tipo_negocio: undefined,
      cliente:  f.crm_clients,
      folio:    null,
      fecha:    f.fecha_seguimiento ?? f.created_at,
      notas:    f.notas,
      items:    [],
      raw:      f,
    }))
    return [...offerRows, ...fupRows].sort((a, b) =>
      new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime()
    )
  }, [offers, followups])

  const visible = useMemo(() => unified.filter(row => {
    if (tab === 'activo' && ['cancelado','cerrada','facturado'].includes(row.etapa)) return false
    if (tab === 'cancelado' && !['cancelado','cerrada'].includes(row.etapa)) return false
    if (filterTipo && row.etapa !== filterTipo && !(filterTipo === 'donativo' && row.tipo_negocio === 'donativo')) return false
    if (search) {
      const q = search.toLowerCase()
      const cli = row.cliente
      return cli?.solicitante?.toLowerCase().includes(q) ||
        cli?.razon_social?.toLowerCase().includes(q) ||
        cli?.no_cliente?.toLowerCase().includes(q) ||
        row.folio?.toLowerCase().includes(q) ||
        row.notas?.toLowerCase().includes(q)
    }
    return true
  }), [unified, tab, filterTipo, search])

  const countByEtapa = useMemo(() => {
    const m: Record<string, number> = {}
    for (const row of unified) {
      const key = row.tipo_negocio === 'donativo' ? 'donativo' : row.etapa
      m[key] = (m[key] ?? 0) + 1
    }
    return m
  }, [unified])

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">CRM</h1>
          <p className="text-sm text-gray-400 mt-0.5">Ofertas · Ventas · Seguimientos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => nav('/crm/reports')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">Reportes SAP</button>
          <button onClick={() => nav('/cedis')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">CEDIS</button>
          <button onClick={() => nav('/crm/venta-manual')} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700">+ Nueva venta</button>
        </div>
      </div>

      {/* Badges resumen */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {Object.entries(TIPO_BADGE).filter(([k]) => countByEtapa[k] > 0).map(([key, b]) => (
          <button key={key}
            onClick={() => setFilterTipo(filterTipo === key ? '' : key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${filterTipo === key ? 'border-2' : 'border'}`}
            style={{
              background: filterTipo === key ? b.bg : 'white',
              color: b.color,
              borderColor: filterTipo === key ? b.color : '#E5E7EB',
            }}>
            {b.emoji} {b.label}
            <span className="bg-white bg-opacity-70 px-1.5 py-0.5 rounded-full font-bold" style={{ color: b.color }}>
              {countByEtapa[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[{k:'activo',l:'Activos'},{k:'todo',l:'Todos'},{k:'cancelado',l:'Cancelados'}].map(f => (
            <button key={f.k} onClick={() => setTab(f.k as any)}
              className={`px-4 py-2 text-xs font-medium transition ${tab === f.k ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {f.l}
            </button>
          ))}
        </div>
        <input className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar cliente, folio, notas..." value={search} onChange={e => setSearch(e.target.value)} />
        <button onClick={() => nav('/crm/pipeline')} className="text-xs border border-gray-200 text-gray-500 px-3 py-2 rounded-xl hover:bg-gray-50">
          Vista Pipeline →
        </button>
      </div>

      {/* Lista unificada */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-8 text-center">Cargando...</p>}
        {!loading && visible.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">No hay registros.</p>
          </div>
        )}
        {!loading && visible.map(row => {
          const cli   = row.cliente
          const total = row.items.reduce((a: number, i: any) => a + ((i.cantidad_aceptada ?? 0) * (i.precio_aceptado ?? 0)), 0)
          const isOverdue = row.etapa === 'seguimiento' && row.fecha && row.fecha < today

          return (
            <div key={row._id}
              className={`px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition cursor-pointer ${isOverdue ? 'bg-orange-50' : ''}`}
              onClick={() => {
                if (row._type === 'offer') nav(`/crm/pipeline`)
                else nav('/crm')
              }}>
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge etapa={row.etapa} tipoNegocio={row.tipo_negocio} />
                    <span className="text-sm font-semibold text-gray-800 truncate">
                      {cli?.no_cliente ? `${cli.no_cliente} — ` : ''}{cli?.razon_social ?? cli?.solicitante ?? 'Sin cliente'}
                    </span>
                    {isOverdue && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">⚠ Vencido</span>}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                    {row.folio && <span className="font-mono text-blue-600">📋 {row.folio}</span>}
                    {row.items.length > 0 && <span>{row.items.length} material(es)</span>}
                    {row.notas && <span className="truncate max-w-64 italic">{row.notas}</span>}
                    <span>{row.fecha ? new Date(row.fecha).toLocaleDateString('es-MX') : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {total > 0 && (
                    <span className="text-sm font-semibold text-gray-700">
                      ${total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                    </span>
                  )}
                  {row._type === 'offer' && !['cancelado','cerrada','facturado'].includes(row.etapa) && (
                    <button
                      onClick={e => { e.stopPropagation(); nav('/crm/pipeline') }}
                      className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700 font-medium">
                      Gestionar →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
