import { useState } from 'react'
import { supabase } from '../lib/supabase'
import EditableTable from './EditableTable'
import toast from 'react-hot-toast'

const COLUMNS = [
  { key: 'codigo',          label: 'Código',       required: true, width: '120px' },
  { key: 'descripcion',     label: 'Descripción',  width: '160px' },
  { key: 'cantidad',        label: 'Cantidad', type: 'number' as const, width: '90px' },
  { key: 'um',              label: 'UM',            width: '70px' },
  { key: 'lote',            label: 'Lote',          width: '90px' },
  { key: 'fecha_caducidad', label: 'Caducidad', type: 'date' as const, width: '130px' },
  { key: 'centro_origen',   label: 'C. Origen',    required: true, width: '110px' },
  { key: 'almacen_origen',  label: 'Alm. Origen',  width: '110px' },
  { key: 'centro_destino',  label: 'C. Destino',   required: true, width: '110px' },
  { key: 'almacen_destino', label: 'Alm. Destino', width: '110px' },
  { key: 'condicion',       label: 'Condición', type: 'select' as const, width: '140px',
    options: [
      { value: 'corta_caducidad', label: 'Corta caducidad' },
      { value: 'danado',          label: 'Dañado' },
      { value: 'obsoleto',        label: 'Obsoleto' },
      { value: 'otro',            label: 'Otro' },
    ]
  },
  { key: 'comentarios', label: 'Comentarios', width: '180px' },
]

interface Props {
  orderId: string
  numeroPedido: string
  onRefresh: () => void
}

export default function CedisTable({ orderId, numeroPedido, onRefresh }: Props) {
  const [showTable, setShowTable] = useState(false)

  const generateComment = (condicion: string, pedido: string) => {
    const map: Record<string, string> = {
      corta_caducidad: 'Corta caducidad',
      danado: 'Dañado',
      obsoleto: 'Material Obsoleto',
      otro: 'Otro',
    }
    const prefix = map[condicion] ?? 'Material Obsoleto'
    return pedido ? `${prefix} // Pedido ${pedido}` : prefix
  }

  const handleSave = async (rows: Record<string, string>[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    const today = new Date().toISOString().split('T')[0]

    const inserts = rows
      .filter(r => r.codigo?.trim() && r.centro_origen?.trim() && r.centro_destino?.trim())
      .map(r => ({
        order_id:        orderId,
        fecha_solicitud: today,
        codigo:          r.codigo,
        descripcion:     r.descripcion || null,
        cantidad:        r.cantidad ? parseFloat(r.cantidad) : 0,
        um:              r.um || null,
        lote:            r.lote || null,
        fecha_caducidad: r.fecha_caducidad || null,
        centro_origen:   r.centro_origen,
        almacen_origen:  r.almacen_origen || null,
        centro_destino:  r.centro_destino,
        almacen_destino: r.almacen_destino || null,
        comentarios:     r.comentarios || generateComment(r.condicion, numeroPedido),
        estatus:         'solicitado',
        created_by:      user?.id,
      }))

    const { data: inserted, error } = await supabase
      .from('crm_cedis_requests').insert(inserts).select()
    if (error) { toast.error(error.message); return }

    // Crear entrada inicial en historial para cada req
    if (inserted) {
      await supabase.from('crm_cedis_history').insert(
        inserted.map(r => ({
          request_id:      r.id,
          estatus_anterior: null,
          estatus_nuevo:   'solicitado',
          comentario:      'Requerimiento creado',
          created_by:      user?.id,
        }))
      )
    }

    toast.success(`${inserts.length} requerimiento(s) creados`)
    setShowTable(false)
    onRefresh()
  }

  if (!showTable) {
    return (
      <button onClick={() => setShowTable(true)}
        className="text-sm text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-4 py-2 rounded-lg hover:bg-teal-50">
        + Cargar múltiples requerimientos en tabla
      </button>
    )
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-700">
            Captura masiva de requerimientos CEDIS
          </p>
          <p className="text-xs text-gray-400">
            Pedido: {numeroPedido} · El comentario se genera automáticamente si dejas el campo vacío
          </p>
        </div>
        <button onClick={() => setShowTable(false)}
          className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
      </div>
      <EditableTable
        columns={COLUMNS}
        onSave={handleSave}
        saveLabel="Crear requerimientos"
        addLabel="+ Agregar fila" />
    </div>
  )
}
