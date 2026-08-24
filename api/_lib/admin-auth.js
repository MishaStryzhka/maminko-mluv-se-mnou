import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';

const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE = 'maminko_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const ROLES = new Set(['admin', 'sales', 'accountant']);
let adminSchemaReady = false;

function getSql() {
    if (!process.env.DATABASE_URL) {
        const error = new Error('DATABASE_URL is not configured');
        error.code = 'DATABASE_NOT_CONFIGURED';
        throw error;
    }
    return neon(process.env.DATABASE_URL);
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase().slice(0, 180);
}

function clean(value, max = 160) {
    return String(value || '').trim().slice(0, max);
}

function digest(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeEqualText(a, b) {
    const left = Buffer.from(String(a || ''));
    const right = Buffer.from(String(b || ''));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
    const raw = String(req.headers?.cookie || '');
    const result = {};
    raw.split(';').forEach((part) => {
        const index = part.indexOf('=');
        if (index < 0) return;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key) result[key] = decodeURIComponent(value);
    });
    return result;
}

export function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
    return `${SESSION_COOKIE}=${encodeURIComponent(token || '')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Number(maxAge) || 0)}`;
}

export function clearSessionCookie() {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function ensureAdminSchema() {
    if (adminSchemaReady) return;
    const sql = getSql();
    await sql`
        CREATE TABLE IF NOT EXISTS admin_users (
            id uuid PRIMARY KEY,
            email text UNIQUE NOT NULL,
            display_name text NOT NULL,
            password_salt text NOT NULL,
            password_hash text NOT NULL,
            role text NOT NULL CHECK (role IN ('admin','sales','accountant')),
            active boolean NOT NULL DEFAULT true,
            failed_login_count integer NOT NULL DEFAULT 0,
            locked_until timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            last_login_at timestamptz
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS admin_sessions (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            token_hash text UNIQUE NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL,
            last_seen_at timestamptz NOT NULL DEFAULT now()
        )
    `;
    await sql`
        CREATE TABLE IF NOT EXISTS admin_invites (
            id uuid PRIMARY KEY,
            email text NOT NULL,
            display_name text NOT NULL,
            role text NOT NULL CHECK (role IN ('admin','sales','accountant')),
            token_hash text UNIQUE NOT NULL,
            invited_by uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL,
            accepted_at timestamptz
        )
    `;
    await sql`CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions (user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at)`;
    await sql`CREATE INDEX IF NOT EXISTS admin_invites_email_idx ON admin_invites (email)`;
    adminSchemaReady = true;
}

async function passwordDigest(password, saltHex) {
    const derived = await scryptAsync(String(password), Buffer.from(saltHex, 'hex'), 64);
    return Buffer.from(derived).toString('hex');
}

function validatePassword(password) {
    const value = String(password || '');
    if (value.length < 12) {
        const error = new Error('Password must be at least 12 characters');
        error.code = 'PASSWORD_TOO_SHORT';
        throw error;
    }
    if (value.length > 200) {
        const error = new Error('Password is too long');
        error.code = 'PASSWORD_TOO_LONG';
        throw error;
    }
}

async function createPasswordRecord(password) {
    validatePassword(password);
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await passwordDigest(password, salt);
    return { salt, hash };
}

async function verifyPassword(password, salt, expectedHash) {
    const actualHash = await passwordDigest(password, salt);
    const left = Buffer.from(actualHash, 'hex');
    const right = Buffer.from(String(expectedHash || ''), 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function issueSession(userId) {
    await ensureAdminSchema();
    const sql = getSql();
    const token = crypto.randomBytes(32).toString('base64url');
    await sql`
        INSERT INTO admin_sessions (id, user_id, token_hash, expires_at)
        VALUES (${crypto.randomUUID()}, ${userId}, ${digest(token)}, now() + interval '7 days')
    `;
    return token;
}

export async function getAdminSession(req) {
    await ensureAdminSchema();
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return null;
    const sql = getSql();
    const rows = await sql`
        SELECT u.id, u.email, u.display_name, u.role, u.active, s.id AS session_id
        FROM admin_sessions s
        JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = ${digest(token)}
          AND s.expires_at > now()
          AND u.active = true
        LIMIT 1
    `;
    const user = rows[0];
    if (!user) return null;
    await sql`UPDATE admin_sessions SET last_seen_at = now() WHERE id = ${user.session_id}`;
    return {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
    };
}

export async function loginAdmin(email, password) {
    await ensureAdminSchema();
    const sql = getSql();
    const normalized = normalizeEmail(email);
    const rows = await sql`
        SELECT id, email, display_name, role, active, password_salt, password_hash,
               failed_login_count, locked_until
        FROM admin_users
        WHERE email = ${normalized}
        LIMIT 1
    `;
    const user = rows[0];
    if (!user || !user.active) {
        const error = new Error('Invalid credentials');
        error.code = 'INVALID_CREDENTIALS';
        throw error;
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        const error = new Error('Account temporarily locked');
        error.code = 'ACCOUNT_LOCKED';
        throw error;
    }

    const valid = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!valid) {
        const nextFailures = Number(user.failed_login_count || 0) + 1;
        await sql`
            UPDATE admin_users
            SET failed_login_count = ${nextFailures},
                locked_until = CASE WHEN ${nextFailures} >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
                updated_at = now()
            WHERE id = ${user.id}
        `;
        const error = new Error('Invalid credentials');
        error.code = nextFailures >= 5 ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS';
        throw error;
    }

    await sql`
        UPDATE admin_users
        SET failed_login_count = 0, locked_until = NULL, last_login_at = now(), updated_at = now()
        WHERE id = ${user.id}
    `;
    const token = await issueSession(user.id);
    return {
        token,
        user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role },
    };
}

export async function logoutAdmin(req) {
    await ensureAdminSchema();
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return;
    const sql = getSql();
    await sql`DELETE FROM admin_sessions WHERE token_hash = ${digest(token)}`;
}

export async function getSetupState() {
    await ensureAdminSchema();
    const sql = getSql();
    const rows = await sql`SELECT count(*)::int AS count FROM admin_users`;
    const setupRequired = Number(rows[0]?.count || 0) === 0;
    return {
        setupRequired,
        ownerEmail: normalizeEmail(process.env.ADMIN_OWNER_EMAIL || 'mykhailo.stryzhka@seznam.cz'),
        setupConfigured: Boolean(process.env.ADMIN_API_TOKEN),
    };
}

export async function createFirstAdmin({ email, displayName, password, setupCode }) {
    const state = await getSetupState();
    if (!state.setupRequired) {
        const error = new Error('Initial setup already completed');
        error.code = 'SETUP_ALREADY_COMPLETED';
        throw error;
    }
    const expectedCode = String(process.env.ADMIN_API_TOKEN || '');
    if (!expectedCode) {
        const error = new Error('Initial setup is not configured');
        error.code = 'SETUP_NOT_CONFIGURED';
        throw error;
    }
    if (!safeEqualText(expectedCode, setupCode)) {
        const error = new Error('Invalid setup code');
        error.code = 'INVALID_SETUP_CODE';
        throw error;
    }
    const normalized = normalizeEmail(email);
    if (!normalized || normalized !== state.ownerEmail) {
        const error = new Error('Invalid owner email');
        error.code = 'INVALID_OWNER_EMAIL';
        throw error;
    }
    const name = clean(displayName, 120);
    if (!name) {
        const error = new Error('Display name required');
        error.code = 'NAME_REQUIRED';
        throw error;
    }
    const passwordRecord = await createPasswordRecord(password);
    const sql = getSql();
    const id = crypto.randomUUID();
    const rows = await sql`
        INSERT INTO admin_users (id, email, display_name, password_salt, password_hash, role)
        VALUES (${id}, ${normalized}, ${name}, ${passwordRecord.salt}, ${passwordRecord.hash}, 'admin')
        RETURNING id, email, display_name, role
    `;
    const token = await issueSession(id);
    return {
        token,
        user: { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name, role: rows[0].role },
    };
}

export async function listAdminUsers(requestingUser) {
    if (requestingUser?.role !== 'admin') {
        const error = new Error('Forbidden');
        error.code = 'FORBIDDEN';
        throw error;
    }
    await ensureAdminSchema();
    const sql = getSql();
    const users = await sql`
        SELECT id, email, display_name, role, active, created_at, last_login_at
        FROM admin_users
        ORDER BY created_at ASC
    `;
    const invites = await sql`
        SELECT id, email, display_name, role, created_at, expires_at
        FROM admin_invites
        WHERE accepted_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC
    `;
    return { users, invites };
}

export async function createAdminInvite(requestingUser, input, origin) {
    if (requestingUser?.role !== 'admin') {
        const error = new Error('Forbidden');
        error.code = 'FORBIDDEN';
        throw error;
    }
    await ensureAdminSchema();
    const email = normalizeEmail(input?.email);
    const displayName = clean(input?.displayName, 120);
    const role = clean(input?.role, 30);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        const error = new Error('Invalid email');
        error.code = 'EMAIL_INVALID';
        throw error;
    }
    if (!displayName) {
        const error = new Error('Display name required');
        error.code = 'NAME_REQUIRED';
        throw error;
    }
    if (!ROLES.has(role)) {
        const error = new Error('Invalid role');
        error.code = 'ROLE_INVALID';
        throw error;
    }
    const sql = getSql();
    const existing = await sql`SELECT id FROM admin_users WHERE email = ${email} LIMIT 1`;
    if (existing[0]) {
        const error = new Error('User already exists');
        error.code = 'USER_EXISTS';
        throw error;
    }
    await sql`DELETE FROM admin_invites WHERE email = ${email} AND accepted_at IS NULL`;
    const token = crypto.randomBytes(32).toString('base64url');
    const id = crypto.randomUUID();
    await sql`
        INSERT INTO admin_invites (id, email, display_name, role, token_hash, invited_by, expires_at)
        VALUES (${id}, ${email}, ${displayName}, ${role}, ${digest(token)}, ${requestingUser.id}, now() + interval '48 hours')
    `;
    return {
        id,
        email,
        displayName,
        role,
        inviteUrl: `${String(origin || '').replace(/\/$/, '')}/admin-invite.html?token=${encodeURIComponent(token)}`,
        expiresInHours: 48,
    };
}

export async function getInvite(token) {
    await ensureAdminSchema();
    const sql = getSql();
    const rows = await sql`
        SELECT id, email, display_name, role, expires_at
        FROM admin_invites
        WHERE token_hash = ${digest(token)} AND accepted_at IS NULL AND expires_at > now()
        LIMIT 1
    `;
    const invite = rows[0];
    if (!invite) return null;
    return {
        id: invite.id,
        email: invite.email,
        displayName: invite.display_name,
        role: invite.role,
        expiresAt: invite.expires_at,
    };
}

export async function acceptAdminInvite(token, password) {
    const invite = await getInvite(token);
    if (!invite) {
        const error = new Error('Invite invalid or expired');
        error.code = 'INVITE_INVALID';
        throw error;
    }
    const passwordRecord = await createPasswordRecord(password);
    const sql = getSql();
    const existing = await sql`SELECT id FROM admin_users WHERE email = ${invite.email} LIMIT 1`;
    if (existing[0]) {
        const error = new Error('User already exists');
        error.code = 'USER_EXISTS';
        throw error;
    }
    const userId = crypto.randomUUID();
    const rows = await sql`
        INSERT INTO admin_users (id, email, display_name, password_salt, password_hash, role)
        VALUES (${userId}, ${invite.email}, ${invite.displayName}, ${passwordRecord.salt}, ${passwordRecord.hash}, ${invite.role})
        RETURNING id, email, display_name, role
    `;
    await sql`UPDATE admin_invites SET accepted_at = now() WHERE id = ${invite.id}`;
    const sessionToken = await issueSession(userId);
    return {
        token: sessionToken,
        user: { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name, role: rows[0].role },
    };
}

export async function setAdminUserActive(requestingUser, userId, active) {
    if (requestingUser?.role !== 'admin') {
        const error = new Error('Forbidden');
        error.code = 'FORBIDDEN';
        throw error;
    }
    if (String(userId) === String(requestingUser.id) && !active) {
        const error = new Error('Cannot deactivate own account');
        error.code = 'CANNOT_DEACTIVATE_SELF';
        throw error;
    }
    await ensureAdminSchema();
    const sql = getSql();
    const targetRows = await sql`SELECT id, role, active FROM admin_users WHERE id = ${String(userId)} LIMIT 1`;
    const target = targetRows[0];
    if (!target) {
        const error = new Error('User not found');
        error.code = 'USER_NOT_FOUND';
        throw error;
    }
    if (target.role === 'admin' && target.active && !active) {
        const countRows = await sql`SELECT count(*)::int AS count FROM admin_users WHERE role = 'admin' AND active = true`;
        if (Number(countRows[0]?.count || 0) <= 1) {
            const error = new Error('Cannot deactivate last admin');
            error.code = 'LAST_ADMIN';
            throw error;
        }
    }
    const rows = await sql`
        UPDATE admin_users SET active = ${Boolean(active)}, updated_at = now() WHERE id = ${String(userId)}
        RETURNING id, email, display_name, role, active
    `;
    if (!active) await sql`DELETE FROM admin_sessions WHERE user_id = ${String(userId)}`;
    return rows[0];
}
