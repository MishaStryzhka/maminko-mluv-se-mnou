import { waitUntil } from '@vercel/functions';
import { clearSessionCookie } from './_lib/admin-auth.js';
import { smtpConfigurationReady } from './_lib/confirmation-email.js';
import { passwordResetOrigin, sendAdminPasswordChangedEmail } from './_lib/admin-password-reset-email.js';
import {
    createPasswordResetService, normalizeResetEmail, resetClientKey, resetError,
    validateResetPassword, validateResetToken,
} from './_lib/admin-password-reset.js';

let service;
function defaultService() {
    service ||= createPasswordResetService();
    return service;
}

function requestBody(req) {
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.['content-type'] || ''))) {
        throw resetError('REQUEST_INVALID');
    }
    let body = req.body;
    if (typeof body === 'string') {
        if (Buffer.byteLength(body) > 4096) throw resetError('REQUEST_INVALID');
        try { body = JSON.parse(body); } catch { throw resetError('REQUEST_INVALID'); }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Buffer.byteLength(JSON.stringify(body)) > 4096) throw resetError('REQUEST_INVALID');
    return body;
}

// Dependency injection is for offline tests; there are no test bypass HTTP flags.
export function createPasswordResetHandler({
    getService = defaultService,
    background = waitUntil,
    sendChangedEmail = sendAdminPasswordChangedEmail,
    log = (code) => console.warn(code),
} = {}) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
        }
        try {
            if (process.env.ADMIN_PASSWORD_RESET_ENABLED !== 'true'
                || !process.env.DATABASE_URL || !smtpConfigurationReady()) throw resetError('RESET_UNAVAILABLE');
            const origin = passwordResetOrigin();
            if (req.headers?.origin !== origin) throw resetError('ORIGIN_INVALID');
            const body = requestBody(req);
            const clientKey = resetClientKey(req);
            if (body.action === 'request') {
                const email = normalizeResetEmail(body.email);
                // Neither account lookup nor SMTP affects the public response time.
                // waitUntil extends this invocation, but is not a durable job queue.
                background(Promise.resolve().then(() => getService().request(email, clientKey))
                    .catch(() => { log('ADMIN_PASSWORD_RESET_REQUEST_FAILED'); }));
                return res.status(202).json({ ok: true });
            }
            if (body.action === 'complete') {
                validateResetToken(body.token);
                validateResetPassword(body.password);
                const result = await getService().complete(body.token, body.password, clientKey);
                res.setHeader('Set-Cookie', clearSessionCookie());
                background(Promise.resolve().then(() => sendChangedEmail({ email: result.email }))
                    .catch(() => { log('ADMIN_PASSWORD_CHANGE_NOTICE_FAILED'); }));
                return res.status(200).json({ ok: true });
            }
            throw resetError('REQUEST_INVALID');
        } catch (error) {
            const badRequest = new Set(['REQUEST_INVALID', 'RESET_INVALID', 'PASSWORD_INVALID', 'PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG']);
            if (badRequest.has(error?.code)) return res.status(400).json({ error: error.code });
            if (error?.code === 'ORIGIN_INVALID') return res.status(403).json({ error: 'ORIGIN_INVALID' });
            if (error?.code === 'RATE_LIMITED') return res.status(429).json({ error: 'RATE_LIMITED' });
            // Do not log database queries, SMTP errors, request bodies or tokens.
            log('ADMIN_PASSWORD_RESET_UNAVAILABLE');
            return res.status(503).json({ error: 'RESET_UNAVAILABLE' });
        }
    };
}

export default createPasswordResetHandler();
