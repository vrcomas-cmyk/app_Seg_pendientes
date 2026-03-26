import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  onSaved: () => void
  clientId?: string
}

interface CedisRow {
  codigo: string
  descripcion: string
  cantidad: string
  um: string
  lote: string
  fecha_caducidad: string
  centro_origen: string
  almacen_origen: string
  centro_destino: string
  almacen_destino: string
  comentarios: string
}

const emptyRow = (): CedisRow => ({
  codigo: '', descripcion: '', cantidad: '', um: '',
  lote: '', fecha_caducidad: '',
  centro_origen: '', almacen_origen: '',
  centro_destino: '', almacen_destino: '',
  comentarios: '',
})

const COLS: { key: keyof CedisRow; label: string; width: string; type?: string }[] = [
  { key: 'codigo',          label: 'Código *',      width: 'w-28' },
  { key: 'descripcion',     label: 'Descripción',    width: 'w-48' },
  { key: 'cantidad',        label: 'Cantidad *',     width: 'w-20', type: 'number' },
  { key: 'um',              label: 'UM',             width: 'w-16' },
  { key: 'lote',            label: 'Lote',           width: 'w-28' },
  { key: 'fecha_caducidad', label: 'Caducidad',      width: 'w-32', type: 'date' },
  { key: 'centro_origen',   label: 'Centro Orig. *', width: 'w-24' },
  { key: 'almacen_origen',  label: 'Alm. Orig.',     width: 'w-20' },
  { key: 'centro_destino',  label: 'Centro Dest. *', width: 'w-24' },
  { key: 'almacen_destino', label: 'Alm. Dest.',     width: 'w-20' },
  { key: 'comentarios',     label: 'Comentarios',    width: 'w-48' },
]

async function findClient(search: string): Promise<{ id: string; solicitante: string } | null> {
  if (!search.trim()) return null
  const { data } = await supabase.from('crm_clients')
    .select('id, solicitante')
    .ilike('solicitante', `%${search}%`)
    .limit(1).single()
  return data ?? null
}

export default function CedisRequestForm({ onClose, onSaved, clientId }: Props) {
  const [mode, setMode] = useState<'tabla' | 'pegar'>('tabla')
  const [rows, setRows] = useState<CedisRow[]>([emptyRow()])
  const [pasteText, setPasteText] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(clientId ?? null)
  const [clientName, setClientName] = useState('')
  const [pedidoRef, setPedidoRef] = useState('')
  const [saving, setSaving] = useState(false)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  const updateRow = (i: number, key: keyof CedisRow, val: string) =>
    setRows(prev => prev.map((r, j) => j === i ? { ...r, [key]: val } : r))

  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, j) => j !== i))

  const parsePaste = (text: string) => {
    const lines = text.trim().split('\n').filter(Boolean)
    if (!lines.length) return
    const firstRow = lines[0].split('\t')
    const hasHeader = isNaN(parseFloat(firstRow[0])) && firstRow[0].length < 20
    const dataLines = hasHeader ? lines.slice(1) : lines
    const parsed: CedisRow[] = dataLines.map(line => {
      const cells = line.split('\t').map(c => c.trim())
      return {
        codigo: cells[0] ?? '', descripcion: cells[1] ?? '',
        cantidad: cells[2] ?? '', um: cells[3] ?? '',
        lote: cells[4] ?? '', fecha_caducidad: cells[5] ?? '',
        centro_origen: cells[6] ?? '', almacen_origen: cells[7] ?? '',
        centro_destino: cells[8] ?? '', almacen_destino: cells[9] ?? '',
        comentarios: cells[10] ?? '',
      }
    }).filter(r => r.codigo)
    if (parsed.length > 0) {
      setRows(parsed); setMode('tabla')
      toast.success(`${parsed.length} material(es) importados`)
    } else {
      toast.error('No se detectaron materiales. Verifica el formato.')
    }
  }

  const handlePasteEvent = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text')
    if (text) { e.preventDefault(); parsePaste(text) }
  }

  const searchClient = async () => {
    if (!clientSearch.trim()) return
    const c = await findClient(clientSearch)
    if (c) { setResolvedClientId(c.id); setClientName(c.solicitante); toast.success(`Cliente: ${c.solicitante}`) }
    else toast.error('Cliente no encontrado')
  }

  const save = async () => {
    const valid = rows.filter(r => r.codigo && r.cantidad && r.centro_origen && r.centro_destino)
    if (valid.length === 0)
      return toast.error('Al menos un material necesita Código, Cantidad, Centro origen y Centro destino')

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    // Crear o buscar pedido de referencia (solo si hay cliente)
    let orderId: string | null = null
    if (resolvedClientId) {
      const pedNum = pedidoRef || `CEDIS-MANUAL-${Date.now()}`
      const { data: existingOrder } = await supabase.from('crm_orders')
        .select('id').eq('client_id', resolvedClientId).eq('numero_pedido', pedNum).single()
      if (existingOrder) {
        orderId = existingOrder.id
      } else {
        const { data: newOrder } = await supabase.from('crm_orders').insert({
          client_id: resolvedClientId, numero_pedido: pedNum,
          estatus: 'en_proceso', comentarios: 'Solicitud CEDIS manual',
          created_by: user?.id,
        }).select('id').single()
        orderId = newOrder?.id ?? null
      }
    }

    let created = 0
    for (const r of valid) {
      const { data: req, error: reqError } = await supabase.from('crm_cedis_requests').insert({
        order_id:           orderId,
        fecha_solicitud:    new Date().toISOString().split('T')[0],
        centro_origen:      r.centro_origen,
        almacen_origen:     r.almacen_origen || null,
        centro_destino:     r.centro_destino,
        almacen_destino:    r.almacen_destino || null,
        codigo:             r.codigo,
        descripcion:        r.descripcion || null,
        cantidad:           parseFloat(r.cantidad),
        um:                 r.um || null,
        lote:               r.lote || null,
        fecha_caducidad:    r.fecha_caducidad || null,
        comentarios:        r.comentarios || (pedidoRef ? `Pedido ref: ${pedidoRef}` : 'Solicitud manual'),
        cantidad_recibida:  0,
        cantidad_pendiente: parseFloat(r.cantidad),
        estatus:            'solicitado',
        created_by:         user?.id,
      }).select('id').single()

      if (reqError) {
        console.error('Error CEDIS:', reqError)
        toast.error('Error: ' + reqError.message)
        setSaving(false)
        return
      }

      if (req) {
        await supabase.from('crm_cedis_history').insert({
          request_id: req.id, estatus_nuevo: 'solicitado',
          comentario: 'Solicitud manual', created_by: user?.id,
        })
        created++
      }
    }

    toast.success(`${created} solicitud(es) CEDIS creadas`)
    onSaved()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-10 px-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-6xl max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Nueva solicitud CEDIS</h2>
            <p className="text-xs text-gray-400 mt-0.5">Solicitud manual de traslado entre centros</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div className="p-6">
          {/* Datos opcionales */}
          <div className="grid grid-cols-3 gap-4 mb-5 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Cliente (opcional)</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400"
                  placeholder="Buscar cliente..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchClient()} />
                <button onClick={searchClient}
                  className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200">
                  Buscar
                </button>
              </div>
              {clientName && <p className="text-xs text-teal-600 font-medium mt-1">✓ {clientName}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Referencia / Pedido (opcional)</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400"
                placeholder="Ej: 1234567, OC-890..."
                value={pedidoRef} onChange={e => setPedidoRef(e.target.value)} />
            </div>
            <div className="flex items-end">
              <p className="text-xs text-gray-400">
                Si no hay cliente ni pedido, la solicitud se registra como manual.
              </p>
            </div>
          </div>

          {/* Toggle modo */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setMode('tabla')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${mode === 'tabla' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
                📝 Tabla manual
              </button>
              <button onClick={() => setMode('pegar')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${mode === 'pegar' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
                📋 Pegar desde Excel
              </button>
            </div>
            {mode === 'tabla' && <span className="text-xs text-gray-400">{rows.length} material(es)</span>}
          </div>

          {/* Modo pegar */}
          {mode === 'pegar' && (
            <div className="mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3">
                <p className="text-sm font-semibold text-blue-700 mb-1">Formato esperado:</p>
                <p className="text-xs text-blue-600 font-mono">
                  Código | Descripción | Cantidad | UM | Lote | Caducidad | Centro Origen | Alm. Origen | Centro Destino | Alm. Destino | Comentarios
                </p>
              </div>
              <textarea ref={pasteRef}
                className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-sm outline-none focus:border-teal-400 h-40 resize-none font-mono"
                placeholder="Pega aquí tus datos desde Excel (Ctrl+V)..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                onPaste={handlePasteEvent} />
              {pasteText && (
                <button onClick={() => parsePaste(pasteText)}
                  className="mt-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                  Procesar datos
                </button>
              )}
            </div>
          )}

          {/* Modo tabla */}
          {mode === 'tabla' && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr className="bg-gray-50">
                    {COLS.map(c => (
                      <th key={c.key} className={`${c.width} px-2 py-2 text-left text-gray-500 font-semibold border border-gray-200 whitespace-nowrap`}>
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
                          <input type={c.type ?? 'text'}
                            className={`${c.width} w-full px-2 py-1.5 text-xs outline-none focus:bg-teal-50 bg-transparent`}
                            value={row[c.key]}
                            onChange={e => updateRow(i, c.key, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Tab' && i === rows.length - 1 && c.key === 'comentarios') {
                                e.preventDefault(); addRow()
                              }
                            }} />
                        </td>
                      ))}
                      <td className="border border-gray-200 text-center">
                        {rows.length > 1 && (
                          <button onClick={() => removeRow(i)}
                            className="text-gray-300 hover:text-red-400 px-1">×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addRow} className="mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium">
                + Agregar fila
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {rows.filter(r => r.codigo && r.cantidad && r.centro_origen && r.centro_destino).length} material(es) listos para guardar
            </p>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Crear solicitud(es) CEDIS'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
