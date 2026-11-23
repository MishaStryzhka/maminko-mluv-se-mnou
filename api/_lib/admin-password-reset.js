import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { createPasswordRecord, ensureAdminSchema, getSql, validatePassword } from './admin-auth.js';
import { validRecipient } from './confirmation-email.js';
import { sendAdminPasswordResetEmail } from './admin-password-reset-email.js';

export function resetError(code) {
    return Object.assign(new Error(code), { code });
}

export function resetDigest(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizeResetEmail(value) {
    if (typeof value !== 'string') throw resetError('REQUEST_INVALID');
    const email = value.trim().toLowerCase();
    // Unlike login's legacy normalization, never truncate a recovery identifier.
    if (email.length > 180 || !validRecipient(email)) throw resetError('REQUEST_INVALID');
    return email;
}

export function validateResetToken(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw resetError('RESET_INVALID');
}

export function validateResetPassword(password) {
    if (typeof password !== 'string') throw resetError('PASSWORD_INVALID');
    validatePassword(password);
}

// Trust Vercel's overwritten client-IP header only in its managed runtime.
// Missing or malformed IPs share one conservative bucket instead of bypassing limits.
export function resetClientKey(req) {
    const source = process.env.VERCEL === '1'
        ? req.headers?.['x-vercel-forwarded-for']
        : req.socket?.remoteAddress;
    if (typeof source !== 'string' || !isIP(source.trim())) return 'unknown';
    const address = source.trim();
    // URL canonicalization merges equivalent IPv6 spellings; IPv4 stays unchanged.
    if (isIP(address) !== 6) return address;
    try { return new URL(`http://[${address}]/`).hostname.toLowerCase(); } catch { return 'unknown'; }
}

export async function initializeResetLimits(sql) {
    await sql`
        CREATE TABLE IF NOT EXISTS admin_password_reset_limits (
            bucket_hash text PRIMARY KEY,
            window_start timestamptz NOT NULL DEFAULT now(),
            attempts integer NOT NULL DEFAULT 1
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS admin_reset_limits_age_idx ON admin_password_reset_limits (window_start)`;
}

// All counters are shared by serverless instances. Atomic conditional UPSERTs
// cap counters, and global limits bound the number of per-address/token rows.
export async function consumeResetLimit(sql, key, limit, seconds) {
    const rows = await sql`
        INSERT INTO admin_password_reset_limits (bucket_hash, window_start, attempts)
        VALUES (${resetDigest(key)}, now(), 1)
        ON CONFLICT (bucket_hash) DO UPDATE SET
            attempts = CASE
                WHEN admin_password_reset_limits.window_start <= now() - ${seconds} * interval '1 second' THEN 1
                ELSE admin_password_reset_limits.attempts + 1
            END,
            window_start = CASE
                WHEN admin_password_reset_limits.window_start <= now() - ${seconds} * interval '1 second' THEN now()
                ELSE admin_password_reset_limits.window_start
            END
        WHERE admin_password_reset_limits.attempts < ${limit}
           OR admin_password_reset_limits.window_start <= now() - ${seconds} * interval '1 second'
        RETURNING attempts
    `;
    return Boolean(rows[0]);
}

export function createPasswordResetService({
    sql = getSql(),
    ensureSchema = ensureAdminSchema,
    sendResetEmail = sendAdminPasswordResetEmail,
    passwordRecord = createPasswordRecord,
} = {}) {
    let ready;
    async function prepare() {
        if (!ready) {
            ready = (async () => {
                await ensureSchema();
                await initializeResetLimits(sql);
            })().catch((error) => { ready = undefined; throw error; });
        }
        await ready;
    }

    async function limited(action, clientKey, identifier) {
        await prepare();
        const request = action === 'request';
        if (!await consumeResetLimit(sql, `${action}:global`, request ? 60 : 120, 3600)) return true;
        if (!await consumeResetLimit(sql, `${action}:ip:${clientKey}`, request ? 10 : 30, 3600)) return true;
        await sql`DELETE FROM admin_password_reset_limits WHERE window_start < now() - interval '1 day'`;
        if (!await consumeResetLimit(sql, `${action}:identifier:${identifier}`, request ? 3 : 6, 3600)) return true;
        return request && !await consumeResetLimit(sql, `request:cooldown:${identifier}`, 1, 60);
    }

    return {
        async request(emailInput, clientKey) {
            const email = normalizeResetEmail(emailInput);
            if (await limited('request', clientKey, email)) return;
            const rows = await sql`
                SELECT id, email, auth_version FROM admin_users
                WHERE email = ${email} AND active = true
                LIMIT 1
            `;
            const user = rows[0];
            if (!user || !validRecipient(user.email)) return;
            const token = crypto.randomBytes(32).toString('base64url');
            const tokenHash = resetDigest(token);
            const minted = await sql`
                UPDATE admin_users
                SET password_reset_hash = ${tokenHash}, password_reset_expires_at = now() + interval '15 minutes'
                WHERE id = ${user.id} AND active = true AND auth_version = ${user.auth_version}
                RETURNING email
            `;
            if (!minted[0]) return;
            try {
                // Recipient comes exclusively from the existing database record.
                await sendResetEmail({ email: minted[0].email, token });
            } catch {
                // A delayed SMTP failure must not invalidate a newer request's link.
                await sql`
                    UPDATE admin_users SET password_reset_hash = NULL, password_reset_expires_at = NULL
                    WHERE id = ${user.id} AND password_reset_hash = ${tokenHash}
                `;
                throw resetError('RESET_EMAIL_FAILED');
            }
        },

        async complete(token, password, clientKey) {
            validateResetToken(token);
            validateResetPassword(password);
            const tokenHash = resetDigest(token);
            if (await limited('complete', clientKey, tokenHash)) throw resetError('RATE_LIMITED');
            // Avoid spending scrypt work on arbitrary/expired tokens. The mutation
            // below repeats every condition; this read never consumes the link.
            const eligible = await sql`
                SELECT id FROM admin_users
                WHERE password_reset_hash = ${tokenHash}
                  AND password_reset_expires_at > now() AND active = true
                LIMIT 1
            `;
            if (!eligible[0]) throw resetError('RESET_INVALID');
            const { salt, hash } = await passwordRecord(password);
            // PostgreSQL rechecks UPDATE predicates after competing row updates.
            // Only one completion can replace/clear this user's current hash.
            // Password, link consumption, lock clearance, version fence and
            // deletion of existing sessions commit or roll back together.
            const rows = await sql`
                WITH changed AS (
                    UPDATE admin_users
                    SET password_salt = ${salt}, password_hash = ${hash},
                        auth_version = auth_version + 1,
                        password_reset_hash = NULL, password_reset_expires_at = NULL,
                        failed_login_count = 0, locked_until = NULL, updated_at = now()
                    WHERE id = ${eligible[0].id} AND password_reset_hash = ${tokenHash}
                      AND password_reset_expires_at > now() AND active = true
                    RETURNING id, email
                ), revoked AS (
                    DELETE FROM admin_sessions WHERE user_id IN (SELECT id FROM changed)
                    RETURNING id
                )
                SELECT email FROM changed
            `;
            if (!rows[0]) throw resetError('RESET_INVALID');
            // Internal-only recipient for the post-change security notice.
            // The HTTP handler must never expose it or issue a login cookie.
            return { email: rows[0].email };
        },
    };
}
