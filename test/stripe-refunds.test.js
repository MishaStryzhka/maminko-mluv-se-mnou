import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import {
    initializeOrderSchema, updateStripePaymentState, updateStripeRefundState,
    claimPaidConfirmation, getConfirmationState, markConfirmationSent,
    findOrderByPublicToken, listOrdersForAdmin,
} from '../api/_lib/db.js';
import { refundPaymentView } from '../api/_lib/stripe-refunds.js';
import { mapOrder } from '../api/admin-orders.js';

async function fixture(t, overrides = {}) {
    // Executes real PostgreSQL SQL in WASM. No provider credentials or network.
    const db = new PGlite();
    t.after(() => db.close());
    const sql = async (strings, ...values) => {
        const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '');
        return (await db.query(query, values)).rows;
    };
    await initializeOrderSchema(sql);
    const order = {
        id: crypto.randomUUID(), orderNumber: 'MAM-2026-REFUND1',
        sessionId: 'cs_live_offline_fixture1', intentId: 'pi_offline_fixture1',
        chargeId: 'ch_offline_fixture1', testMode: false,
        paymentStatus: 'paid', shippingStatus: 'ready', linked: true,
        ...overrides,
    };
    const other = {
        id: crypto.randomUUID(), orderNumber: 'MAM-2026-REFUND2',
        sessionId: 'cs_live_offline_fixture2', intentId: 'pi_offline_fixture2',
        chargeId: 'ch_offline_fixture2', testMode: false,
        paymentStatus: 'paid', shippingStatus: 'ready', linked: true,
    };
    for (const entry of [order, other]) {
        await sql`
            INSERT INTO orders (
                id, order_number, public_token, lang, product_code, product_name,
                product_price, customer_name, customer_email, customer_phone,
                shipping_method, shipping_price, shipping_status, total_amount,
                payment_provider, payment_test_mode, payment_status, stripe_session_id,
                stripe_payment_intent_id, stripe_payment_status
            ) VALUES (
                ${entry.id}, ${entry.orderNumber}, ${crypto.randomUUID()}, 'cs', 'print', 'Synthetic test product',
                490, 'Synthetic offline customer', 'info@maminko-mluv-se-mnou.cz', '+420000000000',
                'address', 119, ${entry.shippingStatus}, 609,
                'stripe', ${entry.testMode}, ${entry.paymentStatus}, ${entry.sessionId},
                ${entry.linked ? entry.intentId : null}, ${entry.paymentStatus === 'paid' ? 'paid' : 'unpaid'}
            )
        `;
    }
    return {
        db, sql, order, other, options: { sql, ensureSchema: async () => {} },
        async row(entry = order) { return (await sql`SELECT * FROM orders WHERE id = ${entry.id}`)[0]; },
    };
}

function session(order, overrides = {}) {
    return {
        object: 'checkout.session', id: order.sessionId, mode: 'payment',
        client_reference_id: order.orderNumber, metadata: { orderId: order.id },
        payment_intent: order.intentId, livemode: !order.testMode,
        payment_status: 'paid', amount_total: 60900, currency: 'czk',
        ...overrides,
    };
}

function refundEvent(order, { refund = {}, ...event } = {}) {
    return {
        object: 'event', id: 'evt_offline_refund1', created: 1800000000,
        type: 'refund.updated', livemode: !order.testMode,
        ...event,
        data: { object: {
            object: 'refund', id: 're_offline_fixture1', charge: order.chargeId,
            payment_intent: order.intentId, currency: 'czk', amount: 60900,
            status: 'succeeded', ...refund,
        } },
    };
}

function assertRefund(row, { status, kind, refunded = 0, pending = 0, failed = 0, canceled = 0, hold = true }) {
    const view = refundPaymentView(row);
    assert.equal(view.status, status);
    assert.equal(view.originalStatus, row.payment_status);
    assert.deepEqual(view.refund, {
        status: kind, refundedAmount: refunded, pendingAmount: pending,
        failedCount: failed, canceledCount: canceled, hold,
    });
}

test('Refund schema is additive and idempotent; existing orders and ledger entries survive', async (t) => {
    const f = await fixture(t);
    // Simulate the immediately preceding schema while retaining existing data.
    await f.db.exec('ALTER TABLE orders DROP COLUMN stripe_refunds, DROP COLUMN stripe_refund_hold');
    await initializeOrderSchema(f.sql);
    const before = await f.row();
    assert.equal(before.customer_name, 'Synthetic offline customer');
    assert.equal(before.total_amount, 609);
    assert.equal(before.payment_status, 'paid');
    assert.deepEqual(before.stripe_refunds, {});
    assert.equal(before.stripe_refund_hold, false);
    await updateStripeRefundState(refundEvent(f.order), f.options);
    await initializeOrderSchema(f.sql);
    const after = await f.row();
    assert.equal((await f.sql`SELECT count(*)::int AS count FROM orders`)[0].count, 2);
    assert.equal(Object.keys(after.stripe_refunds).length, 1);
    assertRefund(after, { status: 'refunded', kind: 'full', refunded: 609 });
});

test('Ordinary payment transitions retain failed/cancelled states against pending and paid against late failures', async (t) => {
    const f = await fixture(t, { paymentStatus: 'pending', shippingStatus: 'not_ready' });
    await updateStripePaymentState(session(f.order, { payment_status: 'unpaid' }), 'cancelled', f.options);
    assert.equal((await f.row()).payment_status, 'cancelled');
    await updateStripePaymentState(session(f.order, { payment_status: 'unpaid' }), 'pending', f.options);
    assert.equal((await f.row()).payment_status, 'cancelled');
    await updateStripePaymentState(session(f.order, { payment_status: 'unpaid' }), 'failed', f.options);
    assert.equal((await f.row()).payment_status, 'failed');
    await updateStripePaymentState(session(f.order, { payment_status: 'unpaid' }), 'pending', f.options);
    assert.equal((await f.row()).payment_status, 'failed');
    await updateStripePaymentState(session(f.order), 'paid', f.options);
    const paidAt = (await f.row()).paid_at;
    assert.ok(paidAt);
    for (const nextStatus of ['pending', 'failed', 'cancelled']) {
        await updateStripePaymentState(session(f.order, { payment_status: 'unpaid' }), nextStatus, f.options);
        const row = await f.row();
        assert.equal(row.payment_status, 'paid');
        assert.equal(row.stripe_payment_status, 'paid');
        assert.deepEqual(row.paid_at, paidAt);
        assert.equal(row.shipping_status, 'not_ready');
    }
    assertRefund(await f.row(), { status: 'paid', kind: 'none', hold: false });
});

test('Checkout payment correlation rejects mismatched order, session, mode, currency, amount and stored intent', async (t) => {
    const f = await fixture(t, { paymentStatus: 'pending', shippingStatus: 'not_ready' });
    const before = await f.row();
    for (const overrides of [
        { id: 'cs_live_wrong_session' }, { client_reference_id: f.other.orderNumber },
        { metadata: { orderId: f.other.id } }, { livemode: false },
        { amount_total: 60899 }, { currency: 'eur' }, { payment_intent: f.other.intentId },
    ]) {
        assert.equal(await updateStripePaymentState(session(f.order, overrides), 'paid', f.options), null);
        assert.deepEqual(await f.row(), before);
    }
    assert.equal((await f.row(f.other)).payment_status, 'paid');
});

test('Malformed Checkout identity, missing mode and missing paid intent fail closed before SQL', async () => {
    const order = {
        id: '85d0b67a-c481-45c2-8671-a936220963ff', orderNumber: 'MAM-2026-OFFLINE',
        sessionId: 'cs_test_offline', intentId: 'pi_offline', testMode: true,
    };
    let calls = 0;
    const options = {
        sql: async () => { calls += 1; throw new Error('SQL must not run'); },
        ensureSchema: async () => { calls += 1; throw new Error('Schema must not run'); },
    };
    const invalid = [
        null, {}, session(order, { id: 'not-a-session' }), session(order, { client_reference_id: '' }),
        session(order, { object: undefined }), session(order, { object: 'payment_intent' }),
        session(order, { object: ['checkout.session'] }), session(order, { mode: undefined }),
        session(order, { mode: 'subscription' }), session(order, { mode: 'setup' }),
        session(order, { mode: ['payment'] }),
        session(order, { metadata: null }), session(order, { metadata: { orderId: 'not-a-uuid' } }),
        session(order, { metadata: { orderId: 3 } }), session(order, { livemode: undefined }),
        session(order, { livemode: 'false' }), session(order, { currency: 'CZK' }),
        session(order, { payment_intent: null }), session(order, { payment_intent: undefined }),
        session(order, { payment_intent: { id: 'not-an-intent' } }),
        ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '60900'].map((amount_total) => session(order, { amount_total })),
    ];
    for (const input of invalid) assert.equal(await updateStripePaymentState(input, 'paid', options), null);
    assert.equal(await updateStripePaymentState(session(order), 'refunded', options), null);
    assert.equal(calls, 0);
});

test('Full refund records the event and keeps historical paid state while blocking readiness', async (t) => {
    const f = await fixture(t);
    const event = refundEvent(f.order);
    assert.equal(Object.hasOwn(event.data.object, 'livemode'), false);
    assert.ok(await updateStripeRefundState(event, f.options));
    const row = await f.row();
    assert.equal(row.payment_status, 'paid');
    assert.equal(row.shipping_status, 'not_ready');
    assert.equal(row.stripe_refund_hold, true);
    const record = row.stripe_refunds[event.data.object.id];
    assert.equal(record.id, event.data.object.id);
    assert.equal(record.charge, f.order.chargeId);
    assert.equal(record.paymentIntent, f.order.intentId);
    assert.equal(record.amount, 60900);
    assert.equal(record.currency, 'czk');
    assert.equal(record.status, 'succeeded');
    assert.equal(record.eventCreated, event.created);
    assert.equal(record.eventId, event.id);
    assertRefund(row, { status: 'refunded', kind: 'full', refunded: 609 });
});

test('Partial refund reports actual returned CZK without falsely labeling the whole order refunded', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, { refund: { amount: 12345 } }), f.options);
    const row = await f.row();
    assertRefund(row, { status: 'partially_refunded', kind: 'partial', refunded: 123.45 });
    assert.equal(row.shipping_status, 'not_ready');
    assert.equal(row.payment_status, 'paid');
});

test('Pending and requires-action refunds block fulfillment but are not counted as returned money', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, {
        type: 'refund.created', refund: { status: 'pending', amount: 10000 },
    }), f.options);
    assertRefund(await f.row(), { status: 'refund_pending', kind: 'pending', pending: 100 });
    await updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_requires_action', created: 1800000001,
        refund: { status: 'requires_action', amount: 10000 },
    }), f.options);
    assertRefund(await f.row(), { status: 'refund_pending', kind: 'requires_action', pending: 100 });
    assert.equal((await f.row()).shipping_status, 'not_ready');
});

test('Failed and canceled refunds retain review hold without claiming that money was returned', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, {
        type: 'refund.failed', refund: { status: 'failed', amount: 10000 },
    }), f.options);
    assertRefund(await f.row(), { status: 'refund_failed', kind: 'failed', failed: 1 });
    await updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_canceled', refund: { id: 're_offline_canceled', status: 'canceled', amount: 50900 },
    }), f.options);
    assertRefund(await f.row(), { status: 'refund_failed', kind: 'failed', failed: 1, canceled: 1 });
    assert.equal((await f.row()).shipping_status, 'not_ready');
    assert.equal((await f.row()).payment_status, 'paid');
});

test('Canceled-only refund has a distinct effective state and an unexplained hold requires review', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, { refund: { status: 'canceled' } }), f.options);
    assertRefund(await f.row(), { status: 'refund_canceled', kind: 'canceled', canceled: 1 });
    await f.sql`UPDATE orders SET stripe_refunds = '{}'::jsonb, stripe_refund_hold = true WHERE id = ${f.order.id}`;
    assertRefund(await f.row(), { status: 'refund_review', kind: 'review' });
});

test('Duplicate and stale refund deliveries are successful no-ops without duplicate amounts', async (t) => {
    const f = await fixture(t);
    const event = refundEvent(f.order, { created: 1800000010, refund: { amount: 10000 } });
    await updateStripeRefundState(event, f.options);
    const before = await f.row();
    assert.ok(await updateStripeRefundState(event, f.options));
    assert.ok(await updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_stale_pending', created: 1800000000,
        type: 'refund.created', refund: { status: 'pending', amount: 10000 },
    }), f.options));
    const after = await f.row();
    assert.deepEqual(after.stripe_refunds, before.stripe_refunds);
    assert.equal(after.stripe_refund_hold, true);
    assert.equal(Object.keys(after.stripe_refunds).length, 1);
    assertRefund(after, { status: 'partially_refunded', kind: 'partial', refunded: 100 });
});

test('Same-second terminal precedence is deterministic regardless of delivery order', async (t) => {
    const f = await fixture(t);
    const succeeded = refundEvent(f.order, { id: 'evt_success_same_second' });
    const pending = refundEvent(f.order, { id: 'evt_pending_same_second', refund: { status: 'pending' } });
    await updateStripeRefundState(pending, f.options);
    await updateStripeRefundState(succeeded, f.options);
    const successLedger = (await f.row()).stripe_refunds;
    await updateStripeRefundState(pending, f.options);
    assert.deepEqual((await f.row()).stripe_refunds, successLedger);
    assertRefund(await f.row(), { status: 'refunded', kind: 'full', refunded: 609 });
});

test('A later failed refund state is visible and does not masquerade as successful returned money', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order), f.options);
    await updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_late_failure', type: 'refund.failed', created: 1800000001,
        refund: { status: 'failed' },
    }), f.options);
    assertRefund(await f.row(), { status: 'refund_failed', kind: 'failed', failed: 1 });
    assert.equal((await f.row()).shipping_status, 'not_ready');
});

test('Two distinct partial refunds merge atomically and aggregate in CZK', async (t) => {
    const f = await fixture(t);
    const results = await Promise.all([
        updateStripeRefundState(refundEvent(f.order, { refund: { amount: 10000 } }), f.options),
        updateStripeRefundState(refundEvent(f.order, {
            id: 'evt_second_partial', refund: { id: 're_offline_second', amount: 20000 },
        }), f.options),
    ]);
    assert.ok(results.every(Boolean));
    const row = await f.row();
    assert.equal(Object.keys(row.stripe_refunds).length, 2);
    assertRefund(row, { status: 'partially_refunded', kind: 'partial', refunded: 300 });
    assert.deepEqual((await f.row(f.other)).stripe_refunds, {});
});

test('Pending amount takes precedence over partial success while keeping both totals distinct', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, { refund: { amount: 10000 } }), f.options);
    await updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_second_pending', refund: { id: 're_offline_pending', status: 'pending', amount: 20000 },
    }), f.options);
    assertRefund(await f.row(), { status: 'refund_pending', kind: 'pending', refunded: 100, pending: 200 });
});

test('Refund correlation rejects wrong mode, unknown intent, currency and over-total amount without writes', async (t) => {
    const f = await fixture(t);
    const before = await f.row();
    for (const overrides of [
        { livemode: true === f.order.testMode },
        { refund: { payment_intent: 'pi_unknown' } },
        { refund: { currency: 'eur' } },
        { refund: { amount: 60901 } },
    ]) {
        assert.equal(await updateStripeRefundState(refundEvent(f.order, overrides), f.options), null);
        assert.deepEqual(await f.row(), before);
    }
});

test('Existing refund immutable amount, charge and currency cannot be overwritten by a newer event', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, { refund: { amount: 10000, status: 'pending' } }), f.options);
    const before = await f.row();
    for (const changed of [
        { amount: 20000 }, { charge: 'ch_contradictory' }, { currency: 'eur' },
    ]) {
        assert.equal(await updateStripeRefundState(refundEvent(f.order, {
            id: 'evt_contradictory', created: 1800000001,
            refund: { amount: 10000, status: 'succeeded', ...changed },
        }), f.options), null);
        assert.deepEqual(await f.row(), before);
    }
});

test('Succeeded and pending aggregate cannot exceed the order total', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, { refund: { amount: 50000 } }), f.options);
    const before = await f.row();
    assert.equal(await updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_over_total', refund: { id: 're_offline_over', status: 'pending', amount: 10901 },
    }), f.options), null);
    assert.deepEqual(await f.row(), before);
    assert.ok(await updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_to_full', refund: { id: 're_offline_remaining', amount: 10900 },
    }), f.options));
    assertRefund(await f.row(), { status: 'refunded', kind: 'full', refunded: 609 });
});

test('Failed refund is not counted against a distinct successful retry of the same money', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, { type: 'refund.failed', refund: { status: 'failed' } }), f.options);
    assert.ok(await updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_successful_retry', refund: { id: 're_offline_retry' },
    }), f.options));
    assertRefund(await f.row(), { status: 'refunded', kind: 'full', refunded: 609, failed: 1 });
});

test('Refund before intent linkage persists evidence; later Checkout is held before confirmation and replay applies ledger', async (t) => {
    const f = await fixture(t, { paymentStatus: 'pending', shippingStatus: 'not_ready', linked: false });
    const event = refundEvent(f.order);
    assert.equal(await updateStripeRefundState(event, f.options), null);
    assert.deepEqual((await f.row()).stripe_refunds, {});
    assert.equal((await f.sql`SELECT count(*)::int AS count FROM stripe_refund_evidence`)[0].count, 1);
    assert.ok(await updateStripePaymentState(session(f.order), 'paid', f.options));
    assert.equal((await f.row()).stripe_refund_hold, true);
    assert.equal((await f.row()).shipping_status, 'not_ready');
    assert.equal(await claimPaidConfirmation(f.order.orderNumber, 'prelink_offline_claim', false, f.options), null);
    assert.ok(await updateStripeRefundState(event, f.options));
    assertRefund(await f.row(), { status: 'refunded', kind: 'full', refunded: 609 });
});

test('Late Checkout paid delivery cannot clear a refund ledger, review hold or reopen fulfillment', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order), f.options);
    const before = await f.row();
    assert.ok(await updateStripePaymentState(session(f.order), 'paid', f.options));
    const after = await f.row();
    assert.deepEqual(after.stripe_refunds, before.stripe_refunds);
    assert.equal(after.stripe_refund_hold, true);
    assert.equal(after.shipping_status, 'not_ready');
    assertRefund(after, { status: 'refunded', kind: 'full', refunded: 609 });
});

test('Refund does not rewrite already sent or delivered fulfillment history', async (t) => {
    const f = await fixture(t, { shippingStatus: 'sent' });
    await updateStripeRefundState(refundEvent(f.order), f.options);
    assert.equal((await f.row()).shipping_status, 'sent');
    await f.sql`UPDATE orders SET shipping_status = 'delivered' WHERE id = ${f.other.id}`;
    await updateStripeRefundState(refundEvent(f.other, { id: 'evt_other', refund: { id: 're_offline_other' } }), f.options);
    assert.equal((await f.row(f.other)).shipping_status, 'delivered');
    assert.equal((await f.row(f.other)).stripe_refund_hold, true);
});

test('Refund blocks new paid confirmation claims and late SMTP finalization cannot release hold', async (t) => {
    const f = await fixture(t, { shippingStatus: 'not_ready' });
    assert.ok(await claimPaidConfirmation(f.order.orderNumber, 'offline_claim', false, f.options));
    await updateStripeRefundState(refundEvent(f.order, { refund: { status: 'pending' } }), f.options);
    assert.ok(await markConfirmationSent(f.order.orderNumber, 'offline_claim', f.options));
    const row = await f.row();
    assert.equal(row.confirmation_email_status, 'sent');
    assert.equal(row.shipping_status, 'not_ready');
    assert.equal(row.stripe_refund_hold, true);
    assert.equal((await getConfirmationState(f.order.orderNumber, f.options)).confirmation_email_status, 'sent');
    await f.sql`UPDATE orders SET confirmation_email_status = 'pending' WHERE id = ${f.order.id}`;
    assert.equal(await claimPaidConfirmation(f.order.orderNumber, 'another_offline_claim', false, f.options), null);
});

test('Snapshot-only refund ledger fences paid, claim, state and late SMTP without evidence or a stored hold flag', async (t) => {
    const f = await fixture(t);
    // The second order has an SMTP claim that predates the snapshot-only refund.
    await f.sql`UPDATE orders SET shipping_status = 'not_ready' WHERE id = ${f.other.id}`;
    assert.ok(await claimPaidConfirmation(f.other.orderNumber, 'snapshot_inflight_claim', false, f.options));
    for (const entry of [f.order, f.other]) {
        const record = {
            id: `re_snapshot_${entry.orderNumber.replaceAll('-', '_')}`,
            charge: entry.chargeId, paymentIntent: entry.intentId,
            amount: 10000, currency: 'czk', status: 'succeeded',
            eventCreated: 1800000000, eventId: 'evt_snapshot_only_hold', statusRank: 2,
        };
        await f.sql`UPDATE orders SET stripe_refunds = ${JSON.stringify({ [record.id]: record })}::jsonb,
            stripe_refund_hold = false WHERE id = ${entry.id}`;
        assert.equal((await getConfirmationState(entry.orderNumber, f.options)).stripe_refund_hold, true);
        assert.equal((await f.row(entry)).stripe_refund_hold, false);
    }
    assert.equal((await f.sql`SELECT count(*)::int AS count FROM stripe_refund_evidence`)[0].count, 0);
    assert.equal(await claimPaidConfirmation(f.order.orderNumber, 'must_not_claim_snapshot', false, f.options), null);
    const otherLedger = (await f.row(f.other)).stripe_refunds;
    await markConfirmationSent(f.other.orderNumber, 'snapshot_inflight_claim', f.options);
    const finalized = await f.row(f.other);
    assert.equal(finalized.confirmation_email_status, 'sent');
    assert.equal(finalized.shipping_status, 'not_ready');
    assert.deepEqual(finalized.stripe_refunds, otherLedger);
    const originalLedger = (await f.row()).stripe_refunds;
    const reconciled = await updateStripePaymentState(session(f.order), 'paid', f.options);
    assert.equal(reconciled.stripe_refund_hold, true);
    const afterPaid = await f.row();
    assert.equal(afterPaid.shipping_status, 'not_ready');
    assert.equal(afterPaid.stripe_refund_hold, true);
    assert.deepEqual(afterPaid.stripe_refunds, originalLedger);
    assertRefund(afterPaid, { status: 'partially_refunded', kind: 'partial', refunded: 100 });
});

test('Persisted evidence blocks fulfillment when order snapshot application fails and permits safe retry', async (t) => {
    const f = await fixture(t, { shippingStatus: 'not_ready' });
    assert.ok(await claimPaidConfirmation(f.order.orderNumber, 'inflight_offline_claim', false, f.options));
    const failApplication = async (strings, ...values) => {
        if (strings.join('').includes('SET stripe_refunds =')) throw new Error('Synthetic order apply failure');
        return f.sql(strings, ...values);
    };
    const event = refundEvent(f.order);
    await assert.rejects(updateStripeRefundState(event, { ...f.options, sql: failApplication }), /Synthetic order apply failure/);
    assert.equal((await f.sql`SELECT count(*)::int AS count FROM stripe_refund_evidence`)[0].count, 1);
    assert.deepEqual((await f.row()).stripe_refunds, {});
    assert.equal((await f.row()).stripe_refund_hold, false);
    assert.equal((await getConfirmationState(f.order.orderNumber, f.options)).stripe_refund_hold, true);
    await markConfirmationSent(f.order.orderNumber, 'inflight_offline_claim', f.options);
    assert.equal((await f.row()).shipping_status, 'not_ready');
    await f.sql`UPDATE orders SET confirmation_email_status = 'pending' WHERE id = ${f.order.id}`;
    assert.equal(await claimPaidConfirmation(f.order.orderNumber, 'must_not_send', false, f.options), null);
    assert.ok(await updateStripeRefundState(event, f.options));
    assertRefund(await f.row(), { status: 'refunded', kind: 'full', refunded: 609 });
});

test('Public and admin SQL projections agree on partial refunds and public access reveals no raw identifiers', async (t) => {
    const f = await fixture(t);
    const event = refundEvent(f.order, { refund: { amount: 12345 } });
    await updateStripeRefundState(event, f.options);
    const raw = await f.row();
    const publicOrder = await findOrderByPublicToken(f.order.orderNumber, raw.public_token, f.options);
    const adminRows = await listOrdersForAdmin(100, f.options);
    const adminOrder = mapOrder(adminRows.find((row) => row.order_number === f.order.orderNumber));
    assert.equal(publicOrder.payment_status, 'partially_refunded');
    assert.equal(publicOrder.payment_original_status, 'paid');
    assert.equal(publicOrder.shipping_status, 'not_ready');
    assert.equal(publicOrder.refund.refundedAmount, 123.45);
    assert.equal(adminOrder.payment.status, publicOrder.payment_status);
    assert.equal(adminOrder.payment.originalStatus, publicOrder.payment_original_status);
    assert.deepEqual(adminOrder.payment.refund, publicOrder.refund);
    assert.equal(adminOrder.shipping.status, publicOrder.shipping_status);
    for (const key of ['stripe_refunds', 'stripe_refund_hold', 'stripe_session_id', 'stripe_payment_intent_id', 'public_token', 'customer_email']) {
        assert.equal(Object.hasOwn(publicOrder, key), false);
    }
    const serialized = JSON.stringify(publicOrder);
    for (const value of [f.order.intentId, f.order.chargeId, f.order.sessionId, event.id, event.data.object.id, raw.public_token]) {
        assert.equal(serialized.includes(value), false);
    }
    assert.equal(await findOrderByPublicToken(f.order.orderNumber, 'incorrect-public-token', f.options), null);
    assert.equal(await findOrderByPublicToken(f.other.orderNumber, raw.public_token, f.options), null);
});

test('Public and admin projections use newest durable evidence when the order snapshot update fails', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order, { refund: { status: 'pending', amount: 10000 } }), f.options);
    const failApplication = async (strings, ...values) => {
        if (strings.join('').includes('SET stripe_refunds =')) throw new Error('Synthetic second-phase apply failure');
        return f.sql(strings, ...values);
    };
    await assert.rejects(updateStripeRefundState(refundEvent(f.order, {
        id: 'evt_newest_durable_success', created: 1800000001, refund: { amount: 10000 },
    }), { ...f.options, sql: failApplication }), /Synthetic second-phase apply failure/);
    // Simulates a stale fulfillment snapshot from another deployment as well.
    await f.sql`UPDATE orders SET stripe_refund_hold = false, shipping_status = 'ready' WHERE id = ${f.order.id}`;
    const raw = await f.row();
    assert.equal(raw.stripe_refunds.re_offline_fixture1.status, 'pending');
    const publicOrder = await findOrderByPublicToken(f.order.orderNumber, raw.public_token, f.options);
    const adminRows = await listOrdersForAdmin(100, f.options);
    const adminOrder = mapOrder(adminRows.find((row) => row.order_number === f.order.orderNumber));
    assert.equal(publicOrder.payment_status, 'partially_refunded');
    assert.equal(publicOrder.refund.refundedAmount, 100);
    assert.equal(publicOrder.refund.pendingAmount, 0);
    assert.equal(publicOrder.refund.hold, true);
    assert.equal(publicOrder.shipping_status, 'not_ready');
    assert.equal(adminOrder.payment.status, publicOrder.payment_status);
    assert.deepEqual(adminOrder.payment.refund, publicOrder.refund);
    assert.equal(adminOrder.shipping.status, 'not_ready');
});

test('Canonical projections preserve snapshot-only historical refunds while newer evidence wins matching IDs', async (t) => {
    const f = await fixture(t);
    const legacyRecord = {
        id: 're_snapshot_only', charge: f.order.chargeId, paymentIntent: f.order.intentId,
        amount: 10000, currency: 'czk', status: 'succeeded',
        eventCreated: 1799999999, eventId: 'evt_snapshot_only', statusRank: 2,
    };
    await f.sql`UPDATE orders SET stripe_refunds = ${JSON.stringify({ [legacyRecord.id]: legacyRecord })}::jsonb,
        stripe_refund_hold = true, shipping_status = 'not_ready' WHERE id = ${f.order.id}`;
    await updateStripeRefundState(refundEvent(f.order, { refund: { amount: 20000 } }), f.options);
    const raw = await f.row();
    assertRefund(raw, { status: 'partially_refunded', kind: 'partial', refunded: 300 });
    const publicOrder = await findOrderByPublicToken(f.order.orderNumber, raw.public_token, f.options);
    const adminRows = await listOrdersForAdmin(100, f.options);
    const adminOrder = mapOrder(adminRows.find((row) => row.order_number === f.order.orderNumber));
    assert.equal(publicOrder.refund.refundedAmount, 300);
    assert.equal(adminOrder.payment.refund.refundedAmount, 300);
    assert.deepEqual(adminOrder.payment.refund, publicOrder.refund);
});

test('Normal paid order without refund still becomes ready only after confirmation finalization', async (t) => {
    const f = await fixture(t, { shippingStatus: 'not_ready' });
    assert.ok(await claimPaidConfirmation(f.order.orderNumber, 'normal_offline_claim', false, f.options));
    assert.equal((await f.row()).shipping_status, 'not_ready');
    await markConfirmationSent(f.order.orderNumber, 'normal_offline_claim', f.options);
    assert.equal((await f.row()).shipping_status, 'ready');
    assert.equal((await f.row()).stripe_refund_hold, false);
});

test('Refund updates only its correlated order, with no metadata-based retargeting', async (t) => {
    const f = await fixture(t);
    const firstBefore = await f.row();
    const event = refundEvent(f.other, {
        id: 'evt_second_order', refund: { id: 're_second_order', metadata: { orderId: f.order.id, orderNumber: f.order.orderNumber } },
    });
    assert.ok(await updateStripeRefundState(event, f.options));
    assert.deepEqual(await f.row(), firstBefore);
    assertRefund(await f.row(f.other), { status: 'refunded', kind: 'full', refunded: 609 });
});

test('A refund ID already bound to one payment intent cannot be reused to mutate another order', async (t) => {
    const f = await fixture(t);
    await updateStripeRefundState(refundEvent(f.order), f.options);
    const firstBefore = await f.row();
    const secondBefore = await f.row(f.other);
    assert.equal(await updateStripeRefundState(refundEvent(f.other, {
        id: 'evt_refund_retarget_attempt', created: 1800000001,
    }), f.options), null);
    assert.deepEqual(await f.row(), firstBefore);
    assert.deepEqual(await f.row(f.other), secondBefore);
    assert.equal((await f.sql`SELECT count(*)::int AS count FROM stripe_refund_evidence`)[0].count, 1);
});

test('Malformed ledger shapes and non-string statuses project review hold instead of paid or refunded', () => {
    const base = { total_amount: 609, currency: 'CZK', payment_status: 'paid', stripe_refund_hold: false };
    const validRecord = { amount: 10000, currency: 'czk', status: 'succeeded' };
    for (const ledger of [
        0, false, '', [], 'invalid',
        { re_invalid: { ...validRecord, status: ['succeeded'] } },
        { re_invalid: { ...validRecord, status: {} } },
        { re_invalid: { ...validRecord, status: null } },
    ]) {
        assertRefund({ ...base, stripe_refunds: ledger }, { status: 'refund_review', kind: 'review' });
    }
});

test('Malformed refund events fail validation before any SQL is issued', async () => {
    const order = { chargeId: 'ch_fixture', intentId: 'pi_fixture', testMode: false };
    let queryCount = 0;
    const options = {
        sql: async () => { queryCount += 1; throw new Error('SQL must not run'); },
        ensureSchema: async () => { queryCount += 1; throw new Error('Schema must not run'); },
    };
    const invalid = [
        null, {}, refundEvent(order, { id: '', created: 1800000000 }),
        refundEvent(order, { created: -1 }), refundEvent(order, { created: 1.5 }),
        refundEvent(order, { livemode: undefined }), refundEvent(order, { livemode: 'false' }),
        refundEvent(order, { type: 'charge.refunded' }),
        ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100'].map((amount) => refundEvent(order, { refund: { amount } })),
        ...['unknown', ['succeeded'], {}, null, 2].map((status) => refundEvent(order, { refund: { status } })),
        refundEvent(order, { refund: { object: 'charge' } }),
        refundEvent(order, { refund: { id: '' } }),
        refundEvent(order, { refund: { payment_intent: null } }),
        refundEvent(order, { refund: { charge: null } }),
    ];
    for (const event of invalid) {
        await assert.rejects(updateStripeRefundState(event, options), { code: 'REFUND_EVENT_INVALID' });
    }
    assert.equal(queryCount, 0);
});
