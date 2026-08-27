import crypto from 'node:crypto';
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

function digest(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function jsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return {};
}

function origin(req) {
    const proto = String(req.headers['x-forwarded-proto'] || 'https').slice(0, 10);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').slice(0, 250);
    return `${proto}://${host}`;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (!['POST', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', 'POST, DELETE');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        const user = await getAdminSession(req);
        if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
        if (user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });

        const sql = getSql();

        if (req.method === 'DELETE') {
            const inviteId = String(req.query?.id || '').trim();
            if (!inviteId) return res.status(400).json({ error: 'INVITE_ID_REQUIRED' });

            const rows = await sql`
                DELETE FROM admin_invites
                WHERE id = ${inviteId} AND accepted_at IS NULL
                RETURNING id
            `;

            if (!rows[0]) return res.status(404).json({ error: 'INVITE_NOT_FOUND' });
            return res.status(200).json({ deleted: true, id: rows[0].id });
        }

        let body;
        try {
            body = jsonBody(req);
        } catch {
            return res.status(400).json({ error: 'INVALID_JSON' });
        }

        if (body.action !== 'regenerate') return res.status(400).json({ error: 'INVALID_ACTION' });
        const inviteId = String(body.id || '').trim();
        if (!inviteId) return res.status(400).json({ error: 'INVITE_ID_REQUIRED' });

        const current = await sql`
            SELECT id, email, display_name, role
            FROM admin_invites
            WHERE id = ${inviteId} AND accepted_at IS NULL
            LIMIT 1
        `;
        if (!current[0]) return res.status(404).json({ error: 'INVITE_NOT_FOUND' });

        const token = crypto.randomBytes(32).toString('base64url');
        const rows = await sql`
            UPDATE admin_invites
            SET token_hash = ${digest(token)}, created_at = now(), expires_at = now() + interval '48 hours'
            WHERE id = ${inviteId} AND accepted_at IS NULL
            RETURNING id, email, display_name, role, expires_at
        `;
        const invite = rows[0];
        if (!invite) return res.status(404).json({ error: 'INVITE_NOT_FOUND' });

        return res.status(200).json({
            invite: {
                id: invite.id,
                email: invite.email,
                displayName: invite.display_name,
                role: invite.role,
                expiresAt: invite.expires_at,
                expiresInHours: 48,
                inviteUrl: `${origin(req).replace(/\/$/, '')}/admin-invite.html?token=${encodeURIComponent(token)}`,
            },
        });
    } catch (error) {
        console.error('Admin invite operation failed', error?.code || error?.message);
        if (error?.code === 'DATABASE_NOT_CONFIGURED') return res.status(503).json({ error: error.code });
        return res.status(500).json({ error: 'ADMIN_INVITE_OPERATION_FAILED' });
    }
}
