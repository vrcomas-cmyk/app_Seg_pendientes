import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'

// Cliente con service key — bypasea RLS
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export default async function suggestionsRoutes(app: FastifyInstance) {

  // POST /api/suggestions/import — subida masiva sin RLS
  app.post('/suggestions/import', async (req, reply) => {
    try {
      const { rows, type, userId, clientMap } = req.body as any

      if (!userId) return reply.code(401).send({ error: 'No autorizado' })
      if (!rows || !Array.isArray(rows)) return reply.code(400).send({ error: 'Datos inválidos' })

      const table = type === 'suggestions' ? 'crm_suggestions' : 'crm_consumption'

      // Borrar registros anteriores del usuario
      await supabaseAdmin.from(table).delete().eq('created_by', userId)

      // Insertar en lotes de 500
      const BATCH = 500
      let inserted = 0
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((r: any) => ({
          ...r,
          created_by: userId,
          client_id: clientMap?.[r.solicitante] ?? null,
        }))
        const { error } = await supabaseAdmin.from(table).insert(batch)
        if (error) return reply.code(400).send({ error: error.message })
        inserted += batch.length
      }

      return reply.send({ ok: true, inserted })
    } catch (e: any) {
      return reply.code(500).send({ error: e.message })
    }
  })
}
