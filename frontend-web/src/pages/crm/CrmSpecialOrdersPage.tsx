import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { useNavigate, Link } from 'react-router-dom'

const COLUMNS = [
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
]

const ESTATUS_COLOR: Record<string, string> = {
  pendiente:          'bg-yellow-100 text-yellow-700',
  requiere_material:  'bg-orange-100 text-orange-700',
  en_surtido:         'bg-blue-100 text-blue-700',
  facturado:          'bg-purple-100 text-purple-700',
  entregado:          'bg-green-100 text-green-700',
  cancelado:          'bg-gray-100 text-gray-500',
}

const ESTATUS_OPTIONS = [
  { value: 'pendiente',         label: 'Pendiente' },
  { value: 'requiere_material', label: 'Requiere material' },
  { value: 'en_surtido',       label: 'En surtido' },
  { value: 'facturado',        label: 'Facturado' },
  { value: 'entregado',        label: 'Entregado' },
  { value: 'cancelado',        label: 'Cancelado' },
]

// Parsear fecha desde Excel (puede venir como número serial o string)
function parseExcelDate(val: string): string {
  if (!val?.trim()) return ''
  const v = val.trim()

  // Formato DD/MM/YYYY (el más común en México)
  const ddmmyyyy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  // Formato DD-MM-YYYY
  const ddmmyyyyDash = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (ddmmyyyyDash) {
    const [, d, m, y] = ddmmyyyyDash
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  // Número serial de Excel
  const num = parseFloat(v)
  if (!isNaN(num) && num > 1000) {
    const date = new Date((num - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }

  // Ya viene como YYYY-MM-DD u otro formato estándar
  const d = new Date(v)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]

  return ''
}

function parseNumber(val: string): number | null {
  if (!val?.trim()) return null
  const n = parseFloat(val.replace(/,/g, '.'))
  return isNaN(n) ? null : n
}

export default function CrmSpecialOrdersPage() {
  const nav = useNavigate()
  const pasteRef = useRef<HTMLTextAreaElement>(null)
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'paste'>('list')
  const [pastedRows, setPastedRows] = useState<Record<string, string>[]>([])
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterEstatus, setFilterEstatus] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [newEstatus, setNewEstatus] = useState('')
  const [newComentario, setNewComentario] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const load = async () => {
    setLoading(true)
    let q = supabase
      .from('crm_special_orders')
      .select('*')
      .order('fecha', { ascending: false })
      .order('pedido')
    if (filterEstatus) q = q.eq('estatus', filterEstatus)
    if (search) q = q.or(
      `pedido.ilike.%${search}%,solicitante.ilike.%${search}%,destinatario.ilike.%${search}%,material_solicitado.ilike.%${search}%`
    )
    const { data } = await q
    setOrders(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filterEstatus, search])

  const loadDetail = async (id: string) => {
    const [o, h] = await Promise.all([
      supabase.from('crm_special_orders').select('*').eq('id', id).single(),
      supabase.from('crm_special_order_history').select('*, users:created_by(full_name,email)')
        .eq('order_id', id).order('created_at', { ascending: false }),
    ])
    setDetail(o.data)
    setHistory(h.data ?? [])
    setNewEstatus(o.data?.estatus ?? '')
  }

  const openDetail = (id: string) => {
    setDetailId(id)
    loadDetail(id)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text')
    parsePastedText(text)
    e.preventDefault()
  }

  const parsePastedText = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) return

    // Detectar si la primera línea es encabezado (contiene palabras clave)
    const firstLine = lines[0].toLowerCase()
    const isHeader = firstLine.includes('pedido') || firstLine.includes('material') ||
      firstLine.includes('solicitante') || firstLine.includes('fecha') ||
      firstLine.includes('gpo')
    const dataLines = isHeader ? lines.slice(1) : lines

    const rows = dataLines.map(line => {
      const cells = line.split('\t')
      const row: Record<string, string> = {}
      COLUMNS.forEach((col, i) => {
        row[col.key] = cells[i]?.trim() ?? ''
      })
      return row
    }).filter(r => COLUMNS.some(c => r[c.key]?.trim()))

    setPastedRows(rows)
    toast.success(`${rows.length} línea(s) detectadas`)
  }

  const handleSavePasted = async () => {
    if (pastedRows.length === 0) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const inserts = pastedRows.map(r => ({
      gpo_cliente:            r.gpo_cliente || null,
      fecha:                  parseExcelDate(r.fecha) || null,
      pedido:                 r.pedido || null,
      gpo_vendedor:           r.gpo_vendedor || null,
      solicitante:            r.solicitante || null,
      destinatario:           r.destinatario || null,
      razon_social:           r.razon_social || null,
      centro_pedido:          r.centro_pedido || null,
      almacen:                r.almacen || null,
      material_solicitado:    r.material_solicitado || null,
      material_base:          r.material_base || null,
      descripcion_solicitada: r.descripcion_solicitada || null,
      cantidad_pedido:        parseNumber(r.cantidad_pedido),
      cantidad_pendiente:     parseNumber(r.cantidad_pendiente),
      cantidad_ofertar:       parseNumber(r.cantidad_ofertar),
      precio:                 parseNumber(r.precio),
      consumo_promedio:       parseNumber(r.consumo_promedio),
      fuente:                 r.fuente || null,
      material_sugerido:      r.material_sugerido || null,
      descripcion_sugerida:   r.descripcion_sugerida || null,
      centro_sugerido:        r.centro_sugerido || null,
      almacen_sugerido:       r.almacen_sugerido || null,
      disponible:             parseNumber(r.disponible),
      lote:                   r.lote || null,
      fecha_caducidad:        parseExcelDate(r.fecha_caducidad) || null,
      estatus:                'pendiente',
      created_by:             user?.id,
      client_id:              null as string | null,
    }))

    // Buscar y vincular cliente por Solicitante automáticamente
    const solicitantes = [...new Set(inserts.map(r => r.solicitante).filter(Boolean))]
    if (solicitantes.length > 0) {
      const { data: clientsFound } = await supabase
        .from('crm_clients')
        .select('id, solicitante')
        .in('solicitante', solicitantes as string[])

      if (clientsFound && clientsFound.length > 0) {
        const clientMap: Record<string, string> = {}
        clientsFound.forEach(c => { clientMap[c.solicitante] = c.id })
        inserts.forEach(r => {
          if (r.solicitante && clientMap[r.solicitante]) {
            r.client_id = clientMap[r.solicitante]
          }
        })
        const linked = inserts.filter(r => r.client_id).length
        if (linked > 0) toast.success(`${linked} línea(s) vinculadas a cliente CRM`)
      }
    }

    const { error } = await supabase.from('crm_special_orders').insert(inserts)
    if (error) { toast.error(error.message); setSaving(false); return }

    toast.success(`${inserts.length} línea(s) cargadas correctamente`)
    setPastedRows([])
    setView('list')
    load()
    setSaving(false)
  }

  const updateStatus = async () => {
    if (!detailId || !newEstatus) return
    setUpdatingStatus(true)
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('crm_special_order_history').insert({
      order_id:        detailId,
      estatus_anterior: detail?.estatus,
      estatus_nuevo:   newEstatus,
      comentario:      newComentario || null,
      created_by:      user?.id,
    })

    await supabase.from('crm_special_orders').update({
      estatus:     newEstatus,
      comentarios: newComentario || detail?.comentarios,
    }).eq('id', detailId)

    toast.success('Estatus actualizado')
    setNewComentario('')
    loadDetail(detailId)
    load()
    setUpdatingStatus(false)
  }

  const deleteOrder = async (id: string) => {
    if (!window.confirm('¿Eliminar este registro?')) return
    await supabase.from('crm_special_orders').delete().eq('id', id)
    toast.success('Registro eliminado')
    if (detailId === id) setDetailId(null)
    load()
  }

  return (
    <div className="max-w-full mx-auto px-4">
      <div className="flex justify-between items-center mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => nav('/crm')} className="text-sm text-gray-400 hover:text-gray-600">← CRM</button>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Pedidos Especiales</h1>
          </div>
          <p className="text-sm text-gray-400">{orders.length} registros</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setView('paste'); setPastedRows([]) }}
            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
            + Cargar desde Excel
          </button>
        </div>
      </div>

      {/* Vista: pegar desde Excel */}
      {view === 'paste' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-2">Pegar desde Excel</h2>
          <p className="text-sm text-gray-400 mb-4">
            Copia las filas directamente desde Excel (sin encabezados o con encabezados, se detectan automáticamente)
            y pégalas aquí con <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Ctrl+V</kbd>.
            El orden de columnas debe ser el mismo que en tu reporte.
          </p>

          {pastedRows.length === 0 ? (
            <textarea
              ref={pasteRef}
              className="w-full h-32 border-2 border-dashed border-gray-200 rounded-xl p-4 text-sm text-gray-400 outline-none focus:border-teal-400 resize-none"
              placeholder="Haz clic aquí y pega con Ctrl+V..."
              onPaste={handlePaste}
              onChange={() => {}}
              value="" />
          ) : (
            <>
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-teal-700">
                  {pastedRows.length} línea(s) listas para importar
                </p>
                <button onClick={() => setPastedRows([])}
                  className="text-xs text-gray-400 hover:text-red-500">Limpiar</button>
              </div>

              {/* Preview de las filas pegadas */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4" style={{ maxHeight: '340px' }}>
                <table className="text-xs border-collapse w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">#</th>
                      {COLUMNS.map(c => (
                        <th key={c.key} className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pastedRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                        {COLUMNS.map(c => (
                          <td key={c.key} className="px-2 py-1.5 text-gray-700 whitespace-nowrap max-w-xs truncate">
                            {row[c.key] || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <button onClick={handleSavePasted} disabled={saving}
                  className="bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : `Importar ${pastedRows.length} línea(s)`}
                </button>
                <button onClick={() => { setPastedRows([]); setView('list') }}
                  className="bg-gray-100 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200">
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className="border border-gray-200 rounded-lg px-4 py-2 text-sm outline-none focus:border-teal-400 flex-1 min-w-48"
          placeholder="Buscar por pedido, solicitante, destinatario, material..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
          value={filterEstatus} onChange={e => setFilterEstatus(e.target.value)}>
          <option value="">Todos los estatus</option>
          {ESTATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Tabla principal + panel de detalle */}
      <div className={`flex gap-4 ${detailId ? 'items-start' : ''}`}>

        {/* Tabla */}
        <div className={`${detailId ? 'flex-1 min-w-0' : 'w-full'}`}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
            {!loading && orders.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-gray-400 text-sm mb-3">No hay pedidos especiales.</p>
                <button onClick={() => setView('paste')}
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                  Cargar desde Excel
                </button>
              </div>
            )}
            {orders.length > 0 && (
              <div className="overflow-x-auto" style={{ maxHeight: '65vh' }}>
                <table className="text-xs border-collapse w-full">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Estatus</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Pedido</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Fecha</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Solicitante</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Destinatario</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Material</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Descripción</th>
                      <th className="px-3 py-2.5 text-right text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Cant. Pedido</th>
                      <th className="px-3 py-2.5 text-right text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Cant. Ofertar</th>
                      <th className="px-3 py-2.5 text-right text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Precio</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Lote</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Caducidad</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Mat. Sugerido</th>
                      <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">Centro</th>
                      <th className="w-8 border-b border-gray-200"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}
                        onClick={() => openDetail(o.id)}
                        className={`border-b border-gray-100 cursor-pointer transition ${
                          detailId === o.id ? 'bg-teal-50' : 'hover:bg-gray-50'
                        }`}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTATUS_COLOR[o.estatus]}`}>
                            {ESTATUS_OPTIONS.find(e => e.value === o.estatus)?.label ?? o.estatus}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{o.pedido}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{o.fecha}</td>
                        <td className="px-3 py-2 whitespace-nowrap max-w-32 truncate">
                          {o.client_id ? (
                            <Link to={`/crm/${o.client_id}`} onClick={e => e.stopPropagation()}
                              className="text-teal-600 hover:text-teal-700 font-medium text-xs">
                              {o.solicitante}
                            </Link>
                          ) : (
                            <span className="text-gray-700">{o.solicitante}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-32 truncate">{o.destinatario}</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-medium">{o.material_solicitado}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-48 truncate">{o.descripcion_solicitada}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{o.cantidad_pedido ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{o.cantidad_ofertar ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {o.precio != null ? `$${Number(o.precio).toLocaleString('es-MX')}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{o.lote ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{o.fecha_caducidad ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{o.material_sugerido ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{o.centro_pedido ?? '—'}</td>
                        <td className="px-2 py-2">
                          <button onClick={e => { e.stopPropagation(); deleteOrder(o.id) }}
                            className="text-gray-300 hover:text-red-400 text-base">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Panel de detalle y seguimiento */}
        {detailId && detail && (
          <div className="w-96 flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden"
            style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 sticky top-0">
              <p className="text-sm font-bold text-gray-800">Pedido {detail.pedido}</p>
              <button onClick={() => setDetailId(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {/* Info del registro */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Solicitante', detail.solicitante],
                  ['Destinatario', detail.destinatario],
                  ['Razón Social', detail.razon_social],
                  ['Gpo. Cte.', detail.gpo_cliente],
                  ['Gpo. Vdor.', detail.gpo_vendedor],
                  ['Centro', detail.centro_pedido],
                  ['Almacén', detail.almacen],
                  ['Fecha', detail.fecha],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <div key={label as string}>
                    <p className="text-gray-400">{label as string}</p>
                    <p className="font-medium text-gray-700">{val as string}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-gray-400 mb-1">Material solicitado</p>
                <p className="font-semibold text-gray-800">{detail.material_solicitado}</p>
                {detail.descripcion_solicitada && <p className="text-gray-500">{detail.descripcion_solicitada}</p>}
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                <div><p className="text-gray-400">Cant. pedido</p><p className="font-medium">{detail.cantidad_pedido ?? '—'}</p></div>
                <div><p className="text-gray-400">Cant. ofertar</p><p className="font-medium">{detail.cantidad_ofertar ?? '—'}</p></div>
                <div><p className="text-gray-400">Precio</p><p className="font-medium">{detail.precio != null ? `$${Number(detail.precio).toLocaleString('es-MX')}` : '—'}</p></div>
                <div><p className="text-gray-400">Disponible</p><p className="font-medium">{detail.disponible ?? '—'}</p></div>
                <div><p className="text-gray-400">Lote</p><p className="font-medium">{detail.lote ?? '—'}</p></div>
                <div><p className="text-gray-400">Caducidad</p><p className="font-medium">{detail.fecha_caducidad ?? '—'}</p></div>
              </div>

              {(detail.material_sugerido || detail.centro_sugerido) && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-gray-400 mb-1">Material sugerido</p>
                  <p className="font-semibold text-gray-800">{detail.material_sugerido}</p>
                  {detail.descripcion_sugerida && <p className="text-gray-500">{detail.descripcion_sugerida}</p>}
                  <div className="flex gap-3 mt-1">
                    {detail.centro_sugerido && <span>Centro: {detail.centro_sugerido}</span>}
                    {detail.almacen_sugerido && <span>Alm: {detail.almacen_sugerido}</span>}
                  </div>
                </div>
              )}

              {/* Actualizar estatus */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Actualizar seguimiento</p>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 outline-none"
                  value={newEstatus} onChange={e => setNewEstatus(e.target.value)}>
                  {ESTATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-16 resize-none outline-none focus:border-teal-400 mb-2"
                  placeholder="Comentario (opcional)"
                  value={newComentario}
                  onChange={e => setNewComentario(e.target.value)} />
                <button onClick={updateStatus} disabled={updatingStatus}
                  className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  {updatingStatus ? 'Guardando...' : 'Guardar seguimiento'}
                </button>
              </div>

              {/* Historial */}
              {history.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Historial</p>
                  {history.map(h => (
                    <div key={h.id} className="mb-2 pb-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ESTATUS_COLOR[h.estatus_nuevo]}`}>
                          {ESTATUS_OPTIONS.find(e => e.value === h.estatus_nuevo)?.label ?? h.estatus_nuevo}
                        </span>
                        <span className="text-gray-300">{new Date(h.created_at).toLocaleDateString('es-MX')}</span>
                      </div>
                      {h.comentario && <p className="text-gray-500">{h.comentario}</p>}
                      <p className="text-gray-300">{h.users?.full_name || h.users?.email}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
