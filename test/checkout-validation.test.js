import test from 'node:test';
import assert from 'node:assert/strict';
import checkoutHandler from '../api/checkout.js';
import { validRecipient } from '../api/_lib/confirmation-email.js';

function validBody(email) {
    return {
        product: 'full',
        lang: 'cs',
        shipping: 'pickup',
        customer: { name: 'Test Buyer', email, phone: '+420123456789' },
        termsAccepted: true,
        digitalConsent: true,
        pickup: { id: 'test-pickup', name: 'Test pickup point' },
    };
}

function disableCheckout(t) {
    const values = {
        STRIPE_CHECKOUT_ENABLED: 'false',
        STRIPE_ALLOW_LIVE: 'false',
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
        DATABASE_URL: undefined,
    };
    const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });
}

async function checkout(body) {
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
    };
    await checkoutHandler({ method: 'POST', body }, res);
    return res;
}

test('Shared recipient validator accepts single addresses and enforces the 254-character boundary', () => {
    for (const email of ['buyer@example.com', 'Buyer.Name+tag@sub-domain.example.cz', "o'connor@example.com"]) {
        assert.equal(validRecipient(email), true);
    }
    const maximumLength = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.cz`;
    assert.equal(maximumLength.length, 254);
    assert.equal(validRecipient(maximumLength), true);
    assert.equal(validRecipient(`a${maximumLength}`), false);
});

test('Shared recipient validator rejects lists, display names, controls, and non-string values', () => {
    for (const email of [
        'buyer@example.com,other@example.com',
        'buyer@example.com;other@example.com',
        'Buyer <buyer@example.com>',
        'Group: buyer@example.com;',
        'buyer@example.com\r\nBcc: victim@example.com',
        'buyer@example.com\n',
        'buyer\u0000@example.com',
        'buyer @example.com',
        ' buyer@example.com ',
        'buyer@localhost',
        '', undefined, null, 123, ['buyer@example.com'], { address: 'buyer@example.com' },
    ]) {
        assert.equal(validRecipient(email), false);
    }
});

test('Checkout rejects recipient lists and header injection before payment readiness or database access', async (t) => {
    disableCheckout(t);
    for (const email of [
        'buyer@example.com,other@example.com',
        'buyer@example.com;other@example.com',
        'Buyer <buyer@example.com>',
        'buyer@example.com\r\nBcc: victim@example.com',
        'buyer@example.com\nCc: victim@example.com',
        'buyer@example.com\r\nSubject: injected',
        'buyer\u0000@example.com',
    ]) {
        const res = await checkout(validBody(email));
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: 'EMAIL_INVALID' });
    }
});

test('Checkout rejects overlong or non-string email without truncating it into an accepted address', async (t) => {
    disableCheckout(t);
    const oversized = `${'a'.repeat(250)}@example.com`;
    for (const email of [oversized, `  ${oversized}  `, undefined, null, 123, ['buyer@example.com'], { address: 'buyer@example.com' }]) {
        const res = await checkout(validBody(email));
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: 'EMAIL_INVALID' });
    }
});

test('Checkout accepts a trimmed single email and stops at PAYMENTS_NOT_READY when disabled', async (t) => {
    disableCheckout(t);
    for (const email of ['buyer@example.com', '  Buyer.Name+tag@example.cz  ', '\tbuyer@example.com\t']) {
        for (const encode of [(body) => body, (body) => JSON.stringify(body)]) {
            const res = await checkout(encode(validBody(email)));
            assert.equal(res.statusCode, 503);
            assert.deepEqual(res.payload, { error: 'PAYMENTS_NOT_READY' });
        }
    }
});
