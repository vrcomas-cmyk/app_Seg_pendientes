"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachmentRoutes = attachmentRoutes;
const supabase_1 = require("../supabase");
const crypto_1 = require("crypto");
const ALLOWED_TYPES = [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf',
    'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
];
async function attachmentRoutes(app) {
    // Subir archivo
    app.post('/tasks/:taskId/attachments', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { taskId } = req.params;
        const userId = req.user.id;
        const data = await req.file();
        if (!data)
            return reply.code(400).send({ error: 'No se recibió archivo' });
        if (!ALLOWED_TYPES.includes(data.mimetype)) {
            return reply.code(400).send({ error: `Tipo de archivo no permitido: ${data.mimetype}` });
        }
        const buffer = await data.toBuffer();
        if (buffer.length > 25 * 1024 * 1024) {
            return reply.code(400).send({ error: 'El archivo supera el límite de 25MB' });
        }
        const ext = data.filename.split('.').pop();
        const filePath = `${taskId}/${(0, crypto_1.randomUUID)()}.${ext}`;
        const { error: uploadError } = await supabase_1.supabase.storage
            .from('task-files')
            .upload(filePath, buffer, { contentType: data.mimetype });
        if (uploadError)
            return reply.code(500).send({ error: uploadError.message });
        const { data: signed } = await supabase_1.supabase.storage
            .from('task-files')
            .createSignedUrl(filePath, 3600);
        const { data: attachment, error: dbError } = await supabase_1.supabase
            .from('attachments')
            .insert({
            task_id: taskId,
            filename: data.filename,
            file_url: signed?.signedUrl ?? '',
            file_path: filePath,
            file_type: data.mimetype,
            file_size_kb: Math.round(buffer.length / 1024),
            uploaded_by: userId,
        })
            .select().single();
        if (dbError)
            return reply.code(500).send({ error: dbError.message });
        return reply.code(201).send(attachment);
    });
    // Listar archivos de un pendiente
    app.get('/tasks/:taskId/attachments', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { taskId } = req.params;
        const { data } = await supabase_1.supabase
            .from('attachments')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false });
        return reply.send(data ?? []);
    });
    // Obtener URL fresca para descargar
    app.get('/tasks/:taskId/attachments/:attachmentId/url', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { attachmentId } = req.params;
        const { data: att } = await supabase_1.supabase.from('attachments').select().eq('id', attachmentId).single();
        if (!att)
            return reply.code(404).send({ error: 'Archivo no encontrado' });
        const { data: signed } = await supabase_1.supabase.storage
            .from('task-files')
            .createSignedUrl(att.file_path, 3600);
        return reply.send({ url: signed?.signedUrl, filename: att.filename });
    });
    // Eliminar archivo
    app.delete('/tasks/:taskId/attachments/:attachmentId', { preHandler: [app.authenticate] }, async (req, reply) => {
        const { attachmentId } = req.params;
        const { data: att } = await supabase_1.supabase.from('attachments').select().eq('id', attachmentId).single();
        if (att) {
            await supabase_1.supabase.storage.from('task-files').remove([att.file_path]);
            await supabase_1.supabase.from('attachments').delete().eq('id', attachmentId);
        }
        return reply.send({ success: true });
    });
}
