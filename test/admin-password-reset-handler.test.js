import test from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordResetHandler } from '../api/admin-password-reset.js';
import { SHOP_EMAIL } from '../api/_lib/confirmation-email.js';

const origin = 'https://staging.example.com';
const token = 'a'.repeat(43);
const password = 'synthetic-new-password-only';
const storedEmail = 'stored-admin@example.com';

function configure(t, overrides = {}) {
    const values = {
        ADMIN_PASSWORD_RESET_ENABLED: 'true',
        PUBLIC_SITE_URL: origin,
        DATABASE_URL: 'postgresql://synthetic:unused@localhost/offline_only',
        SMTP_USER: SHOP_EMAIL,
        SMTP_APP_PASSWORD: 'synthetic-smtp-unused',
        VERCEL: '1',
        ...overrides,
    };
    const originals = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(originals)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
}

function request(overrides = {}) {
    return {
        method: 'POST',
        body: { action: 'request', email: 'admin@example.com' },
        socket: { remoteAddress: '192.0.2.10' },
        ...overrides,
        headers: {
            origin,
            'content-type': 'application/json',
            'x-vercel-forwarded-for': '192.0.2.20',
            ...overrides.headers,
        },
    };
}

function response() {
    return {
        headers: {},
        statusCode: null,
        payload: undefined,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
    };
}

function harness(overrides = {}) {
    const calls = { request: [], complete: [], notice: [], background: [], logs: [], getService: 0 };
    const service = {
        async request(...args) { calls.request.push(args); },
        async complete(...args) { calls.complete.push(args); return { email: storedEmail }; },
        ...overrides.service,
    };
    const handler = createPasswordResetHandler({
        getService() { calls.getService += 1; return service; },
        background(task) { calls.background.push(task); },
        async sendChangedEmail(input) { calls.notice.push(input); return { sent: true }; },
        log(code) { calls.logs.push(code); },
        ...overrides.dependencies,
    });
    return { calls, handler, async drain() { await Promise.all(calls.background); } };
}

function assertNoServiceWork(calls) {
    assert.equal(calls.getService, 0);
    assert.deepEqual(calls.request, []);
    assert.deepEqual(calls.complete, []);
    assert.deepEqual(calls.notice, []);
    assert.deepEqual(calls.background, []);
}

test('Reset request returns uniform 202 before unresolved account lookup or SMTP work finishes', { timeout: 3000 }, async (t) => {
    configure(t);
    let finish;
    let finished = false;
    const pending = new Promise((resolve) => { finish = resolve; });
    const fixture = harness({ service: { async request() { await pending; finished = true; } } });
    const res = response();
    await fixture.handler(request(), res);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.payload, { ok: true });
    assert.equal(finished, false);
    assert.equal(fixture.calls.background.length, 1);
    finish();
    await fixture.drain();
    assert.equal(finished, true);
});

test('Known, unknown and throttled reset requests have identical status, body and public headers', async (t) => {
    configure(t);
    const outcomes = [];
    for (const internalResult of [
        { email: storedEmail, token }, undefined, { throttled: true },
    ]) {
        const fixture = harness({ service: { async request() { return internalResult; } } });
        const res = response();
        await fixture.handler(request(), res);
        await fixture.drain();
        outcomes.push({ status: res.statusCode, payload: res.payload, headers: res.headers });
        assert.equal(res.statusCode, 202);
        assert.deepEqual(res.payload, { ok: true });
        assert.equal(res.headers['set-cookie'], undefined);
        assert.equal(res.headers.location, undefined);
        assert.deepEqual(fixture.calls.logs, []);
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
    assert.deepEqual(outcomes[1], outcomes[2]);
});

test('Reset request normalizes email without forwarding redirect, host or arbitrary body fields', async (t) => {
    configure(t);
    const fixture = harness();
    const res = response();
    await fixture.handler(request({
        headers: { host: 'attacker.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-for': '192.0.2.99' },
        body: {
            action: 'request', email: '  Admin@Example.Com  ',
            redirectUrl: 'https://attacker.example/capture', origin: 'https://attacker.example',
            recipient: 'different@example.com', role: 'admin', token,
        },
    }), res);
    await fixture.drain();
    assert.deepEqual(fixture.calls.request, [['admin@example.com', '192.0.2.20']]);
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.payload, { ok: true });
    assert.equal(res.headers.location, undefined);
});

test('Background reset failures retain generic 202 and log only a fixed code', async (t) => {
    configure(t);
    const privateMessage = `private database query ${storedEmail} ${token} ${password}`;
    for (const dependencies of [
        { getService() { throw new Error(privateMessage); } },
        { getService() { return { async request() { throw Object.assign(new Error(privateMessage), { code: 'SMTP_PRIVATE' }); } }; } },
    ]) {
        const fixture = harness({ dependencies });
        const res = response();
        await fixture.handler(request(), res);
        await fixture.drain();
        assert.equal(res.statusCode, 202);
        assert.deepEqual(res.payload, { ok: true });
        assert.deepEqual(fixture.calls.logs, ['ADMIN_PASSWORD_RESET_REQUEST_FAILED']);
        assert.equal(JSON.stringify([res.payload, fixture.calls.logs]).includes(privateMessage), false);
    }
});

test('GET, HEAD and other non-POST requests cannot inspect or mutate reset tokens', async (t) => {
    configure(t);
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        const fixture = harness();
        const res = response();
        await fixture.handler(request({ method, body: { action: 'complete', token, password } }), res);
        assert.equal(res.statusCode, 405);
        assert.deepEqual(res.payload, { error: 'METHOD_NOT_ALLOWED' });
        assert.equal(res.headers.allow, 'POST');
        assertNoServiceWork(fixture.calls);
    }
});

test('All reset responses disable caching and referrer disclosure and use nosniff', async (t) => {
    configure(t);
    for (const req of [request(), request({ method: 'GET' }), request({ headers: { origin: 'https://attacker.example' } })]) {
        const fixture = harness();
        const res = response();
        await fixture.handler(req, res);
        await fixture.drain();
        assert.equal(res.headers['cache-control'], 'no-store');
        assert.equal(res.headers['referrer-policy'], 'no-referrer');
        assert.equal(res.headers['x-content-type-options'], 'nosniff');
    }
});

test('Reset flag and missing or invalid server configuration fail closed without service access', async (t) => {
    configure(t);
    for (const [key, value] of [
        ['ADMIN_PASSWORD_RESET_ENABLED', undefined], ['ADMIN_PASSWORD_RESET_ENABLED', 'false'],
        ['ADMIN_PASSWORD_RESET_ENABLED', '1'], ['DATABASE_URL', undefined], ['DATABASE_URL', ''],
        ['SMTP_USER', 'different@example.com'], ['SMTP_APP_PASSWORD', undefined], ['SMTP_APP_PASSWORD', '  '],
        ['PUBLIC_SITE_URL', undefined], ['PUBLIC_SITE_URL', 'http://staging.example.com'],
        ['PUBLIC_SITE_URL', `${origin}/admin`], ['PUBLIC_SITE_URL', 'https://user:secret@staging.example.com'],
    ]) {
        const previous = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        const fixture = harness();
        const res = response();
        await fixture.handler(request(), res);
        assert.equal(res.statusCode, 503);
        assert.deepEqual(res.payload, { error: 'RESET_UNAVAILABLE' });
        assert.deepEqual(fixture.calls.logs, ['ADMIN_PASSWORD_RESET_UNAVAILABLE']);
        assertNoServiceWork(fixture.calls);
        process.env[key] = previous;
    }
});

test('Reset POST requires exact configured Origin and never trusts Host or forwarded origin headers', async (t) => {
    configure(t);
    for (const suppliedOrigin of [undefined, 'null', `${origin}/`, 'http://staging.example.com', 'https://attacker.example', `${origin}.attacker.example`, [origin]]) {
        const fixture = harness();
        const res = response();
        await fixture.handler(request({ headers: { origin: suppliedOrigin, host: 'staging.example.com', 'x-forwarded-host': 'staging.example.com' } }), res);
        assert.equal(res.statusCode, 403);
        assert.deepEqual(res.payload, { error: 'ORIGIN_INVALID' });
        assert.equal(res.headers['access-control-allow-origin'], undefined);
        assertNoServiceWork(fixture.calls);
    }
});

test('Reset POST accepts JSON strings and charset parameter but rejects non-JSON content types', async (t) => {
    configure(t);
    const accepted = harness();
    const acceptedRes = response();
    await accepted.handler(request({
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ action: 'request', email: 'admin@example.com' }),
    }), acceptedRes);
    await accepted.drain();
    assert.equal(acceptedRes.statusCode, 202);
    assert.equal(accepted.calls.request.length, 1);
    for (const contentType of [undefined, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/jsonp']) {
        const fixture = harness();
        const res = response();
        await fixture.handler(request({ headers: { 'content-type': contentType } }), res);
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: 'REQUEST_INVALID' });
        assertNoServiceWork(fixture.calls);
    }
});

test('Reset POST rejects malformed, non-object, unsupported and oversized bodies before service access', async (t) => {
    configure(t);
    const bodies = [
        null, undefined, true, 42, [], '{}', '[]', 'null', '{',
        { action: 'unknown', email: 'admin@example.com' },
        `${' '.repeat(4097)}{"action":"request","email":"admin@example.com"}`,
        { action: 'request', email: 'admin@example.com', extra: 'a'.repeat(4096) },
        { action: 'request', email: 'admin@example.com', extra: '€'.repeat(1500) },
    ];
    for (const body of bodies) {
        const fixture = harness();
        const res = response();
        await fixture.handler(request({ body }), res);
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: 'REQUEST_INVALID' });
        assertNoServiceWork(fixture.calls);
    }
});

test('Reset request rejects wrong identifier types, email lists, injection and overlength without truncation', async (t) => {
    configure(t);
    for (const email of [
        undefined, null, 3, {}, ['admin@example.com'], '', 'not-an-email',
        'one@example.com,two@example.com', 'Admin <admin@example.com>',
        'admin@example.com\r\nBcc: other@example.com', `${'a'.repeat(169)}@example.com`,
    ]) {
        const fixture = harness();
        const res = response();
        await fixture.handler(request({ body: { action: 'request', email } }), res);
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: 'REQUEST_INVALID' });
        assertNoServiceWork(fixture.calls);
    }
});

test('Reset completion clears session cookie without automatic login or exposing internal email', async (t) => {
    configure(t);
    const fixture = harness();
    const res = response();
    await fixture.handler(request({ body: { action: 'complete', token, password } }), res);
    await fixture.drain();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true });
    assert.deepEqual(fixture.calls.complete, [[token, password, '192.0.2.20']]);
    assert.deepEqual(fixture.calls.notice, [{ email: storedEmail }]);
    assert.deepEqual(fixture.calls.request, []);
    assert.equal(fixture.calls.background.length, 1);
    assert.equal(res.headers['set-cookie'], 'maminko_admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    assert.equal(res.headers.location, undefined);
    assert.equal(JSON.stringify(res.payload).includes(storedEmail), false);
    assert.equal(JSON.stringify(res.payload).includes(token), false);
    assert.equal(JSON.stringify(res.payload).includes(password), false);
});

test('Reset completion does not wait for security notice delivery and sanitizes a notice failure', { timeout: 3000 }, async (t) => {
    configure(t);
    let failNotice;
    const pendingNotice = new Promise((resolve, reject) => { failNotice = reject; });
    const fixture = harness({ dependencies: { sendChangedEmail() { return pendingNotice; } } });
    const res = response();
    await fixture.handler(request({ body: { action: 'complete', token, password } }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { ok: true });
    failNotice(new Error(`SMTP details ${storedEmail} ${token} ${password}`));
    await fixture.drain();
    assert.deepEqual(fixture.calls.logs, ['ADMIN_PASSWORD_CHANGE_NOTICE_FAILED']);
    assert.equal(res.statusCode, 200);
});

test('Reset completion validates token type and fixed length before service access', async (t) => {
    configure(t);
    for (const invalidToken of [undefined, null, 42, {}, ['a'.repeat(43)], '', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}+`, `${'a'.repeat(42)}\n`]) {
        const fixture = harness();
        const res = response();
        await fixture.handler(request({ body: { action: 'complete', token: invalidToken, password } }), res);
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: 'RESET_INVALID' });
        assert.equal(res.headers['set-cookie'], undefined);
        assertNoServiceWork(fixture.calls);
    }
});

test('Reset completion rejects non-string passwords and enforces 12 to 200 characters', async (t) => {
    configure(t);
    for (const [invalidPassword, code] of [
        [undefined, 'PASSWORD_INVALID'], [null, 'PASSWORD_INVALID'], [123456789012, 'PASSWORD_INVALID'],
        [{}, 'PASSWORD_INVALID'], [['long-enough-password'], 'PASSWORD_INVALID'],
        ['', 'PASSWORD_TOO_SHORT'], ['a'.repeat(11), 'PASSWORD_TOO_SHORT'], ['a'.repeat(201), 'PASSWORD_TOO_LONG'],
    ]) {
        const fixture = harness();
        const res = response();
        await fixture.handler(request({ body: { action: 'complete', token, password: invalidPassword } }), res);
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: code });
        assertNoServiceWork(fixture.calls);
    }
    for (const acceptedPassword of ['a'.repeat(12), 'a'.repeat(200)]) {
        const fixture = harness();
        const res = response();
        await fixture.handler(request({ body: { action: 'complete', token, password: acceptedPassword } }), res);
        await fixture.drain();
        assert.equal(res.statusCode, 200);
        assert.equal(fixture.calls.complete[0][1], acceptedPassword);
    }
});

test('Invalid, expired or used completion tokens return the same 400; throttling returns 429', async (t) => {
    configure(t);
    for (const [code, status] of [['RESET_INVALID', 400], ['RATE_LIMITED', 429]]) {
        const fixture = harness({ service: { async complete() { throw Object.assign(new Error('Internal details never returned'), { code }); } } });
        const res = response();
        await fixture.handler(request({ body: { action: 'complete', token, password } }), res);
        assert.equal(res.statusCode, status);
        assert.deepEqual(res.payload, { error: code });
        assert.equal(res.headers['set-cookie'], undefined);
        assert.equal(fixture.calls.background.length, 0);
        assert.deepEqual(fixture.calls.notice, []);
        assert.deepEqual(fixture.calls.logs, []);
    }
});

test('Unexpected completion errors return generic 503 with only a fixed safe log code', async (t) => {
    configure(t);
    for (const failure of [new Error(`Database query ${storedEmail} ${token} ${password}`), { code: 'PRIVATE_DB_ERROR', message: 'secret connection details' }]) {
        const fixture = harness({ service: { async complete() { throw failure; } } });
        const res = response();
        await fixture.handler(request({ body: { action: 'complete', token, password } }), res);
        assert.equal(res.statusCode, 503);
        assert.deepEqual(res.payload, { error: 'RESET_UNAVAILABLE' });
        assert.deepEqual(fixture.calls.logs, ['ADMIN_PASSWORD_RESET_UNAVAILABLE']);
        assert.equal(res.headers['set-cookie'], undefined);
        assert.deepEqual(fixture.calls.background, []);
        assert.deepEqual(fixture.calls.notice, []);
    }
});
