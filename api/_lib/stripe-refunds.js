const REFUND_EVENTS = new Set(['refund.created', 'refund.updated', 'refund.failed']);
const STATUS_RANK = { pending: 0, requires_action: 1, succeeded: 2, canceled: 3, failed: 4 };

export function isStripeRefundEvent(event) {
    return REFUND_EVENTS.has(event?.type);
}

function reference(value, pattern) {
    const id = typeof value === 'string' ? value : value?.id;
    return typeof id === 'string' && id.length <= 255 && pattern.test(id) ? id : null;
}

export function parseStripeRefundEvent(event) {
    const refund = event?.data?.object;
    const id = reference(refund?.id, /^(re|pyr)_[A-Za-z0-9_]+$/);
    const charge = reference(refund?.charge, /^(ch|py)_[A-Za-z0-9_]+$/);
    const paymentIntent = reference(refund?.payment_intent, /^pi_[A-Za-z0-9_]+$/);
    if (!isStripeRefundEvent(event) || refund?.object !== 'refund' || !id || !charge || !paymentIntent
        || typeof event.livemode !== 'boolean' || !reference(event.id, /^evt_[A-Za-z0-9_]+$/)
        || !Number.isSafeInteger(event.created) || event.created <= 0
        || !Number.isSafeInteger(refund.amount) || refund.amount <= 0
        || typeof refund.currency !== 'string' || !/^[a-z]{3}$/.test(refund.currency)
        || typeof refund.status !== 'string' || !Object.hasOwn(STATUS_RANK, refund.status)
        || (Object.hasOwn(refund, 'livemode') && refund.livemode !== event.livemode)) {
        const error = new Error('REFUND_EVENT_INVALID');
        error.code = 'REFUND_EVENT_INVALID';
        throw error;
    }
    return {
        testMode: !event.livemode,
        record: {
            id, charge, paymentIntent, amount: refund.amount, currency: refund.currency,
            status: refund.status, eventCreated: event.created, eventId: event.id,
            statusRank: STATUS_RANK[refund.status],
        },
    };
}

// The captured payment is historical evidence; refunds are a separate ledger.
// Both public and admin APIs project the same effective payment state from it.
// Only succeeded refunds reduce the received amount. Pending is never "returned".
export function refundPaymentView(row) {
    const source = row.stripe_refunds ?? {};
    const validObject = typeof source === 'object' && !Array.isArray(source);
    const records = validObject ? Object.values(source) : [];
    const totalMinor = Number(row.total_amount) * 100;
    let invalid = !validObject || !Number.isSafeInteger(totalMinor) || totalMinor < 0;
    let refundedMinor = 0;
    let pendingMinor = 0;
    let failedCount = 0;
    let canceledCount = 0;
    let requiresAction = false;
    for (const refund of records) {
        if (!refund || !Number.isSafeInteger(refund.amount) || refund.amount <= 0
            || refund.amount > totalMinor || refund.currency !== String(row.currency || 'CZK').toLowerCase()
            || typeof refund.status !== 'string' || !Object.hasOwn(STATUS_RANK, refund.status)) {
            invalid = true;
            continue;
        }
        if (refund.status === 'succeeded') refundedMinor += refund.amount;
        if (['pending', 'requires_action'].includes(refund.status)) pendingMinor += refund.amount;
        if (refund.status === 'requires_action') requiresAction = true;
        if (refund.status === 'failed') failedCount += 1;
        if (refund.status === 'canceled') canceledCount += 1;
    }
    invalid ||= !Number.isSafeInteger(refundedMinor + pendingMinor) || refundedMinor + pendingMinor > totalMinor;
    const hold = Boolean(row.stripe_refund_hold || records.length || invalid);
    let status = row.payment_status || 'pending';
    let refundStatus = 'none';
    if (invalid || (hold && !records.length)) {
        status = 'refund_review'; refundStatus = 'review';
    } else if (refundedMinor > 0 && refundedMinor === totalMinor) {
        status = 'refunded'; refundStatus = 'full';
    } else if (pendingMinor > 0) {
        status = 'refund_pending'; refundStatus = requiresAction ? 'requires_action' : 'pending';
    } else if (refundedMinor > 0) {
        status = 'partially_refunded'; refundStatus = 'partial';
    } else if (failedCount) {
        status = 'refund_failed'; refundStatus = 'failed';
    } else if (canceledCount) {
        status = 'refund_canceled'; refundStatus = 'canceled';
    }
    return {
        status, originalStatus: row.payment_status || 'pending',
        refund: {
            status: refundStatus,
            refundedAmount: invalid ? 0 : refundedMinor / 100,
            pendingAmount: invalid ? 0 : pendingMinor / 100,
            failedCount, canceledCount, hold,
        },
    };
}
