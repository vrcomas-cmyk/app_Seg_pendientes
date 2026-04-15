import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, getCachedUser } from '../../lib/supabase'
import toast from 'react-hot-toast'

// ─── Constants ────────────────────────────────────────────────────────────────
const ETAPAS = [
  { key: 'oferta',      label: 'Oferta',      color: '#6B7280', bg: '#F3F4F6', text: '#374151' },
  { key: 'venta',       label: 'Venta',       color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  { key: 'cedis',       label: 'CEDIS',       color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { key: 'transmision', label: 'Transmisión', color: '#8B5CF6', bg: '#EDE9FE', text: '#5B21B6' },
  { key: 'facturado',   label: 'Facturado',   color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
]
const ETAPA_IDX: Record<string,number> = { oferta:0, venta:1, cedis:2, transmision:3, facturado:4 }

const ITEM_ESTATUS_COLOR: Record<string,string> = {
  borrador:'bg-gray-100 text-gray-500', ofertado:'bg-gray-100 text-gray-600',
  aceptado:'bg-green-100 text-green-700', rechazado:'bg-red-100 text-red-600',
  asignado_pedido:'bg-blue-100 text-blue-700', solicitud_cedis:'bg-yellow-100 text-yellow-700',
  en_transito:'bg-orange-100 text-orange-700', recibido_cedis:'bg-teal-100 text-teal-700',
  disponible:'bg-indigo-100 text-indigo-700', surtido:'bg-cyan-100 text-cyan-700',
  facturado:'bg-green-200 text-green-800', cancelado:'bg-gray-100 text-gray-400',
}

function dias(f: string|null) {
  if (!f) return 0
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000)
}

// ─── localStorage history ─────────────────────────────────────────────────────
const HISTORY_KEY = 'crm_client_search_history'
function getHistory(): any[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}
function addToHistory(client: any) {
  const prev = getHistory().filter((c: any) => c.id !== client.id)
  localStorage.setItem(HISTORY_KEY, JSON.stringify([client, ...prev].slice(0, 5)))
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CrmPipelinePage() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('id')
  const highlightRef = useRef<HTMLTableRowElement>(null)

  // Data
  const [ventas, setVentas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterEtapa, setFilterEtapa] = useState(() => highlightId ? '' : 'activas')
  const [filterArchivadas, setFilterArchivadas] = useState(false)
  const [search, setSearch] = useState('')

  // Expanded row
  const [expandedId, setExpandedId] = useState<string|null>(highlightId)

  // Per-item inline edits: { [itemId]: { precio, folio_delivery, numero_factura, numero_pedido } }
  const [itemEdits, setItemEdits] = useState<Record<string,any>>({})
  const setItemEdit = (itemId: string, field: string, val: string) =>
    setItemEdits(p => ({ ...p, [itemId]: { ...(p[itemId]??{}), [field]: val } }))
  const getItemEdit = (itemId: string, field: string, fallback: any) =>
    itemEdits[itemId]?.[field] !== undefined ? itemEdits[itemId][field] : fallback

  // Per-item disponibilidad toggle: { [itemId]: 'disponible'|'solicitar_cedis'|'' }
  const [itemDisp, setItemDisp] = useState<Record<string,string>>({})
  // Per-item CEDIS form open
  const [itemCedisOpen, setItemCedisOpen] = useState<Record<string,boolean>>({})
  const [itemCedisForm, setItemCedisForm] = useState<Record<string,any>>({})
  const [savingCedis, setSavingCedis] = useState<Record<string,boolean>>({})

  // Multi-select for correo almacén
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const toggleItem = (id: string) => setSelectedItems(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // Saving state per offer
  const [savingItems, setSavingItems] = useState<Record<string,boolean>>({})

  // Confirm modal (oferta→venta)
  const [confirmModal, setConfirmModal] = useState<{ venta:any; items:any[] }|null>(null)
  const [confirmItems, setConfirmItems] = useState<Record<string,{
    aceptado:boolean; cantidad:string; lote:string; caducidad:string; comentario:string
    requiereCedis:boolean; cedisOrigen:string; cedisAlmacenOrigen:string
    cedisDestino:string; cedisAlmacenDestino:string
  }>>({})
  const [folioInput, setFolioInput] = useState('')
  const [savingConfirm, setSavingConfirm] = useState(false)

  // Archive / Facturar modal
  const [archiveModal, setArchiveModal] = useState<{ venta:any; accion:'archivar'|'facturar' }|null>(null)
  const [archiveMotivo, setArchiveMotivo] = useState('')
  const [savingArchive, setSavingArchive] = useState(false)

  // Task panel per offer
  const [taskPanelOpen, setTaskPanelOpen] = useState<Record<string,boolean>>({})
  const [taskForm, setTaskForm] = useState<Record<string,any>>({})
  const [savingTask, setSavingTask] = useState<Record<string,boolean>>({})

  // Folio modal (oferta→venta)
  const [folioModal, setFolioModal] = useState<{ venta:any }|null>(null)
  const [savingFolio, setSavingFolio] = useState(false)

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('crm_offers')
      .select(`
        id, tipo, tipo_negocio, etapa, estatus, notas, created_at, fecha_venta,
        id, tipo, tipo_negocio, etapa, estatus, notas, created_at, fecha_venta, task_id,
        client_id, folio_pedido, gpo_cliente, gpo_vendedor,
        crm_clients(id, solicitante, razon_social),
        crm_offer_items(
          id, material, descripcion,
          cantidad_aceptada, cantidad_ofertada, precio_aceptado, precio_oferta,
          numero_pedido, numero_factura, estatus, lote, caducidad, um,
          cedis_request_id, folio_entrega_salida, lotes, aceptado
        )
      `)
      .order('created_at', { ascending: false })
    setVentas(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (highlightId && highlightRef.current)
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior:'smooth', block:'center' }), 300)
  }, [loading, highlightId])

  // Fetch task details when an offer with task_id is expanded
  useEffect(() => {
    if (!expandedId) return
    const offer = ventas.find(v => v.id === expandedId)
    if (!offer?.task_id || offer._task) return
    supabase.from('tasks').select('id, title, description, priority, due_date, status')
      .eq('id', offer.task_id).single()
      .then(({ data }) => {
        if (data) setVentas(p => p.map(v => v.id === expandedId ? { ...v, _task: data } : v))
      })
  }, [expandedId, ventas])

  // ── Visible filter ─────────────────────────────────────────────────────────
  const visible = ventas.filter(v => {
    if (filterArchivadas) return ['cancelado','cerrada'].includes(v.etapa)
    if (['cancelado','cerrada'].includes(v.etapa)) return false
    if (filterEtapa === 'activas' && v.etapa === 'facturado') return false
    if (filterEtapa && !['activas',''].includes(filterEtapa) && v.etapa !== filterEtapa) return false
    if (search) {
      const q = search.toLowerCase()
      const cli = v.crm_clients
      return cli?.solicitante?.toLowerCase().includes(q) ||
        cli?.razon_social?.toLowerCase().includes(q) ||
        v.folio_pedido?.toLowerCase().includes(q) ||
        v.notas?.toLowerCase().includes(q) ||
        (v.crm_offer_items ?? []).some((i:any) => i.numero_pedido?.toLowerCase().includes(q) || i.material?.toLowerCase().includes(q))
    }
    return true
  })

  const countActivas   = ventas.filter(v => !['facturado','cancelado','cerrada'].includes(v.etapa)).length
  const countArchivadas = ventas.filter(v => ['cancelado','cerrada'].includes(v.etapa)).length

  // ── Etapa change inline ────────────────────────────────────────────────────
  const changeEtapa = async (v: any, newEtapa: string) => {
    if (newEtapa === v.etapa) return
    if (v.etapa === 'oferta' && newEtapa !== 'oferta') {
      setConfirmModal({ venta: v, items: v.crm_offer_items ?? [] })
      const init: Record<string,any> = {}
      ;(v.crm_offer_items ?? []).forEach((it:any) => {
        init[it.id] = {
          aceptado: true, cantidad: String(it.cantidad_aceptada ?? it.cantidad_ofertada ?? ''),
          lote: it.lote ?? '', caducidad: it.caducidad ?? '', comentario: '',
          requiereCedis: false, cedisOrigen: '', cedisAlmacenOrigen: '',
          cedisDestino: '', cedisAlmacenDestino: '',
        }
      })
      setConfirmItems(init)
      setFolioInput(v.folio_pedido ?? '')
      return
    }
    await supabase.from('crm_offers').update({ etapa: newEtapa }).eq('id', v.id)
    setVentas(p => p.map(x => x.id === v.id ? { ...x, etapa: newEtapa } : x))
    toast.success(`Etapa → ${newEtapa}`)
  }

  // ── Folio SAP per offer ────────────────────────────────────────────────────
  const saveOfferFolio = async (offerId: string, val: string) => {
    await supabase.from('crm_offers').update({ folio_pedido: val || null }).eq('id', offerId)
    setVentas(p => p.map(v => v.id === offerId ? { ...v, folio_pedido: val || null } : v))
  }

  // ── Save item fields inline ────────────────────────────────────────────────
  const saveItemFields = async (offerId: string, itemId: string) => {
    setSavingItems(p => ({ ...p, [offerId]: true }))
    const edits = itemEdits[itemId] ?? {}
    const updates: any = {}
    if (edits.precio !== undefined) {
      updates.precio_aceptado = parseFloat(edits.precio) || null
      updates.precio_oferta   = parseFloat(edits.precio) || null
    }
    if (edits.folio_delivery !== undefined) updates.folio_entrega_salida = edits.folio_delivery || null
    if (edits.numero_factura !== undefined) updates.numero_factura = edits.numero_factura || null
    if (edits.numero_pedido  !== undefined) updates.numero_pedido  = edits.numero_pedido || null
    if (edits.estatus        !== undefined) updates.estatus        = edits.estatus
    if (Object.keys(updates).length === 0) { setSavingItems(p => ({ ...p, [offerId]: false })); return }
    const { error } = await supabase.from('crm_offer_items').update(updates).eq('id', itemId)
    if (error) { toast.error(error.message) } else {
      setVentas(p => p.map(v => v.id !== offerId ? v : {
        ...v, crm_offer_items: (v.crm_offer_items ?? []).map((i:any) =>
          i.id !== itemId ? i : { ...i, ...updates }
        )
      }))
      toast.success('Guardado')
    }
    setSavingItems(p => ({ ...p, [offerId]: false }))
  }

  // ── CEDIS request per item ─────────────────────────────────────────────────
  const saveCedisForItem = async (offer: any, item: any) => {
    const form = itemCedisForm[item.id] ?? {}
    if (!form.centro_origen || !form.centro_destino || !form.cantidad)
      return toast.error('Centro origen, destino y cantidad son obligatorios')
    setSavingCedis(p => ({ ...p, [item.id]: true }))
    const user = await getCachedUser()
    const lotes = typeof item.lotes === 'string' ? JSON.parse(item.lotes||'[]') : (item.lotes ?? [])
    const primerLote = lotes[0] ?? {}
    const clientId = offer.crm_clients?.id
    const pedidoNum = item.numero_pedido ?? `VTA-${item.id?.slice(0,8)}`

    let orderId: string|null = null
    const { data: existingOrder } = await supabase.from('crm_orders')
      .select('id').eq('client_id', clientId).eq('numero_pedido', pedidoNum).single()
    if (existingOrder) { orderId = existingOrder.id } else {
      const { data: newOrder } = await supabase.from('crm_orders').insert({
        client_id: clientId, numero_pedido: pedidoNum,
        estatus: 'en_proceso', created_by: user?.id,
      }).select('id').single()
      orderId = newOrder?.id ?? null
    }

    const { data: req } = await supabase.from('crm_cedis_requests').insert({
      order_id: orderId,
      fecha_solicitud: new Date().toISOString().split('T')[0],
      centro_origen:   form.centro_origen, almacen_origen:  form.almacen_origen || null,
      centro_destino:  form.centro_destino, almacen_destino: form.almacen_destino || null,
      codigo:      item.material, descripcion: item.descripcion,
      cantidad:    parseFloat(form.cantidad), um: form.um || item.um || null,
      lote:        primerLote.lote || null, fecha_caducidad: primerLote.fecha_caducidad || null,
      comentarios: form.comentarios || `Pedido ${pedidoNum}`,
      cantidad_recibida: 0, cantidad_pendiente: parseFloat(form.cantidad),
      estatus: 'solicitado', created_by: user?.id,
    }).select('id').single()

    if (req) {
      await supabase.from('crm_offer_items').update({
        cedis_request_id: req.id, requiere_traslado: true, estatus: 'solicitud_cedis',
        centro_origen: form.centro_origen, almacen_origen: form.almacen_origen,
        centro_destino: form.centro_destino, almacen_destino: form.almacen_destino,
      }).eq('id', item.id)
      toast.success('Solicitud CEDIS creada')
      setItemCedisOpen(p => ({ ...p, [item.id]: false }))
      setItemDisp(p => ({ ...p, [item.id]: 'solicitar_cedis' }))
      load()
    }
    setSavingCedis(p => ({ ...p, [item.id]: false }))
  }

  // ── Correo almacén multi-item ──────────────────────────────────────────────
  const generarCorreoMulti = (offer: any, itemIds: string[]) => {
    const items = (offer.crm_offer_items ?? []).filter((i:any) => itemIds.includes(i.id))
    if (items.length === 0) return
    const cli = offer.crm_clients
    const lines = items.map((i:any) => {
      const lotes = typeof i.lotes === 'string' ? JSON.parse(i.lotes||'[]') : (i.lotes ?? [])
      const loteStr = lotes.map((l:any) => `      - Lote: ${l.lote??'-'} / Cad: ${l.fecha_caducidad??'-'}`).join('\n')
        || (i.lote ? `      - Lote: ${i.lote}${i.caducidad ? ` / Cad: ${i.caducidad}` : ''}` : '      Sin lote')
      return `  Material: ${i.material} — ${i.descripcion??''}\n  Cant: ${i.cantidad_aceptada??i.cantidad_ofertada??'-'} ${i.um??''}\n  Delivery: ${i.folio_entrega_salida??'pendiente'}\n  Pedido SAP: ${i.numero_pedido??'-'}\n  Lotes:\n${loteStr}`
    }).join('\n\n')

    const subject = encodeURIComponent(`Surtido — ${cli?.solicitante??''} — ${new Date().toLocaleDateString('es-MX')}`)
    const body = encodeURIComponent(
      `Estimado equipo de almacén,\n\nSe solicita surtir los siguientes materiales:\n\nCliente: ${cli?.solicitante??'-'}\nRazón Social: ${cli?.razon_social??'-'}\n\n${lines}\n\nFavor de confirmar el surtido.\n\nSaludos`
    )
    const a = document.createElement('a')
    a.href = `mailto:?subject=${subject}&body=${body}`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    toast.success('Correo generado')
  }

  // ── Archive / Facturar ─────────────────────────────────────────────────────
  const ejecutarArchive = async () => {
    if (!archiveModal) return
    setSavingArchive(true)
    if (archiveModal.accion === 'archivar') {
      const { error } = await supabase.from('crm_offers')
        .update({ etapa: 'cancelado' }).eq('id', archiveModal.venta.id)
      if (error) { toast.error(error.message); setSavingArchive(false); return }
      await supabase.from('crm_offer_items').update({ estatus: 'rechazado' }).eq('offer_id', archiveModal.venta.id)
      setVentas(p => p.map(v => v.id === archiveModal.venta.id ? { ...v, etapa: 'cancelado' } : v))
      toast.success('Oferta archivada')
    } else {
      const factura = archiveMotivo.trim()
      const { error } = await supabase.from('crm_offers')
        .update({ etapa: 'facturado', estatus: 'cerrada' }).eq('id', archiveModal.venta.id)
      if (error) { toast.error(error.message); setSavingArchive(false); return }
      if (factura)
        await supabase.from('crm_offer_items')
          .update({ numero_factura: factura, estatus: 'facturado' }).eq('offer_id', archiveModal.venta.id)
      setVentas(p => p.map(v => v.id === archiveModal.venta.id ? { ...v, etapa: 'facturado' } : v))
      toast.success('Oferta facturada')
    }
    setArchiveModal(null); setArchiveMotivo(''); setSavingArchive(false)
    load()
  }

  // ── Confirm oferta→venta ───────────────────────────────────────────────────
  const toggleAll = (val: boolean) => {
    if (!confirmModal) return
    const upd: Record<string,any> = {}
    confirmModal.items.forEach(it => { upd[it.id] = { ...(confirmItems[it.id]??{}), aceptado: val } })
    setConfirmItems(p => ({ ...p, ...upd }))
  }

  const ejecutarConfirm = async () => {
    if (!confirmModal) return
    setSavingConfirm(true)
    const user = await getCachedUser()
    const accepted = confirmModal.items.filter(it => confirmItems[it.id]?.aceptado !== false)
    if (accepted.length === 0) { toast.error('Acepta al menos un material'); setSavingConfirm(false); return }

    // Group by numero_pedido — each unique pedido gets its own folio if different
    const pedidoGroups: Record<string, any[]> = {}
    accepted.forEach(it => {
      const key = it.numero_pedido ?? folioInput ?? 'sin_pedido'
      if (!pedidoGroups[key]) pedidoGroups[key] = []
      pedidoGroups[key].push(it)
    })

    const updates: Record<string,any> = {}
    for (const it of accepted) {
      const ci = confirmItems[it.id] ?? {} as any
      updates[it.id] = {
        aceptado: true, estatus: 'aceptado',
        cantidad_aceptada: parseFloat(ci.cantidad) || it.cantidad_aceptada || it.cantidad_ofertada || 0,
      }
      if (ci.lote) updates[it.id].lote = ci.lote
      if (ci.caducidad) updates[it.id].caducidad = ci.caducidad
    }

    for (const [itemId, upd] of Object.entries(updates)) {
      await supabase.from('crm_offer_items').update(upd).eq('id', itemId)
    }

    // Mark rejected
    const rejected = confirmModal.items.filter(it => confirmItems[it.id]?.aceptado === false)
    if (rejected.length > 0)
      await supabase.from('crm_offer_items').update({ aceptado: false, estatus: 'rechazado' })
        .in('id', rejected.map(it => it.id))

    // CEDIS requests
    for (const it of accepted) {
      const ci = confirmItems[it.id] ?? {} as any
      if (ci.requiereCedis && ci.cedisOrigen && ci.cedisDestino) {
        const { data: req } = await supabase.from('crm_cedis_requests').insert({
          codigo: it.material, descripcion: it.descripcion,
          cantidad: updates[it.id].cantidad_aceptada, um: it.um || null,
          centro_origen: ci.cedisOrigen, almacen_origen: ci.cedisAlmacenOrigen || null,
          centro_destino: ci.cedisDestino, almacen_destino: ci.cedisAlmacenDestino || null,
          fecha_solicitud: new Date().toISOString().split('T')[0],
          estatus: 'solicitado', tipo_movimiento: 'para_pedido',
          folio_pedido_destino: folioInput || null, created_by: user?.id,
        }).select('id').single()
        if (req)
          await supabase.from('crm_offer_items').update({
            cedis_request_id: req.id, requiere_traslado: true, estatus: 'solicitud_cedis',
          }).eq('id', it.id)
      }
    }

    // Advance offer to 'venta'
    const offerUpd: any = { etapa: 'venta', fecha_venta: new Date().toISOString().split('T')[0] }
    if (folioInput.trim()) offerUpd.folio_pedido = folioInput.trim()
    await supabase.from('crm_offers').update(offerUpd).eq('id', confirmModal.venta.id)

    toast.success('Oferta convertida a Venta')
    setConfirmModal(null)
    setSavingConfirm(false)
    load()
  }

  // ── Create & link task to offer ─────────────────────────────────────────────
  const createAndLinkTask = async (offerId: string, clientName: string) => {
    const form = taskForm[offerId] ?? {}
    if (!form.title?.trim()) return toast.error('Escribe el título del pendiente')
    setSavingTask(p => ({ ...p, [offerId]: true }))
    const user = await getCachedUser()
    const { data: task, error } = await supabase.from('tasks').insert({
      title:        form.title.trim(),
      description:  form.description?.trim() || `Oferta CRM — ${clientName}`,
      priority:     form.priority || 'media',
      due_date:     form.due_date || null,
      requested_by: clientName,
      created_by:   user?.id,
    }).select().single()
    if (error || !task) { toast.error(error?.message ?? 'Error'); setSavingTask(p => ({ ...p, [offerId]: false })); return }
    const { error: e2 } = await supabase.from('crm_offers').update({ task_id: task.id }).eq('id', offerId)
    if (e2) { toast.error(e2.message); setSavingTask(p => ({ ...p, [offerId]: false })); return }
    setVentas(p => p.map(v => v.id === offerId ? { ...v, task_id: task.id, _task: task } : v))
    setTaskPanelOpen(p => ({ ...p, [offerId]: false }))
    setTaskForm(p => ({ ...p, [offerId]: {} }))
    toast.success('Pendiente creado y vinculado')
    setSavingTask(p => ({ ...p, [offerId]: false }))
  }

  const completeTask = async (offerId: string, taskId: string) => {
    await supabase.from('tasks').update({ status: 'completado' }).eq('id', taskId)
    setVentas(p => p.map(v => v.id === offerId ? { ...v, _task: { ...v._task, status: 'completado' } } : v))
    toast.success('Pendiente completado')
  }

  // ── Folio modal (oferta avanzar rápido) ───────────────────────────────────
  const ejecutarFolioModal = async () => {
    if (!folioModal) return
    setSavingFolio(true)
    const upd: any = { etapa: 'venta', fecha_venta: new Date().toISOString().split('T')[0] }
    if (folioInput.trim()) upd.folio_pedido = folioInput.trim()
    await supabase.from('crm_offers').update(upd).eq('id', folioModal.venta.id)
    setVentas(p => p.map(v => v.id === folioModal.venta.id ? { ...v, ...upd } : v))
    setFolioModal(null); setSavingFolio(false); setFolioInput('')
    toast.success('Convertida a Venta')
    load()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-full mx-auto px-2 sm:px-4 pb-10">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Pipeline de ventas</h1>
          <p className="text-sm text-gray-400">{visible.length} registros</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => nav('/crm/reports')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">Reportes SAP</button>
          <button onClick={() => nav('/cedis')} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">CEDIS</button>
          <button onClick={() => nav('/crm/venta-manual')} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700">+ Nueva venta</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3 flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 flex-wrap">
          {[
            { key:'activas', label:`Activas (${countActivas})` },
            { key:'', label:'Todas' },
            { key:'oferta', label:'Oferta' }, { key:'venta', label:'Venta' },
            { key:'cedis', label:'CEDIS' }, { key:'transmision', label:'Transmisión' },
            { key:'facturado', label:'Facturadas' },
          ].map(f => (
            <button key={f.key}
              onClick={() => { setFilterEtapa(f.key); setFilterArchivadas(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                !filterArchivadas && filterEtapa === f.key
                  ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
          <button onClick={() => { setFilterArchivadas(!filterArchivadas); setFilterEtapa('') }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filterArchivadas ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            🗄 Archivadas ({countArchivadas})
          </button>
        </div>
        <input className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400"
          placeholder="Buscar cliente, folio, material, pedido..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="pl-3 py-2.5 w-5"></th>
                <th className="px-3 py-2.5 text-gray-500 font-semibold">Cliente</th>
                <th className="px-3 py-2.5 text-gray-500 font-semibold">Etapa</th>
                <th className="px-3 py-2.5 text-gray-500 font-semibold">Folio SAP</th>
                <th className="px-3 py-2.5 text-gray-500 font-semibold text-right">Mat.</th>
                <th className="px-3 py-2.5 text-gray-500 font-semibold text-right">Total</th>
                <th className="px-3 py-2.5 text-gray-500 font-semibold text-right">Días</th>
                <th className="px-3 py-2.5 text-gray-500 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-center py-10 text-gray-400">Cargando...</td></tr>}
              {!loading && visible.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-gray-400">Sin registros.</td></tr>}
              {!loading && visible.map(v => {
                const cli      = v.crm_clients
                const etapa    = ETAPAS.find(e => e.key === v.etapa) ?? ETAPAS[0]
                const d        = dias(v.fecha_venta)
                const alerta   = d >= 7 && !['facturado','cancelado','cerrada'].includes(v.etapa)
                const archivada = ['cancelado','cerrada'].includes(v.etapa)
                const items    = v.crm_offer_items ?? []
                const total    = items.reduce((a:number, i:any) => a + ((i.cantidad_aceptada??i.cantidad_ofertada??0)*(i.precio_aceptado??i.precio_oferta??0)), 0)
                const isExpanded = expandedId === v.id
                const esOferta   = v.etapa === 'oferta'

                // Detect multiple distinct SAP pedidos within this offer
                const pedidos = [...new Set(items.map((i:any) => i.numero_pedido).filter(Boolean))]
                const multiPedido = pedidos.length > 1

                // Items selected for correo in this offer
                const offerSelectedItems = items.filter((i:any) => selectedItems.has(i.id))

                return (
                  <React.Fragment key={v.id}>
                    <tr
                      ref={v.id === highlightId ? highlightRef : undefined}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition ${alerta?'bg-orange-50/40':''} ${archivada?'opacity-60':''}`}
                      style={{ borderLeft: `3px solid ${alerta?'#F97316':archivada?'#D1D5DB':etapa.color}` }}
                      onClick={() => { setExpandedId(isExpanded ? null : v.id); setSelectedItems(new Set()) }}>
                      <td className="pl-3 py-2.5 text-gray-300 text-xs">{isExpanded?'▼':'▶'}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-gray-800 text-sm leading-tight">{cli?.razon_social??cli?.solicitante??'Sin cliente'}</p>
                        {multiPedido && <p className="text-amber-600 text-xs">{pedidos.length} pedidos SAP</p>}
                        {v.notas && <p className="text-gray-400 truncate max-w-48 text-xs">{v.notas}</p>}
                      </td>
                      <td className="px-3 py-2.5" onClick={e=>e.stopPropagation()}>
                        <select value={v.etapa}
                          onChange={e => changeEtapa(v, e.target.value)}
                          style={{ background:etapa.bg, color:etapa.text, borderColor:etapa.color }}
                          className="border rounded-lg px-2 py-1 text-xs font-medium outline-none cursor-pointer">
                          {ETAPAS.map(e=><option key={e.key} value={e.key}>{e.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2.5" onClick={e=>e.stopPropagation()}>
                        <input className={`font-mono text-xs border rounded px-1.5 py-1 outline-none focus:border-teal-400 w-28 ${v.folio_pedido?'text-blue-700 font-semibold':'text-gray-400'}`}
                          defaultValue={v.folio_pedido??''}
                          placeholder="+ folio"
                          onBlur={e => { if(e.target.value!==v.folio_pedido) saveOfferFolio(v.id, e.target.value) }} />
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{items.length}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-700">
                        {total>0?`$${total.toLocaleString('es-MX',{minimumFractionDigits:0})}`:'—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${alerta?'text-orange-600':'text-gray-400'}`}>
                        {d>0?`${d}d`:'—'}{alerta?' ⚠':''}
                      </td>
                      <td className="px-3 py-2.5" onClick={e=>e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap">
                          {!archivada && v.etapa !== 'facturado' && (
                            <>
                              <button onClick={()=>changeEtapa(v, ETAPAS[Math.min((ETAPA_IDX[v.etapa]??0)+1, ETAPAS.length-1)].key)}
                                className="text-xs bg-teal-600 text-white px-2 py-1 rounded-lg hover:bg-teal-700 font-medium whitespace-nowrap">
                                {esOferta?'Venta →':'Avanzar →'}
                              </button>
                              <button onClick={()=>{setArchiveModal({venta:v,accion:'facturar'});setArchiveMotivo('')}}
                                className="text-xs border border-green-300 text-green-700 px-2 py-1 rounded-lg hover:bg-green-50 font-medium" title="Facturar">✅</button>
                              <button onClick={()=>{setArchiveModal({venta:v,accion:'archivar'});setArchiveMotivo('')}}
                                className="text-xs border border-gray-200 text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-50" title="Archivar">🗄</button>
                            </>
                          )}
                          <button onClick={()=>nav(`/crm/${v.client_id}/offer/${v.id}`)}
                            className="text-xs border border-gray-200 text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-50" title="Editar oferta">↗</button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded row — full workflow */}
                    {isExpanded && (
                      <tr key={`${v.id}-exp`}>
                        <td colSpan={8} className="bg-gray-50 border-b border-gray-200">
                          <div className="px-4 py-3">
                            {/* Expanded header */}
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                Materiales · {items.length}
                                {multiPedido && <span className="ml-2 text-amber-600">({pedidos.length} pedidos SAP distintos)</span>}
                              </p>
                              <div className="flex gap-2 flex-wrap">
                                {offerSelectedItems.length > 0 && (
                                  <button onClick={()=>generarCorreoMulti(v, offerSelectedItems.map((i:any)=>i.id))}
                                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
                                    📧 Correo almacén ({offerSelectedItems.length})
                                  </button>
                                )}
                                {!archivada && (
                                  <>
                                    <button onClick={()=>{setArchiveModal({venta:v,accion:'facturar'});setArchiveMotivo('')}}
                                      className="text-xs border border-green-300 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 font-medium">✅ Facturar</button>
                                    <button onClick={()=>{setArchiveModal({venta:v,accion:'archivar'});setArchiveMotivo('')}}
                                      className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100">🗄 Archivar</button>
                                  </>
                                )}
                                <button onClick={()=>nav(`/crm/${v.client_id}`)}
                                  className="text-xs border border-teal-200 text-teal-600 px-3 py-1.5 rounded-lg hover:bg-teal-50">Ver cliente →</button>
                              </div>
                            </div>

                            {items.length === 0 && <p className="text-xs text-gray-400">Sin materiales.</p>}

                            {/* Items table — one row per material with inline fields */}
                            {items.length > 0 && (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse min-w-[900px]">
                                  <thead>
                                    <tr className="border-b border-gray-200 text-left">
                                      <th className="px-2 py-1.5 w-5">
                                        <input type="checkbox"
                                          checked={items.every((i:any)=>selectedItems.has(i.id))}
                                          onChange={e=>{
                                            if(e.target.checked) setSelectedItems(p=>{const n=new Set(p);items.forEach((i:any)=>n.add(i.id));return n})
                                            else setSelectedItems(p=>{const n=new Set(p);items.forEach((i:any)=>n.delete(i.id));return n})
                                          }} />
                                      </th>
                                      {['Material','Descripción','Pedido SAP','Cant.','Precio','UM','Lote / Cad','Delivery','Factura','Estatus','Disponibilidad'].map(h=>(
                                        <th key={h} className="px-2 py-1.5 text-gray-400 font-semibold whitespace-nowrap">{h}</th>
                                      ))}
                                      <th className="px-2 py-1.5 w-16"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item:any) => {
                                      const lotes = typeof item.lotes==='string' ? JSON.parse(item.lotes||'[]') : (item.lotes??[])
                                      const loteDisplay = lotes[0]
                                        ? `${lotes[0].lote??''}${lotes[0].fecha_caducidad?` / ${lotes[0].fecha_caducidad}`:''}`
                                        : (item.lote ? `${item.lote}${item.caducidad?` / ${item.caducidad}`:''}` : '—')
                                      const disp = itemDisp[item.id] ?? (item.cedis_request_id ? 'solicitar_cedis' : '')
                                      const cedisOpen = itemCedisOpen[item.id] ?? false
                                      const cedisForm = itemCedisForm[item.id] ?? {}
                                      const isSelected = selectedItems.has(item.id)

                                      return (
                                        <React.Fragment key={item.id}>
                                          <tr className={`border-b border-gray-100 ${isSelected?'bg-blue-50':''}`}>
                                            <td className="px-2 py-2">
                                              <input type="checkbox" checked={isSelected}
                                                onChange={()=>toggleItem(item.id)} />
                                            </td>
                                            <td className="px-2 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{item.material}</td>
                                            <td className="px-2 py-2 text-gray-500 max-w-36 truncate">{item.descripcion}</td>
                                            {/* Pedido SAP per item — editable */}
                                            <td className="px-2 py-2" onClick={e=>e.stopPropagation()}>
                                              <input
                                                className="border border-gray-200 rounded px-1.5 py-1 text-xs outline-none focus:border-blue-400 w-28 font-mono"
                                                defaultValue={item.numero_pedido??''}
                                                placeholder="pedido SAP"
                                                onBlur={e=>{if(e.target.value!==(item.numero_pedido??'')) {setItemEdit(item.id,'numero_pedido',e.target.value); saveItemFields(v.id,item.id)}}}
                                              />
                                            </td>
                                            <td className="px-2 py-2 text-right">{item.cantidad_aceptada??item.cantidad_ofertada??'—'}</td>
                                            {/* Precio editable */}
                                            <td className="px-2 py-2" onClick={e=>e.stopPropagation()}>
                                              <input
                                                className="border border-gray-200 rounded px-1.5 py-1 text-xs outline-none focus:border-teal-400 w-24 text-right"
                                                defaultValue={String(item.precio_aceptado??item.precio_oferta??'')}
                                                placeholder="precio"
                                                onBlur={e=>{if(e.target.value!==String(item.precio_aceptado??item.precio_oferta??'')) {setItemEdit(item.id,'precio',e.target.value); saveItemFields(v.id,item.id)}}}
                                              />
                                            </td>
                                            <td className="px-2 py-2 text-gray-500">{item.um??'—'}</td>
                                            <td className="px-2 py-2 whitespace-nowrap text-gray-500">{loteDisplay}</td>
                                            {/* Delivery — folio entrega salida */}
                                            <td className="px-2 py-2" onClick={e=>e.stopPropagation()}>
                                              <input
                                                className="border border-gray-200 rounded px-1.5 py-1 text-xs outline-none focus:border-teal-400 w-28 font-mono"
                                                defaultValue={item.folio_entrega_salida??''}
                                                placeholder="folio entrega"
                                                onBlur={e=>{if(e.target.value!==(item.folio_entrega_salida??'')) {setItemEdit(item.id,'folio_delivery',e.target.value); saveItemFields(v.id,item.id)}}}
                                              />
                                            </td>
                                            {/* Factura per item */}
                                            <td className="px-2 py-2" onClick={e=>e.stopPropagation()}>
                                              <input
                                                className="border border-gray-200 rounded px-1.5 py-1 text-xs outline-none focus:border-green-400 w-28 font-mono"
                                                defaultValue={item.numero_factura??''}
                                                placeholder="factura"
                                                onBlur={e=>{if(e.target.value!==(item.numero_factura??'')) {setItemEdit(item.id,'numero_factura',e.target.value); saveItemFields(v.id,item.id)}}}
                                              />
                                            </td>
                                            {/* Estatus */}
                                            <td className="px-2 py-2">
                                              <span className={`px-1.5 py-0.5 rounded-full font-medium ${ITEM_ESTATUS_COLOR[item.estatus]??'bg-gray-100 text-gray-500'}`}>
                                                {(item.estatus??'').replace(/_/g,' ')}
                                              </span>
                                            </td>
                                            {/* Disponibilidad toggle */}
                                            <td className="px-2 py-2" onClick={e=>e.stopPropagation()}>
                                              {!item.cedis_request_id && (
                                                <div className="flex gap-1">
                                                  <button
                                                    onClick={async()=>{
                                                      setItemDisp(p=>({...p,[item.id]:'disponible'}))
                                                      setItemEdit(item.id,'estatus','asignado_pedido')
                                                      await supabase.from('crm_offer_items').update({estatus:'asignado_pedido'}).eq('id',item.id)
                                                      setVentas(p=>p.map(vv=>vv.id!==v.id?vv:{...vv,crm_offer_items:(vv.crm_offer_items??[]).map((i:any)=>i.id!==item.id?i:{...i,estatus:'asignado_pedido'})}))
                                                    }}
                                                    className={`text-xs px-1.5 py-1 rounded border font-medium transition ${disp==='disponible'?'bg-teal-600 text-white border-teal-600':'bg-white text-gray-500 border-gray-200 hover:border-teal-300'}`}>
                                                    ✓ Disp.
                                                  </button>
                                                  <button
                                                    onClick={()=>{setItemDisp(p=>({...p,[item.id]:'solicitar_cedis'}));setItemCedisOpen(p=>({...p,[item.id]:!cedisOpen}))}}
                                                    className={`text-xs px-1.5 py-1 rounded border font-medium transition ${disp==='solicitar_cedis'?'bg-amber-500 text-white border-amber-500':'bg-white text-gray-500 border-gray-200 hover:border-amber-300'}`}>
                                                    📦 CEDIS
                                                  </button>
                                                </div>
                                              )}
                                              {item.cedis_request_id && (
                                                <button onClick={()=>nav('/cedis')}
                                                  className="text-xs text-amber-600 border border-amber-200 px-1.5 py-1 rounded hover:bg-amber-50">
                                                  📦 Ver CEDIS →
                                                </button>
                                              )}
                                            </td>
                                            <td className="px-2 py-2">
                                              {savingItems[v.id] && <span className="text-gray-400">⏳</span>}
                                            </td>
                                          </tr>
                                          {/* CEDIS inline form */}
                                          {cedisOpen && !item.cedis_request_id && (
                                            <tr key={`${item.id}-cedis`}>
                                              <td colSpan={13} className="bg-amber-50 border-b border-amber-100 px-4 py-3">
                                                <p className="text-xs font-semibold text-amber-700 mb-2">Solicitar traslado CEDIS — {item.material}</p>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                                                  {[
                                                    {label:'Centro Origen *', key:'centro_origen', ph:'1031'},
                                                    {label:'Almacén Origen', key:'almacen_origen', ph:'0001'},
                                                    {label:'Centro Destino *', key:'centro_destino', ph:'1030'},
                                                    {label:'Almacén Destino', key:'almacen_destino', ph:'0001'},
                                                    {label:'Cantidad *', key:'cantidad', ph:'0'},
                                                    {label:'UM', key:'um', ph:item.um??''},
                                                    {label:'Comentario', key:'comentarios', ph:''},
                                                  ].map(f=>(
                                                    <div key={f.key}>
                                                      <label className="text-xs text-amber-600 block mb-0.5">{f.label}</label>
                                                      <input
                                                        className="w-full border border-amber-200 rounded px-2 py-1 text-xs bg-white outline-none focus:border-amber-400"
                                                        value={cedisForm[f.key]??''}
                                                        placeholder={f.ph}
                                                        onChange={e=>setItemCedisForm(p=>({...p,[item.id]:{...(p[item.id]??{}),[f.key]:e.target.value}}))}
                                                      />
                                                    </div>
                                                  ))}
                                                </div>
                                                <div className="flex gap-2">
                                                  <button onClick={()=>saveCedisForItem(v,item)} disabled={savingCedis[item.id]}
                                                    className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium">
                                                    {savingCedis[item.id]?'Guardando...':'Crear solicitud CEDIS'}
                                                  </button>
                                                  <button onClick={()=>setItemCedisOpen(p=>({...p,[item.id]:false}))}
                                                    className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100">Cancelar</button>
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {v.notas && <p className="text-xs text-gray-500 mt-2 italic">📝 {v.notas}</p>}

                            {/* ── Pendiente vinculado ────────────────────── */}
                            {!archivada && (() => {
                              const task = v._task
                              const panelOpen = taskPanelOpen[v.id] ?? false
                              const tf = taskForm[v.id] ?? {}
                              const clientName = v.crm_clients?.razon_social ?? v.crm_clients?.solicitante ?? ''
                              const taskPending = task && task.status !== 'completado'

                              return (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  {/* Header */}
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                                      📌 Pendiente vinculado
                                      {taskPending && <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">⚠ Sin completar</span>}
                                    </p>
                                    {!v.task_id && !panelOpen && (
                                      <button onClick={() => setTaskPanelOpen(p=>({...p,[v.id]:true}))}
                                        className="text-xs border border-gray-200 text-gray-500 px-2.5 py-1 rounded-lg hover:bg-gray-100 font-medium">
                                        + Crear pendiente
                                      </button>
                                    )}
                                  </div>

                                  {/* Existing task */}
                                  {v.task_id && task && (
                                    <div className={`rounded-xl border px-3 py-2.5 flex items-start justify-between gap-3 ${
                                      taskPending ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
                                    }`}>
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-semibold ${taskPending ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                                          {task.title}
                                        </p>
                                        {task.description && (
                                          <p className="text-xs text-gray-500 mt-0.5 truncate">{task.description}</p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                            task.priority === 'alta' ? 'bg-red-100 text-red-600' :
                                            task.priority === 'media' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-gray-100 text-gray-500'
                                          }`}>{task.priority}</span>
                                          {task.due_date && (
                                            <span className="text-xs text-gray-400">Vence: {task.due_date}</span>
                                          )}
                                          {task.status === 'completado' && (
                                            <span className="text-xs text-green-600 font-medium">✓ Completado</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex gap-1 flex-shrink-0">
                                        {taskPending && (
                                          <button onClick={() => completeTask(v.id, task.id)}
                                            className="text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 font-medium whitespace-nowrap">
                                            ✓ Completar
                                          </button>
                                        )}
                                        <button onClick={() => nav(`/tasks/${task.id}`)}
                                          className="text-xs border border-gray-200 text-gray-500 px-2 py-1 rounded-lg hover:bg-gray-50">
                                          Ver →
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Loading task */}
                                  {v.task_id && !task && (
                                    <p className="text-xs text-gray-400">Cargando pendiente...</p>
                                  )}

                                  {/* No task yet */}
                                  {!v.task_id && !panelOpen && (
                                    <p className="text-xs text-gray-400 italic">Sin pendiente vinculado.</p>
                                  )}

                                  {/* Create form */}
                                  {panelOpen && !v.task_id && (
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                                      <div>
                                        <label className="text-xs text-gray-500 block mb-0.5">Título *</label>
                                        <input className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 bg-white"
                                          placeholder="Ej: Mandar carta canje al cliente"
                                          value={tf.title ?? ''}
                                          onChange={e=>setTaskForm(p=>({...p,[v.id]:{...tf,title:e.target.value}}))} />
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="text-xs text-gray-500 block mb-0.5">Prioridad</label>
                                          <select className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                                            value={tf.priority ?? 'media'}
                                            onChange={e=>setTaskForm(p=>({...p,[v.id]:{...tf,priority:e.target.value}}))}>
                                            <option value="alta">Alta</option>
                                            <option value="media">Media</option>
                                            <option value="baja">Baja</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="text-xs text-gray-500 block mb-0.5">Fecha límite</label>
                                          <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400 bg-white"
                                            value={tf.due_date ?? ''}
                                            onChange={e=>setTaskForm(p=>({...p,[v.id]:{...tf,due_date:e.target.value}}))} />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-xs text-gray-500 block mb-0.5">Descripción (opcional)</label>
                                        <input className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-teal-400 bg-white"
                                          placeholder="Detalles del pendiente..."
                                          value={tf.description ?? ''}
                                          onChange={e=>setTaskForm(p=>({...p,[v.id]:{...tf,description:e.target.value}}))} />
                                      </div>
                                      <div className="flex gap-2">
                                        <button onClick={() => createAndLinkTask(v.id, clientName)}
                                          disabled={savingTask[v.id]}
                                          className="text-xs bg-teal-600 text-white px-4 py-1.5 rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium">
                                          {savingTask[v.id] ? 'Guardando...' : '📌 Crear y vincular'}
                                        </button>
                                        <button onClick={() => setTaskPanelOpen(p=>({...p,[v.id]:false}))}
                                          className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-100">
                                          Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Warning on facturar if pending task */}
                                  {taskPending && (
                                    <div className="mt-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 text-xs text-orange-700 flex items-center gap-1.5">
                                      ⚠ Completa el pendiente antes de facturar, o factura de todas formas.
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Confirmar oferta → venta ──────────────────────────────────── */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-800">Confirmar materiales — Convertir a Venta</h2>
                <p className="text-xs text-gray-400 mt-0.5">{confirmModal.venta.crm_clients?.razon_social??confirmModal.venta.crm_clients?.solicitante}</p>
              </div>
              <button onClick={()=>setConfirmModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0 flex items-center gap-3">
              <label className="text-xs text-gray-500 whitespace-nowrap">Folio SAP general:</label>
              <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-mono flex-1 max-w-56 outline-none focus:border-teal-400"
                placeholder="Opcional — se asigna por pedido si hay varios"
                value={folioInput} onChange={e=>setFolioInput(e.target.value)} />
              <div className="flex gap-2 ml-auto">
                <button onClick={()=>toggleAll(true)} className="text-xs bg-green-50 border border-green-300 text-green-700 px-3 py-1.5 rounded-lg">✓ Todos</button>
                <button onClick={()=>toggleAll(false)} className="text-xs bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg">✗ Ninguno</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-2">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200">
                    {['✓','Material','Descripción','Cant.','Pedido SAP','Lote','Caducidad','📦 CEDIS'].map(h=>(
                      <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confirmModal.items.map((item:any) => {
                    const ci = confirmItems[item.id] ?? { aceptado:true, cantidad:'', lote:'', caducidad:'', comentario:'', requiereCedis:false, cedisOrigen:'', cedisAlmacenOrigen:'', cedisDestino:'', cedisAlmacenDestino:'' }
                    return (
                      <React.Fragment key={item.id}>
                        <tr className={`border-b border-gray-100 ${!ci.aceptado?'opacity-40':''}`}>
                          <td className="px-2 py-1.5">
                            <input type="checkbox" checked={ci.aceptado}
                              onChange={e=>setConfirmItems(p=>({...p,[item.id]:{...ci,aceptado:e.target.checked}}))} />
                          </td>
                          <td className="px-2 py-1.5 font-mono font-semibold">{item.material}</td>
                          <td className="px-2 py-1.5 text-gray-500 max-w-48 truncate">{item.descripcion}</td>
                          <td className="px-2 py-1.5">
                            <input className="w-20 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                              disabled={!ci.aceptado} placeholder={String(item.cantidad_aceptada??item.cantidad_ofertada??'')}
                              value={ci.cantidad} onChange={e=>setConfirmItems(p=>({...p,[item.id]:{...ci,cantidad:e.target.value}}))} />
                          </td>
                          <td className="px-2 py-1.5 font-mono text-blue-600 text-xs">{item.numero_pedido??'—'}</td>
                          <td className="px-2 py-1.5">
                            <input className="w-24 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                              disabled={!ci.aceptado} placeholder="Lote"
                              value={ci.lote} onChange={e=>setConfirmItems(p=>({...p,[item.id]:{...ci,lote:e.target.value}}))} />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="date" className="w-32 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                              disabled={!ci.aceptado}
                              value={ci.caducidad} onChange={e=>setConfirmItems(p=>({...p,[item.id]:{...ci,caducidad:e.target.value}}))} />
                          </td>
                          <td className="px-2 py-1.5">
                            {ci.aceptado && (
                              <button onClick={()=>setConfirmItems(p=>({...p,[item.id]:{...ci,requiereCedis:!ci.requiereCedis}}))}
                                className={`text-xs px-2 py-1 rounded border font-medium transition ${ci.requiereCedis?'bg-amber-500 text-white border-amber-500':'bg-white text-gray-400 border-gray-200 hover:border-amber-300'}`}>
                                📦 CEDIS
                              </button>
                            )}
                          </td>
                        </tr>
                        {ci.aceptado && ci.requiereCedis && (
                          <tr key={`${item.id}-cedis`} className="bg-amber-50 border-b border-amber-100">
                            <td colSpan={2} />
                            <td colSpan={6} className="px-2 py-2">
                              <div className="flex gap-2 flex-wrap items-center">
                                <span className="text-xs text-amber-700 font-semibold">Traslado:</span>
                                {[
                                  {label:'C.Origen',key:'cedisOrigen',w:'w-20'},
                                  {label:'Alm.Orig',key:'cedisAlmacenOrigen',w:'w-20'},
                                  {label:'→ C.Destino',key:'cedisDestino',w:'w-20'},
                                  {label:'Alm.Dest',key:'cedisAlmacenDestino',w:'w-20'},
                                ].map(f=>(
                                  <div key={f.key} className="flex items-center gap-1">
                                    <label className="text-xs text-gray-500">{f.label}</label>
                                    <input className={`${f.w} border border-amber-300 rounded px-2 py-1 text-xs outline-none focus:border-amber-500 bg-white`}
                                      placeholder={f.label.includes('C.')?'1031':'0001'}
                                      value={(ci as any)[f.key]}
                                      onChange={e=>setConfirmItems(p=>({...p,[item.id]:{...ci,[f.key]:e.target.value}}))} />
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between px-6 py-4 border-t border-gray-200 flex-shrink-0">
              <button onClick={()=>setConfirmModal(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">Cancelar</button>
              <button onClick={ejecutarConfirm} disabled={savingConfirm}
                className="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                {savingConfirm?'Guardando...':'Confirmar Venta →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Archivar / Facturar ──────────────────────────────────────── */}
      {archiveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">
              {archiveModal.accion==='archivar'?'🗄 Archivar oferta':'✅ Registrar facturación'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">{archiveModal.venta.crm_clients?.razon_social??archiveModal.venta.crm_clients?.solicitante}</p>
            {archiveModal.accion==='archivar' && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-700 mb-4">
                La oferta quedará archivada. Puedes verla en el filtro "🗄 Archivadas".
              </div>
            )}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">
                {archiveModal.accion==='archivar'?'Motivo (opcional)':'Número de factura (opcional — también editable por item)'}
              </label>
              <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-16 resize-none outline-none focus:border-gray-400"
                placeholder={archiveModal.accion==='archivar'?'Ej: Cliente no aceptó precio...':'Ej: FACT-2026-001'}
                value={archiveMotivo} onChange={e=>setArchiveMotivo(e.target.value)} autoFocus />
            </div>
            <div className="flex justify-between">
              <button onClick={()=>setArchiveModal(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">Volver</button>
              <button onClick={ejecutarArchive} disabled={savingArchive}
                className={`text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${archiveModal.accion==='archivar'?'bg-gray-600 hover:bg-gray-700':'bg-green-600 hover:bg-green-700'}`}>
                {savingArchive?'Guardando...':archiveModal.accion==='archivar'?'Archivar':'Facturar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
