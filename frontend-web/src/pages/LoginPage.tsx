import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'login' | 'register' | 'recover'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setMsg(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg({ text: error.message, type: 'error' })

    } else if (mode === 'register') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMsg({ text: error.message, type: 'error' })
      else setMsg({ text: 'Revisa tu correo para confirmar tu cuenta.', type: 'success' })

    } else if (mode === 'recover') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/profile`,
      })
      if (error) setMsg({ text: error.message, type: 'error' })
      else setMsg({ text: 'Te enviamos un correo con el link de recuperación. Revisa tu bandeja.', type: 'success' })
    }

    setLoading(false)
  }

  const titles: Record<Mode, string> = {
    login: 'Inicia sesión',
    register: 'Crea tu cuenta',
    recover: 'Recuperar contraseña',
  }

  const buttonLabels: Record<Mode, string> = {
    login: 'Entrar',
    register: 'Registrarse',
    recover: 'Enviar correo de recuperación',
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Pendientes App</h1>
        <p className="text-gray-400 text-sm mb-8">{titles[mode]}</p>

        <input
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-3 outline-none focus:border-teal-400"
          placeholder="Correo electrónico"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)} />

        {mode !== 'recover' && (
          <input
            type="password"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 outline-none focus:border-teal-400"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        )}

        {msg && (
          <p className={`text-sm mb-3 ${msg.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
            {msg.text}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-teal-700 transition">
          {loading ? 'Cargando...' : buttonLabels[mode]}
        </button>

        <div className="mt-4 flex flex-col gap-2">
          {mode === 'login' && (
            <>
              <button onClick={() => { setMode('recover'); setMsg(null) }}
                className="text-sm text-gray-400 hover:text-teal-600 transition">
                ¿Olvidaste tu contraseña?
              </button>
              <button onClick={() => { setMode('register'); setMsg(null) }}
                className="text-sm text-gray-400 hover:text-gray-600 transition">
                ¿No tienes cuenta? Regístrate
              </button>
            </>
          )}
          {mode === 'register' && (
            <button onClick={() => { setMode('login'); setMsg(null) }}
              className="text-sm text-gray-400 hover:text-gray-600 transition">
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          )}
          {mode === 'recover' && (
            <button onClick={() => { setMode('login'); setMsg(null) }}
              className="text-sm text-gray-400 hover:text-gray-600 transition">
              ← Volver al inicio de sesión
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
