import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props {
  onSelect: (material: any) => void
  placeholder?: string
}

export default function MaterialSearchInput({ onSelect, placeholder = 'Buscar material por código o descripción...' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('catalog_materials')
        .select('*')
        .or(`material.ilike.%${query}%,descripcion.ilike.%${query}%`)
        .limit(10)
      setResults(data ?? [])
      setOpen(true)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (m: any) => {
    onSelect(m)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)} />
      {loading && (
        <span className="absolute right-3 top-2.5 text-xs text-gray-400">Buscando...</span>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden"
          style={{ maxHeight: '280px', overflowY: 'auto' }}>
          {results.map(m => (
            <button key={m.id} onClick={() => handleSelect(m)}
              className="w-full text-left px-4 py-3 hover:bg-teal-50 border-b border-gray-100 last:border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{m.material}</p>
                  <p className="text-xs text-gray-400">{m.descripcion}</p>
                </div>
                <div className="text-right ml-4 flex-shrink-0">
                  <p className="text-xs text-gray-500">{m.um}</p>
                  {m.lista_02 && <p className="text-xs text-teal-600 font-medium">${Number(m.lista_02).toLocaleString('es-MX')}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query && results.length === 0 && !loading && (
        <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 px-4 py-3">
          <p className="text-sm text-gray-400">No se encontró "{query}" en el catálogo.</p>
        </div>
      )}
    </div>
  )
}
