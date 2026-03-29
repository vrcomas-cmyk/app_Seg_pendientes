import { Navigate } from 'react-router-dom'
import { useRole } from '../hooks/useRole'

interface Props {
  module: string
  children: React.ReactNode
}

export default function RouteGuard({ module, children }: Props) {
  const { hasModule, loading } = useRole()
  if (loading) return <div className="text-sm text-gray-400 p-6">Cargando...</div>
  if (!hasModule(module)) return <Navigate to="/tasks" replace />
  return <>{children}</>
}
