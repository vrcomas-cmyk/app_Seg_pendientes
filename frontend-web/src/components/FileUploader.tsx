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

const PREVIEWABLE = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'
]

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
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null)

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token}` }
  }

  const getSignedUrl = async (attachment: Attachment): Promise<string | null> => {
    const headers = await getAuthHeader()
    const res = await fetch(`${API_URL}/tasks/${taskId}/attachments/${attachment.id}/url`, { headers })
    const data = await res.json()
    return data.url ?? null
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
      if (!res.ok) toast.error(data.error ?? 'Error al subir archivo')
      else { toast.success(`${file.name} subido correctamente`); onRefresh() }
    } catch { toast.error('Error al subir archivo') }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handlePreview = async (attachment: Attachment) => {
    const url = await getSignedUrl(attachment)
    if (!url) return toast.error('No se pudo obtener el archivo')
    if (PREVIEWABLE.includes(attachment.file_type)) {
      setPreview({ url, type: attachment.file_type, name: attachment.filename })
    } else {
      window.open(url, '_blank')
    }
  }

  const handleDownload = async (attachment: Attachment) => {
    const url = await getSignedUrl(attachment)
    if (!url) return toast.error('No se pudo obtener el archivo')
    const a = document.createElement('a')
    a.href = url
    a.download = attachment.filename
    a.target = '_blank'
    a.click()
  }

  const handleDelete = async (attachment: Attachment) => {
    if (!window.confirm(`¿Eliminar "${attachment.filename}"?`)) return
    try {
      const headers = await getAuthHeader()
      await fetch(`${API_URL}/tasks/${taskId}/attachments/${attachment.id}`, {
        method: 'DELETE', headers,
      })
      toast.success('Archivo eliminado')
      onRefresh()
    } catch { toast.error('Error al eliminar archivo') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700">Archivos adjuntos</h2>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
          {uploading ? 'Subiendo...' : '+ Subir archivo'}
        </button>
        <input ref={fileRef} type="file" className="hidden"
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
                <p className="text-xs text-gray-400">
                  {att.file_size_kb} KB · {new Date(att.created_at).toLocaleDateString('es-MX')}
                  {PREVIEWABLE.includes(att.file_type) && (
                    <span className="ml-1 text-teal-500">· Vista previa disponible</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {PREVIEWABLE.includes(att.file_type) && (
                <button onClick={() => handlePreview(att)}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium px-2 py-1 rounded hover:bg-teal-50">
                  Ver
                </button>
              )}
              <button onClick={() => handleDownload(att)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50">
                Descargar
              </button>
              <button onClick={() => handleDelete(att)}
                className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50">
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de vista previa */}
      {preview && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
          onClick={() => setPreview(null)}>
          <div
            className="bg-white rounded-xl overflow-hidden max-w-4xl w-full max-h-screen flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-700 truncate">{preview.name}</p>
              <div className="flex items-center gap-2">
                <a href={preview.url} target="_blank" rel="noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1 rounded border border-blue-200 hover:bg-blue-50">
                  Abrir en nueva pestaña
                </a>
                <button onClick={() => setPreview(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold w-8 h-8 flex items-center justify-center">
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100" style={{ minHeight: '400px', maxHeight: '75vh' }}>
              {preview.type === 'application/pdf' ? (
                <iframe
                  src={preview.url}
                  className="w-full h-full border-0"
                  style={{ minHeight: '500px' }}
                  title={preview.name} />
              ) : (
                <div className="flex items-center justify-center h-full p-4">
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="max-w-full max-h-full object-contain rounded" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
