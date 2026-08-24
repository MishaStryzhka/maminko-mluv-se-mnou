import { neon } from '@neondatabase/serverless';
import { getAdminSession } from './_lib/admin-auth.js';

function getSql() {
    if (!process.env.DATABASE_URL) {
        const error = new Error('DATABASE_URL is not configured');
        error.code = 'DATABASE_NOT_CONFIGURED';
        throw error;
    }
    return neon(process.env.DATABASE_URL);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'DELETE') {
        res.setHeader('Allow', 'DELETE');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        const user = await getAdminSession(req);
        if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
        if (user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });

        const inviteId = String(req.query?.id || '').trim();
        if (!inviteId) return res.status(400).json({ error: 'INVITE_ID_REQUIRED' });

        const sql = getSql();
        const rows = await sql`
            DELETE FROM admin_invites
            WHERE id = ${inviteId} AND accepted_at IS NULL
            RETURNING id
        `;

        if (!rows[0]) return res.status(404).json({ error: 'INVITE_NOT_FOUND' });
        return res.status(200).json({ deleted: true, id: rows[0].id });
    } catch (error) {
        console.error('Admin invite delete failed', error?.code || error?.message);
        if (error?.code === 'DATABASE_NOT_CONFIGURED') return res.status(503).json({ error: error.code });
        return res.status(500).json({ error: 'ADMIN_INVITE_DELETE_FAILED' });
    }
}
