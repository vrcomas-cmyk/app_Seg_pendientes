import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL

const FILE_ICONS: Record<string, string> = {
  'application/pdf': '📄',
  'image/png': '🖼️',
  'image/jpeg': '🖼️',
  'image/gif': '🖼️',
  'image/webp': '🖼️',
  'text/plain': '📝',
  'text/csv': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/msword': '📝',
}

interface Attachment {
  id: string
  filename: string
  file_type: string
  file_size_kb: number
  created_at: string
}

interface Props {
  taskId: string
  attachments: Attachment[]
  onRefresh: () => void
}

export default function FileUploader({ taskId, attachments, onRefresh }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const headers = await getAuthHeader()
      const res = await fetch(`${API_URL}/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers,
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Error al subir archivo')
      } else {
        toast.success(`${file.name} subido correctamente`)
        onRefresh()
      }
    } catch {
      toast.error('Error al subir archivo')
    }

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDownload = async (attachment: Attachment) => {
    try {
      const headers = await getAuthHeader()
      const res = await fetch(`${API_URL}/tasks/${taskId}/attachments/${attachment.id}/url`, { headers })
      const { url } = await res.json()
      if (url) {
        const a = document.createElement('a')
        a.href = url
        a.download = attachment.filename
        a.target = '_blank'
        a.click()
      }
    } catch {
      toast.error('Error al descargar archivo')
    }
  }

  const handleDelete = async (attachment: Attachment) => {
    if (!window.confirm(`¿Eliminar "${attachment.filename}"?`)) return
    try {
      const headers = await getAuthHeader()
      await fetch(`${API_URL}/tasks/${taskId}/attachments/${attachment.id}`, {
        method: 'DELETE',
        headers,
      })
      toast.success('Archivo eliminado')
      onRefresh()
    } catch {
      toast.error('Error al eliminar archivo')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700">Archivos adjuntos</h2>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
          {uploading ? 'Subiendo...' : '+ Subir archivo'}
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls,.docx,.doc,.txt,.csv"
          onChange={handleUpload} />
      </div>

      {attachments.length === 0 && (
        <p className="text-sm text-gray-400">No hay archivos adjuntos.</p>
      )}

      <div className="space-y-2">
        {attachments.map(att => (
          <div key={att.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl flex-shrink-0">{FILE_ICONS[att.file_type] ?? '📎'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{att.filename}</p>
                <p className="text-xs text-gray-400">{att.file_size_kb} KB · {new Date(att.created_at).toLocaleDateString('es-MX')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <button
                onClick={() => handleDownload(att)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50">
                Descargar
              </button>
              <button
                onClick={() => handleDelete(att)}
                className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50">
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
