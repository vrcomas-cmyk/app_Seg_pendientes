import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import type { InventoryItem, SolEntry } from '../../types/msc'

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
  const [umMap, setUmMap] = useState<Record<string, string>>({})
  const [anexoBExtra, setAnexoBExtra] = useState({ direccion_ventas: '', observaciones: '', motivo: '' })
  const [previewSalida, setPreviewSalida] = useState<Array<any> | null>(null)

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

  const previsualizarSalida = async () => {
    const validQtys = Object.entries(selectedQtys).filter(([, v]) => parseFloat(v) > 0)
    if (validQtys.length === 0) return toast.error('Selecciona al menos un material con cantidad')
    const fifo = calcularFIFO()
    if (!fifo) return
    // Buscar UM del catálogo para cada código
    const codigos = [...new Set(fifo.map((i: any) => i.codigo))]
    const { data: catData } = await supabase.from('catalog_materials')
      .select('material, um').in('material', codigos)
    const newUmMap: Record<string, string> = {}
    catData?.forEach((c: any) => { newUmMap[c.material] = c.um ?? '' })
    setUmMap(newUmMap)
    setPreviewSalida(fifo)
    setShowSalidaForm(true)
  }

  const confirmarSalida = async () => {
    if (!salidaForm.receptor_nombre.trim()) return toast.error('El nombre del receptor es obligatorio')
    if (!previewSalida) return
    setSaving(true)
    const { user } = useAuth(); // injected
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
    generarFormato(sal, previewSalida, { ...salidaForm, no_cliente: '', grupo_cliente: '', ejecutivo: '', zona: '' }, umMap, anexoBExtra)
    setSelectedQtys({})
    setPreviewSalida(null)
    setShowSalidaForm(false)
    setSalidaForm({ receptor_nombre: '', receptor_tipo: 'cliente', fecha_entrega: new Date().toISOString().split('T')[0], notas: '' })
    load()
    setSaving(false)
  }

  const generarFormato = (salida: any, items: any[], form: any, localUmMap: Record<string, string>, extra: typeof anexoBExtra) => {
    const porFolio = new Map<string, any[]>()
    for (const it of items) {
      const key = it.folioSap || 'SIN_FOLIO'
      if (!porFolio.has(key)) porFolio.set(key, [])
      porFolio.get(key)!.push(it)
    }
    const LOGO = 'data:image/png;base64,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'
    for (const [folio, folioItems] of porFolio) {
      const rows = folioItems.map((i: any) => `
        <tr>
          <td style="border:1px solid #ccc;padding:6px 8px;font-family:monospace;font-size:12px">${i.codigo}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px">${i.descripcion ?? ''}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;font-size:12px">${i.cantidad}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px">${localUmMap[i.codigo] ?? ''}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px">${extra.motivo}</td>
          <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px"></td>
        </tr>
        <tr>
          <td colspan="6" style="border:1px solid #eee;padding:2px 8px;font-size:10px;color:#888;font-style:italic">1 cj = ___ pzas</td>
        </tr>`).join('')
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Anexo B - Entrega MSC</title>
        <style>
          body{font-family:Arial,sans-serif;padding:30px;max-width:850px;margin:0 auto}
          @media print{body{padding:10px}}
          .header-box{background:#4CAF50;color:white;text-align:center;padding:12px;font-size:20px;font-weight:bold;border:2px solid #388E3C}
          .badge{background:#4CAF50;color:white;font-size:24px;font-weight:bold;padding:8px 16px;border:2px solid #388E3C}
          .info-table{width:100%;border-collapse:collapse;margin:12px 0}
          .info-table td{border:1px solid #ccc;padding:5px 8px;font-size:12px}
          .info-table .label{background:#4CAF50;color:white;font-weight:bold;white-space:nowrap;width:140px}
          .mat-table{width:100%;border-collapse:collapse;margin:12px 0}
          .mat-table th{background:#1a1a2e;color:white;padding:8px;text-align:left;font-size:12px;border:1px solid #ccc}
          .firma-box{border:1px solid #ccc;padding:10px}
          .footer-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}
        </style></head><body>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div class="header-box" style="flex:1;margin-right:10px">EVIDENCIA DE ENTREGA DE MERCANC&#205;A SIN CARGO</div>
          <div class="badge">B</div>
        </div>
        <table class="info-table">
          <tr>
            <td class="label">No. Cliente:</td>
            <td>${form.no_cliente ?? ''}</td>
            <td rowspan="5" style="text-align:center;width:160px;border:1px solid #ccc;padding:8px">
              <img src="${LOGO}" style="max-width:140px;max-height:70px;object-fit:contain" alt="Degasa" />
            </td>
          </tr>
          <tr><td class="label">Cliente:</td><td>${form.receptor_nombre}</td></tr>
          <tr><td class="label">Grupo Cliente:</td><td>${form.grupo_cliente ?? ''}</td></tr>
          <tr><td class="label">Ejecutivo:</td><td>${form.ejecutivo ?? ''}</td></tr>
          <tr><td class="label">Zona:</td><td>${form.zona ?? ''}</td></tr>
          <tr><td class="label">Direcci&#243;n Ventas:</td><td colspan="2">${extra.direccion_ventas}</td></tr>
          <tr><td class="label">Folio:</td><td colspan="2">${folio}</td></tr>
        </table>
        <table class="mat-table">
          <thead><tr>
            <th style="width:100px">C&#243;digo</th>
            <th>Art&#237;culo</th>
            <th style="width:70px">Cantidad</th>
            <th style="width:60px">UM</th>
            <th style="width:100px">Motivo</th>
            <th style="width:80px">Firma</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin:16px 0">
          <span style="font-size:12px">Observaciones: </span>
          <span style="font-size:12px;border-bottom:1px solid #333;display:inline-block;width:80%">${extra.observaciones}</span>
        </div>
        <div style="background:#f5f5f5;border:1px solid #ccc;padding:10px;text-align:center;font-weight:bold;font-size:13px;margin-top:16px">
          Documento auditable
        </div>
        <div class="footer-grid">
          <div class="firma-box">
            <div style="min-height:60px"></div>
            <p style="font-size:11px;font-weight:bold;text-align:center;border-top:1px solid #333;padding-top:4px;margin:0">FIRMA</p>
            <p style="font-size:11px;margin:4px 0">NOMBRE: ________________________</p>
            <p style="font-size:11px;margin:4px 0">CARGO: _________________________</p>
            <p style="font-size:11px;margin:4px 0">FECHA: _________________________</p>
          </div>
          <div class="firma-box" style="display:flex;align-items:center;justify-content:center">
            <p style="font-size:12px;font-weight:bold;color:#888;text-align:center">SELLO INSTITUCIONAL</p>
          </div>
        </div>
        <script>window.onload = () => window.print()</script>
        </body></html>`
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `anexo_b_${folio}_${form.receptor_nombre.replace(/\s+/g,'_')}.html`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
    toast.success('Anexo B generado')
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
                        <td className="px-3 py-2">
                          <input type="text"
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-xs outline-none focus:border-teal-400"
                            placeholder="UM"
                            value={umMap[item.codigo] ?? ''}
                            onChange={e => setUmMap(prev => ({ ...prev, [item.codigo]: e.target.value }))} />
                        </td>
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
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Motivo (Anexo B)</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Donativo, Muestra..."
                    value={anexoBExtra.motivo}
                    onChange={e => setAnexoBExtra(x => ({ ...x, motivo: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Dirección Ventas (Anexo B)</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Dirección de ventas"
                    value={anexoBExtra.direccion_ventas}
                    onChange={e => setAnexoBExtra(x => ({ ...x, direccion_ventas: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 block mb-1">Observaciones (Anexo B)</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Observaciones para el formato"
                    value={anexoBExtra.observaciones}
                    onChange={e => setAnexoBExtra(x => ({ ...x, observaciones: e.target.value }))} />
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
