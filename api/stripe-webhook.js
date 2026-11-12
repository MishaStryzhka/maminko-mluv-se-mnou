import { stripeConfiguration, stripeWebhookClient } from './_lib/stripe.js';
import { updateStripePaymentState } from './_lib/db.js';
import { deliverPaidConfirmation } from './_lib/order-confirmation.js';

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
    const session = event.data.object;
    switch (event.type) {
        case 'checkout.session.completed':
            return session.payment_status === 'paid' ? 'paid' : 'pending';
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
    const session = event.data?.object;
    const { test, live } = stripeConfiguration();
    return typeof event.livemode === 'boolean'
        && typeof session?.livemode === 'boolean'
        && event.livemode === session.livemode
        && ((event.livemode && live) || (!event.livemode && test));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED' });

    let event;
    try {
        const stripe = stripeWebhookClient();
        event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
        // Signature errors may include request contents. Do not log payloads.
        console.warn('Stripe webhook signature invalid: WEBHOOK_INVALID');
        return res.status(400).json({ error: 'WEBHOOK_INVALID' });
    }

    const status = statusFromEvent(event);
    if (!status) return res.status(200).json({ received: true });
    if (!eventModeMatches(event)) return res.status(400).json({ error: 'WEBHOOK_MODE_MISMATCH' });

    try {
        const session = event.data.object;
        const order = await updateStripePaymentState(session, status);
        if (!order) {
            console.error('Stripe webhook unmatched order', event.id);
            return res.status(500).json({ error: 'ORDER_RECONCILIATION_FAILED' });
        }
        // Live email gates fulfillment. Preview may send explicitly enabled
        // TEST receipts only to the shop's own inbox, never arbitrary customers.
        if (status === 'paid') await deliverPaidConfirmation(order);
        return res.status(200).json({ received: true });
    } catch (error) {
        // SMTP error messages may contain addresses/server responses.
        console.error('Stripe webhook processing failed', /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'PROCESSING_ERROR');
        return res.status(500).json({ error: 'WEBHOOK_PROCESSING_FAILED' });
    }
}
