import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supabase } from '../supabase'

const AddHistorySchema = z.object({
  comment: z.string().min(1),
  reviewed_with: z.string().optional(),
})

export async function historyRoutes(app: FastifyInstance) {

  app.get('/tasks/:id/history', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { data } = await supabase
      .from('task_history')
      .select('*, users:created_by(full_name, email)')
      .eq('task_id', id)
      .order('created_at', { ascending: true })
    return reply.send(data ?? [])
  })

  app.post('/tasks/:id/history', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = AddHistorySchema.parse(req.body)
    const userId = (req.user as any).id
    const { data, error } = await supabase
      .from('task_history')
      .insert({ task_id: id, ...body, created_by: userId })
      .select('*, users:created_by(full_name)').single()
    if (error) return reply.code(500).send({ error: error.message })
    return reply.code(201).send(data)
  })
}
