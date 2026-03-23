"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const tasks_1 = require("./routes/tasks");
const history_1 = require("./routes/history");
const calendar_1 = require("./routes/calendar");
const app = (0, fastify_1.default)({ logger: true });
const supabaseAuth = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
async function main() {
    await app.register(cors_1.default, {
        origin: [
            'http://localhost:5173',
            'http://localhost:3000',
            process.env.FRONTEND_URL
        ],
        credentials: true,
    });
    await app.register(multipart_1.default, {
        limits: { fileSize: 25 * 1024 * 1024 }
    });
    await app.register(rate_limit_1.default, {
        max: 100, timeWindow: '1 minute'
    });
    app.decorate('authenticate', async (request, reply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader)
                return reply.code(401).send({ error: 'No autorizado' });
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
            if (error || !user)
                return reply.code(401).send({ error: 'No autorizado' });
            request.user = { id: user.id, email: user.email };
        }
        catch {
            reply.code(401).send({ error: 'No autorizado' });
        }
    });
    app.get('/', async () => ({ status: 'ok', version: '1.0.0' }));
    await app.register(tasks_1.taskRoutes, { prefix: '/api' });
    await app.register(history_1.historyRoutes, { prefix: '/api' });
    await app.register(calendar_1.calendarRoutes, { prefix: '' });
    try {
        await app.listen({ port: 3001, host: '0.0.0.0' });
        console.log('✅ Backend corriendo en http://localhost:3001');
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
main();
