import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverPaidConfirmation } from '../api/_lib/order-confirmation.js';
import { SHOP_EMAIL } from '../api/_lib/confirmation-email.js';

const order = {
    order_number: 'MAM-2026-ABC123',
    customer_email: 'buyer@example.com',
    payment_test_mode: false,
};

function configure(t, overrides = {}) {
    const values = { SMTP_USER: SHOP_EMAIL, ORDER_EMAIL_TEST_ENABLED: undefined, ...overrides };
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

function dependencies(overrides = {}) {
    const calls = [];
    const claimed = { ...order, customer_name: 'Test Buyer' };
    return {
        calls,
        claimed,
        overrides: {
            claimId: () => 'claim-1',
            async claim(...args) { calls.push(['claim', ...args]); return claimed; },
            async state(...args) { calls.push(['state', ...args]); return null; },
            async send(...args) { calls.push(['send', ...args]); },
            async markSent(...args) { calls.push(['markSent', ...args]); },
            async release(...args) { calls.push(['release', ...args]); },
            ...overrides,
        },
    };
}

test('Live confirmation claims, sends persisted order data, then marks sent', async (t) => {
    configure(t);
    const fake = dependencies();
    assert.deepEqual(await deliverPaidConfirmation(order, fake.overrides), { status: 'sent' });
    assert.deepEqual(fake.calls, [
        ['claim', order.order_number, 'claim-1', false],
        ['send', fake.claimed],
        ['markSent', order.order_number, 'claim-1'],
    ]);
});

test('Test confirmation is suppressed by default without claiming or sending', async (t) => {
    configure(t);
    const fake = dependencies();
    assert.deepEqual(await deliverPaidConfirmation({ ...order, customer_email: SHOP_EMAIL, payment_test_mode: true }, fake.overrides), { status: 'test_suppressed' });
    assert.deepEqual(fake.calls, []);
});

test('Enabled owner-only test confirmation passes the trusted allowTest flag to the claim', async (t) => {
    configure(t, { ORDER_EMAIL_TEST_ENABLED: 'true' });
    const testOrder = { ...order, customer_email: SHOP_EMAIL.toUpperCase(), payment_test_mode: true };
    const fake = dependencies();
    Object.assign(fake.claimed, testOrder);
    assert.deepEqual(await deliverPaidConfirmation(testOrder, fake.overrides), { status: 'sent' });
    assert.deepEqual(fake.calls[0], ['claim', order.order_number, 'claim-1', true]);
    assert.equal(fake.calls[1][1].payment_test_mode, true);
    assert.equal(fake.calls[1][1].customer_email, SHOP_EMAIL.toUpperCase());
});

test('Enabled test email still suppresses other recipients and unapproved sender configuration', async (t) => {
    configure(t, { ORDER_EMAIL_TEST_ENABLED: 'true' });
    const fake = dependencies();
    for (const customer_email of ['buyer@example.com', undefined, `Other <${SHOP_EMAIL}>`]) {
        assert.deepEqual(await deliverPaidConfirmation({ ...order, customer_email, payment_test_mode: true }, fake.overrides), { status: 'test_suppressed' });
    }
    process.env.SMTP_USER = 'other@example.com';
    assert.deepEqual(await deliverPaidConfirmation({ ...order, customer_email: SHOP_EMAIL, payment_test_mode: true }, fake.overrides), { status: 'test_suppressed' });
    assert.deepEqual(fake.calls, []);
});

test('Already-sent duplicate is acknowledged without sending again', async (t) => {
    configure(t);
    const fake = dependencies();
    fake.overrides.claim = async (...args) => { fake.calls.push(['claim', ...args]); return null; };
    fake.overrides.state = async (...args) => { fake.calls.push(['state', ...args]); return { confirmation_email_status: 'sent' }; };
    assert.deepEqual(await deliverPaidConfirmation(order, fake.overrides), { status: 'already_sent' });
    assert.deepEqual(fake.calls, [
        ['claim', order.order_number, 'claim-1', false],
        ['state', order.order_number],
    ]);
});

test('An active lease or any unsent state must remain retriable rather than be acknowledged', async (t) => {
    configure(t);
    for (const state of ['sending', 'pending', 'failed', null]) {
        const fake = dependencies({
            claim: async () => null,
            state: async () => state ? { confirmation_email_status: state } : null,
        });
        await assert.rejects(deliverPaidConfirmation(order, fake.overrides), { code: 'CONFIRMATION_RETRY_REQUIRED' });
        assert.deepEqual(fake.calls, []);
    }
});

test('SMTP failure releases its own claim and preserves the original failure', async (t) => {
    configure(t);
    const failure = Object.assign(new Error('Synthetic SMTP failure'), { code: 'ECONNECTION' });
    const fake = dependencies();
    fake.overrides.send = async (...args) => { fake.calls.push(['send', ...args]); throw failure; };
    await assert.rejects(deliverPaidConfirmation(order, fake.overrides), (error) => error === failure);
    assert.deepEqual(fake.calls, [
        ['claim', order.order_number, 'claim-1', false],
        ['send', fake.claimed],
        ['release', order.order_number, 'claim-1'],
    ]);
});

test('DB finalization failure after accepted SMTP does not release the sending lease', async (t) => {
    configure(t);
    const failure = new Error('Synthetic finalization failure');
    const fake = dependencies();
    fake.overrides.markSent = async (...args) => { fake.calls.push(['markSent', ...args]); throw failure; };
    await assert.rejects(deliverPaidConfirmation(order, fake.overrides), (error) => error === failure);
    assert.deepEqual(fake.calls, [
        ['claim', order.order_number, 'claim-1', false],
        ['send', fake.claimed],
        ['markSent', order.order_number, 'claim-1'],
    ]);
});

function statefulDependencies() {
    let status = 'pending';
    let claimedId;
    let sequence = 0;
    const counts = { sends: 0, marks: 0, releases: 0 };
    return {
        counts,
        overrides: {
            claimId: () => `claim-${++sequence}`,
            async claim(orderNumber, claimId) {
                assert.equal(orderNumber, order.order_number);
                if (status !== 'pending' && status !== 'failed') return null;
                status = 'sending';
                claimedId = claimId;
                return { ...order };
            },
            async state() { return { confirmation_email_status: status }; },
            async send() { counts.sends += 1; },
            async markSent(orderNumber, claimId) {
                assert.equal(orderNumber, order.order_number);
                assert.equal(claimId, claimedId);
                assert.equal(status, 'sending');
                counts.marks += 1;
                status = 'sent';
            },
            async release() { counts.releases += 1; status = 'failed'; },
        },
    };
}

test('Sequential duplicate deliveries send one confirmation with a stateful claim', async (t) => {
    configure(t);
    const fake = statefulDependencies();
    assert.deepEqual(await deliverPaidConfirmation(order, fake.overrides), { status: 'sent' });
    assert.deepEqual(await deliverPaidConfirmation(order, fake.overrides), { status: 'already_sent' });
    assert.deepEqual(fake.counts, { sends: 1, marks: 1, releases: 0 });
});

test('Concurrent duplicate retries while first lease is active, then acknowledges sent without duplication', async (t) => {
    configure(t);
    const fake = statefulDependencies();
    let announceSend;
    let finishSend;
    const sendStarted = new Promise((resolve) => { announceSend = resolve; });
    const sendGate = new Promise((resolve) => { finishSend = resolve; });
    const originalSend = fake.overrides.send;
    fake.overrides.send = async () => {
        await originalSend();
        announceSend();
        await sendGate;
    };
    const first = deliverPaidConfirmation(order, fake.overrides);
    await sendStarted;
    try {
        await assert.rejects(deliverPaidConfirmation(order, fake.overrides), { code: 'CONFIRMATION_RETRY_REQUIRED' });
        assert.deepEqual(fake.counts, { sends: 1, marks: 0, releases: 0 });
    } finally {
        finishSend();
    }
    assert.deepEqual(await first, { status: 'sent' });
    assert.deepEqual(await deliverPaidConfirmation(order, fake.overrides), { status: 'already_sent' });
    assert.deepEqual(fake.counts, { sends: 1, marks: 1, releases: 0 });
});
