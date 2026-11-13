import { stripeConfiguration, stripeWebhookClient } from './_lib/stripe.js';
import { updateStripePaymentState, updateStripeRefundState } from './_lib/db.js';
import { deliverPaidConfirmation } from './_lib/order-confirmation.js';
import { isStripeRefundEvent } from './_lib/stripe-refunds.js';

// Vercel must leave the body untouched for signature verification.
export const config = { api: { bodyParser: false } };

async function rawBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 262144) throw new Error('BODY_TOO_LARGE');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

export function statusFromEvent(event) {
    const session = event?.data?.object;
    switch (event.type) {
        case 'checkout.session.completed':
            return session?.payment_status === 'paid' ? 'paid' : 'pending';
        case 'checkout.session.async_payment_succeeded':
            return 'paid';
        case 'checkout.session.async_payment_failed':
            return 'failed';
        case 'checkout.session.expired':
            return 'cancelled';
        default:
            return null;
    }
}

export function eventModeMatches(event) {
    const object = event.data?.object;
    const { test, live } = stripeConfiguration();
    return typeof event.livemode === 'boolean'
        && ((event.livemode && live) || (!event.livemode && test))
        // Unlike Checkout Session and Charge, Refund has no livemode field.
        && (isStripeRefundEvent(event)
            ? object?.object === 'refund' && (!Object.hasOwn(object, 'livemode') || object.livemode === event.livemode)
            : typeof object?.livemode === 'boolean' && event.livemode === object.livemode);
}

export function createStripeWebhookHandler({
    client = stripeWebhookClient,
    updatePayment = updateStripePaymentState,
    updateRefund = updateStripeRefundState,
    deliverConfirmation = deliverPaidConfirmation,
    logger = console,
} = {}) {
return async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED' });

    let event;
    try {
        const stripe = client();
        event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
        // Signature errors may include request contents. Do not log payloads.
        logger.warn('Stripe webhook signature invalid: WEBHOOK_INVALID');
        return res.status(400).json({ error: 'WEBHOOK_INVALID' });
    }

    const status = statusFromEvent(event);
    const refund = isStripeRefundEvent(event);
    if (!status && !refund) return res.status(200).json({ received: true });
    if (!eventModeMatches(event)) return res.status(400).json({ error: 'WEBHOOK_MODE_MISMATCH' });

    try {
        const session = event.data.object;
        const order = refund ? await updateRefund(event) : await updatePayment(session, status);
        if (!order) {
            logger.error('Stripe webhook unmatched order', event.id);
            return res.status(500).json({ error: 'ORDER_RECONCILIATION_FAILED' });
        }
        // Live email gates fulfillment. Preview may send explicitly enabled
        // TEST receipts only to the shop's own inbox, never arbitrary customers.
        if (status === 'paid' && !order.stripe_refund_hold) await deliverConfirmation(order);
        return res.status(200).json({ received: true });
    } catch (error) {
        // SMTP error messages may contain addresses/server responses.
        logger.error('Stripe webhook processing failed', /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'PROCESSING_ERROR');
        return res.status(500).json({ error: 'WEBHOOK_PROCESSING_FAILED' });
    }
};
}

export default createStripeWebhookHandler();
