import type { MscSolicitud, MscRecepcion, MscSalida, MscEvidencia } from '../../types/msc'

// Form states
export interface AprobacionForm {
  aprobado_por: string
  notas_aprobacion: string
}

export interface FolioForm {
  numero_pedido_sap: string
  fecha_pedido_sap: string
  capturado_por: string
}

export interface RecepcionForm {
  folio_entrega_salida: string
  fecha_recepcion: string
  tipo: string
  receptor_nombre: string
  notas: string
}

export interface CedisHeader {
  centro_origen: string
  almacen_origen: string
  centro_destino: string
  almacen_destino: string
  fecha_solicitud: string
}

export interface SalidaForm {
  receptor_nombre: string
  receptor_tipo: 'cliente' | 'usuario' | 'colaborador'
  fecha_entrega: string
  direccion_ventas: string
  observaciones: string
  motivo: string
}

export interface AnexoBForm {
  no_cliente: string
  cliente: string
  grupo_cliente: string
  ejecutivo: string
  zona: string
  direccion_ventas: string
  observaciones: string
}
