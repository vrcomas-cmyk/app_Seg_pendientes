import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import ImageLightbox from './ImageLightbox'
import toast from 'react-hot-toast'

interface UploadedImage {
  url: string
  name: string
}

interface Props {
  taskId: string
  onUploaded?: (url: string, name: string) => void
  className?: string
  placeholder?: string
  // Modo comentario: incluye textarea + paste
  mode?: 'comment' | 'zone'
  onComment?: (text: string, images: UploadedImage[]) => Promise<void>
}

export default function PasteImageUploader({
  taskId, onUploaded, className = '', placeholder, mode = 'zone', onComment
}: Props) {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [comment, setComment] = useState('')
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const uploadImage = useCallback(async (file: File): Promise<UploadedImage | null> => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes')
      return null
    }
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'png'
    const name = `${taskId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('attachments')
      .upload(name, file, { contentType: file.type, upsert: false })
    if (error) { toast.error('Error al subir imagen: ' + error.message); setUploading(false); return null }
    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(name)
    setUploading(false)
    return { url: publicUrl, name: file.name }
  }, [taskId])

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    toast.loading('Subiendo imagen...', { id: 'img-upload' })
    const uploaded = await uploadImage(file)
    toast.dismiss('img-upload')
    if (uploaded) {
      setImages(prev => [...prev, uploaded])
      onUploaded?.(uploaded.url, uploaded.name)
      toast.success('Imagen pegada')
    }
  }, [uploadImage, onUploaded])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    for (const file of files) {
      const uploaded = await uploadImage(file)
      if (uploaded) { setImages(prev => [...prev, uploaded]); onUploaded?.(uploaded.url, uploaded.name) }
    }
  }, [uploadImage, onUploaded])

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      const uploaded = await uploadImage(file)
      if (uploaded) { setImages(prev => [...prev, uploaded]); onUploaded?.(uploaded.url, uploaded.name) }
    }
    e.target.value = ''
  }

  const removeImage = (url: string) => setImages(prev => prev.filter(i => i.url !== url))

  const submitComment = async () => {
    if (!comment.trim() && images.length === 0) return
    await onComment?.(comment, images)
    setComment('')
    setImages([])
  }

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (mode === 'comment') {
    return (
      <>
        {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
        <div className={`border border-gray-200 rounded-xl overflow-hidden ${className}`}>
          <textarea
            ref={textareaRef}
            className="w-full px-4 py-3 text-sm outline-none resize-none min-h-20"
            placeholder={placeholder ?? 'Escribe un comentario o pega una imagen con Ctrl+V...'}
            value={comment}
            onChange={e => setComment(e.target.value)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
          />

          {/* Previews */}
          {images.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              {images.map(img => (
                <div key={img.url} className="relative group">
                  <img
                    src={img.url}
                    alt={img.name}
                    onClick={() => setLightbox(img.url)}
                    className="w-20 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition"
                  />
                  <button
                    onClick={() => removeImage(img.url)}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {isDragging && (
            <div className="px-4 pb-3 text-xs text-teal-600 font-medium">
              Suelta la imagen aquí...
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="hover:text-gray-600 transition flex items-center gap-1">
                📎 Adjuntar imagen
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={handleFileInput} />
              <span>· Ctrl+V para pegar</span>
              {uploading && <span className="text-teal-600">Subiendo...</span>}
            </div>
            <button
              onClick={submitComment}
              disabled={!comment.trim() && images.length === 0}
              className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-40">
              Comentar
            </button>
          </div>
        </div>
      </>
    )
  }

  // mode === 'zone'
  return (
    <>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
      <div
        className={`border-2 border-dashed rounded-xl p-4 text-center transition cursor-pointer ${
          isDragging ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
        } ${className}`}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        tabIndex={0}>
        <p className="text-xs text-gray-400">
          {uploading ? 'Subiendo...' : '📷 Pega imagen (Ctrl+V), arrastra o haz clic'}
        </p>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={handleFileInput} />
      </div>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {images.map(img => (
            <div key={img.url} className="relative group">
              <img
                src={img.url}
                alt={img.name}
                onClick={() => setLightbox(img.url)}
                className="w-20 h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition"
              />
              <button
                onClick={e => { e.stopPropagation(); removeImage(img.url) }}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
