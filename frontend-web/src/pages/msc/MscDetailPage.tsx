import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../hooks/useRole'
import toast from 'react-hot-toast'

const ESTATUS_FLOW = ['borrador','enviada','aprobada','en_proceso','completada']
const ESTATUS_COLOR: Record<string, string> = {
  borrador:   'bg-gray-100 text-gray-500',
  enviada:    'bg-blue-100 text-blue-700',
  aprobada:   'bg-green-100 text-green-700',
  rechazada:  'bg-red-100 text-red-600',
  en_proceso: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-teal-100 text-teal-700',
  cancelada:  'bg-gray-200 text-gray-500',
}

export default function MscDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { canSeeCedis } = useRole()
  const [sol, setSol]               = useState<any>(null)
  const [items, setItems]           = useState<any[]>([])
  const [recepciones, setRecepciones] = useState<any[]>([])
  const [salidas, setSalidas]       = useState<any[]>([])
  const [evidencias, setEvidencias] = useState<any[]>([])
  const [saving, setSaving]         = useState(false)
  const [openAprobacion, setOpenAprobacion] = useState(false)
  const [openFolio, setOpenFolio]   = useState(false)
  const [openRecepcion, setOpenRecepcion] = useState(false)
  const [aprobForm, setAprobForm]   = useState({ aprobado_por: '', notas_aprobacion: '' })
  const [folioForm, setFolioForm]   = useState({ numero_pedido_sap: '', fecha_pedido_sap: '', capturado_por: '' })
  const [recepForm, setRecepForm]   = useState({
    folio_entrega_salida: '', fecha_recepcion: new Date().toISOString().split('T')[0],
    tipo: 'usuario', receptor_nombre: '', notas: '',
  })
  const [recepItems, setRecepItems] = useState<Record<string, string>>({})

  // CEDIS modal
  const [showCedisModal, setShowCedisModal] = useState(false)
  const [cedisHeader, setCedisHeader] = useState({
    centro_origen: '', almacen_origen: '',
    centro_destino: '', almacen_destino: '',
    fecha_solicitud: new Date().toISOString().split('T')[0],
  })
  const [cedisRows, setCedisRows] = useState<Record<string, {
    selected: boolean; cantidad: string; um: string; lote: string; fecha_caducidad: string
  }>>({})
  const [savingCedis, setSavingCedis] = useState(false)

  // Cancelacion
  const [cancelModal, setCancelModal] = useState<{ type: 'item' | 'all'; itemId?: string } | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState('')

  // Anexo B modal
  const [showAnexoB, setShowAnexoB] = useState(false)
  const [anexoBForm, setAnexoBForm] = useState({
    no_cliente: '', cliente: '', grupo_cliente: '',
    ejecutivo: '', zona: '', direccion_ventas: '',
    observaciones: '',
  })

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
      // Cargar datos del cliente si hay client_id
      if (s.data?.client_id) {
        const { data: cli } = await supabase.from('crm_clients')
          .select('no_cliente, solicitante, grupo_cliente, ejecutivo, zona')
          .eq('id', s.data.client_id).single()
        if (cli) {
          setAnexoBForm(prev => ({
            ...prev,
            no_cliente:    cli.no_cliente ?? '',
            cliente:       s.data.destinatario_nombre ?? cli.solicitante ?? '',
            grupo_cliente: cli.grupo_cliente ?? '',
            ejecutivo:     cli.ejecutivo ?? '',
            zona:          cli.zona ?? '',
          }))
        }
      } else {
        setAnexoBForm(prev => ({
          ...prev,
          cliente: s.data.destinatario_nombre ?? '',
        }))
      }
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

  const activeItems = items.filter(i => i.estatus_linea !== 'cancelado')

  const isTotalRecibido = activeItems.length > 0 && activeItems.every(item => {
    const rec = cantRecibida(item.id, item.codigo)
    return rec >= item.cantidad_pedida
  })

  const salidasSinEvidencia = salidas.filter(sal => {
    const evSalida = evidencias.filter(e => e.salida_id === sal.id)
    return evSalida.length === 0
  })
  const puedeCompletarse = isTotalRecibido && salidasSinEvidencia.length === 0 && salidas.length > 0

  const checkAutoClose = useCallback(async () => {
    if (!sol || sol.estatus !== 'en_proceso') return
    if (puedeCompletarse) {
      await supabase.from('msc_solicitudes').update({ estatus: 'completada' }).eq('id', id)
      toast.success('Solicitud completada automaticamente')
      load()
    }
  }, [sol, puedeCompletarse, id, load])

  useEffect(() => { checkAutoClose() }, [checkAutoClose])

  const aprobar = async (estatus: 'aprobada' | 'rechazada') => {
    setSaving(true)
    await supabase.from('msc_solicitudes').update({
      estatus, ...aprobForm, fecha_aprobacion: new Date().toISOString().split('T')[0],
    }).eq('id', id)
    toast.success(estatus === 'aprobada' ? 'Aprobada' : 'Rechazada')
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
    const itemsValidos = activeItems.filter(it => parseFloat(recepItems[it.id] ?? '0') > 0)
    if (itemsValidos.length === 0) return toast.error('Ingresa al menos una cantidad recibida')
    const itemsExcedidos = itemsValidos.filter(it => {
      const yaRec = cantRecibida(it.id, it.codigo)
      const ahora = parseFloat(recepItems[it.id] ?? '0')
      return (yaRec + ahora) > it.cantidad_pedida
    })
    if (itemsExcedidos.length > 0) {
      const detalle = itemsExcedidos.map(it => {
        const yaRec = cantRecibida(it.id, it.codigo)
        const ahora = parseFloat(recepItems[it.id] ?? '0')
        return `${it.codigo}: pedido ${it.cantidad_pedida}, ya recibido ${yaRec}, ahora ${ahora}`
      }).join('\n')
      if (!window.confirm(`Cantidades exceden lo pedido:\n\n${detalle}\n\n¿Confirmar?`)) return
    }
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

  const subirEvidencia = async (file: File, tipo: string, salidaId?: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `msc/${id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    if (error) { toast.error('Error al subir archivo'); return }
    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
    await supabase.from('msc_evidencias').insert({
      solicitud_id: id, salida_id: salidaId ?? null,
      url: publicUrl, nombre: file.name, tipo, created_by: user?.id,
    })
    toast.success('Evidencia subida'); load()
  }

  // Cancelar item(s)
  const confirmarCancelacion = async () => {
    if (!cancelMotivo.trim()) return toast.error('El motivo es obligatorio')
    const now = new Date().toISOString()
    if (cancelModal?.type === 'item' && cancelModal.itemId) {
      await supabase.from('msc_items').update({
        estatus_linea: 'cancelado',
        motivo_cancelacion: cancelMotivo,
        cancelado_at: now,
      }).eq('id', cancelModal.itemId)
      toast.success('Material cancelado')
    } else if (cancelModal?.type === 'all') {
      const itemIds = activeItems.map(i => i.id)
      for (const iid of itemIds) {
        await supabase.from('msc_items').update({
          estatus_linea: 'cancelado',
          motivo_cancelacion: cancelMotivo,
          cancelado_at: now,
        }).eq('id', iid)
      }
      toast.success('Solicitud cancelada')
    }
    setCancelModal(null); setCancelMotivo(''); load()
  }

  // Reactivar item
  const reactivarItem = async (itemId: string) => {
    await supabase.from('msc_items').update({
      estatus_linea: 'activo',
      motivo_cancelacion: null,
      cancelado_at: null,
    }).eq('id', itemId)
    toast.success('Material reactivado'); load()
  }

  // CEDIS
  const initCedisRows = () => {
    const rows: Record<string, any> = {}
    activeItems.forEach(item => {
      const yaRec = cantRecibida(item.id, item.codigo)
      const pend = item.cantidad_pedida - yaRec
      rows[item.id] = {
        selected: pend > 0,
        cantidad: String(pend > 0 ? pend : item.cantidad_pedida),
        um: item.um ?? '', lote: '', fecha_caducidad: '',
      }
    })
    setCedisRows(rows)
    setShowCedisModal(true)
  }

  const copiarCedisExcel = () => {
    const selected = activeItems.filter(i => cedisRows[i.id]?.selected)
    if (selected.length === 0) return toast.error('Selecciona al menos un material')
    const header = ['Fecha solicitud','Centro Origen','Almacen Origen','Centro Destino','Almacen Destino','Codigo','Descripcion','Cantidad','UM','Lote','Fecha Caducidad','','','Estatus','Comentarios','Pedido'].join('\t')
    const rows = selected.map(item => {
      const r = cedisRows[item.id]
      return [cedisHeader.fecha_solicitud, cedisHeader.centro_origen, cedisHeader.almacen_origen,
        cedisHeader.centro_destino, cedisHeader.almacen_destino, item.codigo, item.descripcion ?? '',
        r.cantidad, r.um, r.lote, r.fecha_caducidad, '', '', 'Pendiente de solicitar', '', sol.numero_pedido_sap ?? ''].join('\t')
    }).join('\n')
    navigator.clipboard.writeText(header + '\n' + rows)
    toast.success('Copiado — pega en Excel con Ctrl+V')
  }

  const guardarCedis = async () => {
    const selected = activeItems.filter(i => cedisRows[i.id]?.selected)
    if (selected.length === 0) return toast.error('Selecciona al menos un material')
    if (!cedisHeader.centro_origen || !cedisHeader.centro_destino)
      return toast.error('Centro origen y destino son obligatorios')
    setSavingCedis(true)
    const { data: { user } } = await supabase.auth.getUser()
    for (const item of selected) {
      const r = cedisRows[item.id]
      const { data: req } = await supabase.from('crm_cedis_requests').insert({
        msc_solicitud_id: id, fecha_solicitud: cedisHeader.fecha_solicitud,
        centro_origen: cedisHeader.centro_origen, almacen_origen: cedisHeader.almacen_origen || null,
        centro_destino: cedisHeader.centro_destino, almacen_destino: cedisHeader.almacen_destino || null,
        codigo: item.codigo, descripcion: item.descripcion,
        cantidad: parseFloat(r.cantidad), um: r.um || null,
        lote: r.lote || null, fecha_caducidad: r.fecha_caducidad || null,
        estatus: 'pendiente_solicitar', comentarios: `MSC ${sol.numero_pedido_sap ?? id}`,
        cantidad_recibida: 0, cantidad_pendiente: parseFloat(r.cantidad), created_by: user?.id,
      }).select('id').single()
      if (req) {
        await supabase.from('crm_cedis_history').insert({
          request_id: req.id, estatus_nuevo: 'pendiente_solicitar',
          comentario: 'Creado desde MSC', created_by: user?.id,
        })
      }
    }
    toast.success(`${selected.length} material(es) agregados a CEDIS`)
    setShowCedisModal(false); setSavingCedis(false)
  }

  // Generar Anexo B
  const generarAnexoB = () => {
    const itemsActivos = activeItems
    const rows = itemsActivos.map(item => `
      <tr>
        <td style="border:1px solid #ccc;padding:6px 8px;font-family:monospace;font-size:12px">${item.codigo}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px">${item.descripcion ?? ''}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;font-size:12px">${item.cantidad_pedida}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px">${sol.motivo ?? ''}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px"></td>
      </tr>
      <tr>
        <td colspan="5" style="border:1px solid #eee;padding:2px 8px;font-size:10px;color:#888;font-style:italic">1 cj = ___ pzas</td>
      </tr>
    `).join('')

    // Filas vacías para llenar
    const emptyRows = Array(Math.max(0, 8 - itemsActivos.length)).fill('').map(() => `
      <tr style="height:32px">
        <td style="border:1px solid #ccc"></td>
        <td style="border:1px solid #ccc"></td>
        <td style="border:1px solid #ccc"></td>
        <td style="border:1px solid #ccc"></td>
        <td style="border:1px solid #ccc"></td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Evidencia Entrega MSC</title>
<style>
  body { font-family: Arial, sans-serif; padding: 30px; max-width: 850px; margin: 0 auto; }
  @media print { body { padding: 10px; } }
  .header-box { background: #4CAF50; color: white; text-align: center; padding: 12px; font-size: 20px; font-weight: bold; border: 2px solid #388E3C; }
  .badge { background: #4CAF50; color: white; font-size: 24px; font-weight: bold; padding: 8px 16px; border: 2px solid #388E3C; }
  .info-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .info-table td { border: 1px solid #ccc; padding: 5px 8px; font-size: 12px; }
  .info-table .label { background: #4CAF50; color: white; font-weight: bold; white-space: nowrap; width: 140px; }
  .mat-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .mat-table th { background: #1a1a2e; color: white; padding: 8px; text-align: left; font-size: 12px; border: 1px solid #ccc; }
  .firma-box { border: 1px solid #ccc; padding: 10px; }
  .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
</style>
</head>
<body>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
  <div class="header-box" style="flex:1;margin-right:10px">EVIDENCIA DE ENTREGA DE MERCANCÍA SIN CARGO</div>
  <div class="badge">B</div>
</div>

<table class="info-table">
  <tr>
    <td class="label">No. Cliente:</td>
    <td>${anexoBForm.no_cliente}</td>
    <td rowspan="4" style="text-align:center;width:160px;font-size:20px;font-weight:bold;color:#4CAF50;border:1px solid #ccc">
      Degasa
    </td>
  </tr>
  <tr>
    <td class="label">Cliente:</td>
    <td>${anexoBForm.cliente}</td>
  </tr>
  <tr>
    <td class="label">Grupo Cliente:</td>
    <td>${anexoBForm.grupo_cliente}</td>
  </tr>
  <tr>
    <td class="label">Ejecutivo:</td>
    <td>${anexoBForm.ejecutivo}</td>
    <td style="border:none"></td>
  </tr>
  <tr>
    <td class="label">Zona:</td>
    <td>${anexoBForm.zona}</td>
    <td style="border:none"></td>
  </tr>
  <tr>
    <td class="label">Dirección Ventas:</td>
    <td colspan="2">${anexoBForm.direccion_ventas}</td>
  </tr>
  <tr>
    <td class="label">Folio:</td>
    <td colspan="2">${sol.numero_pedido_sap ?? ''}</td>
  </tr>
</table>

<table class="mat-table">
  <thead>
    <tr>
      <th style="width:100px">Código</th>
      <th>Artículo</th>
      <th style="width:80px">Cantidad</th>
      <th style="width:100px">Motivo</th>
      <th style="width:80px">Firma</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    ${emptyRows}
  </tbody>
</table>

<div style="margin:16px 0">
  <span style="font-size:12px">Observaciones: </span>
  <span style="font-size:12px;border-bottom:1px solid #333;display:inline-block;width:80%">${anexoBForm.observaciones}</span>
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
    a.download = `anexo_b_${sol.numero_pedido_sap ?? id}.html`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setShowAnexoB(false)
    toast.success('Formato Anexo B descargado')
  }

  const openMail = () => {
    if (!sol) return
    const materiales = activeItems.map(i => `- ${i.codigo} ${i.descripcion ?? ''} x${i.cantidad_pedida}`).join('\n')
    const subject = encodeURIComponent(`Solicitud MSC - ${sol.fecha}`)
    const body = encodeURIComponent(
      `Estimados,\n\nSolicitud de mercancia sin cargo:\n\nFecha: ${sol.fecha}\nMotivo: ${sol.motivo ?? ''}\nPara: ${sol.destinatario_nombre ?? ''}\n\nMateriales:\n${materiales}`
    )
    const a = document.createElement('a')
    a.href = `mailto:?subject=${subject}&body=${body}`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  if (!sol) return <div className="text-sm text-gray-400 p-6">Cargando...</div>

  const totalPedido = activeItems.reduce((a, i) => a + (i.total ?? (i.cantidad_pedida * (i.precio_unitario ?? 0))), 0)
  const stepIdx = ESTATUS_FLOW.indexOf(sol.estatus)

  return (
    <div className="w-full max-w-5xl mx-auto">
      <button onClick={() => nav('/msc')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1 min-h-[44px]">
        Volver a MSC
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 mb-4">
        <div className="flex justify-between items-start mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {sol.numero_pedido_sap ? `Folio: ${sol.numero_pedido_sap}` : 'Solicitud MSC'}
            </h1>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${ESTATUS_COLOR[sol.estatus]}`}>
                {sol.estatus?.replace('_',' ')}
              </span>
              {sol.motivo && <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">{sol.motivo}</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={openMail}
              className="border border-blue-300 text-blue-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-50 min-h-[40px]">
              Correo
            </button>
            <button onClick={() => setShowAnexoB(true)}
              className="border border-green-300 text-green-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-green-50 min-h-[40px]">
              Anexo B
            </button>
            {!['completada','cancelada'].includes(sol.estatus) && (
              <button onClick={() => setCancelModal({ type: 'all' })}
                className="border border-red-200 text-red-500 px-3 py-2 rounded-lg text-xs font-medium hover:bg-red-50 min-h-[40px]">
                Cancelar solicitud
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-4">
          <div><p className="text-gray-400">Fecha</p><p className="font-medium text-gray-700">{sol.fecha}</p></div>
          <div><p className="text-gray-400">Para</p><p className="font-medium text-gray-700">{sol.destinatario_nombre ?? '-'}</p></div>
          <div><p className="text-gray-400">Aprobado por</p><p className="font-medium text-gray-700">{sol.aprobado_por ?? '-'}</p></div>
          {sol.solicitante && <div><p className="text-gray-400">Solicitante</p><p className="font-medium text-gray-700">{sol.solicitante}</p></div>}
        </div>

        {sol.estatus === 'en_proceso' && isTotalRecibido && salidasSinEvidencia.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-yellow-700 font-medium">
              Material al 100% recibido. Faltan evidencias en {salidasSinEvidencia.length} salida(s) para cerrar.
            </p>
          </div>
        )}

        <div className="flex items-center overflow-x-auto">
          {ESTATUS_FLOW.map((e, i) => (
            <div key={e} className="flex items-center flex-shrink-0">
              <div className={`text-xs font-medium px-2 py-1 rounded-lg whitespace-nowrap ${
                i < stepIdx ? 'text-teal-600' : i === stepIdx ? 'bg-teal-600 text-white' : 'text-gray-300'
              }`}>
                {i < stepIdx ? 'v ' : ''}{e.replace('_',' ')}
              </div>
              {i < ESTATUS_FLOW.length - 1 && (
                <div className={`w-4 h-0.5 mx-1 flex-shrink-0 ${i < stepIdx ? 'bg-teal-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabla materiales con cancelación por línea */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
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
                {['Codigo','Articulo','Cant. Pedida','Cant. Recibida','Cant. Entregada','Disponible','Pendiente','P.Unit','Total','Estatus',''].map(h => (
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
                const isCancelled = item.estatus_linea === 'cancelado'
                return (
                  <tr key={item.id} className={`border-b border-gray-100 ${isCancelled ? 'opacity-50 bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <td className={`px-3 py-2 font-mono font-semibold ${isCancelled ? 'line-through text-gray-400' : 'text-gray-800'}`}>{item.codigo}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-40 truncate">{item.descripcion ?? '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">{item.cantidad_pedida}</td>
                    <td className="px-3 py-2 text-right text-blue-600 font-medium">{rec}</td>
                    <td className="px-3 py-2 text-right text-teal-600 font-medium">{ent}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`font-semibold ${disp > 0 ? 'text-green-600' : 'text-gray-400'}`}>{disp}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!isCancelled && pend > 0
                        ? <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{pend} pend.</span>
                        : !isCancelled ? <span className="text-green-500 font-semibold">Completo</span>
                        : null}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {item.precio_unitario ? `$${Number(item.precio_unitario).toLocaleString('es-MX')}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {item.total ? `$${Number(item.total).toLocaleString('es-MX')}` : '-'}
                    </td>
                    <td className="px-3 py-2">
                      {isCancelled
                        ? <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-medium">Cancelado</span>
                        : <span className="bg-green-100 text-green-600 px-2 py-0.5 rounded-full text-xs font-medium">Activo</span>
                      }
                      {isCancelled && item.motivo_cancelacion && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">{item.motivo_cancelacion}</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isCancelled ? (
                        <button onClick={() => reactivarItem(item.id)}
                          className="text-xs text-teal-600 hover:underline font-medium whitespace-nowrap">
                          Reactivar
                        </button>
                      ) : !['completada'].includes(sol.estatus) && (
                        <button onClick={() => setCancelModal({ type: 'item', itemId: item.id })}
                          className="text-xs text-red-400 hover:text-red-600 font-medium whitespace-nowrap">
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Etapa 1 */}
      {['enviada','borrador'].includes(sol.estatus) && (
        <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          <button onClick={() => setOpenAprobacion(!openAprobacion)}
            className="w-full flex justify-between items-center px-5 py-4 hover:bg-gray-50 min-h-[56px]">
            <h2 className="font-semibold text-gray-700">Etapa 1 - Aprobacion</h2>
            <span className="text-gray-400">{openAprobacion ? 'v' : '>'}</span>
          </button>
          {openAprobacion && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 mb-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Aprobado por</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={aprobForm.aprobado_por}
                    onChange={e => setAprobForm(x => ({ ...x, aprobado_por: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Notas</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={aprobForm.notas_aprobacion}
                    onChange={e => setAprobForm(x => ({ ...x, notas_aprobacion: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => aprobar('aprobada')} disabled={saving}
                  className="bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">Aprobar</button>
                <button onClick={() => aprobar('rechazada')} disabled={saving}
                  className="border border-red-300 text-red-500 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">Rechazar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Etapa 2 */}
      {['aprobada','en_proceso'].includes(sol.estatus) && (
        <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          <button onClick={() => setOpenFolio(!openFolio)}
            className="w-full flex justify-between items-center px-5 py-4 hover:bg-gray-50 min-h-[56px]">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-700">Etapa 2 - Folio SAP</h2>
              {sol.numero_pedido_sap && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{sol.numero_pedido_sap}</span>
              )}
            </div>
            <span className="text-gray-400">{openFolio ? 'v' : '>'}</span>
          </button>
          {openFolio && (
            <div className="px-5 pb-5 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 mb-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Numero de pedido SAP *</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
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
                    value={folioForm.capturado_por}
                    onChange={e => setFolioForm(x => ({ ...x, capturado_por: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={guardarFolio} disabled={saving}
                  className="bg-teal-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                  Guardar folio
                </button>
                {canSeeCedis && (
                  <button onClick={initCedisRows}
                    className="border border-amber-300 text-amber-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-50">
                    Solicitar traslado CEDIS
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Etapa 3 */}
      {sol.estatus === 'en_proceso' && (
        <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
          <button onClick={() => setOpenRecepcion(!openRecepcion)}
            className="w-full flex justify-between items-center px-5 py-4 hover:bg-gray-50 min-h-[56px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-semibold text-gray-700">Etapa 3 - Recepciones</h2>
              {recepciones.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{recepciones.length} recepcion(es)</span>
              )}
              {isTotalRecibido && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">100% recibido</span>
              )}
            </div>
            <span className="text-gray-400">{openRecepcion ? 'v' : '>'}</span>
          </button>
          {openRecepcion && (
            <div className="px-5 pb-5 border-t border-gray-100">
              {recepciones.length > 0 && (
                <div className="mt-4 mb-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Recepciones anteriores</p>
                  {recepciones.map(rec => (
                    <div key={rec.id} className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-100 text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="font-semibold">Folio: {rec.folio_entrega_salida}</span>
                        <span className="text-gray-400">{rec.fecha_recepcion} · {rec.tipo}</span>
                      </div>
                      {(rec.msc_recepcion_items ?? []).map((ri: any) => (
                        <span key={ri.id} className="mr-3 text-gray-600">{ri.codigo}: <strong>{ri.cantidad_recibida}</strong></span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {isTotalRecibido ? (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mt-4">
                  <p className="text-sm text-green-700 font-medium">Todo el material recibido.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 mb-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Folio entrega de salida *</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        value={recepForm.folio_entrega_salida}
                        onChange={e => setRecepForm(x => ({ ...x, folio_entrega_salida: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Fecha</label>
                      <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        value={recepForm.fecha_recepcion}
                        onChange={e => setRecepForm(x => ({ ...x, fecha_recepcion: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                      <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                        value={recepForm.tipo}
                        onChange={e => setRecepForm(x => ({ ...x, tipo: e.target.value }))}>
                        <option value="usuario">Lo recibo yo</option>
                        <option value="cliente_directo">Directo al cliente</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto mb-3">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Codigo','Articulo','Pedido','Ya recibido','Recibo ahora'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeItems.map(item => {
                          const yaRec = cantRecibida(item.id, item.codigo)
                          const pendiente = item.cantidad_pedida - yaRec
                          if (pendiente <= 0) return null
                          return (
                            <tr key={item.id} className="border-b border-gray-100">
                              <td className="px-3 py-2 font-mono font-semibold">{item.codigo}</td>
                              <td className="px-3 py-2 text-gray-500 max-w-32 truncate">{item.descripcion}</td>
                              <td className="px-3 py-2 text-right">{item.cantidad_pedida}</td>
                              <td className="px-3 py-2 text-right text-blue-600">{yaRec}</td>
                              <td className="px-3 py-2">
                                <input type="number"
                                  className="w-full border border-teal-300 rounded-lg px-2 py-1.5 text-xs outline-none text-right"
                                  placeholder={String(pendiente)}
                                  value={recepItems[item.id] ?? ''}
                                  onChange={e => setRecepItems(prev => ({ ...prev, [item.id]: e.target.value }))} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={guardarRecepcion} disabled={saving}
                      className="bg-teal-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
                      Registrar recepcion
                    </button>
                    <label className="cursor-pointer border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center">
                      Subir evidencia
                      <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg"
                        onChange={e => { const f = e.target.files?.[0]; if (f) subirEvidencia(f, 'recepcion') }} />
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Evidencias generales */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-gray-700">Evidencias de solicitud</h2>
          <label className="cursor-pointer text-xs text-teal-600 font-medium border border-teal-200 px-3 py-1.5 rounded-lg hover:bg-teal-50 flex items-center">
            + Subir
            <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.xlsx"
              onChange={e => { const f = e.target.files?.[0]; if (f) subirEvidencia(f, 'solicitud') }} />
          </label>
        </div>
        {evidencias.filter(e => !e.salida_id).length === 0
          ? <p className="text-xs text-gray-400">Sin evidencias.</p>
          : <div className="flex flex-wrap gap-2">
              {evidencias.filter(e => !e.salida_id).map(ev => (
                <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer"
                  className="text-xs bg-gray-50 border border-gray-200 text-teal-600 px-3 py-2 rounded-lg hover:border-teal-300 flex items-center gap-2">
                  <span className="text-gray-400">{ev.tipo}</span>
                  <span className="max-w-32 truncate">{ev.nombre}</span>
                </a>
              ))}
            </div>
        }
      </div>

      {/* Salidas */}
      {salidas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Salidas registradas</h2>
          </div>
          {salidas.map(sal => {
            const misSalItems = (sal.msc_salida_items ?? []).filter((si: any) => si.solicitud_id === id)
            const evSalida = evidencias.filter(e => e.salida_id === sal.id)
            const tieneEvidencia = evSalida.length > 0
            return (
              <div key={sal.id} className="px-4 py-4 border-b border-gray-100 last:border-0">
                <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{sal.receptor_nombre}</p>
                      {tieneEvidencia
                        ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Evidencia OK</span>
                        : <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Sin evidencia</span>}
                    </div>
                    <p className="text-xs text-gray-400">{sal.receptor_tipo} · {sal.fecha_entrega}</p>
                  </div>
                  <label className="cursor-pointer border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center">
                    {tieneEvidencia ? 'Agregar evidencia' : '+ Subir evidencia *'}
                    <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg"
                      onChange={e => { const f = e.target.files?.[0]; if (f) subirEvidencia(f, 'entrega', sal.id) }} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {misSalItems.map((si: any) => (
                    <span key={si.id} className="text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-1 rounded-lg font-mono">
                      {si.codigo}: {si.cantidad_entregada}
                    </span>
                  ))}
                </div>
                {evSalida.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {evSalida.map(ev => (
                      <a key={ev.id} href={ev.url} target="_blank" rel="noreferrer"
                        className="text-xs text-teal-600 hover:underline bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
                        {ev.nombre}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal cancelación */}
      {cancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-gray-800 mb-2">
              {cancelModal.type === 'all' ? 'Cancelar solicitud completa' : 'Cancelar material'}
            </h2>
            {cancelModal.type === 'all' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-xs text-yellow-700">
                Se cancelarán {activeItems.length} material(es) activo(s).
                {activeItems.some(i => cantRecibida(i.id, i.codigo) > 0) && (
                  <p className="mt-1 font-medium">Algunos materiales ya tienen recepciones registradas.</p>
                )}
              </div>
            )}
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1">Motivo de cancelación *</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-300 h-20 resize-none"
                placeholder="Describe el motivo..."
                value={cancelMotivo}
                onChange={e => setCancelMotivo(e.target.value)}
                autoFocus />
            </div>
            <div className="flex justify-between">
              <button onClick={() => { setCancelModal(null); setCancelMotivo('') }}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={confirmarCancelacion}
                className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600">
                Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Anexo B */}
      {showAnexoB && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-bold text-gray-800">Generar Anexo B</h2>
              <button onClick={() => setShowAnexoB(false)} className="text-gray-400 hover:text-gray-600 text-xl">x</button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'No. Cliente', key: 'no_cliente' },
                { label: 'Cliente', key: 'cliente' },
                { label: 'Grupo Cliente', key: 'grupo_cliente' },
                { label: 'Ejecutivo', key: 'ejecutivo' },
                { label: 'Zona', key: 'zona' },
                { label: 'Dirección Ventas *', key: 'direccion_ventas' },
                { label: 'Observaciones', key: 'observaciones' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={anexoBForm[f.key as keyof typeof anexoBForm]}
                    onChange={e => setAnexoBForm(x => ({ ...x, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-5">
              <button onClick={() => setShowAnexoB(false)}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={generarAnexoB}
                className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-green-700">
                Descargar Anexo B
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CEDIS */}
      {showCedisModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-6 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-4xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-800">Solicitar traslado CEDIS</h2>
              <button onClick={() => setShowCedisModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                {[
                  { label: 'Fecha solicitud', key: 'fecha_solicitud', type: 'date' },
                  { label: 'Centro Origen *', key: 'centro_origen' },
                  { label: 'Almacen Origen', key: 'almacen_origen' },
                  { label: 'Centro Destino *', key: 'centro_destino' },
                  { label: 'Almacen Destino', key: 'almacen_destino' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                    <input type={f.type ?? 'text'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                      value={cedisHeader[f.key as keyof typeof cedisHeader]}
                      onChange={e => setCedisHeader(x => ({ ...x, [f.key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 border border-gray-200 w-8"></th>
                      <th className="px-3 py-2 border border-gray-200 text-left text-gray-500 font-semibold">Codigo</th>
                      <th className="px-3 py-2 border border-gray-200 text-left text-gray-500 font-semibold">Descripcion</th>
                      <th className="px-3 py-2 border border-gray-200 text-left text-gray-500 font-semibold w-20">Cantidad</th>
                      <th className="px-3 py-2 border border-gray-200 text-left text-gray-500 font-semibold w-16">UM</th>
                      <th className="px-3 py-2 border border-gray-200 text-left text-gray-500 font-semibold w-28">Lote</th>
                      <th className="px-3 py-2 border border-gray-200 text-left text-gray-500 font-semibold w-32">Caducidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItems.map(item => {
                      const r = cedisRows[item.id] ?? { selected: false, cantidad: '', um: '', lote: '', fecha_caducidad: '' }
                      return (
                        <tr key={item.id} className={r.selected ? 'bg-amber-50' : 'bg-white'}>
                          <td className="px-3 py-2 border border-gray-200 text-center">
                            <input type="checkbox" checked={r.selected}
                              onChange={e => setCedisRows(prev => ({ ...prev, [item.id]: { ...prev[item.id], selected: e.target.checked } }))} />
                          </td>
                          <td className="px-3 py-2 border border-gray-200 font-mono font-semibold text-gray-800">{item.codigo}</td>
                          <td className="px-3 py-2 border border-gray-200 text-gray-600">{item.descripcion}</td>
                          {['cantidad','um','lote','fecha_caducidad'].map(field => (
                            <td key={field} className="border border-gray-200 p-0">
                              <input type={field === 'fecha_caducidad' ? 'date' : field === 'cantidad' ? 'number' : 'text'}
                                className="w-full px-2 py-1.5 text-xs outline-none focus:bg-amber-50 bg-transparent"
                                value={r[field as keyof typeof r] as string}
                                onChange={e => setCedisRows(prev => ({ ...prev, [item.id]: { ...prev[item.id], [field]: e.target.value } }))}
                                disabled={!r.selected} />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 flex-wrap justify-between">
                <button onClick={copiarCedisExcel}
                  className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
                  Copiar para Excel
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setShowCedisModal(false)}
                    className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button onClick={guardarCedis} disabled={savingCedis}
                    className="bg-amber-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
                    {savingCedis ? 'Guardando...' : 'Guardar pendiente de solicitar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
