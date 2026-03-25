import { useState } from 'react'
import { supabase } from '../lib/supabase'
import EditableTable from './EditableTable'
import toast from 'react-hot-toast'

const COLUMNS = [
  { key: 'material',        label: 'Material / Código', required: true, width: '150px' },
  { key: 'descripcion',     label: 'Descripción',        width: '180px' },
  { key: 'precio_ofertado', label: 'Precio',   type: 'number' as const, width: '100px' },
  { key: 'condicion',       label: 'Condición', type: 'select' as const, width: '140px',
    options: [
      { value: 'corta_caducidad', label: 'Corta caducidad' },
      { value: 'danado',          label: 'Dañado' },
      { value: 'obsoleto',        label: 'Obsoleto' },
      { value: 'otro',            label: 'Otro' },
    ]
  },
  { key: 'lote',      label: 'Lote',      width: '100px' },
  { key: 'caducidad', label: 'Caducidad', type: 'date' as const, width: '130px' },
  { key: 'requisitos',label: 'Requisitos',width: '130px' },
]

interface Props {
  followupId: string
  onRefresh: () => void
}

export default function MaterialsTable({ followupId, onRefresh }: Props) {
  const [mode, setMode] = useState<'table' | 'list'>('list')
  const [materials, setMaterials] = useState<any[]>([])
  const [showTable, setShowTable] = useState(false)

  const handleSave = async (rows: Record<string, string>[]) => {
    const inserts = rows
      .filter(r => r.material?.trim())
      .map(r => ({
        followup_id:     followupId,
        material:        r.material,
        descripcion:     r.descripcion || null,
        precio_ofertado: r.precio_ofertado ? parseFloat(r.precio_ofertado) : null,
        condicion:       r.condicion || null,
        lote:            r.lote || null,
        caducidad:       r.caducidad || null,
        requisitos:      r.requisitos || null,
        aceptado:        false,
      }))

    const { error } = await supabase.from('crm_materials').insert(inserts)
    if (error) { toast.error(error.message); return }
    toast.success(`${inserts.length} material(es) guardados`)
    setShowTable(false)
    onRefresh()
  }

  if (!showTable) {
    return (
      <button onClick={() => setShowTable(true)}
        className="text-sm text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-4 py-2 rounded-lg hover:bg-teal-50">
        + Agregar materiales en tabla
      </button>
    )
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-semibold text-gray-700">
          Captura en tabla — Tab para pasar al siguiente campo
        </p>
        <button onClick={() => setShowTable(false)}
          className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
      </div>
      <EditableTable
        columns={COLUMNS}
        onSave={handleSave}
        saveLabel="Guardar materiales"
        addLabel="+ Agregar fila"
        emptyLabel="Agrega al menos un material con código o nombre" />
    </div>
  )
}
