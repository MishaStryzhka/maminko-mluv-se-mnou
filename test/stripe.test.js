import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { buildStripeCheckoutParams, stripeCheckoutReady, stripeConfiguration, stripeClient, stripeWebhookClient } from '../api/_lib/stripe.js';
import webhookHandler, { statusFromEvent } from '../api/stripe-webhook.js';

const sample = {
    id: 'a52b09d8-87cf-4448-994a-0c93f5f45f90',
    orderNumber: 'MAM-2026-ABC123',
    publicToken: 'opaque-token',
    customerEmail: 'customer@example.com',
    productCode: 'full',
    productName: 'Kompletní balíček',
    productPrice: 750,
    shippingMethod: 'pickup',
    shippingPrice: 89,
    lang: 'cs',
};

test('Stripe Checkout sends server-side prices and order reference', () => {
    const params = buildStripeCheckoutParams(sample, 'https://maminko-mluv-se-mnou.cz/');
    assert.equal(params.mode, 'payment');
    assert.equal(params.line_items.length, 2);
    assert.equal(params.line_items[0].price_data.unit_amount, 75000);
    assert.equal(params.line_items[1].price_data.unit_amount, 8900);
    assert.equal(params.client_reference_id, sample.orderNumber);
    assert.equal(params.metadata.orderId, sample.id);
    assert.equal(params.customer_email, sample.customerEmail);
    assert.equal(params.locale, 'cs');
    const success = new URL(params.success_url);
    assert.equal(success.searchParams.get('order'), sample.orderNumber);
    assert.equal(success.searchParams.get('token'), sample.publicToken);
    assert.equal(success.searchParams.get('session_id'), '{CHECKOUT_SESSION_ID}');
    assert.match(params.success_url, /session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.equal(new URL(params.cancel_url).searchParams.get('payment'), 'cancelled');
});

test('Stripe Checkout can create a print-only line item with free shipping', () => {
    const params = buildStripeCheckoutParams({ ...sample, productCode: 'print', productPrice: 490, shippingPrice: 0, lang: 'uk' }, 'https://example.cz');
    assert.equal(params.line_items.length, 1);
    assert.equal(params.line_items[0].price_data.unit_amount, 49000);
    assert.equal(params.locale, 'auto');
});

test('Invalid origin is rejected to protect checkout redirects', () => {
    assert.throws(() => buildStripeCheckoutParams(sample, 'http://invalid.example'), /HTTPS origin/);
    assert.throws(() => buildStripeCheckoutParams(sample, 'https://valid.example/path'), /HTTPS origin/);
});

test('Stripe is opt-in and live keys require an extra explicit switch', () => {
    const original = {
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_CHECKOUT_ENABLED: process.env.STRIPE_CHECKOUT_ENABLED,
        STRIPE_ALLOW_LIVE: process.env.STRIPE_ALLOW_LIVE,
    };
    try {
        process.env.STRIPE_SECRET_KEY = 'sk_live_example';
        process.env.STRIPE_CHECKOUT_ENABLED = 'true';
        delete process.env.STRIPE_ALLOW_LIVE;
        assert.equal(stripeConfiguration().enabled, false);
        assert.throws(() => stripeClient(), { code: 'PAYMENTS_NOT_READY' });
        process.env.STRIPE_ALLOW_LIVE = 'true';
        assert.equal(stripeConfiguration().enabled, true);
        process.env.STRIPE_SECRET_KEY = 'sk_test_example';
        delete process.env.STRIPE_ALLOW_LIVE;
        assert.equal(stripeConfiguration().enabled, true);
        process.env.STRIPE_SECRET_KEY = 'rk_test_example';
        assert.deepEqual({ ...stripeConfiguration() }, { enabled: true, test: true, live: false });
        assert.ok(stripeWebhookClient());
        process.env.STRIPE_SECRET_KEY = 'rk_live_example';
        assert.equal(stripeConfiguration().enabled, false);
        process.env.STRIPE_ALLOW_LIVE = 'true';
        assert.equal(stripeConfiguration().enabled, true);
        delete process.env.STRIPE_ALLOW_LIVE;
        process.env.STRIPE_SECRET_KEY = 'rk_test_example';
        delete process.env.STRIPE_CHECKOUT_ENABLED;
        assert.equal(stripeConfiguration().enabled, false);
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('Only verified payment events mark the order paid', () => {
    const session = { payment_status: 'unpaid' };
    assert.equal(statusFromEvent({ type: 'checkout.session.completed', data: { object: session } }), 'pending');
    assert.equal(statusFromEvent({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid' } } }), 'paid');
    assert.equal(statusFromEvent({ type: 'checkout.session.async_payment_succeeded', data: { object: session } }), 'paid');
    assert.equal(statusFromEvent({ type: 'checkout.session.async_payment_failed', data: { object: session } }), 'failed');
    assert.equal(statusFromEvent({ type: 'checkout.session.expired', data: { object: session } }), 'cancelled');
    assert.equal(statusFromEvent({ type: 'invoice.paid', data: { object: {} } }), null);
});

test('Checkout requires database, HTTPS origin, and signed webhooks', () => {
    const keys = ['STRIPE_SECRET_KEY', 'STRIPE_CHECKOUT_ENABLED', 'STRIPE_WEBHOOK_SECRET', 'DATABASE_URL', 'PUBLIC_SITE_URL'];
    const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
        Object.assign(process.env, {
            STRIPE_SECRET_KEY: 'sk_test_example',
            STRIPE_CHECKOUT_ENABLED: 'true',
            STRIPE_WEBHOOK_SECRET: 'whsec_example',
            DATABASE_URL: 'postgres://example',
            PUBLIC_SITE_URL: 'https://example.cz',
        });
        assert.equal(stripeCheckoutReady(), true);
        delete process.env.STRIPE_WEBHOOK_SECRET;
        assert.equal(stripeCheckoutReady(), false);
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
        process.env.PUBLIC_SITE_URL = 'http://example.cz';
        assert.equal(stripeCheckoutReady(), false);
    } finally {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('Webhook rejects an unsigned request before any database update', async () => {
    const originalKey = process.env.STRIPE_SECRET_KEY;
    const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
    try {
        process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';
        const req = Readable.from([Buffer.from('{"type":"checkout.session.completed"}')]);
        req.method = 'POST';
        req.headers = { 'stripe-signature': 'invalid' };
        const res = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(value) { this.payload = value; return this; },
        };
        const oldWarn = console.warn;
        console.warn = () => {};
        try { await webhookHandler(req, res); } finally { console.warn = oldWarn; }
        assert.equal(res.statusCode, 400);
        assert.equal(res.payload.error, 'WEBHOOK_INVALID');
    } finally {
        if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
        else process.env.STRIPE_SECRET_KEY = originalKey;
        if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
        else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    }
});
