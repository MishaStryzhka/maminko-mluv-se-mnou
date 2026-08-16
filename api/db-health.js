import { ensureSchema } from './_lib/db.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    res.setHeader('Cache-Control', 'no-store');

    if (!process.env.DATABASE_URL) {
        return res.status(503).json({
            ok: false,
            databaseReady: false,
            schemaReady: false,
            error: 'DATABASE_NOT_CONFIGURED',
        });
    }

    try {
        await ensureSchema();
        return res.status(200).json({
            ok: true,
            databaseReady: true,
            schemaReady: true,
        });
    } catch (error) {
        console.error('Database health check failed', error);
        return res.status(500).json({
            ok: false,
            databaseReady: true,
            schemaReady: false,
            error: 'DATABASE_CONNECTION_FAILED',
        });
    }
}
