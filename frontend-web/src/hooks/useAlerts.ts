import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Alerts {
  offersStalled: number      // ofertas con items aceptados sin movimiento +3 días
  followupsDue: number       // seguimientos vencidos hoy o antes
  materialsInTransit: number // materiales CEDIS activos
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alerts>({ offersStalled: 0, followupsDue: 0, materialsInTransit: 0 })

  useEffect(() => {
    const load = async () => {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      const today = new Date().toISOString().split('T')[0]

      const [stalled, due, transit] = await Promise.all([
        // Items aceptados sin historial en +3 días
        supabase.from('crm_offer_items')
          .select('id', { count: 'exact', head: true })
          .eq('aceptado', true)
          .not('estatus', 'in', '("facturado","cancelado","rechazado")')
          .lt('updated_at', threeDaysAgo.toISOString()),

        // Seguimientos con fecha vencida
        supabase.from('crm_followups')
          .select('id', { count: 'exact', head: true })
          .not('estatus', 'in', '("completado","cancelado")')
          .lte('fecha_seguimiento', today)
          .not('fecha_seguimiento', 'is', null),

        // Materiales CEDIS activos
        supabase.from('crm_cedis_requests')
          .select('id', { count: 'exact', head: true })
          .in('estatus', ['solicitado','en_transito','recibido_parcial']),
      ])

      setAlerts({
        offersStalled:     stalled.count ?? 0,
        followupsDue:      due.count ?? 0,
        materialsInTransit: transit.count ?? 0,
      })
    }

    load()
    const interval = setInterval(load, 5 * 60 * 1000) // cada 5 min
    return () => clearInterval(interval)
  }, [])

  return alerts
}
