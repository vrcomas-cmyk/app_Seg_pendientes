import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

const ITEM_ESTATUS = [
  { value: 'ofertado',          label: 'Ofertado',             color: 'bg-gray-100 text-gray-600' },
  { value: 'aceptado',          label: 'Aceptado',             color: 'bg-green-100 text-green-700' },
  { value: 'rechazado',         label: 'Rechazado',            color: 'bg-red-100 text-red-600' },
  { value: 'asignado_pedido',   label: 'Asignado a pedido',    color: 'bg-blue-100 text-blue-700' },
  { value: 'solicitud_cedis',   label: 'Solicitud CEDIS',      color: 'bg-yellow-100 text-yellow-700' },
  { value: 'en_transito',       label: 'En tránsito',          color: 'bg-orange-100 text-orange-700' },
  { value: 'recibido_cedis',    label: 'Recibido en CEDIS',    color: 'bg-teal-100 text-teal-700' },
  { value: 'ingresado_almacen', label: 'Ingresado almacén',    color: 'bg-purple-100 text-purple-700' },
  { value: 'disponible',        label: 'Disponible',           color: 'bg-indigo-100 text-indigo-700' },
  { value: 'surtido',           label: 'Surtido',              color: 'bg-cyan-100 text-cyan-700' },
  { value: 'facturado',         label: 'Facturado',            color: 'bg-green-200 text-green-800' },
  { value: 'cancelado',         label: 'Cancelado',            color: 'bg-gray-100 text-gray-400' },
]

const estatusColor = (e: string) => ITEM_ESTATUS.find(x => x.value === e)?.color ?? 'bg-gray-100 text-gray-500'
const estatusLabel = (e: string) => ITEM_ESTATUS.find(x => x.value === e)?.label ?? e

export default function CrmOfferPage() {
  const { clientId, offerId } = useParams()
  const [searchParams] = useSearchParams()
  const nav = useNavigate()
  const isNew = offerId === 'new'
  const sourceType = searchParams.get('source') as 'sugerencia' | 'consumo' | 'manual' | null
  const sourceIds = searchParams.get('ids')?.split(',').filter(Boolean) ?? []

  const [client, setClient] = useState<any>(null)
  const [offer, setOffer] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [savedOfferId, setSavedOfferId] = useState<string | null>(isNew ? null : offerId ?? null)
  const [saving, setSaving] = useState(false)
  const [offerNotes, setOfferNotes] = useState('')

  const [activeItem, setActiveItem] = useState<any>(null)
  const [itemHistory, setItemHistory] = useState<any[]>([])
  const [newEstatus, setNewEstatus] = useState('')
  const [newComentario, setNewComentario] = useState('')
  const [newFactura, setNewFactura] = useState('')
  const [showCedisForm, setShowCedisForm] = useState(false)
  const [cedisForm, setCedisForm] = useState({
    centro_origen: '', almacen_origen: '',
    centro_destino: '', almacen_destino: '',
    cantidad: '', um: '', comentarios: '',
  })

  const [showManualForm, setShowManualForm] = useState(false)
  const [manualForm, setManualForm] = useState({
    material: '', descripcion: '', cantidad_ofertada: '',
    precio_oferta: '', um: '', numero_pedido: '',
    pedido_existente: false, pedido_pendiente: false,
    centro_origen: '', almacen_origen: '',
    centro_destino: '', almacen_destino: '',
  })
  const [manualLotes, setManualLotes] = useState([{ lote: '', fecha_caducidad: '' }])

  useEffect(() => {
    supabase.from('crm_clients').select('*').eq('id', clientId).single()
      .then(({ data }) => setClient(data))

    if (!isNew && offerId) {
      loadOffer(offerId)
    } else if (isNew && sourceIds.length > 0 && sourceType) {
      loadSourceItems()
    }
  }, [])

  const loadOffer = async (id: string) => {
    const { data: o } = await supabase.from('crm_offers').select('*').eq('id', id).single()
    setOffer(o); setOfferNotes(o?.notas ?? '')
    const { data: its } = await supabase.from('crm_offer_items').select('*').eq('offer_id', id)
    // Parsear lotes que vienen como string JSON de la DB
    setItems((its ?? []).map(it => ({
      ...it,
      lotes: typeof it.lotes === 'string' ? JSON.parse(it.lotes) : (it.lotes ?? []),
    })))
  }

  const loadSourceItems = async () => {
    if (!sourceType || !sourceIds.length) return
    const table = sourceType === 'sugerencia' ? 'crm_suggestions' : 'crm_consumption'
    const { data } = await supabase.from(table).select('*').in('id', sourceIds)
    if (!data) return

    // Buscar UM en catálogo para cada material
    const materialCodes = [...new Set(data.map(r =>
      r.material_sugerido ?? r.material_solicitado ?? r.material ?? ''
    ).filter(Boolean))]

    const umMap: Record<string, string> = {}
    if (materialCodes.length > 0) {
      const { data: catMats } = await supabase.from('catalog_materials')
        .select('material, um').in('material', materialCodes)
      catMats?.forEach(m => { if (m.um) umMap[m.material] = m.um })
    }

    const preItems = data.map(r => {
      const matCode = r.material_sugerido ?? r.material_solicitado ?? r.material ?? ''
      const lotes = r.lote
        ? [{ lote: String(r.lote), fecha_caducidad: r.fecha_caducidad ?? '' }]
        : []
      return {
        _tempId:           r.id,
        source_type:       sourceType,
        source_id:         r.id,
        material:          matCode,
        descripcion:       r.descripcion_sugerida ?? r.descripcion_solicitada ?? r.texto_material ?? '',
        cantidad_ofertada: sourceType === 'sugerencia'
          ? String(r.cantidad_pendiente ?? r.cantidad_ofertar ?? '')
          : '',
        precio_oferta:     String(r.precio ?? r.precio_unitario_ultima ?? ''),
        um:                umMap[matCode] ?? r.um ?? '',
        numero_pedido:     sourceType === 'sugerencia' ? String(r.pedido ?? '') : '',
        pedido_existente:  sourceType === 'sugerencia',
        pedido_pendiente:  sourceType === 'consumo',
        lotes,
        centro_origen:     String(r.centro_sugerido ?? ''),
        almacen_origen:    String(r.almacen_sugerido ?? ''),
        centro_destino:    String(r.centro_pedido ?? r.centro ?? ''),
        almacen_destino:   String(r.almacen ?? ''),
        requiere_traslado: false,
        aceptado:          false,
        estatus:           'ofertado',
      }
    })
    setItems(preItems)
  }

  const createOffer = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: o, error } = await supabase.from('crm_offers').insert({
      client_id: clientId, tipo: sourceType ?? 'manual',
      estatus: 'borrador', notas: offerNotes || null, created_by: user?.id,
    }).select().single()
    if (error || !o) { toast.error(error?.message ?? 'Error'); return null }
    return o
  }

  const saveOffer = async () => {
    if (items.length === 0) return toast.error('Agrega al menos un material')
    setSaving(true)

    let oid = savedOfferId
    if (!oid) {
      const o = await createOffer()
      if (!o) { setSaving(false); return }
      oid = o.id
      setSavedOfferId(oid)
    } else {
      await supabase.from('crm_offers').update({ notas: offerNotes }).eq('id', oid)
    }

    const newItems = items.filter(it => !it.id)
    if (newItems.length > 0) {
      const { data: inserted, error } = await supabase.from('crm_offer_items').insert(
        newItems.map(it => ({
          offer_id:          oid,
          source_type:       it.source_type ?? 'manual',
          source_id:         it.source_id ?? null,
          material:          it.material,
          descripcion:       it.descripcion || null,
          // Guardar lotes correctamente como JSONB
          lotes:             it.lotes && it.lotes.length > 0
                               ? it.lotes.filter((l: any) => l.lote)
                               : [],
          cantidad_ofertada: parseFloat(it.cantidad_ofertada) || null,
          precio_oferta:     parseFloat(it.precio_oferta) || null,
          um:                it.um || null,
          numero_pedido:     it.numero_pedido || null,
          pedido_existente:  it.pedido_existente ?? false,
          pedido_pendiente:  it.pedido_pendiente ?? false,
          centro_origen:     it.centro_origen || null,
          almacen_origen:    it.almacen_origen || null,
          centro_destino:    it.centro_destino || null,
          almacen_destino:   it.almacen_destino || null,
          requiere_traslado: it.requiere_traslado ?? false,
          aceptado:          false,
          estatus:           'ofertado',
        }))
      ).select()

      if (error) { toast.error(error.message); setSaving(false); return }

      // Crear pedido CRM automáticamente para items con número de pedido
      const { data: { user } } = await supabase.auth.getUser()
      const pedidosUnicos = [...new Set(
        newItems.filter(it => it.numero_pedido).map(it => it.numero_pedido)
      )]
      for (const numPedido of pedidosUnicos) {
        const { data: exists } = await supabase.from('crm_orders')
          .select('id').eq('client_id', clientId).eq('numero_pedido', numPedido).single()
        if (!exists) {
          await supabase.from('crm_orders').insert({
            client_id:     clientId,
            numero_pedido: numPedido,
            followup_id:   null,
            estatus:       'generado',
            comentarios:   `Generado desde oferta CRM`,
            created_by:    user?.id,
          })
        }
      }

      toast.success('Oferta guardada')
      if (inserted) {
        const parsedInserted = inserted.map(it => ({
          ...it,
          lotes: typeof it.lotes === 'string' ? JSON.parse(it.lotes) : (it.lotes ?? []),
        }))
        setItems(prev => [...prev.filter(it => it.id), ...parsedInserted])
      }
      nav(`/crm/${clientId}/offer/${oid}`, { replace: true })
    } else {
      toast.success('Oferta actualizada')
    }
    setSaving(false)
  }

  const toggleAceptado = async (item: any) => {
    if (!item.id) return
    const nuevoEstatus = !item.aceptado ? 'aceptado' : 'ofertado'
    const { data: updated } = await supabase.from('crm_offer_items')
      .update({ aceptado: !item.aceptado, estatus: nuevoEstatus })
      .eq('id', item.id).select().single()
    if (updated) {
      const parsed = { ...updated, lotes: typeof updated.lotes === 'string' ? JSON.parse(updated.lotes) : (updated.lotes ?? []) }
      setItems(prev => prev.map(it => it.id === item.id ? parsed : it))
      if (activeItem?.id === item.id) setActiveItem(parsed)
    }
  }

  const updateItemField = (id: string, field: string, value: any) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
    if (activeItem?.id === id) setActiveItem((prev: any) => ({ ...prev, [field]: value }))
  }

  const saveItemField = async (item: any, field: string) => {
    if (!item.id) return
    await supabase.from('crm_offer_items').update({ [field]: item[field] }).eq('id', item.id)
  }

  const loadItemHistory = async (item: any) => {
    const parsedItem = {
      ...item,
      lotes: typeof item.lotes === 'string' ? JSON.parse(item.lotes) : (item.lotes ?? []),
    }
    setActiveItem(parsedItem)
    setNewEstatus(parsedItem.estatus)
    setNewComentario(''); setNewFactura(parsedItem.numero_factura ?? '')
    setCedisForm({
      centro_origen:   parsedItem.centro_origen ?? '',
      almacen_origen:  parsedItem.almacen_origen ?? '',
      centro_destino:  parsedItem.centro_destino ?? '',
      almacen_destino: parsedItem.almacen_destino ?? '',
      cantidad:        String(parsedItem.cantidad_ofertada ?? ''),
      um:              parsedItem.um ?? '',
      comentarios:     '',
    })
    if (item.id) {
      const { data } = await supabase.from('crm_offer_item_history')
        .select('*, users:created_by(full_name,email)')
        .eq('item_id', item.id).order('created_at', { ascending: false })
      setItemHistory(data ?? [])
    }
  }

  const updateItemEstatus = async () => {
    if (!activeItem?.id) return
    const { data: { user } } = await supabase.auth.getUser()
    const updates: any = { estatus: newEstatus }
    if (newFactura) {
      updates.numero_factura = newFactura
      updates.fecha_factura = new Date().toISOString().split('T')[0]
    }
    await supabase.from('crm_offer_items').update(updates).eq('id', activeItem.id)
    await supabase.from('crm_offer_item_history').insert({
      item_id: activeItem.id, estatus_anterior: activeItem.estatus,
      estatus_nuevo: newEstatus, comentario: newComentario || null, created_by: user?.id,
    })
    toast.success('Estatus actualizado')
    setNewComentario(''); setNewFactura('')
    const { data: updated } = await supabase.from('crm_offer_items').select('*').eq('id', activeItem.id).single()
    if (updated) {
      const parsed = { ...updated, lotes: typeof updated.lotes === 'string' ? JSON.parse(updated.lotes) : (updated.lotes ?? []) }
      setActiveItem(parsed)
      setItems(prev => prev.map(it => it.id === updated.id ? parsed : it))
    }
    const { data: hist } = await supabase.from('crm_offer_item_history')
      .select('*, users:created_by(full_name,email)')
      .eq('item_id', activeItem.id).order('created_at', { ascending: false })
    setItemHistory(hist ?? [])
  }

  const saveCedisRequest = async () => {
    if (!activeItem?.id) return
    if (!cedisForm.centro_origen || !cedisForm.centro_destino || !cedisForm.cantidad)
      return toast.error('Centro origen, destino y cantidad son obligatorios')

    const { data: { user } } = await supabase.auth.getUser()
    const lotes = activeItem.lotes ?? []
    const primerLote = lotes[0] ?? {}

    let orderId = null
    const pedidoNum = activeItem.numero_pedido ?? `OFR-${savedOfferId?.slice(0,8)}`
    const { data: existingOrder } = await supabase.from('crm_orders')
      .select('id').eq('client_id', clientId).eq('numero_pedido', pedidoNum).single()
    if (existingOrder) {
      orderId = existingOrder.id
    } else {
      const { data: newOrder } = await supabase.from('crm_orders').insert({
        client_id: clientId, numero_pedido: pedidoNum,
        estatus: 'en_proceso', comentarios: `Oferta CRM — ${activeItem.material}`,
        created_by: user?.id,
      }).select('id').single()
      orderId = newOrder?.id
    }

    const autoComment = cedisForm.comentarios ||
      `Pedido ${activeItem.numero_pedido ?? 'pendiente'} / ${activeItem.source_type ?? 'manual'}`

    const { data: cedisReq } = await supabase.from('crm_cedis_requests').insert({
      order_id: orderId, fecha_solicitud: new Date().toISOString().split('T')[0],
      centro_origen:   cedisForm.centro_origen, almacen_origen:  cedisForm.almacen_origen || null,
      centro_destino:  cedisForm.centro_destino, almacen_destino: cedisForm.almacen_destino || null,
      codigo:      activeItem.material, descripcion: activeItem.descripcion,
      cantidad:    parseFloat(cedisForm.cantidad), um: cedisForm.um || null,
      lote:        primerLote.lote || null, fecha_caducidad: primerLote.fecha_caducidad || null,
      comentarios: autoComment, estatus: 'solicitado', created_by: user?.id,
    }).select('id').single()

    if (cedisReq) {
      await supabase.from('crm_cedis_history').insert({
        request_id: cedisReq.id, estatus_nuevo: 'solicitado',
        comentario: 'Creado desde oferta CRM', created_by: user?.id,
      })
      await supabase.from('crm_offer_items').update({
        cedis_request_id: cedisReq.id, requiere_traslado: true,
        estatus: 'solicitud_cedis',
        centro_origen: cedisForm.centro_origen, almacen_origen: cedisForm.almacen_origen,
        centro_destino: cedisForm.centro_destino, almacen_destino: cedisForm.almacen_destino,
      }).eq('id', activeItem.id)
      await supabase.from('crm_offer_item_history').insert({
        item_id: activeItem.id, estatus_anterior: activeItem.estatus,
        estatus_nuevo: 'solicitud_cedis',
        comentario: `CEDIS: ${cedisForm.centro_origen} → ${cedisForm.centro_destino}`,
        created_by: user?.id,
      })
      toast.success('Requerimiento CEDIS generado')
      setShowCedisForm(false)
      loadItemHistory({ ...activeItem, estatus: 'solicitud_cedis', cedis_request_id: cedisReq.id })
      const { data: its } = await supabase.from('crm_offer_items').select('*').eq('offer_id', savedOfferId)
      setItems((its ?? []).map(it => ({
        ...it,
        lotes: typeof it.lotes === 'string' ? JSON.parse(it.lotes) : (it.lotes ?? []),
      })))
    }
  }

  // Formato de traslado — incluye lote, caducidad y UM del item
  const generateTransferFormat = (item: any) => {
    const lotes = typeof item.lotes === 'string' ? JSON.parse(item.lotes) : (item.lotes ?? [])
    const lote = lotes[0] ?? {}
    return {
      'Fecha solicitud': new Date().toLocaleDateString('es-MX'),
      'Centro Origen':   item.centro_origen ?? '',
      'Almacén Origen':  item.almacen_origen ?? '',
      'Centro Destino':  item.centro_destino ?? '',
      'Almacén Destino': item.almacen_destino ?? '',
      'Código':          item.material ?? '',
      'Descripción':     item.descripcion ?? '',
      'Cantidad':        item.cantidad_aceptada ?? item.cantidad_ofertada ?? '',
      'UM':              item.um ?? '',
      'Lote':            lote.lote ?? '',
      'Fecha Caducidad': lote.fecha_caducidad ?? '',
      'No.UD':           '',
      'Delivery':        '',
      'Estatus':         '',
      'Comentarios':     `Pedido ${item.numero_pedido ?? 'pendiente'} / ${item.source_type ?? 'manual'}`,
    }
  }

  const copyTransferFormat = (item: any) => {
    const fmt = generateTransferFormat(item)
    const headers = Object.keys(fmt).join('\t')
    const values = Object.values(fmt).join('\t')
    navigator.clipboard.writeText(headers + '\n' + values)
    toast.success('Formato copiado al portapapeles')
  }

  const downloadTransferFormat = (item: any) => {
    const fmt = generateTransferFormat(item)
    const ws = XLSX.utils.json_to_sheet([fmt])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Traslado')
    XLSX.writeFile(wb, `traslado_${item.material}_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const addManualItem = async () => {
    if (!manualForm.material) return toast.error('El material es obligatorio')

    // Buscar UM en catálogo si no se capturó
    let um = manualForm.um
    if (!um) {
      const { data: cat } = await supabase.from('catalog_materials')
        .select('um').eq('material', manualForm.material).single()
      um = cat?.um ?? ''
    }

    setItems(prev => [...prev, {
      _tempId:           Date.now().toString(),
      source_type:       'manual',
      material:          manualForm.material,
      descripcion:       manualForm.descripcion || null,
      cantidad_ofertada: manualForm.cantidad_ofertada,
      precio_oferta:     manualForm.precio_oferta,
      um,
      numero_pedido:     manualForm.numero_pedido || null,
      pedido_existente:  manualForm.pedido_existente,
      pedido_pendiente:  manualForm.pedido_pendiente,
      lotes:             manualLotes.filter(l => l.lote),
      centro_origen:     manualForm.centro_origen || null,
      almacen_origen:    manualForm.almacen_origen || null,
      centro_destino:    manualForm.centro_destino || null,
      almacen_destino:   manualForm.almacen_destino || null,
      requiere_traslado: false, aceptado: false, estatus: 'ofertado',
    }])
    setManualForm({ material:'', descripcion:'', cantidad_ofertada:'', precio_oferta:'', um:'',
      numero_pedido:'', pedido_existente:false, pedido_pendiente:false,
      centro_origen:'', almacen_origen:'', centro_destino:'', almacen_destino:'' })
    setManualLotes([{ lote:'', fecha_caducidad:'' }])
    setShowManualForm(false)
    toast.success('Material agregado')
  }

  return (
    <div className="max-w-6xl mx-auto">
      <button onClick={() => nav(`/crm/${clientId}`)}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver a {client?.solicitante}
      </button>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {isNew && !savedOfferId ? 'Nueva oferta' : 'Oferta'}
          </h1>
          {offer && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {offer.tipo} · {offer.estatus}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowManualForm(true)}
            className="border border-teal-600 text-teal-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-50">
            + Material manual
          </button>
          {items.length > 0 && (
            <button onClick={saveOffer} disabled={saving}
              className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {saving ? 'Guardando...' : savedOfferId ? 'Actualizar' : 'Guardar oferta'}
            </button>
          )}
          {savedOfferId && (
            <>
              <button onClick={async () => {
                if (!window.confirm('¿Cerrar esta oferta? Quedará archivada.')) return
                await supabase.from('crm_offers').update({ estatus: 'cerrada' }).eq('id', savedOfferId)
                toast.success('Oferta cerrada')
                nav(`/crm/${clientId}`)
              }} className="border border-green-500 text-green-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50">
                ✅ Cerrar oferta
              </button>
              <button onClick={async () => {
                if (!window.confirm('¿Cancelar esta oferta? Las sugerencias volverán a aparecer.')) return
                await supabase.from('crm_offers').update({ estatus: 'cancelado' }).eq('id', savedOfferId)
                toast.success('Oferta cancelada — sugerencias restauradas')
                nav(`/crm/${clientId}`)
              }} className="border border-red-300 text-red-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50">
                Cancelar oferta
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <input className="w-full text-sm outline-none text-gray-600 placeholder-gray-300"
          placeholder="Notas de la oferta (opcional)..."
          value={offerNotes} onChange={e => setOfferNotes(e.target.value)} />
      </div>

      {/* Formulario material manual */}
      {showManualForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="font-semibold text-gray-700 mb-4">Agregar material manualmente</h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'Material / Código *', key: 'material' },
              { label: 'Descripción', key: 'descripcion' },
              { label: 'UM (se busca en catálogo automáticamente)', key: 'um' },
              { label: 'Cantidad ofertada', key: 'cantidad_ofertada', type: 'number' },
              { label: 'Precio de oferta', key: 'precio_oferta', type: 'number' },
              { label: 'Número de pedido', key: 'numero_pedido' },
              { label: 'Centro origen', key: 'centro_origen' },
              { label: 'Almacén origen', key: 'almacen_origen' },
              { label: 'Centro destino', key: 'centro_destino' },
              { label: 'Almacén destino', key: 'almacen_destino' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                <input type={f.type ?? 'text'}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={manualForm[f.key as keyof typeof manualForm] as string}
                  onChange={e => setManualForm(x => ({ ...x, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="flex gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={manualForm.pedido_existente}
                onChange={e => setManualForm(x => ({ ...x, pedido_existente: e.target.checked, pedido_pendiente: false }))} />
              Pedido ya existe en SAP
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={manualForm.pedido_pendiente}
                onChange={e => setManualForm(x => ({ ...x, pedido_pendiente: e.target.checked, pedido_existente: false }))} />
              Número de pedido se asignará después
            </label>
          </div>
          <div className="mb-3">
            <p className="text-xs font-semibold text-gray-500 mb-2">Lotes (opcional)</p>
            {manualLotes.map((lote, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input placeholder="Lote"
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none flex-1"
                  value={lote.lote}
                  onChange={e => setManualLotes(ls => ls.map((l, j) => j === i ? { ...l, lote: e.target.value } : l))} />
                <input type="date"
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none"
                  value={lote.fecha_caducidad}
                  onChange={e => setManualLotes(ls => ls.map((l, j) => j === i ? { ...l, fecha_caducidad: e.target.value } : l))} />
                {manualLotes.length > 1 && (
                  <button onClick={() => setManualLotes(ls => ls.filter((_,j) => j !== i))}
                    className="text-red-400 hover:text-red-600 px-2">×</button>
                )}
              </div>
            ))}
            <button onClick={() => setManualLotes(ls => [...ls, { lote: '', fecha_caducidad: '' }])}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              + Agregar otro lote
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={addManualItem} disabled={!manualForm.material}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              Agregar material
            </button>
            <button onClick={() => setShowManualForm(false)}
              className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Tabla de items */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {items.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-gray-400 text-sm">No hay materiales en esta oferta.</p>
                <button onClick={() => setShowManualForm(true)}
                  className="mt-3 text-sm text-teal-600 hover:text-teal-700 font-medium">
                  + Agregar material manual
                </button>
              </div>
            )}
            {items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {['✓','Material','Descripción','Cant.','Precio','UM','Pedido','Lotes','Estatus','Traslado',''].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const lotes = typeof item.lotes === 'string' ? JSON.parse(item.lotes) : (item.lotes ?? [])
                      const isActive = activeItem?.id === item.id || activeItem?._tempId === item._tempId
                      return (
                        <tr key={item.id ?? item._tempId ?? i}
                          className={`border-b border-gray-100 cursor-pointer ${isActive ? 'bg-teal-50' : 'hover:bg-gray-50'}`}
                          onClick={() => item.id && loadItemHistory(item)}>
                          <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                            {item.id ? (
                              <button onClick={() => toggleAceptado(item)}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                                  item.aceptado ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                                }`}>
                                {item.aceptado && <span className="text-xs">✓</span>}
                              </button>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{item.material}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{item.descripcion}</td>
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            {item.id ? (
                              <input type="number"
                                className="w-20 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                                value={item.cantidad_ofertada ?? ''}
                                onChange={e => updateItemField(item.id, 'cantidad_ofertada', e.target.value)}
                                onBlur={() => saveItemField(item, 'cantidad_ofertada')} />
                            ) : item.cantidad_ofertada}
                          </td>
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            {item.id ? (
                              <input type="number"
                                className="w-24 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                                value={item.precio_oferta ?? ''}
                                onChange={e => updateItemField(item.id, 'precio_oferta', e.target.value)}
                                onBlur={() => saveItemField(item, 'precio_oferta')} />
                            ) : item.precio_oferta ? `$${Number(item.precio_oferta).toLocaleString('es-MX')}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{item.um ?? '—'}</td>
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            {item.id ? (
                              <input
                                className="w-28 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                                value={item.numero_pedido ?? ''}
                                placeholder={item.pedido_pendiente ? 'Pendiente' : ''}
                                onChange={e => updateItemField(item.id, 'numero_pedido', e.target.value)}
                                onBlur={() => saveItemField(item, 'numero_pedido')} />
                            ) : item.numero_pedido || (item.pedido_pendiente ? <span className="text-gray-300 italic">pendiente</span> : '—')}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {lotes.length > 0
                              ? lotes.map((l: any) => `${l.lote}${l.fecha_caducidad ? ` (${l.fecha_caducidad})` : ''}`).join(', ')
                              : '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estatusColor(item.estatus)}`}>
                              {estatusLabel(item.estatus)}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            {item.id && item.aceptado && (
                              <div className="flex gap-1">
                                <button onClick={() => copyTransferFormat(item)} title="Copiar"
                                  className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200">📋</button>
                                <button onClick={() => downloadTransferFormat(item)} title="Descargar .xlsx"
                                  className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200">⬇️</button>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                            {!item.id && (
                              <button onClick={() => setItems(prev => prev.filter(it => it._tempId !== item._tempId))}
                                className="text-gray-300 hover:text-red-400 text-base">×</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Panel de seguimiento */}
        {activeItem && (
          <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200"
            style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 bg-gray-50 sticky top-0">
              <div>
                <p className="text-sm font-bold text-gray-800">{activeItem.material}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estatusColor(activeItem.estatus)}`}>
                  {estatusLabel(activeItem.estatus)}
                </span>
              </div>
              <button onClick={() => setActiveItem(null)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {/* Info del item */}
              <div className="space-y-1">
                <p><span className="text-gray-400">UM:</span> <span className="font-medium">{activeItem.um ?? '—'}</span></p>
                <p><span className="text-gray-400">Pedido:</span> <span className="font-medium">{activeItem.numero_pedido ?? (activeItem.pedido_pendiente ? 'Pendiente de asignar' : '—')}</span></p>
                {(activeItem.lotes ?? []).length > 0 && (
                  <div>
                    <p className="text-gray-400 mb-1">Lotes:</p>
                    {(activeItem.lotes ?? []).map((l: any, i: number) => (
                      <p key={i} className="font-medium">
                        {l.lote}{l.fecha_caducidad ? ` · Cad: ${l.fecha_caducidad}` : ''}
                      </p>
                    ))}
                  </div>
                )}
                {activeItem.numero_factura && (
                  <p><span className="text-gray-400">Factura:</span> <span className="font-medium text-green-700">{activeItem.numero_factura}</span></p>
                )}
              </div>

              {/* Acciones */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700">Acciones</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeItem.aceptado && (
                    <>
                      <button onClick={() => setShowCedisForm(!showCedisForm)}
                        className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-600">
                        🚚 Solicitar traslado CEDIS
                      </button>
                      <button onClick={() => copyTransferFormat(activeItem)}
                        className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
                        📋 Copiar formato
                      </button>
                      <button onClick={() => downloadTransferFormat(activeItem)}
                        className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-200">
                        ⬇️ Descargar .xlsx
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* CEDIS form */}
              {showCedisForm && (
                <div className="border border-amber-200 rounded-xl p-3 bg-amber-50 space-y-2">
                  <p className="text-xs font-semibold text-amber-700">Solicitud de traslado CEDIS</p>
                  {[
                    { label: 'Centro Origen *', key: 'centro_origen' },
                    { label: 'Almacén Origen', key: 'almacen_origen' },
                    { label: 'Centro Destino *', key: 'centro_destino' },
                    { label: 'Almacén Destino', key: 'almacen_destino' },
                    { label: 'Cantidad *', key: 'cantidad', type: 'number' },
                    { label: 'UM', key: 'um' },
                    { label: 'Comentario', key: 'comentarios' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="text-gray-500 block mb-0.5">{f.label}</label>
                      <input type={f.type ?? 'text'}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white outline-none"
                        value={cedisForm[f.key as keyof typeof cedisForm]}
                        onChange={e => setCedisForm(x => ({ ...x, [f.key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button onClick={saveCedisRequest}
                      className="bg-amber-500 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-600">
                      Crear solicitud
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
                <p className="text-xs font-semibold text-gray-700 mb-2">Actualizar estatus</p>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 outline-none"
                  value={newEstatus} onChange={e => setNewEstatus(e.target.value)}>
                  {ITEM_ESTATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {newEstatus === 'facturado' && (
                  <input placeholder="Número de factura"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-teal-400"
                    value={newFactura} onChange={e => setNewFactura(e.target.value)} />
                )}
                <textarea placeholder="Comentario (opcional)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-14 resize-none outline-none focus:border-teal-400 mb-2"
                  value={newComentario} onChange={e => setNewComentario(e.target.value)} />
                <button onClick={updateItemEstatus}
                  className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                  Guardar
                </button>
              </div>

              {/* Historial */}
              {itemHistory.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Historial</p>
                  {itemHistory.map(h => (
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
