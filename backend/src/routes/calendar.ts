import { FastifyInstance } from 'fastify'
import { google } from 'googleapis'
import { supabase } from '../supabase'

const TIMEZONE = 'America/Mexico_City'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

async function getCalendarClient(userId: string) {
  const { data: user } = await supabase.from('users')
    .select('google_access_token, google_refresh_token')
    .eq('id', userId).single()
  if (!user?.google_access_token) return null
  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
  })
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

// Suma una hora a un string HH:MM
function addOneHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const newH = (h + 1) % 24
  return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

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

  // Crear evento
  app.post('/api/tasks/:taskId/calendar-event', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    const userId = (req.user as any).id
    const { eventDate, eventTime } = req.body as { eventDate: string; eventTime: string }

    const { data: tasks } = await supabase.from('tasks').select('*').eq('id', taskId)
    if (!tasks || tasks.length === 0)
      return reply.code(404).send({ error: 'Pendiente no encontrado' })
    const task = tasks[0]

    const calendar = await getCalendarClient(userId)
    if (!calendar)
      return reply.code(400).send({ error: 'Conecta tu Google Calendar primero', needsAuth: true })

    // Pasar fecha/hora como string local — Google Calendar interpreta con el timezone dado
    const startDateTime = `${eventDate}T${eventTime}:00`
    const endDateTime = `${eventDate}T${addOneHour(eventTime)}:00`

    const { data: event } = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `📌 ${task.title}`,
        description: task.description ?? '',
        start: { dateTime: startDateTime, timeZone: TIMEZONE },
        end: { dateTime: endDateTime, timeZone: TIMEZONE },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 1440 },
            { method: 'popup', minutes: 60 },
          ],
        },
      },
    })

    // Guardar en DB como UTC para referencia
    const startUTC = new Date(`${eventDate}T${eventTime}:00-06:00`).toISOString()

    await supabase.from('calendar_events').insert({
      task_id: taskId,
      google_event_id: event.id,
      event_date: startUTC,
      created_by: userId,
      is_active: true,
    })

    return reply.send({ success: true, htmlLink: event.htmlLink })
  })

  // Reagendar evento
  app.put('/api/tasks/:taskId/calendar-event', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    const userId = (req.user as any).id
    const { eventDate, eventTime } = req.body as { eventDate: string; eventTime: string }

    const { data: calEvent } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('task_id', taskId)
      .eq('is_active', true)
      .single()

    if (!calEvent)
      return reply.code(404).send({ error: 'No hay evento activo para este pendiente' })

    const calendar = await getCalendarClient(userId)
    if (!calendar)
      return reply.code(400).send({ error: 'No autorizado con Google Calendar' })

    const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single()

    const startDateTime = `${eventDate}T${eventTime}:00`
    const endDateTime = `${eventDate}T${addOneHour(eventTime)}:00`

    try {
      await calendar.events.update({
        calendarId: 'primary',
        eventId: calEvent.google_event_id,
        requestBody: {
          summary: `📌 ${task?.title}`,
          description: task?.description ?? '',
          start: { dateTime: startDateTime, timeZone: TIMEZONE },
          end: { dateTime: endDateTime, timeZone: TIMEZONE },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 1440 },
              { method: 'popup', minutes: 60 },
            ],
          },
        },
      })
    } catch (err: any) {
      console.error('Error reagendando:', err?.message)
      return reply.code(500).send({ error: 'Error al reagendar: ' + err?.message })
    }

    const startUTC = new Date(`${eventDate}T${eventTime}:00-06:00`).toISOString()
    await supabase.from('calendar_events')
      .update({ event_date: startUTC })
      .eq('id', calEvent.id)

    return reply.send({ success: true })
  })

  // Cancelar evento
  app.delete('/api/tasks/:taskId/calendar-event', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { taskId } = req.params as { taskId: string }
    const userId = (req.user as any).id

    const { data: calEvent } = await supabase.from('calendar_events')
      .select('*').eq('task_id', taskId).eq('is_active', true).single()

    if (!calEvent) return reply.code(404).send({ error: 'No hay evento activo' })

    const calendar = await getCalendarClient(userId)
    if (calendar) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: calEvent.google_event_id,
        })
      } catch (e: any) {
        console.error('Error eliminando evento:', e?.message)
      }
    }

    await supabase.from('calendar_events')
      .update({ is_active: false })
      .eq('id', calEvent.id)

    return reply.send({ success: true })
  })
}
