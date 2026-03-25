import { useState } from 'react'
import { supabase } from '../lib/supabase'
import EditableTable from './EditableTable'
import toast from 'react-hot-toast'

const COLUMNS = [
  { key: 'destinatario', label: 'Destinatario', required: true, width: '160px' },
  { key: 'razon_social', label: 'Razón Social', width: '160px' },
  { key: 'rfc',          label: 'RFC',          width: '110px' },
  { key: 'poblacion',    label: 'Población',    width: '120px' },
  { key: 'estado',       label: 'Estado',       width: '110px' },
  { key: 'centro',       label: 'Centro',       width: '100px' },
  { key: 'telefonos',    label: 'Teléfonos',    width: '140px' },
  { key: 'correos',      label: 'Correos',      width: '180px' },
]

interface Props {
  clientId: string
  onRefresh: () => void
}

export default function RecipientsTable({ clientId, onRefresh }: Props) {
  const [showTable, setShowTable] = useState(false)

  const handleSave = async (rows: Record<string, string>[]) => {
    const inserts = rows
      .filter(r => r.destinatario?.trim())
      .map(r => ({
        client_id:    clientId,
        destinatario: r.destinatario,
        razon_social: r.razon_social || null,
        rfc:          r.rfc || null,
        poblacion:    r.poblacion || null,
        estado:       r.estado || null,
        centro:       r.centro || null,
        telefonos:    r.telefonos ? r.telefonos.split(',').map(t => t.trim()).filter(Boolean) : [],
        correos:      r.correos ? r.correos.split(';').map(e => e.trim()).filter(e => e.includes('@')) : [],
      }))

    const { error } = await supabase.from('crm_recipients').insert(inserts)
    if (error) { toast.error(error.message); return }
    toast.success(`${inserts.length} destinatario(s) guardados`)
    setShowTable(false)
    onRefresh()
  }

  if (!showTable) {
    return (
      <button onClick={() => setShowTable(true)}
        className="text-sm text-teal-600 hover:text-teal-700 font-medium border border-teal-200 px-4 py-2 rounded-lg hover:bg-teal-50">
        + Agregar destinatarios en tabla
      </button>
    )
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm font-semibold text-gray-700">
          Teléfonos separados por coma · Correos separados por punto y coma
        </p>
        <button onClick={() => setShowTable(false)}
          className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
      </div>
      <EditableTable
        columns={COLUMNS}
        onSave={handleSave}
        saveLabel="Guardar destinatarios"
        addLabel="+ Agregar fila" />
    </div>
  )
}
