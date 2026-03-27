import { useEffect } from 'react'

interface Props {
  src: string
  onClose: () => void
}

export default function ImageLightbox({ src, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl max-h-full"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-3xl hover:text-gray-300 font-light"
        >
          X
        </button>
        <img
          src={src}
          alt="Vista previa"
          className="max-w-full object-contain rounded-lg shadow-2xl"
          style={{ maxHeight: '85vh' }}
        />
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="absolute -bottom-9 right-0 text-xs text-gray-400 hover:text-white"
        >
          Abrir en nueva pestana
        </a>
      </div>
    </div>
  )
}
