import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, getCachedUser } from '../../lib/supabase'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'

function MaterialInput({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void
  onSelect: (m: string, d: string, um: string, precio: string) => void
}) {
  const [sugs, setSugs] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  const updatePos = () => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const above = window.innerHeight - r.bottom < 220 && r.top > 220
    setPos({ top: above ? r.top - 220 : r.bottom + 2, left: r.left, width: Math.max(r.width, 320) })
  }

  const search = async (q: string) => {
    onChange(q)
    if (q.length < 2) { setSugs([]); setOpen(false); return }
    const { data } = await supabase.from('catalog_materials')
      .select('material, descripcion, um, precio_unitario').ilike('material', `%${q}%`).limit(10)
    setSugs(data ?? []); updatePos(); setOpen(true)
  }

  return (
    <div className="relative">
      <input ref={inputRef} value={value} onChange={e => search(e.target.value)}
        onFocus={() => { if (value.length >= 2) { updatePos(); setOpen(true) } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
        placeholder="Código" />
      {open && sugs.length > 0 && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
          maxHeight: 220, overflowY: 'auto', background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {sugs.map(s => (
            <button key={s.material} type="button"
              onMouseDown={() => { onSelect(s.material, s.descripcion ?? '', s.um ?? '', String(s.precio_unitario ?? '')); setOpen(false) }}
              style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', padding: '7px 12px',
                fontSize: 12, background: 'transparent', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
              onMouseOver={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, minWidth: 72 }}>{s.material}</span>
              <span style={{ color: '#6b7280', flex: 1 }}>{s.descripcion}</span>
              {s.um && <span style={{ color: '#9ca3af', flexShrink: 0 }}>{s.um}</span>}
            </button>
          ))}
        </div>, document.body
      )}
    </div>
  )
}

function ClienteInput({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void
  onSelect: (id: string, nombre: string, razon: string, noCliente: string, cliente: any) => void
}) {
  const [sugs, setSugs] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [searched, setSearched] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  const updatePos = () => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const above = window.innerHeight - r.bottom < 260 && r.top > 260
    setPos({ top: above ? r.top - 260 : r.bottom + 2, left: r.left, width: r.width })
  }

  const doSearch = async (q: string) => {
    onChange(q)
    const trimmed = q.trim()
    if (trimmed.length < 1) { setSugs([]); setOpen(false); setSearched(false); return }
    updatePos()
    // Parallel queries: by name and by RFC — more reliable than single OR with nullable cols
    const [{ data: byName }, { data: byRfc }] = await Promise.all([
      supabase.from('crm_clients')
        .select('id, solicitante, razon_social, rfc, gpo_vendedores, centro')
        .or(`solicitante.ilike.%${trimmed}%,razon_social.ilike.%${trimmed}%`)
        .limit(10),
      supabase.from('crm_clients')
        .select('id, solicitante, razon_social, rfc, gpo_vendedores, centro')
        .ilike('rfc', `%${trimmed}%`)
        .limit(5),
    ])
    const seen = new Set<string>()
    const merged = [...(byName ?? []), ...(byRfc ?? [])].filter((r: any) => {
      if (seen.has(r.id)) return false
      seen.add(r.id); return true
    }).slice(0, 10)
    setSugs(merged); setSearched(true); setOpen(true)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={e => doSearch(e.target.value)}
        onFocus={() => { if (value.length >= 1 && (sugs.length > 0 || searched)) { updatePos(); setOpen(true) } }}
        onBlur={() => setTimeout(() => setOpen(false), 300)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
        placeholder="Buscar por nombre, razón social o RFC" />
      {open && (sugs.length > 0 || searched) && createPortal(
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
          zIndex: 9999, maxHeight: 260, overflowY: 'auto',
          background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        }}>
          {sugs.length > 0
            ? sugs.map(cl => (
                <button key={cl.id} type="button"
                  onPointerDown={e => {
                    e.preventDefault()
                    onSelect(cl.id, cl.solicitante, cl.razon_social ?? '', cl.rfc ?? '', cl)
                    setOpen(false); setSugs([]); setSearched(false)
                  }}
                  style={{ display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left',
                    padding: '9px 14px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid #f3f4f6', cursor: 'pointer', gap: 2 }}
                  onMouseOver={e => (e.currentTarget.style.background = '#f0fdf4')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>
                    {cl.razon_social ?? cl.solicitante}
                  </span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                    {cl.solicitante}{cl.rfc ? ` · RFC: ${cl.rfc}` : ''}
                  </span>
                </button>
              ))
            : (
              <div style={{ padding: '12px 14px' }}>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                  No se encontró <strong>"{value}"</strong> en el catálogo.
                </p>
                <a href="/crm/new" target="_blank" rel="noreferrer"
                  onMouseDown={e => e.preventDefault()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#0d9488', color: 'white', padding: '6px 12px',
                    borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                  + Registrar nuevo cliente
                </a>
                <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                  Abre en nueva pestaña. Después vuelve y búscalo de nuevo.
                </p>
              </div>
            )
          }
        </div>,
        document.body
      )}
    </div>
  )
}

const emptyRow = () => ({
  material: '', descripcion: '', cantidad_pedida: '', cantidad_pendiente: '',
  cantidad_aceptada: '', precio: '', um: '', consumo_promedio: '',
  fuente: '', disponible: '', lote: '', caducidad: '',
  condicion_especial: false, centro: '', almacen: '',
})

export default function CrmVentaManualPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState<'formulario'|'pegar'>('formulario')
  const [clienteInput, setClienteInput] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [clienteInfo, setClienteInfo] = useState({ razon: '', noCliente: '' })
  const [form, setForm] = useState({
    folio_pedido: '', gpo_cliente: '', gpo_vendedor: '',
    centro_pedido: '', almacen_pedido: '', fecha: new Date().toISOString().split('T')[0],
    solicitante: '', destinatario: '', notas: '',
  })
  const [rows, setRows] = useState([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState<any[]>([])
  const [tipoNegocio, setTipoNegocio] = useState<'venta' | 'donativo'>('venta')
  const [destinatarios, setDestinatarios] = useState<any[]>([])

  const setF = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))
  const setRow = (i: number, field: string, val: any) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  // Parsear pegado de Excel con normalización de columnas
  // Helpers de parsing — también usados en guardar()
  const cleanMoney = (v: string) => v.replace(/[$,\s]/g, '')

  const toIsoDate = (v: string): string => {
    if (!v) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
    // dd/mm/yyyy o dd-mm-yyyy
    const m = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    // dd/mm/yy
    const m2 = v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/)
    if (m2) return `20${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
    return v
  }

  const todayISO = new Date().toISOString().split('T')[0]

  const parsePaste = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) return
    const rawHeaders = lines[0].split('\t').map(h => h.trim())
    const headers = rawHeaders.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))

    const idx = (names: string[]) => {
      for (const n of names) {
        const norm = n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const i = headers.findIndex(h => h === norm || h.includes(norm))
        if (i >= 0) return i
      }
      return -1
    }

    const parsed = lines.slice(1).map(line => {
      const cols = line.split('\t')
      const get = (names: string[]) => {
        const i = idx(names); return i >= 0 ? cols[i]?.trim() ?? '' : ''
      }
      const rawPrecio = get(['precio_unitario_ultima', 'precio unitario ultima', 'precio unitario', 'precio oferta', 'precio_oferta', 'lista 06', 'lista 02', 'precio'])
      const rawCad   = get(['fecha de caducidad', 'fecha caducidad', 'fecha_caducidad', 'caducidad', 'cad', 'fec. cad', 'fec.cad'])
      const hasEsp   = !!(get(['lote']) || rawCad)
      return {
        material:           get(['material sugerido', 'material solicitado', 'material base', 'material']),
        descripcion:        get(['descripcion sugerida', 'descripcion solicitada', 'descripcion']),
        cantidad_pedida:    get(['cantidad pedido', 'ultima_compra_cliente', 'cantidad pedida']),
        cantidad_pendiente: get(['cantidad pendiente', 'ultima_facturacion_destinatario']),
        cantidad_aceptada:  get(['cantidad a ofertar', 'cantidad ofertar']),
        precio:             cleanMoney(rawPrecio),
        um:                 '', // always fetched from catalog in aplicarPaste
        consumo_promedio:   get(['consumo promedio']),
        fuente:             get(['fuente']),
        disponible:         get(['disponible']),
        lote:               get(['lote']),
        caducidad:          toIsoDate(rawCad),
        centro:             get(['centro sugerido', 'centro']),
        almacen:            get(['almacen sugerido', 'almacen']),
        condicion_especial: hasEsp,
      }
    }).filter(r => r.material)
    setPastePreview(parsed)

    if (parsed.length > 0) {
      const firstLine = lines[1].split('\t')
      const gk = (names: string[]) => {
        const i = idx(names); return i >= 0 ? firstLine[i]?.trim() ?? '' : ''
      }
      const razonSocial = gk(['razon social'])
      setForm(prev => ({
        ...prev,
        gpo_cliente:    gk(['gpo. cte', 'grp. cliente', 'gpo cliente', 'grupo cliente']),
        gpo_vendedor:   gk(['gpo.vdor.', 'gpo. vdor.', 'gpo vendedor', 'grupo vendedor']),
        solicitante:    gk(['solicitante']),
        destinatario:   gk(['destinatario']),
        centro_pedido:  gk(['centro pedido']),
        almacen_pedido: gk(['almacen']),
        folio_pedido:   gk(['pedido']),
        fecha:          prev.fecha, // always keep today — never overwrite from Excel
      }))
      if (razonSocial) {
        setClienteInput(razonSocial)
        // Intentar autovinculación por razón social
        supabase.from('crm_clients')
          .select('id, solicitante, razon_social')
          .ilike('razon_social', `%${razonSocial}%`)
          .limit(1)
          .then(({ data }) => {
            if (data && data.length > 0) {
              const c = data[0]
              setClienteId(c.id)
              setClienteInfo({ razon: c.razon_social || c.solicitante, noCliente: '' })
              setClienteInput(c.razon_social || c.solicitante)
            }
          })
      }
    }
  }

  const aplicarPaste = async () => {
    if (pastePreview.length === 0) return
    // Enrich: fetch UM and descripcion from catalog for rows missing them
    const codigos = pastePreview.map(r => r.material).filter(Boolean)
    let catMap: Record<string, { um: string; descripcion: string }> = {}
    if (codigos.length > 0) {
      const { data: cats } = await supabase
        .from('catalog_materials')
        .select('material, um, descripcion')
        .in('material', codigos)
      ;(cats ?? []).forEach((cat: any) => {
        catMap[cat.material] = { um: cat.um ?? '', descripcion: cat.descripcion ?? '' }
      })
    }
    const enriched = pastePreview.map(r => ({
      ...r,
      um:          r.um || catMap[r.material]?.um || '',
      descripcion: r.descripcion || catMap[r.material]?.descripcion || '',
      // Default caducidad to today if empty but condicion_especial is true
      caducidad:   r.caducidad || (r.condicion_especial ? todayISO : ''),
    }))
    setRows(enriched)
    setTab('formulario')
    toast.success(`${enriched.length} materiales cargados`)
  }

  const guardar = async () => {
    if (!clienteId) return toast.error('Selecciona un cliente')
    const validRows = rows.filter(r => r.material && (r.cantidad_aceptada || r.cantidad_pedida))
    if (validRows.length === 0) return toast.error('Agrega al menos un material con cantidad')
    setSaving(true)
    try {
      const user = await getCachedUser()
      const { data: offer, error } = await supabase.from('crm_offers').insert({
        client_id:      clienteId,
        tipo:           'manual',
        tipo_negocio:   tipoNegocio,
        etapa:          'oferta', // donativo starts as oferta; tipo_negocio distinguishes it
        estatus:        'borrador',
        notas:          form.notas || null,
        fecha_venta:    form.fecha,
        folio_pedido:   form.folio_pedido || null,
        gpo_cliente:    form.gpo_cliente || null,
        gpo_vendedor:   form.gpo_vendedor || null,
        solicitante:    form.solicitante || null,
        destinatario:   form.destinatario || null,
        centro_pedido:  form.centro_pedido || null,
        almacen_pedido: form.almacen_pedido || null,
        created_by:     user?.id,
      }).select().single()

      if (error || !offer) throw new Error(error?.message ?? 'Error')

      const { error: itemsError } = await supabase.from('crm_offer_items').insert(
        validRows.map(r => ({
          offer_id:           offer.id,
          source_type:        'manual',
          material:           r.material,
          descripcion:        r.descripcion || null,
          cantidad_ofertada:  parseFloat(r.cantidad_aceptada || r.cantidad_pedida) || 0,
          cantidad_aceptada:  parseFloat(r.cantidad_aceptada || r.cantidad_pedida) || 0,
          precio_oferta:      parseFloat(cleanMoney(r.precio)) || 0,
          precio_aceptado:    parseFloat(cleanMoney(r.precio)) || 0,
          cantidad_pendiente: parseFloat(r.cantidad_pendiente) || null,
          um:                 r.um || null,
          consumo_promedio:   parseFloat(r.consumo_promedio) || null,
          fuente:             r.fuente || null,
          disponible:         parseFloat(r.disponible) || null,
          lote:               r.lote || null,
          caducidad:          toIsoDate(r.caducidad) || null,
          condicion_especial: r.condicion_especial ?? false,
          centro:             r.centro || null,
          almacen:            r.almacen || null,
          aceptado:           true,
          estatus:            'aceptado',
          numero_pedido:      form.folio_pedido || null,
        }))
      )
      if (itemsError) throw new Error(`Error al guardar materiales: ${itemsError.message}`)

      if (tipoNegocio === 'donativo') {
        // Crear solicitud MSC vinculada al donativo
        const { data: mscSol } = await supabase.from('msc_solicitudes').insert({
          tipo: 'solicitud',
          asunto: `Donativo — ${clienteInfo.razon} (${form.fecha})`,
          destinatario_tipo: 'cliente',
          destinatario_nombre: form.destinatario || clienteInfo.razon,
          client_id: clienteId,
          solicitante: form.solicitante || null,
          crm_offer_id: offer.id,
          created_by: user?.id,
          estatus: 'borrador',
        }).select().single()

        if (mscSol) {
          await supabase.from('msc_items').insert(
            validRows.map(r => ({
              solicitud_id: mscSol.id,
              codigo: r.material,
              descripcion: r.descripcion || null,
              cantidad_pedida: parseFloat(r.cantidad_aceptada || r.cantidad_pedida) || 0,
              precio_unitario: parseFloat(cleanMoney(r.precio)) || null,
              um: r.um || null,
            }))
          )
          toast.success('Donativo creado — solicitud MSC enviada para aprobación')
          nav(`/msc/${mscSol.id}`)
        } else {
          toast.success('Donativo guardado en CRM')
          nav('/crm/pipeline')
        }
      } else {
        toast.success('Venta creada')
        nav(`/crm/pipeline?id=${offer.id}`)
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <button onClick={() => nav('/crm/pipeline')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Pipeline
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Nueva venta directa</h1>
      <p className="text-sm text-gray-400 mb-5">Entra directo en E2 · Venta</p>

      {/* Tabs */}
      <div className="flex gap-0 mb-5 border-b border-gray-200">
        {[{k:'formulario',l:'Formulario'},{k:'pegar',l:'Pegar desde Excel'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.k ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{t.l}</button>
        ))}
      </div>

      {/* Tab: Pegar desde Excel */}
      {tab === 'pegar' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm text-gray-500">Copia las filas de tu Excel (incluyendo encabezados) y pégalas aquí:</p>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-teal-400 font-mono"
            rows={8} placeholder="Pega aquí tus datos de Excel..."
            value={pasteText} onChange={e => { setPasteText(e.target.value); parsePaste(e.target.value) }} />
          {pastePreview.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">{pastePreview.length} materiales detectados</p>
              <div className="overflow-x-auto max-h-48 border border-gray-200 rounded-lg">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>{['Material','Descripción','Cant.','Precio','UM','Lote','Caducidad'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {pastePreview.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-3 py-1.5 font-mono font-semibold">{r.material}</td>
                        <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{r.descripcion}</td>
                        <td className="px-3 py-1.5 text-right">{r.cantidad_aceptada || r.cantidad_pedida}</td>
                        <td className="px-3 py-1.5 text-right">{r.precio}</td>
                        <td className="px-3 py-1.5">{r.um}</td>
                        <td className="px-3 py-1.5">{r.lote}</td>
                        <td className="px-3 py-1.5">{r.caducidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={aplicarPaste}
                className="mt-3 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700">
                Cargar {pastePreview.length} materiales al formulario
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Formulario */}
      {tab === 'formulario' && (
        <div className="space-y-5">
          {/* Tipo de negocio */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wide">Tipo de registro</p>
            <div className="flex gap-3">
              <button
                onClick={() => setTipoNegocio('venta')}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition flex items-center justify-center gap-2 ${
                  tipoNegocio === 'venta'
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-teal-300'
                }`}>
                💰 Venta
              </button>
              <button
                onClick={() => setTipoNegocio('donativo')}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition flex items-center justify-center gap-2 ${
                  tipoNegocio === 'donativo'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300'
                }`}>
                🎁 Donativo
              </button>
            </div>
            {tipoNegocio === 'donativo' && (
              <div className="mt-3 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 text-xs text-purple-700">
                El donativo no se factura. Al guardar se crea una solicitud MSC para aprobación y seguimiento.
              </div>
            )}
          </div>

          {/* Datos generales */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Datos generales</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-3">
                <label className="text-xs text-gray-500 block mb-1">Cliente * (No. cliente o Razón Social)</label>
                <ClienteInput value={clienteInput} onChange={setClienteInput}
                  onSelect={async (id, nombre, razon, noCliente, cliente) => {
                    setClienteId(id)
                    setClienteInfo({ razon: razon || nombre, noCliente })
                    setClienteInput(razon || nombre)
                    // Autofill form fields from client data
                    setForm(prev => ({
                      ...prev,
                      gpo_vendedor:  cliente?.gpo_vendedores ?? prev.gpo_vendedor,
                      solicitante:   cliente?.solicitante    ?? prev.solicitante,
                      centro_pedido: cliente?.centro         ?? prev.centro_pedido,
                    }))
                    // Load destinatarios for this client
                    const { data: recs } = await supabase.from('crm_recipients')
                      .select('id, destinatario').eq('client_id', id).order('destinatario')
                    setDestinatarios(recs ?? [])
                    if (recs && recs.length === 1) {
                      setForm(prev => ({ ...prev, destinatario: recs[0].destinatario }))
                    }
                  }} />
                {clienteId && (
                  <p className="text-xs text-teal-600 mt-1">
                    {clienteInfo.noCliente && <span className="font-mono mr-2">{clienteInfo.noCliente}</span>}
                    {clienteInfo.razon}
                  </p>
                )}
              </div>
              {[
                { label: 'Folio / Pedido SAP', key: 'folio_pedido', placeholder: 'Si ya existe' },
                { label: 'Fecha', key: 'fecha', placeholder: '', type: 'date' },
                { label: 'Gpo. Cliente', key: 'gpo_cliente', placeholder: '' },
                { label: 'Gpo. Vendedor', key: 'gpo_vendedor', placeholder: '' },
                { label: 'Solicitante', key: 'solicitante', placeholder: 'No. cliente' },
                { label: 'Centro pedido', key: 'centro_pedido', placeholder: '' },
                { label: 'Almacén', key: 'almacen_pedido', placeholder: '' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <input type={f.type ?? 'text'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setF(f.key, e.target.value)} />
                </div>
              ))}
              {/* Destinatario — select si hay opciones, input libre si no */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Destinatario</label>
                {destinatarios.length > 0 ? (
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 bg-white"
                    value={form.destinatario}
                    onChange={e => setF('destinatario', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {destinatarios.map(d => (
                      <option key={d.id} value={d.destinatario}>{d.destinatario}</option>
                    ))}
                  </select>
                ) : (
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Destinatario"
                    value={form.destinatario} onChange={e => setF('destinatario', e.target.value)} />
                )}
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="text-xs text-gray-500 block mb-1">Notas / Observaciones</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={form.notas} onChange={e => setF('notas', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Materiales */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Materiales</h3>
              <button onClick={addRow} className="text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
                + Agregar fila
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-max">
                <thead>
                  <tr className="bg-gray-50">
                    {['Código','Descripción','Cant. Pedida','Cant. Pendiente','Precio','UM','Esp.'].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap text-xs">{h}</th>
                    ))}
                    {rows.some(r => r.condicion_especial) && ['Lote','Caducidad','Disponible','Centro','Almacén'].map(h => (
                      <th key={h} className="px-2 py-2 text-left text-amber-600 font-semibold border-b border-gray-200 whitespace-nowrap text-xs">{h}</th>
                    ))}
                    <th className="px-2 py-2 border-b border-gray-200"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${r.condicion_especial ? 'bg-amber-50' : ''}`}>
                      <td className="px-1 py-1 w-32">
                        <MaterialInput value={r.material} onChange={v => setRow(i, 'material', v)}
                          onSelect={(m, d, um, precio) => {
                            setRow(i,'material',m)
                            setRow(i,'descripcion',d)
                            if (um) setRow(i,'um',um)
                            if (precio) setRow(i,'precio',precio)
                          }} />
                      </td>
                      <td className="px-1 py-1 w-48">
                        <input className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                          value={r.descripcion} onChange={e => setRow(i,'descripcion',e.target.value)} />
                      </td>
                      <td className="px-1 py-1 w-24">
                        <input type="number" className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400 text-right"
                          value={r.cantidad_pedida} onChange={e => setRow(i,'cantidad_pedida',e.target.value)} />
                      </td>
                      <td className="px-1 py-1 w-24">
                        <input type="number" className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400 text-right"
                          value={r.cantidad_pendiente} onChange={e => setRow(i,'cantidad_pendiente',e.target.value)} />
                      </td>
                      <td className="px-1 py-1 w-24">
                        <input type="number" className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400 text-right"
                          value={r.precio} onChange={e => setRow(i,'precio',e.target.value)} />
                      </td>
                      <td className="px-1 py-1 w-16">
                        <input className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                          value={r.um} onChange={e => setRow(i,'um',e.target.value)} />
                      </td>
                      <td className="px-1 py-1 text-center">
                        <input type="checkbox" className="w-4 h-4 accent-amber-500"
                          checked={r.condicion_especial}
                          onChange={e => setRow(i,'condicion_especial',e.target.checked)}
                          title="Material especial — habilita Lote, Caducidad, Disponible, Centro, Almacén" />
                      </td>
                      {rows.some(r2 => r2.condicion_especial) && <>
                        <td className="px-1 py-1 w-28">
                          {r.condicion_especial ? <input className="w-full border border-amber-300 rounded px-2 py-1.5 text-xs outline-none focus:border-amber-500 bg-amber-50"
                            value={r.lote} onChange={e => setRow(i,'lote',e.target.value)} placeholder="Lote" /> : <span className="text-gray-200 text-xs px-2">—</span>}
                        </td>
                        <td className="px-1 py-1 w-32">
                          {r.condicion_especial ? <input type="date" className="w-full border border-amber-300 rounded px-2 py-1.5 text-xs outline-none focus:border-amber-500 bg-amber-50"
                            value={r.caducidad} onChange={e => setRow(i,'caducidad',e.target.value)} /> : <span className="text-gray-200 text-xs px-2">—</span>}
                        </td>
                        <td className="px-1 py-1 w-24">
                          {r.condicion_especial ? <input type="number" className="w-full border border-amber-300 rounded px-2 py-1.5 text-xs outline-none focus:border-amber-500 bg-amber-50 text-right"
                            value={r.disponible} onChange={e => setRow(i,'disponible',e.target.value)} /> : <span className="text-gray-200 text-xs px-2">—</span>}
                        </td>
                        <td className="px-1 py-1 w-20">
                          {r.condicion_especial ? <input className="w-full border border-amber-300 rounded px-2 py-1.5 text-xs outline-none focus:border-amber-500 bg-amber-50"
                            value={r.centro} onChange={e => setRow(i,'centro',e.target.value)} placeholder="Centro" /> : <span className="text-gray-200 text-xs px-2">—</span>}
                        </td>
                        <td className="px-1 py-1 w-20">
                          {r.condicion_especial ? <input className="w-full border border-amber-300 rounded px-2 py-1.5 text-xs outline-none focus:border-amber-500 bg-amber-50"
                            value={r.almacen} onChange={e => setRow(i,'almacen',e.target.value)} placeholder="Almacén" /> : <span className="text-gray-200 text-xs px-2">—</span>}
                        </td>
                      </>}
                      <td className="px-1 py-1">
                        <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 px-1">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">☑ Esp = Material con condición especial — activa columnas de Lote, Caducidad, Disponible, Centro y Almacén en esa fila.</p>
          </div>

          {/* Botones */}
          <div className="flex justify-between">
            <button onClick={() => nav('/crm/pipeline')}
              className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={guardar} disabled={saving}
              className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
              {saving ? 'Guardando...' : tipoNegocio === 'donativo' ? 'Crear donativo →' : 'Crear venta →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
