import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'

const ESTATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  sin_contactar: { label: 'Sin contactar', bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' },
  contactado:    { label: 'Contactado',    bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  interesado:    { label: 'Interesado',    bg: '#FEF3C7', color: '#92400E', border: '#FCD34D' },
  acepto:        { label: 'Aceptó',        bg: '#D1FAE5', color: '#065F46', border: '#6EE7B7' },
  no_acepto:     { label: 'No aceptó',     bg: '#FEE2E2', color: '#991B1B', border: '#FCA5A5' },
  archivado:     { label: 'Archivado',     bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB' },
}

const RESPUESTA_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pendiente: { label: 'Pendiente', bg: '#FEF3C7', color: '#92400E' },
  acepta:    { label: 'Acepta',    bg: '#D1FAE5', color: '#065F46' },
  no_acepta: { label: 'No acepta', bg: '#FEE2E2', color: '#991B1B' },
}

const emptyMat = () => ({ material: '', descripcion: '', cantidad: '', um: '', respuesta: 'pendiente' })

function MaterialInput({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void
  onSelect: (m: string, d: string, um: string) => void
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
      .select('material, descripcion, um').ilike('material', `%${q}%`).limit(10)
    setSugs(data ?? []); updatePos(); setOpen(true)
  }

  return (
    <div className="relative">
      <input ref={inputRef} value={value} onChange={e => search(e.target.value)}
        onFocus={() => { if (value.length >= 2) { updatePos(); setOpen(true) } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400"
        placeholder="Código..." />
      {open && sugs.length > 0 && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
          maxHeight: 220, overflowY: 'auto', background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {sugs.map(s => (
            <button key={s.material} type="button"
              onMouseDown={() => { onSelect(s.material, s.descripcion ?? '', s.um ?? ''); setOpen(false) }}
              style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', padding: '7px 12px',
                fontSize: 12, background: 'transparent', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
              onMouseOver={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, minWidth: 80 }}>{s.material}</span>
              <span style={{ color: '#6b7280', flex: 1 }}>{s.descripcion}</span>
              {s.um && <span style={{ color: '#9ca3af', flexShrink: 0 }}>{s.um}</span>}
            </button>
          ))}
        </div>, document.body
      )}
    </div>
  )
}

export default function CrmProspectosPage() {
  const nav = useNavigate()
  const [prospectos, setProspectos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showSeguimiento, setShowSeguimiento] = useState<any>(null)
  const [showHistorial, setShowHistorial] = useState<any>(null)
  const [showMSC, setShowMSC] = useState<any>(null)
  const [duplicados, setDuplicados] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [busquedaStep, setBusquedaStep] = useState<'buscar' | 'form'>('buscar')

  const [form, setForm] = useState({
    rfc: '', razon_social: '', contacto: '', cargo: '',
    telefono: '', email: '', notas: '',
  })
  const [materiales, setMateriales] = useState([emptyMat()])
  const [pasteText, setPasteText] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  const [segForm, setSegForm] = useState({ comentario: '', resultado: '' })
  const [mscForm, setMscForm] = useState({ no_cliente: '', folio_sap: '', motivo: 'Donativo' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }
    const { data } = await supabase
      .from('crm_prospectos')
      .select(`*, crm_prospecto_materiales(*), crm_prospecto_seguimientos(*)`)
      .eq('created_by', session.user.id)
      .not('estatus', 'in', '(archivado,no_acepto)')
      .order('created_at', { ascending: false })
    setProspectos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Buscar duplicados en tiempo real
  const buscarDuplicados = async (q: string) => {
    setSearchQuery(q)
    if (q.length < 2) { setDuplicados([]); return }
    const { data } = await supabase.from('crm_prospectos')
      .select('id, rfc, razon_social, contacto, telefono, estatus, created_at, crm_prospecto_materiales(*), crm_prospecto_seguimientos(*)')
      .or(`rfc.ilike.%${q}%,razon_social.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(5)
    setDuplicados(data ?? [])
  }

  const setF = (k: string, v: string) => {
    setForm(prev => ({ ...prev, [k]: v }))
    if (['rfc','razon_social','telefono'].includes(k)) buscarDuplicados(v)
  }

  const setMat = (i: number, field: string, val: string) =>
    setMateriales(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  const parsePaste = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 1) return
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase())
    const matIdx = headers.findIndex(h => h.includes('material') || h.includes('código') || h.includes('codigo'))
    const descIdx = headers.findIndex(h => h.includes('denominación') || h.includes('denominacion') || h.includes('descripcion'))
    const cantIdx = headers.findIndex(h => h.includes('cantidad'))
    const umIdx = headers.findIndex(h => h === 'um')
    const parsed = lines.slice(1).map(line => {
      const cols = line.split('\t')
      return {
        material:   matIdx >= 0 ? cols[matIdx]?.trim() ?? '' : '',
        descripcion: descIdx >= 0 ? cols[descIdx]?.trim() ?? '' : '',
        cantidad:   cantIdx >= 0 ? cols[cantIdx]?.trim() ?? '' : '',
        um:         umIdx >= 0 ? cols[umIdx]?.trim() ?? '' : '',
        respuesta:  'pendiente',
      }
    }).filter(r => r.material)
    if (parsed.length > 0) {
      setMateriales(parsed)
      setShowPaste(false)
      setPasteText('')
      toast.success(`${parsed.length} materiales cargados`)
    }
  }

  const guardar = async () => {
    if (!form.razon_social) return toast.error('La Razón Social es obligatoria')
    const validMats = materiales.filter(m => m.material)
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { data: prosp, error } = await supabase.from('crm_prospectos').insert({
      ...form, estatus: 'sin_contactar', created_by: session?.user.id
    }).select().single()
    if (error || !prosp) { toast.error('Error al guardar'); setSaving(false); return }
    if (validMats.length > 0) {
      await supabase.from('crm_prospecto_materiales').insert(
        validMats.map(m => ({ ...m, prospecto_id: prosp.id, cantidad: parseFloat(m.cantidad) || null }))
      )
    }
    toast.success('Prospecto guardado')
    setShowForm(false); setBusquedaStep('buscar'); setSearchQuery('')
    setForm({ rfc:'',razon_social:'',contacto:'',cargo:'',telefono:'',email:'',notas:'' })
    setMateriales([emptyMat()]); setDuplicados([])
    load(); setSaving(false)
  }

  const guardarSeguimiento = async () => {
    if (!segForm.comentario) return toast.error('Escribe un comentario')
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('crm_prospecto_seguimientos').insert({
      prospecto_id: showSeguimiento.id,
      comentario: segForm.comentario,
      resultado: segForm.resultado || null,
      created_by: session?.user.id,
    })
    if (segForm.resultado) {
      const estatusMap: Record<string,string> = {
        'interesado':'interesado', 'no interesado':'no_acepto',
        'acepto':'acepto', 'sin respuesta':'contactado'
      }
      const nuevoEstatus = estatusMap[segForm.resultado.toLowerCase()]
      if (nuevoEstatus) await supabase.from('crm_prospectos').update({ estatus: nuevoEstatus }).eq('id', showSeguimiento.id)
    } else {
      await supabase.from('crm_prospectos').update({ estatus: 'contactado' }).eq('id', showSeguimiento.id)
    }
    await supabase.from('crm_prospectos').update({ updated_at: new Date().toISOString() }).eq('id', showSeguimiento.id)
    toast.success('Seguimiento registrado')
    setShowSeguimiento(null); setSegForm({ comentario:'', resultado:'' })
    load()
  }

  const actualizarRespuestaMat = async (matId: string, respuesta: string, prospectoId: string) => {
    await supabase.from('crm_prospecto_materiales').update({ respuesta }).eq('id', matId)
    setProspectos(prev => prev.map(p => p.id === prospectoId ? {
      ...p, crm_prospecto_materiales: p.crm_prospecto_materiales.map((m: any) =>
        m.id === matId ? { ...m, respuesta } : m
      )
    } : p))
  }

  const archivar = async (id: string, estatus: string) => {
    await supabase.from('crm_prospectos').update({ estatus }).eq('id', id)
    toast.success(estatus === 'archivado' ? 'Archivado' : 'Cerrado')
    load()
  }

  const generarMSC = async () => {
    const p = showMSC
    const matsAceptados = p.crm_prospecto_materiales.filter((m: any) => m.respuesta === 'acepta')
    if (matsAceptados.length === 0) return toast.error('No hay materiales aceptados')
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()

    // Crear o buscar cliente en CRM
    let clienteId: string | null = null
    if (mscForm.no_cliente) {
      const { data: cli } = await supabase.from('crm_clients')
        .select('id').ilike('solicitante', mscForm.no_cliente).maybeSingle()
      if (cli) clienteId = cli.id
      else {
        const { data: newCli } = await supabase.from('crm_clients').insert({
          solicitante: mscForm.no_cliente, razon_social: p.razon_social,
          rfc: p.rfc, created_by: session?.user.id,
        }).select('id').single()
        clienteId = newCli?.id ?? null
      }
    }

    // Crear solicitud MSC
    const { data: msc } = await supabase.from('msc_solicitudes').insert({
      motivo: mscForm.motivo,
      destinatario_nombre: p.contacto || p.razon_social,
      razon_social_dest: p.razon_social,
      solicitante: session?.user?.email ?? '',
      numero_pedido_sap: mscForm.folio_sap || null,
      client_id: clienteId,
      estatus: 'enviada',
      created_by: session?.user.id,
    }).select().single()

    if (msc) {
      await supabase.from('msc_items').insert(
        matsAceptados.map((m: any) => ({
          solicitud_id: msc.id,
          codigo: m.material,
          descripcion: m.descripcion,
          cantidad_pedida: m.cantidad || 1,
          estatus_linea: 'activo',
          created_by: session?.user.id,
        }))
      )
      await supabase.from('crm_prospectos').update({ estatus: 'acepto' }).eq('id', p.id)
      toast.success('MSC generada correctamente')
      setShowMSC(null)
      setMscForm({ no_cliente:'', folio_sap:'', motivo:'Donativo' })
      load()
    }
    setSaving(false)
  }

  const cuentas = {
    sin_contactar: prospectos.filter(p => p.estatus === 'sin_contactar').length,
    contactado: prospectos.filter(p => p.estatus === 'contactado').length,
    interesado: prospectos.filter(p => p.estatus === 'interesado').length,
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <button onClick={() => nav('/crm/pipeline')} className="text-sm text-gray-400 hover:text-gray-600 mb-1 block">← Pipeline</button>
          <h1 className="text-xl font-bold text-gray-800">Prospectos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Clientes externos — donativos y ofertas especiales</p>
        </div>
        <button onClick={() => { setShowForm(true); setBusquedaStep('buscar') }}
          className="bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700">
          Buscar o crear prospecto
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { key: 'sin_contactar', label: 'Sin contactar' },
          { key: 'contactado', label: 'Contactados' },
          { key: 'interesado', label: 'Interesados' },
        ].map(m => {
          const cfg = ESTATUS_CONFIG[m.key]
          return (
            <div key={m.key} style={{ background: cfg.bg, borderColor: cfg.border }}
              className="rounded-xl p-3 border">
              <p className="text-xs mb-1" style={{ color: cfg.color }}>{m.label}</p>
              <p className="text-2xl font-bold" style={{ color: cfg.color }}>{(cuentas as any)[m.key]}</p>
            </div>
          )
        })}
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {loading && <p className="text-sm text-gray-400 py-8 text-center">Cargando...</p>}
        {!loading && prospectos.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-sm">No hay prospectos activos.</p>
            <button onClick={() => { setShowForm(true); setBusquedaStep('buscar') }}
              className="mt-3 text-sm text-teal-600 font-medium hover:text-teal-700">
              + Crear primer prospecto
            </button>
          </div>
        )}
        {!loading && prospectos.map(p => {
          const cfg = ESTATUS_CONFIG[p.estatus] ?? ESTATUS_CONFIG.sin_contactar
          const mats: any[] = p.crm_prospecto_materiales ?? []
          const segs: any[] = p.crm_prospecto_seguimientos ?? []
          const tieneAceptados = mats.some(m => m.respuesta === 'acepta')
          const ultimoSeg = segs.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]

          return (
            <div key={p.id} style={{ borderLeftColor: cfg.border }}
              className="bg-white border border-gray-200 border-l-4 rounded-xl p-4">
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  {/* Fila 1 */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-sm font-semibold text-gray-800">{p.razon_social}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                  {/* Fila 2 */}
                  <div className="flex gap-3 text-xs text-gray-400 flex-wrap mb-3">
                    {p.contacto && <span>{p.contacto}{p.cargo ? ` · ${p.cargo}` : ''}</span>}
                    {p.telefono && <span>{p.telefono}</span>}
                    {p.email && <span>{p.email}</span>}
                    {p.rfc && <span className="font-mono">{p.rfc}</span>}
                  </div>
                  {/* Tabla materiales */}
                  {mats.length > 0 && (
                    <div className="overflow-x-auto mb-2">
                      <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
                        <thead>
                          <tr className="bg-gray-50">
                            {['Código','Denominación','Cant.','UM','Respuesta'].map(h => (
                              <th key={h} className="px-3 py-1.5 text-left text-gray-500 font-semibold border-b border-gray-200">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mats.map(m => {
                            const rCfg = RESPUESTA_CONFIG[m.respuesta ?? 'pendiente']
                            return (
                              <tr key={m.id} className="border-b border-gray-100 last:border-0">
                                <td className="px-3 py-1.5 font-mono font-semibold text-gray-800">{m.material}</td>
                                <td className="px-3 py-1.5 text-gray-500 max-w-xs truncate">{m.descripcion}</td>
                                <td className="px-3 py-1.5 text-right">{m.cantidad}</td>
                                <td className="px-3 py-1.5">{m.um}</td>
                                <td className="px-3 py-1.5">
                                  <select value={m.respuesta ?? 'pendiente'}
                                    onChange={e => actualizarRespuestaMat(m.id, e.target.value, p.id)}
                                    style={{ background: rCfg.bg, color: rCfg.color }}
                                    className="border-0 rounded-full px-2 py-0.5 text-xs font-medium outline-none cursor-pointer">
                                    <option value="pendiente">Pendiente</option>
                                    <option value="acepta">Acepta</option>
                                    <option value="no_acepta">No acepta</option>
                                  </select>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {ultimoSeg && (
                    <p className="text-xs text-gray-400 mt-1">
                      Último seguimiento: {new Date(ultimoSeg.created_at).toLocaleDateString('es-MX')} — {ultimoSeg.comentario}
                    </p>
                  )}
                </div>

                {/* Botones */}
                <div className="flex flex-col gap-2 items-end flex-shrink-0">
                  {tieneAceptados && (
                    <button onClick={() => setShowMSC(p)}
                      className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700 font-medium whitespace-nowrap">
                      Generar MSC →
                    </button>
                  )}
                  <button onClick={() => setShowSeguimiento(p)}
                    className="text-xs border border-teal-300 text-teal-700 px-3 py-1.5 rounded-lg hover:bg-teal-50 whitespace-nowrap">
                    + Seguimiento
                  </button>
                  <button onClick={() => setShowHistorial(p)}
                    className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                    Ver historial
                  </button>
                  <button onClick={() => archivar(p.id, 'archivado')}
                    className="text-xs text-gray-400 hover:text-red-500 px-3 py-1.5 whitespace-nowrap">
                    Archivar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: Buscar o crear prospecto */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-6 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-base font-bold text-gray-800">
                {busquedaStep === 'buscar' ? 'Buscar prospecto' : 'Nuevo prospecto'}
              </h2>
              <button onClick={() => { setShowForm(false); setBusquedaStep('buscar'); setSearchQuery(''); setDuplicados([]); setForm({ rfc:'',razon_social:'',contacto:'',cargo:'',telefono:'',email:'',notas:'' }); setMateriales([emptyMat()]) }}
                className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-6">
              {busquedaStep === 'buscar' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Busca por RFC, Razón Social, teléfono o email para verificar si ya existe un registro.</p>
                  <input autoFocus
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-teal-400"
                    placeholder="Escribe RFC, Razón Social, teléfono o email..."
                    value={searchQuery}
                    onChange={e => buscarDuplicados(e.target.value)} />

                  {/* Resultados de búsqueda */}
                  {duplicados.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                        Se encontraron {duplicados.length} registro(s) existente(s):
                      </p>
                      {duplicados.map(d => {
                        const cfg = ESTATUS_CONFIG[d.estatus] ?? ESTATUS_CONFIG.sin_contactar
                        const mats = d.crm_prospecto_materiales ?? []
                        const segs = d.crm_prospecto_seguimientos ?? []
                        const ultimoSeg = segs.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]
                        return (
                          <div key={d.id} style={{ borderLeftColor: cfg.border }}
                            className="border border-gray-200 border-l-4 rounded-xl p-4">
                            <div className="flex justify-between items-start gap-3 flex-wrap">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-sm font-semibold text-gray-800">{d.razon_social}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                </div>
                                {d.rfc && <p className="text-xs text-gray-400 font-mono mb-1">RFC: {d.rfc}</p>}
                                {mats.length > 0 && (
                                  <p className="text-xs text-gray-500 mb-1">
                                    Materiales ofertados: {mats.map((m: any) => m.material).join(', ')}
                                  </p>
                                )}
                                {ultimoSeg && (
                                  <p className="text-xs text-gray-400">
                                    Último contacto: {new Date(ultimoSeg.created_at).toLocaleDateString('es-MX')} — {ultimoSeg.comentario}
                                  </p>
                                )}
                              </div>
                              <button onClick={() => { setShowForm(false); setShowHistorial(d); setSearchQuery(''); setDuplicados([]) }}
                                className="text-xs bg-teal-600 text-white px-3 py-2 rounded-lg hover:bg-teal-700 whitespace-nowrap">
                                Abrir registro
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2">
                    <p className="text-xs text-gray-400">
                      {searchQuery.length >= 2 && duplicados.length === 0 ? 'Sin coincidencias — puedes crear un nuevo registro.' : ''}
                    </p>
                    <button
                      onClick={() => {
                        setBusquedaStep('form')
                        if (searchQuery.length >= 2) {
                          // Precompletar con lo buscado
                          if (searchQuery.includes('@')) setForm(prev => ({ ...prev, email: searchQuery }))
                          else if (/^\d/.test(searchQuery)) setForm(prev => ({ ...prev, telefono: searchQuery }))
                          else if (searchQuery.length <= 15 && searchQuery.toUpperCase() === searchQuery) setForm(prev => ({ ...prev, rfc: searchQuery }))
                          else setForm(prev => ({ ...prev, razon_social: searchQuery }))
                        }
                      }}
                      className="bg-teal-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700">
                      Crear nuevo prospecto →
                    </button>
                  </div>
                </div>
              )}

              {busquedaStep === 'form' && (
                <div className="space-y-5">
                  {/* Datos del prospecto */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Datos del prospecto</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">RFC</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                          value={form.rfc} onChange={e => setF('rfc', e.target.value)} placeholder="RFC..." />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-1">Denominación / Razón Social *</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                          value={form.razon_social} onChange={e => setF('razon_social', e.target.value)} placeholder="RAZÓN SOCIAL..." />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Representante / Contacto</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                          value={form.contacto} onChange={e => setF('contacto', e.target.value)} placeholder="Nombre..." />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Cargo</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                          value={form.cargo} onChange={e => setF('cargo', e.target.value)} placeholder="Director..." />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Teléfono *</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                          value={form.telefono} onChange={e => setF('telefono', e.target.value)} placeholder="333-000-1111" />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-1">E-mail *</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                          value={form.email} onChange={e => setF('email', e.target.value)} placeholder="correo@institución.mx" />
                      </div>
                      <div className="col-span-2 sm:col-span-3">
                        <label className="text-xs text-gray-500 block mb-1">Notas / Puntos adicionales</label>
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                          value={form.notas} onChange={e => setF('notas', e.target.value)} placeholder="Dirección, zona, observaciones..." />
                      </div>
                    </div>

                    {/* Aviso de duplicados mientras se llena el form */}
                    {duplicados.length > 0 && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-700 mb-1">⚠ Posible duplicado detectado:</p>
                        {duplicados.slice(0,2).map(d => (
                          <div key={d.id} className="flex justify-between items-center">
                            <p className="text-xs text-amber-700">{d.razon_social} — {ESTATUS_CONFIG[d.estatus]?.label}</p>
                            <button onClick={() => { setShowForm(false); setShowHistorial(d) }}
                              className="text-xs text-teal-600 underline">Ver registro</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Materiales */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-semibold text-gray-700">Materiales a ofertar</h3>
                      <button onClick={() => setShowPaste(true)}
                        className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                        Pegar desde Excel
                      </button>
                    </div>

                    {showPaste && (
                      <div className="mb-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-2">Pega las filas de Excel (con encabezados: Material, Denominación, Cantidad, UM)</p>
                        <textarea rows={4}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-teal-400"
                          placeholder="Pega aquí..."
                          value={pasteText}
                          onChange={e => setPasteText(e.target.value)} />
                        <div className="flex gap-2 mt-2 justify-end">
                          <button onClick={() => { setShowPaste(false); setPasteText('') }}
                            className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg">Cancelar</button>
                          <button onClick={() => parsePaste(pasteText)}
                            className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg">Cargar</button>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
                        <thead>
                          <tr className="bg-gray-50">
                            {['Código','Denominación','Cantidad','UM',''].map(h => (
                              <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {materiales.map((m, i) => (
                            <tr key={i} className="border-b border-gray-100 last:border-0">
                              <td className="px-1 py-1 w-32">
                                <MaterialInput value={m.material} onChange={v => setMat(i, 'material', v)}
                                  onSelect={(mat, desc, um) => {
                                    setMat(i, 'material', mat)
                                    setMat(i, 'descripcion', desc)
                                    if (um) setMat(i, 'um', um)
                                  }} />
                              </td>
                              <td className="px-1 py-1">
                                <input className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                                  value={m.descripcion} onChange={e => setMat(i, 'descripcion', e.target.value)} placeholder="Denominación..." />
                              </td>
                              <td className="px-1 py-1 w-24">
                                <input type="number" className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400 text-right"
                                  value={m.cantidad} onChange={e => setMat(i, 'cantidad', e.target.value)} />
                              </td>
                              <td className="px-1 py-1 w-16">
                                <input className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                                  value={m.um} onChange={e => setMat(i, 'um', e.target.value)} placeholder="PZA" />
                              </td>
                              <td className="px-1 py-1">
                                <button onClick={() => setMateriales(prev => prev.filter((_, idx) => idx !== i))}
                                  className="text-red-400 hover:text-red-600 px-1">×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={() => setMateriales(prev => [...prev, emptyMat()])}
                      className="mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
                      + Agregar fila
                    </button>
                  </div>

                  <div className="flex justify-between pt-2">
                    <button onClick={() => setBusquedaStep('buscar')}
                      className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                      ← Volver a búsqueda
                    </button>
                    <button onClick={guardar} disabled={saving}
                      className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                      {saving ? 'Guardando...' : 'Guardar prospecto'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Seguimiento */}
      {showSeguimiento && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-800">Registrar seguimiento</h2>
              <button onClick={() => setShowSeguimiento(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm font-medium text-gray-700">{showSeguimiento.razon_social}</p>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Comentario *</label>
                <textarea rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  placeholder="¿Qué pasó en este contacto?"
                  value={segForm.comentario} onChange={e => setSegForm(x => ({ ...x, comentario: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Resultado</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  value={segForm.resultado} onChange={e => setSegForm(x => ({ ...x, resultado: e.target.value }))}>
                  <option value="">Sin cambio de estatus</option>
                  <option value="interesado">Interesado</option>
                  <option value="acepto">Aceptó materiales</option>
                  <option value="no interesado">No interesado</option>
                  <option value="sin respuesta">Sin respuesta</option>
                </select>
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setShowSeguimiento(null)}
                  className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">Cancelar</button>
                <button onClick={guardarSeguimiento}
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700">
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Historial */}
      {showHistorial && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-6 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-base font-bold text-gray-800">{showHistorial.razon_social}</h2>
                <p className="text-xs text-gray-400">{showHistorial.rfc} · {showHistorial.contacto} · {showHistorial.telefono}</p>
              </div>
              <button onClick={() => setShowHistorial(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Materiales */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Materiales ofertados</h3>
                <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Código','Denominación','Cant.','UM','Respuesta'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(showHistorial.crm_prospecto_materiales ?? []).map((m: any) => {
                      const rCfg = RESPUESTA_CONFIG[m.respuesta ?? 'pendiente']
                      return (
                        <tr key={m.id} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-2 font-mono font-semibold text-gray-800">{m.material}</td>
                          <td className="px-3 py-2 text-gray-500">{m.descripcion}</td>
                          <td className="px-3 py-2 text-right">{m.cantidad}</td>
                          <td className="px-3 py-2">{m.um}</td>
                          <td className="px-3 py-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: rCfg.bg, color: rCfg.color }}>{rCfg.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Historial */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Historial de contactos</h3>
                {(showHistorial.crm_prospecto_seguimientos ?? [])
                  .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
                  .map((s: any) => (
                    <div key={s.id} className="border-l-2 border-teal-200 pl-3 mb-3">
                      <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })}</p>
                      <p className="text-sm text-gray-700">{s.comentario}</p>
                      {s.resultado && <p className="text-xs text-teal-600 font-medium mt-0.5">Resultado: {s.resultado}</p>}
                    </div>
                  ))}
                {(showHistorial.crm_prospecto_seguimientos ?? []).length === 0 && (
                  <p className="text-sm text-gray-400">Sin seguimientos registrados.</p>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowSeguimiento(showHistorial); setShowHistorial(null) }}
                  className="border border-teal-300 text-teal-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-50">
                  + Registrar seguimiento
                </button>
                <button onClick={() => setShowHistorial(null)}
                  className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Generar MSC */}
      {showMSC && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-800">Generar MSC</h2>
              <button onClick={() => setShowMSC(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">{showMSC.razon_social}</p>
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-xs text-teal-700">
                Materiales aceptados: {(showMSC.crm_prospecto_materiales ?? [])
                  .filter((m: any) => m.respuesta === 'acepta')
                  .map((m: any) => m.material).join(', ')}
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">No. Cliente (si ya existe o asignar nuevo)</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={mscForm.no_cliente} onChange={e => setMscForm(x => ({ ...x, no_cliente: e.target.value }))}
                  placeholder="Número de cliente SAP..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Folio / Pedido SAP (opcional)</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={mscForm.folio_sap} onChange={e => setMscForm(x => ({ ...x, folio_sap: e.target.value }))}
                  placeholder="Si ya existe el pedido..." />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Motivo</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={mscForm.motivo} onChange={e => setMscForm(x => ({ ...x, motivo: e.target.value }))} />
              </div>
              <div className="flex justify-between pt-2">
                <button onClick={() => setShowMSC(null)}
                  className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm">Cancelar</button>
                <button onClick={generarMSC} disabled={saving}
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Generando...' : 'Crear MSC →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
