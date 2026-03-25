import { useState } from 'react'
import { supabase } from '../lib/supabase'
import EditableTable from './EditableTable'
import toast from 'react-hot-toast'

const COLUMNS = [
  { key: 'nombre',       label: 'Nombre',       required: true, width: '160px' },
  { key: 'puesto',       label: 'Puesto / Área', width: '150px' },
  { key: 'telefono',     label: 'Teléfono',      width: '130px' },
  { key: 'correo',       label: 'Correo',        width: '180px' },
  { key: 'comentarios',  label: 'Comentarios',   width: '200px' },
]

interface Props {
  clientId: string
  onRefresh: () => void
}

export default function ContactsTable({ clientId, onRefresh }: Props) {
  const [showTable, setShowTable] = useState(false)

  const handleSave = async (rows: Record<string, string>[]) => {
    const inserts = rows
      .filter(r => r.nombre?.trim())
      .map(r => ({
        client_id:   clientId,
        nombre:      r.nombre,
        puesto:      r.puesto || null,
        telefono:    r.telefono || null,
        correo:      r.correo || null,
        comentarios: r.comentarios || null,
      }))

    const { error } = await supabase.from('crm_contacts').insert(inserts)
    if (error) { toast.error(error.message); return }
    toast.success(`${inserts.length} contacto(s) guardados`)
    setShowTable(false)
    onRefresh()
  }

  if (!showTable) {
    return (
      <button onClick={() => setShowTable(true)}
        className="text-sm text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-4 py-2 rounded-lg hover:bg-teal-50">
        + Agregar contactos en tabla
      </button>
    )
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-semibold text-gray-700">
          Captura múltiples contactos de una vez
        </p>
        <button onClick={() => setShowTable(false)}
          className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
      </div>
      <EditableTable
        columns={COLUMNS}
        onSave={handleSave}
        saveLabel="Guardar contactos"
        addLabel="+ Agregar fila" />
    </div>
  )
}
