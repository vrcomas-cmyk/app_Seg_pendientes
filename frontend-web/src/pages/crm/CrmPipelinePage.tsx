import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const ETAPAS = [
  { key: 'oferta',      label: 'Oferta',      color: '#6B7280', bg: '#F3F4F6', text: '#374151' },
  { key: 'venta',       label: 'Venta',        color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  { key: 'cedis',       label: 'CEDIS',        color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { key: 'transmision', label: 'Transmisión',  color: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6' },
  { key: 'facturado',   label: 'Facturado',    color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
]

const ETAPA_IDX: Record<string, number> = { oferta:0, venta:1, cedis:2, transmision:3, facturado:4 }

const ITEM_ESTATUS_COLOR: Record<string, string> = {
  borrador:         'bg-gray-100 text-gray-500',
  ofertado:         'bg-gray-100 text-gray-600',
  aceptado:         'bg-green-100 text-green-700',
  rechazado:        'bg-red-100 text-red-600',
  solicitud_cedis:  'bg-yellow-100 text-yellow-700',
  en_transito:      'bg-orange-100 text-orange-700',
  recibido_cedis:   'bg-teal-100 text-teal-700',
  disponible:       'bg-indigo-100 text-indigo-700',
  surtido:          'bg-cyan-100 text-cyan-700',
  facturado:        'bg-green-200 text-green-800',
  cancelado:        'bg-gray-100 text-gray-400',
}

function diasDesdeVenta(fechaVenta: string | null): number {
  if (!fechaVenta) return 0
  return Math.floor((Date.now() - new Date(fechaVenta).getTime()) / 86400000)
}

export default function CrmPipelinePage() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [ventas, setVentas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEtapa, setFilterEtapa] = useState<string>(
    () => searchParams.get('id') ? '' : 'activas'
  )
  const [search, setSearch] = useState('')
  const [showNueva, setShowNueva] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(
    () => searchParams.get('id')
  )

  // Modal folio SAP para avanzar oferta→venta
  const [folioModal, setFolioModal] = useState<{ venta: any } | null>(null)
  const [folioInput, setFolioInput] = useState('')
  const [savingFolio, setSavingFolio] = useState(false)

  // Editar folio inline en etapa venta
  const [editFolioId, setEditFolioId] = useState<string | null>(null)
  const [editFolioVal, setEditFolioVal] = useState('')

  // Modal confirmación de materiales (oferta → venta)
  const [confirmModal, setConfirmModal] = useState<{ venta: any; items: any[] } | null>(null)
  const [confirmItems, setConfirmItems] = useState<Record<string, {
    aceptado: boolean; cantidad: string; lote: string; caducidad: string; comentario: string
    requiereCedis: boolean
    cedisOrigen: string; cedisAlmacenOrigen: string
    cedisDestino: string; cedisAlmacenDestino: string
  }>>({})
  const [savingConfirm, setSavingConfirm] = useState(false)

  // Cerrar / Cancelar oferta
  const [closeModal, setCloseModal] = useState<{ venta: any; accion: 'cerrar' | 'cancelar' } | null>(null)
  const [closeMotivo, setCloseMotivo] = useState('')
  const [savingClose, setSavingClose] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_offers')
      .select(`
        id, tipo, tipo_negocio, etapa, estatus, notas, created_at, fecha_venta,
        client_id, folio_pedido, gpo_cliente, gpo_vendedor,
        crm_clients(id, solicitante, razon_social),
        crm_offer_items(id, material, descripcion, cantidad_aceptada, precio_aceptado,
          cantidad_ofertada, precio_oferta,
          numero_factura, estatus, lote, caducidad, um, cedis_request_id)
      `)
      .order('created_at', { ascending: false })
    setVentas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = ventas.filter(v => {
    if (filterEtapa === 'activas' && ['facturado','cancelado'].includes(v.etapa)) return false
    if (filterEtapa === 'alerta') {
      return diasDesdeVenta(v.fecha_venta) >= 7 && !['facturado','cancelado'].includes(v.etapa)
    }
    if (filterEtapa && !['activas','alerta',''].includes(filterEtapa) && v.etapa !== filterEtapa) return false
    if (search) {
      const q = search.toLowerCase()
      const cli = v.crm_clients
      return cli?.solicitante?.toLowerCase().includes(q) ||
        cli?.razon_social?.toLowerCase().includes(q) ||
        
        v.notas?.toLowerCase().includes(q) ||
        v.folio_pedido?.toLowerCase().includes(q)
    }
    return true
  })

  const cuentaPorEtapa = (etapa: string) => ventas.filter(v => v.etapa === etapa).length
  const alertas = ventas.filter(v => diasDesdeVenta(v.fecha_venta) >= 7 && !['facturado','cancelado'].includes(v.etapa)).length

  // Abrir modal de confirmación de materiales (oferta → venta)
  const abrirConfirmacion = (venta: any) => {
    const items = venta.crm_offer_items ?? []
    const initState: Record<string, any> = {}
    items.forEach((item: any) => {
      initState[item.id] = {
        aceptado:  true,
        cantidad:  String(item.cantidad_aceptada ?? ''),
        lote:      item.lote ?? '',
        caducidad: item.caducidad ?? '',
        comentario: '',
        requiereCedis:         false,
        cedisOrigen:           '',
        cedisAlmacenOrigen:    '',
        cedisDestino:          '',
        cedisAlmacenDestino:   '',
      }
    })
    setConfirmItems(initState)
    setConfirmModal({ venta, items })
    // Pre-fill folio
    setFolioInput(venta.folio_pedido ?? '')
  }

  const toggleAllItems = (aceptado: boolean) => {
    setConfirmItems(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => { next[id] = { ...next[id], aceptado } })
      return next
    })
  }

  const confirmarVenta = async () => {
    if (!confirmModal) return
    setSavingConfirm(true)
    const user_id = (await supabase.auth.getSession()).data.session?.user.id

    for (const item of confirmModal.items) {
      const ci = confirmItems[item.id]
      if (!ci) continue
      const updates: any = {
        aceptado:  ci.aceptado,
        estatus:   ci.aceptado ? 'aceptado' : 'rechazado',
      }
      if (ci.aceptado) {
        if (ci.cantidad) updates.cantidad_aceptada = parseFloat(ci.cantidad)
        if (ci.lote)     updates.lote = ci.lote
        if (ci.caducidad) updates.caducidad = ci.caducidad
      }
      await supabase.from('crm_offer_items').update(updates).eq('id', item.id)

      if (ci.comentario) {
        await supabase.from('crm_offer_item_history').insert({
          item_id: item.id,
          estatus_anterior: item.estatus,
          estatus_nuevo: updates.estatus,
          comentario: ci.comentario,
          created_by: user_id,
        })
      }
      // Create CEDIS request if needed
      if (ci.aceptado && ci.requiereCedis && ci.cedisOrigen && ci.cedisDestino) {
        const { data: cedisReq } = await supabase.from('crm_cedis_requests').insert({
          codigo:           item.material,
          descripcion:      item.descripcion,
          cantidad:         parseFloat(ci.cantidad) || item.cantidad_aceptada || 0,
          cantidad_pedida:  parseFloat(ci.cantidad) || item.cantidad_aceptada || 0,
          centro_origen:    ci.cedisOrigen,
          almacen_origen:   ci.cedisAlmacenOrigen || null,
          centro_destino:   ci.cedisDestino,
          almacen_destino:  ci.cedisAlmacenDestino || null,
          tipo_movimiento:  'para_pedido',
          folio_pedido_destino: folioInput.trim() || null,
          crm_offer_item_id: item.id,
          estatus:          'pendiente_solicitar',
          origen:           'crm',
          created_by:       user_id,
        }).select('id').single()
        if (cedisReq) {
          await supabase.from('crm_offer_items')
            .update({ cedis_request_id: cedisReq.id, estatus: 'solicitud_cedis', requiere_traslado: true })
            .eq('id', item.id)
          await supabase.from('crm_cedis_history').insert({
            request_id: cedisReq.id,
            estatus: 'pendiente_solicitar',
            nota: `Creado desde oferta CRM — ${confirmModal?.venta?.crm_clients?.razon_social ?? confirmModal?.venta?.crm_clients?.solicitante ?? ''}`,
            created_by: user_id,
          })
        }
      }
    }

    // Check if at least one item is aceptado
    const hayAceptados = Object.values(confirmItems).some(ci => ci.aceptado)
    if (!hayAceptados) {
      toast.error('Debes aceptar al menos un material para convertir a Venta')
      setSavingConfirm(false)
      return
    }

    const updates: any = {
      etapa: 'venta',
      fecha_venta: new Date().toISOString().split('T')[0],
    }
    if (folioInput.trim()) updates.folio_pedido = folioInput.trim()

    await supabase.from('crm_offers').update(updates).eq('id', confirmModal.venta.id)
    toast.success('Oferta convertida a Venta')
    setConfirmModal(null); setSavingConfirm(false); setFolioInput('')
    load()
  }

  // Avanzar etapas posteriores a venta (cedis, transmision, facturado)
  const avanzarEtapa = async (venta: any) => {
    const idx = ETAPA_IDX[venta.etapa] ?? 0
    if (idx >= 4) return

    // oferta → venta: open confirmation modal
    if (venta.etapa === 'oferta') {
      abrirConfirmacion(venta)
      return
    }

    const nextEtapa = ETAPAS[idx + 1].key

    if (nextEtapa === 'facturado') {
      const factura = prompt('Número de factura:')
      if (!factura) return
      await supabase.from('crm_offer_items')
        .update({ numero_factura: factura, estatus: 'facturado' })
        .eq('offer_id', venta.id)
    }

    await supabase.from('crm_offers').update({ etapa: nextEtapa }).eq('id', venta.id)
    toast.success(`Avanzado a ${ETAPAS[idx+1].label}`)
    load()
  }

  // Cerrar o cancelar oferta
  const ejecutarCierre = async () => {
    if (!closeModal) return
    setSavingClose(true)
    const user_id = (await supabase.auth.getSession()).data.session?.user.id
    const nuevoEstatus = closeModal.accion === 'cancelar' ? 'cancelado' : 'cerrada'
    await supabase.from('crm_offers').update({
      estatus: nuevoEstatus,
      etapa:   nuevoEstatus,   // pipeline filtra por etapa
      notas:   closeMotivo || null,
    }).eq('id', closeModal.venta.id)
    // Also mark items
    await supabase.from('crm_offer_items')
      .update({ estatus: nuevoEstatus === 'cancelado' ? 'cancelado' : 'facturado' })
      .eq('offer_id', closeModal.venta.id)
    toast.success(closeModal.accion === 'cancelar' ? 'Oferta cancelada' : 'Oferta cerrada')
    setCloseModal(null); setCloseMotivo(''); setSavingClose(false)
    load()
  }

  const confirmarFolio = async () => {
    if (!folioModal) return
    setSavingFolio(true)
    await avanzarEtapa(folioModal.venta)
    setSavingFolio(false)
  }

  const guardarFolioEdit = async (ofertaId: string) => {
    await supabase.from('crm_offers').update({ folio_pedido: editFolioVal || null }).eq('id', ofertaId)
    setVentas(prev => prev.map(v => v.id === ofertaId ? { ...v, folio_pedido: editFolioVal || null } : v))
    setEditFolioId(null)
    toast.success('Folio actualizado')
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Pipeline de ventas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Seguimiento por etapa — CRM</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => nav('/crm/prospectos')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">Prospectos</button>
          <button onClick={() => nav('/cedis')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">CEDIS</button>
          <button onClick={() => nav('/crm/reports')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">Reportes</button>
          <button onClick={() => setShowNueva(true)} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700 shadow-sm">+ Nueva venta</button>
        </div>
      </div>

      {/* Barra de etapas */}
      <div className="flex mb-5 rounded-xl overflow-hidden border border-gray-200">
        {ETAPAS.map((e) => (
          <button key={e.key} onClick={() => setFilterEtapa(e.key)}
            style={{ background: filterEtapa === e.key ? e.bg : undefined }}
            className={`flex-1 py-2.5 px-2 text-center border-r border-gray-200 last:border-0 transition hover:opacity-80 ${filterEtapa === e.key ? '' : 'bg-white'}`}>
            <p className="text-xs font-semibold" style={{ color: e.text }}>{e.label}</p>
            <p className="text-lg font-bold" style={{ color: e.color }}>{cuentaPorEtapa(e.key)}</p>
          </button>
        ))}
      </div>

      {alertas > 0 && (
        <button onClick={() => setFilterEtapa('alerta')}
          className="w-full mb-4 flex items-center gap-3 bg-orange-50 border border-orange-200 border-l-4 border-l-orange-400 rounded-xl px-4 py-3 text-left hover:bg-orange-100 transition">
          <p className="text-sm text-orange-800 font-medium">
            ⚠ {alertas} {alertas === 1 ? 'venta lleva' : 'ventas llevan'} más de 7 días sin facturar — <span className="underline">ver</span>
          </p>
        </button>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-x-auto">
          {[{key:'activas',label:'Activas'},{key:'',label:'Todas'},{key:'alerta',label:'⚠ +7 días'},{key:'facturado',label:'Facturadas'}].map(f => (
            <button key={f.key} onClick={() => setFilterEtapa(f.key)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium transition ${filterEtapa === f.key ? 'bg-teal-600 text-white' : f.key === 'alerta' ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-500 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar cliente, razón social, folio..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-8 text-center">Cargando...</p>}
        {!loading && visible.length === 0 && <div className="p-12 text-center"><p className="text-gray-400 text-sm">No hay registros.</p></div>}
        {!loading && visible.map(v => {
          const cli      = v.crm_clients
          const etapa    = ETAPAS.find(e => e.key === v.etapa) ?? ETAPAS[0]
          const etapaIdx = ETAPA_IDX[v.etapa] ?? 0
          const dias     = diasDesdeVenta(v.fecha_venta)
          const tieneAlerta = dias >= 7 && !['facturado','cancelado'].includes(v.etapa)
          const items    = v.crm_offer_items ?? []
          const total    = items.reduce((a: number, i: any) => a + ((i.cantidad_aceptada ?? i.cantidad_ofertada ?? 0) * (i.precio_aceptado ?? i.precio_oferta ?? 0)), 0)
          const isExpanded = expandedId === v.id
          const esOferta = v.etapa === 'oferta'
          const esDonativo = v.tipo_negocio === 'donativo'

          return (
            <div key={v.id}
              style={{ borderLeft: `3px solid ${tieneAlerta ? '#F97316' : etapa.color}` }}
              className="border-b border-gray-100 last:border-0">
              {/* Fila principal */}
              <div className={`px-4 py-4 hover:bg-gray-50 transition cursor-pointer ${tieneAlerta ? 'bg-orange-50/30' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : v.id)}>
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* Fila 1: cliente + etapa + alerta */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-semibold text-gray-800">
                        {cli?.razon_social ?? cli?.solicitante ?? 'Sin cliente'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: etapa.bg, color: etapa.text }}>
                        {esDonativo ? '🎁 Donativo · ' : ''}{etapa.label}
                      </span>
                      {tieneAlerta && <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">⚠ {dias} días</span>}
                    </div>

                    {/* Barra de progreso */}
                    <div className="flex gap-1 mb-2 items-center">
                      {ETAPAS.map((e, i) => (
                        <div key={e.key} className="flex-1 h-1.5 rounded-full"
                          style={{ background: i <= etapaIdx ? (tieneAlerta && i === etapaIdx ? '#F97316' : e.color) : '#E5E7EB' }} />
                      ))}
                    </div>

                    {/* Fila 2: meta info */}
                    <div className="flex gap-3 text-xs text-gray-400 flex-wrap items-center">
                      {v.folio_pedido && (
                        <span className="font-mono text-blue-600 font-medium">
                          {editFolioId === v.id ? (
                            <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <input className="border border-blue-300 rounded px-1.5 py-0.5 text-xs outline-none focus:border-blue-500 w-28 font-mono"
                                value={editFolioVal}
                                onChange={e => setEditFolioVal(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && guardarFolioEdit(v.id)}
                                autoFocus />
                              <button onClick={() => guardarFolioEdit(v.id)} className="text-teal-600 hover:text-teal-700 font-semibold">✓</button>
                              <button onClick={() => setEditFolioId(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              📋 {v.folio_pedido}
                              <button onClick={e => { e.stopPropagation(); setEditFolioId(v.id); setEditFolioVal(v.folio_pedido ?? '') }}
                                className="text-gray-300 hover:text-blue-500 ml-1">✏</button>
                            </span>
                          )}
                        </span>
                      )}
                      {!v.folio_pedido && !esOferta && (
                        <button onClick={e => { e.stopPropagation(); setEditFolioId(v.id); setEditFolioVal('') }}
                          className="text-amber-500 hover:text-amber-700 font-medium border border-amber-200 px-2 py-0.5 rounded-lg text-xs hover:bg-amber-50">
                          + Agregar folio SAP
                        </button>
                      )}
                      {v.fecha_venta && <span>Venta: {new Date(v.fecha_venta).toLocaleDateString('es-MX')}</span>}
                      <span>{items.length} material(es)</span>
                      <span className="text-gray-300">{isExpanded ? '▲ Cerrar' : '▼ Ver detalle'}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2" onClick={e => e.stopPropagation()}>
                    {total > 0 && (
                      <span className="text-sm font-semibold text-gray-700">
                        ${total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {!['facturado','cancelado','cerrada'].includes(v.etapa) && (
                        <>
                          <button onClick={() => avanzarEtapa(v)}
                            className="text-xs bg-teal-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-teal-700 font-medium">
                            {esOferta ? 'Convertir a Venta →' : 'Avanzar →'}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setCloseModal({ venta: v, accion: 'cancelar' }); setCloseMotivo('') }}
                            className="text-xs border border-red-200 text-red-500 px-2.5 py-1.5 rounded-lg hover:bg-red-50 font-medium"
                            title="Cancelar oferta">
                            ✗
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel expandible — detalle de materiales */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Materiales</p>
                    <button onClick={() => nav(`/crm/${v.client_id}/offer/${v.id}`)}
                      className="text-xs text-teal-600 hover:underline border border-teal-200 px-2 py-1 rounded-lg hover:bg-teal-50">
                      Editar oferta ↗
                    </button>
                  </div>
                  {items.length === 0 && <p className="text-xs text-gray-400">Sin materiales registrados.</p>}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200">
                          {['Material','Descripción','Cant.','Precio','UM','Lote / Cad','Estatus','Factura'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any) => (
                          <tr key={item.id} className="border-b border-gray-100 last:border-0">
                            <td className="px-2 py-1.5 font-mono font-semibold text-gray-800">{item.material}</td>
                            <td className="px-2 py-1.5 text-gray-600 max-w-48 truncate">{item.descripcion}</td>
                            <td className="px-2 py-1.5 text-right">{item.cantidad_aceptada ?? item.cantidad_ofertada}</td>
                            <td className="px-2 py-1.5 text-right">
                              {(item.precio_aceptado ?? item.precio_oferta) ? `$${Number(item.precio_aceptado ?? item.precio_oferta).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—'}
                            </td>
                            <td className="px-2 py-1.5">{item.um}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              {item.lote ? `${item.lote}${item.caducidad ? ` / ${item.caducidad}` : ''}` : '—'}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ITEM_ESTATUS_COLOR[item.estatus] ?? 'bg-gray-100 text-gray-500'}`}>
                                {(item.estatus ?? '').replace(/_/g,' ')}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 font-mono text-gray-600">{item.numero_factura ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {v.notas && (
                    <p className="text-xs text-gray-500 mt-2 italic">📝 {v.notas}</p>
                  )}

                  {/* CEDIS — link to module if any item has cedis_request_id */}
                  {items.some((i: any) => i.cedis_request_id) && (
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2">
                      <span className="text-xs text-amber-600 font-semibold">📦 Solicitudes CEDIS activas</span>
                      <button
                        onClick={e => { e.stopPropagation(); nav('/cedis') }}
                        className="text-xs text-amber-600 hover:underline border border-amber-200 px-2 py-0.5 rounded-lg hover:bg-amber-50">
                        Ver en módulo CEDIS →
                      </button>
                    </div>
                  )}

                  {/* Cerrar / Cancelar */}
                  {!['facturado','cancelado','cerrada'].includes(v.estatus ?? '') && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                      <button
                        onClick={e => { e.stopPropagation(); setCloseModal({ venta: v, accion: 'cerrar' }); setCloseMotivo('') }}
                        className="text-xs border border-green-300 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 font-medium">
                        ✓ Cerrar oferta
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setCloseModal({ venta: v, accion: 'cancelar' }); setCloseMotivo('') }}
                        className="text-xs border border-red-200 text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 font-medium">
                        ✗ Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Modal confirmación materiales (oferta → venta) ──────────────── */}
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

            {/* Folio SAP */}
            <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 whitespace-nowrap">Folio / Pedido SAP:</label>
                <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 font-mono flex-1 max-w-56"
                  placeholder="Opcional — puedes agregarlo después"
                  value={folioInput} onChange={e => setFolioInput(e.target.value)} />
              </div>
            </div>

            {/* Botones masivos */}
            <div className="px-6 py-2 border-b border-gray-100 flex-shrink-0 flex items-center gap-3">
              <span className="text-xs text-gray-500">Selección rápida:</span>
              <button onClick={() => toggleAllItems(true)}
                className="text-xs bg-green-50 border border-green-300 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium">
                ✓ Aceptar todos
              </button>
              <button onClick={() => toggleAllItems(false)}
                className="text-xs bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium">
                ✗ Rechazar todos
              </button>
              <span className="text-xs text-gray-400 ml-auto">
                {Object.values(confirmItems).filter(ci => ci.aceptado).length} de {confirmModal.items.length} aceptados
              </span>
            </div>

            {/* Tabla de items */}
            <div className="flex-1 overflow-y-auto px-6 py-2">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200">
                    {['✓','Material','Descripción','Cant. ofertada','Cant. confirmar','Lote','Caducidad','Comentario (si rechaza)','CEDIS'].map(h => (
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
                          <button
                            onClick={() => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, aceptado: !ci.aceptado } }))}
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center transition ${
                              ci.aceptado ? 'bg-green-500 border-green-500 text-white' : 'border-red-300 bg-red-50 text-red-400'
                            }`}>
                            {ci.aceptado ? '✓' : '✗'}
                          </button>
                        </td>
                        <td className="px-2 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{item.material}</td>
                        <td className="px-2 py-2 text-gray-600 max-w-40 truncate">{item.descripcion}</td>
                        <td className="px-2 py-2 text-right text-gray-600">{item.cantidad_aceptada}</td>
                        <td className="px-2 py-1">
                          <input type="number" min="0"
                            className={`w-20 border rounded px-2 py-1 text-xs outline-none ${ci.aceptado ? 'border-gray-200 focus:border-teal-400' : 'border-gray-100 bg-gray-50 text-gray-300'}`}
                            disabled={!ci.aceptado}
                            placeholder={String(item.cantidad_aceptada ?? '')}
                            value={ci.cantidad}
                            onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, cantidad: e.target.value } }))} />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            className={`w-24 border rounded px-2 py-1 text-xs outline-none ${ci.aceptado ? 'border-gray-200 focus:border-teal-400' : 'border-gray-100 bg-gray-50 text-gray-300'}`}
                            disabled={!ci.aceptado}
                            placeholder="Lote"
                            value={ci.lote}
                            onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, lote: e.target.value } }))} />
                        </td>
                        <td className="px-2 py-1">
                          <input type="date"
                            className={`w-32 border rounded px-2 py-1 text-xs outline-none ${ci.aceptado ? 'border-gray-200 focus:border-teal-400' : 'border-gray-100 bg-gray-50 text-gray-300'}`}
                            disabled={!ci.aceptado}
                            value={ci.caducidad}
                            onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, caducidad: e.target.value } }))} />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            className={`w-40 border rounded px-2 py-1 text-xs outline-none ${!ci.aceptado ? 'border-amber-300 focus:border-amber-500 bg-amber-50' : 'border-gray-100 bg-gray-50 text-gray-300'}`}
                            placeholder={ci.aceptado ? '' : 'Motivo rechazo...'}
                            value={ci.comentario}
                            onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, comentario: e.target.value } }))} />
                        </td>
                        {/* CEDIS toggle */}
                        <td className="px-2 py-1">
                          {ci.aceptado && (
                            <button
                              onClick={() => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, requiereCedis: !ci.requiereCedis } }))}
                              className={`text-xs px-2 py-1 rounded-lg border font-medium transition ${ci.requiereCedis ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-400 border-gray-200 hover:border-amber-300'}`}
                              title="Requiere traslado CEDIS">
                              📦 CEDIS
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* CEDIS fields row — only if toggled */}
                      {ci.aceptado && ci.requiereCedis && (
                        <tr className="bg-amber-50 border-b border-amber-100">
                          <td colSpan={2} />
                          <td colSpan={6} className="px-2 py-2">
                            <div className="flex gap-2 items-center flex-wrap">
                              <span className="text-xs text-amber-700 font-semibold flex-shrink-0">Traslado:</span>
                              {[
                                { label: 'C.Origen', field: 'cedisOrigen', w: 'w-20' },
                                { label: 'Alm.Orig', field: 'cedisAlmacenOrigen', w: 'w-20' },
                                { label: '→ C.Destino', field: 'cedisDestino', w: 'w-20' },
                                { label: 'Alm.Dest', field: 'cedisAlmacenDestino', w: 'w-20' },
                              ].map(f => (
                                <div key={f.field} className="flex items-center gap-1">
                                  <label className="text-xs text-gray-500 flex-shrink-0">{f.label}</label>
                                  <input className={`${f.w} border border-amber-300 rounded px-2 py-1 text-xs outline-none focus:border-amber-500 bg-white`}
                                    placeholder={f.label.includes('C.') ? '1031' : '0001'}
                                    value={(ci as any)[f.field]}
                                    onChange={e => setConfirmItems(prev => ({ ...prev, [item.id]: { ...ci, [f.field]: e.target.value } }))} />
                                </div>
                              ))}
                              <span className="text-xs text-amber-600">Se creará solicitud en CEDIS automáticamente</span>
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
              <button onClick={() => setConfirmModal(null)}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              <button onClick={confirmarVenta} disabled={savingConfirm}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                {savingConfirm ? 'Guardando...' : 'Confirmar y convertir a Venta →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal cerrar / cancelar oferta ─────────────────────────────────── */}
      {closeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">
              {closeModal.accion === 'cancelar' ? '✗ Cancelar oferta' : '✓ Cerrar oferta'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {closeModal.venta.crm_clients?.razon_social ?? closeModal.venta.crm_clients?.solicitante}
            </p>
            {closeModal.accion === 'cancelar' && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 mb-4">
                Todos los materiales quedarán como cancelados. Esta acción se puede revertir si es necesario.
              </div>
            )}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">
                {closeModal.accion === 'cancelar' ? 'Motivo de cancelación (opcional)' : 'Nota de cierre (opcional)'}
              </label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none h-20 resize-none focus:border-gray-400"
                placeholder={closeModal.accion === 'cancelar' ? 'Ej: Cliente no aceptó precio, fuera de presupuesto...' : 'Ej: Facturado fuera del sistema...'}
                value={closeMotivo}
                onChange={e => setCloseMotivo(e.target.value)}
                autoFocus />
            </div>
            <div className="flex justify-between">
              <button onClick={() => setCloseModal(null)}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Volver</button>
              <button onClick={ejecutarCierre} disabled={savingClose}
                className={`text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${closeModal.accion === 'cancelar' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}>
                {savingClose ? 'Guardando...' : closeModal.accion === 'cancelar' ? 'Confirmar cancelación' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal folio SAP oferta→venta */}
      {folioModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">Convertir a Venta</h2>
            <p className="text-sm text-gray-500 mb-4">
              {folioModal.venta.crm_clients?.razon_social ?? folioModal.venta.crm_clients?.solicitante}
            </p>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Folio / Número de pedido SAP</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 font-mono"
                placeholder="Ej: 4500012345 (opcional)"
                value={folioInput}
                onChange={e => setFolioInput(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && confirmarFolio()} />
              <p className="text-xs text-gray-400 mt-1">Puedes dejarlo vacío y agregarlo después.</p>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setFolioModal(null)}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              <button onClick={confirmarFolio} disabled={savingFolio}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                {savingFolio ? 'Guardando...' : 'Confirmar venta →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nueva venta */}
      {showNueva && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-sm">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-800">Nueva venta / oferta</h2>
              <button onClick={() => setShowNueva(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-3">
              <button onClick={() => { setShowNueva(false); nav('/crm/venta-manual') }}
                className="w-full flex items-start gap-3 border border-gray-200 rounded-xl p-4 text-left hover:border-teal-400 hover:bg-teal-50 transition">
                <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0 text-teal-700 font-bold text-sm">✍</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Formulario manual</p>
                  <p className="text-xs text-gray-400 mt-0.5">Cliente, materiales, cantidades y precios</p>
                </div>
              </button>
              <button onClick={() => { setShowNueva(false); nav('/crm/reports') }}
                className="w-full flex items-start gap-3 border border-gray-200 rounded-xl p-4 text-left hover:border-teal-400 hover:bg-teal-50 transition">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 text-purple-700 font-bold text-sm">📊</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Desde sugerencias SAP</p>
                  <p className="text-xs text-gray-400 mt-0.5">Reportes globales → seleccionar materiales</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
