import { FastifyInstance } from 'fastify'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export default async function adminRoutes(app: FastifyInstance) {
  app.get('/admin/users', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth) return reply.code(401).send({ error: 'No auth' })
    const token = auth.replace('Bearer ', '')
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return reply.code(401).send({ error: 'Invalid token' })

    // Verificar que es admin
    const { data: role } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', user.id).single()
    if (role?.role !== 'admin') return reply.code(403).send({ error: 'Not admin' })

    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers()
    if (usersError) return reply.code(500).send({ error: usersError.message })
    return reply.send(users.map(u => ({
      id: u.id, email: u.email, last_sign_in_at: u.last_sign_in_at, created_at: u.created_at,
    })))
  })
}
