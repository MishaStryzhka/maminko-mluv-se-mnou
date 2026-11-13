import crypto from 'node:crypto';
import { claimPaidConfirmation, getConfirmationState, markConfirmationSent, releaseConfirmationClaim } from './db.js';
import { ownerTestEmailEnabled, sendConfirmationEmail, SHOP_EMAIL } from './confirmation-email.js';

const dependencies = {
    claim: claimPaidConfirmation,
    state: getConfirmationState,
    send: sendConfirmationEmail,
    markSent: markConfirmationSent,
    release: releaseConfirmationClaim,
    claimId: () => crypto.randomUUID(),
};

// Only called with an order returned by signed Stripe payment reconciliation.
// Dependency injection keeps tests fully offline; no public send-mail endpoint.
export async function deliverPaidConfirmation(order, overrides = {}) {
    const deps = { ...dependencies, ...overrides };
    if (order.stripe_refund_hold) return { status: 'refund_suppressed' };
    const allowTest = ownerTestEmailEnabled();
    if (order.payment_test_mode && (!allowTest || order.customer_email?.toLowerCase() !== SHOP_EMAIL)) {
        return { status: 'test_suppressed' };
    }
    const claimId = deps.claimId();
    const claimed = await deps.claim(order.order_number, claimId, allowTest);
    if (!claimed) {
        const current = await deps.state(order.order_number);
        if (current?.stripe_refund_hold) return { status: 'refund_suppressed' };
        if (current?.confirmation_email_status === 'sent') return { status: 'already_sent' };
        // ACKing an active lease could permanently strand a crashed attempt.
        // Stripe must keep retrying until this lease expires or is finalized.
        const error = new Error('CONFIRMATION_RETRY_REQUIRED');
        error.code = 'CONFIRMATION_RETRY_REQUIRED';
        throw error;
    }
    try {
        await deps.send(claimed);
    } catch (error) {
        await deps.release(order.order_number, claimId);
        throw error;
    }
    // Do not release on a DB failure after SMTP accepted the message. Retain
    // the lease to avoid an immediate duplicate; stale recovery is at-least-once.
    await deps.markSent(order.order_number, claimId);
    return { status: 'sent' };
}
