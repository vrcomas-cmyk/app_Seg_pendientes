import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'

function MaterialInput({ value, onChange, onSelect }: {
  value: string
  onChange: (v: string) => void
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
      <input ref={inputRef} value={value}
        onChange={e => search(e.target.value)}
        onFocus={() => { if (value.length >= 2) { updatePos(); setOpen(true) } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full border border-teal-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-500 font-mono bg-green-50"
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
              {s.um && <span style={{ color: '#9ca3af' }}>{s.um}</span>}
            </button>
          ))}
        </div>, document.body
      )}
    </div>
  )
}

const emptyRow = () => ({
  codigo: '', descripcion: '', cantidad: '', um: '',
  lote: '', caducidad: '', precio_unitario: '',
  enCatalogo: true,
})

export default function MscEntradaManualPage() {
  const nav = useNavigate()
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    folio_clave: '',
    origen_entrega: '',
    motivo: '',
  })
  const [rows, setRows] = useState([emptyRow()])
  const [saving, setSaving] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const setF = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }))
  const setRow = (i: number, field: string, val: any) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const parsePaste = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) return
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    const idx = (names: string[]) => {
      for (const n of names) {
        const i = headers.findIndex(h => h.includes(n))
        if (i >= 0) return i
      }
      return -1
    }
    const parsed = lines.slice(1).map(line => {
      const cols = line.split('\t')
      const get = (names: string[]) => { const i = idx(names); return i >= 0 ? cols[i]?.trim() ?? '' : '' }
      return {
        codigo:         get(['codigo', 'material', 'clave']),
        descripcion:    get(['descripcion', 'denominacion', 'descripción']),
        cantidad:       get(['cantidad']),
        um:             get(['um']),
        lote:           get(['lote']),
        caducidad:      get(['caducidad', 'fecha caducidad']),
        precio_unitario: get(['precio', 'precio unit']),
        enCatalogo:     true,
      }
    }).filter(r => r.codigo)
    if (parsed.length > 0) {
      setRows(parsed)
      setShowPaste(false)
      setPasteText('')
      toast.success(`${parsed.length} materiales cargados`)
    }
  }

  const totalUnidades = rows.reduce((a, r) => a + (parseFloat(r.cantidad) || 0), 0)
  const totalImporte = rows.reduce((a, r) => a + ((parseFloat(r.cantidad) || 0) * (parseFloat(r.precio_unitario) || 0)), 0)

  const guardar = async () => {
    if (!form.folio_clave.trim()) return toast.error('La clave/folio de identificación es obligatoria')
    const validRows = rows.filter(r => r.codigo && r.cantidad)
    if (validRows.length === 0) return toast.error('Agrega al menos un material con código y cantidad')
    setSaving(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { toast.error('Sin sesión'); setSaving(false); return }

    // 1. Crear solicitud MSC como entrada manual en_proceso
    const { data: sol, error: solErr } = await supabase.from('msc_solicitudes').insert({
      tipo:              'entrada_manual',
      estatus:           'en_proceso',
      motivo:            form.motivo || 'Entrada manual',
      asunto:            form.folio_clave,
      solicitante:       session.user.email,
      origen_entrega:    form.origen_entrega || null,
      numero_pedido_sap: form.folio_clave,
      fecha:             form.fecha,
      created_by:        session.user.id,
    }).select().single()

    if (solErr || !sol) { toast.error('Error al crear solicitud: ' + solErr?.message); setSaving(false); return }

    // 2. Crear items MSC
    const { error: itemsErr } = await supabase.from('msc_items').insert(
      validRows.map(r => ({
        solicitud_id:    sol.id,
        codigo:          r.codigo,
        descripcion:     r.descripcion || null,
        cantidad_pedida: parseFloat(r.cantidad) || 0,
        precio_unitario: parseFloat(r.precio_unitario) || null,
        total:           (parseFloat(r.cantidad) || 0) * (parseFloat(r.precio_unitario) || 0) || null,
        estatus_linea:   'activo',
      }))
    )
    if (itemsErr) { toast.error('Error en items: ' + itemsErr.message); setSaving(false); return }

    // 3. Crear recepción directa (entra directo al inventario)
    const { data: rec, error: recErr } = await supabase.from('msc_recepciones').insert({
      solicitud_id: sol.id,
      fecha_recepcion: form.fecha,
      notas: `Entrada manual — ${form.folio_clave}`,
      created_by: session.user.id,
    }).select().single()

    if (recErr || !rec) { toast.error('Error en recepción: ' + recErr?.message); setSaving(false); return }

    // 4. Crear items de recepción (disponibles en inventario)
    const { error: recItemsErr } = await supabase.from('msc_recepcion_items').insert(
      validRows.map(r => ({
        recepcion_id:      rec.id,
        solicitud_id:      sol.id,
        codigo:            r.codigo,
        descripcion:       r.descripcion || null,
        cantidad_recibida: parseFloat(r.cantidad) || 0,
        lote:              r.lote || null,
        fecha_caducidad:   r.caducidad || null,
        precio_unitario:   parseFloat(r.precio_unitario) || null,
      }))
    )

    if (recItemsErr) { toast.error('Error en items recepción: ' + recItemsErr.message); setSaving(false); return }

    toast.success('Entrada registrada — material disponible en inventario')
    nav(`/msc/${sol.id}`)
    setSaving(false)
  }

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <button onClick={() => nav('/msc')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 block">← MSC</button>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Nueva entrada manual</h1>
      <p className="text-sm text-gray-400 mb-6">Material recibido directamente — entra al inventario sin proceso de autorización</p>

      {/* Datos generales */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Datos generales</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fecha de recepción *</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              value={form.fecha} onChange={e => setF('fecha', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Clave / Folio de identificación *</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="FAC-2026-001, Dr. García, Marketing-Prueba..."
              value={form.folio_clave} onChange={e => setF('folio_clave', e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="text-xs text-gray-500 block mb-1">Quién entrega / Origen del material</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Nombre del proveedor, persona o área que entrega..."
              value={form.origen_entrega} onChange={e => setF('origen_entrega', e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="text-xs text-gray-500 block mb-1">Motivo / Descripción</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Donativo, prueba de producto, muestra de marketing..."
              value={form.motivo} onChange={e => setF('motivo', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Materiales */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Materiales recibidos</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowPaste(true)}
              className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
              Pegar desde Excel
            </button>
            <button onClick={addRow}
              className="text-xs border border-teal-300 text-teal-700 px-3 py-1.5 rounded-lg hover:bg-teal-50 font-medium">
              + Agregar fila
            </button>
          </div>
        </div>

        {showPaste && (
          <div className="mb-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-2">Pega filas de Excel con encabezados: Código, Descripción, Cantidad, UM, Lote, Caducidad, Precio</p>
            <textarea rows={5} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-teal-400"
              placeholder="Pega aquí..." value={pasteText} onChange={e => setPasteText(e.target.value)} />
            <div className="flex gap-2 mt-2 justify-end">
              <button onClick={() => { setShowPaste(false); setPasteText('') }}
                className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg">Cancelar</button>
              <button onClick={() => parsePaste(pasteText)}
                className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg">Cargar</button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-max">
            <thead>
              <tr className="bg-gray-50">
                {['Código','Descripción','Cantidad','UM','Lote','Caducidad','Precio unit.',''].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={`border-b border-gray-100 ${!r.enCatalogo && r.codigo ? 'bg-amber-50' : ''}`}>
                  <td className="px-1 py-1 w-36">
                    <MaterialInput value={r.codigo}
                      onChange={v => {
                        setRow(i, 'codigo', v)
                        setRow(i, 'enCatalogo', false)
                      }}
                      onSelect={(m, d, um) => {
                        setRow(i, 'codigo', m)
                        setRow(i, 'descripcion', d)
                        if (um) setRow(i, 'um', um)
                        setRow(i, 'enCatalogo', true)
                      }} />
                    {!r.enCatalogo && r.codigo && (
                      <p className="text-xs text-amber-600 mt-0.5">Material externo</p>
                    )}
                  </td>
                  <td className="px-1 py-1 w-56">
                    <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                      value={r.descripcion} onChange={e => setRow(i, 'descripcion', e.target.value)}
                      placeholder="Descripción..." />
                  </td>
                  <td className="px-1 py-1 w-20">
                    <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400 text-right"
                      value={r.cantidad} onChange={e => setRow(i, 'cantidad', e.target.value)} />
                  </td>
                  <td className="px-1 py-1 w-16">
                    <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                      value={r.um} onChange={e => setRow(i, 'um', e.target.value)} placeholder="PZA" />
                  </td>
                  <td className="px-1 py-1 w-24">
                    <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                      value={r.lote} onChange={e => setRow(i, 'lote', e.target.value)} placeholder="Lote" />
                  </td>
                  <td className="px-1 py-1 w-32">
                    <input type="date" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                      value={r.caducidad} onChange={e => setRow(i, 'caducidad', e.target.value)} />
                  </td>
                  <td className="px-1 py-1 w-24">
                    <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400 text-right"
                      value={r.precio_unitario} onChange={e => setRow(i, 'precio_unitario', e.target.value)}
                      placeholder="0.00" />
                  </td>
                  <td className="px-1 py-1">
                    <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 px-1">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-5 flex justify-between items-center flex-wrap gap-4">
        <div className="flex gap-6 flex-wrap">
          <div>
            <p className="text-xs text-gray-500">Materiales</p>
            <p className="text-lg font-bold text-gray-800">{rows.filter(r => r.codigo).length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Unidades totales</p>
            <p className="text-lg font-bold text-gray-800">{totalUnidades.toLocaleString('es-MX')}</p>
          </div>
          {totalImporte > 0 && (
            <div>
              <p className="text-xs text-gray-500">Importe total</p>
              <p className="text-lg font-bold text-gray-800">${totalImporte.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
          )}
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-center">
          <p className="text-xs font-semibold text-green-700">Entra directo al inventario</p>
          <p className="text-xs text-green-600">Disponible para salida inmediata</p>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-between">
        <button onClick={() => nav('/msc')}
          className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
          Cancelar
        </button>
        <button onClick={guardar} disabled={saving}
          className="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
          {saving ? 'Registrando...' : 'Registrar entrada → disponible en inventario'}
        </button>
      </div>
    </div>
  )
}
