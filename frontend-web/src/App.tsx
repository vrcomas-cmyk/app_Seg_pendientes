import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase'

// Eager: shell + login (siempre se necesitan al arrancar)
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import RouteGuard from './components/RouteGuard'

// Lazy: cada page se descarga solo cuando el usuario entra a esa ruta
const TasksLayout       = lazy(() => import('./pages/TasksLayout'))
const NewTaskPage       = lazy(() => import('./pages/NewTaskPage'))
const TaskDetailPage    = lazy(() => import('./pages/TaskDetailPage'))
const FromEmailPage     = lazy(() => import('./pages/FromEmailPage'))
const ProfilePage       = lazy(() => import('./pages/ProfilePage'))

// CRM
const CrmListPage              = lazy(() => import('./pages/crm/CrmListPage'))
const CrmImportPage            = lazy(() => import('./pages/crm/CrmImportPage'))
const CrmClientPage            = lazy(() => import('./pages/crm/CrmClientPage'))
const CrmFollowupPage          = lazy(() => import('./pages/crm/CrmFollowupPage'))
const CrmOrderPage             = lazy(() => import('./pages/crm/CrmOrderPage'))
const CrmCedisPage             = lazy(() => import('./pages/crm/CrmCedisPage'))
const CrmNewClientPage         = lazy(() => import('./pages/crm/CrmNewClientPage'))
const CrmSpecialOrdersPage     = lazy(() => import('./pages/crm/CrmSpecialOrdersPage'))
const CrmSuggestionsImportPage = lazy(() => import('./pages/crm/CrmSuggestionsImportPage'))
const CrmImportHubPage         = lazy(() => import('./pages/crm/CrmImportHubPage'))
const CrmOffersListPage        = lazy(() => import('./pages/crm/CrmOffersListPage'))
const CrmVentasPage            = lazy(() => import('./pages/crm/CrmVentasPage'))
const CrmReportsPage           = lazy(() => import('./pages/crm/CrmReportsPage'))
const CrmMaterialsTrackingPage = lazy(() => import('./pages/crm/CrmMaterialsTrackingPage'))
const CrmOfferItemsTrackingPage = lazy(() => import('./pages/crm/CrmOfferItemsTrackingPage'))
const CrmOfferPage             = lazy(() => import('./pages/crm/CrmOfferPage'))
const CrmVentaPage             = lazy(() => import('./pages/crm/CrmVentaPage'))
const CrmProspectosPage        = lazy(() => import('./pages/crm/CrmProspectosPage'))
const CrmCedisSeguimientoPage  = lazy(() => import('./pages/crm/CrmCedisSeguimientoPage'))
const CrmVentaManualPage       = lazy(() => import('./pages/crm/CrmVentaManualPage'))
const CrmVentaExcelPage        = lazy(() => import('./pages/crm/CrmVentaExcelPage'))
const CrmPipelinePage          = lazy(() => import('./pages/crm/CrmPipelinePage'))
const CrmHubPage               = lazy(() => import('./pages/crm/CrmHubPage'))

// MSC
const MscListPage         = lazy(() => import('./pages/msc/MscListPage'))
const MscNewPage          = lazy(() => import('./pages/msc/MscNewPage'))
const MscDetailPage       = lazy(() => import('./pages/msc/MscDetailPage'))
const MscInventoryPage    = lazy(() => import('./pages/msc/MscInventoryPage'))
const MscEntradaManualPage = lazy(() => import('./pages/msc/MscEntradaManualPage'))

// Otros
const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const AdminPage   = lazy(() => import('./pages/AdminPage'))

// Fallback visual mientras se descarga el chunk de la ruta
function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') { setSession(null); return }
      if (s) setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  if (!session) return <Routes><Route path="*" element={<LoginPage />} /></Routes>

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/dashboard" element={<Navigate to="/tasks" replace />} />

          {/* /tasks con split view: lista izquierda + detalle derecha */}
          <Route path="/tasks" element={<TasksLayout />}>
            <Route index element={null /* placeholder lo renderiza TasksLayout */} />
            <Route path="from-email" element={<FromEmailPage />} />
            <Route path="new" element={<NewTaskPage />} />
            <Route path=":id" element={<TaskDetailPage />} />
          </Route>

          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/crm" element={<RouteGuard module="crm"><CrmListPage /></RouteGuard>} />
          <Route path="/crm/import" element={<CrmImportPage />} />
          <Route path="/crm/new" element={<CrmNewClientPage />} />
          <Route path="/crm/pipeline" element={<RouteGuard module="crm"><CrmPipelinePage /></RouteGuard>} />
          <Route path="/crm/hub" element={<RouteGuard module="crm"><CrmHubPage /></RouteGuard>} />
          <Route path="/crm/prospectos" element={<RouteGuard module="crm"><CrmProspectosPage /></RouteGuard>} />
          <Route path="/crm/cedis-seguimiento" element={<RouteGuard module="crm"><CrmCedisSeguimientoPage /></RouteGuard>} />
          <Route path="/cedis" element={<RouteGuard module="cedis"><CrmCedisSeguimientoPage /></RouteGuard>} />
          <Route path="/crm/:id" element={<CrmClientPage />} />
          <Route path="/crm/:clientId/followup/:followupId" element={<CrmFollowupPage />} />
          <Route path="/crm/:clientId/followup/:followupId/order/new" element={<CrmOrderPage />} />
          <Route path="/crm/:clientId/order/:orderId/cedis" element={<CrmCedisPage />} />
          <Route path="/crm/special-orders" element={<CrmSpecialOrdersPage />} />
          <Route path="/crm/suggestions-import" element={<CrmSuggestionsImportPage />} />
          <Route path="/crm/imports" element={<RouteGuard module="crm"><CrmImportHubPage /></RouteGuard>} />
          <Route path="/crm/offers" element={<CrmOffersListPage />} />
          <Route path="/crm/ventas" element={<CrmVentasPage />} />
          <Route path="/crm/venta-manual" element={<RouteGuard module="crm"><CrmVentaManualPage /></RouteGuard>} />
          <Route path="/crm/venta-excel" element={<RouteGuard module="crm"><CrmVentaExcelPage /></RouteGuard>} />
          <Route path="/crm/reports" element={<CrmReportsPage />} />
          <Route path="/crm/materials" element={<CrmMaterialsTrackingPage />} />
          <Route path="/crm/items" element={<CrmOfferItemsTrackingPage />} />
          <Route path="/crm/:clientId/offer/:offerId" element={<CrmOfferPage />} />
          <Route path="/crm/:clientId/venta" element={<CrmVentaPage />} />
          <Route path="/catalog" element={<RouteGuard module="catalogo"><CatalogPage /></RouteGuard>} />
          <Route path="/admin" element={<RouteGuard module="admin"><AdminPage /></RouteGuard>} />
          <Route path="/msc" element={<RouteGuard module="msc"><MscListPage /></RouteGuard>} />
          <Route path="/msc/nueva" element={<MscNewPage />} />
          <Route path="/msc/entrada-manual" element={<MscEntradaManualPage />} />
          <Route path="/msc/inventario" element={<MscInventoryPage />} />
          <Route path="/msc/:id" element={<MscDetailPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
