import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const ALL_MODULES = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'crm',        label: 'CRM' },
  { key: 'msc',        label: 'MSC' },
  { key: 'catalogo',   label: 'Catalogo' },
  { key: 'admin',      label: 'Admin' },
]

export default function UsersPanel() {
  const [users, setUsers] = useState<any[]>([])
  const [roles, setRoles] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
    })
    const usersData = res.ok ? await res.json() : []
    setUsers(usersData)
    const { data: rolesData } = await supabase.from('user_roles').select('*')
    const rolesMap: Record<string, any> = {}
    rolesData?.forEach(r => { rolesMap[r.user_id] = r })
    setRoles(rolesMap)
  }

  useEffect(() => { load() }, [])

  const saveRole = async (userId: string, role: string, modules: string[]) => {
    setSaving(userId)
    await supabase.from('user_roles').upsert(
      { user_id: userId, role, modules },
      { onConflict: 'user_id' }
    )
    toast.success('Rol actualizado')
    setRoles(prev => ({ ...prev, [userId]: { ...prev[userId], role, modules } }))
    setSaving(null)
  }

  const toggleModule = (userId: string, module: string) => {
    const current = roles[userId]?.modules ?? ['pendientes']
    const updated = current.includes(module)
      ? current.filter((m: string) => m !== module)
      : [...current, module]
    setRoles(prev => ({ ...prev, [userId]: { ...prev[userId], modules: updated } }))
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) toast.error(error.message)
    else toast.success(`Correo de reset enviado a ${email}`)
  }

  return (
    <div>
      <h2 className="font-semibold text-gray-800 mb-1">Usuarios y permisos</h2>
      <p className="text-sm text-gray-400 mb-4">Gestiona roles y modulos visibles por usuario.</p>
      {users.length === 0 && <p className="text-sm text-gray-400">Cargando usuarios...</p>}
      <div className="space-y-4">
        {users.map((u: any) => {
          const userRole = roles[u.id] ?? { role: 'user', modules: ['pendientes'] }
          return (
            <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{u.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Ultimo acceso: {u.last_sign_in_at
                      ? new Date(u.last_sign_in_at).toLocaleDateString('es-MX')
                      : 'Nunca'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
                    value={userRole.role}
                    onChange={e => setRoles(prev => ({ ...prev, [u.id]: { ...prev[u.id], role: e.target.value } }))}>
                    <option value="user">Usuario</option>
                    <option value="team">Equipo</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={() => saveRole(u.id, userRole.role, userRole.modules ?? ['pendientes'])}
                    disabled={saving === u.id}
                    className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50">
                    {saving === u.id ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => resetPassword(u.email)}
                    className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">
                    Reset pass
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Modulos visibles:</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_MODULES.map(m => {
                    const active = (userRole.modules ?? ['pendientes']).includes(m.key)
                    return (
                      <button key={m.key}
                        onClick={() => toggleModule(u.id, m.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          active
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
