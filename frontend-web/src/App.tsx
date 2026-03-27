import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import TaskListPage from './pages/TaskListPage'
import NewTaskPage from './pages/NewTaskPage'
import TaskDetailPage from './pages/TaskDetailPage'
import ProfilePage from './pages/ProfilePage'
import CrmListPage from './pages/crm/CrmListPage'
import CrmImportPage from './pages/crm/CrmImportPage'
import CrmClientPage from './pages/crm/CrmClientPage'
import CrmFollowupPage from './pages/crm/CrmFollowupPage'
import CrmOrderPage from './pages/crm/CrmOrderPage'
import CrmCedisPage from './pages/crm/CrmCedisPage'
import CrmNewClientPage from './pages/crm/CrmNewClientPage'
import CrmSpecialOrdersPage from './pages/crm/CrmSpecialOrdersPage'
import CrmSuggestionsImportPage from './pages/crm/CrmSuggestionsImportPage'
import CrmOffersListPage from './pages/crm/CrmOffersListPage'
import CrmVentasPage from './pages/crm/CrmVentasPage'
import CrmReportsPage from './pages/crm/CrmReportsPage'
import CrmMaterialsTrackingPage from './pages/crm/CrmMaterialsTrackingPage'
import CrmOfferItemsTrackingPage from './pages/crm/CrmOfferItemsTrackingPage'
import CrmOfferPage from './pages/crm/CrmOfferPage'
import CrmVentaPage from './pages/crm/CrmVentaPage'
import CatalogPage from './pages/CatalogPage'
import AdminPage from './pages/AdminPage'
import MscListPage from './pages/msc/MscListPage'
import MscNewPage from './pages/msc/MscNewPage'
import MscDetailPage from './pages/msc/MscDetailPage'
import MscInventoryPage from './pages/msc/MscInventoryPage'
import Layout from './components/Layout'

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-gray-400 text-sm">Cargando...</div>
    </div>
  )

  if (!session) return <Routes><Route path="*" element={<LoginPage />} /></Routes>

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/tasks" replace />} />
        <Route path="/dashboard" element={<Navigate to="/tasks" replace />} />
        <Route path="/tasks" element={<TaskListPage />} />
        <Route path="/tasks/new" element={<NewTaskPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/crm" element={<CrmListPage />} />
        <Route path="/crm/import" element={<CrmImportPage />} />
        <Route path="/crm/new" element={<CrmNewClientPage />} />
        <Route path="/crm/:id" element={<CrmClientPage />} />
        <Route path="/crm/:clientId/followup/:followupId" element={<CrmFollowupPage />} />
        <Route path="/crm/:clientId/followup/:followupId/order/new" element={<CrmOrderPage />} />
        <Route path="/crm/:clientId/order/:orderId/cedis" element={<CrmCedisPage />} />
        <Route path="/crm/special-orders" element={<CrmSpecialOrdersPage />} />
        <Route path="/crm/suggestions-import" element={<CrmSuggestionsImportPage />} />
        <Route path="/crm/offers" element={<CrmOffersListPage />} />
        <Route path="/crm/ventas" element={<CrmVentasPage />} />
        <Route path="/crm/reports" element={<CrmReportsPage />} />
        <Route path="/crm/materials" element={<CrmMaterialsTrackingPage />} />
        <Route path="/crm/items" element={<CrmOfferItemsTrackingPage />} />
        <Route path="/crm/:clientId/offer/:offerId" element={<CrmOfferPage />} />
        <Route path="/crm/:clientId/venta" element={<CrmVentaPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/msc" element={<MscListPage />} />
        <Route path="/msc/nueva" element={<MscNewPage />} />
        <Route path="/msc/inventario" element={<MscInventoryPage />} />
        <Route path="/msc/:id" element={<MscDetailPage />} />
      </Route>
    </Routes>
  )
}
