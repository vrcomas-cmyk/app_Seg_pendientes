import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, getCachedUser } from '../../lib/supabase'
import toast from 'react-hot-toast'

const ETAPAS = [
  { key: 'oferta',       label: 'Oferta',       color: '#6B7280', bg: '#F3F4F6', text: '#374151' },
  { key: 'venta',        label: 'Venta',         color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  { key: 'cedis',        label: 'CEDIS',         color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { key: 'transmision',  label: 'Transmisión',   color: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6' },
  { key: 'facturado',    label: 'Facturado',     color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
]
const ETAPA_IDX: Record<string, number> = { oferta:0, venta:1, cedis:2, transmision:3, facturado:4 }

function diasEnEtapa(v: any): number {
  const ref = v.fecha_venta ?? v.created_at
  if (!ref) return 0
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000)
}

export default function CrmPipelinePage() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('id')

  const [ventas, setVentas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEtapa, setFilterEtapa] = useState<string>(highlightId ? '' : 'activas')
  const [filterArchivadas, setFilterArchivadas] = useState(false)
  const [search, setSearch] = useState('')

  // Inline edits: { [id]: { folio, factura, etapa } }
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  // Confirmation modal (oferta→venta)
  const [confirmModal, setConfirmModal] = useState<{ venta: any; items: any[] } | null>(null)
  const [confirmItems, setConfirmItems] = useState<Record<string, {
    aceptado: boolean; cantidad: string; lote: string; caducidad: string; comentario: string
    requiereCedis: boolean; cedisOrigen: string; cedisAlmacenOrigen: string
    cedisDestino: string; cedisAlmacenDestino: string
  }>>({})
  const [folioInput, setFolioInput] = useState('')
  const [savingConfirm, setSavingConfirm] = useState(false)

  // Cancel/archive modal
  const [archiveModal, setArchiveModal] = useState<{ venta: any; accion: 'archivar' | 'facturar' } | null>(null)
  const [archiveMotivo, setArchiveMotivo] = useState('')
  const [savingArchive, setSavingArchive] = useState(false)

  // Expanded materials row
  const [expandedId, setExpandedId] = useState<string | null>(highlightId)

  // Folio modal (oferta→venta)
  const [folioModal, setFolioModal] = useState<{ venta: any } | null>(null)
  const [savingFolio, setSavingFolio] = useState(false)

  const highlightRef = useRef<HTMLTableRowElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_offers')
      .select(`
        id, tipo, tipo_negocio, etapa, estatus, notas, created_at, fecha_venta,
        client_id, folio_pedido, gpo_cliente, gpo_vendedor,
        crm_clients(id, solicitante, razon_social),
        crm_offer_items(id, material, descripcion,
          cantidad_aceptada, precio_aceptado, cantidad_ofertada, precio_oferta,
          numero_factura, estatus, lote, caducidad, um, cedis_request_id)
      `)
      .order('created_at', { ascending: false })
    setVentas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
    }
  }, [loading, highlightId])

  const visible = ventas.filter(v => {
    if (filterArchivadas) return v.etapa === 'cancelado'
    if (v.etapa === 'cancelado') return false
    if (filterEtapa === 'activas' && v.etapa === 'facturado') return false
    if (filterEtapa && !['activas', ''].includes(filterEtapa) && v.etapa !== filterEtapa) return false
    if (search) {
      const q = search.toLowerCase()
      const cli = v.crm_clients
      return cli?.solicitante?.toLowerCase().includes(q) ||
        cli?.razon_social?.toLowerCase().includes(q) ||
        v.folio_pedido?.toLowerCase().includes(q) ||
        v.notas?.toLowerCase().includes(q)
    }
    return true
  })

  const countByEtapa = (key: string) => ventas.filter(v => v.etapa === key).length
  const countActivas = ventas.filter(v => !['facturado','cancelado'].includes(v.etapa)).length
  const countArchivadas = ventas.filter(v => v.etapa === 'cancelado').length

  // ── Edición inline ────────────────────────────────────────────────────────
  const getEdit = (id: string, field: string, fallback: any) =>
    edits[id]?.[field] !== undefined ? edits[id][field] : fallback

  const setEdit = (id: string, field: string, val: any) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: val } }))

  const saveRow = async (v: any) => {
    const e = edits[v.id]
    if (!e) return
    setSaving(prev => ({ ...prev, [v.id]: true }))
    const updates: any = {}
    if (e.folio !== undefined) updates.folio_pedido = e.folio || null
    if (e.etapa !== undefined && e.etapa !== v.etapa) updates.etapa = e.etapa
    if (Object.keys(updates).length > 0) {
      await supabase.from('crm_offers').update(updates).eq('id', v.id)
    }
    // Save factura to items if changed
    if (e.factura !== undefined) {
      await supabase.from('crm_offer_items')
        .update({ numero_factura: e.factura || null })
        .eq('offer_id', v.id)
    }
    setEdits(prev => { const n = { ...prev }; delete n[v.id]; return n })
    setSaving(prev => { const n = { ...prev }; delete n[v.id]; return n })
    toast.success('Guardado')
    load()
  }

  // ── Avanzar etapa ─────────────────────────────────────────────────────────
  const avanzarEtapa = (v: any) => {
    if (v.etapa === 'oferta') { abrirConfirmacion(v); return }
    const idx = ETAPA_IDX[v.etapa] ?? 0
    if (idx >= 4) return
    const next = ETAPAS[idx + 1]
    if (next.key === 'facturado') { setArchiveModal({ venta: v, accion: 'facturar' }); setArchiveMotivo(''); return }
    supabase.from('crm_offers').update({ etapa: next.key }).eq('id', v.id)
      .then(() => { toast.success(`→ ${next.label}`); load() })
  }

  // ── Confirmación oferta → venta ───────────────────────────────────────────
  const abrirConfirmacion = (v: any) => {
    const items = v.crm_offer_items ?? []
    const init: Record<string, any> = {}
    items.forEach((it: any) => {
      init[it.id] = {
        aceptado: true, cantidad: String(it.cantidad_aceptada ?? it.cantidad_ofertada ?? ''),
        lote: it.lote ?? '', caducidad: it.caducidad ?? '', comentario: '',
        requiereCedis: false, cedisOrigen: '', cedisAlmacenOrigen: '',
        cedisDestino: '', cedisAlmacenDestino: '',
      }
    })
    setConfirmItems(init)
    setConfirmModal({ venta: v, items })
    setFolioInput(v.folio_pedido ?? '')
  }

  const toggleAll = (aceptado: boolean) =>
    setConfirmItems(prev => {
      const n = { ...prev }; Object.keys(n).forEach(id => { n[id] = { ...n[id], aceptado } }); return n
    })

  const confirmarVenta = async () => {
    if (!confirmModal) return
    setSavingConfirm(true)
    const user_id = (await supabase.auth.getSession()).data.session?.user.id
    for (const item of confirmModal.items) {
      const ci = confirmItems[item.id]
      if (!ci) continue
      const upd: any = { aceptado: ci.aceptado, estatus: ci.aceptado ? 'aceptado' : 'rechazado' }
      if (ci.aceptado) {
        if (ci.cantidad) { upd.cantidad_aceptada = parseFloat(ci.cantidad); upd.cantidad_ofertada = parseFloat(ci.cantidad) }
        if (ci.lote) upd.lote = ci.lote
        if (ci.caducidad) upd.caducidad = ci.caducidad
      }
      await supabase.from('crm_offer_items').update(upd).eq('id', item.id)
      if (ci.comentario) {
        await supabase.from('crm_offer_item_history').insert({
          item_id: item.id, estatus_anterior: item.estatus,
          estatus_nuevo: upd.estatus, comentario: ci.comentario, created_by: user_id,
        })
      }
      if (ci.aceptado && ci.requiereCedis && ci.cedisOrigen && ci.cedisDestino) {
        const { data: req } = await supabase.from('crm_cedis_requests').insert({
          codigo: item.material, descripcion: item.descripcion,
          cantidad: parseFloat(ci.cantidad) || item.cantidad_aceptada || 0,
          cantidad_pedida: parseFloat(ci.cantidad) || item.cantidad_aceptada || 0,
          centro_origen: ci.cedisOrigen, almacen_origen: ci.cedisAlmacenOrigen || null,
          centro_destino: ci.cedisDestino, almacen_destino: ci.cedisAlmacenDestino || null,
          tipo_movimiento: 'para_pedido', folio_pedido_destino: folioInput.trim() || null,
          crm_offer_item_id: item.id, estatus: 'pendiente_solicitar', origen: 'crm', created_by: user_id,
        }).select('id').single()
        if (req) {
          await supabase.from('crm_offer_items')
            .update({ cedis_request_id: req.id, estatus: 'solicitud_cedis', requiere_traslado: true })
            .eq('id', item.id)
        }
      }
    }
    const hayAceptados = Object.values(confirmItems).some(ci => ci.aceptado)
    if (!hayAceptados) { toast.error('Acepta al menos un material'); setSavingConfirm(false); return }
    const upd: any = { etapa: 'venta', fecha_venta: new Date().toISOString().split('T')[0] }
    if (folioInput.trim()) upd.folio_pedido = folioInput.trim()
    await supabase.from('crm_offers').update(upd).eq('id', confirmModal.venta.id)
    toast.success('✓ Convertido a Venta')
    setConfirmModal(null); setSavingConfirm(false); setFolioInput('')
    load()
  }

  // ── Archivar / Facturar ───────────────────────────────────────────────────
  const ejecutarArchive = async () => {
    if (!archiveModal) return
    setSavingArchive(true)
    if (archiveModal.accion === 'archivar') {
      await supabase.from('crm_offers').update({ etapa: 'cancelado', estatus: 'cancelado' }).eq('id', archiveModal.venta.id)
      await supabase.from('crm_offer_items').update({ estatus: 'cancelado' }).eq('offer_id', archiveModal.venta.id)
      toast.success('Oferta archivada')
    } else {
      // facturar — get invoice number from archiveMotivo field reused as factura
      const factura = archiveMotivo.trim()
      await supabase.from('crm_offers').update({ etapa: 'facturado', estatus: 'cerrada' }).eq('id', archiveModal.venta.id)
      if (factura) {
        await supabase.from('crm_offer_items')
          .update({ numero_factura: factura, estatus: 'facturado' })
          .eq('offer_id', archiveModal.venta.id)
      }
      toast.success('✓ Oferta facturada')
    }
    setArchiveModal(null); setArchiveMotivo(''); setSavingArchive(false)
    load()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-full mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Pipeline de ventas</h1>
          <p className="text-sm text-gray-400">
            {loading ? 'Cargando...' : `${visible.length} registros`}
            {countArchivadas > 0 && !filterArchivadas &&
              <button onClick={() => setFilterArchivadas(true)} className="ml-3 text-gray-300 hover:text-gray-500 text-xs underline">
                {countArchivadas} archivadas
              </button>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => nav('/crm/reports')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">Reportes SAP</button>
          <button onClick={() => nav('/cedis')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">CEDIS</button>
          <button onClick={() => nav('/crm/venta-manual')} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700">+ Nueva venta</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {filterArchivadas ? (
          <button onClick={() => setFilterArchivadas(false)}
            className="flex items-center gap-1.5 bg-gray-200 text-gray-700 px-3 py-2 rounded-xl text-xs font-medium hover:bg-gray-300">
            ← Volver a activas
          </button>
        ) : (
          <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
            {[{k:'activas',l:`Activas (${countActivas})`},{k:'',l:'Todas'},...ETAPAS.map(e=>({k:e.key,l:e.label}))].map(f => (
              <button key={f.k} onClick={() => setFilterEtapa(f.k)}
                className={`px-3 py-2 text-xs font-medium transition flex-shrink-0 ${filterEtapa === f.k ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {f.l}
              </button>
            ))}
          </div>
        )}
        <input
          className="flex-1 min-w-52 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar cliente, folio, notas..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold">
                <th className="px-3 py-2.5 text-left w-8"></th>
                <th className="px-3 py-2.5 text-left min-w-40">Cliente</th>
                <th className="px-3 py-2.5 text-left w-32">Etapa</th>
                <th className="px-3 py-2.5 text-left w-36">Folio SAP</th>
                <th className="px-3 py-2.5 text-right w-28">Valor</th>
                <th className="px-3 py-2.5 text-center w-16">Días</th>
                <th className="px-3 py-2.5 text-left w-36">Factura</th>
                <th className="px-3 py-2.5 text-left">Notas</th>
                <th className="px-3 py-2.5 text-right w-44">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">
                  {filterArchivadas ? 'No hay registros archivados.' : 'No hay registros.'}
                </td></tr>
              )}
              {!loading && visible.map(v => {
                const cli    = v.crm_clients
                const items  = v.crm_offer_items ?? []
                const etapa  = ETAPAS.find(e => e.key === v.etapa)
                const dias   = diasEnEtapa(v)
                const alerta = dias >= 7 && !['facturado','cancelado'].includes(v.etapa)
                const total  = items.reduce((a: number, i: any) =>
                  a + ((i.cantidad_aceptada ?? i.cantidad_ofertada ?? 0) * (i.precio_aceptado ?? i.precio_oferta ?? 0)), 0)
                const isHighlight = v.id === highlightId
                const isExpanded  = expandedId === v.id
                const hasEdits = !!edits[v.id]
                const factura = items.find((i: any) => i.numero_factura)?.numero_factura ?? ''

                return (
                  <>
                    <tr
                      key={v.id}
                      ref={isHighlight ? highlightRef : undefined}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition ${isHighlight ? 'bg-teal-50 ring-1 ring-inset ring-teal-300' : ''} ${alerta ? 'bg-orange-50/40' : ''}`}>

                      {/* Expand toggle */}
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => setExpandedId(isExpanded ? null : v.id)}
                          className={`text-gray-400 hover:text-teal-600 transition ${isExpanded ? 'text-teal-600' : ''}`}>
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      </td>

                      {/* Cliente */}
                      <td className="px-3 py-2">
                        <button onClick={() => nav(`/crm/${v.client_id}`)}
                          className="font-semibold text-gray-800 hover:text-teal-600 text-left max-w-48 truncate block">
                          {cli?.razon_social ?? cli?.solicitante ?? '—'}
                        </button>
                        {v.tipo_negocio === 'donativo' && (
                          <span className="text-purple-500 text-xs">🎁 Donativo</span>
                        )}
                      </td>

                      {/* Etapa — dropdown inline */}
                      <td className="px-3 py-2">
                        <select
                          value={getEdit(v.id, 'etapa', v.etapa)}
                          onChange={e => setEdit(v.id, 'etapa', e.target.value)}
                          style={{ background: etapa?.bg, color: etapa?.text, borderColor: etapa?.color }}
                          className="border rounded-lg px-2 py-1 text-xs outline-none font-medium w-full">
                          {ETAPAS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                        </select>
                      </td>

                      {/* Folio SAP — editable */}
                      <td className="px-3 py-2">
                        <input
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400 font-mono"
                          placeholder="Folio SAP..."
                          value={getEdit(v.id, 'folio', v.folio_pedido ?? '')}
                          onChange={e => setEdit(v.id, 'folio', e.target.value)} />
                      </td>

                      {/* Valor */}
                      <td className="px-3 py-2 text-right font-semibold text-gray-700">
                        {total > 0 ? `$${total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}` : '—'}
                      </td>

                      {/* Días */}
                      <td className="px-3 py-2 text-center">
                        <span className={`font-semibold ${alerta ? 'text-orange-600' : 'text-gray-500'}`}>
                          {dias}{alerta ? ' ⚠' : ''}
                        </span>
                      </td>

                      {/* Factura — editable */}
                      <td className="px-3 py-2">
                        <input
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400 font-mono"
                          placeholder="No. factura..."
                          value={getEdit(v.id, 'factura', factura)}
                          onChange={e => setEdit(v.id, 'factura', e.target.value)} />
                      </td>

                      {/* Notas */}
                      <td className="px-3 py-2 text-gray-400 max-w-48 truncate italic text-xs">
                        {v.notas ?? ''}
                      </td>

                      {/* Acciones */}
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {hasEdits && (
                            <button onClick={() => saveRow(v)}
                              disabled={saving[v.id]}
                              className="bg-teal-600 text-white px-2.5 py-1 rounded-lg text-xs font-semibold hover:bg-teal-700 disabled:opacity-50">
                              {saving[v.id] ? '...' : '✓ Guardar'}
                            </button>
                          )}
                          {!['facturado','cancelado'].includes(v.etapa) && (
                            <>
                              <button onClick={() => avanzarEtapa(v)}
                                className="bg-teal-600 text-white px-2.5 py-1 rounded-lg text-xs font-medium hover:bg-teal-700 whitespace-nowrap">
                                {v.etapa === 'oferta' ? 'Venta →' : v.etapa === 'transmision' ? 'Facturar →' : 'Avanzar →'}
                              </button>
                              <button
                                onClick={() => { setArchiveModal({ venta: v, accion: 'archivar' }); setArchiveMotivo('') }}
                                className="border border-red-200 text-red-500 px-2 py-1 rounded-lg text-xs hover:bg-red-50"
                                title="Archivar oferta">
                                ✗
                              </button>
                            </>
                          )}
                          {v.etapa === 'facturado' && (
                            <span className="text-green-600 font-semibold text-xs px-2">✓ Facturada</span>
                          )}
                          {v.etapa === 'cancelado' && (
                            <span className="text-gray-400 text-xs px-2">Archivada</span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Fila expandida — materiales */}
                    {isExpanded && (
                      <tr key={`${v.id}-exp`} className="bg-gray-50 border-b border-gray-200">
                        <td />
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                              Materiales · {items.length}
                            </p>
                            <button onClick={() => nav(`/crm/${v.client_id}/offer/${v.id}`)}
                              className="text-xs text-teal-600 hover:underline border border-teal-200 px-2 py-1 rounded-lg hover:bg-teal-50">
                              Editar oferta ↗
                            </button>
                          </div>
                          {items.length === 0
                            ? <p className="text-xs text-gray-400">Sin materiales.</p>
                            : (
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    {['Material','Descripción','Cant.','Precio','UM','Lote/Cad','Estatus','Factura'].map(h => (
                                      <th key={h} className="px-2 py-1.5 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item: any) => (
                                    <tr key={item.id} className="border-b border-gray-100 last:border-0">
                                      <td className="px-2 py-1.5 font-mono font-semibold text-gray-800">{item.material}</td>
                                      <td className="px-2 py-1.5 text-gray-600 max-w-40 truncate">{item.descripcion}</td>
                                      <td className="px-2 py-1.5 text-right">{item.cantidad_aceptada ?? item.cantidad_ofertada}</td>
                                      <td className="px-2 py-1.5 text-right">
                                        {(item.precio_aceptado ?? item.precio_oferta)
                                          ? `$${Number(item.precio_aceptado ?? item.precio_oferta).toLocaleString('es-MX',{minimumFractionDigits:2})}`
                                          : '—'}
                                      </td>
                                      <td className="px-2 py-1.5">{item.um}</td>
                                      <td className="px-2 py-1.5 whitespace-nowrap">
                                        {item.lote ? `${item.lote}${item.caducidad ? ` / ${item.caducidad}` : ''}` : '—'}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                          {(item.estatus ?? '').replace(/_/g,' ')}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 font-mono text-gray-600">{item.numero_factura ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          {v.notas && <p className="text-xs text-gray-500 mt-2 italic">📝 {v.notas}</p>}
                          {items.some((i: any) => i.cedis_request_id) && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-amber-600 font-semibold">📦 CEDIS activos</span>
                              <button onClick={() => nav('/cedis')}
                                className="text-xs text-amber-600 hover:underline border border-amber-200 px-2 py-0.5 rounded-lg hover:bg-amber-50">
                                Ver en CEDIS →
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Confirmar oferta → venta ─────────────────────────────────── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-800">Confirmar materiales — Convertir a Venta</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {confirmModal.venta.crm_clients?.razon_social ?? confirmModal.venta.crm_clients?.solicitante}
                </p>
              </div>
              <button onClick={() => setConfirmModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 whitespace-nowrap">Folio / Pedido SAP:</label>
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 font-mono flex-1 max-w-56"
                  placeholder="Opcional" value={folioInput} onChange={e => setFolioInput(e.target.value)} />
              </div>
            </div>
            <div className="px-6 py-2 border-b border-gray-100 flex-shrink-0 flex items-center gap-3">
              <span className="text-xs text-gray-500">Selección rápida:</span>
              <button onClick={() => toggleAll(true)}
                className="text-xs bg-green-50 border border-green-300 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium">
                ✓ Aceptar todos
              </button>
              <button onClick={() => toggleAll(false)}
                className="text-xs bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium">
                ✗ Rechazar todos
              </button>
              <span className="text-xs text-gray-400 ml-auto">
                {Object.values(confirmItems).filter(ci => ci.aceptado).length}/{confirmModal.items.length} aceptados
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-2">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200">
                    {['✓','Material','Descripción','Cant. ofertada','Cant. confirmar','Lote','Caducidad','Comentario si rechaza','CEDIS'].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confirmModal.items.map((item: any) => {
                    const ci = confirmItems[item.id] ?? {
                      aceptado: true, cantidad: '', lote: '', caducidad: '', comentario: '',
                      requiereCedis: false, cedisOrigen: '', cedisAlmacenOrigen: '', cedisDestino: '', cedisAlmacenDestino: '',
                    }
                    return (<>
                      <tr key={item.id} className={`border-b border-gray-100 ${!ci.aceptado ? 'opacity-50 bg-red-50' : ''}`}>
                        <td className="px-2 py-2">
                          <button onClick={() => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, aceptado: !ci.aceptado } }))}
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center transition ${ci.aceptado ? 'bg-green-500 border-green-500 text-white' : 'border-red-300 bg-red-50 text-red-400'}`}>
                            {ci.aceptado ? '✓' : '✗'}
                          </button>
                        </td>
                        <td className="px-2 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{item.material}</td>
                        <td className="px-2 py-2 text-gray-600 max-w-40 truncate">{item.descripcion}</td>
                        <td className="px-2 py-2 text-right text-gray-600">{item.cantidad_aceptada ?? item.cantidad_ofertada}</td>
                        <td className="px-2 py-1">
                          <input type="number" min="0"
                            className={`w-20 border rounded px-2 py-1 text-xs outline-none ${ci.aceptado ? 'border-gray-200 focus:border-teal-400' : 'border-gray-100 bg-gray-50 text-gray-300'}`}
                            disabled={!ci.aceptado}
                            placeholder={String(item.cantidad_aceptada ?? item.cantidad_ofertada ?? '')}
                            value={ci.cantidad}
                            onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, cantidad: e.target.value } }))} />
                        </td>
                        <td className="px-2 py-1">
                          <input className={`w-24 border rounded px-2 py-1 text-xs outline-none ${ci.aceptado ? 'border-gray-200 focus:border-teal-400' : 'border-gray-100 bg-gray-50 text-gray-300'}`}
                            disabled={!ci.aceptado} placeholder="Lote" value={ci.lote}
                            onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, lote: e.target.value } }))} />
                        </td>
                        <td className="px-2 py-1">
                          <input type="date" className={`w-32 border rounded px-2 py-1 text-xs outline-none ${ci.aceptado ? 'border-gray-200 focus:border-teal-400' : 'border-gray-100 bg-gray-50 text-gray-300'}`}
                            disabled={!ci.aceptado} value={ci.caducidad}
                            onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, caducidad: e.target.value } }))} />
                        </td>
                        <td className="px-2 py-1">
                          <input className={`w-40 border rounded px-2 py-1 text-xs outline-none ${!ci.aceptado ? 'border-amber-300 focus:border-amber-500 bg-amber-50' : 'border-gray-100 bg-gray-50 text-gray-300'}`}
                            placeholder={ci.aceptado ? '' : 'Motivo rechazo...'}
                            value={ci.comentario}
                            onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, comentario: e.target.value } }))} />
                        </td>
                        <td className="px-2 py-1">
                          {ci.aceptado && (
                            <button
                              onClick={() => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, requiereCedis: !ci.requiereCedis } }))}
                              className={`text-xs px-2 py-1 rounded-lg border font-medium transition ${ci.requiereCedis ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-400 border-gray-200 hover:border-amber-300'}`}>
                              📦
                            </button>
                          )}
                        </td>
                      </tr>
                      {ci.aceptado && ci.requiereCedis && (
                        <tr key={`${item.id}-cedis`} className="bg-amber-50 border-b border-amber-100">
                          <td colSpan={2} />
                          <td colSpan={7} className="px-2 py-2">
                            <div className="flex gap-2 items-center flex-wrap">
                              <span className="text-xs text-amber-700 font-semibold">Traslado CEDIS:</span>
                              {[
                                {l:'C.Origen',f:'cedisOrigen'},{l:'Alm.Orig',f:'cedisAlmacenOrigen'},
                                {l:'→ C.Dest',f:'cedisDestino'},{l:'Alm.Dest',f:'cedisAlmacenDestino'},
                              ].map(({l,f}) => (
                                <div key={f} className="flex items-center gap-1">
                                  <span className="text-xs text-gray-500">{l}</span>
                                  <input className="w-20 border border-amber-300 rounded px-2 py-1 text-xs outline-none focus:border-amber-500 bg-white"
                                    placeholder={l.includes('C.') ? '1031' : '0001'}
                                    value={(ci as any)[f]}
                                    onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, [f]: e.target.value } }))} />
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>)
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <button onClick={() => setConfirmModal(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              <button onClick={confirmarVenta} disabled={savingConfirm}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                {savingConfirm ? 'Guardando...' : 'Confirmar y convertir a Venta →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Archivar / Facturar ───────────────────────────────────────── */}
      {archiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">
              {archiveModal.accion === 'archivar' ? '📁 Archivar oferta' : '✅ Registrar facturación'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {archiveModal.venta.crm_clients?.razon_social ?? archiveModal.venta.crm_clients?.solicitante}
            </p>
            {archiveModal.accion === 'archivar' ? (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 mb-4">
                  La oferta quedará archivada y visible en el filtro "Archivadas". No se eliminan datos.
                </div>
                <div className="mb-4">
                  <label className="text-xs text-gray-500 block mb-1">Motivo (opcional)</label>
                  <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none h-20 resize-none focus:border-gray-400"
                    placeholder="Ej: Cliente rechazó precio, competencia, presupuesto..."
                    value={archiveMotivo} onChange={e => setArchiveMotivo(e.target.value)} autoFocus />
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700 mb-4">
                  Esto moverá la oferta a "Facturada" y actualizará todos los materiales.
                </div>
                <div className="mb-4">
                  <label className="text-xs text-gray-500 block mb-1">Número de factura (opcional)</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 font-mono"
                    placeholder="Ej: F-2026-00123"
                    value={archiveMotivo} onChange={e => setArchiveMotivo(e.target.value)} autoFocus />
                </div>
              </>
            )}
            <div className="flex justify-between">
              <button onClick={() => setArchiveModal(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Volver</button>
              <button onClick={ejecutarArchive} disabled={savingArchive}
                className={`text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${archiveModal.accion === 'archivar' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {savingArchive ? 'Guardando...' : archiveModal.accion === 'archivar' ? 'Archivar' : 'Confirmar facturación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
