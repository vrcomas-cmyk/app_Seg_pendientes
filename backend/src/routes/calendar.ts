import { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
import { supabase } from '../supabase'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export async function calendarRoutes(app: FastifyInstance) {

  // URL para conectar Google Calendar
  app.get('/auth/google', { preHandler: [app.authenticate] }, async (req, reply) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      prompt: 'consent',
    })
    return reply.send({ url })
  })

  // Callback de Google
  app.get('/auth/google/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }
    const { tokens } = await oauth2Client.getToken(code)

    // Guardar tokens en el usuario
    await supabase.from('users')
      .update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
      })
      .eq('id', state)

    return reply.redirect(`${process.env.FRONTEND_URL}/dashboard?calendar=connected`)
  })

  // Crear evento en Google Calendar
  app.post('/tasks/:id/calendar-event', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id: taskId } = req.params as { id: string }
    const userId = (req.user as any).id

    const [taskRes, userRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase.from('users').select('google_access_token, google_refresh_token').eq('id', userId).single(),
    ])

    if (!taskRes.data) return reply.code(404).send({ error: 'Pendiente no encontrado' })
    if (!userRes.data?.google_access_token) {
      return reply.code(400).send({ error: 'Conecta tu Google Calendar primero', needsAuth: true })
    }

    oauth2Client.setCredentials({
      access_token: userRes.data.google_access_token,
      refresh_token: userRes.data.google_refresh_token,
    })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    const dueDate = new Date(`${taskRes.data.due_date}T09:00:00`)

    const { data: event } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `📌 ${taskRes.data.title}`,
        description: taskRes.data.description ?? '',
        start: { dateTime: dueDate.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: new Date(dueDate.getTime() + 3600000).toISOString(), timeZone: 'America/Mexico_City' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 1440 },
            { method: 'popup', minutes: 60 },
          ],
        },
      },
    })

    await supabase.from('calendar_events').insert({
      task_id: taskId,
      google_event_id: event.id,
      event_date: dueDate.toISOString(),
      created_by: userId,
    })

    return reply.send({ success: true, htmlLink: event.htmlLink })
  })
}
