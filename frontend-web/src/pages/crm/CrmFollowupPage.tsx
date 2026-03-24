import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function CrmFollowupPage() {
  const { clientId, followupId } = useParams()
  const nav = useNavigate()
  const isNew = followupId === 'new'

  const [client, setClient] = useState<any>(null)
  const [recipients, setRecipients] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  // followup state removed
  const [materials, setMaterials] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    tipo: 'llamada', descripcion: '', estatus: 'pendiente',
    recipient_id: '', contact_id: '', fecha_seguimiento: '',
  })

  const [matForm, setMatForm] = useState({
    material: '', descripcion: '', precio_ofertado: '',
    condicion: '', lote: '', caducidad: '', requisitos: '',
  })
  const [showMatForm, setShowMatForm] = useState(false)

  useEffect(() => {
    supabase.from('crm_clients').select('*').eq('id', clientId).single().then(({ data }) => setClient(data))
    supabase.from('crm_recipients').select('*').eq('client_id', clientId).then(({ data }) => setRecipients(data ?? []))
    supabase.from('crm_contacts').select('*').eq('client_id', clientId).then(({ data }) => setContacts(data ?? []))

    if (!isNew && followupId) {
      supabase.from('crm_followups').select('*').eq('id', followupId).single().then(({ data }) => {
        if (data) setForm(data)
      })
      supabase.from('crm_materials').select('*').eq('followup_id', followupId).then(({ data }) => setMaterials(data ?? []))
    }
  }, [clientId, followupId])

  const saveFollowup = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (isNew) {
      const { data, error } = await supabase.from('crm_followups').insert({
        ...form,
        client_id: clientId,
        recipient_id: form.recipient_id || null,
        contact_id: form.contact_id || null,
        fecha_seguimiento: form.fecha_seguimiento || null,
        created_by: user?.id,
      }).select().single()
      if (error) toast.error(error.message)
      else {
        toast.success('Seguimiento creado')
        nav(`/crm/${clientId}/followup/${data.id}`)
      }
    } else {
      await supabase.from('crm_followups').update({
        ...form,
        recipient_id: form.recipient_id || null,
        contact_id: form.contact_id || null,
        fecha_seguimiento: form.fecha_seguimiento || null,
      }).eq('id', followupId)
      toast.success('Seguimiento actualizado')
    }
    setLoading(false)
  }

  const addMaterial = async () => {
    if (!matForm.material.trim()) return toast.error('Ingresa el código o nombre del material')
    await supabase.from('crm_materials').insert({
      followup_id:     followupId,
      material:        matForm.material,
      descripcion:     matForm.descripcion || null,
      precio_ofertado: matForm.precio_ofertado ? parseFloat(matForm.precio_ofertado) : null,
      condicion:       matForm.condicion || null,
      lote:            matForm.lote || null,
      caducidad:       matForm.caducidad || null,
      requisitos:      matForm.requisitos || null,
      aceptado:        false,
    })
    setMatForm({ material: '', descripcion: '', precio_ofertado: '', condicion: '', lote: '', caducidad: '', requisitos: '' })
    setShowMatForm(false)
    toast.success('Material agregado')
    const { data } = await supabase.from('crm_materials').select('*').eq('followup_id', followupId)
    setMaterials(data ?? [])
  }

  const toggleAceptado = async (mat: any) => {
    await supabase.from('crm_materials').update({ aceptado: !mat.aceptado }).eq('id', mat.id)
    const { data } = await supabase.from('crm_materials').select('*').eq('followup_id', followupId)
    setMaterials(data ?? [])
  }

  const deleteMaterial = async (matId: string) => {
    await supabase.from('crm_materials').delete().eq('id', matId)
    setMaterials(m => m.filter(x => x.id !== matId))
  }

  const TIPOS = [
    { value: 'llamada', label: '📞 Llamada' },
    { value: 'visita', label: '🤝 Visita' },
    { value: 'correo', label: '📧 Correo' },
    { value: 'cotizacion', label: '💰 Cotización' },
    { value: 'seguimiento_pedido', label: '📦 Seguimiento pedido' },
    { value: 'seguimiento_traslado', label: '🚚 Seguimiento traslado' },
    { value: 'otro', label: '📝 Otro' },
  ]

  const CONDICIONES = [
    { value: 'corta_caducidad', label: 'Corta caducidad' },
    { value: 'danado', label: 'Dañado' },
    { value: 'obsoleto', label: 'Material Obsoleto' },
    { value: 'otro', label: 'Otro' },
  ]

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => nav(`/crm/${clientId}`)}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver a {client?.solicitante}
      </button>

      <h1 className="text-xl font-bold text-gray-800 mb-6">
        {isNew ? 'Nuevo seguimiento' : 'Detalle del seguimiento'}
      </h1>

      {/* Formulario seguimiento */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Estatus</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              value={form.estatus} onChange={e => setForm(f => ({ ...f, estatus: e.target.value }))}>
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="esperando_respuesta">Esperando respuesta</option>
              <option value="completado">Completado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Destinatario</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              value={form.recipient_id} onChange={e => setForm(f => ({ ...f, recipient_id: e.target.value }))}>
              <option value="">Sin destinatario</option>
              {recipients.map(r => <option key={r.id} value={r.id}>{r.destinatario}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Contacto</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none"
              value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
              <option value="">Sin contacto</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.puesto ? ` — ${c.puesto}` : ''}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Descripción *</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm h-24 resize-none outline-none focus:border-teal-400"
              placeholder="Describe la interacción..." value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Fecha próximo seguimiento</label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal-400"
              value={form.fecha_seguimiento}
              onChange={e => setForm(f => ({ ...f, fecha_seguimiento: e.target.value }))} />
          </div>
        </div>
        <button onClick={saveFollowup} disabled={loading || !form.descripcion}
          className="mt-4 bg-teal-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
          {loading ? 'Guardando...' : isNew ? 'Crear seguimiento' : 'Guardar cambios'}
        </button>
      </div>

      {/* Materiales — solo después de crear */}
      {!isNew && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-700">Materiales ofrecidos</h2>
            <button onClick={() => setShowMatForm(!showMatForm)}
              className="bg-teal-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-teal-700">
              + Agregar material
            </button>
          </div>

          {showMatForm && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
              {[
                { label: 'Material / Código *', key: 'material' },
                { label: 'Descripción', key: 'descripcion' },
                { label: 'Precio ofertado', key: 'precio_ofertado', type: 'number' },
                { label: 'Lote', key: 'lote' },
                { label: 'Caducidad', key: 'caducidad', type: 'date' },
                { label: 'Requisitos', key: 'requisitos' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <input type={f.type ?? 'text'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-teal-400"
                    value={matForm[f.key as keyof typeof matForm]}
                    onChange={e => setMatForm(x => ({ ...x, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Condición</label>
                <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white outline-none"
                  value={matForm.condicion} onChange={e => setMatForm(x => ({ ...x, condicion: e.target.value }))}>
                  <option value="">Sin condición especial</option>
                  {CONDICIONES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="col-span-2 flex gap-2">
                <button onClick={addMaterial}
                  className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                  Guardar material
                </button>
                <button onClick={() => setShowMatForm(false)}
                  className="bg-gray-100 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {materials.length === 0 && !showMatForm && (
            <p className="text-sm text-gray-400">Sin materiales registrados.</p>
          )}

          {materials.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-xs text-gray-400 font-semibold py-2 pr-3">Material</th>
                    <th className="text-left text-xs text-gray-400 font-semibold py-2 pr-3">Precio</th>
                    <th className="text-left text-xs text-gray-400 font-semibold py-2 pr-3">Condición</th>
                    <th className="text-left text-xs text-gray-400 font-semibold py-2 pr-3">Caducidad</th>
                    <th className="text-center text-xs text-gray-400 font-semibold py-2 pr-3">Aceptado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map(m => (
                    <tr key={m.id} className={`border-b border-gray-50 ${m.aceptado ? 'bg-green-50' : ''}`}>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-gray-800">{m.material}</p>
                        {m.descripcion && <p className="text-xs text-gray-400">{m.descripcion}</p>}
                        {m.lote && <p className="text-xs text-gray-400">Lote: {m.lote}</p>}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        {m.precio_ofertado ? `$${Number(m.precio_ofertado).toLocaleString('es-MX')}` : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {m.condicion ? (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                            {m.condicion.replace('_', ' ')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">{m.caducidad ?? '—'}</td>
                      <td className="py-2 pr-3 text-center">
                        <button onClick={() => toggleAceptado(m)}
                          className={`w-6 h-6 rounded border-2 flex items-center justify-center mx-auto transition ${
                            m.aceptado ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                          }`}>
                          {m.aceptado && <span className="text-xs">✓</span>}
                        </button>
                      </td>
                      <td className="py-2">
                        <button onClick={() => deleteMaterial(m.id)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {materials.some(m => m.aceptado) && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                  <p className="text-sm text-green-700 font-medium">
                    {materials.filter(m => m.aceptado).length} material(es) aceptado(s)
                  </p>
                  <button
                    onClick={() => nav(`/crm/${clientId}/followup/${followupId}/order/new`)}
                    className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
                    Generar pedido
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
