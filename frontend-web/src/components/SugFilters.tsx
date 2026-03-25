import { useEffect, useState } from 'react'

interface Props {
  data: any[]
  onFilter: (filtered: any[]) => void
  isConsumption?: boolean
}

export default function SugFilters({ data, onFilter, isConsumption = false }: Props) {
  const [search, setSearch] = useState('')
  const [fuente, setFuente] = useState('')
  const [centro, setCentro] = useState('')
  const [soloDisponibles, setSoloDisponibles] = useState(false)

  // Opciones únicas de fuente y centro
  const fuentes = [...new Set(data.map(r => r.fuente).filter(Boolean))].sort()
  const centros = [...new Set(data.map(r =>
    isConsumption ? r.centro : r.centro_pedido
  ).filter(Boolean))].sort()

  useEffect(() => {
    let result = data
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(r =>
        (r.material_solicitado ?? r.material ?? '').toLowerCase().includes(s) ||
        (r.material_sugerido ?? '').toLowerCase().includes(s) ||
        (r.descripcion_solicitada ?? r.texto_material ?? '').toLowerCase().includes(s) ||
        (r.descripcion_sugerida ?? '').toLowerCase().includes(s) ||
        (r.pedido ?? '').toLowerCase().includes(s) ||
        (r.destinatario ?? '').toLowerCase().includes(s)
      )
    }
    if (fuente) result = result.filter(r => r.fuente === fuente)
    if (centro) {
      result = result.filter(r =>
        (isConsumption ? r.centro : r.centro_pedido) === centro
      )
    }
    if (soloDisponibles) result = result.filter(r => (r.disponible ?? 0) > 0)
    onFilter(result)
  }, [search, fuente, centro, soloDisponibles, data])

  const hasFilters = search || fuente || centro || soloDisponibles

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-2 items-center">
      <input
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-teal-400 flex-1 min-w-40"
        placeholder="Buscar material, descripción, pedido, destinatario..."
        value={search} onChange={e => setSearch(e.target.value)} />
      {fuentes.length > 0 && (
        <select className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
          value={fuente} onChange={e => setFuente(e.target.value)}>
          <option value="">Todas las fuentes</option>
          {fuentes.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      )}
      {centros.length > 0 && (
        <select className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
          value={centro} onChange={e => setCentro(e.target.value)}>
          <option value="">Todos los centros</option>
          {centros.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
        <input type="checkbox" checked={soloDisponibles}
          onChange={e => setSoloDisponibles(e.target.checked)} />
        Solo con disponible &gt; 0
      </label>
      {hasFilters && (
        <button onClick={() => { setSearch(''); setFuente(''); setCentro(''); setSoloDisponibles(false) }}
          className="text-xs text-red-400 hover:text-red-600 font-medium px-2">
          Limpiar ×
        </button>
      )}
    </div>
  )
}
