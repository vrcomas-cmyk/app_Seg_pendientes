import { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
import { supabase } from '../supabase'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export async function calendarRoutes(app: FastifyInstance) {

  app.get('/api/auth/google', { preHandler: [app.authenticate] }, async (req, reply) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      prompt: 'consent',
    })
    return reply.send({ url })
  })

  app.get('/auth/google/callback', async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }
    try {
      const { tokens } = await oauth2Client.getToken(code)
      await supabase.from('users')
        .update({
          google_access_token: tokens.access_token,
          google_refresh_token: tokens.refresh_token,
        })
        .eq('id', state)
      return reply.redirect(`${process.env.FRONTEND_URL}/dashboard?calendar=connected`)
    } catch (err) {
      console.error('Calendar callback error:', err)
      return reply.redirect(`${process.env.FRONTEND_URL}/dashboard?calendar=error`)
    }
  })

  app.post('/api/tasks/:id/calendar-event', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id: taskId } = req.params as { id: string }
    const userId = (req.user as any).id
    const { eventDate, eventTime } = req.body as { eventDate: string; eventTime: string }

    const taskRes = await supabase.from('tasks').select('*').eq('id', taskId)
    if (!taskRes.data || taskRes.data.length === 0) {
      return reply.code(404).send({ error: 'Pendiente no encontrado' })
    }
    const task = taskRes.data[0]

    const userRes = await supabase.from('users')
      .select('google_access_token, google_refresh_token')
      .eq('id', userId).single()

    if (!userRes.data?.google_access_token) {
      return reply.code(400).send({ error: 'Conecta tu Google Calendar primero', needsAuth: true })
    }

    oauth2Client.setCredentials({
      access_token: userRes.data.google_access_token,
      refresh_token: userRes.data.google_refresh_token,
    })

    // Usar fecha y hora elegidas por el usuario
    const dateTimeStr = `${eventDate}T${eventTime}:00`
    const startDate = new Date(dateTimeStr)
    const endDate = new Date(startDate.getTime() + 3600000) // +1 hora

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const { data: event } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `📌 ${task.title}`,
        description: task.description ?? '',
        start: { dateTime: startDate.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: endDate.toISOString(), timeZone: 'America/Mexico_City' },
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
      event_date: startDate.toISOString(),
      created_by: userId,
    })

    return reply.send({ success: true, htmlLink: event.htmlLink })
  })
}
