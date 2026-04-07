import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import type { MscItem } from '../../types/msc'

interface ItemRow {
  codigo: string
  descripcion: string
  cantidad_pedida: string
  precio_unitario: string
  total: string
}

const emptyRow = (): ItemRow => ({
  codigo: '', descripcion: '', cantidad_pedida: '', precio_unitario: '', total: ''
})

const COLS = [
  { key: 'codigo',          label: 'Codigo *',       width: 'w-28' },
  { key: 'descripcion',     label: 'Articulo',        width: 'w-64' },
  { key: 'cantidad_pedida', label: 'Cantidad *',      width: 'w-24', type: 'number' },
  { key: 'precio_unitario', label: 'Precio Unitario', width: 'w-32', type: 'number' },
  { key: 'total',           label: 'Total',           width: 'w-32', type: 'number' },
]

// Autosize textarea
function AutoTextarea({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.min(ref.current.scrollHeight, 160) + 'px'
    }
  }, [value])
  return (
    <textarea ref={ref} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className={`${className} resize-none overflow-hidden`}
      rows={2} style={{ minHeight: '64px', maxHeight: '160px' }} />
  )
}

// Autocomplete de materiales
function MaterialInput({ value, onChange, onSelect, field }: {
  value: string
  onChange: (v: string) => void
  onSelect: (codigo: string, descripcion: string) => void
  field: 'codigo' | 'descripcion'
}) {
  const [suggestions, setSuggestions] = useState<Array<{ material: string, descripcion?: string }>>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const MAX_H = 220
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])
  const updatePos = () => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom - 8
    const spaceAbove = r.top - 8
    const above = spaceBelow < MAX_H && spaceAbove > spaceBelow
    setPos({ top: above ? r.top - Math.min(MAX_H, spaceAbove) : r.bottom + 2, left: r.left, width: Math.max(r.width, 320) })
  }
  const search = async (q: string) => {
    onChange(q)
    if (q.length < 2) { setSuggestions([]); setOpen(false); return }
    const col = field === 'codigo' ? 'material' : 'descripcion'
    const { data } = await supabase.from('catalog_materials')
      .select('material, descripcion')
      .ilike(col, `%${q}%`)
      .limit(10)
    setSuggestions(data ?? [])
    updatePos()
    setOpen(true)
  }
  return (
    <div ref={ref} className="relative w-full">
      <input ref={inputRef} type="text"
        className="w-full px-2 py-1.5 text-xs outline-none focus:bg-teal-50 bg-transparent"
        value={value}
        onChange={e => search(e.target.value)}
        onFocus={() => { if (value.length >= 2) { updatePos(); setOpen(true) } }}
      />
      {open && suggestions.length > 0 && typeof window !== 'undefined' && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
          maxHeight: MAX_H + 'px', overflowY: 'auto', background: 'white',
          border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {suggestions.map(s => (
            <button key={s.material} type="button"
              style={{ display: 'flex', gap: '10px', width: '100%', textAlign: 'left',
                padding: '7px 12px', fontSize: '12px', background: 'transparent',
                border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
              onMouseOver={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
              onMouseDown={() => { onSelect(s.material, s.descripcion ?? ''); setOpen(false) }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#111', flexShrink: 0, minWidth: '72px' }}>{s.material}</span>
              <span style={{ color: '#6b7280', lineHeight: '1.4' }}>{s.descripcion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Autocomplete de clientes
function ClienteInput({ value, onChange, onSelect, razonSocial }: {
  value: string
  onChange: (v: string) => void
  onSelect: (id: string, nombre: string, razonSocial: string) => void
  razonSocial?: string
}) {
  const [suggestions, setSuggestions] = useState<Array<{ material: string, descripcion?: string }>>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = async (q: string) => {
    onChange(q)
    if (q.length < 2) { setSuggestions([]); setOpen(false); return }
    const { data } = await supabase.from('crm_clients')
      .select('id, solicitante, razon_social')
      .or(`solicitante.ilike.%${q}%,razon_social.ilike.%${q}%`)
      .limit(10)
    setSuggestions(data ?? [])
    setOpen(true)
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
        placeholder="Buscar por nombre o numero de cliente..."
        value={value}
        onChange={e => search(e.target.value)}
        onFocus={() => value.length >= 2 && setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-full max-h-48 overflow-y-auto mt-1" style={{ position: "absolute" }}>
          {suggestions.map(c => (
            <button key={c.id} type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 border-b border-gray-50 last:border-0"
              onMouseDown={() => {
                onSelect(c.id, c.razon_social ?? c.solicitante, c.solicitante)
                setOpen(false)
              }}>
              <span className="font-semibold text-gray-800">{c.solicitante}</span>
              {c.razon_social && <span className="text-gray-400 ml-2">{c.razon_social}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MscNewPage() {
  const nav = useNavigate()
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    asunto: '',
    motivo: '',
    descripcion: '',
    destinatario_tipo: 'cliente',
    destinatario_nombre: '',
    razon_social_dest: '',
    solicitante: '',
    client_id: '',
  })
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()])
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [saving, setSaving] = useState(false)

  const updateRow = (i: number, key: string, val: string) => {
    setRows(prev => prev.map((r, j) => {
      if (j !== i) return r
      const updated = { ...r, [key]: val }
      if (key === 'cantidad_pedida' || key === 'precio_unitario') {
        const cant = parseFloat(key === 'cantidad_pedida' ? val : r.cantidad_pedida) || 0
        const precio = parseFloat(key === 'precio_unitario' ? val : r.precio_unitario) || 0
        updated.total = cant && precio ? String((cant * precio).toFixed(2)) : ''
      }
      return updated
    }))
  }

  const setRowField = (i: number, codigo: string, descripcion: string) => {
    setRows(prev => prev.map((r, j) => j === i ? { ...r, codigo, descripcion } : r))
  }

  // Parsear Excel con columnas combinadas
  // Código=A(0), Artículo=D(3), Cantidad=M(12), Precio=O(14), Total=R(17)
  const parsePaste = (text: string) => {
    const lines = text.trim().split('\n').filter(Boolean)
    if (!lines.length) return

    // Detectar si tiene encabezado
    const firstCells = lines[0].split('\t')
    const firstVal = firstCells[0]?.trim().toLowerCase()
    const hasHeader = firstVal === 'código' || firstVal === 'codigo' || firstVal === 'code' ||
      (isNaN(parseFloat(firstVal)) && firstVal.length < 20)
    const dataLines = hasHeader ? lines.slice(1) : lines

    const parsed: ItemRow[] = dataLines.map(line => {
      const cells = line.split('\t').map(c => c.trim().replace(/[$,\s]/g, ''))
      const codigo          = cells[0]  ?? ''    // A = índice 0
      const descripcion     = cells[3]  ?? ''    // D = índice 3
      const cantidad_pedida = cells[12] ?? ''    // M = índice 12
      const precio_unitario = cells[14] ?? ''    // O = índice 14
      const total_raw       = cells[17] ?? ''    // R = índice 17

      const cant   = parseFloat(cantidad_pedida) || 0
      const precio = parseFloat(precio_unitario) || 0
      const total  = parseFloat(total_raw) || (cant && precio ? cant * precio : 0)

      return {
        codigo,
        descripcion,
        cantidad_pedida,
        precio_unitario,
        total: total ? String(total.toFixed(2)) : '',
      }
    }).filter(r => r.codigo && r.codigo.length > 0)

    if (parsed.length > 0) {
      setRows(parsed); setPasteMode(false); setPasteText('')
      toast.success(`${parsed.length} material(es) importado(s)`)
    } else {
      toast.error('No se detectaron materiales. Verifica el formato.')
    }
  }

  const save = async (estatus: 'borrador' | 'enviada') => {
    const validRows = rows.filter(r => r.codigo && r.cantidad_pedida)
    if (validRows.length === 0) return toast.error('Agrega al menos un material')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: sol, error } = await supabase.from('msc_solicitudes').insert({
      fecha:               form.fecha,
      motivo:              form.motivo || null,
      descripcion:         form.descripcion || null,
      asunto:              form.asunto || null,
      destinatario_tipo:   form.destinatario_tipo,
      destinatario_nombre: form.destinatario_nombre || null,
      razon_social_dest:   form.razon_social_dest || null,
      solicitante:         form.solicitante || null,
      client_id:           form.client_id || null,
      estatus,
      created_by: user?.id,
    }).select().single()
    if (error || !sol) { toast.error(error?.message ?? 'Error'); setSaving(false); return }
    await supabase.from('msc_items').insert(
      validRows.map(r => ({
        solicitud_id:    sol.id,
        codigo:          r.codigo,
        descripcion:     r.descripcion || null,
        cantidad_pedida: parseFloat(r.cantidad_pedida),
        precio_unitario: parseFloat(r.precio_unitario) || null,
        total:           parseFloat(r.total) || null,
      }))
    )
    toast.success(estatus === 'enviada' ? 'Solicitud enviada' : 'Borrador guardado')
    nav(`/msc/${sol.id}`)
    setSaving(false)
  }

  const openMail = () => {
    const validRows = rows.filter(r => r.codigo)
    const materiales = validRows.map(r =>
      `- ${r.codigo} ${r.descripcion} x${r.cantidad_pedida}`
    ).join('\n')
    const subject = encodeURIComponent(form.asunto ? form.asunto : `Solicitud MSC - ${form.fecha}`)
    const body = encodeURIComponent(
      `Solicitud de mercancia sin cargo\n\nFecha: ${form.fecha}\nSolicitante: ${form.solicitante}\nMotivo: ${form.motivo}\nPara: ${form.destinatario_nombre}\n${form.descripcion ? `\nDescripcion / Justificacion:\n${form.descripcion}\n` : ''}\nMateriales:\n${materiales}`
    )
    const a = document.createElement('a')
    a.href = `mailto:?subject=${subject}&body=${body}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const totalGeneral = rows.reduce((acc, r) => {
    const cant = parseFloat(r.cantidad_pedida) || 0
    const precio = parseFloat(r.precio_unitario) || 0
    return acc + (parseFloat(r.total) || cant * precio)
  }, 0)

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => nav('/msc')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        Volver a MSC
      </button>

      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-bold text-gray-800">Nueva solicitud MSC</h1>
        <button onClick={openMail}
          className="border border-blue-300 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50">
          Abrir correo
        </button>
      </div>

      {/* Datos generales */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="font-semibold text-gray-700 mb-4">Datos generales</h2>
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fecha *</label>
            <input type="date"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              value={form.fecha} onChange={e => setForm(x => ({ ...x, fecha: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Asunto / Referencia</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Ej: Donativo Hospital General Enero 2026"
              value={form.asunto} onChange={e => setForm(x => ({ ...x, asunto: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Quien lo solicita</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Nombre del solicitante"
              value={form.solicitante}
              onChange={e => setForm(x => ({ ...x, solicitante: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Motivo</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Ej: Donativo, Muestra, Reposicion"
              value={form.motivo}
              onChange={e => setForm(x => ({ ...x, motivo: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tipo destinatario</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
              value={form.destinatario_tipo}
              onChange={e => setForm(x => ({ ...x, destinatario_tipo: e.target.value }))}>
              <option value="cliente">Cliente</option>
              <option value="usuario">Usuario interno</option>
              <option value="colaborador">Colaborador</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Destinatario</label>
            <ClienteInput
              value={form.destinatario_nombre}
              onChange={v => setForm(x => ({ ...x, destinatario_nombre: v, client_id: '', razon_social_dest: '' }))}
              onSelect={(id, nombre, rs) => setForm(x => ({ ...x, destinatario_nombre: nombre, client_id: id, razon_social_dest: rs }))}
              razonSocial={form.razon_social_dest}
            />
            {form.client_id && (
              <div className="mt-1">
                <p className="text-xs text-teal-600 font-medium">Cliente vinculado</p>
                {form.razon_social_dest && (
                  <p className="text-xs text-gray-500 mt-0.5">Razón Social: {form.razon_social_dest}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Descripcion / justificacion</label>
          <AutoTextarea
            value={form.descripcion}
            onChange={v => setForm(x => ({ ...x, descripcion: v }))}
            placeholder="Cuerpo del correo o descripcion del motivo..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
          />
        </div>
      </div>

      {/* Materiales */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-700">
            Materiales
            <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {rows.filter(r => r.codigo).length} codigo(s)
            </span>
          </h2>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setPasteMode(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${!pasteMode ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
              Tabla manual
            </button>
            <button onClick={() => setPasteMode(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${pasteMode ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
              Pegar desde Excel
            </button>
          </div>
        </div>

        {pasteMode ? (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-xs text-blue-700">
              <p className="font-semibold mb-1">Formato esperado (columnas combinadas):</p>
              <p className="font-mono">Col A: Codigo &nbsp;|&nbsp; Col D: Articulo &nbsp;|&nbsp; Col M: Cantidad &nbsp;|&nbsp; Col O: Precio Unitario &nbsp;|&nbsp; Col R: Total</p>
              <p className="mt-1 text-blue-500">Puedes copiar con o sin encabezados — se detecta automaticamente.</p>
            </div>
            <textarea
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-sm font-mono outline-none focus:border-teal-400 h-40 resize-none"
              placeholder="Pega aqui desde Excel con Ctrl+V..."
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              onPaste={e => {
                const text = e.clipboardData.getData('text')
                if (text) { e.preventDefault(); parsePaste(text) }
              }}
            />
            {pasteText && (
              <button onClick={() => parsePaste(pasteText)}
                className="mt-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                Procesar
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 'max-content' }}>
              <thead>
                <tr className="bg-gray-50">
                  {COLS.map(c => (
                    <th key={c.key} className={`${c.width} px-2 py-2 text-left text-gray-500 font-semibold border border-gray-200`}>
                      {c.label}
                    </th>
                  ))}
                  <th className="w-8 border border-gray-200"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {/* Codigo con autocomplete */}
                    <td className="border border-gray-200 p-0 w-28">
                      <MaterialInput
                        field="codigo"
                        value={row.codigo}
                        onChange={v => updateRow(i, 'codigo', v)}
                        onSelect={(codigo, descripcion) => setRowField(i, codigo, descripcion)}
                      />
                    </td>
                    {/* Descripcion con autocomplete */}
                    <td className="border border-gray-200 p-0 w-64">
                      <MaterialInput
                        field="descripcion"
                        value={row.descripcion}
                        onChange={v => updateRow(i, 'descripcion', v)}
                        onSelect={(codigo, descripcion) => setRowField(i, codigo, descripcion)}
                      />
                    </td>
                    {/* Cantidad, precio, total */}
                    {['cantidad_pedida','precio_unitario','total'].map(key => {
                      const col = COLS.find(c => c.key === key)!
                      return (
                        <td key={key} className="border border-gray-200 p-0">
                          <input
                            type="number"
                            className={`${col.width} w-full px-2 py-1.5 text-xs outline-none focus:bg-teal-50 bg-transparent`}
                            value={row[key as keyof ItemRow]}
                            onChange={e => updateRow(i, key, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Tab' && i === rows.length - 1 && key === 'total') {
                                e.preventDefault()
                                setRows(prev => [...prev, emptyRow()])
                              }
                            }}
                          />
                        </td>
                      )
                    })}
                    <td className="border border-gray-200 text-center">
                      {rows.length > 1 && (
                        <button onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 px-1">x</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-2">
              <button onClick={() => setRows(prev => [...prev, emptyRow()])}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium">
                + Agregar fila
              </button>
              {totalGeneral > 0 && (
                <p className="text-xs text-gray-600 font-semibold">
                  Total: ${totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex justify-between items-center pb-8">
        <button onClick={() => nav('/msc')}
          className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
          Cancelar
        </button>
        <div className="flex gap-2">
          <button onClick={() => save('borrador')} disabled={saving}
            className="border border-gray-300 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            Guardar borrador
          </button>
          <button onClick={() => save('enviada')} disabled={saving}
            className="bg-teal-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-teal-700 disabled:opacity-50 shadow-sm">
            {saving ? 'Guardando...' : 'Guardar y enviar'}
          </button>
        </div>
      </div>
    </div>
  )
}
