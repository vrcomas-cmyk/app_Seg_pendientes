"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyRoutes = historyRoutes;
const zod_1 = require("zod");
const supabase_1 = require("../supabase");
const AddHistorySchema = zod_1.z.object({
    comment: zod_1.z.string().min(1),
    reviewed_with: zod_1.z.string().optional(),
});
async function historyRoutes(app) {
    app.get('/tasks/:id/history', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const { data } = await supabase_1.supabase
            .from('task_history')
            .select('*, users:created_by(full_name, email)')
            .eq('task_id', id)
            .order('created_at', { ascending: true });
        return reply.send(data ?? []);
    });
    app.post('/tasks/:id/history', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { id } = req.params;
        const body = AddHistorySchema.parse(req.body);
        const userId = req.user.id;
        const { data, error } = await supabase_1.supabase
            .from('task_history')
            .insert({ task_id: id, ...body, created_by: userId })
            .select('*, users:created_by(full_name)').single();
        if (error)
            return reply.code(500).send({ error: error.message });
        return reply.code(201).send(data);
    });
}
