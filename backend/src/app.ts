import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { taskRoutes } from './routes/tasks'
import { historyRoutes } from './routes/history'
import { calendarRoutes } from './routes/calendar'

const app = Fastify({ logger: true })

const supabaseAuth = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function main() {
  await app.register(cors, {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.FRONTEND_URL!
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 }
  })

  await app.register(rateLimit, {
    max: 100, timeWindow: '1 minute'
  })

  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      const authHeader = request.headers.authorization
      if (!authHeader) return reply.code(401).send({ error: 'No autorizado' })
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error } = await supabaseAuth.auth.getUser(token)
      if (error || !user) return reply.code(401).send({ error: 'No autorizado' })
      request.user = { id: user.id, email: user.email }
    } catch {
      reply.code(401).send({ error: 'No autorizado' })
    }
  })

  app.get('/', async () => ({ status: 'ok', version: '1.0.0' }))

  await app.register(taskRoutes, { prefix: '/api' })
  await app.register(historyRoutes, { prefix: '/api' })
  await app.register(calendarRoutes, { prefix: '' })

  try {
    await app.listen({ port: 3001, host: '0.0.0.0' })
    console.log('✅ Backend corriendo en http://localhost:3001')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
