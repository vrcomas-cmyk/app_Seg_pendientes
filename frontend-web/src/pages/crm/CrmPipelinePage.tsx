import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const [ventas, setVentas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEtapa, setFilterEtapa] = useState<string>('activas')
  const [search, setSearch] = useState('')
  const [showNueva, setShowNueva] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Modal folio SAP para avanzar oferta→venta
  const [folioModal, setFolioModal] = useState<{ venta: any } | null>(null)
  const [folioInput, setFolioInput] = useState('')
  const [savingFolio, setSavingFolio] = useState(false)

  // Editar folio inline en etapa venta
  const [editFolioId, setEditFolioId] = useState<string | null>(null)
  const [editFolioVal, setEditFolioVal] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_offers')
      .select(`
        id, tipo, tipo_negocio, etapa, estatus, notas, created_at, fecha_venta,
        client_id, folio_pedido, gpo_cliente, gpo_vendedor,
        crm_clients(id, solicitante, razon_social, no_cliente),
        crm_offer_items(id, material, descripcion, cantidad_aceptada, precio_aceptado,
          numero_factura, estatus, lote, caducidad, um)
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
        cli?.no_cliente?.toLowerCase().includes(q) ||
        v.notas?.toLowerCase().includes(q) ||
        v.folio_pedido?.toLowerCase().includes(q)
    }
    return true
  })

  const cuentaPorEtapa = (etapa: string) => ventas.filter(v => v.etapa === etapa).length
  const alertas = ventas.filter(v => diasDesdeVenta(v.fecha_venta) >= 7 && !['facturado','cancelado'].includes(v.etapa)).length

  // Avanzar — si es oferta→venta pide folio; facturado pide número de factura
  const avanzarEtapa = async (venta: any, folioSAP?: string) => {
    const idx = ETAPA_IDX[venta.etapa] ?? 0
    if (idx >= 4) return
    const nextEtapa = ETAPAS[idx + 1].key

    if (nextEtapa === 'venta' && !folioSAP) {
      setFolioModal({ venta })
      setFolioInput(venta.folio_pedido ?? '')
      return
    }

    if (nextEtapa === 'facturado') {
      const factura = prompt('Número de factura:')
      if (!factura) return
      await supabase.from('crm_offer_items')
        .update({ numero_factura: factura, estatus: 'facturado' })
        .eq('offer_id', venta.id)
    }

    const updates: any = { etapa: nextEtapa }
    if (nextEtapa === 'venta') {
      updates.fecha_venta = new Date().toISOString().split('T')[0]
      if (folioSAP) updates.folio_pedido = folioSAP
      // Mark all items as aceptado
      await supabase.from('crm_offer_items')
        .update({ aceptado: true, estatus: 'aceptado' })
        .eq('offer_id', venta.id)
        .eq('estatus', 'ofertado')
    }

    await supabase.from('crm_offers').update(updates).eq('id', venta.id)
    toast.success(`Avanzado a ${ETAPAS[idx+1].label}`)
    setFolioModal(null); setFolioInput('')
    load()
  }

  const confirmarFolio = async () => {
    if (!folioModal) return
    setSavingFolio(true)
    await avanzarEtapa(folioModal.venta, folioInput || undefined)
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
          const total    = items.reduce((a: number, i: any) => a + ((i.cantidad_aceptada ?? 0) * (i.precio_aceptado ?? 0)), 0)
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
                        {cli?.no_cliente ? `${cli.no_cliente} — ` : ''}{cli?.razon_social ?? cli?.solicitante ?? 'Sin cliente'}
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
                    <div className="flex gap-1.5">
                      {!['facturado','cancelado'].includes(v.etapa) && (
                        <button onClick={() => avanzarEtapa(v)}
                          className="text-xs bg-teal-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-teal-700 font-medium">
                          {esOferta ? 'Convertir a Venta →' : 'Avanzar →'}
                        </button>
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
                            <td className="px-2 py-1.5 text-right">{item.cantidad_aceptada}</td>
                            <td className="px-2 py-1.5 text-right">
                              {item.precio_aceptado ? `$${Number(item.precio_aceptado).toLocaleString('es-MX',{minimumFractionDigits:2})}` : '—'}
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
                </div>
              )}
            </div>
          )
        })}
      </div>

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
