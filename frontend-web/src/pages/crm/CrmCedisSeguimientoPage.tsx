import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const TIPO_MOV: Record<string, { label: string; chip: string; bg: string; color: string; border: string }> = {
  reubicacion: { label: 'Reubicación', chip: '🔁', bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' },
  para_pedido: { label: 'Para pedido', chip: '📦', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  por_enlazar: { label: 'Por enlazar', chip: '⏳', bg: '#FEF3C7', color: '#92400E', border: '#FCD34D' },
}

const ETAPAS = [
  { key: 'pendiente_solicitar', label: 'Pendiente solicitar', bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' },
  { key: 'solicitado',          label: 'Solicitado',          bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  { key: 'en_transito',         label: 'En curso',            bg: '#FEF3C7', color: '#92400E', border: '#FCD34D' },
  { key: 'recibido',            label: 'Llegada',             bg: '#D1FAE5', color: '#065F46', border: '#6EE7B7' },
  { key: 'cancelado',           label: 'Cancelado',           bg: '#FEE2E2', color: '#991B1B', border: '#FCA5A5' },
]

const ORIGEN_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  msc:    { bg: '#EDE9FE', color: '#5B21B6', label: 'MSC' },
  crm:    { bg: '#FEF3C7', color: '#92400E', label: 'CRM' },
  manual: { bg: '#F3F4F6', color: '#374151', label: 'Manual' },
}

const MESES: Record<string, string> = {
  ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',
  jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12',
  jan:'01',apr:'04',aug:'08',dec:'12'
}

const normalizarFecha = (val: string): string | null => {
  if (!val?.trim()) return null
  const v = val.trim()
  const mmmMatch = v.match(/^(\d{1,2})[-\/](\w{3})[-\/](\d{2,4})$/i)
  if (mmmMatch) {
    const mes = MESES[mmmMatch[2].toLowerCase()]
    if (mes) {
      let anio = mmmMatch[3]
      if (anio.length === 2) anio = parseInt(anio) >= 50 ? '19'+anio : '20'+anio
      return `${anio}-${mes}-${mmmMatch[1].padStart(2,'0')}`
    }
  }
  const dmyMatch = v.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/)
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

const fmtFecha = (val: string | null): string => {
  if (!val) return '\u2014'
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : val
}

const today = new Date().toISOString().split('T')[0]

const emptyRow = () => ({
  fecha_solicitud: '', centro_origen: '', almacen_origen: '',
  centro_destino: '', almacen_destino: '', codigo: '', descripcion: '',
  cantidad: '', um: '', lote: '', fecha_caducidad: '',
  no_ud: '', delivery: '', estatus: 'pendiente_solicitar', comentarios: '',
  fecha_esperada: '', tipo_movimiento: 'reubicacion', folio_pedido_destino: '',
})

export default function CrmCedisSeguimientoPage() {
  const nav = useNavigate()
  const [rows, setRows]                   = useState<any[]>([])
  const [recepciones, setRecepciones]     = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [filterEstatus, setFilterEstatus] = useState('activos')
  const [filterOrigen, setFilterOrigen]   = useState('')
  const [filterTipo, setFilterTipo]       = useState('')
  const [search, setSearch]               = useState('')
  const [showNueva, setShowNueva]         = useState(false)
  const [showPaste, setShowPaste]         = useState(false)
  const [pasteText, setPasteText]         = useState('')
  const [pasteRows, setPasteRows]         = useState<any[]>([])
  const [manualRows, setManualRows]       = useState([emptyRow()])
  const [saving, setSaving]               = useState(false)

  const [historialRow, setHistorialRow]         = useState<any | null>(null)
  const [historialData, setHistorialData]       = useState<any[]>([])
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const [llegadaModal, setLlegadaModal]         = useState<any | null>(null)
  const [llegadaForm, setLlegadaForm]           = useState({ cantidad_recibida: '', fecha_recepcion: today, notas: '' })
  const [savingLlegada, setSavingLlegada]       = useState(false)
  const [llegadaParcialDecision, setLlegadaParcialDecision] = useState<{ row: any; recibido: number; pedido: number } | null>(null)

  const [vincularModal, setVincularModal]     = useState<any | null>(null)
  const [vincularFolio, setVincularFolio]     = useState('')
  const [savingVincular, setSavingVincular]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setLoading(false); return }
    const [{ data: rqs }, { data: recs }] = await Promise.all([
      supabase.from('crm_cedis_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('crm_cedis_recepciones').select('*').order('fecha_recepcion'),
    ])
    setRows(rqs ?? [])
    setRecepciones(recs ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const recsByRequest = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const r of recepciones) {
      if (!map[r.request_id]) map[r.request_id] = []
      map[r.request_id].push(r)
    }
    return map
  }, [recepciones])

  const cantRecibida = (id: string) =>
    (recsByRequest[id] ?? []).reduce((s, r) => s + (r.cantidad_recibida ?? 0), 0)

  const isVencida = (r: any) =>
    r.fecha_esperada && r.fecha_esperada < today && !['recibido','cancelado'].includes(r.estatus)

  const tipoMov = (r: any) => r.tipo_movimiento ?? 'reubicacion'

  const visible = useMemo(() => rows.filter(r => {
    if (filterEstatus === 'activos' && ['recibido','cancelado'].includes(r.estatus)) return false
    if (filterEstatus === 'vencidas') return isVencida(r)
    if (filterEstatus && !['activos','vencidas',''].includes(filterEstatus) && r.estatus !== filterEstatus) return false
    if (filterOrigen && r.origen !== filterOrigen) return false
    if (filterTipo && tipoMov(r) !== filterTipo) return false
    if (search) {
      const q = search.toLowerCase()
      return r.codigo?.toLowerCase().includes(q) || r.descripcion?.toLowerCase().includes(q) ||
        r.lote?.toLowerCase().includes(q) || r.delivery?.toLowerCase().includes(q) ||
        r.no_ud?.toLowerCase().includes(q) || r.folio_pedido_destino?.toLowerCase().includes(q)
    }
    return true
  }), [rows, filterEstatus, filterOrigen, filterTipo, search, recepciones])

  const cuentas = useMemo(() => {
    const m: Record<string, number> = { vencidas: 0 }
    for (const e of ETAPAS) m[e.key] = rows.filter(r => r.estatus === e.key).length
    m.vencidas = rows.filter(isVencida).length
    return m
  }, [rows, recepciones])

  const updateEstatus = async (id: string, estatus: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('crm_cedis_requests').update({ estatus }).eq('id', id)
    await supabase.from('crm_cedis_history').insert({
      request_id: id, estatus, nota: `Estatus actualizado a: ${estatus}`, created_by: session?.user.id,
    })
    setRows(prev => prev.map(r => r.id === id ? { ...r, estatus } : r))
  }

  const updateFechaEsperada = async (id: string, fecha: string) => {
    await supabase.from('crm_cedis_requests').update({ fecha_esperada: fecha || null }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, fecha_esperada: fecha || null } : r))
  }

  const updateComentarios = async (id: string, comentarios: string) => {
    await supabase.from('crm_cedis_requests').update({ comentarios }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, comentarios } : r))
  }

  const guardarLlegada = async () => {
    if (!llegadaModal || !llegadaForm.cantidad_recibida || !llegadaForm.fecha_recepcion) return
    setSavingLlegada(true)
    const { data: { session } } = await supabase.auth.getSession()
    const cantNueva  = parseFloat(llegadaForm.cantidad_recibida)
    const cantPedida = llegadaModal.cantidad_pedida ?? llegadaModal.cantidad ?? 0
    const yaRecibido = cantRecibida(llegadaModal.id) + cantNueva

    await supabase.from('crm_cedis_recepciones').insert({
      request_id: llegadaModal.id, cantidad_recibida: cantNueva,
      fecha_recepcion: llegadaForm.fecha_recepcion, notas: llegadaForm.notas || null,
      created_by: session?.user.id,
    })

    const esCompleto = cantPedida > 0 && yaRecibido >= cantPedida
    const nuevoEstatus = esCompleto ? 'recibido' : 'en_transito'

    await supabase.from('crm_cedis_requests').update({ estatus: nuevoEstatus }).eq('id', llegadaModal.id)
    await supabase.from('crm_cedis_history').insert({
      request_id: llegadaModal.id, estatus: nuevoEstatus,
      nota: `Llegada: ${cantNueva} ${llegadaModal.um ?? ''} el ${llegadaForm.fecha_recepcion}${llegadaForm.notas ? ' — '+llegadaForm.notas : ''}`,
      created_by: session?.user.id,
    })

    if (esCompleto && tipoMov(llegadaModal) === 'para_pedido' && llegadaModal.crm_offer_item_id) {
      await supabase.from('crm_offer_items').update({ estatus: 'recibido_cedis' }).eq('id', llegadaModal.crm_offer_item_id)
    }

    setLlegadaForm({ cantidad_recibida: '', fecha_recepcion: today, notas: '' })
    setSavingLlegada(false)
    load()

    if (esCompleto) {
      if (tipoMov(llegadaModal) === 'para_pedido') {
        setLlegadaModal({ ...llegadaModal, _completado: true })
        toast.success('Material completo \u2014 item CRM actualizado a "Recibido CEDIS"')
      } else {
        setLlegadaModal(null)
        toast.success('Material completo \u2014 solicitud cerrada')
      }
    } else if (cantPedida > 0) {
      const rowSnapshot = { ...llegadaModal }
      setLlegadaModal(null)
      setLlegadaParcialDecision({ row: rowSnapshot, recibido: yaRecibido, pedido: cantPedida })
      toast.success(`Llegada registrada (${yaRecibido}/${cantPedida})`)
    } else {
      setLlegadaModal(null)
      toast.success('Llegada registrada')
    }
  }

  const cancelarPendienteLlegada = async (row: any) => {
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('crm_cedis_requests').update({ estatus: 'recibido' }).eq('id', row.id)
    await supabase.from('crm_cedis_history').insert({
      request_id: row.id, estatus: 'recibido',
      nota: 'Pendiente cancelado \u2014 cerrado con lo recibido', created_by: session?.user.id,
    })
    toast.success('Solicitud cerrada con material recibido')
    setLlegadaParcialDecision(null)
    load()
  }

  const guardarVinculo = async () => {
    if (!vincularModal || !vincularFolio.trim()) return
    setSavingVincular(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { data: offerItems } = await supabase
      .from('crm_offer_items').select('id, material, numero_pedido')
      .eq('numero_pedido', vincularFolio.trim()).limit(10)
    const match = offerItems?.find((i: any) => i.material === vincularModal.codigo) ?? offerItems?.[0]
    await supabase.from('crm_cedis_requests').update({
      tipo_movimiento: 'para_pedido',
      folio_pedido_destino: vincularFolio.trim(),
      crm_offer_item_id: match?.id ?? null,
    }).eq('id', vincularModal.id)
    await supabase.from('crm_cedis_history').insert({
      request_id: vincularModal.id, estatus: vincularModal.estatus,
      nota: `Vinculado al pedido: ${vincularFolio.trim()}${match ? ' \u2014 item CRM enlazado' : ''}`,
      created_by: session?.user.id,
    })
    toast.success(match ? `Vinculado al pedido ${vincularFolio}` : 'Folio guardado \u2014 sin coincidencia exacta')
    setVincularModal(null); setVincularFolio(''); setSavingVincular(false)
    load()
  }

  const openHistorial = async (row: any) => {
    setHistorialRow(row)
    setLoadingHistorial(true)
    const [{ data: hist }, { data: recs }] = await Promise.all([
      supabase.from('crm_cedis_history').select('*').eq('request_id', row.id).order('created_at'),
      supabase.from('crm_cedis_recepciones').select('*').eq('request_id', row.id).order('fecha_recepcion'),
    ])
    const timeline = [
      ...((hist ?? []).map((h: any) => ({ ...h, _type: 'estatus' }))),
      ...((recs ?? []).map((r: any) => ({ ...r, _type: 'llegada' }))),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    setHistorialData(timeline)
    setLoadingHistorial(false)
  }

  const parsePaste = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) return
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    const idx = (names: string[]) => { for (const n of names) { const i = headers.findIndex(h => h.includes(n.toLowerCase())); if (i >= 0) return i } return -1 }
    const parsed = lines.slice(1).map(line => {
      const cols = line.split('\t')
      const get = (names: string[]) => { const i = idx(names); return i >= 0 ? cols[i]?.trim() ?? '' : '' }
      return {
        fecha_solicitud: get(['fecha solicitud','fecha']), centro_origen: get(['centro origen']),
        almacen_origen: get(['almacen origen']), centro_destino: get(['centro destino']),
        almacen_destino: get(['almacen destino']), codigo: get(['codigo','c\u00f3digo']),
        descripcion: get(['descripcion','descripci\u00f3n']), cantidad: get(['cantidad']),
        um: get(['um']), lote: get(['lote']), fecha_caducidad: get(['fecha caducidad','caducidad']),
        no_ud: get(['no.ud','no ud','noud']), delivery: get(['delivery']),
        estatus: 'pendiente_solicitar', comentarios: get(['comentarios']),
        fecha_esperada: get(['fecha esperada','esperada']),
        tipo_movimiento: get(['tipo']).toLowerCase().includes('pedido') ? 'para_pedido' : 'reubicacion',
        folio_pedido_destino: get(['folio pedido','pedido destino']),
      }
    }).filter(r => r.codigo)
    setPasteRows(parsed)
  }

  const guardarPaste = async () => {
    if (pasteRows.length === 0) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { toast.error('Sin sesi\u00f3n'); setSaving(false); return }
    const inserts = pasteRows.map(r => ({
      ...r, origen: 'manual', created_by: session.user.id,
      cantidad: parseFloat(r.cantidad) || null, cantidad_pedida: parseFloat(r.cantidad) || null,
      fecha_solicitud: normalizarFecha(r.fecha_solicitud), fecha_caducidad: normalizarFecha(r.fecha_caducidad),
      fecha_esperada: normalizarFecha(r.fecha_esperada),
    }))
    const { error } = await supabase.from('crm_cedis_requests').insert(inserts)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(`${pasteRows.length} registros importados`)
    setShowPaste(false); setPasteText(''); setPasteRows([]); load(); setSaving(false)
  }

  const guardarManual = async () => {
    const valid = manualRows.filter(r => r.codigo && r.cantidad)
    if (valid.length === 0) return toast.error('Agrega al menos un material con c\u00f3digo y cantidad')
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { toast.error('Sin sesi\u00f3n'); setSaving(false); return }
    const inserts = valid.map(r => ({
      ...r, origen: 'manual', created_by: session.user.id,
      cantidad: parseFloat(r.cantidad) || null, cantidad_pedida: parseFloat(r.cantidad) || null,
      fecha_solicitud: normalizarFecha(r.fecha_solicitud), fecha_caducidad: normalizarFecha(r.fecha_caducidad),
      fecha_esperada: normalizarFecha(r.fecha_esperada),
      folio_pedido_destino: r.folio_pedido_destino || null,
    }))
    const { error } = await supabase.from('crm_cedis_requests').insert(inserts)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success(`${valid.length} solicitudes creadas`)
    setShowNueva(false); setManualRows([emptyRow()]); load(); setSaving(false)
  }

  const setMRow = (i: number, field: string, val: string) =>
    setManualRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  return (
    <div className="w-full max-w-full mx-auto">
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Solicitudes CEDIS</h1>
          <p className="text-sm text-gray-400 mt-0.5">Seguimiento unificado \u2014 MSC, CRM y manuales</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowPaste(true)} className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">Pegar desde Excel</button>
          <button onClick={() => setShowNueva(true)} className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700">+ Nueva solicitud</button>
        </div>
      </div>

      {/* M\u00e9tricas */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
        {ETAPAS.map(e => (
          <button key={e.key} onClick={() => setFilterEstatus(e.key)}
            style={{ background: filterEstatus === e.key ? e.bg : undefined, borderColor: filterEstatus === e.key ? e.border : undefined }}
            className="rounded-xl p-3 text-left border border-gray-200 hover:opacity-80 transition bg-white">
            <p className="text-xs text-gray-500 mb-1">{e.label}</p>
            <p className="text-xl font-bold" style={{ color: e.color }}>{cuentas[e.key] ?? 0}</p>
          </button>
        ))}
        <button onClick={() => setFilterEstatus('vencidas')}
          className={`rounded-xl p-3 text-left border hover:opacity-80 transition ${filterEstatus === 'vencidas' ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-xs text-gray-500 mb-1">&#9888; Vencidas</p>
          <p className="text-xl font-bold text-red-600">{cuentas.vencidas ?? 0}</p>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[{k:'activos',l:'Activos'},{k:'',l:'Todos'},{k:'vencidas',l:'Vencidas'},...ETAPAS.map(e=>({k:e.key,l:e.label}))].map(f => (
            <button key={f.k} onClick={() => setFilterEstatus(f.k)}
              className={`px-3 py-2 text-xs font-medium transition flex-shrink-0 ${filterEstatus === f.k ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{f.l}</button>
          ))}
        </div>
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[{k:'',l:'Todos'},{k:'msc',l:'MSC'},{k:'crm',l:'CRM'},{k:'manual',l:'Manual'}].map(f => (
            <button key={f.k} onClick={() => setFilterOrigen(f.k)}
              className={`px-3 py-2 text-xs font-medium transition ${filterOrigen === f.k ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{f.l}</button>
          ))}
        </div>
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[{k:'',l:'Tipo'},{k:'reubicacion',l:'🔁 Reub.'},{k:'para_pedido',l:'📦 Pedido'},{k:'por_enlazar',l:'⏳ Enlazar'}].map(f => (
            <button key={f.k} onClick={() => setFilterTipo(f.k)}
              className={`px-3 py-2 text-xs font-medium transition flex-shrink-0 ${filterTipo === f.k ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{f.l}</button>
          ))}
        </div>
        <input className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar c\u00f3digo, descripci\u00f3n, lote, folio pedido..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Tipo','Fecha sol.','F. Esperada','C.Origen','Alm.Orig','C.Destino','Alm.Dest',
                  'C\u00f3digo','Descripci\u00f3n','Pedido/Rec.','UM','Lote','Caducidad',
                  'No.UD','Delivery','Folio Pedido','Estatus','Origen','Comentarios','Acciones'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={20} className="text-center py-8 text-gray-400">Cargando...</td></tr>}
              {!loading && visible.length === 0 && <tr><td colSpan={20} className="text-center py-8 text-gray-400">No hay registros</td></tr>}
              {!loading && visible.map(r => {
                const etapa    = ETAPAS.find(e => e.key === r.estatus) ?? ETAPAS[0]
                const orig     = ORIGEN_CHIP[r.origen ?? 'manual']
                const tipo     = TIPO_MOV[tipoMov(r)]
                const pedida   = r.cantidad_pedida ?? r.cantidad ?? 0
                const recibida = cantRecibida(r.id)
                const vencida  = isVencida(r)
                return (
                  <tr key={r.id} className={`border-b border-gray-100 hover:bg-gray-50 ${vencida ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{ background: tipo.bg, color: tipo.color, borderColor: tipo.border }}>
                        {tipo.chip} {tipo.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(r.fecha_solicitud)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <input type="date"
                        className={`border rounded px-1.5 py-0.5 text-xs outline-none focus:border-teal-400 w-32 ${vencida ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                        value={r.fecha_esperada ?? ''} onChange={e => updateFechaEsperada(r.id, e.target.value)} />
                      {vencida && <p className="text-xs text-red-500 font-medium mt-0.5">&#9888; Vencida</p>}
                    </td>
                    <td className="px-3 py-2">{r.centro_origen}</td>
                    <td className="px-3 py-2">{r.almacen_origen}</td>
                    <td className="px-3 py-2">{r.centro_destino}</td>
                    <td className="px-3 py-2">{r.almacen_destino}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-gray-800">{r.codigo}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-gray-600">{r.descripcion}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {pedida > 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono font-semibold">
                            {recibida > 0
                              ? <span className={recibida >= pedida ? 'text-green-600' : 'text-amber-600'}>{recibida}/{pedida}</span>
                              : pedida}
                          </span>
                          {recibida > 0 && recibida < pedida && (
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100,(recibida/pedida)*100)}%` }} />
                            </div>
                          )}
                          {recibida >= pedida && pedida > 0 && <span className="text-green-500 font-bold">✓</span>}
                        </div>
                      ) : '\u2014'}
                    </td>
                    <td className="px-3 py-2">{r.um}</td>
                    <td className="px-3 py-2">{r.lote}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(r.fecha_caducidad)}</td>
                    <td className="px-3 py-2">{r.no_ud}</td>
                    <td className="px-3 py-2">{r.delivery}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.folio_pedido_destino
                        ? <span className="font-mono text-blue-700 font-semibold">{r.folio_pedido_destino}</span>
                        : tipoMov(r) === 'por_enlazar'
                          ? <button onClick={() => { setVincularModal(r); setVincularFolio('') }}
                              className="text-xs text-amber-600 border border-amber-200 px-2 py-0.5 rounded-lg hover:bg-amber-50">Enlazar</button>
                          : '\u2014'}
                    </td>
                    <td className="px-3 py-2">
                      <select value={r.estatus} onChange={e => updateEstatus(r.id, e.target.value)}
                        style={{ background: etapa.bg, color: etapa.color, borderColor: etapa.border }}
                        className="border rounded-lg px-2 py-1 text-xs outline-none font-medium w-36">
                        {ETAPAS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: orig.bg, color: orig.color }}>{orig.label}</span>
                    </td>
                    <td className="px-3 py-2 min-w-32">
                      <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                        defaultValue={r.comentarios ?? ''}
                        onBlur={e => { if (e.target.value !== (r.comentarios ?? '')) updateComentarios(r.id, e.target.value) }}
                        placeholder="Comentario..." />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex gap-1 flex-wrap">
                        {!['recibido','cancelado'].includes(r.estatus) && (
                          <button onClick={() => { setLlegadaModal(r); setLlegadaForm({ cantidad_recibida: '', fecha_recepcion: today, notas: '' }) }}
                            className="text-xs bg-green-50 border border-green-300 text-green-700 px-2 py-1 rounded-lg hover:bg-green-100 font-medium whitespace-nowrap">+ Llegada</button>
                        )}
                        {tipoMov(r) === 'por_enlazar' && (
                          <button onClick={() => { setVincularModal(r); setVincularFolio('') }}
                            className="text-xs bg-amber-50 border border-amber-300 text-amber-700 px-2 py-1 rounded-lg hover:bg-amber-100 font-medium">🔗</button>
                        )}
                        <button onClick={() => openHistorial(r)}
                          className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-600 px-2 py-1 rounded-lg hover:bg-indigo-100 font-medium">📋</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel historial */}
      {historialRow && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black bg-opacity-30" onClick={() => setHistorialRow(null)} />
          <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-800 font-mono">{historialRow.codigo}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium border"
                    style={{ background: TIPO_MOV[tipoMov(historialRow)]?.bg, color: TIPO_MOV[tipoMov(historialRow)]?.color, borderColor: TIPO_MOV[tipoMov(historialRow)]?.border }}>
                    {TIPO_MOV[tipoMov(historialRow)]?.chip} {TIPO_MOV[tipoMov(historialRow)]?.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400 truncate max-w-64">{historialRow.descripcion}</p>
                {historialRow.folio_pedido_destino && <p className="text-xs text-blue-600 font-mono mt-0.5">Pedido: {historialRow.folio_pedido_destino}</p>}
              </div>
              <button onClick={() => setHistorialRow(null)} className="text-gray-400 hover:text-gray-700 text-2xl">&#215;</button>
            </div>
            {(historialRow.cantidad_pedida ?? historialRow.cantidad) > 0 && (
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">Progreso de recepci\u00f3n</span>
                  <span className="text-xs font-bold text-gray-700">{cantRecibida(historialRow.id)} / {historialRow.cantidad_pedida ?? historialRow.cantidad} {historialRow.um}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100,(cantRecibida(historialRow.id)/((historialRow.cantidad_pedida??historialRow.cantidad)||1))*100)}%` }} />
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loadingHistorial && <p className="text-sm text-gray-400">Cargando...</p>}
              {!loadingHistorial && historialData.length === 0 && <p className="text-sm text-gray-400 text-center mt-8">Sin historial</p>}
              {!loadingHistorial && historialData.length > 0 && (
                <div className="relative">
                  <div className="absolute left-3.5 top-4 bottom-4 w-0.5 bg-gray-200" />
                  <div className="space-y-4">
                    {historialData.map((h, i) => {
                      const isLlegada = h._type === 'llegada'
                      const etapa = isLlegada ? null : ETAPAS.find(e => e.key === h.estatus)
                      return (
                        <div key={i} className="flex gap-3 relative">
                          <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold z-10 ${isLlegada ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-white border-2 border-gray-300 text-gray-500'}`}
                            style={etapa ? { borderColor: etapa.border, background: etapa.bg, color: etapa.color } : {}}>
                            {isLlegada ? '📦' : '→'}
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={`text-xs font-semibold ${isLlegada ? 'text-green-700' : 'text-gray-700'}`}>
                                {isLlegada ? `Llegada: ${h.cantidad_recibida} ${historialRow.um ?? ''}` : (etapa?.label ?? h.estatus)}
                              </span>
                              <span className="text-xs text-gray-400">{isLlegada ? fmtFecha(h.fecha_recepcion) : new Date(h.created_at).toLocaleDateString('es-MX')}</span>
                            </div>
                            {(h.nota || h.notas) && <p className="text-xs text-gray-500 mt-0.5">{h.nota ?? h.notas}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            {!['recibido','cancelado'].includes(historialRow.estatus) && (
              <div className="px-5 py-4 border-t border-gray-200 flex-shrink-0 space-y-2">
                <button onClick={() => { setLlegadaModal(historialRow); setLlegadaForm({ cantidad_recibida: '', fecha_recepcion: today, notas: '' }) }}
                  className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700">+ Registrar llegada</button>
                {tipoMov(historialRow) === 'por_enlazar' && (
                  <button onClick={() => { setVincularModal(historialRow); setVincularFolio('') }}
                    className="w-full border border-amber-300 text-amber-700 py-2 rounded-lg text-sm font-medium hover:bg-amber-50">🔗 Enlazar a pedido CRM</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal llegada */}
      {llegadaModal && !llegadaModal._completado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-800">Registrar llegada</h2>
                <p className="text-xs text-gray-400 font-mono">{llegadaModal.codigo} · {llegadaModal.descripcion}</p>
                {llegadaModal.folio_pedido_destino && <p className="text-xs text-blue-600 font-mono">📦 Pedido: {llegadaModal.folio_pedido_destino}</p>}
              </div>
              <button onClick={() => setLlegadaModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">&#215;</button>
            </div>
            <div className="p-6 space-y-4">
              {(llegadaModal.cantidad_pedida ?? llegadaModal.cantidad) > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-500">Pedido: <strong>{llegadaModal.cantidad_pedida ?? llegadaModal.cantidad} {llegadaModal.um}</strong></span>
                    <span className="text-gray-500">Ya recibido: <strong>{cantRecibida(llegadaModal.id)} {llegadaModal.um}</strong></span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full"
                      style={{ width: `${Math.min(100,(cantRecibida(llegadaModal.id)/((llegadaModal.cantidad_pedida??llegadaModal.cantidad)||1))*100)}%` }} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Cantidad recibida *</label>
                <input type="number" min="0" autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={llegadaForm.cantidad_recibida} onChange={e => setLlegadaForm(f => ({ ...f, cantidad_recibida: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha de recepci\u00f3n *</label>
                <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={llegadaForm.fecha_recepcion} onChange={e => setLlegadaForm(f => ({ ...f, fecha_recepcion: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Notas (folio entrega, condici\u00f3n\u2026)</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={llegadaForm.notas} onChange={e => setLlegadaForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-between px-6 py-4 border-t border-gray-200">
              <button onClick={() => setLlegadaModal(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              <button onClick={guardarLlegada} disabled={savingLlegada || !llegadaForm.cantidad_recibida}
                className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {savingLlegada ? 'Guardando...' : 'Confirmar llegada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal llegada completa para_pedido */}
      {llegadaModal?._completado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">&#9989;</div>
            <h2 className="text-base font-bold text-gray-800 mb-1">Material recibido completo</h2>
            <p className="text-sm text-gray-500 mb-4">
              El item CRM fue actualizado a <strong>"Recibido CEDIS"</strong>. ¿Ir al pedido para continuar?
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setLlegadaModal(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Quedarme aquí</button>
              <button onClick={() => { setLlegadaModal(null); nav('/crm/ventas') }}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700">Ir a Ventas →</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal decisi\u00f3n llegada parcial */}
      {llegadaParcialDecision && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">Llegada parcial registrada</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Pedido:</span><strong>{llegadaParcialDecision.pedido}</strong></div>
              <div className="flex justify-between"><span className="text-gray-600">Recibido:</span><strong className="text-teal-600">{llegadaParcialDecision.recibido}</strong></div>
              <div className="flex justify-between font-semibold"><span className="text-amber-700">Pendiente:</span><span className="text-amber-700">{llegadaParcialDecision.pedido - llegadaParcialDecision.recibido}</span></div>
            </div>
            <p className="text-sm text-gray-600 mb-4">¿Qu\u00e9 hacemos con las unidades pendientes?</p>
            <div className="flex gap-3">
              <button onClick={() => setLlegadaParcialDecision(null)}
                className="flex-1 border border-teal-300 text-teal-700 py-3 rounded-lg text-sm font-medium hover:bg-teal-50 text-center">
                ⏳ Mantener vivo<br/><span className="text-xs font-normal">Seguir esperando</span>
              </button>
              <button onClick={() => cancelarPendienteLlegada(llegadaParcialDecision.row)}
                className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 text-center">
                ✓ Cerrar con lo recibido<br/><span className="text-xs font-normal">Cancelar el pendiente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal vincular folio */}
      {vincularModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-800 mb-1">Enlazar a pedido CRM</h2>
            <p className="text-xs text-gray-400 mb-4 font-mono">{vincularModal.codigo} \u2014 {vincularModal.descripcion}</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 mb-4">
              Al enlazar, cuando llegue el material se actualizar\u00e1 el item del pedido a "Recibido CEDIS".
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">N\u00famero / Folio del pedido CRM *</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 font-mono"
                placeholder="Ej: 4500012345" value={vincularFolio} onChange={e => setVincularFolio(e.target.value)} autoFocus />
            </div>
            <div className="flex justify-between">
              <button onClick={() => setVincularModal(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              <button onClick={guardarVinculo} disabled={savingVincular || !vincularFolio.trim()}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                {savingVincular ? 'Guardando...' : 'Enlazar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pegar desde Excel */}
      {showPaste && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-8 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-base font-bold text-gray-800">Pegar desde Excel</h2>
                <p className="text-xs text-gray-400 mt-0.5">Col: Fecha sol. · C.Origen · Alm.Orig · C.Destino · Alm.Dest · C\u00f3digo · Descripci\u00f3n · Cantidad · UM · Lote · Caducidad · No.UD · Delivery · Comentarios · F.Esperada · Tipo</p>
              </div>
              <button onClick={() => { setShowPaste(false); setPasteText(''); setPasteRows([]) }} className="text-gray-400 hover:text-gray-600 text-xl">&#215;</button>
            </div>
            <div className="p-6 space-y-4">
              <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-teal-400"
                rows={6} placeholder="Pega aqu\u00ed tus filas de Excel (con encabezados)..." value={pasteText}
                onChange={e => { setPasteText(e.target.value); parsePaste(e.target.value) }} />
              {pasteRows.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">{pasteRows.length} materiales detectados</p>
                  <div className="overflow-x-auto max-h-48 border border-gray-200 rounded-lg">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>{['Fecha','C.Orig','C.Dest','C\u00f3digo','Descripci\u00f3n','Cant','UM','Tipo'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>{pasteRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="px-3 py-1.5">{r.fecha_solicitud}</td>
                          <td className="px-3 py-1.5">{r.centro_origen}</td>
                          <td className="px-3 py-1.5">{r.centro_destino}</td>
                          <td className="px-3 py-1.5 font-mono font-semibold">{r.codigo}</td>
                          <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{r.descripcion}</td>
                          <td className="px-3 py-1.5 text-right">{r.cantidad}</td>
                          <td className="px-3 py-1.5">{r.um}</td>
                          <td className="px-3 py-1.5">{TIPO_MOV[r.tipo_movimiento]?.chip ?? '🔁'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <button onClick={() => { setShowPaste(false); setPasteText(''); setPasteRows([]) }} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
                <button onClick={guardarPaste} disabled={saving || pasteRows.length === 0} className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Importando...' : `Importar ${pasteRows.length} materiales`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nueva solicitud manual */}
      {showNueva && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-4 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-7xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-base font-bold text-gray-800">Nueva solicitud manual</h2>
              <button onClick={() => { setShowNueva(false); setManualRows([emptyRow()]) }} className="text-gray-400 hover:text-gray-600 text-xl">&#215;</button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-max">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Tipo *','Folio Pedido','Fecha sol.','F. Esperada','C.Origen','Alm.Orig','C.Destino','Alm.Dest',
                        'C\u00f3digo *','Descripci\u00f3n','Cant *','UM','Lote','Caducidad','No.UD','Delivery','Comentarios',''].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {manualRows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-1 py-1">
                          <select className="border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400 w-32"
                            value={(r as any).tipo_movimiento} onChange={e => setMRow(i, 'tipo_movimiento', e.target.value)}>
                            <option value="reubicacion">🔁 Reubicaci\u00f3n</option>
                            <option value="para_pedido">📦 Para pedido</option>
                            <option value="por_enlazar">⏳ Por enlazar</option>
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input type="text"
                            className={`w-28 border rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400 font-mono ${(r as any).tipo_movimiento === 'reubicacion' ? 'border-gray-100 bg-gray-50 text-gray-300' : 'border-gray-200'}`}
                            placeholder={(r as any).tipo_movimiento !== 'reubicacion' ? "Folio" : "\u2014"}
                            disabled={(r as any).tipo_movimiento === 'reubicacion'}
                            value={(r as any).folio_pedido_destino} onChange={e => setMRow(i, 'folio_pedido_destino', e.target.value)} />
                        </td>
                        {[
                          { f:'fecha_solicitud', type:'date', w:'w-32' },
                          { f:'fecha_esperada',  type:'date', w:'w-32' },
                          { f:'centro_origen',   type:'text', w:'w-20', ph:'1031' },
                          { f:'almacen_origen',  type:'text', w:'w-20', ph:'0001' },
                          { f:'centro_destino',  type:'text', w:'w-20', ph:'1030' },
                          { f:'almacen_destino', type:'text', w:'w-20', ph:'0001' },
                          { f:'codigo',          type:'text', w:'w-28', ph:'Material' },
                          { f:'descripcion',     type:'text', w:'w-40', ph:'Descripci\u00f3n' },
                          { f:'cantidad',        type:'number', w:'w-20', ph:'0' },
                          { f:'um',              type:'text', w:'w-16', ph:'PZA' },
                          { f:'lote',            type:'text', w:'w-24', ph:'Lote' },
                          { f:'fecha_caducidad', type:'date', w:'w-32' },
                          { f:'no_ud',           type:'text', w:'w-24', ph:'No.UD' },
                          { f:'delivery',        type:'text', w:'w-24', ph:'Delivery' },
                          { f:'comentarios',     type:'text', w:'w-32', ph:'Comentarios' },
                        ].map(col => (
                          <td key={col.f} className="px-1 py-1">
                            <input type={col.type}
                              className={`${col.w} border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400`}
                              placeholder={(col as any).ph ?? ''} value={(r as any)[col.f]}
                              onChange={e => setMRow(i, col.f, e.target.value)} />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button onClick={() => setManualRows(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 px-1">&#215;</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => setManualRows(prev => [...prev, emptyRow()])}
                className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">+ Agregar fila</button>
              <div className="flex justify-between mt-4">
                <button onClick={() => { setShowNueva(false); setManualRows([emptyRow()]) }} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
                <button onClick={guardarManual} disabled={saving} className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Crear solicitud'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
