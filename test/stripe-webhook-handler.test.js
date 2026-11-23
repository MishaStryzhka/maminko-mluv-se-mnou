import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import Stripe from 'stripe';
import { createStripeWebhookHandler, eventModeMatches } from '../api/stripe-webhook.js';

// SDK HMAC signing/verification only. No Stripe request or real credential.
const sdk = new Stripe('sk_test_synthetic_offline_only');
const secret = 'whsec_synthetic_offline_only';

function configure(t, overrides = {}) {
    const values = {
        STRIPE_SECRET_KEY: 'sk_test_synthetic_offline_only',
        STRIPE_WEBHOOK_SECRET: secret,
        STRIPE_CHECKOUT_ENABLED: 'false',
        STRIPE_ALLOW_LIVE: 'false',
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

function refundEvent(overrides = {}) {
    return {
        id: 'evt_offline_refund', object: 'event', created: 1800000000,
        type: 'refund.updated', livemode: false,
        data: { object: {
            id: 're_offline_refund', object: 'refund', charge: 'ch_offline',
            payment_intent: 'pi_offline', currency: 'czk', amount: 60900, status: 'succeeded',
        } },
        ...overrides,
    };
}

function checkoutEvent(type = 'checkout.session.completed', paymentStatus = 'paid') {
    return {
        id: 'evt_offline_checkout', object: 'event', created: 1800000000, type, livemode: false,
        data: { object: {
            object: 'checkout.session', id: 'cs_test_offline', mode: 'payment',
            payment_status: paymentStatus, payment_intent: 'pi_offline',
            amount_total: 60900, currency: 'czk', livemode: false,
            client_reference_id: 'MAM-2026-OFFLINE', metadata: { orderId: '9c05d20f-5d81-479e-9c6e-505d013182cc' },
        } },
    };
}

function signedRequest(event, { payload = JSON.stringify(event), signature, method = 'POST', timestamp } = {}) {
    const req = Readable.from([Buffer.from(payload)]);
    req.method = method;
    req.headers = {
        'stripe-signature': signature ?? sdk.webhooks.generateTestHeaderString({
            payload, secret, ...(timestamp === undefined ? {} : { timestamp }),
        }),
    };
    return req;
}

function response() {
    return {
        headers: {}, statusCode: null, payload: undefined,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
    };
}

function fixture(overrides = {}) {
    const calls = { client: 0, payments: [], refunds: [], confirmations: [], logs: [] };
    const order = { order_number: 'MAM-2026-OFFLINE', payment_test_mode: true, customer_email: 'synthetic@example.com' };
    return {
        calls, order,
        handler: createStripeWebhookHandler({
            client() { calls.client += 1; return sdk; },
            async updatePayment(...args) { calls.payments.push(args); return order; },
            async updateRefund(...args) { calls.refunds.push(args); return order; },
            async deliverConfirmation(...args) { calls.confirmations.push(args); },
            logger: {
                warn(...args) { calls.logs.push(args); },
                error(...args) { calls.logs.push(args); },
            },
            ...overrides,
        }),
    };
}

function assertNoMutation(calls) {
    assert.deepEqual(calls.payments, []);
    assert.deepEqual(calls.refunds, []);
    assert.deepEqual(calls.confirmations, []);
}

test('Signed refund lifecycle events without object.livemode reconcile passively and never send paid receipts', async (t) => {
    configure(t);
    for (const [type, status] of [
        ['refund.created', 'pending'], ['refund.updated', 'succeeded'], ['refund.failed', 'failed'],
    ]) {
        const f = fixture();
        const event = refundEvent({ type });
        event.data.object.status = status;
        assert.equal(Object.hasOwn(event.data.object, 'livemode'), false);
        const res = response();
        await f.handler(signedRequest(event), res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.payload, { received: true });
        assert.equal(f.calls.refunds.length, 1);
        assert.deepEqual(f.calls.refunds[0][0], event);
        assert.deepEqual(f.calls.payments, []);
        assert.deepEqual(f.calls.confirmations, []);
    }
});

test('Refund mode comes from the signed envelope; Checkout still requires matching envelope and object modes', (t) => {
    configure(t);
    assert.equal(eventModeMatches(refundEvent()), true);
    assert.equal(eventModeMatches(refundEvent({ livemode: true })), false);
    assert.equal(eventModeMatches(refundEvent({ livemode: undefined })), false);
    const checkout = checkoutEvent();
    assert.equal(eventModeMatches(checkout), true);
    checkout.data.object.livemode = true;
    assert.equal(eventModeMatches(checkout), false);
    delete checkout.data.object.livemode;
    assert.equal(eventModeMatches(checkout), false);
});

test('Unsigned, tampered and expired signatures cannot reach either reconciliation path', async (t) => {
    configure(t);
    const event = refundEvent();
    const original = JSON.stringify(event);
    const signature = sdk.webhooks.generateTestHeaderString({ payload: original, secret });
    const unsigned = signedRequest(event);
    delete unsigned.headers['stripe-signature'];
    for (const req of [
        unsigned,
        signedRequest(event, { signature: 'invalid' }),
        signedRequest(event, { payload: `${original} `, signature }),
        signedRequest(event, { timestamp: Math.floor(Date.now() / 1000) - 1000 }),
    ]) {
        const f = fixture();
        const res = response();
        await f.handler(req, res);
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: 'WEBHOOK_INVALID' });
        assertNoMutation(f.calls);
        assert.equal(JSON.stringify(f.calls.logs).includes(original), false);
        assert.equal(JSON.stringify(f.calls.logs).includes(secret), false);
    }
});

test('Webhook signature is checked before ignoring unsupported events', async (t) => {
    configure(t);
    const f = fixture();
    const res = response();
    await f.handler(signedRequest(refundEvent({ type: 'unsupported.event' }), { signature: 'invalid' }), res);
    assert.equal(res.statusCode, 400);
    assertNoMutation(f.calls);
});

test('Authentic unrelated events are acknowledged without payment, refund or confirmation writes', async (t) => {
    configure(t);
    const f = fixture();
    const res = response();
    await f.handler(signedRequest(refundEvent({ type: 'invoice.paid' })), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { received: true });
    assertNoMutation(f.calls);
});

test('Signed wrong-mode refunds are rejected before mutation', async (t) => {
    configure(t);
    for (const livemode of [true, undefined, 'false']) {
        const f = fixture();
        const res = response();
        await f.handler(signedRequest(refundEvent({ livemode })), res);
        assert.equal(res.statusCode, 400);
        assert.deepEqual(res.payload, { error: 'WEBHOOK_MODE_MISMATCH' });
        assertNoMutation(f.calls);
    }
});

test('Unmatched refund correlation returns retryable failure rather than silently acknowledging lost state', async (t) => {
    configure(t);
    const f = fixture({ async updateRefund() { return null; } });
    const res = response();
    await f.handler(signedRequest(refundEvent()), res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.payload, { error: 'ORDER_RECONCILIATION_FAILED' });
    assert.deepEqual(f.calls.confirmations, []);
});

test('Refund processing exceptions are retryable and do not expose raw SQL, credentials or customer details', async (t) => {
    configure(t);
    const privateMessage = 'private SQL synthetic@example.com secret_db_password';
    const f = fixture({ async updateRefund() { throw new Error(privateMessage); } });
    const res = response();
    await f.handler(signedRequest(refundEvent()), res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.payload, { error: 'WEBHOOK_PROCESSING_FAILED' });
    assert.equal(JSON.stringify(f.calls.logs).includes(privateMessage), false);
    assert.equal(JSON.stringify(res.payload).includes(privateMessage), false);
    assert.deepEqual(f.calls.confirmations, []);
});

test('Normal signed Checkout event mapping is preserved and only paid transitions invoke confirmation delivery', async (t) => {
    configure(t);
    for (const [type, paymentStatus, expected] of [
        ['checkout.session.completed', 'paid', 'paid'],
        ['checkout.session.completed', 'unpaid', 'pending'],
        ['checkout.session.async_payment_succeeded', 'paid', 'paid'],
        ['checkout.session.async_payment_failed', 'unpaid', 'failed'],
        ['checkout.session.expired', 'unpaid', 'cancelled'],
    ]) {
        const f = fixture();
        const event = checkoutEvent(type, paymentStatus);
        const res = response();
        await f.handler(signedRequest(event), res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(f.calls.payments, [[event.data.object, expected]]);
        assert.deepEqual(f.calls.refunds, []);
        assert.deepEqual(f.calls.confirmations, expected === 'paid' ? [[f.order]] : []);
    }
});

test('Unmatched Checkout order remains retryable and cannot trigger a confirmation', async (t) => {
    configure(t);
    const f = fixture({ async updatePayment() { return null; } });
    const res = response();
    await f.handler(signedRequest(checkoutEvent()), res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.payload, { error: 'ORDER_RECONCILIATION_FAILED' });
    assert.deepEqual(f.calls.confirmations, []);
});

test('Late paid Checkout delivery for a refund-held order cannot trigger another paid confirmation', async (t) => {
    configure(t);
    const f = fixture({ async updatePayment() {
        return { order_number: 'MAM-2026-OFFLINE', stripe_refund_hold: true };
    } });
    const res = response();
    await f.handler(signedRequest(checkoutEvent()), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { received: true });
    assert.deepEqual(f.calls.confirmations, []);
});

test('Webhook refuses non-POST methods and missing signing configuration before reading or mutating data', async (t) => {
    configure(t);
    for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
        const f = fixture();
        const res = response();
        await f.handler(signedRequest(refundEvent(), { method }), res);
        assert.equal(res.statusCode, 405);
        assert.equal(res.headers.allow, 'POST');
        assert.equal(f.calls.client, 0);
        assertNoMutation(f.calls);
    }
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const f = fixture();
    const res = response();
    await f.handler(signedRequest(refundEvent()), res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.payload, { error: 'WEBHOOK_NOT_CONFIGURED' });
    assert.equal(f.calls.client, 0);
    assertNoMutation(f.calls);
});

test('Oversized raw webhook body fails before reconciliation even with an otherwise valid signature', async (t) => {
    configure(t);
    const f = fixture();
    const res = response();
    await f.handler(signedRequest(refundEvent(), { payload: 'a'.repeat(262145) }), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.payload, { error: 'WEBHOOK_INVALID' });
    assertNoMutation(f.calls);
});
