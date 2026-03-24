"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calendarRoutes = calendarRoutes;
const googleapis_1 = require("googleapis");
const supabase_1 = require("../supabase");
const oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
async function getCalendarClient(userId) {
    const { data: user } = await supabase_1.supabase.from('users')
        .select('google_access_token, google_refresh_token')
        .eq('id', userId).single();
    if (!user?.google_access_token)
        return null;
    oauth2Client.setCredentials({
        access_token: user.google_access_token,
        refresh_token: user.google_refresh_token,
    });
    return googleapis_1.google.calendar({ version: 'v3', auth: oauth2Client });
}
async function calendarRoutes(app) {
    app.get('/api/auth/google', { preHandler: [app.authenticate] }, async (req, reply) => {
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar.events'],
            prompt: 'consent',
        });
        return reply.send({ url });
    });
    app.get('/auth/google/callback', async (req, reply) => {
        const { code, state } = req.query;
        try {
            const { tokens } = await oauth2Client.getToken(code);
            await supabase_1.supabase.from('users')
                .update({
                google_access_token: tokens.access_token,
                google_refresh_token: tokens.refresh_token,
            })
                .eq('id', state);
            return reply.redirect(`${process.env.FRONTEND_URL}/dashboard?calendar=connected`);
        }
        catch (err) {
            console.error('Calendar callback error:', err);
            return reply.redirect(`${process.env.FRONTEND_URL}/dashboard?calendar=error`);
        }
    });
    // Crear evento
    app.post('/api/tasks/:id/calendar-event', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id: taskId } = req.params;
        const userId = req.user.id;
        const { eventDate, eventTime } = req.body;
        const taskRes = await supabase_1.supabase.from('tasks').select('*').eq('id', taskId);
        if (!taskRes.data || taskRes.data.length === 0)
            return reply.code(404).send({ error: 'Pendiente no encontrado' });
        const task = taskRes.data[0];
        const calendar = await getCalendarClient(userId);
        if (!calendar)
            return reply.code(400).send({ error: 'Conecta tu Google Calendar primero', needsAuth: true });
        const startDate = new Date(`${eventDate}T${eventTime}:00`);
        const endDate = new Date(startDate.getTime() + 3600000);
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
        });
        await supabase_1.supabase.from('calendar_events').insert({
            task_id: taskId,
            google_event_id: event.id,
            event_date: startDate.toISOString(),
            created_by: userId,
            is_active: true,
        });
        return reply.send({ success: true, htmlLink: event.htmlLink });
    });
    // Reagendar evento
    app.put('/api/tasks/:id/calendar-event', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id: taskId } = req.params;
        const userId = req.user.id;
        const { eventDate, eventTime } = req.body;
        const { data: calEvent } = await supabase_1.supabase.from('calendar_events')
            .select('*').eq('task_id', taskId).eq('is_active', true).single();
        if (!calEvent)
            return reply.code(404).send({ error: 'No hay evento de calendario para este pendiente' });
        const calendar = await getCalendarClient(userId);
        if (!calendar)
            return reply.code(400).send({ error: 'No autorizado con Google Calendar' });
        const { data: task } = await supabase_1.supabase.from('tasks').select('*').eq('id', taskId).single();
        const startDate = new Date(`${eventDate}T${eventTime}:00`);
        const endDate = new Date(startDate.getTime() + 3600000);
        await calendar.events.update({
            calendarId: 'primary',
            eventId: calEvent.google_event_id,
            requestBody: {
                summary: `📌 ${task?.title}`,
                description: task?.description ?? '',
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
        });
        await supabase_1.supabase.from('calendar_events')
            .update({ event_date: startDate.toISOString() })
            .eq('id', calEvent.id);
        return reply.send({ success: true });
    });
    // Cancelar evento
    app.delete('/api/tasks/:id/calendar-event', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id: taskId } = req.params;
        const userId = req.user.id;
        const { data: calEvent } = await supabase_1.supabase.from('calendar_events')
            .select('*').eq('task_id', taskId).eq('is_active', true).single();
        if (!calEvent)
            return reply.code(404).send({ error: 'No hay evento activo' });
        const calendar = await getCalendarClient(userId);
        if (calendar) {
            try {
                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: calEvent.google_event_id,
                });
            }
            catch (e) {
                console.error('Error eliminando evento de Google:', e);
            }
        }
        await supabase_1.supabase.from('calendar_events')
            .update({ is_active: false })
            .eq('id', calEvent.id);
        return reply.send({ success: true });
    });
}
