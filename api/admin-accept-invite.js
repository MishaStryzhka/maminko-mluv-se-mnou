import { acceptAdminInvite, getInvite, sessionCookie } from './_lib/admin-auth.js';

function jsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return {};
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.method === 'GET') {
            const invite = await getInvite(req.query?.token);
            if (!invite) return res.status(404).json({ error: 'INVITE_INVALID' });
            return res.status(200).json({ invite });
        }

        if (req.method === 'POST') {
            let body;
            try {
                body = jsonBody(req);
            } catch {
                return res.status(400).json({ error: 'INVALID_JSON' });
            }
            const result = await acceptAdminInvite(body.token, body.password);
            res.setHeader('Set-Cookie', sessionCookie(result.token));
            return res.status(201).json({ user: result.user });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    } catch (error) {
        console.error('Admin invite acceptance failed', error?.code || error?.message);
        if (error?.code === 'INVITE_INVALID') return res.status(404).json({ error: error.code });
        if (error?.code === 'USER_EXISTS') return res.status(409).json({ error: error.code });
        if (error?.code === 'PASSWORD_TOO_SHORT' || error?.code === 'PASSWORD_TOO_LONG') return res.status(400).json({ error: error.code });
        if (error?.code === 'DATABASE_NOT_CONFIGURED') return res.status(503).json({ error: error.code });
        return res.status(500).json({ error: 'ADMIN_INVITE_FAILED' });
    }
}
