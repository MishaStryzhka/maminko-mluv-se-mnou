import { createAdminInvite, getAdminSession, listAdminUsers, setAdminUserActive } from './_lib/admin-auth.js';

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

function mapUser(row) {
    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        active: row.active,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
    };
}

function mapInvite(row) {
    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
    };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        const user = await getAdminSession(req);
        if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
        if (user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });

        if (req.method === 'GET') {
            const result = await listAdminUsers(user);
            return res.status(200).json({
                users: result.users.map(mapUser),
                invites: result.invites.map(mapInvite),
            });
        }

        if (req.method === 'POST') {
            let body;
            try {
                body = jsonBody(req);
            } catch {
                return res.status(400).json({ error: 'INVALID_JSON' });
            }

            if (body.action === 'invite') {
                const invite = await createAdminInvite(user, body, origin(req));
                return res.status(201).json({ invite });
            }

            if (body.action === 'setActive') {
                const updated = await setAdminUserActive(user, body.userId, Boolean(body.active));
                return res.status(200).json({ user: mapUser(updated) });
            }

            return res.status(400).json({ error: 'INVALID_ACTION' });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    } catch (error) {
        console.error('Admin users failed', error?.code || error?.message);
        if (error?.code === 'DATABASE_NOT_CONFIGURED') return res.status(503).json({ error: error.code });
        if (error?.code === 'FORBIDDEN') return res.status(403).json({ error: error.code });
        const conflicts = new Set(['USER_EXISTS', 'CANNOT_DEACTIVATE_SELF', 'LAST_ADMIN']);
        if (conflicts.has(error?.code)) return res.status(409).json({ error: error.code });
        const badRequest = new Set(['EMAIL_INVALID', 'NAME_REQUIRED', 'ROLE_INVALID', 'USER_NOT_FOUND']);
        if (badRequest.has(error?.code)) return res.status(400).json({ error: error.code });
        return res.status(500).json({ error: 'ADMIN_USERS_FAILED' });
    }
}
