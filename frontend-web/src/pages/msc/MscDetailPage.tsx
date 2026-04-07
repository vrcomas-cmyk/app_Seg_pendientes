import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '../../lib/AuthContext'
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

  // Salida desde detalle
  const [showSalidaPanel, setShowSalidaPanel] = useState(false)
  const [salidaStep, setSalidaStep] = useState(1)
  const [salidaQtys, setSalidaQtys] = useState<Record<string, string>>({})
  const [salidaUms, setSalidaUms] = useState<Record<string, string>>({})
  const [salidaForm2, setSalidaForm2] = useState({
    receptor_nombre: '', receptor_tipo: 'cliente',
    fecha_entrega: new Date().toISOString().split('T')[0],
    direccion_ventas: '', observaciones: '', motivo: '',
  })
  const [salidaClienteData, setSalidaClienteData] = useState<any>(null)
  const [savingSalida, setSavingSalida] = useState(false)
  const [salidaCreada, setSalidaCreada] = useState<any>(null)

  // Salida desde detalle

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
        fecha_pedido_sap:  s.data.fecha_pedido_sap ?? new Date().toISOString().split('T')[0],
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

  // Memoizar mapa de cantidades recibidas por item
  const cantRecibidaMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      const total = recepciones.reduce((acc, rec) => {
        const ri = (rec.msc_recepcion_items ?? []).find((r: any) => r.item_id === item.id || r.codigo === item.codigo)
        return acc + (ri?.cantidad_recibida ?? 0)
      }, 0)
      map.set(item.id, total)
    }
    return map
  }, [items, recepciones])

  // Helper para obtener cantidad recibida (ahora usa el mapa memoizado)
  const cantRecibida = (itemId: string, codigo: string) => cantRecibidaMap.get(itemId) ?? 0

  // Memoizar mapa de cantidades entregadas por código
  const cantEntregadaMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      const total = salidas.reduce((acc, sal) => {
        const si = (sal.msc_salida_items ?? []).filter((s: any) => s.solicitud_id === id && s.codigo === item.codigo)
        return acc + si.reduce((a: number, s: any) => a + (s.cantidad_entregada ?? 0), 0)
      }, 0)
      map.set(item.codigo, total)
    }
    return map
  }, [items, salidas, id])

  const cantEntregada = (codigo: string) => cantEntregadaMap.get(codigo) ?? 0

  // Memoizar items activos
  const activeItems = useMemo(() => items.filter(i => i.estatus_linea !== 'cancelado'), [items])

  // Memoizar verificación de total recibido
  const isTotalRecibido = useMemo(() =>
    activeItems.length > 0 && activeItems.every(item => {
      const rec = cantRecibidaMap.get(item.id) ?? 0
      return rec >= item.cantidad_pedida
    }), [activeItems, cantRecibidaMap])

  // Memoizar salidas sin evidencia
  const salidasSinEvidencia = useMemo(() =>
    salidas.filter(sal => {
      const evSalida = evidencias.filter(e => e.salida_id === sal.id)
      return evSalida.length === 0
    }), [salidas, evidencias])

  // Memoizar verificación de completación
  const puedeCompletarse = useMemo(() =>
    isTotalRecibido && salidasSinEvidencia.length === 0 && salidas.length > 0,
    [isTotalRecibido, salidasSinEvidencia, salidas.length])

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
    const { user } = useAuth(); // injected
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
    const { user } = useAuth(); // injected
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
      // Batch update en lugar de loop secuencial (evita rate limiting)
      await supabase.from('msc_items').update({
        estatus_linea: 'cancelado',
        motivo_cancelacion: cancelMotivo,
        cancelado_at: now,
      }).in('id', itemIds)
      toast.success('Solicitud cancelada')
    }
    setCancelModal(null); setCancelMotivo('')
    // Verificar si quedan items activos
    const { data: remainingItems } = await supabase.from('msc_items')
      .select('id, estatus_linea').eq('solicitud_id', id)
    const hayActivos = (remainingItems ?? []).some(i => i.estatus_linea !== 'cancelado')
    if (!hayActivos) {
      await supabase.from('msc_solicitudes').update({ estatus: 'cancelada' }).eq('id', id)
      toast('Solicitud cancelada — todos los materiales fueron cancelados')
    }
    // Esperar un poco antes de recargar para evitar too many requests
    setTimeout(() => load(), 500)
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
    const { user } = useAuth(); // injected
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
    const emptyRows = ''
    const LOGO_URI = 'data:image/png;base64,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' 

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
    <td rowspan="4" style="text-align:center;width:160px;border:1px solid #ccc;padding:8px">
      <img src="data:image/png;base64,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" style="max-width:140px;max-height:70px;object-fit:contain" alt="Degasa" />
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


  const initSalidaPanel = async () => {
    // Cargar UM del catálogo
    const codigos = activeItems.map(i => i.codigo)
    const { data: catData } = await supabase.from('catalog_materials')
      .select('material, um').in('material', codigos)
    const newUms: Record<string, string> = {}
    catData?.forEach((c: any) => { newUms[c.material] = c.um ?? '' })
    setSalidaUms(newUms)
    // Cargar datos del cliente
    if (sol.client_id) {
      const { data: cli } = await supabase.from('crm_clients')
        .select('no_cliente, solicitante, razon_social, grupo_cliente, ejecutivo, zona')
        .eq('id', sol.client_id).single()
      setSalidaClienteData(cli)
    }
    setSalidaQtys({})
    setSalidaStep(1)
    setSalidaCreada(null)
    setShowSalidaPanel(true)
  }

  const confirmarSalidaDetalle = async () => {
    const itemsValidos = activeItems.filter(i => parseFloat(salidaQtys[i.id] ?? '0') > 0)
    if (itemsValidos.length === 0) return toast.error('Ingresa al menos una cantidad')
    if (!salidaForm2.receptor_nombre.trim()) return toast.error('El nombre del receptor es obligatorio')
    setSavingSalida(true)
    const { user } = useAuth(); // injected

    const { data: sal } = await supabase.from('msc_salidas').insert({
      receptor_nombre: salidaForm2.receptor_nombre,
      receptor_tipo:   salidaForm2.receptor_tipo,
      fecha_entrega:   salidaForm2.fecha_entrega,
      notas:           salidaForm2.observaciones || null,
      created_by:      user?.id,
    }).select().single()

    if (!sal) { toast.error('Error al crear salida'); setSavingSalida(false); return }

    await supabase.from('msc_salida_items').insert(
      itemsValidos.map(item => ({
        salida_id:          sal.id,
        solicitud_id:       id,
        item_id:            item.id,
        codigo:             item.codigo,
        descripcion:        item.descripcion,
        cantidad_entregada: parseFloat(salidaQtys[item.id]),
        folio_pedido:       sol.numero_pedido_sap ?? null,
        folio_entrega_salida: null,
      }))
    )

    // Generar Anexo B
    generarAnexoBSalida(sal, itemsValidos)
    setSalidaCreada(sal)
    setSalidaStep(3)
    toast.success('Salida registrada')
    load()
    setSavingSalida(false)
  }

  const LOGO_SALIDA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnAAAADwCAYAAACAPFlSAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAALkVJREFUeNrsnT9vG0m3p8tzB9hggR29C2ywwWKo0JGpxKmocKKR4glMfgKLiTNDEiabRNInEB04Fh05FJVOYjqa0O3gYjfalwPcxeLi7r3v9pFOj9t0k+w/VdVV3c8DCJyxxP5z6lTVr05VnTIGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKvAEEwB84dX7p4P0Y9zkGr/99Mc5lgQAAJd8jwkAvkLE21mD7y8wIQAAuOY7TABglXtMAAAACDgAvzzDBAAAgIADiIu9ht9fYkIAAEDAAfhl0PD7K0wIAAAIOIC4BBwROAAAQMAB+OLV+6dNp08lhQgROAAAQMABeGTY8PsJJgQAAAQcQFwg4AAAAAEH4JmmETimTwEAoLsC7u3r50NMDwHSdA3cR0wIAACdFHCpeDtNPz6kn3fpz4AigID4ERMAAAACrpiZeVwrNFIhd0oxQCA0HVAsMCEAAHRSwP3y6++yTujEPK4XkimrS6JxEAh7mAAAAGLgSVs3TgXbKP24y/2TCLpJKvDmfSoAFa5D8+0C+iT9WaT2SHBTP7x6//QfDS/xN/LAAQBApwWcipdx+nGz9s9XqWiZdly0SaRH3v2F2b3zUTL7X6c2meGuYQu4VLw9wYoAANB5AbdFxIloOeli9Cl93/P046WpPl0nNpEIJUc1uRFvI/N1RLgqy1TAHWBJAADwQet54DSydLH2zxKVkg0Oxx0SbqP051P6n2em3lorsckdKViChalTAADoj4BTEXduHnen5hGRc5sKlssOiDfZaSvRnUHDS+0h4pzBMVoAAICAqyHiJulH0QaG01SwfIhVtKTPLdPDNkVoJuLYMWmXpvb8jAkBAKB3Ak4REVe0xiubUo0qZ5yKt7EjsXGD+1qlaRJfplABAKCfAk5zxB2ZzdNRWc644KNPDsVbxrGmYgE7DBp+n80lAADQTwGXE3FZot8iRLR8Clm8aKRw7OFWL3FhazAlDQAACLiGIk6iGUc7Ots7TckRmngTYelr48UxJ1hYo9Eay99++mOBCQEAoNcCLifiJjv+7CykKVV9Dt9r045xYwAAAARcSCJuln5c7fizkXnc4BDCLlXJ8TbwfM9D3LgZmsS3Cax/AwAABNyaiJNjtXadjyqi6U5PdWgFFZBt7JId4catww5UAABAwBWwKb1InofpyxbXxbWVcHiPnHCNGTT8PhE4AABAwK1TYmdqnjNN4eEN3bgwatFEnMzQroD7ExMCAAACrljEJSriyjDW0xt8RaZI5xE3PzT8foIJAQDAJ9/H9LCpiFukokzWxJWZrswOfz/SCJ4TNI0HO0EjQtcr/iXu/+c//+vou/94Uvi3//79P8z//m//9vCJgAMAAARcfRF3lXbAz0y5RLnSUX9SEedqndIYNwpKlA3MlynRZzmhNtr03f/++T9tvfY//b8n5n/9j3/d9idsYgAAAARcCaYqzsqs/cqS/roScS9wIy8CLRNmmVDLxNlX0TSbSNTtX/7Lv5s//+u/bf273376g00MAADglScRd+gPU6QVOu+Hc1ZtijgVFZ8CMIe816IjQm1kvkTRDnMizRXLf/nh34f/JxVqItj+739OP/9JPv+j9AVSAfeEpgQAAHwSawTu4aQGXQ9Xdsepi0hcKGvfkgiF2sB8iaI+08+B49tKuYvQ/Sg2E9H76v1Tue+HBtdc0IwAAAACrpqIm6VCQKI045ZE3GEgdghawK2JtUPjcNqzQFzdy+eWCCU59AAAAAHXAlXWw9kWcYMA3j+49Vc6vT3KiTVfdhIhK6d23KdlO/dUhqx/AwAABFxVJEVIKhjkpIYq02C2RFwICXRbFxAq2I5VsI1aeP83ItxqRiKbCjiS+AIAAAKupohbVsgPZ0XEqWgJgfsWBNtgTbD5noZsKtry/GDhWQAAABBwNUWc5If72VSLADURcaGsnVp4Em1i159VuA1aeM9ERdvM8pq/pkKcHHAAAICAa0g2lVpFXLnOE+eSpcsNDKlNjnOirQ3BKuJI1rJdB1w2iQEAAEDA1UfETCo6rtP/PKv4VREnt+l3D1weu+WANx0UbcJC3k12GXu416jJl3/76Q8EHAAAIOAsiLhznUqtOjU2MB7OTrWMFYGj6/letizaVvo+16GnRVl7ZgAAAAScJWRDw12N74mQuU1/jmIQb02EZiraRKiNVbgNWnyPhfEXbfsKTeLbBDYwAABAK3zXxZfSpK3zml8fpeKmzOkObUdfLmoKt+z9/m4ed+22Id6yaNt+WlZHbYg3hSS+AACAgAuMaYPvjlORc75DJLYZfam8EzN9H3knObdVIpPjlp470XIR4TYJYKq0qXi9NwAAAC3Q1SnUbEPDrIFYOUu/v9yR0T8x/iNYEr0qFX3TadJT8zhN2ma0aWEe17bNA3OTAU0AAAAg4MLjwjSLNt2kIijZEm1bGP/RrJ2L/AMSbiKgLyLalFAV1sABAAACzjYahRORNap5CRE/sl7sYMPv7z0LOIkIngcu3CRCKKlcriLYzXto4V0BAAC8810P3vG64feHqTDadETX3GMnLveZbBFvItxkjdtZS+It0eeT9W3nkeXTqy2oaUIAAKANnvThJXXx/qDhZY50d+v6tSVCN/bwGidFa8j0iKsb0956roc1eXKUWWx+8er90783Ebu//fTHE5oQAABog+968p42Tiy40SnKdS48PP9kXbzJgfLpj+SsuzPtpQKRd9+PUbwpTSKVCc0HAAAg4Nwys3ANEUmn6/+oC/RdirjJep40nS6VM1+PW7KniMmDmKdKX71/2lT0IuAAAKA1ejMFlIoeiVSNLFxqv2hXZXp9EVRDy4/9lXjTCOCtpfeoK1omRVPJEQo4seFdg0vMf/vpjxOaEAAAaIPvevSutg5+P9vw73L8lq1olFznaE28SbTtU4viTaKMB10Qb0rTjR4faT4AAAAB5x5bSWTlRIPB+j/qVKKkG1laeM79vFDSUyFuTXu7Sw86uLN0SPUHAAAEXOCo+LAl4s423EPEjkTi6izqF8EmUbeTTCjJlKlO/Z61ZLaZijfSZRSXFwAAAALOA+8sXacwCpcJxfTn4bxPFUDbolaJ/s2RHur+lyjQ69tat1cVeeYTPa+0q/ncDqn+AAAQK9/37H0lAndjS8SlP+ebfqnROElsO0nFmEzXrU9/JpuOmNK/vzPtTJlKtG1C1K2UnQAAAFqhd4lINXeajfQbIsD2HTxfm+JtruKt86cokMQXAABi5rsevvO9pesMVGx1Rbxd5dff9YAmNib6BgAACDjPzC1ea9QR8TbRdXu9wEISXw6xBwAABJxPdN1ZYulyP0cu3lam4KSHHtBUwCUGAACgRb7v6XtLFO7UwnUaT6Hq6QptibcjV5sVXr1/OlT7iFh6pu833PGeSe7ns3lM1bH87ac/bEe8mtr6syObjdRGP+Z8a7Tja0sty6U+l9hr0YdKvOZjh7k6uVfCXq59LER7ZXVwpD42yNXLbe1E1kbcq93EXr1ZRlBQL3fZzJgvaYZ6ZzPs5Y9eLsTWUw1uLV1uf9Nu0grizXdSWeviTaclpeL+rJ82BelSK/h9WqnnFp713DTLrTdNn+PKwnMM12xmk4U2hvOuNITqY8cq1lz52LsuCWDtTDP/GlpuQ/I+lnTIZsM1P7NdLyWd1aJD9RIfQ8B5F3H/sHSpo7rHS6XPIClNxrGKNx3RS0P3wvjLV5clZH5Tt6O1IOCOGtx7oGX+wjSfyi1Loja7jq0RVB/L7DX07GPXMXayKkBeat30FdkXO8lxhbMYo5laLzOb+ayX1zGKE/WxF1o38TEEnHcBZytJbq01ZOn9ZQr3Mkbxpo3dmecOYlMDeJFW5lnF52+aSqaygNNR6ktjJ4VN0wjARehRppyPjVt+lKUKuZkJnNRmY/Wxto+Jm6mPJRHY7FhtNgrAZm8iqJf42O7B5jMdBEjb8dFl29FnAXdu7BxRdSHnhFa8tzj/hxZeu9GGhYA61SJhKp3secn3aCTeq+SAU+F2FkAHEYWQC9jHag0WPHaqZ8Zf5Ch6IafC7TJAm4VaL0P1MbHTtO1IeWqfUxW2ErnPTnwSQZdNLU9clGmfBZwtEVVJwOm6tw8tVITa4k1HFqemvTNZq3Sy013r5NL3+dTE/mUEnAqRmwCFW6gN4J52qOMIfGwSQgerg4ObADvVIiE3DWHaS6f+LiOol3O1WRKAj4m9hvjYRhtl/nRUdH/1uTttN2ymMTO9ziafiqlG2fhrCrhLY2cHbBWu6uZ505HqjWl3qrSOKJlsavzSd2qy/lF2Rx3ssNl5BGL3Gz8WP2mpARxrJxGTj83Vx9qw157WyeOI7CV2urCx+aeBzc5aaHsb18uyMwv4mH8fywnco21tgYo4WbpzYLPN6LuAs3GsVmkB19LU6VxOWOhJBd5ZmfW9/t5EHKbXPNpSSW8iGK1uQgTvia9oXEd8zPqouoMDqvXB1YlP4RtRpHLjoFH9bImPNR/AW7bVnQ5+xcdkc0Wi06lL8yXKK74+ywYPNgV5X/PAZdx77jxu2qj4NZwyGy0MIi7bhym59F0O1yIlQws2LbLZ2MQXRVpHyvtD+i5T16NY7VRvI7eXPPtt+i7ScE9c30ynak5N3Ei5f0rf5SQ/DV1iXepi20W3DKra2Cxmm4cpOK2XM3yslI9JO/bV4MqRjw3Ej/Xaq/Rzrv4mou5MPw/1Z2pbA/TxKK3SBWaTt6+fj43fyEx2ysKqYgWW57yLXLzlOdbGz9b7/Flgs5vIR6zrXOo7ueokMh/rir3G6Tt90IiiC3vtyfU70LHmhe+diqv84GFXp7ztp8hmNx0Qb3mb3ajAcuVjdx3zsds1HzOWfUz+LdH/lc8XZnNAaKURwRECzhKaTsN5KF83LvhuSC6qpgvRtVtdEiL5EeyHXOLcJiQFjd64g9XDiSjJiV3TYR+zaa9s2cWwgzbLDxSaDLAW62JEBwhdrJenYjOb9VIHt7bSaoXsY03eb7khSLLeL2Q7UddxcnpP3yNwmwqmCmUE4KlnUSTr3q4qVmJx8rMOl3PWqD+zIeByncSowzbLpm6s+K762LjD9hqovYaW7JXtXht02GZjm9HeXL0cdtlmtuplxwcINn3sm35e1yTm7fZGPz/m/kaCIpKs+VBtvUDA2eXepQDU6NtLj+/zMHVKx7pRxDVd87jqSSdhVcT1zMcai7iceNvrgc2a+sWyR+LNWr3Ex6oP3AuY65IQWd82S39O9FN+jnL+OVUd8M7mS/V9E4NRRewy8uQ7+lZp3ZuuqRjjBpUqcl86ifXO4qjO7sEeibd1EXdUZ+dgzzpWG/zZM/GWr5e3OaFQxccG+FglNk2ByiYFiWDua9u4XBd98u/qnyMVctbofQSu7jmmOXZ1aC88vo5Mnc4rVOKx6c6iVV/EkNTSZWdRtaM47+kAIVt0vlfRXllqFTpWBlVlGFWdHlQfu8XHmvfzujFBRNkH3dRQZO9TrdPW0+cQgXtkYWquZdq2UUB3ng48Oti0QiUeGf+LyddHKKtcI7IXSQPchhgp2mzThr2ks7hMG6FpSR+T6eqzln2sTZtlkbSDCt+5baFc8/6VrLVZwwg6+rbO5lwE4GMPbVJa1z5WSP1z07KPrdZ8KgYf29jPS2qX1P6JDtjkM78s64XWqSMXeekQcI/cGzeL0X1G365TMVnKQXIjMB8j47nad1Fm9KHTR/KTnSHXt1Fi3mbLXZVep0LEXodqL9cNs+yCuy9xXNnA0wChro+N1Gau80AOy4re3JE8rsnba1myvcjXydAGWj6eZ6mCrZSfrdXLYw8Dedltudx1xJtGxI8D9rGR+llU0VS1+36ubdlzKdwyen0SQ8bb189HOlKuXKlT0XSw4ZpSYT957PQPyq59a3qYe4kIiFTeaxuZw3Wa94Xp9m7PLFP3m6Y2045DIhJjh+JXnvdgW8OkecuGEdgr29jiOopzsk30akT8zuH9pYORXXLzptM4nnwslHopOwhnTTth7dhfqq+5rJf7m8rXg48t1V6d87Ey51+3AQLui+Cqcy7qIhVNRxuu5zMDeOmD6h1mJs8aOyfnaWrjc9YxIefMZjlh4up0iG1Hip0bN1OnMfvYxs5Vy+qTq3Iyj0fKLRzYS573VDvaLgm5RG02i9BmIp5ONtxXBlUDfAwB10UBV+dc1G0CzldunSR9hv0Ko5oPDiqCt4O9O3CuYcaVNnorx/bKGkAXgmpacNasq/N+Z3o/Hz7m6izIwiO3HB1flKi95h7sFetB8UVcuBogFNjMVQaAb6K9jnzM21nALfuYTE0fhOisCLgvgmtsqq/ZKTzI3vP0aZXoWx2RGkQF7lCHkajNFp5tNjT2Fy9/E1VyMD2/0g5p0YKP3Rj764WO1s4AFVvZntbyNqAqGFzFurvR64Hxjm2WpO+x73hQ1aaP+R7Ab5xtaBsS+X7tkLY49vTMSQXxNrL8XNLQHfgWb4I0GroofGI8HIVmsyFQmy1asJmU15FlP8+EdOZjx5bF21IF4qIlH5OpqKnlS5/t+P/GAzp5bt8dq9pMymnfND/dxjczFdbLDthMrrc+hWp7ycy0ZR87MB7PMQ/ZnxFwim4AsFVQh54e+7pBx9HUoZ3urilZmWcqSmIQcTJ9dtRGo1cgSmYWL3uqU/O2O4qsU1217GNXlgcKI92Ykw2qbAneLFI5a9leK51umpk4kOnSSQD1sqnNstmQr4SoZR/LBghXAfjYkUcf+xMBFwdvbDXSHkeOO7FciSWcfNB2x5qrzMsIRFzh2qcWbTax3PidqSgZ2LRXQD5me6BwZnlQtVKxO++wj7lgUjanYeA2E0G1v0G82xy4tz5AaMnHklAdGAH3NVUbwG8a9Levn/tKSjircGSWrUosYukktEILXMQFJd4cNX5jiz62CNRe2XmGNhjoTl1bg6ppG9N/JX1sbsJkFpIYqWmzhXlckjHdsLvZ5sB9EtIAwbOIQ8DFgCbCrdIQFv2trwSEpaKFOr1loxJno/wgI12WO1hbLEMUI2uN38KWKLHUUJ4EbK+ZRR+zJXinIQqRfMdvwltDNA+5Xpaw2UM9WZ8uLcBWIvmLwH1s6tjHgp3dQcDVFEZbeObhGZMKZ7i+tHTPk1DF21oHG0pDswpZjOTLNaAGKgYfk+mqUCIR87bXI5Ww18qEtdko0eeJ1WaS5uSgxEkoMgs0tvA4EhE/j8BeztqxEKPbCLgtjWLD7w8De0YblfiijZ2ADUZjSQij6LY3eVTsLNrmIuSGcr1sAxAkoZRb2Q7wIpSyC32QsMFm0v7KOrfzks8/7pmPJQH5GAKuLWpMo7Yh4N6V+SNN69B0PZ7Y4yqW8gtEkCxCXC+yxWZz025UKQl9lF/gY213FtMYhEjOZlem/anUWUQD0cxmM/NlurTKgNDG9OlFDIPQNXvZLt+g/QUBV0yTaVTXGxhWFaZPf7ZUiWPKtZblCmqz4k0j9Pk2n3kSm7G0s2irc0sCX5MUoo+FILrr+FnlzQO67nlowceuIvSxXkXhEHDF1IpGvH39fOTh2aoIk5GFSjyLtAzbqsiziKYC8x1FYtpZP7iIKSoSiI9F2Um1PLCaxRRNasgIH7NG0G05Aq4AC9OoLrmvMAob9HU002Jn8SZi17/AXpV8TASvb1EQ86BKuO7ZfdvgsOc+ZrMd+zPkF0XANetY1kc6PvK/lRWWTUdhMuUw70EZWi2biKNJWRTO5/OvIu8o2vCxqIWITgf6Fr3zHkXfbLT9byL3sYVFHyMCFyl1xIvzDQwV1r81TWcyj23tm6Uy7G3D18I7zDpgr1nHfboL7/DO9ARNHzKgXlrzsaD7wO/RaRuFUvL29fOF8Xcslu3RQFMxeR97GYoATRs0qcjHnm55md7vktrTKx9L0jJfGj+7z5cdiSSJoDr1eL+btIxuqG6lSDriY28s+VjQtiACt9sJQqLKaKBphzLvSBne48bBip+u+NiiY/dxXe4LvD9Y5h3xsaWxED0LXcwi4OJy5ipipMl6vKQD06cZS9y416KnS4OEe8ofHPOxQ+/StO0Pvg9EwG1BD4vfJuIOQ3xuPcQY0cNoH2Hth6Rj96H8qZcMrCKwBQJuN296WLk+dqwMV7hxcPzZlRfxlfcvxvyCfSj/LtExH+t8u4+A28Evv/4+D8gRECKMKimTfnYWXav7C6oABN7GBL9kAQFXjtmGfx/h+AAIEg91hjoJtPuAgKvBm55VACJ9AAAMqhC0CLi4+eXX35ebCvPt6+dDKgAAAACCFgEXJpuOsNnr4LuOKG6ASgwivz4A7f7XEIHrEJs2M/wVgatwzBV0q3MFOgsEXDWGVAEIuc7EkAsVAVeSLTnh1iNwXZhG/ZGKDI75oSsv8ur900GX7uOJPapAf305gnY/ieEFEXDVKJpGXU/m6zLsOir5d02foTOj47RBYqQfJl0ql0HH7uODQ6oA9dIxzxBw8BcbNjMMPAq4UlgI/XapEiPgKBfXjDp2H8qfetn3d4liJg0BV531KNzg7evn+emAz4E856LJl1+9f3rMSB8csteh6OghvlypbZFyZwo1TH7uiI8NTLOIdRSnEX2Pv1bjl19/n6WC7XKtARrmBJPLCFyVtWmJhYo870CR+RSiienWeZVlRrhNOuIXJvLciWlHIe8/8nS7kdwvhsXVu96j4ffFZ/qWsqmpICldp0X8pD4Wezt23AenQMDVQ6JwZ2sN0kIF3iIVeC4rsa8RhFSASeSd67Hnkf4ybfhO+lIJUvuer9WDOj42paOofL9Z5DZ70fD707SeLfrU4aR17YNnH7vquY9F4V9Modbjam0EeBhg4Td9BpniGve8Eldu+Dq2i2unYG06IEntNYrcBi87fj/bQkSitk2nznsVfdM2ZYiPefWxKEDA1aAgpch6J+TqENzSnV06QrUxzfAi4ko8MO2E0V/2qCos+mwvFZ++O4ph5KK3cXlr29Ynzjzfb4CPxRHhRcDV5yL/P29fPz+23LGF0MGOIq7IZy3dd9yXKJyuxWrqY8cRb2Y469l9bQyqxnQdUdgMH0PAdZdffv09MV+vE/g59zvp1JyE+VOhWEVQvbNwy8sIK/GwxUq8F2Pjl9rstKZY76uPia3aGtzEOrC6aWtQKm1CpDvrL1v0sb7aK5oILwKuGRc5oTZeSyfiagdnlUX5Np5BGr5TGr1KjGPqYFXwis3u0v++0Z2VPn0sqs5C7XPT8mNULae2bXbchuAVG4lPp//5QW02iGyQ0Ga9uIzMx2zZK5o1lgi4BuhauPxU6rHlyEShoCr7hzrFNbNwz7NYGj4VmyGIp5g62LwYGac/n8qKdk03sOiZvSTC2nZ9GJhIIr2WBe+yYlvwyXyJxocgvGMaJPTVxxIEXH9E3FWuAxvk/n3uSMlXTeb5xsI9pXLcRlCJs0hSCAxMBFODGp0YFpS3jL4/lIwk9snHZJAWSkT6NJLI5Y2xl87nzxJlNNK0G5cF95XfXUZiswE+1oq9PptIQMDZ4URF3LpydzGNWmnBt+6msTGiGGpnH/II7M7S5WaWrjMOefpZ08SMd/iaTKvebovApj42s+Rjo8B9bBjgKP8m5E0gKpZsCoBky71k9+SttgPDHaJkHLDNzk1YiWhD9zHb9mIKtU/IVGr6cySnNDiITHwTqXj7+nnVkcaFRUFyE2AFzsTbnqXKO7Uo4i5D7Cz0mcqWpTSOH7Sh3MQbiz52GqC9hhZ9LLOXDRG3pyJ7GKiP2S7LZEsn/qFCR34TcL20NW0564mP2Z7mZRMD/LUbNXFw6VGVP7YYIQlOxOXEm63G5VrXDl5YfMygOouK4i3fiMtayE8bplWvLI5cL0MScQ7EWyZEbPlYcB1sTR+rHB2R6T3xSe3E93pYL3cN3PGxDoOAc8+1g2se1qzMthjX2K3oqmP9YFG8rVSIZIvzZ5ZF3HkAjd5pw0ZvYAqmVVX02vT1yxAGCo7E24OAszywCqaD1XJzUnZZEl+dLpVyuTXN1j4FIeIc2OxK2jBHPjYKwF6XDn1sgYCDjJmxP6d+XMMp5TlsOuZYK/OgpQo81o7V5v0v1g4Kv7BcdhLBumtD+Go6BensLi364Kf8u6S2Ozd2I85j3UjRlo+d6gDBRXll0zQ2z4KV5/zQVvRSfezOuMvBuMruYx53l9oSEjdtDUhzQnRs2U75AfvEso/dBeBjsaW2QsDFiKYamVm+7F7FhL55QWKToe8OI7dQ2ebOtocONRUgV2uiV8SI7QjqSIXP2KPNjrXDs70wel3w2u4s2vSxO+NwF3Fmt/Rzbuyf3HKpA4WBR5uNLYuqjaJXbWf7sPWx+tnIo82yAcLIZb3UiNK8Az527MHHFiYiniCx3KObDj5ZvuwsFYeTGpXg0tHoRcTOxFX4WUfH8twvHUVEDjadsagpCYaOGosLhzaThu7MUYOXqM1WBfe9NW520Un5TD34mOvcVzJYOMgLRuMu0ieDtquicorAx76pL+l7HOXK6pMjm8VcL/+y0fqgxKGPXW0YzEXtYwg4yIu4G2M5TJ4KuL/V7KSkIrsaOUkne61TtlaiIWo3V8ItG7Geb3mGbK2dy1HfG4s2O1Z7uWzwjjZ1cI47Vxf2GmgHcezwmbd2EhqNcRXxy2YBrjWqbMNmUidfGL9Js7+qp9qx3zmul9caJY3BZisdVCVb7n/j8N5zLSNbPuajHftGjKbPPzWRgIDzJ+AGxn4UblKQuqRMxXAtSPIV+l4+q4zO9PlG2ti5XpT9VTRkyzO57GCLbLYo2xCqYBJ7/exJhGwVvJ4617y93qm9qvjYKGcz3wv/CzsJh5HL9QHWG7VXlVMNfPtYKb9zOKPQ2M90YCA2O/Rks8muQY1HH3un7X70PoaAg0zE2Y7CLST/XIPRoM9dfon+3G/4/Y/mMSo49Fhxt45YW2r81p9vqXb7HIC9jKkwxaC7bs9a8DGxWVHG/mdqq1HLTUFhJ+EhOl5Ynhv8K+NQn2dg2uekKBrmcInDLj8LqV7OUttMStRJ22mXbPnYXgsDqVoiGAHXXwHnYmrpIBVxy9w9RGBI5GqiGyi2VWbbgjI2DmqMEH03fiEhtjqqGOnqu4+VFiJqL1dpS7pA4bS9hyn74OtlmVkEfKy+j4UKu1A9ooLK9q7Gl2v/n4WfP6VibqvQ0BHbrKfFMaki3tReUn4SfVr10F4rtVnVd5+aiDKbe7TlJh8TW51gokIS6mXxoKpiO7bssb1q100EHAhXxnKurLWjtbIjjR6iRSXSjfSxg60dJu9pZ7HSkemygb0QcV9ssijx+wmW+sYuCaLkm3p5Umf3p9prilcV2gUBB8VoFM52xbnMXX9hvuRIykTcmA62uXjraWdRW7wh4hr52AwR940fUi+/rZcJPtZfEHDtiDjbyTuP1yJtF2ud5U36+/MSHeys46a3tkA111l0WZQ0Fm+IuG9YVLCZ+OqJYarLlPWbnog4ecd9S/VyZphOrVw3EXBge+STj8KtCq5/loq4W91IUdjBdnhNXCZErL5bx0WctU5izccOTH/XXdax2ZwO9q86TL18FBlHNpPm6pQ9PhYhCLiWSEVWYuwebTVMxdlp7vpFaxxkc8Pdts0NKuImHarM2c5JJ6OrjoqSme1OosDH+rr+5r7mQGHf9Dt6+bHm4GreIRtI/kAn9TLnY4se+9h9bA+MgGtXxJ1bbpTP8hsa0utfFTRgD0l882KvoDLPOjKCvTKWpgBLipLYhe/D+kx5F1fiLWcvKRsRvgktQaWBwhXWqGSzkw4MFrLNClMP9joy9s/MBgRcZ7E5lSrTozcF1y8SMJepiLtb28FaNIKNsTInWYPnWogUCN+DSEex8swHKqx82Wup9uqTKFk0tNlU62XfhO+igc2ywUKMA1IZgO/bOs6rpL3OI7ZXE6J7XxL5BoBGw2we0zTV6Ft2/W2JG0XgXOT/fh1N/CjPN4rAnE4P7y6LnuMnNhtEMLqftp19XI+2Ent1PUmytel8PenC5RnBtjvGYdt20yPxziKwWaL1ct5yvYzJx1YN+6iokvgKROACQMWTTcdZn0rdlhxUKmYWjRtuGJEtNbR+EvDIf6Yj1fMy4m3TZg6Lo9i5jmIvTJjTqit9tv0Qjo6RhlOnCCeB+9iq6Xs6iJTMArWXlONEy7VpHVhaspm0tfuh18v0OffbFm85H9uPxMdsXCsqiMAFgoNjtpapcDtYu8fY7D7/VBq4i23HcOk5qi9MGBG5mTZ4SQU7yyj8h/QdvayN0aN+TtVmgwA6CDkNpPUo5Q6bjTVSEoK95pmPpc/1jybXSq/xN0f2Gqi92joEfL0jvMgPDJqeV5pe64nDevkyEJtJvZyFWi/Vx8RW40B97K5Jn+TCxxBw/RJx4nx3Fi95tS5S0ntcaqNVqpPfIeSGWqF9dxqVG7uccJPnnafv1UoCSxUm2XFnPhER8i6mg5rVXiMVvr59bKk+Ns98TDuwTw2uudBItuvBQjbA8jkdnQndNxvOK20ifBOJSHmol20MSjObzSOqk3taH18a/0seZlt87O8N2ghngysEXL9EnO31cCeaODh/j7IHjJcSclp5jlWYjBxFTaRDfacd6rKCPddH2bO2xNuGRjCzmQtxIuV+rzZLYq4Xaq9RTvy6sNci52PJBjHZZIA1112RPiMmeR9zJdru80J3w7M0EXDOhW+BzQ4dDbJWa362irxe4mMIOKgpsMpWgAPNO1f3Hisd+VyvX2dLpZbK/ExHaMOKHa4INLnPR23sllUbOo1mvlh7xyDE2wabDXM2G9RoDBc5my1jW4xb015DWz5Wxl4apblp8NgXuqaoLZuN1nxsWLEdWepP5mPLiveu3Ya1dUalPvewZr1cFfjZsuP1Eh9DwPVewO3pSN9WePohJch6FK2mUHwI+a9H9SqM1gabft9UdOjGjSy0v36fYMVbCaGy16VGx0NEwImP6Y68swaPN/WZpsVSx5fEHr2lXuJjXQUBF7aIs7mpoVDANIj2rXJibtGinTLRtm3Nz4UmTQZo0gk1jYwfdT0yCgAIODA787fVYZIKmVnBfZquu8uvU1iUmWZtKGxlNJetURnseK5p0TsD1BBwjXa5mcdEyURmAAAB1xMRNzJ2d6YeaF649fuMVcTZEIsi4CTS8LCOwTymNFnVePeB+bLu5EdTbYOEPMNJ0bsC1BRwTXa5RZmmAAAQcNBMxIm4urF0ucJNDXofifjdGje7SLMFqpm4+rz2+x/MlynQPdNs/d9CxdsK7wGLAi7IHHAAgICD/oi4wk0Nep89FXGjSE013XYsGEBN8SYDig9NBhUxpikAgHDhKK1I0HVctnZRZmebFt1nlf5IRzONzEQPB6Mj3sARTZcWJJgQABBw/RZxM0uXG799/fx8y71ECMlRXIsITCO7TA9Y7wYOaZrS5zMmBAAEXL9F3MSiiJND74+33GuZi8aFuJ5Mdr7ukyIEPEAEDgAQcBCUiLvRzQvb7ifRODmL8CIQIbcwj2v4TlymLAHI8QwBBwAhwSaGiLF45JZ0Lgdldm1qag+5Z3a2qG/hdtFm4mDoJxZywO2TbR4AEHCQF1TnptnxPhkyXXpQ4b57OSE3cPyaM9PyiQ/QewFHDjgAQMCBdREnQspGipFa54XqFKwcZbXrZIQqyPq2d/JJPjcIQMA1yQEnZz3uY0UAQMCBSxE3aXL0lE6xjszjUVdDU273XpbkV47ikkjgnBKFgMQbOeAAAAEHUYg4qyk5dLq1SMitSP0BEQg4GZA0Oc5ulgq4CZYEAAQcuBZxiSm5qQGgBwLu3DRbZ3qRCrhzLAkANiGNSMfQ6U+ZrmkivgbG3rFdAH0nwQQAgICDMiJuYUHEHW9L8gvQIw4RcACAgANfIm5pQcTd6Po1AKgP6zwBAAEHXkWciDemUqHvjJp8+bef/mAtKQAg4MC7iGMqFaA+RN8AAAEHrYm4S6ZSoY9oCpEmEH0DAAQctCbiBunPKVYEqAwROABAwEGrIu4lUTjoIaOG3/8TEwIAAg7aFHEi3i6xIPSMHxt+nwgcACDgoHURN9azTgH6wqjh91kDBwAIOLAu4k5qfPUM60Ef0EPsmw5YiMABAAIOrIu4RfpR9ZDtY9bCQU9onD6HHHAAgIADVyJuln5cVfiKiDd2pEIfeNHw+0TfAMAZ32MCSEXc9O3r5zJdNKrQsZ1juX7w6v3TWxXuTZn89tMfSSTvPDZMnwIAAg4iQNbDfSrZUQ/kdIZU+M0xWy+QaUAbp3HI+slJJO/8wsI1PuI6AOAKplDhgVSMrUy1TQ0vsFpveGfpOmPdGBA0Gn0bWbjUAtcBAAQc+BBx0uGUXQ/HZoae8NtPf0ik1dZi/KBzCabizVa+w1VqN6ZQAQABB964qNBZc8h9f5hZus4oFUnnAb/njbGz3o/lBQCAgAN/6FTqtOSf/4zFesO1xWudWTgk3jo6dWprUPIGlwEABBz4FnEzU279zghr9QPdPWozqnQb0nq49FlEuN1YulyS2muB1wAAAg7a4KLE3+y9ff0cEdcfbEbhZJryLgQRp89wE6idAAAQcFAe3dCwKPGnCLieoFElm1G41kWcTpveGTvr3gRZgjDDWwAAAQdtUiZn1yFm6hVTy9fLRNy4BfF2buxtWsi45vgsAEDAQav88uvvidkdcRliqf6ga+EuLF9WBNSNnPigaTxcC7dB+iNRtzPLlxbhdoWXAAACDkJg13qePfLB9Q4RKYmD68pGgk+puHJy1q6IQ426yYkjIwe3mBJ9AwBfPMEEsItUoN3t6PCOdM0c9ARNA3Ln8BaJDh5mTUWRRNzSj3H689LYnS7Ns0if8wjPAABfcBYqlOF6h4CTaVQEXI+QDQ2pMJKp1DNHtxDRJSciXKb3kWn8dyqSkpKibag++7Nxv9FGBOYErwAAnxCBg1K8ff38k3aqRVz88uvv51ipf+haspHHW4pYkiOqRMh9Xvvdj+qjI89mmKTCcoY3AIBPiMBBWSQKt+mMyB8xT285MY9Tqb42s+yZsFLXzBBvANAGbGKA0h3Vlt8NME8/0fVpMn3Yx8X78/T9mToFAAQchIuekcoB3VAk4mRK86hnIm5pWPcGAAg4iIR3mAAQcQ/i7YiUIQCAgIMo0EPu6bSgzyJugXgDAAQcxNqBAWwTcQfmMUrVNWTDAuINABBwECVMo8IuEZeYx0hcl9ZMTtmwAAAIOIgZNjJAGRG3Sn8kxcjUxD2lKmL0IH0XzjgFAAQcxIvuRl2fHmNKCTYJORE+MqW6iPDxr1S8LSlJAAgNEvlCHaQzzidu/YhJYIuIS9KPIz2kXo7e2ovAv6cINwAIGSJwUId7TAA1hJxEtPbTHzlDNcSorQjNE92ogHgDgKAhAgd1WOz4f4BNIk6E2/mr909FzElE7qVpPyIn/nudPhvrOwEgGjjMHmqxdrj9/i+//p5gFahDKubG6ccL4/eMUxGSs/TnDdE2AEDAQZ8E3J12uKtUvP0Ni4AFIScDguP051A/bSODDImy3RNtA4DYYQoV6nKvAo7oBVhBNztc6Y8IupH62I/mMdo7qijWEvVP2WSz0OsDACDgoNesckIOwIWgW5iC9ZWpsJMd0JvWzSUINQBAwAFsJou8MRUFvoUdUV8A6D2kEYEmyPo3OlMAAAAEHEQE0TcAAACAmHj7+vkIKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABA//j/AgwA5lz3D0htjq4AAAAASUVORK5CYII='

  const generarAnexoBSalida = (sal: any, itemsValidos: any[]) => {
    const cli = salidaClienteData
    const rows = itemsValidos.map((item: any) => `
      <tr>
        <td style="border:1px solid #ccc;padding:6px 8px;font-family:monospace;font-size:12px">${item.codigo}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px">${item.descripcion ?? ''}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;text-align:center;font-size:12px">${salidaQtys[item.id] ?? ''}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px">${salidaUms[item.codigo] ?? ''}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px">${salidaForm2.motivo}</td>
        <td style="border:1px solid #ccc;padding:6px 8px;font-size:12px"></td>
      </tr>
      <tr><td colspan="6" style="border:1px solid #eee;padding:2px 8px;font-size:10px;color:#888;font-style:italic">1 cj = ___ pzas</td></tr>
    `).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Anexo B</title>
      <style>
        body{font-family:Arial,sans-serif;padding:30px;max-width:850px;margin:0 auto}
        @media print{body{padding:10px}}
        .hdr{background:#4CAF50;color:white;text-align:center;padding:12px;font-size:20px;font-weight:bold;border:2px solid #388E3C}
        .badge{background:#4CAF50;color:white;font-size:24px;font-weight:bold;padding:8px 16px;border:2px solid #388E3C}
        .it td{border:1px solid #ccc;padding:5px 8px;font-size:12px}
        .it .lbl{background:#4CAF50;color:white;font-weight:bold;white-space:nowrap;width:140px}
        .mt th{background:#1a1a2e;color:white;padding:8px;text-align:left;font-size:12px;border:1px solid #ccc}
        .mt{width:100%;border-collapse:collapse;margin:12px 0}
        .fb{border:1px solid #ccc;padding:10px}
        .fg{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}
      </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="hdr" style="flex:1;margin-right:10px">EVIDENCIA DE ENTREGA DE MERCANC&#205;A SIN CARGO</div>
        <div class="badge">B</div>
      </div>
      <table class="it">
        <tr><td class="lbl">No. Cliente:</td><td>${cli?.solicitante ?? ''}</td>
          <td rowspan="5" style="text-align:center;width:160px;border:1px solid #ccc;padding:8px">
            <img src="${LOGO_SALIDA}" style="max-width:140px;max-height:70px;object-fit:contain" alt="Degasa"/>
          </td></tr>
        <tr><td class="lbl">Cliente:</td><td>${cli?.razon_social ?? salidaForm2.receptor_nombre}</td></tr>
        <tr><td class="lbl">Grupo Cliente:</td><td>${cli?.grupo_cliente ?? ''}</td></tr>
        <tr><td class="lbl">Ejecutivo:</td><td>${cli?.ejecutivo ?? ''}</td></tr>
        <tr><td class="lbl">Zona:</td><td>${cli?.zona ?? ''}</td></tr>
        <tr><td class="lbl">Direcci&#243;n Ventas:</td><td colspan="2">${salidaForm2.direccion_ventas}</td></tr>
        <tr><td class="lbl">Folio:</td><td colspan="2">${sol.numero_pedido_sap ?? ''}</td></tr>
      </table>
      <table class="mt">
        <thead><tr>
          <th style="width:100px">C&#243;digo</th><th>Art&#237;culo</th>
          <th style="width:70px">Cantidad</th><th style="width:60px">UM</th>
          <th style="width:100px">Motivo</th><th style="width:80px">Firma</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin:16px 0"><span style="font-size:12px">Observaciones: </span>
        <span style="font-size:12px;border-bottom:1px solid #333;display:inline-block;width:80%">${salidaForm2.observaciones}</span>
      </div>
      <div style="background:#f5f5f5;border:1px solid #ccc;padding:10px;text-align:center;font-weight:bold;font-size:13px;margin-top:16px">Documento auditable</div>
      <div class="fg">
        <div class="fb">
          <div style="min-height:60px"></div>
          <p style="font-size:11px;font-weight:bold;text-align:center;border-top:1px solid #333;padding-top:4px;margin:0">FIRMA</p>
          <p style="font-size:11px;margin:4px 0">NOMBRE: ________________________</p>
          <p style="font-size:11px;margin:4px 0">CARGO: _________________________</p>
          <p style="font-size:11px;margin:4px 0">FECHA: _________________________</p>
        </div>
        <div class="fb" style="display:flex;align-items:center;justify-content:center">
          <p style="font-size:12px;font-weight:bold;color:#888;text-align:center">SELLO INSTITUCIONAL</p>
        </div>
      </div>
      <script>window.onload=()=>window.print()</script>
      </body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `anexo_b_${sol.numero_pedido_sap ?? id}_${salidaForm2.receptor_nombre.replace(/\s+/g,'_')}.html`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Anexo B descargado')
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
            {sol.estatus === 'en_proceso' && (
              <button onClick={initSalidaPanel}
                className="bg-teal-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-teal-700 min-h-[40px]">
                + Nueva salida
              </button>
            )}

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

      {/* Panel nueva salida — 3 pasos */}
      {showSalidaPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-4 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-base font-bold text-gray-800">Nueva salida de material</h2>
                <div className="flex gap-2 mt-1">
                  {[1,2,3].map(s => (
                    <div key={s} className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      salidaStep === s ? 'bg-teal-600 text-white' :
                      salidaStep > s ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {s}. {s === 1 ? 'Materiales' : s === 2 ? 'Datos entrega' : 'Evidencia'}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowSalidaPanel(false)} className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
            </div>

            <div className="p-6">
              {/* Paso 1 — Seleccionar materiales */}
              {salidaStep === 1 && (
                <div>
                  <p className="text-sm text-gray-500 mb-4">Selecciona los materiales y cantidades a entregar. Solo se puede entregar lo recibido en este pedido.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          {['Codigo','Articulo','Recibido','Entregado','Disponible','Cantidad a entregar','UM'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeItems.map(item => {
                          const rec = cantRecibida(item.id, item.codigo)
                          const ent = cantEntregada(item.codigo)
                          const disp = rec - ent
                          return (
                            <tr key={item.id} className="border-b border-gray-100">
                              <td className="px-3 py-2 font-mono font-semibold text-gray-800">{item.codigo}</td>
                              <td className="px-3 py-2 text-gray-600 max-w-32 truncate">{item.descripcion}</td>
                              <td className="px-3 py-2 text-right text-blue-600 font-medium">{rec}</td>
                              <td className="px-3 py-2 text-right text-teal-600 font-medium">{ent}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={`font-bold ${disp > 0 ? 'text-green-600' : 'text-gray-400'}`}>{disp}</span>
                              </td>
                              <td className="px-3 py-2">
                                {disp > 0 ? (
                                  <input type="number" min="0" max={disp}
                                    className="w-20 border border-teal-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-500 text-right"
                                    placeholder="0"
                                    value={salidaQtys[item.id] ?? ''}
                                    onChange={e => setSalidaQtys(prev => ({ ...prev, [item.id]: e.target.value }))} />
                                ) : <span className="text-gray-300 text-xs">Sin stock</span>}
                              </td>
                              <td className="px-3 py-2">
                                <input type="text"
                                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                                  value={salidaUms[item.codigo] ?? ''}
                                  onChange={e => setSalidaUms(prev => ({ ...prev, [item.codigo]: e.target.value }))} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between mt-4">
                    <button onClick={() => setShowSalidaPanel(false)}
                      className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button onClick={() => {
                      const hasQty = activeItems.some(i => parseFloat(salidaQtys[i.id] ?? '0') > 0)
                      if (!hasQty) return toast.error('Ingresa al menos una cantidad')
                      setSalidaStep(2)
                    }}
                      className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700">
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}

              {/* Paso 2 — Datos de entrega y Anexo B */}
              {salidaStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 mb-2">Confirma los datos para el Anexo B.</p>

                  {salidaClienteData && (
                    <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-700 mb-3">
                      <p className="font-semibold mb-1">Datos del cliente vinculado:</p>
                      <p>No. Cliente: {salidaClienteData.solicitante} | Razón Social: {salidaClienteData.razon_social}</p>
                      <p>Grupo: {salidaClienteData.grupo_cliente} | Ejecutivo: {salidaClienteData.ejecutivo} | Zona: {salidaClienteData.zona}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1">Nombre del receptor *</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        placeholder="Quien recibe el material"
                        value={salidaForm2.receptor_nombre}
                        onChange={e => setSalidaForm2(x => ({ ...x, receptor_nombre: e.target.value }))}
                        autoFocus />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                      <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                        value={salidaForm2.receptor_tipo}
                        onChange={e => setSalidaForm2(x => ({ ...x, receptor_tipo: e.target.value }))}>
                        <option value="cliente">Cliente</option>
                        <option value="colaborador">Colaborador</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Fecha entrega</label>
                      <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        value={salidaForm2.fecha_entrega}
                        onChange={e => setSalidaForm2(x => ({ ...x, fecha_entrega: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Motivo</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        placeholder="Donativo, Muestra..."
                        value={salidaForm2.motivo}
                        onChange={e => setSalidaForm2(x => ({ ...x, motivo: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Dirección Ventas</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        placeholder="Dirección de ventas"
                        value={salidaForm2.direccion_ventas}
                        onChange={e => setSalidaForm2(x => ({ ...x, direccion_ventas: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1">Observaciones</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        value={salidaForm2.observaciones}
                        onChange={e => setSalidaForm2(x => ({ ...x, observaciones: e.target.value }))} />
                    </div>
                  </div>

                  <div className="flex justify-between mt-4">
                    <button onClick={() => setSalidaStep(1)}
                      className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                      ← Anterior
                    </button>
                    <button onClick={confirmarSalidaDetalle} disabled={savingSalida}
                      className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                      {savingSalida ? 'Guardando...' : 'Confirmar y descargar Anexo B'}
                    </button>
                  </div>
                </div>
              )}

              {/* Paso 3 — Subir evidencia */}
              {salidaStep === 3 && salidaCreada && (
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-green-600 text-2xl font-bold">✓</span>
                  </div>
                  <p className="text-base font-semibold text-gray-800 mb-1">Salida registrada</p>
                  <p className="text-sm text-gray-500 mb-6">El Anexo B se descargó automáticamente. Ahora sube la evidencia firmada.</p>

                  <label className="cursor-pointer inline-flex items-center gap-2 bg-teal-600 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:bg-teal-700">
                    Subir evidencia firmada (PDF/imagen)
                    <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg"
                      onChange={async e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        await subirEvidencia(f, 'entrega', salidaCreada.id)
                        toast.success('Evidencia subida')
                        setShowSalidaPanel(false)
                      }} />
                  </label>

                  <button onClick={() => setShowSalidaPanel(false)}
                    className="block mx-auto mt-3 text-sm text-gray-400 hover:text-gray-600">
                    Cerrar sin subir evidencia
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel nueva salida — 3 pasos */}
      {showSalidaPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start justify-center pt-4 px-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-base font-bold text-gray-800">Nueva salida de material</h2>
                <div className="flex gap-2 mt-1">
                  {[1,2,3].map(s => (
                    <div key={s} className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      salidaStep === s ? 'bg-teal-600 text-white' :
                      salidaStep > s ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {s}. {s === 1 ? 'Materiales' : s === 2 ? 'Datos entrega' : 'Evidencia'}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowSalidaPanel(false)} className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
            </div>

            <div className="p-6">
              {/* Paso 1 — Seleccionar materiales */}
              {salidaStep === 1 && (
                <div>
                  <p className="text-sm text-gray-500 mb-4">Selecciona los materiales y cantidades a entregar. Solo se puede entregar lo recibido en este pedido.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          {['Codigo','Articulo','Recibido','Entregado','Disponible','Cantidad a entregar','UM'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeItems.map(item => {
                          const rec = cantRecibida(item.id, item.codigo)
                          const ent = cantEntregada(item.codigo)
                          const disp = rec - ent
                          return (
                            <tr key={item.id} className="border-b border-gray-100">
                              <td className="px-3 py-2 font-mono font-semibold text-gray-800">{item.codigo}</td>
                              <td className="px-3 py-2 text-gray-600 max-w-32 truncate">{item.descripcion}</td>
                              <td className="px-3 py-2 text-right text-blue-600 font-medium">{rec}</td>
                              <td className="px-3 py-2 text-right text-teal-600 font-medium">{ent}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={`font-bold ${disp > 0 ? 'text-green-600' : 'text-gray-400'}`}>{disp}</span>
                              </td>
                              <td className="px-3 py-2">
                                {disp > 0 ? (
                                  <input type="number" min="0" max={disp}
                                    className="w-20 border border-teal-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-500 text-right"
                                    placeholder="0"
                                    value={salidaQtys[item.id] ?? ''}
                                    onChange={e => setSalidaQtys(prev => ({ ...prev, [item.id]: e.target.value }))} />
                                ) : <span className="text-gray-300 text-xs">Sin stock</span>}
                              </td>
                              <td className="px-3 py-2">
                                <input type="text"
                                  className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-teal-400"
                                  value={salidaUms[item.codigo] ?? ''}
                                  onChange={e => setSalidaUms(prev => ({ ...prev, [item.codigo]: e.target.value }))} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between mt-4">
                    <button onClick={() => setShowSalidaPanel(false)}
                      className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button onClick={() => {
                      const hasQty = activeItems.some(i => parseFloat(salidaQtys[i.id] ?? '0') > 0)
                      if (!hasQty) return toast.error('Ingresa al menos una cantidad')
                      setSalidaStep(2)
                    }}
                      className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700">
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}

              {/* Paso 2 — Datos de entrega y Anexo B */}
              {salidaStep === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 mb-2">Confirma los datos para el Anexo B.</p>

                  {salidaClienteData && (
                    <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-700 mb-3">
                      <p className="font-semibold mb-1">Datos del cliente vinculado:</p>
                      <p>No. Cliente: {salidaClienteData.solicitante} | Razón Social: {salidaClienteData.razon_social}</p>
                      <p>Grupo: {salidaClienteData.grupo_cliente} | Ejecutivo: {salidaClienteData.ejecutivo} | Zona: {salidaClienteData.zona}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1">Nombre del receptor *</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        placeholder="Quien recibe el material"
                        value={salidaForm2.receptor_nombre}
                        onChange={e => setSalidaForm2(x => ({ ...x, receptor_nombre: e.target.value }))}
                        autoFocus />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Tipo</label>
                      <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                        value={salidaForm2.receptor_tipo}
                        onChange={e => setSalidaForm2(x => ({ ...x, receptor_tipo: e.target.value }))}>
                        <option value="cliente">Cliente</option>
                        <option value="colaborador">Colaborador</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Fecha entrega</label>
                      <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        value={salidaForm2.fecha_entrega}
                        onChange={e => setSalidaForm2(x => ({ ...x, fecha_entrega: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Motivo</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        placeholder="Donativo, Muestra..."
                        value={salidaForm2.motivo}
                        onChange={e => setSalidaForm2(x => ({ ...x, motivo: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Dirección Ventas</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        placeholder="Dirección de ventas"
                        value={salidaForm2.direccion_ventas}
                        onChange={e => setSalidaForm2(x => ({ ...x, direccion_ventas: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1">Observaciones</label>
                      <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                        value={salidaForm2.observaciones}
                        onChange={e => setSalidaForm2(x => ({ ...x, observaciones: e.target.value }))} />
                    </div>
                  </div>

                  <div className="flex justify-between mt-4">
                    <button onClick={() => setSalidaStep(1)}
                      className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                      ← Anterior
                    </button>
                    <button onClick={confirmarSalidaDetalle} disabled={savingSalida}
                      className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                      {savingSalida ? 'Guardando...' : 'Confirmar y descargar Anexo B'}
                    </button>
                  </div>
                </div>
              )}

              {/* Paso 3 — Subir evidencia */}
              {salidaStep === 3 && salidaCreada && (
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-green-600 text-2xl font-bold">✓</span>
                  </div>
                  <p className="text-base font-semibold text-gray-800 mb-1">Salida registrada</p>
                  <p className="text-sm text-gray-500 mb-6">El Anexo B se descargó automáticamente. Ahora sube la evidencia firmada.</p>

                  <label className="cursor-pointer inline-flex items-center gap-2 bg-teal-600 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:bg-teal-700">
                    Subir evidencia firmada (PDF/imagen)
                    <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg"
                      onChange={async e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        await subirEvidencia(f, 'entrega', salidaCreada.id)
                        toast.success('Evidencia subida')
                        setShowSalidaPanel(false)
                      }} />
                  </label>

                  <button onClick={() => setShowSalidaPanel(false)}
                    className="block mx-auto mt-3 text-sm text-gray-400 hover:text-gray-600">
                    Cerrar sin subir evidencia
                  </button>
                </div>
              )}
            </div>
          </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">No. Cliente</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={anexoBForm.no_cliente}
                    onChange={e => setAnexoBForm(x => ({ ...x, no_cliente: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Grupo Cliente</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={anexoBForm.grupo_cliente}
                    onChange={e => setAnexoBForm(x => ({ ...x, grupo_cliente: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Cliente</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={anexoBForm.cliente}
                  onChange={e => setAnexoBForm(x => ({ ...x, cliente: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Ejecutivo</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={anexoBForm.ejecutivo}
                    onChange={e => setAnexoBForm(x => ({ ...x, ejecutivo: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Zona</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={anexoBForm.zona}
                    onChange={e => setAnexoBForm(x => ({ ...x, zona: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Dirección Ventas *</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  placeholder="Captura manual"
                  value={anexoBForm.direccion_ventas}
                  onChange={e => setAnexoBForm(x => ({ ...x, direccion_ventas: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Observaciones</label>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                  value={anexoBForm.observaciones}
                  onChange={e => setAnexoBForm(x => ({ ...x, observaciones: e.target.value }))} />
              </div>
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
