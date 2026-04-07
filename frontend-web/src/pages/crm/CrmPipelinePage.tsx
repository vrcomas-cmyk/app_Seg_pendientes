import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const ETAPAS = [
  { key: 'oferta',      label: 'E1 · Oferta',      color: '#6B7280', bg: '#F3F4F6', text: '#374151' },
  { key: 'venta',       label: 'E2 · Venta',        color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  { key: 'cedis',       label: 'E3 · CEDIS',        color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { key: 'transmision', label: 'E4 · Transmisión',  color: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6' },
  { key: 'facturado',   label: 'E5 · Facturado',    color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
]

const ETAPA_IDX: Record<string, number> = { oferta:0, venta:1, cedis:2, transmision:3, facturado:4 }

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
  const [tipoNueva, setTipoNueva] = useState<'manual'|'excel'|''>('')
  const [showBuscarCliente, setShowBuscarCliente] = useState(false)
  const [buscarClienteInput, setBuscarClienteInput] = useState('')
  const [buscarClienteSugs, setBuscarClienteSugs] = useState<any[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_offers')
      .select(`
        id, tipo, etapa, estatus, notas, created_at, fecha_venta, client_id,
        crm_clients(id, solicitante, razon_social, no_cliente),
        crm_offer_items(id, material, descripcion, cantidad_aceptada, precio_aceptado, numero_factura, estatus)
      `)
      .order('created_at', { ascending: false })
    setVentas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = ventas.filter(v => {
    if (filterEtapa === 'activas' && ['facturado','cancelado'].includes(v.etapa)) return false
    if (filterEtapa === 'alerta') {
      const dias = diasDesdeVenta(v.fecha_venta)
      return dias >= 7 && !['facturado','cancelado'].includes(v.etapa)
    }
    if (filterEtapa && !['activas','alerta',''].includes(filterEtapa) && v.etapa !== filterEtapa) return false
    if (search) {
      const q = search.toLowerCase()
      const cli = v.crm_clients
      return cli?.solicitante?.toLowerCase().includes(q) ||
        cli?.razon_social?.toLowerCase().includes(q) ||
        cli?.no_cliente?.toLowerCase().includes(q) ||
        v.notas?.toLowerCase().includes(q)
    }
    return true
  })

  const cuentaPorEtapa = (etapa: string) => ventas.filter(v => v.etapa === etapa).length
  const alertas = ventas.filter(v => diasDesdeVenta(v.fecha_venta) >= 7 && !['facturado','cancelado'].includes(v.etapa)).length

  const buscarClienteSAP = async (q: string) => {
    setBuscarClienteInput(q)
    if (q.length < 2) { setBuscarClienteSugs([]); return }
    const { data } = await supabase.from('crm_clients')
      .select('id, solicitante, razon_social')
      .or(`solicitante.ilike.%${q}%,razon_social.ilike.%${q}%`)
      .limit(8)
    setBuscarClienteSugs(data ?? [])
  }

  const avanzarEtapa = async (venta: any) => {
    const idx = ETAPA_IDX[venta.etapa] ?? 0
    if (idx >= 4) return
    const nextEtapa = ETAPAS[idx + 1].key

    if (nextEtapa === 'venta') {
      nav(`/crm/${venta.client_id}/offer/${venta.id}`)
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
    if (nextEtapa === 'venta') updates.fecha_venta = new Date().toISOString().split('T')[0]
    await supabase.from('crm_offers').update(updates).eq('id', venta.id)
    toast.success(`Avanzado a ${ETAPAS[idx+1].label}`)
    load()
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
          <button onClick={() => nav('/crm/cedis-seguimiento')}
            className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            CEDIS
          </button>
          <button onClick={() => nav('/crm/reports')}
            className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            Reportes globales
          </button>
          <button onClick={() => setShowNueva(true)}
            className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700 shadow-sm">
            + Nueva venta
          </button>
        </div>
      </div>

      {/* Barra de etapas */}
      <div className="flex mb-5 rounded-xl overflow-hidden border border-gray-200">
        {ETAPAS.map((e, i) => (
          <button key={e.key}
            onClick={() => setFilterEtapa(e.key)}
            style={{ background: filterEtapa === e.key ? e.bg : undefined }}
            className={`flex-1 py-2.5 px-2 text-center border-r border-gray-200 last:border-0 transition hover:opacity-80 ${filterEtapa === e.key ? '' : 'bg-white'}`}>
            <p className="text-xs font-semibold" style={{ color: e.text }}>{e.key === 'oferta' ? 'E1' : e.key === 'venta' ? 'E2' : e.key === 'cedis' ? 'E3' : e.key === 'transmision' ? 'E4' : 'E5'}</p>
            <p className="text-xs font-medium text-gray-600 hidden sm:block">{e.label.split(' · ')[1]}</p>
            <p className="text-lg font-bold" style={{ color: e.color }}>{cuentaPorEtapa(e.key)}</p>
          </button>
        ))}
      </div>

      {/* Alerta 7 días */}
      {alertas > 0 && (
        <button onClick={() => setFilterEtapa('alerta')}
          className="w-full mb-4 flex items-center gap-3 bg-orange-50 border border-orange-200 border-l-4 border-l-orange-400 rounded-xl px-4 py-3 text-left hover:bg-orange-100 transition">
          <div className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
          <p className="text-sm text-orange-800 font-medium">
            {alertas} {alertas === 1 ? 'venta lleva' : 'ventas llevan'} más de 7 días sin facturar — <span className="underline">ver</span>
          </p>
        </button>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-x-auto">
          {[
            { key: 'activas', label: 'Activas' },
            { key: '', label: 'Todas' },
            { key: 'alerta', label: '⚠ +7 días' },
            { key: 'facturado', label: 'Facturadas' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterEtapa(f.key)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium transition ${
                filterEtapa === f.key ? 'bg-teal-600 text-white' :
                f.key === 'alerta' ? 'text-orange-600 hover:bg-orange-50' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <input className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar cliente, razón social..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-8 text-center">Cargando...</p>}
        {!loading && visible.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">No hay registros.</p>
          </div>
        )}
        {!loading && visible.map(v => {
          const cli = v.crm_clients
          const etapa = ETAPAS.find(e => e.key === v.etapa) ?? ETAPAS[0]
          const idx = ETAPA_IDX[v.etapa] ?? 0
          const dias = diasDesdeVenta(v.fecha_venta)
          const tieneAlerta = dias >= 7 && !['facturado','cancelado'].includes(v.etapa)
          const items = v.crm_offer_items ?? []
          const total = items.reduce((a: number, i: any) => a + ((i.cantidad_aceptada ?? 0) * (i.precio_aceptado ?? 0)), 0)

          return (
            <div key={v.id}
              style={{ borderLeft: `3px solid ${tieneAlerta ? '#F97316' : etapa.color}` }}
              className={`px-4 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition ${
                tieneAlerta ? 'border border-orange-100' : ''
              }`}>
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  {/* Fila 1 */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-sm font-semibold text-gray-800">
                      {cli?.no_cliente ? `${cli.no_cliente} — ` : ''}{cli?.razon_social ?? cli?.solicitante ?? 'Sin cliente'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: etapa.bg, color: etapa.text }}>
                      {etapa.label}
                    </span>
                    {tieneAlerta && (
                      <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                        ⚠ {dias} días
                      </span>
                    )}
                  </div>

                  {/* Barra de progreso */}
                  <div className="flex gap-1 mb-2 items-center">
                    {ETAPAS.map((e, i) => (
                      <div key={e.key} className="flex-1 h-1 rounded-full"
                        style={{ background: i <= idx ? (tieneAlerta && i === idx ? '#F97316' : e.color) : '#E5E7EB' }} />
                    ))}
                  </div>

                  {/* Fila 2 */}
                  <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                    <span>{v.tipo ?? 'venta'}</span>
                    {v.fecha_venta && <span>Venta: {new Date(v.fecha_venta).toLocaleDateString('es-MX')}</span>}
                    <span>Creado: {new Date(v.created_at).toLocaleDateString('es-MX')}</span>
                    {items.length > 0 && <span>{items.length} material(es)</span>}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {total > 0 && (
                    <span className="text-sm font-semibold text-gray-700">
                      ${total.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                    </span>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={() => nav(`/crm/${v.client_id}/offer/${v.id}`)}
                      className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                      Ver
                    </button>
                    {!['facturado','cancelado'].includes(v.etapa) && (
                      <button onClick={() => avanzarEtapa(v)}
                        className="text-xs bg-teal-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-teal-700 font-medium">
                        Avanzar →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal nueva venta */}
      {showNueva && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-sm">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-800">Nueva venta</h2>
              <button onClick={() => { setShowNueva(false); setTipoNueva('') }}
                className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-500 mb-4">¿Cómo quieres crear la venta?</p>

              <button onClick={() => { setShowNueva(false); nav('/crm/venta-manual') }}
                className="w-full flex items-start gap-3 border border-gray-200 rounded-xl p-4 text-left hover:border-teal-400 hover:bg-teal-50 transition">
                <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0 text-teal-700 font-bold text-sm">1</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Formulario manual</p>
                  <p className="text-xs text-gray-400 mt-0.5">Llenar materiales, cantidades y precios uno a uno</p>
                </div>
              </button>
              <button onClick={() => { setShowNueva(false); nav('/crm/reports') }}
                className="w-full flex items-start gap-3 border border-gray-200 rounded-xl p-4 text-left hover:border-teal-400 hover:bg-teal-50 transition">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 text-purple-700 font-bold text-sm">3</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Desde sugerencias SAP</p>
                  <p className="text-xs text-gray-400 mt-0.5">Ir al cliente y usar botón "Crear venta" en pestaña Sugerencias</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal buscar cliente para SAP */}
      {showBuscarCliente && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-sm">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-800">Buscar cliente</h2>
              <button onClick={() => { setShowBuscarCliente(false); setBuscarClienteInput(''); setBuscarClienteSugs([]) }}
                className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-500">Busca por Solicitante o Razón Social para ver sus sugerencias SAP:</p>
              <div className="relative">
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  placeholder="Nombre o razón social del cliente..."
                  value={buscarClienteInput}
                  onChange={e => buscarClienteSAP(e.target.value)}
                  autoFocus />
                {buscarClienteSugs.length > 0 && (
                  <div className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-full max-h-48 overflow-y-auto mt-0.5">
                    {buscarClienteSugs.map(c => (
                      <button key={c.id} type="button"
                        onClick={() => {
                          setShowBuscarCliente(false)
                          setBuscarClienteInput('')
                          setBuscarClienteSugs([])
                          nav(`/crm/reports?cliente_id=${c.id}&cliente_nombre=${encodeURIComponent(c.razon_social ?? c.solicitante)}`)
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 border-b border-gray-50 last:border-0">
                        <span className="font-semibold text-gray-800">{c.razon_social ?? c.solicitante}</span>
                        {c.razon_social && <span className="text-gray-400 ml-2">{c.solicitante}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => { setShowBuscarCliente(false); nav('/crm/reports') }}
                className="text-xs text-gray-400 hover:text-gray-600 underline">
                Ver todos los reportes sin filtrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
