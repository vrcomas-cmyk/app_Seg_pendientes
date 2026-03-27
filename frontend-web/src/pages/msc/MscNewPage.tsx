import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

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
  { key: 'codigo',          label: 'Codigo *',        width: 'w-28' },
  { key: 'descripcion',     label: 'Articulo',         width: 'w-64' },
  { key: 'cantidad_pedida', label: 'Cantidad *',       width: 'w-24', type: 'number' },
  { key: 'precio_unitario', label: 'Precio Unitario',  width: 'w-32', type: 'number' },
  { key: 'total',           label: 'Total',            width: 'w-32', type: 'number' },
]

export default function MscNewPage() {
  const nav = useNavigate()
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    oficina_ventas: '',
    motivo: '',
    descripcion: '',
    destinatario_tipo: 'cliente',
    destinatario_nombre: '',
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
        updated.total = cant && precio ? String(cant * precio) : ''
      }
      return updated
    }))
  }

  const parsePaste = (text: string) => {
    const lines = text.trim().split('\n').filter(Boolean)
    if (!lines.length) return
    const firstCells = lines[0].split('\t')
    const hasHeader = isNaN(parseFloat(firstCells[0])) && firstCells[0].length < 20
    const dataLines = hasHeader ? lines.slice(1) : lines
    const parsed: ItemRow[] = dataLines.map(line => {
      const cells = line.split('\t').map(c => c.trim().replace(/[$,]/g, ''))
      const cant = parseFloat(cells[2]) || 0
      const precio = parseFloat(cells[3]) || 0
      return {
        codigo:          cells[0] ?? '',
        descripcion:     cells[1] ?? '',
        cantidad_pedida: cells[2] ?? '',
        precio_unitario: cells[3] ?? '',
        total:           cells[4] ?? (cant && precio ? String(cant * precio) : ''),
      }
    }).filter(r => r.codigo)
    if (parsed.length > 0) {
      setRows(parsed); setPasteMode(false); setPasteText('')
      toast.success(`${parsed.length} materiales importados`)
    } else {
      toast.error('No se detectaron materiales')
    }
  }

  const save = async (estatus: 'borrador' | 'enviada') => {
    const validRows = rows.filter(r => r.codigo && r.cantidad_pedida)
    if (validRows.length === 0) return toast.error('Agrega al menos un material')
    if (!form.oficina_ventas) return toast.error('La oficina de ventas es obligatoria')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: sol, error } = await supabase.from('msc_solicitudes').insert({
      ...form, estatus, created_by: user?.id,
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
      `- ${r.codigo} ${r.descripcion} x${r.cantidad_pedida}${r.precio_unitario ? ` @ $${r.precio_unitario}` : ''}`
    ).join('\n')
    const subject = encodeURIComponent(`Solicitud Mercancia Sin Cargo - ${form.oficina_ventas} - ${form.fecha}`)
    const body = encodeURIComponent(
      `Estimados,\n\nSe solicita autorizacion para mercancia sin cargo:\n\n` +
      `Fecha: ${form.fecha}\nOficina: ${form.oficina_ventas}\nMotivo: ${form.motivo}\n` +
      `Destinatario: ${form.destinatario_nombre}\n\nMateriales:\n${materiales}\n\n` +
      `${form.descripcion ? `Descripcion: ${form.descripcion}\n\n` : ''}` +
      `Quedo en espera de su autorizacion.\n\nSaludos`
    )
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

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
            <label className="text-xs text-gray-500 block mb-1">Oficina de ventas *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Ej: 600 Chihuahua"
              value={form.oficina_ventas} onChange={e => setForm(x => ({ ...x, oficina_ventas: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Motivo</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Ej: Donativo, Muestra, Reposicion"
              value={form.motivo} onChange={e => setForm(x => ({ ...x, motivo: e.target.value }))} />
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
            <label className="text-xs text-gray-500 block mb-1">Nombre del destinatario</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
              placeholder="Nombre del cliente o colaborador"
              value={form.destinatario_nombre}
              onChange={e => setForm(x => ({ ...x, destinatario_nombre: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Descripcion / justificacion</label>
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400 h-16 resize-none"
            placeholder="Cuerpo del correo o descripcion del motivo..."
            value={form.descripcion}
            onChange={e => setForm(x => ({ ...x, descripcion: e.target.value }))} />
        </div>
      </div>

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
              <strong>Formato esperado:</strong> Codigo | Articulo | Cantidad | Precio Unitario | Total
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
                    {COLS.map(c => (
                      <td key={c.key} className="border border-gray-200 p-0">
                        <input
                          type={c.type ?? 'text'}
                          className={`${c.width} w-full px-2 py-1.5 text-xs outline-none focus:bg-teal-50 bg-transparent`}
                          value={row[c.key as keyof ItemRow]}
                          onChange={e => updateRow(i, c.key, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Tab' && i === rows.length - 1 && c.key === 'total') {
                              e.preventDefault()
                              setRows(prev => [...prev, emptyRow()])
                            }
                          }}
                        />
                      </td>
                    ))}
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
              {rows.filter(r => r.precio_unitario && r.cantidad_pedida).length > 0 && (
                <p className="text-xs text-gray-500 font-medium">
                  Total: ${rows.reduce((acc, r) => {
                    const cant = parseFloat(r.cantidad_pedida) || 0
                    const precio = parseFloat(r.precio_unitario) || 0
                    return acc + (parseFloat(r.total) || cant * precio)
                  }, 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
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
