import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SHOP_EMAIL, buildConfirmationEmail, ownerTestEmailEnabled,
    sendConfirmationEmail, smtpConfigurationReady, smtpUser,
} from '../api/_lib/confirmation-email.js';

const sample = {
    order_number: 'MAM-2026-ABC123',
    customer_name: 'Jan Novák',
    customer_email: 'buyer@example.com',
    lang: 'cs',
    product_code: 'full',
    product_name: 'Kompletní balíček',
    product_price: 750,
    shipping_method: 'pickup',
    shipping_price: 89,
    pickup_point_name: 'Testovací výdejní místo',
    pickup_point_address: 'Testovací 12',
    pickup_point_zip: '110 00',
    address_street: 'Testovací 21',
    address_city: 'Praha',
    address_zip: '110 00',
    total_amount: 839,
    payment_test_mode: false,
};

function configure(t, overrides = {}) {
    const values = {
        SMTP_USER: SHOP_EMAIL,
        SMTP_APP_PASSWORD: 'test-only-not-a-real-password',
        ORDER_EMAIL_TEST_ENABLED: undefined,
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
    assert.fail('Rejected email must not create an SMTP transport');
}

function fakeTransport({ accepted = [sample.customer_email], error } = {}) {
    const calls = { options: null, messages: [], closes: 0 };
    return {
        calls,
        createTransport(options) {
            calls.options = options;
            return {
                async sendMail(message) {
                    calls.messages.push(message);
                    if (error) throw error;
                    return { accepted, messageId: message.messageId };
                },
                close() { calls.closes += 1; },
            };
        },
    };
}

test('SMTP configuration permits only the approved normalized shop sender and a nonempty secret', (t) => {
    configure(t, { SMTP_USER: `  ${SHOP_EMAIL.toUpperCase()}  ` });
    assert.equal(smtpUser(), SHOP_EMAIL);
    assert.equal(smtpConfigurationReady(), true);
    for (const sender of ['glamgarbrentals@seznam.cz', 'other@example.com', '']) {
        process.env.SMTP_USER = sender;
        assert.equal(smtpConfigurationReady(), false);
    }
    process.env.SMTP_USER = SHOP_EMAIL;
    process.env.SMTP_APP_PASSWORD = ' \t ';
    assert.equal(smtpConfigurationReady(), false);
    delete process.env.SMTP_APP_PASSWORD;
    assert.equal(smtpConfigurationReady(), false);
});

test('Owner test email requires the explicit true flag and the approved sender', (t) => {
    configure(t);
    assert.equal(ownerTestEmailEnabled(), false);
    process.env.ORDER_EMAIL_TEST_ENABLED = '1';
    assert.equal(ownerTestEmailEnabled(), false);
    process.env.ORDER_EMAIL_TEST_ENABLED = 'true';
    assert.equal(ownerTestEmailEnabled(), true);
    process.env.SMTP_USER = 'other@example.com';
    assert.equal(ownerTestEmailEnabled(), false);
});

test('Czech confirmation includes paid totals, pickup details, seller, and digital follow-up', () => {
    const result = buildConfirmationEmail(sample);
    assert.equal(result.subject, `Potvrzení přijetí objednávky ${sample.order_number}`);
    for (const value of [sample.customer_name, sample.product_name, sample.order_number, '750 Kč', '89 Kč', '839 Kč', sample.pickup_point_name, 'GlamGarb Rentals s.r.o.']) {
        assert.ok(result.text.includes(value));
        assert.ok(result.html.includes(value));
    }
    assert.match(result.text, /Pokyny ke zpřístupnění digitálních materiálů/);
    assert.doesNotMatch(result.subject, /\[TEST\]/);
});

test('Ukrainian print-only confirmation uses home delivery and omits digital follow-up', () => {
    const result = buildConfirmationEmail({ ...sample, lang: 'uk', product_code: 'print', shipping_method: 'address' });
    assert.match(result.subject, /^Підтвердження прийняття замовлення /);
    assert.match(result.text, /Balíkovna на адресу/);
    assert.ok(result.text.includes('Testovací 21, 110 00, Praha, Česká republika'));
    assert.doesNotMatch(result.text, /Інструкції для доступу до цифрових матеріалів/);
    assert.match(buildConfirmationEmail({ ...sample, lang: 'unknown' }).subject, /^Potvrzení/);
});

test('HTML confirmation escapes all untrusted display fields', () => {
    const payload = `<script>alert("x")</script> & 'quoted'`;
    const result = buildConfirmationEmail({
        ...sample,
        customer_name: payload,
        product_name: payload,
        pickup_point_name: payload,
        pickup_point_address: payload,
        pickup_point_zip: payload,
    });
    assert.doesNotMatch(result.html, /<script>/i);
    assert.ok(result.html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;'));
    assert.ok(result.text.includes(payload));
});

test('Test confirmations have explicit non-payment and non-contract disclaimers in both languages', () => {
    for (const [lang, disclaimer, liveIntro] of [
        ['cs', 'Nejde o skutečnou platbu, objednávku ani potvrzení smlouvy', 'Potvrzujeme přijetí a úhradu'],
        ['uk', 'Це не справжня оплата, замовлення чи підтвердження договору', 'Підтверджуємо отримання та оплату'],
    ]) {
        const result = buildConfirmationEmail({ ...sample, lang, payment_test_mode: true });
        assert.match(result.subject, /^\[TEST\] /);
        assert.ok(result.text.includes(disclaimer));
        assert.ok(result.html.includes(disclaimer));
        assert.equal(result.text.includes(liveIntro), false);
        assert.equal(result.html.includes(liveIntro), false);
    }
});

test('SMTP uses TLS, disabled file and URL access, one recipient, and closes after success', async (t) => {
    configure(t);
    const fake = fakeTransport({ accepted: [sample.customer_email.toUpperCase()] });
    const result = await sendConfirmationEmail(sample, fake);
    assert.equal(fake.calls.options.host, 'smtp.seznam.cz');
    assert.equal(fake.calls.options.port, 465);
    assert.equal(fake.calls.options.secure, true);
    assert.equal(fake.calls.options.disableFileAccess, true);
    assert.equal(fake.calls.options.disableUrlAccess, true);
    assert.equal(fake.calls.options.maxRecipients, 1);
    assert.equal(fake.calls.options.auth.user, SHOP_EMAIL);
    assert.equal(fake.calls.options.auth.pass, 'test-only-not-a-real-password');
    assert.equal(fake.calls.messages.length, 1);
    const message = fake.calls.messages[0];
    assert.deepEqual(message.from, { name: 'Maminko, mluv se mnou', address: SHOP_EMAIL });
    assert.deepEqual(message.to, { address: sample.customer_email });
    assert.deepEqual(message.replyTo, { address: SHOP_EMAIL });
    assert.equal(message.messageId, '<mam-2026-abc123.confirmation@maminko-mluv-se-mnou.cz>');
    assert.deepEqual(result.accepted, [sample.customer_email.toUpperCase()]);
    assert.equal(fake.calls.closes, 1);
});

test('SMTP configuration errors are rejected before any network transport is created', async (t) => {
    configure(t, { SMTP_APP_PASSWORD: undefined });
    await assert.rejects(sendConfirmationEmail(sample, { createTransport: noTransport }), { code: 'SMTP_NOT_CONFIGURED' });
});

test('SMTP rejects recipient lists, display names, header injection, invalid and oversized addresses', async (t) => {
    configure(t);
    const invalidRecipients = [
        'first@example.com,second@example.com',
        'first@example.com;second@example.com',
        'Buyer <buyer@example.com>',
        'buyer@example.com\r\nBcc: victim@example.com',
        'buyer@example.com\n',
        'buyer @example.com',
        'not-an-email',
        'buyer@localhost',
        `${'a'.repeat(250)}@example.com`,
        null,
    ];
    for (const customer_email of invalidRecipients) {
        await assert.rejects(sendConfirmationEmail({ ...sample, customer_email }, { createTransport: noTransport }), { code: 'EMAIL_RECIPIENT_INVALID' });
    }
});

test('SMTP requires a boolean payment mode and safe generated order number', async (t) => {
    configure(t);
    for (const payment_test_mode of [undefined, null, 'false', 0]) {
        await assert.rejects(sendConfirmationEmail({ ...sample, payment_test_mode }, { createTransport: noTransport }), { code: 'EMAIL_PAYMENT_MODE_INVALID' });
    }
    for (const order_number of ['arbitrary', 'MAM-2026-ABC\r\nBcc: x@example.com', 'MAM-2026-ABC<script>']) {
        await assert.rejects(sendConfirmationEmail({ ...sample, order_number }, { createTransport: noTransport }), { code: 'EMAIL_ORDER_NUMBER_INVALID' });
    }
});

test('SMTP test confirmations are suppressed by default and never target an unrelated customer', async (t) => {
    configure(t);
    const ownerOrder = { ...sample, customer_email: SHOP_EMAIL, payment_test_mode: true };
    await assert.rejects(sendConfirmationEmail(ownerOrder, { createTransport: noTransport }), { code: 'TEST_EMAIL_NOT_ALLOWED' });
    process.env.ORDER_EMAIL_TEST_ENABLED = 'true';
    await assert.rejects(sendConfirmationEmail({ ...sample, payment_test_mode: true }, { createTransport: noTransport }), { code: 'TEST_EMAIL_NOT_ALLOWED' });
});

test('Explicitly enabled SMTP test sends only to the owner with a separate test message ID', async (t) => {
    configure(t, { ORDER_EMAIL_TEST_ENABLED: 'true' });
    const fake = fakeTransport({ accepted: [SHOP_EMAIL] });
    await sendConfirmationEmail({ ...sample, customer_email: SHOP_EMAIL.toUpperCase(), payment_test_mode: true }, fake);
    assert.deepEqual(fake.calls.messages[0].to, { address: SHOP_EMAIL.toUpperCase() });
    assert.match(fake.calls.messages[0].subject, /^\[TEST\] /);
    assert.equal(fake.calls.messages[0].messageId, '<mam-2026-abc123.test-confirmation@maminko-mluv-se-mnou.cz>');
    assert.equal(fake.calls.closes, 1);
});

test('SMTP recipient rejection and send failure both close the transport', async (t) => {
    configure(t);
    for (const accepted of [[], ['other@example.com']]) {
        const fake = fakeTransport({ accepted });
        await assert.rejects(sendConfirmationEmail(sample, fake), { code: 'SMTP_RECIPIENT_REJECTED' });
        assert.equal(fake.calls.closes, 1);
    }
    const failure = Object.assign(new Error('Synthetic send failure'), { code: 'ECONNECTION' });
    const fake = fakeTransport({ error: failure });
    await assert.rejects(sendConfirmationEmail(sample, fake), (error) => error === failure);
    assert.equal(fake.calls.closes, 1);
});
