import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

const PAGE_SIZE = 500

const SUGG_COLS = [
  { key: 'gpo_cliente',            label: 'Gpo. Cte.' },
  { key: 'fecha',                  label: 'Fecha' },
  { key: 'pedido',                 label: 'Pedido' },
  { key: 'gpo_vendedor',           label: 'Gpo.Vdor.' },
  { key: 'solicitante',            label: 'Solicitante' },
  { key: 'destinatario',           label: 'Destinatario' },
  { key: 'razon_social',           label: 'Razón Social' },
  { key: 'centro_pedido',          label: 'Centro pedido' },
  { key: 'almacen',                label: 'Almacén' },
  { key: 'material_solicitado',    label: 'Material solicitado' },
  { key: 'material_base',          label: 'Material base' },
  { key: 'descripcion_solicitada', label: 'Descripción solicitada' },
  { key: 'cantidad_pedido',        label: 'Cantidad pedido' },
  { key: 'cantidad_pendiente',     label: 'Cantidad pendiente' },
  { key: 'cantidad_ofertar',       label: 'Cantidad a Ofertar' },
  { key: 'precio',                 label: 'Precio' },
  { key: 'consumo_promedio',       label: 'Consumo promedio' },
  { key: 'fuente',                 label: 'Fuente' },
  { key: 'material_sugerido',      label: 'Material sugerido' },
  { key: 'descripcion_sugerida',   label: 'Descripción sugerida' },
  { key: 'centro_sugerido',        label: 'Centro sugerido' },
  { key: 'almacen_sugerido',       label: 'Almacén sugerido' },
  { key: 'disponible',             label: 'Disponible' },
  { key: 'lote',                   label: 'Lote' },
  { key: 'fecha_caducidad',        label: 'Fecha de Caducidad' },
  { key: 'centro_inv',             label: 'Centro (Inv)' },
  { key: 'inv_1030',               label: 'Inv 1030' },
  { key: 'inv_1031',               label: 'Inv 1031' },
  { key: 'inv_1032',               label: 'Inv 1032' },
  { key: 'inv_1060',               label: 'Inv 1060' },
  { key: 'meses_inventario',       label: 'Meses_Inventario' },
  { key: 'promedio_consumo_12m',   label: 'Promedio_Consumo_12M' },
  { key: 'cant_transito',          label: 'Cant. en Tránsito' },
  { key: 'cant_transito_1030',     label: 'Cant. Tránsito 1030' },
  { key: 'cant_transito_1031',     label: 'Cant. Tránsito 1031' },
  { key: 'cant_transito_1032',     label: 'Cant. Tránsito 1032' },
  { key: 'disp_1031_1030',         label: 'Disp 1031-1030' },
  { key: 'disp_1031_1032',         label: 'Disp 1031-1032' },
  { key: 'inv_1001',               label: 'Inv 1001' },
  { key: 'inv_1003',               label: 'Inv 1003' },
  { key: 'inv_1004',               label: 'Inv 1004' },
  { key: 'inv_1017',               label: 'Inv 1017' },
  { key: 'inv_1018',               label: 'Inv 1018' },
  { key: 'inv_1022',               label: 'Inv 1022' },
  { key: 'inv_1036',               label: 'Inv 1036' },
  { key: 'bloqueado',              label: 'Bloqueado' },
]

const CONS_COLS = [
  { key: 'centro',                     label: 'Centro' },
  { key: 'gpo_cliente',                label: 'Grp. Cliente' },
  { key: 'gpo_vendedor',               label: 'Gpo. Vdor.' },
  { key: 'solicitante',                label: 'Solicitante' },
  { key: 'destinatario',               label: 'Destinatario' },
  { key: 'razon_social',               label: 'Razón Social' },
  { key: 'material',                   label: 'Material' },
  { key: 'texto_material',             label: 'Texto Material' },
  { key: 'ultima_compra_cliente',      label: 'Ultima_compra_cliente' },
  { key: 'ultima_facturacion_dest',    label: 'Ultima_facturacion_dest' },
  { key: 'consumo_promedio_mensual',   label: 'Consumo_promedio_mensual' },
  { key: 'consumo_actual',             label: 'Consumo_actual' },
  { key: 'um',                         label: 'UM' },
  { key: 'tendencia',                  label: 'Tendencia' },
  { key: 'tendencia_cantidad',         label: 'Tendencia cantidad' },
  { key: 'ultimo_mes_facturacion',     label: 'Ultimo mes facturacion' },
  { key: 'cantidad_ultima',            label: 'Cantidad ultima' },
  { key: 'importe_ultima',             label: 'Importe ultima' },
  { key: 'precio_unitario_ultima',     label: 'Precio_unitario_ultima' },
  { key: 'penultima_fecha',            label: 'Penultima_fecha' },
  { key: 'cantidad_penultima',         label: 'Cantidad_penultima' },
  { key: 'importe_penultima',          label: 'Importe_penultima' },
  { key: 'precio_unitario_penultima',  label: 'Precio_unitario_penultima' },
  { key: 'precio_min',                 label: 'precio_min' },
  { key: 'precio_max',                 label: 'precio_max' },
  { key: 'precio_prom',                label: 'precio_prom' },
  { key: 'fuente',                     label: 'Fuente' },
  { key: 'material_sugerido',          label: 'Material sugerido' },
  { key: 'descripcion_sugerida',       label: 'Descripción sugerida' },
  { key: 'centro_sugerido',            label: 'Centro sugerido' },
  { key: 'almacen_sugerido',           label: 'Almacén sugerido' },
  { key: 'disponible',                 label: 'Disponible' },
  { key: 'lote',                       label: 'Lote' },
  { key: 'fecha_caducidad',            label: 'Fecha de Caducidad' },
  { key: 'centro_inv',                 label: 'Centro (Inv)' },
  { key: 'inv_1030',                   label: 'Inv 1030' },
  { key: 'inv_1031',                   label: 'Inv 1031' },
  { key: 'inv_1032',                   label: 'Inv 1032' },
  { key: 'inv_1060',                   label: 'Inv 1060' },
  { key: 'meses_inventario',           label: 'Meses_Inventario' },
  { key: 'promedio_consumo_12m',       label: 'Promedio_Consumo_12M' },
  { key: 'cant_transito',              label: 'Cant. en Tránsito' },
  { key: 'cant_transito_1030',         label: 'Cant. Tránsito 1030' },
  { key: 'cant_transito_1031',         label: 'Cant. Tránsito 1031' },
  { key: 'cant_transito_1032',         label: 'Cant. Tránsito 1032' },
  { key: 'disp_1031_1030',             label: 'Disp 1031-1030' },
  { key: 'disp_1031_1032',             label: 'Disp 1031-1032' },
  { key: 'inv_1001',                   label: 'Inv 1001' },
  { key: 'inv_1003',                   label: 'Inv 1003' },
  { key: 'inv_1004',                   label: 'Inv 1004' },
  { key: 'inv_1017',                   label: 'Inv 1017' },
  { key: 'inv_1018',                   label: 'Inv 1018' },
  { key: 'inv_1022',                   label: 'Inv 1022' },
  { key: 'inv_1036',                   label: 'Inv 1036' },
]

type TabType = 'suggestions' | 'consumption'

export default function CrmReportsPage() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const urlClienteId = searchParams.get('cliente_id')
  const urlClienteNombre = searchParams.get('cliente_nombre')
  const [tab, setTab] = useState<TabType>('suggestions')
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [creatingOffer, setCreatingOffer] = useState(false)

  // Opciones para selectores (cargadas una sola vez por tab)
  const [fuentes, setFuentes] = useState<string[]>([])
  const [centros, setCentros] = useState<string[]>([])
  const [solicitantes, setSolicitantes] = useState<string[]>([])

  // Filtros — se aplican en servidor
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('cliente_nombre') ? decodeURIComponent(params.get('cliente_nombre') ?? '') : ''
  })
  const [fuente, setFuente] = useState('')
  const [centro, setCentro] = useState('')
  const [solicitante, setSolicitante] = useState('')
  const [soloDisponibles, setSoloDisponibles] = useState(false)

  // Debounce del search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 400)
  }, [search])

  // Cargar opciones de filtro (distinct values) — solo al cambiar tab
  useEffect(() => {
    const table = tab === 'suggestions' ? 'crm_suggestions' : 'crm_consumption'
    const centroCol = tab === 'suggestions' ? 'centro_pedido' : 'centro'
    Promise.all([
      supabase.from(table).select('fuente').not('fuente','is',null).limit(500),
      supabase.from(table).select(centroCol).not(centroCol,'is',null).limit(200),
      supabase.from(table).select('solicitante').not('solicitante','is',null).limit(500),
    ]).then(([f, c, s]) => {
      setFuentes([...new Set((f.data ?? []).map((r: any) => r.fuente))].sort())
      setCentros([...new Set((c.data ?? []).map((r: any) => r[centroCol]))].sort())
      setSolicitantes([...new Set((s.data ?? []).map((r: any) => r.solicitante))].sort())
    })
  }, [tab])

  // Query con filtros en servidor
  const buildQuery = useCallback((rangeStart: number) => {
    const table = tab === 'suggestions' ? 'crm_suggestions' : 'crm_consumption'
    const centroCol = tab === 'suggestions' ? 'centro_pedido' : 'centro'
    const matCol = tab === 'suggestions' ? 'material_solicitado' : 'material'
    const descCol = tab === 'suggestions' ? 'descripcion_solicitada' : 'texto_material'

    let q = supabase.from(table).select('*', { count: 'exact' })
      .order(tab === 'suggestions' ? 'fecha' : 'solicitante', { ascending: false })
      .range(rangeStart, rangeStart + PAGE_SIZE - 1)

    if (fuente)     q = q.eq('fuente', fuente)
    if (centro)     q = q.eq(centroCol, centro)
    if (solicitante) q = q.eq('solicitante', solicitante)
    if (soloDisponibles) q = q.gt('disponible', 0)
    if (debouncedSearch) {
      q = q.or(
        `${matCol}.ilike.%${debouncedSearch}%,` +
        `${descCol}.ilike.%${debouncedSearch}%,` +
        `solicitante.ilike.%${debouncedSearch}%,` +
        (tab === 'suggestions' ? `pedido.ilike.%${debouncedSearch}%,` : '') +
        `destinatario.ilike.%${debouncedSearch}%`
      )
    }
    return q
  }, [tab, fuente, centro, solicitante, soloDisponibles, debouncedSearch])

  // Carga inicial (reset)
  useEffect(() => {
    setLoading(true)
    setRows([])
    setPage(0)
    setSelected([])
    buildQuery(0).then(({ data, count, error }) => {
      if (error) console.error(error)
      setRows(data ?? [])
      setTotal(count ?? 0)
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
      setLoading(false)
    })
  }, [tab, fuente, centro, solicitante, soloDisponibles, debouncedSearch])

  const loadMore = async () => {
    setLoadingMore(true)
    const nextPage = page + 1
    const { data } = await buildQuery(nextPage * PAGE_SIZE)
    setRows(prev => [...prev, ...(data ?? [])])
    setPage(nextPage)
    setHasMore((data?.length ?? 0) === PAGE_SIZE)
    setLoadingMore(false)
  }

  const toggleRow = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleAll = () =>
    setSelected(prev => prev.length === rows.length ? [] : rows.map(r => r.id))

  const clearFilters = () => {
    setSearch(''); setFuente(''); setCentro(''); setSolicitante(''); setSoloDisponibles(false)
  }

  const hasFilters = search || fuente || centro || solicitante || soloDisponibles
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [showColFilters, setShowColFilters] = useState(false)

  const exportExcel = () => {
    const cols = tab === 'suggestions' ? SUGG_COLS : CONS_COLS
    const filteredRows = rows.filter(row => {
      return Object.entries(colFilters).every(([key, val]) => {
        if (!val) return true
        return String(row[key] ?? '').toLowerCase().includes(val.toLowerCase())
      })
    })
    const headers = cols.map(c => c.label)
    const data = filteredRows.map(row => cols.map(c => row[c.key] ?? ''))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    // Autowidth
    ws['!cols'] = headers.map((_, i) => ({
      wch: Math.max(headers[i].length, ...data.slice(0,100).map(r => String(r[i]).length))
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tab === 'suggestions' ? 'Sugerencias' : 'Consumo')
    XLSX.writeFile(wb, `reporte_${tab}_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast.success(`${filteredRows.length} registros exportados`)
  }

  const visibleRows = rows.filter(row => {
    return Object.entries(colFilters).every(([key, val]) => {
      if (!val) return true
      return String(row[key] ?? '').toLowerCase().includes(val.toLowerCase())
    })
  })

  const createOffersFromSelection = async () => {
    if (selected.length === 0) return
    setCreatingOffer(true)
    const selectedRows = rows.filter(r => selected.includes(r.id))
    const byClient: Record<string, any[]> = {}
    const noClient: any[] = []

    for (const row of selectedRows) {
      if (row.client_id) {
        if (!byClient[row.client_id]) byClient[row.client_id] = []
        byClient[row.client_id].push(row)
      } else {
        noClient.push(row)
      }
    }

    if (noClient.length > 0) {
      const solicitantesSin = [...new Set(noClient.map(r => r.solicitante).filter(Boolean))]
      const { data: clients } = await supabase.from('crm_clients')
        .select('id, solicitante').in('solicitante', solicitantesSin)
      const map: Record<string, string> = {}
      clients?.forEach(c => { map[c.solicitante] = c.id })
      for (const row of noClient) {
        const cid = map[row.solicitante]
        if (cid) {
          if (!byClient[cid]) byClient[cid] = []
          byClient[cid].push(row)
        }
      }
    }

    const clientIds = Object.keys(byClient)
    if (clientIds.length === 0) {
      toast.error('Ningún material está vinculado a un cliente. Importa la base de clientes primero.')
      setCreatingOffer(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    let offersCreated = 0

    for (const clientId of clientIds) {
      const clientRows = byClient[clientId]
      const { data: offer, error } = await supabase.from('crm_offers').insert({
        client_id: clientId,
        tipo: tab === 'suggestions' ? 'sugerencia' : 'consumo',
        estatus: 'borrador',
        notas: `Generada desde reporte global · ${new Date().toLocaleDateString('es-MX')}`,
        created_by: user?.id,
      }).select().single()

      if (error || !offer) continue

      await supabase.from('crm_offer_items').insert(
        clientRows.map(r => ({
          offer_id:          offer.id,
          source_type:       tab === 'suggestions' ? 'sugerencia' : 'consumo',
          source_id:         r.id,
          material:          tab === 'suggestions' ? (r.material_sugerido ?? r.material_solicitado) : r.material,
          descripcion:       tab === 'suggestions' ? (r.descripcion_sugerida ?? r.descripcion_solicitada) : r.texto_material,
          lotes:             r.lote ? [{ lote: r.lote, fecha_caducidad: r.fecha_caducidad ?? '' }] : [],
          cantidad_ofertada: tab === 'suggestions' ? (r.cantidad_pendiente ?? r.cantidad_ofertar) : null,
          precio_oferta:     r.precio ?? r.precio_unitario_ultima ?? null,
          um:                r.um ?? null,
          numero_pedido:     tab === 'suggestions' ? (r.pedido ?? null) : null,
          pedido_existente:  tab === 'suggestions',
          pedido_pendiente:  tab === 'consumption',
          centro_origen:     r.centro_sugerido ?? null,
          almacen_origen:    r.almacen_sugerido ?? null,
          centro_destino:    tab === 'suggestions' ? (r.centro_pedido ?? null) : (r.centro ?? null),
          almacen_destino:   r.almacen ?? null,
          requiere_traslado: false,
          aceptado:          false,
          estatus:           'ofertado',
        }))
      )
      offersCreated++
    }

    toast.success(`${offersCreated} oferta(s) generada(s)`)
    setSelected([])
    if (clientIds.length === 1) nav(`/crm/${clientIds[0]}`)
    else nav('/crm/offers')
    setCreatingOffer(false)
  }

  const cols = tab === 'suggestions' ? SUGG_COLS : CONS_COLS

  return (
    <div className="max-w-full mx-auto px-4">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => nav('/crm')} className="text-sm text-gray-400 hover:text-gray-600">← CRM</button>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Reportes globales</h1>
          </div>
          <p className="text-sm text-gray-400">
            {loading ? 'Cargando...' : `${visibleRows.length} de ${rows.length} (total ${total}) registros`}
            {selected.length > 0 && ` · ${selected.length} seleccionados`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowColFilters(x => !x)}
            className={`border px-3 py-2 rounded-lg text-sm font-medium transition ${
              showColFilters || Object.values(colFilters).some(Boolean)
                ? 'bg-teal-50 border-teal-300 text-teal-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            Filtrar columnas {Object.values(colFilters).filter(Boolean).length > 0 && `(${Object.values(colFilters).filter(Boolean).length})`}
          </button>
          <button onClick={exportExcel}
            className="border border-green-300 text-green-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-50">
            Descargar Excel
          </button>
          {selected.length > 0 && (
            <button onClick={createOffersFromSelection} disabled={creatingOffer}
              className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {creatingOffer ? 'Generando...' : `Generar oferta(s) (${selected.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Filtros por columna */}
      {showColFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-gray-700">Filtrar por columna</p>
            <button onClick={() => setColFilters({})}
              className="text-xs text-red-500 hover:text-red-700">Limpiar filtros</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(tab === 'suggestions' ? SUGG_COLS : CONS_COLS).slice(0, 12).map(col => (
              <div key={col.key}>
                <label className="text-xs text-gray-400 block mb-0.5">{col.label}</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                  placeholder={`Filtrar...`}
                  value={colFilters[col.key] ?? ''}
                  onChange={e => setColFilters(prev => ({ ...prev, [col.key]: e.target.value }))} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden w-fit">
        <button onClick={() => setTab('suggestions')}
          className={`px-5 py-2.5 text-sm font-medium transition ${tab === 'suggestions' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
          Sugerencias SAP
        </button>
        <button onClick={() => setTab('consumption')}
          className={`px-5 py-2.5 text-sm font-medium transition ${tab === 'consumption' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
          Reporte Consumo
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3 flex flex-wrap gap-2 items-center">
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 flex-1 min-w-48"
          placeholder="Buscar en material, descripción, solicitante, destinatario..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
          value={solicitante} onChange={e => setSolicitante(e.target.value)}>
          <option value="">Todos los solicitantes</option>
          {solicitantes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {fuentes.length > 0 && (
          <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
            value={fuente} onChange={e => setFuente(e.target.value)}>
            <option value="">Todas las fuentes</option>
            {fuentes.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        {centros.length > 0 && (
          <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
            value={centro} onChange={e => setCentro(e.target.value)}>
            <option value="">Todos los centros</option>
            {centros.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={soloDisponibles}
            onChange={e => setSoloDisponibles(e.target.checked)} />
          Solo disponible &gt; 0
        </label>
        {hasFilters && (
          <button onClick={clearFilters}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2">
            Limpiar ×
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400">Cargando registros...</p>
          </div>
        )}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-gray-400 p-6 text-center">
            No hay registros con estos filtros.
          </p>
        )}
        {!loading && rows.length > 0 && (
          <>
            <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
              <table className="text-xs border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2.5 border-b border-gray-200 w-8 sticky left-0 bg-gray-50 z-20">
                      <input type="checkbox"
                        checked={selected.length > 0 && selected.length === rows.length}
                        onChange={toggleAll} />
                    </th>
                    {cols.map(c => (
                      <th key={c.key}
                        className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}
                      onClick={() => toggleRow(row.id)}
                      className={`border-b border-gray-100 cursor-pointer transition ${
                        selected.includes(row.id) ? 'bg-teal-50' : 'hover:bg-gray-50'
                      }`}>
                      <td className="px-3 py-2 text-center sticky left-0 bg-inherit" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(row.id)}
                          onChange={() => toggleRow(row.id)} />
                      </td>
                      {cols.map(c => (
                        <td key={c.key} className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {row[c.key] !== null && row[c.key] !== undefined && row[c.key] !== ''
                            ? String(row[c.key])
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer con cargar más */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
              <p className="text-xs text-gray-400">
                Mostrando {rows.length} de {total} registros
                {hasFilters && ' (filtrados)'}
              </p>
              <div className="flex items-center gap-3">
                {selected.length > 0 && (
                  <button onClick={createOffersFromSelection} disabled={creatingOffer}
                    className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50">
                    {creatingOffer ? 'Generando...' : `Generar oferta(s) con ${selected.length}`}
                  </button>
                )}
                {hasMore && (
                  <button onClick={loadMore} disabled={loadingMore}
                    className="border border-gray-200 text-gray-600 px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
                    {loadingMore ? 'Cargando...' : `Cargar ${PAGE_SIZE} más`}
                  </button>
                )}
                {!hasMore && rows.length > 0 && (
                  <span className="text-xs text-gray-300">Todos los registros cargados</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
