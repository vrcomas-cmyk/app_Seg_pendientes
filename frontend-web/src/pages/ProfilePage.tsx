import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

export default function ProfilePage() {
  const nav = useNavigate()
  const [current, setCurrent] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = async () => {
    if (!newPass || !confirm) return toast.error('Completa todos los campos')
    if (newPass !== confirm) return toast.error('Las contraseñas no coinciden')
    if (newPass.length < 6) return toast.error('Mínimo 6 caracteres')

    setLoading(true)

    // Verificar contraseña actual reautenticando
    const { data: { user } } = await supabase.auth.getUser()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user?.email ?? '',
      password: current,
    })

    if (signInError) {
      toast.error('La contraseña actual es incorrecta')
      setLoading(false)
      return
    }

    // Cambiar contraseña
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Contraseña actualizada correctamente')
      setCurrent(''); setNewPass(''); setConfirm('')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-md mx-auto">
      <button onClick={() => nav(-1)} className="text-sm text-gray-400 hover:text-gray-600 mb-4 flex items-center gap-1">← Volver</button>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-6">Cambiar contraseña</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Contraseña actual</label>
            <input type="password"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
              placeholder="••••••••"
              value={current}
              onChange={e => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Nueva contraseña</label>
            <input type="password"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
              placeholder="Mínimo 6 caracteres"
              value={newPass}
              onChange={e => setNewPass(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Confirmar nueva contraseña</label>
            <input type="password"
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-teal-400"
              placeholder="Repite la nueva contraseña"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleChange()} />
          </div>
          <button onClick={handleChange} disabled={loading}
            className="w-full bg-teal-600 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-teal-700 transition">
            {loading ? 'Actualizando...' : 'Cambiar contraseña'}
          </button>
        </div>
      </div>
    </div>
  )
}
