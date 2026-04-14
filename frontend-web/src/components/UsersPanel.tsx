import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const ALL_MODULES = [
  { key: 'pendientes',      label: 'Pendientes' },
  { key: 'msc',             label: 'MSC' },
  { key: 'crm',             label: 'CRM' },
  { key: 'cedis',           label: 'CEDIS' },
  { key: 'catalogo',        label: 'Catálogo' },
  { key: 'admin',           label: 'Admin' },
]

const ALL_ROLES = [
  { value: 'user',             label: 'Usuario' },
  { value: 'educador_clinico', label: 'Educador Clinico' },
  { value: 'gerente',          label: 'Gerente' },
  { value: 'admin',            label: 'Admin' },
]

const DEFAULT_MODULES: Record<string, string[]> = {
  user:             ['pendientes'],
  educador_clinico: ['pendientes', 'msc'],
  gerente:          ['pendientes', 'msc'],
  admin:            ['pendientes', 'msc', 'crm', 'cedis', 'catalogo', 'admin'],
}

export default function UsersPanel() {
  const [users, setUsers]         = useState<any[]>([])
  const [teams, setTeams]         = useState<any[]>([])
  const [saving, setSaving]       = useState<string | null>(null)
  const [teamModal, setTeamModal] = useState<any | null>(null)

  const load = async () => {
    const [rolesRes, profilesRes, teamsRes] = await Promise.all([
      supabase.from('user_roles').select('*').order('created_at'),
      supabase.from('user_profiles').select('user_id, email'),
      supabase.from('user_teams').select('*'),
    ])
    const profileMap: Record<string, string> = {}
    profilesRes.data?.forEach(p => { profileMap[p.user_id] = p.email })
    setUsers((rolesRes.data ?? []).map(r => ({
      ...r, email: profileMap[r.user_id] ?? r.user_id,
    })))
    setTeams(teamsRes.data ?? [])
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
    setUsers(prev => prev.map(u =>
      u.user_id === userId
        ? { ...u, role, modules: DEFAULT_MODULES[role] ?? ['pendientes'] }
        : u
    ))
  }

  // Gerentes y sus miembros
  const gerentes = users.filter(u => u.role === 'gerente')
  const educadores = users.filter(u => u.role === 'educador_clinico')

  const getMiembros = (gerenteId: string) =>
    teams.filter(t => t.gerente_id === gerenteId).map(t => t.miembro_id)

  const toggleMiembro = async (gerenteId: string, miembroId: string) => {
    const isMiembro = getMiembros(gerenteId).includes(miembroId)
    if (isMiembro) {
      await supabase.from('user_teams')
        .delete().eq('gerente_id', gerenteId).eq('miembro_id', miembroId)
    } else {
      await supabase.from('user_teams')
        .insert({ gerente_id: gerenteId, miembro_id: miembroId })
    }
    const { data } = await supabase.from('user_teams').select('*')
    setTeams(data ?? [])
    toast.success(isMiembro ? 'Removido del equipo' : 'Agregado al equipo')
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
                  {ALL_ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => saveRole(u.user_id, u.role, u.modules ?? ['pendientes'])}
                  disabled={saving === u.user_id}
                  className="bg-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-700 disabled:opacity-50">
                  {saving === u.user_id ? 'Guardando...' : 'Guardar'}
                </button>
                {u.role === 'gerente' && (
                  <button
                    onClick={() => setTeamModal(u)}
                    className="border border-teal-300 text-teal-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-50">
                    Gestionar equipo ({getMiembros(u.user_id).length})
                  </button>
                )}
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

      {/* Modal gestión de equipo */}
      {teamModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-md">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-bold text-gray-800">Equipo de {teamModal.email}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Selecciona los educadores a cargo</p>
              </div>
              <button onClick={() => setTeamModal(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl">x</button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              {educadores.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No hay educadores clinicos registrados aun.
                </p>
              )}
              {educadores.map(edu => {
                const isMiembro = getMiembros(teamModal.user_id).includes(edu.user_id)
                return (
                  <div key={edu.user_id}
                    className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{edu.email}</p>
                      <p className="text-xs text-gray-400">Educador Clinico</p>
                    </div>
                    <button
                      onClick={() => toggleMiembro(teamModal.user_id, edu.user_id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        isMiembro
                          ? 'bg-teal-600 text-white hover:bg-red-500'
                          : 'border border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-600'
                      }`}>
                      {isMiembro ? 'En equipo' : '+ Agregar'}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button onClick={() => setTeamModal(null)}
                className="w-full bg-teal-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
