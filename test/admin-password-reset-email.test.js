import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOP_EMAIL } from '../api/_lib/confirmation-email.js';
import {
    passwordResetOrigin, sendAdminPasswordResetEmail, sendAdminPasswordChangedEmail,
} from '../api/_lib/admin-password-reset-email.js';

const sample = { email: 'admin@example.com', token: 'a'.repeat(43) };
const origin = 'https://staging.example.com';

function configure(t, overrides = {}) {
    const values = {
        ADMIN_PASSWORD_RESET_ENABLED: 'true',
        PUBLIC_SITE_URL: origin,
        SMTP_USER: SHOP_EMAIL,
        SMTP_APP_PASSWORD: 'synthetic-smtp-test-only',
        ORDER_EMAIL_TEST_ENABLED: 'false',
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

function noTransport() {
    assert.fail('Rejected recovery mail must not create an SMTP transport');
}

function fakeTransport({ accepted = [sample.email], error, closeError } = {}) {
    const calls = { options: null, messages: [], closes: 0 };
    return {
        calls,
        createTransport(options) {
            calls.options = options;
            return {
                async sendMail(message) {
                    calls.messages.push(message);
                    if (error) throw error;
                    return { accepted, response: `Private SMTP response for ${sample.email}`, messageId: 'synthetic' };
                },
                close() {
                    calls.closes += 1;
                    if (closeError) throw closeError;
                },
            };
        },
    };
}

test('Recovery origin requires configured HTTPS origin without credentials, paths or redirects', (t) => {
    configure(t);
    for (const source of [origin, `${origin}/`, 'https://staging.example.com:443']) {
        process.env.PUBLIC_SITE_URL = source;
        assert.equal(passwordResetOrigin(), origin);
    }
    const invalid = [
        '', 'not-a-url', 'http://staging.example.com', '//staging.example.com',
        'https://admin:password@staging.example.com', 'https://admin@staging.example.com',
        `${origin}/admin`, `${origin}/./`, `${origin}?next=https://evil.example`,
        `${origin}#token=secret`, 'https://staging.example.com:8443',
        'https://staging.example.com\\@evil.example', 'https://stag\ning.example.com',
    ];
    for (const source of invalid) {
        process.env.PUBLIC_SITE_URL = source;
        assert.throws(passwordResetOrigin, { code: 'RESET_UNAVAILABLE' });
    }
    delete process.env.PUBLIC_SITE_URL;
    assert.throws(passwordResetOrigin, { code: 'RESET_UNAVAILABLE' });
});

test('Recovery mail requires its own explicit flag, approved sender, SMTP secret and trusted origin', async (t) => {
    configure(t);
    const invalid = [
        ['ADMIN_PASSWORD_RESET_ENABLED', undefined], ['ADMIN_PASSWORD_RESET_ENABLED', 'false'],
        ['ADMIN_PASSWORD_RESET_ENABLED', '1'], ['SMTP_USER', 'other@example.com'],
        ['SMTP_APP_PASSWORD', ''], ['SMTP_APP_PASSWORD', '  '], ['PUBLIC_SITE_URL', undefined],
    ];
    for (const [key, value] of invalid) {
        const old = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
        for (const send of [sendAdminPasswordResetEmail, sendAdminPasswordChangedEmail]) {
            await assert.rejects(send(sample, { createTransport: noTransport }), { code: 'RESET_UNAVAILABLE' });
        }
        process.env[key] = old;
    }
});

test('Recovery mail rejects recipient lists, names, header injection and oversized addresses', async (t) => {
    configure(t);
    for (const email of [
        'one@example.com,two@example.com', 'one@example.com;two@example.com',
        'Admin <admin@example.com>', 'admin@example.com\r\nBcc: victim@example.com',
        'admin@example.com\n', 'admin @example.com', 'admin@localhost',
        `${'a'.repeat(254)}@example.com`, undefined, null,
    ]) {
        for (const send of [sendAdminPasswordResetEmail, sendAdminPasswordChangedEmail]) {
            await assert.rejects(send({ ...sample, email }, { createTransport: noTransport }), { code: 'EMAIL_RECIPIENT_INVALID' });
        }
    }
});

test('Recovery mail validates fixed-length base64url token before creating transport', async (t) => {
    configure(t);
    for (const token of [undefined, null, '', 'a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}+`, `${'a'.repeat(42)}\n`, '"/><script>alert(1)</script>']) {
        await assert.rejects(sendAdminPasswordResetEmail({ ...sample, token }, { createTransport: noTransport }), { code: 'RESET_INVALID' });
    }
});

test('Recovery mail uses only configured origin and a fragment token with Czech expiry and safety copy', async (t) => {
    configure(t);
    const fake = fakeTransport();
    const result = await sendAdminPasswordResetEmail({ ...sample, resetUrl: 'https://evil.example', origin: 'https://evil.example' }, fake);
    assert.deepEqual(result, { sent: true });
    const message = fake.calls.messages[0];
    const expected = `${origin}/admin/reset-password#token=${sample.token}`;
    assert.equal(message.subject, 'Obnovení hesla · Maminko, mluv se mnou');
    assert.ok(message.text.includes(expected));
    assert.ok(message.html.includes(`href="${expected}"`));
    for (const content of [message.text, message.html]) {
        assert.match(content, /15 minut/);
        assert.match(content, /ignorujte/);
        assert.match(content, /Heslo nám neposílejte/);
        assert.doesNotMatch(content, /evil\.example|\?token=|synthetic-smtp-test-only/);
    }
    assert.equal(message.cc, undefined);
    assert.equal(message.bcc, undefined);
    assert.equal(fake.calls.closes, 1);
});

test('Recovery mail escapes HTML link attributes and ignores untrusted display fields', async (t) => {
    configure(t, { PUBLIC_SITE_URL: 'https://shop&co.example' });
    const fake = fakeTransport();
    await sendAdminPasswordResetEmail({ ...sample, displayName: '<script>bad()</script>' }, fake);
    const message = fake.calls.messages[0];
    assert.ok(message.text.includes('https://shop&co.example/admin/reset-password#token='));
    assert.ok(message.html.includes('href="https://shop&amp;co.example/admin/reset-password#token='));
    assert.doesNotMatch(message.html, /<script>|bad\(\)/);
});

test('Recovery SMTP enforces TLS, bounded timeouts, one recipient, fixed sender and closes', async (t) => {
    configure(t);
    const fake = fakeTransport({ accepted: [sample.email.toUpperCase()] });
    await sendAdminPasswordResetEmail(sample, fake);
    assert.equal(fake.calls.options.host, 'smtp.seznam.cz');
    assert.equal(fake.calls.options.port, 465);
    assert.equal(fake.calls.options.secure, true);
    assert.equal(fake.calls.options.disableFileAccess, true);
    assert.equal(fake.calls.options.disableUrlAccess, true);
    assert.equal(fake.calls.options.maxRecipients, 1);
    assert.equal(fake.calls.options.connectionTimeout, 10000);
    assert.equal(fake.calls.options.greetingTimeout, 10000);
    assert.equal(fake.calls.options.socketTimeout, 15000);
    assert.deepEqual(fake.calls.options.auth, { user: SHOP_EMAIL, pass: 'synthetic-smtp-test-only' });
    const message = fake.calls.messages[0];
    assert.deepEqual(message.from, { name: 'Maminko, mluv se mnou', address: SHOP_EMAIL });
    assert.deepEqual(message.to, { address: sample.email });
    assert.deepEqual(message.replyTo, { address: SHOP_EMAIL });
    assert.equal(fake.calls.closes, 1);
});

test('Password-changed security notice contains no password or reset token and confirms session revocation', async (t) => {
    configure(t);
    const fake = fakeTransport();
    assert.deepEqual(await sendAdminPasswordChangedEmail({ ...sample, password: 'NEVER_INCLUDE_PASSWORD' }, fake), { sent: true });
    const message = fake.calls.messages[0];
    assert.match(message.subject, /Heslo do administrace bylo změněno/);
    for (const content of [message.text, message.html]) {
        assert.match(content, /dřívější přihlášení byla ukončena/);
        assert.match(content, /Pokud jste heslo nezměnili vy/);
        assert.doesNotMatch(content, /NEVER_INCLUDE_PASSWORD|token=|reset-password|synthetic-smtp-test-only/);
        assert.equal(content.includes(sample.token), false);
    }
    assert.equal(fake.calls.closes, 1);
});

test('Recovery SMTP rejection and transport failures are sanitized and still close the transport', async (t) => {
    configure(t);
    for (const accepted of [[], ['different@example.com'], undefined]) {
        const fake = fakeTransport({ accepted: accepted ?? [] });
        await assert.rejects(sendAdminPasswordResetEmail(sample, fake), { code: 'RESET_EMAIL_FAILED', message: 'RESET_EMAIL_FAILED' });
        assert.equal(fake.calls.closes, 1);
    }
    const sensitiveError = new Error(`SMTP leaked ${sample.email} ${sample.token} synthetic-smtp-test-only`);
    const fake = fakeTransport({ error: sensitiveError, closeError: sensitiveError });
    await assert.rejects(sendAdminPasswordResetEmail(sample, fake), (error) => {
        assert.equal(error.code, 'RESET_EMAIL_FAILED');
        assert.equal(error.message, 'RESET_EMAIL_FAILED');
        assert.equal(error.cause, undefined);
        return true;
    });
    assert.equal(fake.calls.closes, 1);
    await assert.rejects(sendAdminPasswordResetEmail(sample, {
        createTransport() { throw sensitiveError; },
    }), { code: 'RESET_EMAIL_FAILED', message: 'RESET_EMAIL_FAILED' });
});
