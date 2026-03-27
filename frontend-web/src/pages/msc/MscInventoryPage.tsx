import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

interface SolEntry {
  solicitudId: string
  itemId: string
  folioSap: string
  folioEntrega: string
  cantPedida: number
  cantRecibida: number
  cantEntregada: number
  cantDisponible: number
  fechaSolicitud: string
}

interface InventoryItem {
  codigo: string
  descripcion: string
  solicitudes: SolEntry[]
  totalPedido: number
  totalRecibido: number
  totalEntregado: number
  totalDisponible: number
  totalPendiente: number
}

export default function MscInventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedQtys, setSelectedQtys] = useState<Record<string, string>>({})
  const [showSalidaForm, setShowSalidaForm] = useState(false)
  const [salidaForm, setSalidaForm] = useState({
    receptor_nombre: '', receptor_tipo: 'cliente',
    fecha_entrega: new Date().toISOString().split('T')[0], notas: '',
  })
  const [saving, setSaving] = useState(false)
  const [previewSalida, setPreviewSalida] = useState<any[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: sols } = await supabase
      .from('msc_solicitudes')
      .select(`
        id, numero_pedido_sap, fecha, estatus,
        msc_items(id, codigo, descripcion, cantidad_pedida),
        msc_recepciones(id, folio_entrega_salida, msc_recepcion_items(item_id, codigo, cantidad_recibida)),
        msc_salida_items(solicitud_id, codigo, cantidad_entregada)
      `)
      .eq('estatus', 'en_proceso')
      .order('created_at', { ascending: true })

    if (!sols) { setLoading(false); return }

    const codigoMap = new Map<string, InventoryItem>()
    for (const sol of sols) {
      const items = (sol as any).msc_items ?? []
      const recepciones = (sol as any).msc_recepciones ?? []
      const salidaItemsSol = ((sol as any).msc_salida_items ?? []).filter((si: any) => si.solicitud_id === sol.id)

      for (const item of items) {
        const recibida = recepciones.reduce((acc: number, rec: any) => {
          const ri = (rec.msc_recepcion_items ?? []).find((r: any) =>
            r.item_id === item.id || r.codigo === item.codigo
          )
          return acc + (ri?.cantidad_recibida ?? 0)
        }, 0)
        const entregada = salidaItemsSol
          .filter((si: any) => si.codigo === item.codigo)
          .reduce((acc: number, si: any) => acc + (si.cantidad_entregada ?? 0), 0)
        const folio = recepciones[0]?.folio_entrega_salida ?? ''

        const entry: SolEntry = {
          solicitudId: sol.id, itemId: item.id,
          folioSap: (sol as any).numero_pedido_sap ?? '',
          folioEntrega: folio,
          cantPedida: item.cantidad_pedida,
          cantRecibida: recibida, cantEntregada: entregada,
          cantDisponible: recibida - entregada,
          fechaSolicitud: (sol as any).fecha,
        }

        if (!codigoMap.has(item.codigo)) {
          codigoMap.set(item.codigo, {
            codigo: item.codigo, descripcion: item.descripcion ?? '',
            solicitudes: [], totalPedido: 0, totalRecibido: 0,
            totalEntregado: 0, totalDisponible: 0, totalPendiente: 0,
          })
        }
        const ci = codigoMap.get(item.codigo)!
        ci.solicitudes.push(entry)
        ci.totalPedido    += item.cantidad_pedida
        ci.totalRecibido  += recibida
        ci.totalEntregado += entregada
        ci.totalDisponible += (recibida - entregada)
        ci.totalPendiente  += (item.cantidad_pedida - recibida)
      }
    }
    setInventory(Array.from(codigoMap.values()).filter(i => i.totalRecibido > 0))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const visible = inventory.filter(i => {
    if (!search) return true
    return i.codigo.toLowerCase().includes(search.toLowerCase()) ||
      i.descripcion.toLowerCase().includes(search.toLowerCase())
  })

  const calcularFIFO = () => {
    const resultado: any[] = []
    for (const [codigo, qtStr] of Object.entries(selectedQtys)) {
      const qt = parseFloat(qtStr)
      if (!qt || qt <= 0) continue
      const inv = inventory.find(i => i.codigo === codigo)
      if (!inv) continue
      let remaining = qt
      const sorted = [...inv.solicitudes]
        .filter(s => s.cantDisponible > 0)
        .sort((a, b) => a.fechaSolicitud.localeCompare(b.fechaSolicitud))
      for (const sol of sorted) {
        if (remaining <= 0) break
        const tomar = Math.min(remaining, sol.cantDisponible)
        if (tomar > 0) {
          resultado.push({
            solicitudId: sol.solicitudId, itemId: sol.itemId,
            codigo, descripcion: inv.descripcion,
            folioSap: sol.folioSap, folioEntrega: sol.folioEntrega,
            cantidad: tomar, fechaSolicitud: sol.fechaSolicitud,
          })
          remaining -= tomar
        }
      }
      if (remaining > 0) {
        toast.error(`No hay suficiente inventario para ${codigo}. Faltan ${remaining} unidades.`)
        return null
      }
    }
    return resultado
  }

  const previsualizarSalida = () => {
    const validQtys = Object.entries(selectedQtys).filter(([, v]) => parseFloat(v) > 0)
    if (validQtys.length === 0) return toast.error('Selecciona al menos un material con cantidad')
    const fifo = calcularFIFO()
    if (!fifo) return
    setPreviewSalida(fifo)
    setShowSalidaForm(true)
  }

  const confirmarSalida = async () => {
    if (!salidaForm.receptor_nombre.trim()) return toast.error('El nombre del receptor es obligatorio')
    if (!previewSalida) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: sal } = await supabase.from('msc_salidas').insert({
      ...salidaForm, created_by: user?.id,
    }).select().single()
    if (!sal) { toast.error('Error al crear salida'); setSaving(false); return }
    await supabase.from('msc_salida_items').insert(
      previewSalida.map(item => ({
        salida_id: sal.id, solicitud_id: item.solicitudId, item_id: item.itemId,
        codigo: item.codigo, descripcion: item.descripcion,
        cantidad_entregada: item.cantidad,
        folio_pedido: item.folioSap, folio_entrega_salida: item.folioEntrega,
      }))
    )
    toast.success('Salida registrada')
    generarFormato(sal, previewSalida, salidaForm)
    setSelectedQtys({})
    setPreviewSalida(null)
    setShowSalidaForm(false)
    setSalidaForm({ receptor_nombre: '', receptor_tipo: 'cliente', fecha_entrega: new Date().toISOString().split('T')[0], notas: '' })
    load()
    setSaving(false)
  }

  const generarFormato = (salida: any, items: any[], form: any) => {
    const porFolio = new Map<string, any[]>()
    for (const it of items) {
      const key = it.folioSap || 'SIN_FOLIO'
      if (!porFolio.has(key)) porFolio.set(key, [])
      porFolio.get(key)!.push(it)
    }
    for (const [folio, folioItems] of porFolio) {
      const rows = folioItems.map(i => `
        <tr>
          <td style="border:1px solid #ddd;padding:8px;font-family:monospace">${i.codigo}</td>
          <td style="border:1px solid #ddd;padding:8px">${i.descripcion ?? ''}</td>
          <td style="border:1px solid #ddd;padding:8px;text-align:center">${i.cantidad}</td>
          <td style="border:1px solid #ddd;padding:8px">${i.folioEntrega ?? '-'}</td>
        </tr>`).join('')
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Entrega MSC</title>
        <style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto}
        h1{color:#333;font-size:18px}table{width:100%;border-collapse:collapse;margin:20px 0}
        th{background:#1a7f74;color:white;padding:10px;text-align:left;border:1px solid #ddd}
        .firma{margin-top:60px;border-top:2px solid #333;width:300px;padding-top:8px;font-size:12px}</style>
        </head><body>
        <h1>ENTREGA DE MERCANCIA SIN CARGO</h1>
        <p style="font-size:13px">Folio pedido: <strong>${folio}</strong> &nbsp; Fecha: <strong>${form.fecha_entrega}</strong></p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px">
          <p style="margin:4px 0;font-size:13px"><strong>Receptor:</strong> ${form.receptor_nombre}</p>
          <p style="margin:4px 0;font-size:13px"><strong>Tipo:</strong> ${form.receptor_tipo}</p>
          ${form.notas ? `<p style="margin:4px 0;font-size:13px"><strong>Notas:</strong> ${form.notas}</p>` : ''}
        </div>
        <table><thead><tr>
          <th>Codigo</th><th>Articulo</th><th>Cantidad</th><th>Folio Entrega Salida</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <div class="firma"><p>Firma de recibido</p>
        <p style="font-size:11px;color:#666;margin-top:4px">${form.receptor_nombre}</p></div>
        <p style="font-size:10px;color:#999;margin-top:40px">Generado el ${new Date().toLocaleString('es-MX')}</p>
        </body></html>`
      const blob = new Blob([html], { type: 'text/html' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `entrega_msc_${folio}_${form.receptor_nombre.replace(/\s+/g,'_')}.html`
      a.click()
      URL.revokeObjectURL(url)
    }
    toast.success('Formato(s) de entrega generados')
  }

  const totalDisponible = inventory.reduce((a, i) => a + i.totalDisponible, 0)
  const totalPendiente  = inventory.reduce((a, i) => a + i.totalPendiente, 0)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/msc" className="text-sm text-gray-400 hover:text-gray-600">MSC</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Inventario disponible</h1>
          </div>
          <p className="text-sm text-gray-400">Material recibido listo para entregar</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap mb-5">
        {[
          { label: 'Codigos distintos',    value: inventory.length,  color: 'bg-white border-gray-200 text-gray-700' },
          { label: 'Uds. disponibles',     value: totalDisponible,   color: 'bg-green-50 border-green-200 text-green-700' },
          { label: 'Uds. pendientes llegada', value: totalPendiente, color: totalPendiente > 0 ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-white border-gray-200 text-gray-400' },
        ].map(m => (
          <div key={m.label} className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium ${m.color}`}>
            <span className="text-lg font-bold">{m.value}</span>
            <span className="text-xs opacity-75">{m.label}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4 items-center">
        <input
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-teal-400 bg-white"
          placeholder="Buscar por codigo o articulo..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {Object.values(selectedQtys).some(v => parseFloat(v) > 0) && (
          <button onClick={previsualizarSalida}
            className="bg-teal-600 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-teal-700 shadow-sm whitespace-nowrap">
            Generar salida
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        {loading && <p className="text-sm text-gray-400 p-8 text-center">Cargando inventario...</p>}
        {!loading && visible.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">Sin material disponible en inventario.</p>
            <Link to="/msc" className="mt-3 inline-block text-sm text-teal-600 font-medium hover:text-teal-700">
              Ver solicitudes activas
            </Link>
          </div>
        )}
        {!loading && visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['Codigo','Articulo','Cant. Pedida','Cant. Recibida','Cant. Entregada','Disponible','Pendiente llegada','Cant. a entregar'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(item => {
                  const pct = item.totalRecibido > 0
                    ? Math.round((item.totalEntregado / item.totalRecibido) * 100) : 0
                  return (
                    <tr key={item.codigo} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-3 font-mono font-semibold text-gray-800">{item.codigo}</td>
                      <td className="px-3 py-3 text-gray-600 max-w-48 truncate">{item.descripcion}</td>
                      <td className="px-3 py-3 text-right font-medium text-gray-700">{item.totalPedido}</td>
                      <td className="px-3 py-3 text-right text-blue-600 font-medium">{item.totalRecibido}</td>
                      <td className="px-3 py-3 text-right text-teal-600 font-medium">{item.totalEntregado}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`font-bold text-sm ${item.totalDisponible > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                            {item.totalDisponible}
                          </span>
                          {item.totalRecibido > 0 && (
                            <div className="w-12 bg-gray-200 rounded-full h-1.5">
                              <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {item.totalPendiente > 0
                          ? <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{item.totalPendiente}</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-3">
                        {item.totalDisponible > 0 ? (
                          <input type="number"
                            className="w-24 border border-teal-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-500 text-right"
                            placeholder="0" min="0" max={item.totalDisponible}
                            value={selectedQtys[item.codigo] ?? ''}
                            onChange={e => setSelectedQtys(prev => ({ ...prev, [item.codigo]: e.target.value }))} />
                        ) : (
                          <span className="text-gray-300 text-xs">Sin stock</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal confirmacion */}
      {showSalidaForm && previewSalida && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-10 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">Confirmar salida</h2>
              <button onClick={() => setShowSalidaForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Materiales a entregar (FIFO)</p>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold border border-gray-200">Codigo</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold border border-gray-200">Articulo</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold border border-gray-200">Cant.</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold border border-gray-200">Folio SAP</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold border border-gray-200">Entrega Salida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSalida.map((item, i) => (
                      <tr key={i} className="border border-gray-200">
                        <td className="px-3 py-2 font-mono font-semibold text-gray-800">{item.codigo}</td>
                        <td className="px-3 py-2 text-gray-600">{item.descripcion}</td>
                        <td className="px-3 py-2 text-right font-bold text-teal-700">{item.cantidad}</td>
                        <td className="px-3 py-2 text-gray-600">{item.folioSap || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{item.folioEntrega || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const folios = [...new Set(previewSalida.map(i => i.folioSap).filter(Boolean))]
                if (folios.length > 1) return (
                  <p className="text-xs text-amber-600 mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Se generaran {folios.length} formatos, uno por cada folio: {folios.join(', ')}
                  </p>
                )
                return null
              })()}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Nombre del receptor *</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Nombre completo de quien recibe"
                    value={salidaForm.receptor_nombre}
                    onChange={e => setSalidaForm(x => ({ ...x, receptor_nombre: e.target.value }))}
                    autoFocus />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                    value={salidaForm.receptor_tipo}
                    onChange={e => setSalidaForm(x => ({ ...x, receptor_tipo: e.target.value }))}>
                    <option value="cliente">Cliente</option>
                    <option value="colaborador">Colaborador</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Fecha de entrega</label>
                  <input type="date"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={salidaForm.fecha_entrega}
                    onChange={e => setSalidaForm(x => ({ ...x, fecha_entrega: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Notas (opcional)</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Observaciones de la entrega"
                    value={salidaForm.notas}
                    onChange={e => setSalidaForm(x => ({ ...x, notas: e.target.value }))} />
                </div>
              </div>

              <div className="flex justify-between">
                <button onClick={() => setShowSalidaForm(false)}
                  className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={confirmarSalida} disabled={saving}
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Confirmar y descargar formato(s)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
