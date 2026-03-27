import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const ESTATUS_FLOW = ['borrador','enviada','aprobada','en_proceso','completada']
const ESTATUS_COLOR: Record<string, string> = {
  borrador:   'bg-gray-100 text-gray-500',
  enviada:    'bg-blue-100 text-blue-700',
  aprobada:   'bg-green-100 text-green-700',
  rechazada:  'bg-red-100 text-red-600',
  en_proceso: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-teal-100 text-teal-700',
}

export default function MscDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [sol, setSol] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [recepciones, setRecepciones] = useState<any[]>([])
  const [salidas, setSalidas] = useState<any[]>([])
  const [evidencias, setEvidencias] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [openAprobacion, setOpenAprobacion] = useState(false)
  const [openFolio, setOpenFolio] = useState(false)
  const [openRecepcion, setOpenRecepcion] = useState(false)
  const [aprobForm, setAprobForm] = useState({ aprobado_por: '', notas_aprobacion: '' })
  const [folioForm, setFolioForm] = useState({ numero_pedido_sap: '', fecha_pedido_sap: '', capturado_por: '' })
  const [recepForm, setRecepForm] = useState({
    folio_entrega_salida: '', fecha_recepcion: new Date().toISOString().split('T')[0],
    tipo: 'usuario', receptor_nombre: '', notas: '',
  })
  const [recepItems, setRecepItems] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [s, it, rec, sal, ev] = await Promise.all([
      supabase.from('msc_solicitudes').select('*').eq('id', id).single(),
      supabase.from('msc_items').select('*').eq('solicitud_id', id).order('created_at'),
      supabase.from('msc_recepciones').select('*, msc_recepcion_items(*)').eq('solicitud_id', id).order('created_at'),
      supabase.from('msc_salidas').select('*, msc_salida_items(*)').order('created_at', { ascending: false }),
      supabase.from('msc_evidencias').select('*').eq('solicitud_id', id).order('created_at', { ascending: false }),
    ])
    setSol(s.data)
    setItems(it.data ?? [])
    setRecepciones(rec.data ?? [])
    const salFiltradas = (sal.data ?? []).filter((sa: any) =>
      (sa.msc_salida_items ?? []).some((si: any) => si.solicitud_id === id)
    )
    setSalidas(salFiltradas)
    setEvidencias(ev.data ?? [])
    if (s.data) {
      setAprobForm({ aprobado_por: s.data.aprobado_por ?? '', notas_aprobacion: s.data.notas_aprobacion ?? '' })
      setFolioForm({
        numero_pedido_sap: s.data.numero_pedido_sap ?? '',
        fecha_pedido_sap:  s.data.fecha_pedido_sap ?? '',
        capturado_por:     s.data.capturado_por ?? '',
      })
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const cantRecibida = (itemId: string, codigo: string) =>
    recepciones.reduce((acc, rec) => {
      const ri = (rec.msc_recepcion_items ?? []).find((r: any) => r.item_id === itemId || r.codigo === codigo)
      return acc + (ri?.cantidad_recibida ?? 0)
    }, 0)

  const cantEntregada = (codigo: string) =>
    salidas.reduce((acc, sal) => {
      const si = (sal.msc_salida_items ?? []).filter((s: any) => s.solicitud_id === id && s.codigo === codigo)
      return acc + si.reduce((a: number, s: any) => a + (s.cantidad_entregada ?? 0), 0)
    }, 0)

  const aprobar = async (estatus: 'aprobada' | 'rechazada') => {
    setSaving(true)
    await supabase.from('msc_solicitudes').update({
      estatus, ...aprobForm, fecha_aprobacion: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    toast.success(estatus === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada')
    setOpenAprobacion(false); load(); setSaving(false)
  }

  const guardarFolio = async () => {
    if (!folioForm.numero_pedido_sap) return toast.error('El folio SAP es obligatorio')
    setSaving(true)
    await supabase.from('msc_solicitudes').update({ ...folioForm, estatus: 'en_proceso' }).eq('id', id)
    toast.success('Folio SAP guardado')
    setOpenFolio(false); load(); setSaving(false)
  }

  const guardarRecepcion = async () => {
    if (!recepForm.folio_entrega_salida) return toast.error('El folio de entrega de salida es obligatorio')
    const itemsValidos = items.filter(it => parseFloat(recepItems[it.id] ?? '0') > 0)
    if (itemsValidos.length === 0) return toast.error('Ingresa al menos una cantidad recibida')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: rec } = await supabase.from('msc_recepciones').insert({
      solicitud_id: id, ...recepForm, created_by: user?.id,
    }).select().single()
    if (rec) {
      await supabase.from('msc_recepcion_items').insert(
        itemsValidos.map(it => ({
          recepcion_id: rec.id, solicitud_id: id, item_id: it.id,
          codigo: it.codigo, descripcion: it.descripcion,
          cantidad_recibida: parseFloat(recepItems[it.id]),
        }))
      )
      toast.success('Recepcion registrada')
      setOpenRecepcion(false); setRecepItems({}); load()
    }
    setSaving(false)
  }

  const subirEvidencia = async (file: File, tipo: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `msc/${id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    if (error) { toast.error('Error al subir archivo'); return }
    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
    await supabase.from('msc_evidencias').insert({
      solicitud_id: id, url: publicUrl, nombre: file.name, tipo, created_by: user?.id,
    })
    toast.success('Evidencia subida'); load()
  }

  const openMail = () => {
    if (!sol) return
    const materiales = items.map(i =>
      `- ${i.codigo} ${i.descripcion ?? ''} x${i.cantidad_pedida}${i.precio_unitario ? ` @ $${i.precio_unitario}` : ''}`
    ).join('\n')
    const subject = encodeURIComponent(`Solicitud MSC - ${sol.oficina_ventas} - ${sol.fecha}`)
    const body = encodeURIComponent(
      `Estimados,\n\nSe solicita autorizacion para mercancia sin cargo:\n\n` +
      `Fecha: ${sol.fecha}\nOficina: ${sol.oficina_ventas}\nMotivo: ${sol.motivo ?? ''}\n` +
      `Para: ${sol.destinatario_nombre ?? ''}\n\nMateriales:\n${materiales}\n\n` +
      `${sol.descripcion ? `Descripcion:\n${sol.descripcion}\n\n` : ''}` +
      `Quedo en espera de su autorizacion.\n\nSaludos`
    )
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  if (!sol) return <div className="text-sm text-gray-400 p-6">Cargando...</div>

  const totalPedido = items.reduce((a, i) => a + (i.total ?? (i.cantidad_pedida * (i.precio_unitario ?? 0))), 0)
  const stepIdx = ESTATUS_FLOW.indexOf(sol.estatus)

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => nav('/msc')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        Volver a MSC
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {sol.numero_pedido_sap ? `Folio: ${sol.numero_pedido_sap}` : 'Solicitud MSC'}
            </h1>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ESTATUS_COLOR[sol.estatus]}`}>
                {sol.estatus?.replace('_',' ')}
              </span>
              {sol.oficina_ventas && <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{sol.oficina_ventas}</span>}
              {sol.motivo && <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">{sol.motivo}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={openMail}
              className="border border-blue-300 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-50">
              Abrir correo
            </button>
            <Link to="/msc/inventario"
              className="border border-teal-300 text-teal-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-50">
              Ver inventario
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-xs text-gray-500 mb-4">
          <div><p className="text-gray-400">Fecha</p><p className="font-medium text-gray-700">{sol.fecha}</p></div>
          <div><p className="text-gray-400">Destinatario</p><p className="font-medium text-gray-700">{sol.destinatario_nombre ?? '-'} ({sol.destinatario_tipo})</p></div>
          <div><p className="text-gray-400">Aprobado por</p><p className="font-medium text-gray-700">{sol.aprobado_por ?? '-'}</p></div>
        </div>
        {sol.descripcion && (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100 mb-4">{sol.descripcion}</p>
        )}

        {/* Stepper */}
        <div className="flex items-center">
          {ESTATUS_FLOW.map((e, i) => (
            <div key={e} className="flex items-center flex-1 last:flex-none">
              <div className={`text-xs font-medium px-2 py-1 rounded-lg whitespace-nowrap ${
                i < stepIdx ? 'text-teal-600' : i === stepIdx ? 'bg-teal-600 text-white' : 'text-gray-300'
              }`}>
                {i < stepIdx ? 'v ' : ''}{e.replace('_',' ')}
              </div>
              {i < ESTATUS_FLOW.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${i < stepIdx ? 'bg-teal-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabla materiales */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
          <h2 className="font-semibold text-gray-700">Materiales</h2>
          {totalPedido > 0 && (
            <span className="text-xs text-gray-500">
              Total: <strong>${totalPedido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                {['Codigo','Articulo','Cant. Pedida','Cant. Recibida','Cant. Entregada','Disponible','Pendiente','P.Unit','Total'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const rec  = cantRecibida(item.id, item.codigo)
                const ent  = cantEntregada(item.codigo)
                const disp = rec - ent
                const pend = item.cantidad_pedida - rec
                return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono font-semibold text-gray-800">{item.codigo}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-48 truncate">{item.descripcion ?? '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{item.cantidad_pedida}</td>
                    <td className="px-3 py-2 text-right text-blue-600 font-medium">{rec}</td>
                    <td className="px-3 py-2 text-right text-teal-600 font-medium">{ent}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${disp > 0 ? 'text-green-600' : 'text-gray-400'}`}>{disp}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {pend > 0
                        ? <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{pend} pend.</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {item.precio_unitario ? `$${Number(item.precio_unitario).toLocaleString('es-MX')}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {item.total ? `$${Number(item.total).toLocaleString('es-MX')}` : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Etapa 1: Aprobacion */}
      {['enviada','borrador'].includes(sol.estatus) && (
        <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          <button onClick={() => setOpenAprobacion(!openAprobacion)}
            className="w-full flex justify-between items-center px-5 py-4 hover:bg-gray-50">
            <h2 className="font-semibold text-gray-700">Etapa 1 - Aprobacion</h2>
            <span className="text-gray-400 text-sm">{openAprobacion ? 'v' : '>'}</span>
          </button>
          {openAprobacion && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <div className="grid grid-cols-2 gap-3 mt-4 mb-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Aprobado por</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Nombre del autorizador"
                    value={aprobForm.aprobado_por}
                    onChange={e => setAprobForm(x => ({ ...x, aprobado_por: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Notas</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Observaciones"
                    value={aprobForm.notas_aprobacion}
                    onChange={e => setAprobForm(x => ({ ...x, notas_aprobacion: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => aprobar('aprobada')} disabled={saving}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  Aprobar
                </button>
                <button onClick={() => aprobar('rechazada')} disabled={saving}
                  className="border border-red-300 text-red-500 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">
                  Rechazar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Etapa 2: Folio SAP */}
      {['aprobada','en_proceso'].includes(sol.estatus) && (
        <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          <button onClick={() => setOpenFolio(!openFolio)}
            className="w-full flex justify-between items-center px-5 py-4 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-700">Etapa 2 - Folio SAP</h2>
              {sol.numero_pedido_sap && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{sol.numero_pedido_sap}</span>
              )}
            </div>
            <span className="text-gray-400 text-sm">{openFolio ? 'v' : '>'}</span>
          </button>
          {openFolio && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <div className="grid grid-cols-3 gap-3 mt-4 mb-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Numero de pedido SAP *</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Ej: 4500123456"
                    value={folioForm.numero_pedido_sap}
                    onChange={e => setFolioForm(x => ({ ...x, numero_pedido_sap: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Fecha pedido SAP</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={folioForm.fecha_pedido_sap}
                    onChange={e => setFolioForm(x => ({ ...x, fecha_pedido_sap: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Capturado por</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Nombre del capturista"
                    value={folioForm.capturado_por}
                    onChange={e => setFolioForm(x => ({ ...x, capturado_por: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={guardarFolio} disabled={saving}
                  className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  Guardar folio
                </button>
                <Link to="/crm/materials"
                  className="border border-amber-300 text-amber-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50">
                  Solicitar traslado CEDIS
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Etapa 3: Recepcion */}
      {sol.estatus === 'en_proceso' && (
        <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          <button onClick={() => setOpenRecepcion(!openRecepcion)}
            className="w-full flex justify-between items-center px-5 py-4 hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-700">Etapa 3 - Registrar recepcion</h2>
              {recepciones.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                  {recepciones.length} recepcion(es)
                </span>
              )}
            </div>
            <span className="text-gray-400 text-sm">{openRecepcion ? 'v' : '>'}</span>
          </button>
          {openRecepcion && (
            <div className="px-5 pb-5 border-t border-gray-100">
              {recepciones.length > 0 && (
                <div className="mt-4 mb-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Recepciones anteriores</p>
                  {recepciones.map(rec => (
                    <div key={rec.id} className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100 text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-semibold text-gray-700">Folio: {rec.folio_entrega_salida}</span>
                        <span className="text-gray-400">{rec.fecha_recepcion} · {rec.tipo}</span>
                      </div>
                      {(rec.msc_recepcion_items ?? []).map((ri: any) => (
                        <span key={ri.id} className="mr-3 text-gray-600">
                          {ri.codigo}: <strong>{ri.cantidad_recibida}</strong>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-3 mt-4 mb-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Folio entrega de salida SAP *</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    placeholder="Ej: 80001234"
                    value={recepForm.folio_entrega_salida}
                    onChange={e => setRecepForm(x => ({ ...x, folio_entrega_salida: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Fecha recepcion</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={recepForm.fecha_recepcion}
                    onChange={e => setRecepForm(x => ({ ...x, fecha_recepcion: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Tipo de entrega</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                    value={recepForm.tipo}
                    onChange={e => setRecepForm(x => ({ ...x, tipo: e.target.value }))}>
                    <option value="usuario">Lo recibo yo (va a inventario)</option>
                    <option value="cliente_directo">Directo al cliente</option>
                  </select>
                </div>
                {recepForm.tipo === 'cliente_directo' && (
                  <div className="col-span-3">
                    <label className="text-xs text-gray-500 block mb-1">Nombre del receptor</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                      placeholder="Quien recibe el material"
                      value={recepForm.receptor_nombre}
                      onChange={e => setRecepForm(x => ({ ...x, receptor_nombre: e.target.value }))} />
                  </div>
                )}
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Cantidades recibidas</p>
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">Codigo</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200">Articulo</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold border-b border-gray-200">Pedido</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold border-b border-gray-200">Ya recibido</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-semibold border-b border-gray-200 w-32">Recibo ahora *</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const yaRec    = cantRecibida(item.id, item.codigo)
                      const pendiente = item.cantidad_pedida - yaRec
                      return (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="px-3 py-2 font-mono font-semibold text-gray-800">{item.codigo}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{item.descripcion}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{item.cantidad_pedida}</td>
                          <td className="px-3 py-2 text-right text-blue-600">{yaRec}</td>
                          <td className="px-3 py-2">
                            <input type="number"
                              className="w-full border border-teal-300 rounded-lg px-2 py-1 text-xs outline-none focus:border-teal-500 text-right"
                              placeholder={String(pendiente)}
                              value={recepItems[item.id] ?? ''}
                              onChange={e => setRecepItems(prev => ({ ...prev, [item.id]: e.target.value }))}
                              max={pendiente} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button onClick={guardarRecepcion} disabled={saving}
                  className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  Registrar recepcion
                </button>
                <label className="cursor-pointer border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Subir evidencia
                  <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg"
                    onChange={e => { const f = e.target.files?.[0]; if (f) subirEvidencia(f, 'recepcion') }} />
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidencias */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-gray-700">Evidencias</h2>
          <label className="cursor-pointer text-xs text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50">
            + Subir evidencia
            <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx"
              onChange={e => { const f = e.target.files?.[0]; if (f) subirEvidencia(f, 'solicitud') }} />
          </label>
        </div>
        {evidencias.length === 0 && <p className="text-xs text-gray-400">Sin evidencias adjuntas aun.</p>}
        {evidencias.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {evidencias.map(ev => (
              <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 text-teal-600 hover:text-teal-700 px-3 py-2 rounded-lg hover:border-teal-300 transition">
                <span className="text-gray-400">{ev.tipo}</span>
                <span className="max-w-32 truncate">{ev.nombre}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Salidas */}
      {salidas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Salidas registradas</h2>
          </div>
          {salidas.map(sal => {
            const misSalItems = (sal.msc_salida_items ?? []).filter((si: any) => si.solicitud_id === id)
            return (
              <div key={sal.id} className="px-5 py-4 border-b border-gray-100 last:border-0">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{sal.receptor_nombre}</p>
                    <p className="text-xs text-gray-400">{sal.receptor_tipo} · {sal.fecha_entrega}</p>
                  </div>
                  {sal.evidencia_url && (
                    <a href={sal.evidencia_url} target="_blank" rel="noreferrer"
                      className="text-xs text-teal-600 hover:underline">Ver evidencia</a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {misSalItems.map((si: any) => (
                    <span key={si.id} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-1 rounded-lg font-mono">
                      {si.codigo}: {si.cantidad_entregada}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
