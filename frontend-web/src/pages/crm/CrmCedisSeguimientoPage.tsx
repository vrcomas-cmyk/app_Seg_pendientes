import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

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

const emptyRow = () => ({
  fecha_solicitud: '', centro_origen: '', almacen_origen: '',
  centro_destino: '', almacen_destino: '', codigo: '', descripcion: '',
  cantidad: '', um: '', lote: '', fecha_caducidad: '',
  no_ud: '', delivery: '', estatus: 'pendiente_solicitar', comentarios: '',
})

export default function CrmCedisSeguimientoPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEstatus, setFilterEstatus] = useState('activos')
  const [filterOrigen, setFilterOrigen] = useState('')
  const [search, setSearch] = useState('')
  const [showNueva, setShowNueva] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteRows, setPasteRows] = useState<any[]>([])
  const [manualRows, setManualRows] = useState([emptyRow()])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('crm_cedis_requests')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = rows.filter(r => {
    if (filterEstatus === 'activos' && ['recibido','cancelado'].includes(r.estatus)) return false
    if (filterEstatus && filterEstatus !== 'activos' && r.estatus !== filterEstatus) return false
    if (filterOrigen && r.origen !== filterOrigen) return false
    if (search) {
      const q = search.toLowerCase()
      return r.codigo?.toLowerCase().includes(q) ||
        r.descripcion?.toLowerCase().includes(q) ||
        r.lote?.toLowerCase().includes(q) ||
        r.delivery?.toLowerCase().includes(q)
    }
    return true
  })

  const cuentas = ETAPAS.reduce((acc, e) => {
    acc[e.key] = rows.filter(r => r.estatus === e.key).length
    return acc
  }, {} as Record<string, number>)

  const updateEstatus = async (id: string, estatus: string) => {
    await supabase.from('crm_cedis_requests').update({ estatus }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, estatus } : r))
  }

  const updateComentarios = async (id: string, comentarios: string) => {
    await supabase.from('crm_cedis_requests').update({ comentarios }).eq('id', id)
    setRows(prev => prev.map(r => r.id === id ? { ...r, comentarios } : r))
  }

  // Normalizar fecha a YYYY-MM-DD
  const normalizarFecha = (val: string): string | null => {
    if (!val) return null
    // DD.MM.YYYY o DD/MM/YYYY
    const dotMatch = val.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/)
    if (dotMatch) return `${dotMatch[3]}-${dotMatch[2].padStart(2,'0')}-${dotMatch[1].padStart(2,'0')}`
    // YYYY-MM-DD ya correcto
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
    // Intentar Date parse
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    return null
  }

  // Parser Excel
  const parsePaste = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) return
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    const idx = (names: string[]) => {
      for (const n of names) {
        const i = headers.findIndex(h => h.includes(n.toLowerCase()))
        if (i >= 0) return i
      }
      return -1
    }
    const parsed = lines.slice(1).map(line => {
      const cols = line.split('\t')
      const get = (names: string[]) => { const i = idx(names); return i >= 0 ? cols[i]?.trim() ?? '' : '' }
      return {
        fecha_solicitud: get(['fecha solicitud', 'fecha']),
        centro_origen:   get(['centro origen']),
        almacen_origen:  get(['almacen origen']),
        centro_destino:  get(['centro destino']),
        almacen_destino: get(['almacen destino']),
        codigo:          get(['codigo', 'código']),
        descripcion:     get(['descripcion', 'descripción']),
        cantidad:        get(['cantidad']),
        um:              get(['um']),
        lote:            get(['lote']),
        fecha_caducidad: get(['fecha caducidad', 'caducidad']),
        no_ud:           get(['no.ud', 'no ud', 'noud']),
        delivery:        get(['delivery']),
        estatus:         'pendiente_solicitar',
        comentarios:     get(['comentarios']),
      }
    }).filter(r => r.codigo)
    setPasteRows(parsed)
  }

  const guardarPaste = async () => {
    if (pasteRows.length === 0) return
    setSaving(true)
    const { data: { session: s1 } } = await supabase.auth.getSession()
    const user = s1?.user
    if (!user) { toast.error('Sin sesión — recarga la página'); setSaving(false); return }
    const insertData = pasteRows.map(r => ({ ...r, origen: 'manual', created_by: user.id,
      cantidad: parseFloat(r.cantidad) || null,
      fecha_solicitud: normalizarFecha(r.fecha_solicitud),
      fecha_caducidad: normalizarFecha(r.fecha_caducidad),
    }))
    const { error: errPaste } = await supabase.from('crm_cedis_requests').insert(insertData)
    if (errPaste) { toast.error('Error: ' + errPaste.message); setSaving(false); return }
    toast.success(`${pasteRows.length} registros importados`)
    setShowPaste(false); setPasteText(''); setPasteRows([])
    load(); setSaving(false)
  }

  const guardarManual = async () => {
    const valid = manualRows.filter(r => r.codigo && r.cantidad)
    if (valid.length === 0) return toast.error('Agrega al menos un material con código y cantidad')
    setSaving(true)
    const { data: { session: s2 } } = await supabase.auth.getSession()
    const user = s2?.user
    if (!user) { toast.error('Sin sesión — recarga la página'); setSaving(false); return }
    const insertManual = valid.map(r => ({ ...r, origen: 'manual', created_by: user.id,
      cantidad: parseFloat(r.cantidad) || null,
      fecha_solicitud: normalizarFecha(r.fecha_solicitud),
      fecha_caducidad: normalizarFecha(r.fecha_caducidad),
    }))
    const { error: errManual } = await supabase.from('crm_cedis_requests').insert(insertManual)
    if (errManual) { toast.error('Error: ' + errManual.message); setSaving(false); return }
    toast.success(`${valid.length} solicitudes creadas`)
    setShowNueva(false); setManualRows([emptyRow()])
    load(); setSaving(false)
  }

  const setMRow = (i: number, field: string, val: string) =>
    setManualRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <button onClick={() => nav('/crm')} className="text-sm text-gray-400 hover:text-gray-600 mb-1 block">← CRM</button>
          <h1 className="text-xl font-bold text-gray-800">Solicitudes CEDIS</h1>
          <p className="text-sm text-gray-400 mt-0.5">Seguimiento unificado — MSC, CRM y manuales</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowPaste(true)}
            className="border border-gray-300 text-gray-600 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-50">
            Pegar desde Excel
          </button>
          <button onClick={() => setShowNueva(true)}
            className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700">
            + Nueva solicitud
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-5 gap-2 mb-5">
        {ETAPAS.map(e => (
          <button key={e.key} onClick={() => setFilterEstatus(e.key)}
            style={{ background: filterEstatus === e.key ? e.bg : undefined,
              borderColor: filterEstatus === e.key ? e.border : undefined }}
            className="rounded-xl p-3 text-left border border-gray-200 hover:opacity-80 transition bg-white">
            <p className="text-xs text-gray-500 mb-1">{e.label}</p>
            <p className="text-xl font-bold" style={{ color: e.color }}>{cuentas[e.key] ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[{k:'activos',l:'Activos'},{k:'',l:'Todos'},...ETAPAS.map(e=>({k:e.key,l:e.label}))].map(f => (
            <button key={f.k} onClick={() => setFilterEstatus(f.k)}
              className={`px-3 py-2 text-xs font-medium transition flex-shrink-0 ${
                filterEstatus === f.k ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>{f.l}</button>
          ))}
        </div>
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[{k:'',l:'Todos'},{k:'msc',l:'MSC'},{k:'crm',l:'CRM'},{k:'manual',l:'Manual'}].map(f => (
            <button key={f.k} onClick={() => setFilterOrigen(f.k)}
              className={`px-3 py-2 text-xs font-medium transition ${
                filterOrigen === f.k ? 'bg-teal-600 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>{f.l}</button>
          ))}
        </div>
        <input className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar código, descripción, lote..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Fecha','C.Origen','Alm.Orig','C.Destino','Alm.Dest','Código','Descripción','Cant','UM',
                  'Lote','Caducidad','No.UD','Delivery','Estatus','Origen','Comentarios'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={16} className="text-center py-8 text-gray-400">Cargando...</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={16} className="text-center py-8 text-gray-400">No hay registros</td></tr>
              )}
              {!loading && visible.map(r => {
                const etapa = ETAPAS.find(e => e.key === r.estatus) ?? ETAPAS[0]
                const orig = ORIGEN_CHIP[r.origen ?? 'manual']
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{r.fecha_solicitud?.split('T')[0] ?? '—'}</td>
                    <td className="px-3 py-2">{r.centro_origen}</td>
                    <td className="px-3 py-2">{r.almacen_origen}</td>
                    <td className="px-3 py-2">{r.centro_destino}</td>
                    <td className="px-3 py-2">{r.almacen_destino}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-gray-800">{r.codigo}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-gray-600">{r.descripcion}</td>
                    <td className="px-3 py-2 text-right">{r.cantidad}</td>
                    <td className="px-3 py-2">{r.um}</td>
                    <td className="px-3 py-2">{r.lote}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.fecha_caducidad}</td>
                    <td className="px-3 py-2">{r.no_ud}</td>
                    <td className="px-3 py-2">{r.delivery}</td>
                    <td className="px-3 py-2">
                      <select value={r.estatus}
                        onChange={e => updateEstatus(r.id, e.target.value)}
                        style={{ background: etapa.bg, color: etapa.color, borderColor: etapa.border }}
                        className="border rounded-lg px-2 py-1 text-xs outline-none font-medium w-36">
                        {ETAPAS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: orig.bg, color: orig.color }}>{orig.label}</span>
                    </td>
                    <td className="px-3 py-2 min-w-32">
                      <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                        defaultValue={r.comentarios ?? ''}
                        onBlur={e => { if (e.target.value !== (r.comentarios ?? '')) updateComentarios(r.id, e.target.value) }}
                        placeholder="Comentario..." />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Pegar desde Excel */}
      {showPaste && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-8 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-base font-bold text-gray-800">Pegar desde Excel</h2>
                <p className="text-xs text-gray-400 mt-0.5">Columnas: Fecha solicitud · Centro Origen · Almacén Origen · Centro Destino · Almacén Destino · Código · Descripción · Cantidad · UM · Lote · Fecha Caducidad · No.UD · Delivery · Estatus · Comentarios</p>
              </div>
              <button onClick={() => { setShowPaste(false); setPasteText(''); setPasteRows([]) }}
                className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-teal-400"
                rows={6} placeholder="Pega aquí tus filas de Excel (con encabezados)..."
                value={pasteText}
                onChange={e => { setPasteText(e.target.value); parsePaste(e.target.value) }} />
              {pasteRows.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">{pasteRows.length} materiales detectados</p>
                  <div className="overflow-x-auto max-h-48 border border-gray-200 rounded-lg">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>{['Fecha','C.Orig','C.Dest','Código','Descripción','Cant','UM','Lote'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {pasteRows.map((r, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-3 py-1.5">{r.fecha_solicitud}</td>
                            <td className="px-3 py-1.5">{r.centro_origen}</td>
                            <td className="px-3 py-1.5">{r.centro_destino}</td>
                            <td className="px-3 py-1.5 font-mono font-semibold">{r.codigo}</td>
                            <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{r.descripcion}</td>
                            <td className="px-3 py-1.5 text-right">{r.cantidad}</td>
                            <td className="px-3 py-1.5">{r.um}</td>
                            <td className="px-3 py-1.5">{r.lote}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <button onClick={() => { setShowPaste(false); setPasteText(''); setPasteRows([]) }}
                  className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={guardarPaste} disabled={saving || pasteRows.length === 0}
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
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
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-5xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-base font-bold text-gray-800">Nueva solicitud manual</h2>
              <button onClick={() => { setShowNueva(false); setManualRows([emptyRow()]) }}
                className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-max">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Fecha sol.','C.Origen','Alm.Orig','C.Destino','Alm.Dest','Código *','Descripción',
                        'Cant *','UM','Lote','Caducidad','No.UD','Delivery','Comentarios',''].map(h => (
                        <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {manualRows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        {[
                          { f:'fecha_solicitud', type:'date', w:'w-32' },
                          { f:'centro_origen', type:'text', w:'w-20', ph:'1031' },
                          { f:'almacen_origen', type:'text', w:'w-20', ph:'0001' },
                          { f:'centro_destino', type:'text', w:'w-20', ph:'1030' },
                          { f:'almacen_destino', type:'text', w:'w-20', ph:'0001' },
                          { f:'codigo', type:'text', w:'w-28', ph:'Material' },
                          { f:'descripcion', type:'text', w:'w-40', ph:'Descripción' },
                          { f:'cantidad', type:'number', w:'w-20', ph:'0' },
                          { f:'um', type:'text', w:'w-16', ph:'PZA' },
                          { f:'lote', type:'text', w:'w-24', ph:'Lote' },
                          { f:'fecha_caducidad', type:'date', w:'w-32' },
                          { f:'no_ud', type:'text', w:'w-24', ph:'No.UD' },
                          { f:'delivery', type:'text', w:'w-24', ph:'Delivery' },
                          { f:'comentarios', type:'text', w:'w-32', ph:'Comentarios' },
                        ].map(col => (
                          <td key={col.f} className="px-1 py-1">
                            <input type={col.type}
                              className={`${col.w} border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400`}
                              placeholder={(col as any).ph ?? ''}
                              value={(r as any)[col.f]}
                              onChange={e => setMRow(i, col.f, e.target.value)} />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button onClick={() => setManualRows(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-red-400 hover:text-red-600 px-1">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={() => setManualRows(prev => [...prev, emptyRow()])}
                className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
                + Agregar fila
              </button>
              <div className="flex justify-between mt-4">
                <button onClick={() => { setShowNueva(false); setManualRows([emptyRow()]) }}
                  className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={guardarManual} disabled={saving}
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
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
