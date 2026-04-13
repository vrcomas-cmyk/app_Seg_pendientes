import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const PAGE_SIZE = 50

export default function CrmListPage() {
  const [followups, setFollowups] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState<'seguimientos' | 'clientes'>('seguimientos')

  // ── clientes ───────────────────────────────────────────────────────────
  const [clients, setClients]         = useState<any[]>([])
  const [search, setSearch]           = useState('')
  const [filterGpoVdor, setFilterGpoVdor] = useState('')
  const [filterRamo, setFilterRamo]   = useState('')
  const [page, setPage]               = useState(0)
  const [totalCount, setTotalCount]   = useState(0)

  // ── seguimientos ───────────────────────────────────────────────────────
  const [filterEstatus, setFilterEstatus] = useState('pendiente')

  // ──────────────────────────────────────────────────────────────────────

  const loadFollowups = async () => {
    setLoading(true)
    let q = supabase
      .from('crm_followups')
      .select('*, crm_clients(id, solicitante, ramo, centro, gpo_vendedor), crm_recipients(destinatario), crm_contacts(nombre, puesto)')
      .order('fecha_seguimiento', { ascending: true, nullsFirst: false })
    if (filterEstatus) q = q.eq('estatus', filterEstatus)
    const { data } = await q
    setFollowups(data ?? [])
    setLoading(false)
  }

  const loadClients = async (currentPage = page) => {
    setLoading(true)
    let q = supabase
      .from('crm_clients')
      .select('*, crm_recipients(count), crm_followups(count), crm_offers(id, estatus)', { count: 'exact' })
      .order('solicitante')
    if (search.trim())
      q = q.or(`solicitante.ilike.%${search.trim()}%,razon_social.ilike.%${search.trim()}%,rfc.ilike.%${search.trim()}%`)
    if (filterGpoVdor.trim())
      q = q.ilike('gpo_vendedor', `%${filterGpoVdor.trim()}%`)
    if (filterRamo.trim())
      q = q.ilike('ramo', `%${filterRamo.trim()}%`)
    q = q.range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1)
    const { data, count } = await q
    setClients(data ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }

  // seguimientos reacciona a su propio filtro
  useEffect(() => {
    if (view === 'seguimientos') loadFollowups()
  }, [view, filterEstatus])

  // clientes: reset page cuando cambian filtros
  useEffect(() => {
    if (view === 'clientes') {
      setPage(0)
      loadClients(0)
    }
  }, [view, search, filterGpoVdor, filterRamo])

  // clientes: cambio de página
  useEffect(() => {
    if (view === 'clientes') loadClients(page)
  }, [page])

  // ──────────────────────────────────────────────────────────────────────

  const TIPO_LABEL: Record<string, string> = {
    llamada: '📞 Llamada', visita: '🤝 Visita', correo: '📧 Correo',
    cotizacion: '💰 Cotización', seguimiento_pedido: '📦 Pedido',
    seguimiento_traslado: '🚚 Traslado', otro: '📝 Otro',
  }

  const STATUS_COLOR: Record<string, string> = {
    pendiente:           'bg-yellow-100 text-yellow-700',
    en_proceso:          'bg-blue-100 text-blue-700',
    esperando_respuesta: 'bg-purple-100 text-purple-700',
    completado:          'bg-green-100 text-green-700',
    cancelado:           'bg-gray-100 text-gray-500',
  }

  const today     = new Date().toISOString().split('T')[0]
  const overdue   = followups.filter(f => f.fecha_seguimiento && f.fecha_seguimiento < today)
  const todayList = followups.filter(f => f.fecha_seguimiento === today)
  const upcoming  = followups.filter(f => f.fecha_seguimiento && f.fecha_seguimiento > today)
  const noDate    = followups.filter(f => !f.fecha_seguimiento)

  const FollowupCard = ({ f }: { f: any }) => (
    <Link to={`/crm/${f.client_id}/followup/${f.id}`}
      className="flex items-start justify-between px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-semibold text-gray-800">{f.crm_clients?.solicitante}</span>
          {f.crm_clients?.gpo_vendedor && (
            <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full">
              Gpo. {f.crm_clients.gpo_vendedor}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[f.estatus]}`}>
            {f.estatus.replace('_', ' ')}
          </span>
          <span className="text-xs text-gray-400">{TIPO_LABEL[f.tipo] ?? f.tipo}</span>
        </div>
        <p className="text-sm text-gray-600 line-clamp-1 mb-1">{f.descripcion}</p>
        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
          {f.crm_recipients?.destinatario && <span>Destinatario: {f.crm_recipients.destinatario}</span>}
          {f.crm_contacts?.nombre && <span>Contacto: {f.crm_contacts.nombre}{f.crm_contacts.puesto ? ` — ${f.crm_contacts.puesto}` : ''}</span>}
          {f.crm_clients?.centro && <span>Centro: {f.crm_clients.centro}</span>}
        </div>
      </div>
      <div className="flex-shrink-0 ml-4 text-right">
        {f.fecha_seguimiento && (
          <p className={`text-xs font-medium ${
            f.fecha_seguimiento < today ? 'text-red-500' :
            f.fecha_seguimiento === today ? 'text-teal-600' : 'text-gray-400'
          }`}>
            {f.fecha_seguimiento < today ? '⚠️ ' : ''}
            {f.fecha_seguimiento === today ? '🔔 Hoy' : f.fecha_seguimiento}
          </p>
        )}
        <span className="text-gray-300 text-lg">›</span>
      </div>
    </Link>
  )

  const SectionHeader = ({ title, count, color }: { title: string; count: number; color: string }) => (
    <div className={`px-5 py-2 border-b border-gray-100 flex items-center gap-2 ${color}`}>
      <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
      <span className="text-xs font-semibold bg-white bg-opacity-60 px-2 py-0.5 rounded-full">{count}</span>
    </div>
  )

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const from = totalCount === 0 ? 0 : page * PAGE_SIZE + 1
  const to   = Math.min((page + 1) * PAGE_SIZE, totalCount)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">CRM</h1>
          <p className="text-sm text-gray-400 mt-0.5">Seguimiento comercial</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Link to="/crm/offers"
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Seguimiento ofertas
          </Link>
          <Link to="/crm/special-orders"
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Pedidos especiales
          </Link>
          <Link to="/crm/reports"
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Reportes globales
          </Link>
          <Link to="/crm/materials"
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Materiales en tránsito
          </Link>
          <Link to="/crm/items"
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Materiales en proceso
          </Link>
          <Link to="/crm/ventas"
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
            💰 Ventas
          </Link>
          <Link to="/crm/new"
            className="border border-teal-600 text-teal-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-50">
            + Cliente
          </Link>
        </div>
      </div>

      {/* Toggle vista */}
      <div className="flex gap-0 mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden w-fit">
        <button onClick={() => setView('seguimientos')}
          className={`px-5 py-2.5 text-sm font-medium transition ${view === 'seguimientos' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
          Seguimientos pendientes
        </button>
        <button onClick={() => setView('clientes')}
          className={`px-5 py-2.5 text-sm font-medium transition ${view === 'clientes' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
          Todos los clientes
        </button>
      </div>

      {/* ── Vista: Seguimientos ─────────────────────────────────────────── */}
      {view === 'seguimientos' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {[
              { value: 'pendiente',           label: 'Pendientes' },
              { value: 'en_proceso',          label: 'En proceso' },
              { value: 'esperando_respuesta', label: 'Esperando respuesta' },
              { value: '',                    label: 'Todos' },
            ].map(f => (
              <button key={f.value} onClick={() => setFilterEstatus(f.value)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  filterEstatus === f.value
                    ? 'bg-teal-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-500 hover:border-teal-300'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
          {!loading && followups.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <p className="text-gray-400 text-sm mb-4">No hay seguimientos con este estatus.</p>
            </div>
          )}
          {!loading && followups.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {overdue.length > 0 && (
                <><SectionHeader title="Vencidos" count={overdue.length} color="bg-red-50 text-red-600" />
                {overdue.map(f => <FollowupCard key={f.id} f={f} />)}</>
              )}
              {todayList.length > 0 && (
                <><SectionHeader title="Hoy" count={todayList.length} color="bg-teal-50 text-teal-700" />
                {todayList.map(f => <FollowupCard key={f.id} f={f} />)}</>
              )}
              {upcoming.length > 0 && (
                <><SectionHeader title="Próximos" count={upcoming.length} color="bg-blue-50 text-blue-600" />
                {upcoming.map(f => <FollowupCard key={f.id} f={f} />)}</>
              )}
              {noDate.length > 0 && (
                <><SectionHeader title="Sin fecha asignada" count={noDate.length} color="bg-gray-50 text-gray-500" />
                {noDate.map(f => <FollowupCard key={f.id} f={f} />)}</>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Vista: Clientes ─────────────────────────────────────────────── */}
      {view === 'clientes' && (
        <>
          {/* Filtros */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <input
              className="border border-gray-200 rounded-lg px-4 py-2 text-sm outline-none focus:border-teal-400 flex-1 min-w-48"
              placeholder="Buscar por nombre, razón social o RFC..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <input
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 w-32"
              placeholder="Gpo. Vdor."
              value={filterGpoVdor} onChange={e => setFilterGpoVdor(e.target.value)} />
            <input
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 w-32"
              placeholder="Ramo"
              value={filterRamo} onChange={e => setFilterRamo(e.target.value)} />
          </div>

          <p className="text-xs text-gray-400 mb-2">
            {from}–{to} de {totalCount} clientes
          </p>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
            {!loading && clients.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-gray-400 text-sm mb-4">No hay clientes con estos filtros.</p>
                <Link to="/admin"
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                  Ir a Admin para importar
                </Link>
              </div>
            )}
            {clients.map(c => {
              const activeOffers = (c.crm_offers ?? []).filter((o: any) =>
                !['cerrada','cancelado'].includes(o.estatus)
              ).length
              return (
                <div key={c.id}
                  className="flex items-center justify-between px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <Link to={`/crm/${c.id}`} className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800">{c.solicitante}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-400 mt-0.5">
                      {c.razon_social && <span>{c.razon_social}</span>}
                      {c.rfc && <span>RFC: {c.rfc}</span>}
                      {c.estado && <span>{c.estado}</span>}
                      {c.ramo && <span>{c.ramo}</span>}
                      {c.gpo_vendedor && (
                        <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded-full font-medium">
                          Gpo. {c.gpo_vendedor}
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Destinatarios</p>
                      <p className="text-sm font-semibold text-gray-700">{c.crm_recipients?.[0]?.count ?? 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400">Seguimientos</p>
                      <p className="text-sm font-semibold text-gray-700">{c.crm_followups?.[0]?.count ?? 0}</p>
                    </div>
                    {activeOffers > 0 && (
                      <span className="flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                        {activeOffers} oferta{activeOffers > 1 ? 's' : ''}
                      </span>
                    )}
                    <Link to={`/crm/${c.id}`} className="text-gray-300 text-lg">›</Link>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 bg-white border border-gray-200 rounded-xl px-5 py-3">
              <p className="text-sm text-gray-500">
                {from}–{to} de <strong>{totalCount}</strong> clientes
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                  ← Anterior
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const p = totalPages <= 7 ? i
                    : page < 4 ? i
                    : page > totalPages - 5 ? totalPages - 7 + i
                    : page - 3 + i
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 text-xs rounded-lg font-medium ${
                        p === page
                          ? 'bg-teal-600 text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {p + 1}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                  Siguiente →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
