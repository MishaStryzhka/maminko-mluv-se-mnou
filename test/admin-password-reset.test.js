import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
    initializeAdminSchema, createPasswordRecord, issueSession, getAdminSession, loginAdmin,
} from '../api/_lib/admin-auth.js';
import {
    createPasswordResetService, consumeResetLimit, initializeResetLimits,
    normalizeResetEmail, resetDigest, resetClientKey,
} from '../api/_lib/admin-password-reset.js';

const originalPassword = 'Synthetic original password only';
const replacementPassword = 'Synthetic replacement password only';

async function fixture(t, options = {}) {
    // Real Postgres SQL semantics in WASM, no network and no deployed data.
    const db = new PGlite();
    t.after(() => db.close());
    const sql = async (strings, ...values) => {
        const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
        return (await db.query(query, values)).rows;
    };
    await initializeAdminSchema(sql);
    const credentials = await createPasswordRecord(originalPassword);
    const id = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    await sql`
        INSERT INTO admin_users (id, email, display_name, password_salt, password_hash, role)
        VALUES (${id}, 'owner@example.test', 'Synthetic owner', ${credentials.salt}, ${credentials.hash}, 'admin'),
               (${otherId}, 'other@example.test', 'Other synthetic user', ${credentials.salt}, ${credentials.hash}, 'sales')
    `;
    const messages = [];
    const service = createPasswordResetService({
        sql, ensureSchema: async () => {},
        sendResetEmail: async (message) => { messages.push(message); },
        ...options,
    });
    const authOptions = { sql, ensureSchema: async () => {} };
    return { db, sql, service, messages, id, otherId, credentials, authOptions };
}

test('Recovery identifier is normalized but never truncated or parsed as multiple recipients', () => {
    assert.equal(normalizeResetEmail(' OWNER@EXAMPLE.TEST '), 'owner@example.test');
    for (const value of [null, {}, ['owner@example.test'], 'a@b.test,b@c.test', 'a@b.test\r\nBcc: c@d.test', `${'a'.repeat(180)}@b.test`]) {
        assert.throws(() => normalizeResetEmail(value), { code: 'REQUEST_INVALID' });
    }
});

test('Only the managed Vercel IP is trusted, equivalent IPv6 forms share one bucket', (t) => {
    const before = process.env.VERCEL;
    t.after(() => { if (before === undefined) delete process.env.VERCEL; else process.env.VERCEL = before; });
    delete process.env.VERCEL;
    assert.equal(resetClientKey({ headers: { 'x-vercel-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
    process.env.VERCEL = '1';
    assert.equal(resetClientKey({ headers: { 'x-vercel-forwarded-for': '1.2.3.4' } }), '1.2.3.4');
    assert.equal(resetClientKey({ headers: { 'x-vercel-forwarded-for': '1.2.3.4,5.6.7.8' } }), 'unknown');
    assert.equal(resetClientKey({ headers: {} }), 'unknown');
    assert.equal(resetClientKey({ headers: { 'x-vercel-forwarded-for': '2001:0db8:0000:0000:0000:0000:0000:0001' } }),
        resetClientKey({ headers: { 'x-vercel-forwarded-for': '2001:db8::1' } }));
});

test('Recovery schema is additive and idempotent; existing users, roles and credentials survive', async (t) => {
    const f = await fixture(t);
    await initializeAdminSchema(f.sql);
    const rows = await f.sql`SELECT id, email, role, password_hash, auth_version, password_reset_hash FROM admin_users ORDER BY email`;
    assert.equal(rows.length, 2);
    assert.equal(rows.find((u) => u.id === f.id).password_hash, f.credentials.hash);
    assert.ok(rows.every((u) => u.auth_version === 0 && u.password_reset_hash === null));
    assert.equal(rows.find((u) => u.id === f.otherId).role, 'sales');
});

test('Request sends only to a stored active account, stores only a 256-bit token hash, and expires in 15 minutes', async (t) => {
    const f = await fixture(t);
    await f.service.request('OWNER@EXAMPLE.TEST', 'client1');
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].email, 'owner@example.test');
    assert.match(f.messages[0].token, /^[A-Za-z0-9_-]{43}$/);
    const [row] = await f.sql`SELECT password_reset_hash, extract(epoch FROM password_reset_expires_at - now()) AS ttl, password_hash FROM admin_users WHERE id = ${f.id}`;
    assert.equal(row.password_reset_hash, resetDigest(f.messages[0].token));
    assert.notEqual(row.password_reset_hash, f.messages[0].token);
    assert.ok(Number(row.ttl) > 890 && Number(row.ttl) <= 900);
    assert.equal(row.password_hash, f.credentials.hash);
    await f.service.request('missing@example.test', 'client2');
    await f.sql`UPDATE admin_users SET active = false WHERE id = ${f.otherId}`;
    await f.service.request('other@example.test', 'client3');
    assert.equal(f.messages.length, 1);
    assert.equal((await f.sql`SELECT count(*)::int AS count FROM admin_users`)[0].count, 2);
});

test('Valid completion atomically replaces only this account password and revokes sessions; no automatic login', async (t) => {
    const f = await fixture(t);
    const oldSession = await issueSession(f.id, 0, f.sql);
    const otherSession = await issueSession(f.otherId, 0, f.sql);
    await f.sql`UPDATE admin_users SET failed_login_count = 5, locked_until = now() + interval '15 minutes' WHERE id = ${f.id}`;
    await f.service.request('owner@example.test', 'requester');
    const result = await f.service.complete(f.messages[0].token, replacementPassword, 'completer');
    assert.deepEqual(result, { email: 'owner@example.test' });
    const [owner] = await f.sql`SELECT * FROM admin_users WHERE id = ${f.id}`;
    assert.equal(owner.auth_version, 1);
    assert.equal(owner.role, 'admin');
    assert.equal(owner.active, true);
    assert.equal(owner.failed_login_count, 0);
    assert.equal(owner.locked_until, null);
    assert.equal(owner.password_reset_hash, null);
    assert.equal(owner.password_reset_expires_at, null);
    assert.notEqual(owner.password_hash, f.credentials.hash);
    assert.equal(await getAdminSession({ headers: { cookie: `maminko_admin_session=${oldSession}` } }, f.authOptions), null);
    assert.equal((await getAdminSession({ headers: { cookie: `maminko_admin_session=${otherSession}` } }, f.authOptions)).id, f.otherId);
    assert.equal((await f.sql`SELECT count(*)::int AS count FROM admin_sessions WHERE user_id = ${f.id}`)[0].count, 0);
    await assert.rejects(loginAdmin('owner@example.test', originalPassword, f.authOptions), { code: 'INVALID_CREDENTIALS' });
    const login = await loginAdmin('owner@example.test', replacementPassword, f.authOptions);
    assert.equal(login.user.id, f.id);
    assert.equal((await getAdminSession({ headers: { cookie: `maminko_admin_session=${login.token}` } }, f.authOptions)).id, f.id);
});

test('Used, expired, malformed and inactive-account tokens cannot replace credentials', async (t) => {
    const f = await fixture(t);
    await f.service.request('owner@example.test', 'requester');
    const token = f.messages[0].token;
    await f.sql`UPDATE admin_users SET password_reset_expires_at = now() - interval '1 second' WHERE id = ${f.id}`;
    await assert.rejects(f.service.complete(token, replacementPassword, 'c1'), { code: 'RESET_INVALID' });
    await f.sql`UPDATE admin_users SET password_reset_expires_at = now() + interval '15 minutes', active = false WHERE id = ${f.id}`;
    await assert.rejects(f.service.complete(token, replacementPassword, 'c2'), { code: 'RESET_INVALID' });
    await assert.rejects(f.service.complete('invalid', replacementPassword, 'c3'), { code: 'RESET_INVALID' });
    await f.sql`UPDATE admin_users SET active = true WHERE id = ${f.id}`;
    await f.service.complete(token, replacementPassword, 'c4');
    await assert.rejects(f.service.complete(token, 'Different synthetic password', 'c5'), { code: 'RESET_INVALID' });
    assert.equal((await f.sql`SELECT auth_version FROM admin_users WHERE id = ${f.id}`)[0].auth_version, 1);
});

test('Two concurrent duplicate submissions have exactly one winner', async (t) => {
    let arrived = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const f = await fixture(t, { passwordRecord: async (password) => {
        arrived += 1;
        if (arrived === 2) release();
        await gate;
        return createPasswordRecord(password);
    } });
    await f.service.request('owner@example.test', 'r1');
    const results = await Promise.allSettled([
        f.service.complete(f.messages[0].token, replacementPassword, 'c1'),
        f.service.complete(f.messages[0].token, replacementPassword, 'c2'),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'RESET_INVALID');
    assert.equal((await f.sql`SELECT auth_version FROM admin_users WHERE id = ${f.id}`)[0].auth_version, 1);
});

test('Session-delete failure rolls back password replacement and token consumption together', async (t) => {
    const f = await fixture(t);
    await issueSession(f.id, 0, f.sql);
    await f.service.request('owner@example.test', 'r1');
    await f.db.exec(`CREATE FUNCTION reject_test_session_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic delete failure'; END; $$;
        CREATE TRIGGER reject_test_delete BEFORE DELETE ON admin_sessions FOR EACH ROW EXECUTE FUNCTION reject_test_session_delete();`);
    await assert.rejects(f.service.complete(f.messages[0].token, replacementPassword, 'c1'));
    const [owner] = await f.sql`SELECT password_hash, password_reset_hash, auth_version FROM admin_users WHERE id = ${f.id}`;
    assert.equal(owner.password_hash, f.credentials.hash);
    assert.equal(owner.auth_version, 0);
    assert.equal(owner.password_reset_hash, resetDigest(f.messages[0].token));
    assert.equal((await f.sql`SELECT count(*)::int AS count FROM admin_sessions WHERE user_id = ${f.id}`)[0].count, 1);
});

test('A stale pre-reset login cannot issue a new-generation session; upgraded reader rejects late stale inserts', async (t) => {
    const f = await fixture(t);
    await f.service.request('owner@example.test', 'r1');
    await f.service.complete(f.messages[0].token, replacementPassword, 'c1');
    await assert.rejects(issueSession(f.id, 0, f.sql), { code: 'INVALID_CREDENTIALS' });
    const staleToken = crypto.randomBytes(32).toString('base64url');
    // Simulates an already-running old deployment that inserts with DEFAULT 0.
    await f.sql`INSERT INTO admin_sessions (id, user_id, token_hash, expires_at) VALUES (${crypto.randomUUID()}, ${f.id}, ${resetDigest(staleToken)}, now() + interval '7 days')`;
    assert.equal(await getAdminSession({ headers: { cookie: `maminko_admin_session=${staleToken}` } }, f.authOptions), null);
});

test('A fresh request supersedes the previous link; an older link cannot win', async (t) => {
    const f = await fixture(t);
    await f.service.request('owner@example.test', 'r1');
    const first = f.messages[0].token;
    await f.sql`UPDATE admin_password_reset_limits SET window_start = now() - interval '61 seconds'`;
    await f.service.request('owner@example.test', 'r2');
    assert.equal(f.messages.length, 2);
    await assert.rejects(f.service.complete(first, replacementPassword, 'c1'), { code: 'RESET_INVALID' });
    await f.service.complete(f.messages[1].token, replacementPassword, 'c2');
});

test('Rate-limit UPSERTs cap concurrent claims and recover after their DB window expires', async (t) => {
    const f = await fixture(t);
    await initializeResetLimits(f.sql);
    const claims = await Promise.all(Array.from({ length: 12 }, () => consumeResetLimit(f.sql, 'synthetic-limit', 3, 60)));
    assert.equal(claims.filter(Boolean).length, 3);
    await f.sql`UPDATE admin_password_reset_limits SET window_start = now() - interval '61 seconds'`;
    assert.equal(await consumeResetLimit(f.sql, 'synthetic-limit', 3, 60), true);
    assert.equal((await f.sql`SELECT attempts FROM admin_password_reset_limits`)[0].attempts, 1);
});

test('Request cooldown, per-email and global limits stop mail without disclosing account existence', async (t) => {
    const f = await fixture(t);
    assert.equal(await f.service.request('owner@example.test', 'r1'), undefined);
    assert.equal(await f.service.request('owner@example.test', 'r1'), undefined);
    assert.equal(f.messages.length, 1);
    await f.sql`UPDATE admin_password_reset_limits SET window_start = now() - interval '61 seconds'`;
    await f.service.request('owner@example.test', 'r2');
    await f.sql`UPDATE admin_password_reset_limits SET window_start = now() - interval '61 seconds'`;
    await f.service.request('owner@example.test', 'r3');
    assert.equal(f.messages.length, 2); // Repeated cooldown attempt also used the hourly allowance.
    await f.sql`UPDATE admin_password_reset_limits SET attempts = 60 WHERE bucket_hash = ${resetDigest('request:global')}`;
    await f.service.request('other@example.test', 'r4');
    assert.equal(f.messages.length, 2);
});

test('SMTP failure invalidates only its own reset hash and leaves the password intact', async (t) => {
    const f = await fixture(t, { sendResetEmail: async () => { throw new Error('synthetic SMTP detail'); } });
    await assert.rejects(f.service.request('owner@example.test', 'r1'), { code: 'RESET_EMAIL_FAILED' });
    const [owner] = await f.sql`SELECT password_hash, password_reset_hash FROM admin_users WHERE id = ${f.id}`;
    assert.equal(owner.password_hash, f.credentials.hash);
    assert.equal(owner.password_reset_hash, null);
});

test('Delayed SMTP failure cannot delete a newer link', async (t) => {
    const f = await fixture(t);
    const newerHash = resetDigest(crypto.randomBytes(32).toString('base64url'));
    const service = createPasswordResetService({ sql: f.sql, ensureSchema: async () => {}, sendResetEmail: async () => {
        await f.sql`UPDATE admin_users SET password_reset_hash = ${newerHash} WHERE id = ${f.id}`;
        throw new Error('synthetic mail failure');
    } });
    await assert.rejects(service.request('owner@example.test', 'r1'), { code: 'RESET_EMAIL_FAILED' });
    assert.equal((await f.sql`SELECT password_reset_hash FROM admin_users WHERE id = ${f.id}`)[0].password_reset_hash, newerHash);
});

test('A request that observed the old version cannot mint a link after a concurrent reset', async (t) => {
    const f = await fixture(t);
    const sql = async (strings, ...values) => {
        if (strings.join('').includes('SET password_reset_hash =')) {
            await f.sql`UPDATE admin_users SET auth_version = auth_version + 1 WHERE id = ${f.id}`;
        }
        return f.sql(strings, ...values);
    };
    const service = createPasswordResetService({ sql, ensureSchema: async () => {}, sendResetEmail: async () => assert.fail('Stale request must not send') });
    await service.request('owner@example.test', 'r1');
    assert.equal((await f.sql`SELECT password_reset_hash FROM admin_users WHERE id = ${f.id}`)[0].password_reset_hash, null);
});
