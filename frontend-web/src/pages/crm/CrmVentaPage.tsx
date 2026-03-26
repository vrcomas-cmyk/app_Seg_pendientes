import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const SUGG_COLS = [
  { key: 'pedido',                 label: 'Pedido' },
  { key: 'fecha',                  label: 'Fecha' },
  { key: 'destinatario',           label: 'Destinatario' },
  { key: 'material_solicitado',    label: 'Mat. Solicitado' },
  { key: 'descripcion_solicitada', label: 'Descripción' },
  { key: 'cantidad_pedido',        label: 'Cant. Pedido' },
  { key: 'cantidad_pendiente',     label: 'Cant. Pendiente' },
  { key: 'consumo_promedio',       label: 'Consumo prom.' },
  { key: 'material_sugerido',      label: 'Mat. Sugerido' },
  { key: 'descripcion_sugerida',   label: 'Desc. Sugerida' },
  { key: 'centro_sugerido',        label: 'Centro Sug.' },
  { key: 'almacen_sugerido',       label: 'Alm. Sug.' },
  { key: 'disponible',             label: 'Disponible' },
  { key: 'lote',                   label: 'Lote' },
  { key: 'fecha_caducidad',        label: 'Caducidad' },
  { key: 'fuente',                 label: 'Fuente' },
  { key: 'centro_inv',             label: 'Centro (Inv)' },
  { key: 'inv_1030',               label: 'Inv 1030' },
  { key: 'inv_1031',               label: 'Inv 1031' },
  { key: 'inv_1032',               label: 'Inv 1032' },
  { key: 'inv_1060',               label: 'Inv 1060' },
  { key: 'cant_transito',          label: 'Cant. Tránsito' },
  { key: 'cant_transito_1030',     label: 'Tránsito 1030' },
  { key: 'cant_transito_1031',     label: 'Tránsito 1031' },
  { key: 'cant_transito_1032',     label: 'Tránsito 1032' },
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
  { key: 'material',                  label: 'Material' },
  { key: 'texto_material',            label: 'Descripción' },
  { key: 'destinatario',              label: 'Destinatario' },
  { key: 'ultima_compra_cliente',     label: 'Últ. Compra' },
  { key: 'consumo_promedio_mensual',  label: 'Cons. Prom/Mes' },
  { key: 'tendencia',                 label: 'Tendencia' },
  { key: 'material_sugerido',         label: 'Mat. Sugerido' },
  { key: 'descripcion_sugerida',      label: 'Desc. Sugerida' },
  { key: 'centro_sugerido',           label: 'Centro Sug.' },
  { key: 'almacen_sugerido',          label: 'Alm. Sug.' },
  { key: 'disponible',                label: 'Disponible' },
  { key: 'lote',                      label: 'Lote' },
  { key: 'fecha_caducidad',           label: 'Caducidad' },
  { key: 'fuente',                    label: 'Fuente' },
  { key: 'precio_unitario_ultima',    label: 'Precio Últ.' },
  { key: 'precio_prom',               label: 'Precio Prom.' },
  { key: 'centro_inv',                label: 'Centro (Inv)' },
  { key: 'inv_1030',                  label: 'Inv 1030' },
  { key: 'inv_1031',                  label: 'Inv 1031' },
  { key: 'inv_1032',                  label: 'Inv 1032' },
  { key: 'inv_1060',                  label: 'Inv 1060' },
  { key: 'cant_transito',             label: 'Cant. Tránsito' },
  { key: 'cant_transito_1030',        label: 'Tránsito 1030' },
  { key: 'cant_transito_1031',        label: 'Tránsito 1031' },
  { key: 'cant_transito_1032',        label: 'Tránsito 1032' },
  { key: 'disp_1031_1030',            label: 'Disp 1031-1030' },
  { key: 'disp_1031_1032',            label: 'Disp 1031-1032' },
  { key: 'inv_1001',                  label: 'Inv 1001' },
  { key: 'inv_1003',                  label: 'Inv 1003' },
  { key: 'inv_1004',                  label: 'Inv 1004' },
  { key: 'inv_1017',                  label: 'Inv 1017' },
  { key: 'inv_1018',                  label: 'Inv 1018' },
  { key: 'inv_1022',                  label: 'Inv 1022' },
  { key: 'inv_1036',                  label: 'Inv 1036' },
]

type TabType = 'sugerencias' | 'consumo'

export default function CrmVentaPage() {
  const { clientId } = useParams()
  const nav = useNavigate()

  const [client, setClient] = useState<any>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [selectedContact, setSelectedContact] = useState<string>('')
  const [showNewContact, setShowNewContact] = useState(false)
  const [newContact, setNewContact] = useState({ nombre: '', puesto: '', telefono: '', correo: '' })
  const [notasVisita, setNotasVisita] = useState('')

  const [tab, setTab] = useState<TabType>('sugerencias')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [consumption, setConsumption] = useState<any[]>([])
  const [prices, setPrices] = useState<Record<string, any>>({})
  const [acceptedMaterials, setAcceptedMaterials] = useState<Set<string>>(new Set())

  const [selected, setSelected] = useState<string[]>([])
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const load = useCallback(async () => {
    setLoading(true)
    const { data: c } = await supabase.from('crm_clients').select('*').eq('id', clientId).single()
    setClient(c)

    const { data: co } = await supabase.from('crm_contacts')
      .select('*').eq('client_id', clientId).order('nombre')
    setContacts(co ?? [])

    if (c?.solicitante) {
      const solicitante = c.solicitante

      // Cargar aceptados para excluir
      const [acceptedRes, offeredRes, sugRes] = await Promise.all([
        supabase.from('crm_accepted_suggestions').select('numero_pedido, material'),
        supabase.from('crm_offered_suggestions').select('source_id'),
        supabase.from('crm_suggestions')
          .select('*')
          .or(`solicitante.eq.${solicitante},destinatario.eq.${solicitante}`)
          .order('fecha', { ascending: true }),
      ])

      const accSet = new Set(
        (acceptedRes.data ?? []).map((a: any) => `${a.numero_pedido}__${a.material}`)
      )
      setAcceptedMaterials(accSet)

      const offeredIds = new Set(
        (offeredRes.data ?? []).map((a: any) => a.source_id).filter(Boolean)
      )

      const filteredSug = (sugRes.data ?? []).filter(s => {
        // Rechazado temporalmente
        if (s.rechazado_hasta && s.rechazado_hasta >= today) return false
        // Ya aceptado en oferta activa → en ventas
        if (accSet.has(`${s.pedido}__${s.material_sugerido}`)) return false
        if (accSet.has(`${s.pedido}__${s.material_solicitado}`)) return false
        // En negociación activa (oferta abierta)
        if (offeredIds.has(s.id)) return false
        return true
      })
      setSuggestions(filteredSug)

      // Consumo
      const { data: con } = await supabase.from('crm_consumption')
        .select('*')
        .or(`solicitante.eq.${solicitante},destinatario.eq.${solicitante}`)
        .order('ultima_compra_cliente', { ascending: true })

      const filteredCon = (con ?? []).filter(c =>
        !c.rechazado_hasta || c.rechazado_hasta < today
      )
      setConsumption(filteredCon)

      // Precios
      const mats = [...new Set([
        ...(sugRes.data ?? []).map(s => s.material_sugerido ?? s.material_solicitado),
        ...(con ?? []).map(c => c.material_sugerido ?? c.material),
      ].filter(Boolean))]

      if (mats.length > 0) {
        const { data: priceData } = await supabase.from('crm_prices')
          .select('*').in('material', mats)
        const priceMap: Record<string, any> = {}
        priceData?.forEach(p => { priceMap[p.material] = p })
        setPrices(priceMap)
      }
    }
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const saveNewContact = async () => {
    if (!newContact.nombre.trim()) return toast.error('El nombre es obligatorio')
    const { data: c } = await supabase.from('crm_contacts')
      .insert({ ...newContact, client_id: clientId }).select().single()
    if (c) {
      setContacts(prev => [...prev, c])
      setSelectedContact(c.id)
      setShowNewContact(false)
      setNewContact({ nombre: '', puesto: '', telefono: '', correo: '' })
      toast.success('Contacto agregado')
    }
  }

  const rejectMaterial = async (id: string, sourceType: TabType) => {
    if (!rejectComment.trim()) return toast.error('Agrega un comentario de rechazo')
    const rechazadoHasta = new Date()
    rechazadoHasta.setDate(rechazadoHasta.getDate() + 10)
    const table = sourceType === 'sugerencias' ? 'crm_suggestions' : 'crm_consumption'
    await supabase.from(table).update({
      fecha_rechazo:     today,
      comentario_rechazo: rejectComment,
      rechazado_hasta:   rechazadoHasta.toISOString().split('T')[0],
    }).eq('id', id)
    toast.success('Material rechazado por 10 días')
    setRejectId(null)
    setRejectComment('')
    load()
  }

  const generateOffer = async () => {
    if (selected.length === 0) return toast.error('Selecciona al menos un material')
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()

    const allData = tab === 'sugerencias' ? suggestions : consumption
    const selectedRows = allData.filter(r => selected.includes(r.id))

    const { data: offer, error } = await supabase.from('crm_offers').insert({
      client_id:  clientId,
      tipo:       tab === 'sugerencias' ? 'sugerencia' : 'consumo',
      estatus:    'borrador',
      notas:      notasVisita || null,
      created_by: user?.id,
    }).select().single()

    if (error || !offer) { toast.error('Error al crear oferta'); setCreating(false); return }

    const items = selectedRows.map(r => {
      const matCode = tab === 'sugerencias'
        ? (r.material_sugerido ?? r.material_solicitado)
        : (r.material_sugerido ?? r.material)
      const precio = prices[matCode]?.precio_oferta ?? r.precio ?? r.precio_unitario_ultima ?? null
      const lotes = r.lote ? [{ lote: r.lote, fecha_caducidad: r.fecha_caducidad ?? '' }] : []
      return {
        offer_id:          offer.id,
        source_type:       tab === 'sugerencias' ? 'sugerencia' : 'consumo',
        source_id:         r.id,
        material:          matCode,
        descripcion:       tab === 'sugerencias'
          ? (r.descripcion_sugerida ?? r.descripcion_solicitada)
          : (r.descripcion_sugerida ?? r.texto_material),
        lotes,
        cantidad_ofertada: tab === 'sugerencias' ? (r.cantidad_pendiente ?? r.cantidad_ofertar ?? null) : null,
        precio_oferta:     precio,
        um:                r.um ?? null,
        numero_pedido:     tab === 'sugerencias' ? (r.pedido ?? null) : null,
        pedido_existente:  tab === 'sugerencias',
        pedido_pendiente:  tab === 'consumo',
        centro_origen:     r.centro_sugerido ?? null,
        almacen_origen:    r.almacen_sugerido ?? null,
        centro_destino:    tab === 'sugerencias' ? (r.centro_pedido ?? null) : (r.centro ?? null),
        almacen_destino:   r.almacen ?? null,
        requiere_traslado: false,
        aceptado:          false,
        estatus:           'ofertado',
      }
    })

    await supabase.from('crm_offer_items').insert(items)

    // Guardar seguimiento si hay notas o contacto
    if (notasVisita || selectedContact) {
      await supabase.from('crm_followups').insert({
        client_id:   clientId,
        tipo:        'llamada',
        estatus:     'completado',
        descripcion: notasVisita || `Visita de venta — ${selectedRows.length} material(es) ofertados`,
        contact_id:  selectedContact || null,
        created_by:  user?.id,
      })
    }

    toast.success('Oferta generada')
    nav(`/crm/${clientId}/offer/${offer.id}`)
    setCreating(false)
  }

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const data = tab === 'sugerencias' ? suggestions : consumption
  const cols = tab === 'sugerencias' ? SUGG_COLS : CONS_COLS

  const getMaterial = (r: any) => tab === 'sugerencias'
    ? (r.material_sugerido ?? r.material_solicitado)
    : (r.material_sugerido ?? r.material)

  if (!client) return <div className="text-sm text-gray-400 p-6">Cargando...</div>

  return (
    <div className="max-w-full mx-auto px-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to={`/crm/${clientId}`} className="text-sm text-gray-400 hover:text-gray-600">
              ← {client.solicitante}
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Visita de venta</h1>
          </div>
          <p className="text-sm text-gray-400">{client.razon_social}</p>
        </div>
      </div>

      {/* Paso 1: Contacto */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-3">
          1. ¿Con quién hablas?
        </h2>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-gray-500 block mb-1">Contacto</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
              value={selectedContact} onChange={e => setSelectedContact(e.target.value)}>
              <option value="">— Sin contacto seleccionado —</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.puesto ? ` — ${c.puesto}` : ''}
                </option>
              ))}
            </select>
          </div>
          <button onClick={() => setShowNewContact(!showNewContact)}
            className="border border-teal-600 text-teal-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-50">
            + Nuevo contacto
          </button>
          <div className="flex-1 min-w-64">
            <label className="text-xs text-gray-500 block mb-1">Notas de la visita (opcional)</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Ej: Llamada de seguimiento de pendientes..."
              value={notasVisita} onChange={e => setNotasVisita(e.target.value)} />
          </div>
        </div>

        {showNewContact && (
          <div className="mt-3 bg-teal-50 border border-teal-200 rounded-xl p-4 grid grid-cols-4 gap-3">
            {[
              { label: 'Nombre *', key: 'nombre' },
              { label: 'Puesto', key: 'puesto' },
              { label: 'Teléfono', key: 'telefono' },
              { label: 'Correo', key: 'correo' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-teal-400"
                  value={newContact[f.key as keyof typeof newContact]}
                  onChange={e => setNewContact(x => ({ ...x, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div className="col-span-4 flex gap-2">
              <button onClick={saveNewContact}
                className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                Guardar contacto
              </button>
              <button onClick={() => setShowNewContact(false)}
                className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Paso 2: Materiales */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-sm font-bold text-gray-700">2. Materiales disponibles para ofrecer</h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => { setTab('sugerencias'); setSelected([]) }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${tab === 'sugerencias' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
              Sugerencias SAP ({suggestions.length})
            </button>
            <button onClick={() => { setTab('consumo'); setSelected([]) }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition ${tab === 'consumo' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
              Reporte Consumo ({consumption.length})
            </button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-400 p-6">Cargando materiales...</p>}

        {!loading && data.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-gray-400 text-sm">No hay materiales disponibles para ofrecer.</p>
            <p className="text-xs text-gray-300 mt-1">
              Los materiales rechazados recientemente o ya ofertados no aparecen aquí.
            </p>
          </div>
        )}

        {!loading && data.length > 0 && (
          <div className="overflow-auto" style={{ maxHeight: '60vh' }}>
            <table className="text-xs border-collapse" style={{ minWidth: 'max-content', width: '100%' }}>
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 border-b border-gray-200 w-8 sticky left-0 bg-gray-50 z-20"></th>
                  {cols.map(c => (
                    <th key={c.key}
                      className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  {/* Columnas de precio si existe en catálogo */}
                  <th className="px-3 py-2.5 text-left text-teal-600 font-semibold border-b border-gray-200 whitespace-nowrap bg-teal-50">
                    Precio Oferta
                  </th>
                  <th className="px-3 py-2.5 text-left text-teal-600 font-semibold border-b border-gray-200 whitespace-nowrap bg-teal-50">
                    Condición
                  </th>
                  <th className="px-3 py-2.5 text-left text-teal-600 font-semibold border-b border-gray-200 whitespace-nowrap bg-teal-50">
                    Oferta Adicional
                  </th>
                  <th className="px-3 py-2.5 border-b border-gray-200 w-24 sticky right-0 bg-gray-50">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map(row => {
                  const isSelected = selected.includes(row.id)
                  const isRejecting = rejectId === row.id
                  const matCode = getMaterial(row)
                  const price = prices[matCode]
                  const hasNote = row.fecha_rechazo && row.rechazado_hasta < today

                  return (
                    <>
                      <tr key={row.id}
                        className={`border-b border-gray-100 transition ${
                          isSelected ? 'bg-teal-50' :
                          isRejecting ? 'bg-red-50' : 'hover:bg-gray-50'
                        }`}>
                        <td className="px-3 py-2 text-center sticky left-0 bg-inherit" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleSelect(row.id)} />
                        </td>
                        {cols.map(c => (
                          <td key={c.key} className="px-3 py-2 whitespace-nowrap text-gray-700">
                            {c.key === 'tendencia' && row[c.key] ? (
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                row[c.key] === 'Alza' ? 'bg-green-100 text-green-700' :
                                row[c.key] === 'Baja' ? 'bg-red-100 text-red-600' :
                                'bg-gray-100 text-gray-500'
                              }`}>{row[c.key]}</span>
                            ) : row[c.key] !== null && row[c.key] !== undefined && row[c.key] !== ''
                              ? String(row[c.key])
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                        ))}
                        {/* Precio del catálogo */}
                        <td className="px-3 py-2 whitespace-nowrap bg-teal-50">
                          {price?.precio_oferta
                            ? <span className="font-semibold text-teal-700">${Number(price.precio_oferta).toLocaleString('es-MX')}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap bg-teal-50">
                          {price?.condicion
                            ? <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-medium">{price.condicion}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap bg-teal-50">
                          {price?.oferta_adicional
                            ? <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-medium">{price.oferta_adicional}</span>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 sticky right-0 bg-inherit">
                          {!isRejecting ? (
                            <button
                              onClick={() => { setRejectId(row.id); setRejectComment('') }}
                              className="text-xs bg-red-50 border border-red-200 text-red-500 px-2 py-1 rounded-lg hover:bg-red-100 whitespace-nowrap">
                              ✗ Rechazar
                            </button>
                          ) : (
                            <button onClick={() => setRejectId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600">
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Nota de oferta anterior */}
                      {hasNote && (
                        <tr key={`note-${row.id}`} className="bg-yellow-50">
                          <td colSpan={cols.length + 5} className="px-5 py-1.5 text-xs text-yellow-700">
                            ⚠️ Ya fue ofertado el {row.fecha_rechazo}: {row.comentario_rechazo}
                          </td>
                        </tr>
                      )}

                      {/* Formulario de rechazo inline */}
                      {isRejecting && (
                        <tr key={`reject-${row.id}`} className="bg-red-50">
                          <td colSpan={cols.length + 5} className="px-5 py-3 border-b border-red-100">
                            <div className="flex items-center gap-3">
                              <p className="text-xs font-semibold text-red-600 whitespace-nowrap">
                                Razón de rechazo:
                              </p>
                              <input
                                className="flex-1 border border-red-200 rounded-lg px-3 py-1.5 text-xs outline-none bg-white focus:border-red-400"
                                placeholder="Ej: No interesa por precio, sin presupuesto, ya tiene proveedor..."
                                value={rejectComment}
                                onChange={e => setRejectComment(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && rejectMaterial(row.id, tab)}
                                autoFocus />
                              <button
                                onClick={() => rejectMaterial(row.id, tab)}
                                disabled={!rejectComment.trim()}
                                className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50 whitespace-nowrap">
                                Confirmar rechazo
                              </button>
                              <button onClick={() => setRejectId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600 px-2">
                                Cancelar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barra de acción fija abajo */}
      {selected.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-xl px-6 py-4 flex justify-between items-center z-50">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {selected.length} material(es) seleccionado(s)
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {tab === 'sugerencias'
                ? `De ${new Set(data.filter(r => selected.includes(r.id)).map(r => r.pedido)).size} pedido(s) distintos`
                : 'Reporte de consumo'}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setSelected([])}
              className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
              Limpiar selección
            </button>
            <button onClick={generateOffer} disabled={creating}
              className="bg-teal-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
              {creating ? 'Generando...' : `Generar oferta con ${selected.length} material(es) →`}
            </button>
          </div>
        </div>
      )}

      {/* Espaciado para la barra fija */}
      {selected.length > 0 && <div className="h-24" />}
    </div>
  )
}
