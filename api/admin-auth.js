import { clearSessionCookie, getAdminSession, loginAdmin, logoutAdmin, sessionCookie } from './_lib/admin-auth.js';

function jsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return {};
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.method === 'GET') {
            const user = await getAdminSession(req);
            if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
            return res.status(200).json({ user });
        }

        if (req.method === 'POST') {
            let body;
            try {
                body = jsonBody(req);
            } catch {
                return res.status(400).json({ error: 'INVALID_JSON' });
            }
            const result = await loginAdmin(body.email, body.password);
            res.setHeader('Set-Cookie', sessionCookie(result.token));
            return res.status(200).json({ user: result.user });
        }

        if (req.method === 'DELETE') {
            await logoutAdmin(req);
            res.setHeader('Set-Cookie', clearSessionCookie());
            return res.status(204).end();
        }

        res.setHeader('Allow', 'GET, POST, DELETE');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    } catch (error) {
        console.error('Admin auth failed', error?.code || error?.message);
        if (error?.code === 'DATABASE_NOT_CONFIGURED') return res.status(503).json({ error: error.code });
        if (error?.code === 'ACCOUNT_LOCKED') return res.status(429).json({ error: error.code });
        if (error?.code === 'INVALID_CREDENTIALS') return res.status(401).json({ error: error.code });
        return res.status(500).json({ error: 'ADMIN_AUTH_FAILED' });
    }
}
