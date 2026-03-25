import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

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
  { key: 'cant_transito_1030',     label: 'Cant. en Tránsito 1030' },
  { key: 'cant_transito_1031',     label: 'Cant. en Tránsito 1031' },
  { key: 'cant_transito_1032',     label: 'Cant. en Tránsito 1032' },
  { key: 'disp_1031_1030',         label: 'Disponible 1031-1030' },
  { key: 'disp_1031_1032',         label: 'Disponible 1031-1032' },
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
  { key: 'ultima_facturacion_dest',    label: 'Ultima_facturacion_destinatario' },
  { key: 'consumo_promedio_mensual',   label: 'Consumo_promedio_mensual' },
  { key: 'consumo_actual',             label: 'Consumo_actual' },
  { key: 'um',                         label: 'UM' },
  { key: 'tendencia',                  label: 'Tendencia' },
  { key: 'tendencia_cantidad',         label: 'Tendencia de cantidad' },
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
  { key: 'cant_transito_1030',         label: 'Cant. en Tránsito 1030' },
  { key: 'cant_transito_1031',         label: 'Cant. en Tránsito 1031' },
  { key: 'cant_transito_1032',         label: 'Cant. en Tránsito 1032' },
  { key: 'disp_1031_1030',             label: 'Disponible 1031-1030' },
  { key: 'disp_1031_1032',             label: 'Disponible 1031-1032' },
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
  const [tab, setTab] = useState<TabType>('suggestions')
  const [data, setData] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string[]>([])
  const [creatingOffer, setCreatingOffer] = useState(false)

  // Filtros
  const [search, setSearch] = useState('')
  const [fuente, setFuente] = useState('')
  const [centro, setCentro] = useState('')
  const [solicitante, setSolicitante] = useState('')
  const [soloDisponibles, setSoloDisponibles] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setSelected([])
    const table = tab === 'suggestions' ? 'crm_suggestions' : 'crm_consumption'
    const { data: rows } = await supabase.from(table).select('*').order(
      tab === 'suggestions' ? 'fecha' : 'solicitante',
      { ascending: false }
    ).limit(5000)
    setData(rows ?? [])
    setFiltered(rows ?? [])
    setLoading(false)
  }, [tab])

  useEffect(() => { load() }, [load])

  // Aplicar filtros
  useEffect(() => {
    let result = data
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(r =>
        Object.values(r).some(v => String(v ?? '').toLowerCase().includes(s))
      )
    }
    if (fuente) result = result.filter(r => r.fuente === fuente)
    if (centro) result = result.filter(r =>
      (tab === 'suggestions' ? r.centro_pedido : r.centro) === centro
    )
    if (solicitante) result = result.filter(r => r.solicitante === solicitante)
    if (soloDisponibles) result = result.filter(r => (r.disponible ?? 0) > 0)
    setFiltered(result)
  }, [search, fuente, centro, solicitante, soloDisponibles, data])

  const fuentes      = [...new Set(data.map(r => r.fuente).filter(Boolean))].sort()
  const centros      = [...new Set(data.map(r => tab === 'suggestions' ? r.centro_pedido : r.centro).filter(Boolean))].sort()
  const solicitantes = [...new Set(data.map(r => r.solicitante).filter(Boolean))].sort()

  const toggleRow = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleAll = () =>
    setSelected(prev => prev.length === filtered.length ? [] : filtered.map(r => r.id))

  const createOffersFromSelection = async () => {
    if (selected.length === 0) return
    setCreatingOffer(true)

    // Agrupar seleccionados por client_id
    const selectedRows = filtered.filter(r => selected.includes(r.id))
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

    // Si hay filas sin client_id, intentar buscar el cliente por solicitante
    if (noClient.length > 0) {
      const solicitantesSinCliente = [...new Set(noClient.map(r => r.solicitante).filter(Boolean))]
      const { data: clients } = await supabase.from('crm_clients')
        .select('id, solicitante').in('solicitante', solicitantesSinCliente)
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
      toast.error('Ninguno de los materiales está vinculado a un cliente. Importa primero la base de clientes.')
      setCreatingOffer(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    let offersCreated = 0

    for (const clientId of clientIds) {
      const rows = byClient[clientId]
      // Crear oferta
      const { data: offer, error } = await supabase.from('crm_offers').insert({
        client_id:  clientId,
        tipo:       tab === 'suggestions' ? 'sugerencia' : 'consumo',
        estatus:    'borrador',
        notas:      `Generada desde reporte global · ${new Date().toLocaleDateString('es-MX')}`,
        created_by: user?.id,
      }).select().single()

      if (error || !offer) continue

      // Crear items
      const items = rows.map(r => ({
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

      await supabase.from('crm_offer_items').insert(items)
      offersCreated++
    }

    toast.success(`${offersCreated} oferta(s) generada(s) — una por cliente`)
    setSelected([])

    // Si solo hay un cliente, ir directo a su ficha
    if (clientIds.length === 1) {
      nav(`/crm/${clientIds[0]}`)
    } else {
      nav('/crm/offers')
    }
    setCreatingOffer(false)
  }

  const cols = tab === 'suggestions' ? SUGG_COLS : CONS_COLS

  return (
    <div className="max-w-full mx-auto px-4">
      <div className="flex justify-between items-center mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => nav('/crm')} className="text-sm text-gray-400 hover:text-gray-600">← CRM</button>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Reportes globales</h1>
          </div>
          <p className="text-sm text-gray-400">
            {filtered.length} de {data.length} registros
            {selected.length > 0 && ` · ${selected.length} seleccionados`}
          </p>
        </div>
        {selected.length > 0 && (
          <button onClick={createOffersFromSelection} disabled={creatingOffer}
            className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
            {creatingOffer ? 'Generando...' : `Generar oferta(s) con ${selected.length} material(es)`}
          </button>
        )}
      </div>

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
          placeholder="Buscar en cualquier columna..."
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
        {(search || fuente || centro || solicitante || soloDisponibles) && (
          <button onClick={() => { setSearch(''); setFuente(''); setCentro(''); setSolicitante(''); setSoloDisponibles(false) }}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-2">
            Limpiar ×
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-gray-400 p-6 text-center">No hay registros con estos filtros.</p>
        )}
        {!loading && filtered.length > 0 && (
          <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
            <table className="text-xs border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 border-b border-gray-200 w-8 sticky left-0 bg-gray-50 z-20">
                    <input type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
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
                {filtered.map(row => (
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
        )}
        {selected.length > 0 && (
          <div className="px-5 py-3 bg-teal-50 border-t border-teal-200 flex justify-between items-center">
            <p className="text-sm text-teal-700 font-medium">
              {selected.length} material(es) seleccionado(s)
              {' · '}Los materiales de distintos clientes generarán una oferta por cliente.
            </p>
            <button onClick={createOffersFromSelection} disabled={creatingOffer}
              className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {creatingOffer ? 'Generando...' : 'Generar oferta(s)'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
