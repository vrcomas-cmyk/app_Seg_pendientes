import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const OFFER_COLOR: Record<string, string> = {
  borrador:         'bg-gray-100 text-gray-500',
  presentada:       'bg-blue-100 text-blue-700',
  aceptada_parcial: 'bg-yellow-100 text-yellow-700',
  aceptada:         'bg-green-100 text-green-700',
  rechazada:        'bg-red-100 text-red-600',
  en_proceso:       'bg-purple-100 text-purple-700',
  cerrada:          'bg-green-200 text-green-800',
}

const ITEM_ESTATUS_COLOR: Record<string, string> = {
  ofertado:          'bg-gray-100 text-gray-500',
  aceptado:          'bg-green-100 text-green-700',
  rechazado:         'bg-red-100 text-red-600',
  asignado_pedido:   'bg-blue-100 text-blue-700',
  solicitud_cedis:   'bg-yellow-100 text-yellow-700',
  en_transito:       'bg-orange-100 text-orange-700',
  recibido_cedis:    'bg-teal-100 text-teal-700',
  ingresado_almacen: 'bg-purple-100 text-purple-700',
  disponible:        'bg-indigo-100 text-indigo-700',
  surtido:           'bg-cyan-100 text-cyan-700',
  facturado:         'bg-green-200 text-green-800',
  cancelado:         'bg-gray-100 text-gray-400',
}

export default function CrmOffersListPage() {
  const [offers, setOffers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEstatus, setFilterEstatus] = useState('')
  const [filterItemEstatus, setFilterItemEstatus] = useState('')
  const [search, setSearch] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  const load = async () => {
    setLoading(true)
    let q = supabase
      .from('crm_offers')
      .select(`
        *,
        crm_clients(id, solicitante),
        crm_offer_items(id, material, descripcion, estatus, aceptado,
          precio_oferta, numero_pedido, um, lotes, cedis_request_id, numero_factura)
      `)
      .order('created_at', { ascending: false })

    if (!showClosed) {
      q = q.not('estatus', 'in', '("cerrada","cancelado")')
    }
    if (filterEstatus) q = q.eq('estatus', filterEstatus)

    const { data } = await q
    let result = data ?? []

    if (filterItemEstatus) {
      result = result.filter(o =>
        o.crm_offer_items?.some((it: any) => it.estatus === filterItemEstatus)
      )
    }
    if (search) {
      const s = search.toLowerCase()
      result = result.filter(o =>
        o.crm_clients?.solicitante?.toLowerCase().includes(s) ||
        o.crm_offer_items?.some((it: any) =>
          it.material?.toLowerCase().includes(s) ||
          it.numero_pedido?.toLowerCase().includes(s)
        )
      )
    }

    setOffers(result)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterEstatus, filterItemEstatus, search, showClosed])

  const closeOffer = async (offerId: string) => {
    if (!window.confirm('¿Cerrar esta oferta? Quedará archivada.')) return
    await supabase.from('crm_offers').update({ estatus: 'cerrada' }).eq('id', offerId)
    toast.success('Oferta cerrada')
    setOffers(prev => prev.filter(o => o.id !== offerId))
  }

  const cancelOffer = async (offerId: string) => {
    if (!window.confirm('¿Cancelar esta oferta? Las sugerencias volverán a aparecer.')) return
    await supabase.from('crm_offers').update({ estatus: 'cancelado' }).eq('id', offerId)
    toast.success('Oferta cancelada')
    setOffers(prev => prev.filter(o => o.id !== offerId))
  }

  const totalItems = offers.reduce((acc, o) => acc + (o.crm_offer_items?.length ?? 0), 0)
  const aceptados  = offers.reduce((acc, o) => acc + (o.crm_offer_items?.filter((it: any) => it.aceptado).length ?? 0), 0)
  const facturados = offers.reduce((acc, o) => acc + (o.crm_offer_items?.filter((it: any) => it.estatus === 'facturado').length ?? 0), 0)
  const enCedis    = offers.reduce((acc, o) => acc + (o.crm_offer_items?.filter((it: any) =>
    ['solicitud_cedis','en_transito','recibido_cedis','ingresado_almacen','disponible'].includes(it.estatus)
  ).length ?? 0), 0)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/crm" className="text-sm text-gray-400 hover:text-gray-600">← CRM</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-xl font-bold text-gray-800">Seguimiento de ofertas</h1>
          </div>
          <p className="text-sm text-gray-400">{offers.length} oferta(s) · {totalItems} materiales</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showClosed}
            onChange={e => setShowClosed(e.target.checked)} />
          Mostrar cerradas y canceladas
        </label>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total materiales', value: totalItems, color: 'border-gray-200' },
          { label: 'Aceptados',        value: aceptados,  color: 'border-green-200 bg-green-50' },
          { label: 'En proceso CEDIS', value: enCedis,    color: 'border-yellow-200 bg-yellow-50' },
          { label: 'Facturados',       value: facturados, color: 'border-purple-200 bg-purple-50' },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl border p-4 ${s.color}`}>
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          className="border border-gray-200 rounded-lg px-4 py-2 text-sm outline-none focus:border-teal-400 flex-1 min-w-48"
          placeholder="Buscar por cliente, material o pedido..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
          value={filterEstatus} onChange={e => setFilterEstatus(e.target.value)}>
          <option value="">Todas las ofertas</option>
          {Object.keys(OFFER_COLOR).map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none"
          value={filterItemEstatus} onChange={e => setFilterItemEstatus(e.target.value)}>
          <option value="">Todos los estatus de materiales</option>
          {Object.keys(ITEM_ESTATUS_COLOR).map(k => (
            <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-gray-400 p-6">Cargando...</p>}

      {!loading && offers.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No hay ofertas con estos filtros.</p>
        </div>
      )}

      <div className="space-y-3">
        {offers.map(offer => {
          const items = offer.crm_offer_items ?? []
          const isClosed = ['cerrada','cancelado'].includes(offer.estatus)
          return (
            <div key={offer.id} className={`bg-white rounded-xl border overflow-hidden ${
              isClosed ? 'border-gray-100 opacity-60' : 'border-gray-200'
            }`}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3 flex-wrap">
                  <Link to={`/crm/${offer.client_id}`}
                    className="text-sm font-semibold text-teal-600 hover:text-teal-700">
                    {offer.crm_clients?.solicitante}
                  </Link>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OFFER_COLOR[offer.estatus] ?? 'bg-gray-100 text-gray-500'}`}>
                    {offer.estatus}
                  </span>
                  <span className="text-xs text-gray-400">{offer.tipo}</span>
                  <span className="text-xs text-gray-300">
                    {new Date(offer.created_at).toLocaleDateString('es-MX')}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isClosed && (
                    <>
                      <button onClick={() => closeOffer(offer.id)}
                        className="text-xs border border-green-400 text-green-600 px-3 py-1.5 rounded-lg font-medium hover:bg-green-50">
                        ✅ Cerrar
                      </button>
                      <button onClick={() => cancelOffer(offer.id)}
                        className="text-xs border border-red-300 text-red-500 px-3 py-1.5 rounded-lg font-medium hover:bg-red-50">
                        Cancelar
                      </button>
                    </>
                  )}
                  <Link to={`/crm/${offer.client_id}/offer/${offer.id}`}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium px-3 py-1.5 border border-teal-200 rounded-lg hover:bg-teal-50">
                    Abrir →
                  </Link>
                  <Link to="/crm/items"
                    className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50">
                    ← Materiales en proceso
                  </Link>
                </div>
              </div>

              {/* Items */}
              {items.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-5 py-2 text-gray-400 font-semibold">Material</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-semibold">Descripción</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-semibold">Pedido</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-semibold">UM</th>
                        <th className="text-right px-3 py-2 text-gray-400 font-semibold">Precio</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-semibold">Lote / Cad</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-semibold">Estatus</th>
                        <th className="text-left px-3 py-2 text-gray-400 font-semibold">Factura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it: any) => {
                        const lotes = typeof it.lotes === 'string'
                          ? JSON.parse(it.lotes) : (it.lotes ?? [])
                        const lote = lotes[0] ?? {}
                        return (
                          <tr key={it.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                            <td className="px-5 py-2 font-semibold text-gray-800 whitespace-nowrap">
                              {it.aceptado && <span className="text-green-500 mr-1">✓</span>}
                              {it.material}
                            </td>
                            <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{it.descripcion}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                              {it.numero_pedido ?? <span className="text-gray-300 italic">pendiente</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-500">{it.um ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-700">
                              {it.precio_oferta ? `$${Number(it.precio_oferta).toLocaleString('es-MX')}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                              {lote.lote
                                ? `${lote.lote}${lote.fecha_caducidad ? ` / ${lote.fecha_caducidad}` : ''}`
                                : '—'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-full font-medium ${ITEM_ESTATUS_COLOR[it.estatus] ?? 'bg-gray-100 text-gray-500'}`}>
                                {it.estatus?.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">{it.numero_factura ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
