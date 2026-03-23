import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [isRegister, setIsRegister] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    setMsg('')
    if (isRegister) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMsg(error.message)
      else setMsg('Revisa tu correo para confirmar tu cuenta.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Pendientes App</h1>
        <p className="text-gray-400 text-sm mb-8">
          {isRegister ? 'Crea tu cuenta' : 'Inicia sesión para continuar'}
        </p>
        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-3 outline-none focus:border-teal-400"
          placeholder="Correo electrónico"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 outline-none focus:border-teal-400"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        {msg && <p className="text-sm text-red-500 mb-3">{msg}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-teal-700 transition"
        >{loading ? 'Cargando...' : isRegister ? 'Registrarse' : 'Entrar'}</button>
        <button
          onClick={() => setIsRegister(!isRegister)}
          className="w-full mt-3 text-sm text-gray-400 hover:text-gray-600"
        >{isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}</button>
      </div>
    </div>
  )
}