import { Outlet, useLocation, Link, useMatch } from 'react-router-dom'
import TaskListSidebar from './TaskListSidebar'

export default function TasksLayout() {
  const location = useLocation()
  const detailMatch = useMatch('/tasks/:id')
  const newMatch = useMatch('/tasks/new')
  const fromEmailMatch = useMatch('/tasks/from-email')

  // "new" y "from-email" son rutas especiales; para el highlight los tratamos como "sin activo"
  const activeId = detailMatch && detailMatch.params.id !== 'new' && detailMatch.params.id !== 'from-email'
    ? detailMatch.params.id ?? null
    : null

  const hasRightPanel = Boolean(detailMatch || newMatch || fromEmailMatch)
  const isIndex = location.pathname === '/tasks' || location.pathname === '/tasks/'

  return (
    <div className="flex flex-col lg:flex-row gap-4 -mt-1">
      {/* Columna izquierda — lista */}
      <aside
        className={`
          ${hasRightPanel ? 'hidden lg:block' : 'block'}
          w-full lg:w-[400px] xl:w-[420px] lg:flex-shrink-0
        `}>
        <TaskListSidebar activeId={activeId} />
      </aside>

      {/* Columna derecha — detalle / nuevo / placeholder */}
      <main
        className={`
          ${hasRightPanel ? 'block' : 'hidden lg:block'}
          flex-1 min-w-0
        `}>
        {isIndex ? (
          <div className="bg-white rounded-xl border border-gray-200 border-dashed flex items-center justify-center h-[60vh]">
            <div className="text-center px-6">
              <p className="text-5xl mb-3">📋</p>
              <p className="text-sm text-gray-500 mb-1">Selecciona un pendiente de la lista</p>
              <p className="text-xs text-gray-400 mb-4">o crea uno nuevo para empezar</p>
              <Link to="/tasks/new"
                className="inline-block bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700">
                + Nuevo pendiente
              </Link>
            </div>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  )
}
