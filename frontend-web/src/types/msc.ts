// Tipos para el módulo MSC (Mercancía Sin Cargo)

export interface MscSolicitud {
  id: string
  numero_pedido_sap?: string
  asunto?: string
  fecha: string
  motivo?: string
  descripcion?: string
  estatus: 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'en_proceso' | 'completada' | 'cancelada'

  // Destinatario
  destinatario_tipo: 'cliente' | 'usuario' | 'colaborador'
  destinatario_nombre?: string
  razon_social_dest?: string
  client_id?: string
  solicitante?: string

  // Aprobación
  aprobado_por?: string
  notas_aprobacion?: string
  fecha_aprobacion?: string

  // SAP
  fecha_pedido_sap?: string
  capturado_por?: string

  // Importes
  importe_solicitado: number
  importe_recibido: number
  importe_entregado: number
  items_activos_count?: number
  codigos_activos?: string

  // Auditoria
  created_by: string
  created_at: string
  updated_at?: string
}

export interface MscItem {
  id: string
  solicitud_id: string
  codigo: string
  descripcion?: string
  cantidad_pedida: number
  precio_unitario?: number
  total?: number
  um?: string
  estatus_linea: 'activo' | 'cancelado'
  motivo_cancelacion?: string
  cancelado_at?: string
  created_at: string
}

export interface MscRecepcion {
  id: string
  solicitud_id: string
  folio_entrega_salida: string
  fecha_recepcion: string
  tipo: string
  receptor_nombre: string
  notas?: string
  created_by: string
  created_at: string
  msc_recepcion_items?: MscRecepcionItem[]
}

export interface MscRecepcionItem {
  id: string
  recepcion_id: string
  solicitud_id: string
  item_id: string
  codigo: string
  descripcion?: string
  cantidad_recibida: number
  created_at: string
}

export interface MscSalida {
  id: string
  folio_salida: string
  fecha_salida: string
  receptor_nombre: string
  receptor_tipo: 'cliente' | 'usuario' | 'colaborador'
  direccion_ventas?: string
  observaciones?: string
  motivo?: string
  created_by: string
  created_at: string
  msc_salida_items?: MscSalidaItem[]
}

export interface MscSalidaItem {
  id: string
  salida_id: string
  solicitud_id: string
  codigo: string
  descripcion?: string
  cantidad_entregada: number
  um?: string
  created_at: string
}

export interface MscEvidencia {
  id: string
  solicitud_id: string
  salida_id?: string
  url: string
  nombre: string
  tipo: string
  created_by: string
  created_at: string
}

export interface UserProfile {
  user_id: string
  email: string
}

export interface InventoryItem {
  codigo: string
  descripcion: string
  solicitudes: SolEntry[]
  totalPedido: number
  totalRecibido: number
  totalEntregado: number
  totalDisponible: number
  totalPendiente: number
}

export interface SolEntry {
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
