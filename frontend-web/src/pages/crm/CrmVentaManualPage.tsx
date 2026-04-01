import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'

function MaterialInput({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void; onSelect: (m: string, d: string) => void
}) {
  const [sugs, setSugs] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const updatePos = () => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const above = window.innerHeight - r.bottom < 220 && r.top > 220
    setPos({ top: above ? r.top - 220 : r.bottom + 2, left: r.left, width: Math.max(r.width, 300) })
  }

  const search = async (q: string) => {
    onChange(q)
    if (q.length < 2) { setSugs([]); setOpen(false); return }
    const { data } = await supabase.from('catalog_materials')
      .select('material, descripcion').ilike('material', `%${q}%`).limit(10)
    setSugs(data ?? []); updatePos(); setOpen(true)
  }

  return (
    <div ref={ref} className="relative">
      <input ref={inputRef} value={value} onChange={e => search(e.target.value)}
        onFocus={() => { if (value.length >= 2) { updatePos(); setOpen(true) } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
        placeholder="Código de material" />
      {open && sugs.length > 0 && createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
          maxHeight: 220, overflowY: 'auto', background: 'white', border: '1px solid #e5e7eb',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          {sugs.map(s => (
            <button key={s.material} type="button"
              onMouseDown={() => { onSelect(s.material, s.descripcion ?? ''); setOpen(false) }}
              style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '7px 12px',
                fontSize: 12, background: 'transparent', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
              onMouseOver={e => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, minWidth: 72 }}>{s.material}</span>
              <span style={{ color: '#6b7280' }}>{s.descripcion}</span>
            </button>
          ))}
        </div>, document.body
      )}
    </div>
  )
}

function ClienteInput({ value, onChange, onSelect }: {
  value: string; onChange: (v: string) => void; onSelect: (id: string, nombre: string, razon: string) => void
}) {
  const [sugs, setSugs] = useState<any[]>([])
  const [open, setOpen] = useState(false)

  const search = async (q: string) => {
    onChange(q)
    if (q.length < 2) { setSugs([]); setOpen(false); return }
    const { data } = await supabase.from('crm_clients')
      .select('id, solicitante, razon_social, no_cliente')
      .or(`solicitante.ilike.%${q}%,razon_social.ilike.%${q}%,no_cliente.ilike.%${q}%`)
      .limit(8)
    setSugs(data ?? []); setOpen(true)
  }

  return (
    <div className="relative">
      <input value={value} onChange={e => search(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
        placeholder="Buscar cliente por nombre o número" />
      {open && sugs.length > 0 && (
        <div className="absolute top-full left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-full max-h-48 overflow-y-auto mt-0.5">
          {sugs.map(c => (
            <button key={c.id} type="button"
              onMouseDown={() => { onSelect(c.id, c.solicitante, c.razon_social ?? ''); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-teal-50 border-b border-gray-50 last:border-0">
              <span className="font-semibold text-gray-800">{c.no_cliente ? `${c.no_cliente} — ` : ''}{c.razon_social ?? c.solicitante}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CrmVentaManualPage() {
  const nav = useNavigate()
  const [clienteInput, setClienteInput] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')
  const [notas, setNotas] = useState('')
  const [rows, setRows] = useState([{ material: '', descripcion: '', cantidad: '', precio: '', um: '' }])
  const [saving, setSaving] = useState(false)

  const setRow = (i: number, field: string, val: string) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  const addRow = () => setRows(prev => [...prev, { material: '', descripcion: '', cantidad: '', precio: '', um: '' }])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const guardar = async () => {
    if (!clienteId) return toast.error('Selecciona un cliente')
    const validRows = rows.filter(r => r.material && r.cantidad)
    if (validRows.length === 0) return toast.error('Agrega al menos un material')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: offer, error } = await supabase.from('crm_offers').insert({
      client_id: clienteId,
      tipo: 'venta_directa',
      etapa: 'venta',
      estatus: 'activo',
      notas: notas || null,
      fecha_venta: new Date().toISOString().split('T')[0],
      created_by: user?.id,
    }).select().single()

    if (error || !offer) { toast.error('Error al crear venta'); setSaving(false); return }

    await supabase.from('crm_offer_items').insert(
      validRows.map(r => ({
        offer_id: offer.id,
        material: r.material,
        descripcion: r.descripcion || null,
        cantidad_aceptada: parseFloat(r.cantidad) || 0,
        precio_aceptado: parseFloat(r.precio) || 0,
        um: r.um || null,
        aceptado: true,
        estatus: 'activo',
      }))
    )

    toast.success('Venta creada')
    nav('/crm/pipeline')
    setSaving(false)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button onClick={() => nav('/crm/pipeline')} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver al pipeline
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-1">Nueva venta — formulario manual</h1>
      <p className="text-sm text-gray-400 mb-6">Entra directo en E2 · Venta</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Cliente *</label>
          <ClienteInput value={clienteInput}
            onChange={setClienteInput}
            onSelect={(id, nombre, razon) => { setClienteId(id); setClienteNombre(razon || nombre); setClienteInput(razon || nombre) }} />
          {clienteId && <p className="text-xs text-teal-600 mt-1">Cliente vinculado: {clienteNombre}</p>}
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notas</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
            value={notas} onChange={e => setNotas(e.target.value)} placeholder="Referencia, observaciones..." />
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs text-gray-500 font-semibold">Materiales *</label>
            <button onClick={addRow} className="text-xs text-teal-600 hover:text-teal-700 font-medium">+ Agregar material</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['Código','Descripción','Cantidad','Precio unit.','UM',''].map(h => (
                    <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-1 py-1.5 w-40">
                      <MaterialInput value={r.material} onChange={v => setRow(i, 'material', v)}
                        onSelect={(m, d) => { setRow(i, 'material', m); setRow(i, 'descripcion', d) }} />
                    </td>
                    <td className="px-1 py-1.5">
                      <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                        value={r.descripcion} onChange={e => setRow(i, 'descripcion', e.target.value)} />
                    </td>
                    <td className="px-1 py-1.5 w-24">
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400 text-right"
                        value={r.cantidad} onChange={e => setRow(i, 'cantidad', e.target.value)} />
                    </td>
                    <td className="px-1 py-1.5 w-28">
                      <input type="number" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400 text-right"
                        value={r.precio} onChange={e => setRow(i, 'precio', e.target.value)} />
                    </td>
                    <td className="px-1 py-1.5 w-20">
                      <input className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                        value={r.um} onChange={e => setRow(i, 'um', e.target.value)} placeholder="PZA" />
                    </td>
                    <td className="px-1 py-1.5">
                      <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-sm px-1">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <button onClick={() => nav('/crm/pipeline')}
            className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving}
            className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Crear venta'}
          </button>
        </div>
      </div>
    </div>
  )
}
