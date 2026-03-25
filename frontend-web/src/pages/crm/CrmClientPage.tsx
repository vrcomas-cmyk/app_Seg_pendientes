import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import CrmOrderStatusBar from './CrmOrderStatusBar'
import RecipientsTable from '../../components/RecipientsTable'
import ContactsTable from '../../components/ContactsTable'
import toast from 'react-hot-toast'

type Tab = 'info' | 'destinatarios' | 'contactos' | 'seguimientos' | 'sugerencias' | 'consumo' | 'pedidos' | 'pendientes'

export default function CrmClientPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [client, setClient] = useState<any>(null)
  const [recipients, setRecipients] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [followups, setFollowups] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [consumption, setConsumption] = useState<any[]>([])
  const [tab, setTab] = useState<Tab>('info')
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState<any>({})
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactForm, setContactForm] = useState({ nombre: '', puesto: '', telefono: '', correo: '', comentarios: '' })
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  // Selección para crear oferta
  const [selectedSugg, setSelectedSugg] = useState<string[]>([])
  const [selectedCons, setSelectedCons] = useState<string[]>([])

  const load = async () => {
    const [c, r, co, f, o] = await Promise.all([
      supabase.from('crm_clients').select('*').eq('id', id).single(),
      supabase.from('crm_recipients').select('*').eq('client_id', id).order('destinatario'),
      supabase.from('crm_contacts').select('*').eq('client_id', id).order('nombre'),
      supabase.from('crm_followups').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      supabase.from('crm_orders').select('*, crm_order_items(count), crm_cedis_requests(count)')
        .eq('client_id', id).order('created_at', { ascending: false }),
    ])
    setClient(c.data); setForm(c.data ?? {})
    setRecipients(r.data ?? [])
    setContacts(co.data ?? [])
    setFollowups(f.data ?? [])
    setOrders(o.data ?? [])

    if (c.data?.solicitante) {
      const solicitante = c.data.solicitante
      const [sug, con] = await Promise.all([
        supabase.from('crm_suggestions').select('*')
          .or(`solicitante.eq.${solicitante},destinatario.eq.${solicitante}`)
          .order('fecha', { ascending: false }),
        supabase.from('crm_consumption').select('*')
          .or(`solicitante.eq.${solicitante},destinatario.eq.${solicitante}`)
          .order('created_at', { ascending: false }),
      ])
      setSuggestions(sug.data ?? [])
      setConsumption(con.data ?? [])
    }

    if (f.data && f.data.length > 0) {
      const taskIds = f.data.map((x: any) => x.task_id).filter(Boolean)
      if (taskIds.length > 0) {
        const { data: t } = await supabase.from('tasks').select('*').in('id', taskIds)
        setTasks(t ?? [])
      }
    }
  }

  useEffect(() => { load() }, [id])

  const saveClient = async () => {
    const { error } = await supabase.from('crm_clients').update({
      solicitante: form.solicitante, razon_social: form.razon_social,
      rfc: form.rfc, poblacion: form.poblacion, estado: form.estado,
      pais: form.pais, ramo: form.ramo, centro: form.centro,
      gpo_vendedores: form.gpo_vendedores,
    }).eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Cliente actualizado'); setEditMode(false); load() }
  }

  const addPhone = async () => {
    if (!newPhone.trim()) return
    await supabase.from('crm_clients').update({ telefonos: [...(client.telefonos ?? []), newPhone.trim()] }).eq('id', id)
    setNewPhone(''); load(); toast.success('Teléfono agregado')
  }
  const removePhone = async (phone: string) => {
    await supabase.from('crm_clients').update({ telefonos: client.telefonos.filter((t: string) => t !== phone) }).eq('id', id)
    load()
  }
  const addEmail = async () => {
    if (!newEmail.trim()) return
    await supabase.from('crm_clients').update({ correos: [...(client.correos ?? []), newEmail.trim()] }).eq('id', id)
    setNewEmail(''); load(); toast.success('Correo agregado')
  }
  const removeEmail = async (email: string) => {
    await supabase.from('crm_clients').update({ correos: client.correos.filter((e: string) => e !== email) }).eq('id', id)
    load()
  }
  const addContact = async () => {
    if (!contactForm.nombre.trim()) return toast.error('El nombre es obligatorio')
    await supabase.from('crm_contacts').insert({ ...contactForm, client_id: id })
    setContactForm({ nombre: '', puesto: '', telefono: '', correo: '', comentarios: '' })
    setShowContactForm(false); toast.success('Contacto agregado'); load()
  }
  const deleteContact = async (contactId: string) => {
    if (!window.confirm('¿Eliminar este contacto?')) return
    await supabase.from('crm_contacts').delete().eq('id', contactId); load()
  }

  const createOfferFromSuggestions = () => {
    if (selectedSugg.length === 0) return toast.error('Selecciona al menos un material')
    nav(`/crm/${id}/offer/new?source=sugerencia&ids=${selectedSugg.join(',')}`)
  }

  const createOfferFromConsumption = () => {
    if (selectedCons.length === 0) return toast.error('Selecciona al menos un material')
    nav(`/crm/${id}/offer/new?source=consumo&ids=${selectedCons.join(',')}`)
  }

  const toggleSugg = (sid: string) =>
    setSelectedSugg(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid])
  const toggleCons = (cid: string) =>
    setSelectedCons(prev => prev.includes(cid) ? prev.filter(x => x !== cid) : [...prev, cid])

  if (!client) return <div className="text-sm text-gray-400 p-6">Cargando...</div>

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info',          label: 'Info general' },
    { key: 'destinatarios', label: `Destinatarios (${recipients.length})` },
    { key: 'contactos',     label: `Contactos (${contacts.length})` },
    { key: 'seguimientos',  label: `Seguimientos (${followups.length})` },
    { key: 'sugerencias',   label: `Sugerencias SAP (${suggestions.length})` },
    { key: 'consumo',       label: `Consumo (${consumption.length})` },
    { key: 'pedidos',       label: `Pedidos (${orders.length})` },
    { key: 'pendientes',    label: `Pendientes (${tasks.length})` },
  ]

  const TIPO_LABEL: Record<string, string> = {
    llamada: '📞 Llamada', visita: '🤝 Visita', correo: '📧 Correo',
    cotizacion: '💰 Cotización', seguimiento_pedido: '📦 Pedido',
    seguimiento_traslado: '🚚 Traslado', otro: '📝 Otro',
  }
  const STATUS_COLOR: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-700', en_proceso: 'bg-blue-100 text-blue-700',
    esperando_respuesta: 'bg-purple-100 text-purple-700',
    completado: 'bg-green-100 text-green-700', cancelado: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => nav('/crm')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver a clientes
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{client.solicitante}</h1>
            {client.razon_social && <p className="text-sm text-gray-500">{client.razon_social}</p>}
            <div className="flex flex-wrap gap-3 mt-2">
              {client.rfc && <span className="text-xs text-gray-400">RFC: {client.rfc}</span>}
              {client.estado && <span className="text-xs text-gray-400">{client.estado}</span>}
              {client.ramo && <span className="text-xs bg-teal-50 text-teal-600 px-2 py-0.5 rounded">{client.ramo}</span>}
              {client.centro && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">Centro: {client.centro}</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => nav(`/crm/${id}/offer/new?source=manual`)}
              className="border border-teal-600 text-teal-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-50">
              + Oferta manual
            </button>
            <Link to={`/crm/${id}/followup/new`}
              className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
              + Seguimiento
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
              tab === t.key ? 'border-teal-600 text-teal-600 bg-teal-50' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Info */}
      {tab === 'info' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-700">Información general</h2>
            <button onClick={() => setEditMode(!editMode)} className="text-sm text-teal-600 font-medium">
              {editMode ? 'Cancelar' : 'Editar'}
            </button>
          </div>
          {editMode ? (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Solicitante', key: 'solicitante' }, { label: 'Razón Social', key: 'razon_social' },
                { label: 'RFC', key: 'rfc' }, { label: 'Población', key: 'poblacion' },
                { label: 'Estado', key: 'estado' }, { label: 'País', key: 'pais' },
                { label: 'Ramo', key: 'ramo' }, { label: 'Centro', key: 'centro' },
                { label: 'Gpo. Vendedores', key: 'gpo_vendedores' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                    value={form[f.key] ?? ''} onChange={e => setForm((x: any) => ({ ...x, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div className="col-span-2">
                <button onClick={saveClient} className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                  Guardar cambios
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-y-3 gap-x-8 text-sm">
              {[
                ['Solicitante', client.solicitante], ['Razón Social', client.razon_social],
                ['RFC', client.rfc], ['Población', client.poblacion],
                ['Estado', client.estado], ['País', client.pais],
                ['Ramo', client.ramo], ['Centro', client.centro],
                ['Gpo. Vendedores', client.gpo_vendedores],
              ].map(([label, val]) => val ? (
                <div key={label}><p className="text-xs text-gray-400">{label}</p><p className="font-medium text-gray-700">{val}</p></div>
              ) : null)}
            </div>
          )}
          <div className="mt-6 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Teléfonos</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {(client.telefonos ?? []).map((t: string) => (
                <span key={t} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">
                  {t}<button onClick={() => removePhone(t)} className="text-gray-400 hover:text-red-500 ml-1 text-xs">×</button>
                </span>
              ))}
              {!(client.telefonos ?? []).length && <span className="text-sm text-gray-400">Sin teléfonos</span>}
            </div>
            <div className="flex gap-2">
              <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400"
                placeholder="Nuevo teléfono" value={newPhone} onChange={e => setNewPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPhone()} />
              <button onClick={addPhone} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200">Agregar</button>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Correos</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {(client.correos ?? []).map((e: string) => (
                <span key={e} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full">
                  {e}<button onClick={() => removeEmail(e)} className="text-blue-400 hover:text-red-500 ml-1 text-xs">×</button>
                </span>
              ))}
              {!(client.correos ?? []).length && <span className="text-sm text-gray-400">Sin correos</span>}
            </div>
            <div className="flex gap-2">
              <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400"
                placeholder="Nuevo correo" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEmail()} />
              <button onClick={addEmail} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200">Agregar</button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Destinatarios */}
      {tab === 'destinatarios' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {recipients.map(r => (
            <div key={r.id} className="px-5 py-4 border-b border-gray-100 last:border-0">
              <p className="text-sm font-semibold text-gray-800">{r.destinatario}</p>
              <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                {r.razon_social && <p>Razón Social: {r.razon_social}</p>}
                {r.rfc && <p>RFC: {r.rfc}</p>}
                {r.poblacion && <p>{r.poblacion}{r.estado ? `, ${r.estado}` : ''}</p>}
                {r.centro && <p>Centro: {r.centro}</p>}
                {r.telefonos?.length > 0 && <p>Tel: {r.telefonos.join(' · ')}</p>}
                {r.correos?.length > 0 && <p>Email: {r.correos.join(' · ')}</p>}
              </div>
            </div>
          ))}
          {recipients.length === 0 && <p className="text-sm text-gray-400 p-6">Sin destinatarios.</p>}
          <div className="px-5 py-3 border-t border-gray-100">
            <RecipientsTable clientId={id!} onRefresh={load} />
          </div>
        </div>
      )}

      {/* TAB: Contactos */}
      {tab === 'contactos' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-700">Contactos</h2>
            <button onClick={() => setShowContactForm(!showContactForm)}
              className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-700">
              + Agregar contacto
            </button>
          </div>
          {showContactForm && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
              {[
                { label: 'Nombre *', key: 'nombre' }, { label: 'Puesto / Área', key: 'puesto' },
                { label: 'Teléfono', key: 'telefono' }, { label: 'Correo', key: 'correo' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-teal-400"
                    value={contactForm[f.key as keyof typeof contactForm]}
                    onChange={e => setContactForm(x => ({ ...x, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Comentarios</label>
                <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white h-16 resize-none outline-none focus:border-teal-400"
                  value={contactForm.comentarios} onChange={e => setContactForm(x => ({ ...x, comentarios: e.target.value }))} />
              </div>
              <div className="col-span-2 flex gap-2">
                <button onClick={addContact} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">Guardar</button>
                <button onClick={() => setShowContactForm(false)} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">Cancelar</button>
              </div>
            </div>
          )}
          {contacts.length === 0 && !showContactForm && <p className="text-sm text-gray-400 mb-4">Sin contactos registrados.</p>}
          <div className="space-y-3 mb-4">
            {contacts.map(c => (
              <div key={c.id} className="flex justify-between items-start p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{c.nombre}</p>
                  {c.puesto && <p className="text-xs text-gray-500">{c.puesto}</p>}
                  <div className="flex gap-4 mt-1">
                    {c.telefono && <p className="text-xs text-gray-400">📞 {c.telefono}</p>}
                    {c.correo && <p className="text-xs text-gray-400">✉️ {c.correo}</p>}
                  </div>
                  {c.comentarios && <p className="text-xs text-gray-400 mt-1 italic">{c.comentarios}</p>}
                </div>
                <button onClick={() => deleteContact(c.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Eliminar</button>
              </div>
            ))}
          </div>
          <ContactsTable clientId={id!} onRefresh={load} />
        </div>
      )}

      {/* TAB: Seguimientos */}
      {tab === 'seguimientos' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-700">Historial de seguimientos</h2>
            <Link to={`/crm/${id}/followup/new`} className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-700">+ Nuevo</Link>
          </div>
          {followups.length === 0 && <p className="text-sm text-gray-400 p-6">Sin seguimientos.</p>}
          {followups.map(f => (
            <Link to={`/crm/${id}/followup/${f.id}`} key={f.id}
              className="flex items-start justify-between px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{TIPO_LABEL[f.tipo] ?? f.tipo}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[f.estatus]}`}>
                    {f.estatus.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{f.descripcion}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(f.created_at).toLocaleDateString('es-MX')}
                  {f.fecha_seguimiento && ` · Próximo: ${f.fecha_seguimiento}`}
                </p>
              </div>
              <span className="text-gray-300 text-lg ml-4">›</span>
            </Link>
          ))}
        </div>
      )}

      {/* TAB: Sugerencias SAP */}
      {tab === 'sugerencias' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-700">Sugerencias SAP — pedidos abiertos</h2>
            {selectedSugg.length > 0 && (
              <button onClick={createOfferFromSuggestions}
                className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-700">
                Crear oferta con {selectedSugg.length} material(es) seleccionado(s)
              </button>
            )}
          </div>
          {suggestions.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-400">No hay sugerencias para este cliente.</p>
              <Link to="/crm/suggestions-import" className="text-xs text-teal-600 hover:underline mt-1 block">
                Cargar archivo de sugerencias →
              </Link>
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>
              <table className="text-xs border-collapse w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 border-b border-gray-200 w-8"></th>
                    {['Pedido','Fecha','Destinatario','Mat. Solicitado','Descripción','Cant. Pendiente','Cant. Ofertar',
                      'Mat. Sugerido','Desc. Sugerida','Centro Sug.','Alm. Sug.','Disponible','Lote','Caducidad','Fuente'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map(s => (
                    <tr key={s.id} className={`border-b border-gray-100 hover:bg-teal-50 cursor-pointer ${selectedSugg.includes(s.id) ? 'bg-teal-50' : ''}`}
                      onClick={() => toggleSugg(s.id)}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={selectedSugg.includes(s.id)}
                          onChange={() => toggleSugg(s.id)} onClick={e => e.stopPropagation()} />
                      </td>
                      <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{s.pedido}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{s.fecha}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-32 truncate">{s.destinatario}</td>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{s.material_solicitado}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{s.descripcion_solicitada}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{s.cantidad_pendiente ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{s.cantidad_ofertar ?? '—'}</td>
                      <td className="px-3 py-2 font-medium text-teal-700 whitespace-nowrap">{s.material_sugerido}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{s.descripcion_sugerida}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{s.centro_sugerido}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{s.almacen_sugerido}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{s.disponible ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{s.lote ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{s.fecha_caducidad ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{s.fuente ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedSugg.length > 0 && (
            <div className="px-5 py-3 bg-teal-50 border-t border-teal-200 flex justify-between items-center">
              <p className="text-sm text-teal-700 font-medium">
                {selectedSugg.length} material(es) seleccionado(s)
              </p>
              <button onClick={createOfferFromSuggestions}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                Crear oferta →
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB: Consumo */}
      {tab === 'consumo' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-700">Reporte de consumo — oportunidades sin pedido abierto</h2>
            {selectedCons.length > 0 && (
              <button onClick={createOfferFromConsumption}
                className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-700">
                Crear oferta con {selectedCons.length} material(es)
              </button>
            )}
          </div>
          {consumption.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-400">No hay datos de consumo para este cliente.</p>
              <Link to="/crm/suggestions-import" className="text-xs text-teal-600 hover:underline mt-1 block">
                Cargar archivo de consumo →
              </Link>
            </div>
          )}
          {consumption.length > 0 && (
            <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>
              <table className="text-xs border-collapse w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 border-b border-gray-200 w-8"></th>
                    {['Material','Descripción','Destinatario','Últ. Compra','Cons. Prom/Mes','Tendencia',
                      'Precio Últ.','Precio Prom','Mat. Sugerido','Desc. Sugerida','Disponible','Lote','Caducidad','Fuente'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold border-b border-gray-200 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consumption.map(c => (
                    <tr key={c.id} className={`border-b border-gray-100 hover:bg-teal-50 cursor-pointer ${selectedCons.includes(c.id) ? 'bg-teal-50' : ''}`}
                      onClick={() => toggleCons(c.id)}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={selectedCons.includes(c.id)}
                          onChange={() => toggleCons(c.id)} onClick={e => e.stopPropagation()} />
                      </td>
                      <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{c.material}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{c.texto_material}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap max-w-32 truncate">{c.destinatario}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.ultima_compra_cliente ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{c.consumo_promedio_mensual ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.tendencia && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            c.tendencia === 'Alza' ? 'bg-green-100 text-green-700' :
                            c.tendencia === 'Baja' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                          }`}>{c.tendencia}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {c.precio_unitario_ultima ? `$${Number(c.precio_unitario_ultima).toLocaleString('es-MX')}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {c.precio_prom ? `$${Number(c.precio_prom).toLocaleString('es-MX')}` : '—'}
                      </td>
                      <td className="px-3 py-2 font-medium text-teal-700 whitespace-nowrap">{c.material_sugerido}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-40 truncate">{c.descripcion_sugerida}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{c.disponible ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.lote ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.fecha_caducidad ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{c.fuente ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedCons.length > 0 && (
            <div className="px-5 py-3 bg-teal-50 border-t border-teal-200 flex justify-between items-center">
              <p className="text-sm text-teal-700 font-medium">
                {selectedCons.length} material(es) seleccionado(s)
              </p>
              <button onClick={createOfferFromConsumption}
                className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                Crear oferta →
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB: Pedidos */}
      {tab === 'pedidos' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {orders.length === 0 && <p className="text-sm text-gray-400 p-6">Sin pedidos registrados.</p>}
          {orders.map(o => (
            <div key={o.id} className="px-5 py-4 border-b border-gray-100 last:border-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-bold text-gray-800">Pedido: {o.numero_pedido}</p>
                <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('es-MX')}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400 mb-2">
                <span>{o.crm_order_items?.[0]?.count ?? 0} material(es)</span>
                <span>{o.crm_cedis_requests?.[0]?.count ?? 0} req. CEDIS</span>
              </div>
              {o.comentarios && <p className="text-xs text-gray-500 mb-2">{o.comentarios}</p>}
              <CrmOrderStatusBar order={o} onRefresh={load} />
              <div className="mt-2">
                <Link to={`/crm/${id}/order/${o.id}/cedis`}
                  className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700">
                  Ver / Crear requerimiento CEDIS
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: Pendientes */}
      {tab === 'pendientes' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {tasks.length === 0 && <p className="text-sm text-gray-400 p-6">Sin pendientes vinculados.</p>}
          {tasks.map(t => (
            <Link to={`/tasks/${t.id}`} key={t.id}
              className="flex items-center justify-between px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-800">{t.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">Vence: {t.due_date} · {t.status}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                t.priority === 'alta' ? 'bg-red-100 text-red-700' :
                t.priority === 'media' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                {t.priority}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
