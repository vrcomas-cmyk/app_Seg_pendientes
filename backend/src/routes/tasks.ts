import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supabase } from '../supabase'
import { suggestDueDate } from '../utils/dueDateHelper'

const CreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  priority: z.enum(['alta', 'media', 'baja']),
  requested_by: z.string().min(1),
  due_date: z.string().optional(),
})

const UpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().optional(),
  priority: z.enum(['alta', 'media', 'baja']).optional(),
  requested_by: z.string().optional(),
  due_date: z.string().optional(),
})

export async function taskRoutes(app: FastifyInstance) {

  app.get('/tasks', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { status, priority, search, requested_by } = req.query as Record<string, string>
    let query = supabase.from('tasks').select('*').order('due_date', { ascending: true })
    if (status)       query = query.eq('status', status)
    if (priority)     query = query.eq('priority', priority)
    if (requested_by) query = query.ilike('requested_by', `%${requested_by}%`)
    if (search)       query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
    const { data, error } = await query
    if (error) return reply.code(500).send({ error: error.message })
    return reply.send(data)
  })

  app.get('/tasks/dashboard', { preHandler: [app.authenticate] }, async (_, reply) => {
    const today = new Date().toISOString().split('T')[0]
    const [active, completed, overdue] = await Promise.all([
      supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'reactivado']),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completado'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'reactivado']).lt('due_date', today),
    ])
    return reply.send({
      active: active.count ?? 0,
      completed: completed.count ?? 0,
      overdue: overdue.count ?? 0,
    })
  })

  app.get('/tasks/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_history(*, users:created_by(full_name, email)), attachments(*), calendar_events(*)')
      .eq('id', id).single()
    if (error || !data) return reply.code(404).send({ error: 'No encontrado' })
    return reply.send(data)
  })

  app.post('/tasks', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = CreateSchema.parse(req.body)
    const userId = (req.user as any).id
    const dueDate = body.due_date ?? suggestDueDate(body.priority)
    const { data, error } = await supabase.from('tasks')
      .insert({ ...body, due_date: dueDate, created_by: userId })
      .select().single()
    if (error) return reply.code(500).send({ error: error.message })
    return reply.code(201).send(data)
  })

  app.put('/tasks/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = UpdateSchema.parse(req.body)
    const { data, error } = await supabase.from('tasks').update(body).eq('id', id).select().single()
    if (error) return reply.code(500).send({ error: error.message })
    return reply.send(data)
  })

  app.patch('/tasks/:id/complete', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = (req.user as any).id
    await supabase.from('tasks').update({ status: 'completado' }).eq('id', id)
    await supabase.from('task_history').insert({ task_id: id, comment: 'Pendiente marcado como completado.', created_by: userId })
    return reply.send({ success: true })
  })

  app.patch('/tasks/:id/reactivate', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const userId = (req.user as any).id
    await supabase.from('tasks').update({ status: 'reactivado' }).eq('id', id)
    await supabase.from('task_history').insert({ task_id: id, comment: 'Pendiente reactivado.', created_by: userId })
    return reply.send({ success: true })
  })
}
