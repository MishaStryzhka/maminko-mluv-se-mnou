import { createFirstAdmin, getSetupState, sessionCookie } from './_lib/admin-auth.js';

function jsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return {};
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    try {
        if (req.method === 'GET') {
            return res.status(200).json(await getSetupState());
        }

        if (req.method === 'POST') {
            let body;
            try {
                body = jsonBody(req);
            } catch {
                return res.status(400).json({ error: 'INVALID_JSON' });
            }
            const result = await createFirstAdmin(body);
            res.setHeader('Set-Cookie', sessionCookie(result.token));
            return res.status(201).json({ user: result.user });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    } catch (error) {
        console.error('Admin setup failed', error?.code || error?.message);
        const badRequest = new Set(['PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG', 'NAME_REQUIRED', 'INVALID_OWNER_EMAIL']);
        if (badRequest.has(error?.code)) return res.status(400).json({ error: error.code });
        if (error?.code === 'INVALID_SETUP_CODE') return res.status(401).json({ error: error.code });
        if (error?.code === 'SETUP_ALREADY_COMPLETED') return res.status(409).json({ error: error.code });
        if (error?.code === 'SETUP_NOT_CONFIGURED' || error?.code === 'DATABASE_NOT_CONFIGURED') return res.status(503).json({ error: error.code });
        return res.status(500).json({ error: 'ADMIN_SETUP_FAILED' });
    }
}
