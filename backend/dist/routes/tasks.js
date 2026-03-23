"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskRoutes = taskRoutes;
const zod_1 = require("zod");
const supabase_1 = require("../supabase");
const dueDateHelper_1 = require("../utils/dueDateHelper");
const CreateSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(200),
    description: zod_1.z.string().optional(),
    priority: zod_1.z.enum(['alta', 'media', 'baja']),
    requested_by: zod_1.z.string().min(1),
    due_date: zod_1.z.string().optional(),
});
const UpdateSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(200).optional(),
    description: zod_1.z.string().optional(),
    priority: zod_1.z.enum(['alta', 'media', 'baja']).optional(),
    requested_by: zod_1.z.string().optional(),
    due_date: zod_1.z.string().optional(),
});
async function taskRoutes(app) {
    app.get('/tasks', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { status, priority, search, requested_by } = req.query;
        let query = supabase_1.supabase.from('tasks').select('*').order('due_date', { ascending: true });
        if (status)
            query = query.eq('status', status);
        if (priority)
            query = query.eq('priority', priority);
        if (requested_by)
            query = query.ilike('requested_by', `%${requested_by}%`);
        if (search)
            query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
        const { data, error } = await query;
        if (error)
            return reply.code(500).send({ error: error.message });
        return reply.send(data);
    });
    app.get('/tasks/dashboard', { preHandler: [app.authenticate] }, async (_, reply) => {
        const today = new Date().toISOString().split('T')[0];
        const [active, completed, overdue] = await Promise.all([
            supabase_1.supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'reactivado']),
            supabase_1.supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completado'),
            supabase_1.supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['pendiente', 'reactivado']).lt('due_date', today),
        ]);
        return reply.send({
            active: active.count ?? 0,
            completed: completed.count ?? 0,
            overdue: overdue.count ?? 0,
        });
    });
    app.get('/tasks/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { data, error } = await supabase_1.supabase
            .from('tasks')
            .select('*, task_history(*, users:created_by(full_name, email)), attachments(*), calendar_events(*)')
            .eq('id', id).single();
        if (error || !data)
            return reply.code(404).send({ error: 'No encontrado' });
        return reply.send(data);
    });
    app.post('/tasks', { preHandler: [app.authenticate] }, async (req, reply) => {
        const body = CreateSchema.parse(req.body);
        const userId = req.user.id;
        const dueDate = body.due_date ?? (0, dueDateHelper_1.suggestDueDate)(body.priority);
        const { data, error } = await supabase_1.supabase.from('tasks')
            .insert({ ...body, due_date: dueDate, created_by: userId })
            .select().single();
        if (error)
            return reply.code(500).send({ error: error.message });
        return reply.code(201).send(data);
    });
    app.put('/tasks/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const body = UpdateSchema.parse(req.body);
        const { data, error } = await supabase_1.supabase.from('tasks').update(body).eq('id', id).select().single();
        if (error)
            return reply.code(500).send({ error: error.message });
        return reply.send(data);
    });
    app.patch('/tasks/:id/complete', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const userId = req.user.id;
        await supabase_1.supabase.from('tasks').update({ status: 'completado' }).eq('id', id);
        await supabase_1.supabase.from('task_history').insert({ task_id: id, comment: 'Pendiente marcado como completado.', created_by: userId });
        return reply.send({ success: true });
    });
    app.patch('/tasks/:id/reactivate', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const userId = req.user.id;
        await supabase_1.supabase.from('tasks').update({ status: 'reactivado' }).eq('id', id);
        await supabase_1.supabase.from('task_history').insert({ task_id: id, comment: 'Pendiente reactivado.', created_by: userId });
        return reply.send({ success: true });
    });
}
