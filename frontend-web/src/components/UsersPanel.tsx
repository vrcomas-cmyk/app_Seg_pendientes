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
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    // Cargar roles + perfiles (emails)
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: true })

    const { data: profilesData } = await supabase
      .from('user_profiles')
      .select('user_id, email')

    const profileMap: Record<string, string> = {}
    profilesData?.forEach(p => { profileMap[p.user_id] = p.email })

    setUsers((rolesData ?? []).map(r => ({
      ...r,
      email: profileMap[r.user_id] ?? r.user_id,
    })))
  }

  useEffect(() => { load() }, [])

  const saveRole = async (userId: string, role: string, modules: string[]) => {
    setSaving(userId)
    await supabase.from('user_roles').upsert(
      { user_id: userId, role, modules },
      { onConflict: 'user_id' }
    )
    toast.success('Rol actualizado')
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role, modules } : u))
    setSaving(null)
  }

  const toggleModule = (userId: string, module: string) => {
    setUsers(prev => prev.map(u => {
      if (u.user_id !== userId) return u
      const current = u.modules ?? ['pendientes']
      const updated = current.includes(module)
        ? current.filter((m: string) => m !== module)
        : [...current, module]
      return { ...u, modules: updated }
    }))
  }

  const updateRole = (userId: string, role: string) => {
    setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, role } : u))
  }

  return (
    <div>
      <h2 className="font-semibold text-gray-800 mb-1">Usuarios y permisos</h2>
      <p className="text-sm text-gray-400 mb-4">
        Gestiona roles y modulos visibles por usuario.
        <span className="ml-1 text-xs text-gray-300">({users.length} usuarios)</span>
      </p>

      {users.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
          No hay usuarios registrados aun.
        </div>
      )}

      <div className="space-y-3">
        {users.map(u => (
          <div key={u.user_id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-800">{u.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Desde: {new Date(u.created_at).toLocaleDateString('es-MX')}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none bg-white"
                  value={u.role}
                  onChange={e => updateRole(u.user_id, e.target.value)}>
                  <option value="user">Usuario</option>
                  <option value="team">Equipo</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={() => saveRole(u.user_id, u.role, u.modules ?? ['pendientes'])}
                  disabled={saving === u.user_id}
                  className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50">
                  {saving === u.user_id ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Modulos visibles:</p>
              <div className="flex flex-wrap gap-2">
                {ALL_MODULES.map(m => {
                  const active = (u.modules ?? ['pendientes']).includes(m.key)
                  return (
                    <button key={m.key}
                      onClick={() => toggleModule(u.user_id, m.key)}
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
        ))}
      </div>
    </div>
  )
}
