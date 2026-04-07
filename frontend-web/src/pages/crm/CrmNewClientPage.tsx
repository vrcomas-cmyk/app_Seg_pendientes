import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

export default function CrmNewClientPage() {
  const nav = useNavigate()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    solicitante: '', razon_social: '', rfc: '',
    poblacion: '', estado: '', pais: 'México',
    ramo: '', centro: '', gpo_vendedores: '',
  })
  const [phones, setPhones] = useState<string[]>([])
  const [emails, setEmails] = useState<string[]>([])
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const addPhone = () => {
    if (!newPhone.trim()) return
    setPhones(p => [...p, newPhone.trim()])
    setNewPhone('')
  }

  const addEmail = () => {
    if (!newEmail.trim()) return
    setEmails(e => [...e, newEmail.trim()])
    setNewEmail('')
  }

  const handleSubmit = async () => {
    if (!form.solicitante.trim()) return toast.error('El solicitante es obligatorio')
    setLoading(true)
    const { user } = useAuth(); // injected
    const { data, error } = await supabase.from('crm_clients').insert({
      ...form,
      telefonos:  phones,
      correos:    emails,
      created_by: user?.id,
    }).select().single()

    if (error) {
      toast.error(error.message)
      setLoading(false)
    } else {
      toast.success('Cliente creado')
      nav(`/crm/${data.id}`)
    }
  }

  const fields = [
    { label: 'Solicitante *', key: 'solicitante' },
    { label: 'Razón Social', key: 'razon_social' },
    { label: 'RFC', key: 'rfc' },
    { label: 'Población', key: 'poblacion' },
    { label: 'Estado', key: 'estado' },
    { label: 'País', key: 'pais' },
    { label: 'Ramo', key: 'ramo' },
    { label: 'Centro', key: 'centro' },
    { label: 'Gpo. Vendedores', key: 'gpo_vendedores' },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => nav('/crm')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">
        ← Volver
      </button>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Nuevo cliente</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-teal-400"
                value={form[f.key as keyof typeof form]}
                onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))} />
            </div>
          ))}
        </div>

        {/* Teléfonos */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block font-semibold">Teléfonos</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {phones.map((p, i) => (
              <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">
                {p}
                <button onClick={() => setPhones(ps => ps.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 ml-1 text-xs">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 flex-1"
              placeholder="Agregar teléfono" value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addPhone()} />
            <button onClick={addPhone} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200">
              Agregar
            </button>
          </div>
        </div>

        {/* Correos */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block font-semibold">Correos</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {emails.map((e, i) => (
              <span key={i} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-sm px-3 py-1 rounded-full">
                {e}
                <button onClick={() => setEmails(es => es.filter((_, j) => j !== i))}
                  className="text-blue-400 hover:text-red-500 ml-1 text-xs">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-teal-400 flex-1"
              placeholder="Agregar correo" value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addEmail()} />
            <button onClick={addEmail} className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-200">
              Agregar
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={handleSubmit} disabled={loading}
            className="bg-teal-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50">
            {loading ? 'Guardando...' : 'Crear cliente'}
          </button>
          <button onClick={() => nav('/crm')}
            className="bg-gray-100 text-gray-600 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
