import { useEffect, useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

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

const ESTATUS_OPTIONS = [
  { value: 'pendiente',          label: 'Pendiente',           color: 'bg-gray-100 text-gray-600' },
  { value: 'contactado',         label: 'Contactado',          color: 'bg-blue-100 text-blue-700' },
  { value: 'interesado',         label: 'Interesado',          color: 'bg-teal-100 text-teal-700' },
  { value: 'requiere_material',  label: 'Requiere material',   color: 'bg-orange-100 text-orange-700' },
  { value: 'aceptado',           label: 'Aceptado',            color: 'bg-green-100 text-green-700' },
  { value: 'en_surtido',         label: 'En surtido',          color: 'bg-purple-100 text-purple-700' },
  { value: 'movimiento_cedis',   label: 'Movimiento CEDIS',    color: 'bg-yellow-100 text-yellow-700' },
  { value: 'facturado',          label: 'Facturado',           color: 'bg-indigo-100 text-indigo-700' },
  { value: 'enviado',            label: 'Enviado',             color: 'bg-cyan-100 text-cyan-700' },
  { value: 'entregado',          label: 'Entregado',           color: 'bg-green-200 text-green-800' },
  { value: 'no_interesado',      label: 'No interesado',       color: 'bg-red-100 text-red-600' },
  { value: 'cancelado',          label: 'Cancelado',           color: 'bg-gray-100 text-gray-400' },
]

const estatusColor = (e: string) =>
  ESTATUS_OPTIONS.find(o => o.value === e)?.color ?? 'bg-gray-100 text-gray-500'
const estatusLabel = (e: string) =>
  ESTATUS_OPTIONS.find(o => o.value === e)?.label ?? e

// Grupos de estatus para el flujo visual
const FLOW_STEPS = [
  { label: 'Contacto',   values: ['pendiente','contactado','interesado','no_interesado'] },
  { label: 'Decisión',   values: ['aceptado','requiere_material'] },
  { label: 'Logística',  values: ['en_surtido','movimiento_cedis'] },
  { label: 'Cierre',     values: ['facturado','enviado','entregado','cancelado'] },
]

function parseExcelDate(val: string): string {
  if (!val?.trim()) return ''
  const v = val.trim()
  const ddmmyyyy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  const ddmmyyyyDash = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (ddmmyyyyDash) {
    const [, d, m, y] = ddmmyyyyDash
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }
  const num = parseFloat(v)
  if (!isNaN(num) && num > 1000) {
    const date = new Date((num - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
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

  // Formulario de venta
  const [showSaleForm, setShowSaleForm] = useState(false)
  const [saleForm, setSaleForm] = useState({
    cantidad_vendida: '', precio_venta: '', numero_factura: '',
    fecha_entrega: '', ejecutivo: '',
  })

  // Formulario CEDIS
  const [showCedisForm, setShowCedisForm] = useState(false)
  const [cedisForm, setCedisForm] = useState({
    centro_origen: '', almacen_origen: '',
    centro_destino: '', almacen_destino: '',
    cantidad: '', um: '', comentarios: '',
  })

  const load = async () => {
    setLoading(true)
    let q = supabase.from('crm_special_orders').select('*')
      .order('fecha', { ascending: false }).order('pedido')
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
      supabase.from('crm_special_order_history')
        .select('*, users:created_by(full_name,email)')
        .eq('order_id', id).order('created_at', { ascending: false }),
    ])
    setDetail(o.data)
    setHistory(h.data ?? [])
    setNewEstatus(o.data?.estatus ?? '')
    if (o.data) {
      setSaleForm({
        cantidad_vendida: o.data.cantidad_vendida ?? '',
        precio_venta:     o.data.precio_venta ?? '',
        numero_factura:   o.data.numero_factura ?? '',
        fecha_entrega:    o.data.fecha_entrega ?? '',
        ejecutivo:        o.data.ejecutivo ?? '',
      })
      setCedisForm({
        centro_origen:   o.data.centro_sugerido ?? '',
        almacen_origen:  o.data.almacen_sugerido ?? '',
        centro_destino:  o.data.centro_pedido ?? '',
        almacen_destino: o.data.almacen ?? '',
        cantidad:        o.data.cantidad_ofertar ?? '',
        um:              '',
        comentarios:     '',
      })
    }
  }

  const openDetail = (id: string) => {
    setDetailId(id)
    loadDetail(id)
    setShowSaleForm(false)
    setShowCedisForm(false)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text')
    parsePastedText(text)
    e.preventDefault()
  }

  const parsePastedText = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length === 0) return
    const firstLine = lines[0].toLowerCase()
    const isHeader = firstLine.includes('pedido') || firstLine.includes('material') ||
      firstLine.includes('solicitante') || firstLine.includes('fecha') || firstLine.includes('gpo')
    const dataLines = isHeader ? lines.slice(1) : lines
    const rows = dataLines.map(line => {
      const cells = line.split('\t')
      const row: Record<string, string> = {}
      COLUMNS.forEach((col, i) => { row[col.key] = cells[i]?.trim() ?? '' })
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

    const solicitantes = [...new Set(inserts.map(r => r.solicitante).filter(Boolean))]
    if (solicitantes.length > 0) {
      const { data: clientsFound } = await supabase
        .from('crm_clients').select('id, solicitante')
        .in('solicitante', solicitantes as string[])
      if (clientsFound?.length) {
        const clientMap: Record<string, string> = {}
        clientsFound.forEach(c => { clientMap[c.solicitante] = c.id })
        inserts.forEach(r => {
          if (r.solicitante && clientMap[r.solicitante]) r.client_id = clientMap[r.solicitante]
        })
        const linked = inserts.filter(r => r.client_id).length
        if (linked > 0) toast.success(`${linked} línea(s) vinculadas a cliente CRM`)
      }
    }

    const { error } = await supabase.from('crm_special_orders').insert(inserts)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(`${inserts.length} línea(s) cargadas`)
    setPastedRows([]); setView('list'); load()
    setSaving(false)
  }

  const updateStatus = async () => {
    if (!detailId || !newEstatus) return
    setUpdatingStatus(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('crm_special_order_history').insert({
      order_id: detailId, estatus_anterior: detail?.estatus,
      estatus_nuevo: newEstatus, comentario: newComentario || null, created_by: user?.id,
    })
    await supabase.from('crm_special_orders').update({
      estatus: newEstatus,
      comentarios: newComentario || detail?.comentarios,
    }).eq('id', detailId)
    toast.success('Estatus actualizado')
    setNewComentario('')
    loadDetail(detailId); load()
    setUpdatingStatus(false)
  }

  const saveSale = async () => {
    if (!detailId) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('crm_special_orders').update({
      cantidad_vendida: saleForm.cantidad_vendida ? parseFloat(saleForm.cantidad_vendida) : null,
      precio_venta:     saleForm.precio_venta ? parseFloat(saleForm.precio_venta) : null,
      numero_factura:   saleForm.numero_factura || null,
      fecha_entrega:    saleForm.fecha_entrega || null,
      ejecutivo:        saleForm.ejecutivo || null,
      estatus:          'facturado',
    }).eq('id', detailId)

    await supabase.from('crm_special_order_history').insert({
      order_id: detailId, estatus_anterior: detail?.estatus,
      estatus_nuevo: 'facturado',
      comentario: `Factura: ${saleForm.numero_factura} · Cant: ${saleForm.cantidad_vendida} · Precio: $${saleForm.precio_venta}`,
      created_by: user?.id,
    })
    toast.success('Venta registrada')
    setShowSaleForm(false)
    loadDetail(detailId); load()
  }

  const saveCedis = async () => {
    if (!detailId || !detail) return
    if (!cedisForm.centro_origen || !cedisForm.centro_destino || !cedisForm.cantidad) {
      return toast.error('Centro origen, destino y cantidad son obligatorios')
    }
    const { data: { user } } = await supabase.auth.getUser()

    // Crear requerimiento CEDIS — necesita un order_id
    // Creamos una orden CRM temporal si no existe
    let orderId = detail.order_id
    if (!orderId) {
      const { data: newOrder } = await supabase.from('crm_orders').insert({
        followup_id:   null,
        client_id:     detail.client_id,
        numero_pedido: detail.pedido ?? `ESP-${detail.id.slice(0,8)}`,
        estatus:       'en_proceso',
        comentarios:   `Pedido especial: ${detail.material_solicitado}`,
        created_by:    user?.id,
      }).select('id').single()
      orderId = newOrder?.id
      await supabase.from('crm_special_orders').update({ order_id: orderId }).eq('id', detailId)
    }

    const condicion = detail.condicion ?? 'obsoleto'
    const condMap: Record<string,string> = {
      corta_caducidad: 'Corta caducidad', danado: 'Dañado',
      obsoleto: 'Material Obsoleto', otro: 'Otro',
    }
    const autoComment = cedisForm.comentarios ||
      `${condMap[condicion] ?? 'Material Obsoleto'} // Pedido ${detail.pedido ?? ''}`

    const { data: cedisReq } = await supabase.from('crm_cedis_requests').insert({
      order_id:        orderId,
      fecha_solicitud: new Date().toISOString().split('T')[0],
      centro_origen:   cedisForm.centro_origen,
      almacen_origen:  cedisForm.almacen_origen || null,
      centro_destino:  cedisForm.centro_destino,
      almacen_destino: cedisForm.almacen_destino || null,
      codigo:          detail.material_sugerido ?? detail.material_solicitado,
      descripcion:     detail.descripcion_sugerida ?? detail.descripcion_solicitada,
      cantidad:        parseFloat(cedisForm.cantidad),
      um:              cedisForm.um || null,
      lote:            detail.lote || null,
      fecha_caducidad: detail.fecha_caducidad || null,
      comentarios:     autoComment,
      estatus:         'solicitado',
      created_by:      user?.id,
    }).select('id').single()

    if (cedisReq) {
      await supabase.from('crm_cedis_history').insert({
        request_id: cedisReq.id, estatus_nuevo: 'solicitado',
        comentario: 'Requerimiento creado desde pedido especial', created_by: user?.id,
      })
      await supabase.from('crm_special_orders').update({
        cedis_id: cedisReq.id, estatus: 'movimiento_cedis',
      }).eq('id', detailId)
      await supabase.from('crm_special_order_history').insert({
        order_id: detailId, estatus_anterior: detail.estatus,
        estatus_nuevo: 'movimiento_cedis',
        comentario: `Requerimiento CEDIS creado: ${cedisForm.centro_origen} → ${cedisForm.centro_destino}`,
        created_by: user?.id,
      })
    }

    toast.success('Requerimiento CEDIS generado')
    setShowCedisForm(false)
    loadDetail(detailId); load()
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
        <button onClick={() => { setView('paste'); setPastedRows([]) }}
          className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
          + Cargar desde Excel
        </button>
      </div>

      {/* Vista: pegar desde Excel */}
      {view === 'paste' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-2">Pegar desde Excel</h2>
          <p className="text-sm text-gray-400 mb-4">
            Copia las filas directamente desde Excel y pégalas aquí con{' '}
            <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">Ctrl+V</kbd>.
          </p>
          {pastedRows.length === 0 ? (
            <textarea ref={pasteRef}
              className="w-full h-32 border-2 border-dashed border-gray-200 rounded-xl p-4 text-sm text-gray-400 outline-none focus:border-teal-400 resize-none"
              placeholder="Haz clic aquí y pega con Ctrl+V..."
              onPaste={handlePaste} onChange={() => {}} value="" />
          ) : (
            <>
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-teal-700">{pastedRows.length} línea(s) listas</p>
                <button onClick={() => setPastedRows([])} className="text-xs text-gray-400 hover:text-red-500">Limpiar</button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-200 mb-4" style={{ maxHeight: '300px' }}>
                <table className="text-xs border-collapse w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">#</th>
                      {COLUMNS.map(c => (
                        <th key={c.key} className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pastedRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100">
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
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
          value={filterEstatus} onChange={e => setFilterEstatus(e.target.value)}>
          <option value="">Todos los estatus</option>
          {ESTATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className={`flex gap-4 ${detailId ? 'items-start' : ''}`}>
        {/* Tabla */}
        <div className={detailId ? 'flex-1 min-w-0' : 'w-full'}>
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
                      {['Estatus','Pedido','Fecha','Solicitante','Destinatario','Material','Descripción',
                        'Cant. Pedido','Cant. Ofertar','Precio','Disponible','Lote','Caducidad','Mat. Sugerido','Centro',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} onClick={() => openDetail(o.id)}
                        className={`border-b border-gray-100 cursor-pointer transition ${detailId === o.id ? 'bg-teal-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estatusColor(o.estatus)}`}>
                            {estatusLabel(o.estatus)}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{o.pedido}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{o.fecha}</td>
                        <td className="px-3 py-2 whitespace-nowrap max-w-32 truncate">
                          {o.client_id ? (
                            <Link to={`/crm/${o.client_id}`} onClick={e => e.stopPropagation()}
                              className="text-teal-600 hover:underline font-medium">{o.solicitante}</Link>
                          ) : <span className="text-gray-700">{o.solicitante}</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-32 truncate">{o.destinatario}</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap font-medium">{o.material_solicitado}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-48 truncate">{o.descripcion_solicitada}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{o.cantidad_pedido ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{o.cantidad_ofertar ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {o.precio != null ? `$${Number(o.precio).toLocaleString('es-MX')}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{o.disponible ?? '—'}</td>
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

        {/* Panel de detalle */}
        {detailId && detail && (
          <div className="w-96 flex-shrink-0 bg-white rounded-xl border border-gray-200"
            style={{ maxHeight: '85vh', overflowY: 'auto' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
              <div>
                <p className="text-sm font-bold text-gray-800">Pedido {detail.pedido}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estatusColor(detail.estatus)}`}>
                  {estatusLabel(detail.estatus)}
                </span>
              </div>
              <button onClick={() => setDetailId(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            {/* Flujo visual de estatus */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex gap-1">
                {FLOW_STEPS.map((step, si) => {
                  const active = step.values.includes(detail.estatus)
                  const done = FLOW_STEPS.slice(0, si).some(s => s.values.includes(detail.estatus))
                  return (
                    <div key={step.label} className="flex-1 text-center">
                      <div className={`h-1.5 rounded-full mb-1 ${active ? 'bg-teal-500' : done ? 'bg-teal-200' : 'bg-gray-100'}`} />
                      <p className={`text-xs ${active ? 'text-teal-600 font-semibold' : 'text-gray-400'}`}>
                        {step.label}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="px-4 pb-4 space-y-4 text-xs">
              {/* Info del registro */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Solicitante', detail.solicitante], ['Destinatario', detail.destinatario],
                  ['Razón Social', detail.razon_social], ['Gpo. Cte.', detail.gpo_cliente],
                  ['Ejecutivo', detail.gpo_vendedor], ['Centro', detail.centro_pedido],
                  ['Almacén', detail.almacen], ['Fecha', detail.fecha],
                ].filter(([,v]) => v).map(([l, v]) => (
                  <div key={l as string}>
                    <p className="text-gray-400">{l as string}</p>
                    <p className="font-medium text-gray-700">{v as string}</p>
                  </div>
                ))}
              </div>

              {/* Material */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-gray-400 mb-1">Material solicitado</p>
                <p className="font-semibold text-gray-800">{detail.material_solicitado}</p>
                {detail.descripcion_solicitada && <p className="text-gray-500">{detail.descripcion_solicitada}</p>}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div><p className="text-gray-400">Cant. pedido</p><p className="font-medium">{detail.cantidad_pedido ?? '—'}</p></div>
                  <div><p className="text-gray-400">Cant. ofertar</p><p className="font-medium">{detail.cantidad_ofertar ?? '—'}</p></div>
                  <div><p className="text-gray-400">Precio</p><p className="font-medium">{detail.precio != null ? `$${Number(detail.precio).toLocaleString('es-MX')}` : '—'}</p></div>
                  <div><p className="text-gray-400">Disponible</p><p className="font-medium">{detail.disponible ?? '—'}</p></div>
                  <div><p className="text-gray-400">Lote</p><p className="font-medium">{detail.lote ?? '—'}</p></div>
                  <div><p className="text-gray-400">Caducidad</p><p className="font-medium">{detail.fecha_caducidad ?? '—'}</p></div>
                </div>
              </div>

              {/* Material sugerido */}
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

              {/* Info de venta si ya existe */}
              {detail.numero_factura && (
                <div className="border-t border-gray-100 pt-3 bg-green-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1">Venta registrada</p>
                  <div className="grid grid-cols-2 gap-1">
                    <div><p className="text-gray-400">Factura</p><p className="font-medium">{detail.numero_factura}</p></div>
                    <div><p className="text-gray-400">Cantidad</p><p className="font-medium">{detail.cantidad_vendida}</p></div>
                    <div><p className="text-gray-400">Precio venta</p><p className="font-medium">${Number(detail.precio_venta).toLocaleString('es-MX')}</p></div>
                    <div><p className="text-gray-400">Entrega</p><p className="font-medium">{detail.fecha_entrega ?? '—'}</p></div>
                    {detail.ejecutivo && <div className="col-span-2"><p className="text-gray-400">Ejecutivo</p><p className="font-medium">{detail.ejecutivo}</p></div>}
                  </div>
                </div>
              )}

              {/* Link a CEDIS si existe */}
              {detail.cedis_id && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-yellow-700 mb-1">Requerimiento CEDIS activo</p>
                  <Link to={`/crm/${detail.client_id ?? '_'}/order/${detail.order_id ?? '_'}/cedis`}
                    className="text-xs text-teal-600 hover:underline">
                    Ver requerimiento CEDIS →
                  </Link>
                </div>
              )}

              {/* Botones de acción según estatus */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Acciones</p>
                <div className="flex flex-wrap gap-2">
                  {!['entregado','cancelado','no_interesado'].includes(detail.estatus) && (
                    <button onClick={() => setShowSaleForm(!showSaleForm)}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700">
                      💰 Registrar venta
                    </button>
                  )}
                  {!['entregado','cancelado','movimiento_cedis'].includes(detail.estatus) && (
                    <button onClick={() => setShowCedisForm(!showCedisForm)}
                      className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-600">
                      🚚 Req. CEDIS
                    </button>
                  )}
                  {detail.client_id && (
                    <Link to={`/crm/${detail.client_id}`}
                      className="text-xs bg-teal-50 text-teal-600 border border-teal-200 px-3 py-1.5 rounded-lg font-medium hover:bg-teal-100">
                      Ver cliente →
                    </Link>
                  )}
                </div>
              </div>

              {/* Formulario registrar venta */}
              {showSaleForm && (
                <div className="border border-green-200 rounded-xl p-3 bg-green-50 space-y-2">
                  <p className="text-xs font-semibold text-green-700">Registrar venta</p>
                  {[
                    { label: 'Cantidad vendida', key: 'cantidad_vendida', type: 'number' },
                    { label: 'Precio de venta', key: 'precio_venta', type: 'number' },
                    { label: 'Número de factura', key: 'numero_factura', type: 'text' },
                    { label: 'Fecha de entrega', key: 'fecha_entrega', type: 'date' },
                    { label: 'Ejecutivo responsable', key: 'ejecutivo', type: 'text' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-gray-500 block mb-0.5">{f.label}</label>
                      <input type={f.type}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white outline-none focus:border-green-400"
                        value={saleForm[f.key as keyof typeof saleForm]}
                        onChange={e => setSaleForm(x => ({ ...x, [f.key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button onClick={saveSale}
                      className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700">
                      Guardar venta
                    </button>
                    <button onClick={() => setShowSaleForm(false)}
                      className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Formulario CEDIS */}
              {showCedisForm && (
                <div className="border border-amber-200 rounded-xl p-3 bg-amber-50 space-y-2">
                  <p className="text-xs font-semibold text-amber-700">Requerimiento de movimiento CEDIS</p>
                  {[
                    { label: 'Centro Origen *', key: 'centro_origen' },
                    { label: 'Almacén Origen', key: 'almacen_origen' },
                    { label: 'Centro Destino *', key: 'centro_destino' },
                    { label: 'Almacén Destino', key: 'almacen_destino' },
                    { label: 'Cantidad *', key: 'cantidad', type: 'number' },
                    { label: 'UM', key: 'um' },
                    { label: 'Comentario (auto-generado si vacío)', key: 'comentarios' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-gray-500 block mb-0.5">{f.label}</label>
                      <input type={f.type ?? 'text'}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white outline-none focus:border-amber-400"
                        value={cedisForm[f.key as keyof typeof cedisForm]}
                        onChange={e => setCedisForm(x => ({ ...x, [f.key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button onClick={saveCedis}
                      className="bg-amber-500 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-600">
                      Crear requerimiento
                    </button>
                    <button onClick={() => setShowCedisForm(false)}
                      className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Actualizar estatus */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Cambiar estatus / agregar nota</p>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 outline-none"
                  value={newEstatus} onChange={e => setNewEstatus(e.target.value)}>
                  {ESTATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-16 resize-none outline-none focus:border-teal-400 mb-2"
                  placeholder="Comentario (opcional)" value={newComentario}
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
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${estatusColor(h.estatus_nuevo)}`}>
                          {estatusLabel(h.estatus_nuevo)}
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
