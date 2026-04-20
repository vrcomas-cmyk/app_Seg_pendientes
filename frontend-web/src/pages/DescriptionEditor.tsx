import { useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ImageLightbox from './ImageLightbox'
import toast from 'react-hot-toast'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /**
   * Identificador de carpeta para almacenar las imágenes.
   * Para un pendiente existente se recomienda pasar su id.
   * Para un pendiente nuevo en borrador, pasar un UUID temporal (carpeta `drafts/...`).
   */
  folderId: string
  /**
   * Si es true, las imágenes se guardan como drafts/{folderId}/...
   */
  isDraft?: boolean
  /**
   * Notifica al padre cada vez que se sube una imagen.
   * Útil para poder limpiar drafts huérfanos si el usuario cancela.
   */
  onImageUploaded?: (path: string, url: string, name: string) => void
  rows?: number
}

export default function DescriptionEditor({
  value, onChange, placeholder, className = '',
  folderId, isDraft = false, onImageUploaded, rows = 4,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  const basePath = isDraft ? `drafts/${folderId}` : folderId

  const uploadFile = useCallback(async (file: File): Promise<{ path: string; url: string; name: string } | null> => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes')
      return null
    }
    setUploading(true)
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
    const filename = `desc-${Date.now()}.${ext}`
    const path = `${basePath}/${filename}`
    const { error } = await supabase.storage
      .from('attachments')
      .upload(path, file, { contentType: file.type, upsert: false })
    setUploading(false)
    if (error) { toast.error('Error al subir: ' + error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
    return { path, url: publicUrl, name: file.name }
  }, [basePath])

  const insertMarkdown = (name: string, url: string) => {
    const el = textareaRef.current
    const markdown = `\n![${name}](${url})\n`
    if (!el) { onChange(value + markdown); return }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const newValue = value.slice(0, start) + markdown + value.slice(end)
    onChange(newValue)
    // Reposicionar cursor después del markdown insertado
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + markdown.length
      el.setSelectionRange(pos, pos)
    })
  }

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    toast.loading('Subiendo captura...', { id: 'desc-paste' })
    const uploaded = await uploadFile(file)
    toast.dismiss('desc-paste')
    if (uploaded) {
      insertMarkdown(uploaded.name, uploaded.url)
      onImageUploaded?.(uploaded.path, uploaded.url, uploaded.name)
      toast.success('Captura pegada')
    }
  }, [uploadFile, value, onChange, onImageUploaded])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    for (const file of files) {
      const uploaded = await uploadFile(file)
      if (uploaded) {
        insertMarkdown(uploaded.name, uploaded.url)
        onImageUploaded?.(uploaded.path, uploaded.url, uploaded.name)
      }
    }
  }, [uploadFile, value, onChange, onImageUploaded])

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      const uploaded = await uploadFile(file)
      if (uploaded) {
        insertMarkdown(uploaded.name, uploaded.url)
        onImageUploaded?.(uploaded.path, uploaded.url, uploaded.name)
      }
    }
    e.target.value = ''
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Parsear previews en tiempo real a partir del markdown
  const imageMatches = Array.from(value.matchAll(/!\[(.*?)\]\((.*?)\)/g))

  return (
    <>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div className={`border border-gray-200 rounded-xl overflow-hidden ${isDragging ? 'border-teal-400 ring-1 ring-teal-200' : ''} ${className}`}>
        <textarea
          ref={textareaRef}
          rows={rows}
          className="w-full px-4 py-3 text-sm outline-none resize-y min-h-24"
          placeholder={placeholder ?? 'Detalle opcional. Puedes pegar capturas con Ctrl+V...'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
        />

        {imageMatches.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {imageMatches.map((m, i) => (
              <img key={i} src={m[2]} alt={m[1]}
                onClick={() => setLightbox(m[2])}
                className="w-16 h-16 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition" />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="hover:text-gray-600 transition flex items-center gap-1">
              📎 Adjuntar captura
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={handleFileInput} />
            <span>· Ctrl+V para pegar</span>
          </div>
          {uploading && <span className="text-teal-600">Subiendo...</span>}
        </div>
      </div>
    </>
  )
}
