import { useState } from 'react'
import { supabase } from '../lib/supabase'
import EditableTable from './EditableTable'
import MaterialSearchInput from './MaterialSearchInput'
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
  const [showTable, setShowTable] = useState(false)
  const [initialRows, setInitialRows] = useState<Record<string, string>[]>([])

  const handleCatalogSelect = (m: any) => {
    setInitialRows(prev => [...prev, {
      material:        m.material,
      descripcion:     m.descripcion ?? '',
      precio_ofertado: m.lista_02 ? String(m.lista_02) : '',
      condicion:       m.condicion ?? '',
      lote:            '',
      caducidad:       '',
      requisitos:      '',
    }])
    if (!showTable) setShowTable(true)
    toast.success(`${m.material} agregado a la tabla`)
  }

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
    setInitialRows([])
    onRefresh()
  }

  if (!showTable) {
    return (
      <div className="space-y-2">
        <MaterialSearchInput
          onSelect={handleCatalogSelect}
          placeholder="Buscar en catálogo y agregar material..." />
        <button onClick={() => setShowTable(true)}
          className="text-sm text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-4 py-2 rounded-lg hover:bg-teal-50">
          + Agregar materiales en tabla manual
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-semibold text-gray-700">
          Tabla de materiales — Tab para navegar
        </p>
        <button onClick={() => { setShowTable(false); setInitialRows([]) }}
          className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
      </div>
      <MaterialSearchInput
        onSelect={handleCatalogSelect}
        placeholder="Buscar en catálogo para agregar más..." />
      <EditableTable
        columns={COLUMNS}
        initialRows={initialRows.length > 0 ? initialRows : undefined}
        onSave={handleSave}
        saveLabel="Guardar materiales"
        addLabel="+ Agregar fila manual" />
    </div>
  )
}
