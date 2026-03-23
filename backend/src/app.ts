import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import 'dotenv/config'
import { taskRoutes } from './routes/tasks'
import { historyRoutes } from './routes/history'

const app = Fastify({ logger: true })

async function main() {
  await app.register(cors, {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      process.env.FRONTEND_URL!
    ],
    credentials: true,
  })

  await app.register(jwt, { secret: process.env.JWT_SECRET! })

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 }
  })

  await app.register(rateLimit, {
    max: 100, timeWindow: '1 minute'
  })

  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'No autorizado' })
    }
  })

  app.get('/', async () => ({ status: 'ok', version: '1.0.0' }))

  await app.register(taskRoutes, { prefix: '/api' })
  await app.register(historyRoutes, { prefix: '/api' })

  try {
    await app.listen({ port: 3001, host: '0.0.0.0' })
    console.log('✅ Backend corriendo en http://localhost:3001')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()
