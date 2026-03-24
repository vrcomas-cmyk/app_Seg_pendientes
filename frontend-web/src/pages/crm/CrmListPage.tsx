import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function CrmListPage() {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    let q = supabase
      .from('crm_clients')
      .select('*, crm_recipients(count), crm_followups(count)')
      .order('solicitante')
    if (search) {
      q = q.or(
        `solicitante.ilike.%${search}%,razon_social.ilike.%${search}%,rfc.ilike.%${search}%`
      )
    }
    q.then(({ data }) => { setClients(data ?? []); setLoading(false) })
  }, [search])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">CRM — Clientes</h1>
          <p className="text-sm text-gray-400 mt-1">{clients.length} clientes registrados</p>
        </div>
        <div className="flex gap-2">
          <Link to="/crm/import"
            className="border border-teal-600 text-teal-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-50">
            Cargar Excel
          </Link>
          <Link to="/crm/new"
            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
            + Nuevo cliente
          </Link>
        </div>
      </div>

      <input
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm mb-4 outline-none focus:border-teal-400"
        placeholder="Buscar por nombre, razón social o RFC..."
        value={search}
        onChange={e => setSearch(e.target.value)} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}
        {!loading && clients.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm mb-4">No hay clientes registrados.</p>
            <Link to="/crm/import"
              className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
              Cargar Excel para importar
            </Link>
          </div>
        )}
        {clients.map(c => (
          <Link to={`/crm/${c.id}`} key={c.id}
            className="flex items-center justify-between px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">{c.solicitante}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {c.razon_social && <span className="mr-3">{c.razon_social}</span>}
                {c.rfc && <span className="mr-3">RFC: {c.rfc}</span>}
                {c.estado && <span className="mr-3">{c.estado}</span>}
                {c.ramo && <span>{c.ramo}</span>}
              </p>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0 ml-4">
              <div className="text-center">
                <p className="text-xs text-gray-400">Destinatarios</p>
                <p className="text-sm font-semibold text-gray-700">
                  {c.crm_recipients?.[0]?.count ?? 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400">Seguimientos</p>
                <p className="text-sm font-semibold text-gray-700">
                  {c.crm_followups?.[0]?.count ?? 0}
                </p>
              </div>
              <span className="text-gray-300 text-lg">›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
