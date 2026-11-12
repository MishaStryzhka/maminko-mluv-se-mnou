import Stripe from 'stripe';

export function stripeConfiguration() {
    const key = process.env.STRIPE_SECRET_KEY || '';
    // Stripe restricted keys (rk_*) work with Checkout Sessions too. Treat
    // them as the same environment, preserving the explicit live guard.
    const test = key.startsWith('sk_test_') || key.startsWith('rk_test_');
    const live = key.startsWith('sk_live_') || key.startsWith('rk_live_');
    const enabled = process.env.STRIPE_CHECKOUT_ENABLED === 'true'
        && (test || (live && process.env.STRIPE_ALLOW_LIVE === 'true'));
    return { enabled, test, live };
}

function publicOrigin(url) {
    const origin = (url || '').replace(/\/$/, '');
    try {
        const parsed = new URL(origin);
        if (parsed.protocol === 'https:' && parsed.origin === origin && !parsed.username && !parsed.password) return origin;
    } catch { /* invalid URL */ }
    const error = new Error('PUBLIC_SITE_URL must be a public HTTPS origin');
    error.code = 'PAYMENTS_NOT_READY';
    throw error;
}

export function stripeCheckoutReady() {
    if (!stripeConfiguration().enabled) return false;
    try { publicOrigin(process.env.PUBLIC_SITE_URL); } catch { return false; }
    return Boolean(process.env.DATABASE_URL)
        && Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripeClient() {
    if (!stripeConfiguration().enabled) {
        const error = new Error('Stripe checkout is disabled');
        error.code = 'PAYMENTS_NOT_READY';
        throw error;
    }
    return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Webhooks for already-created sessions must continue working even if the
// new-checkout switch is turned off while those payments are settling.
export function stripeWebhookClient() {
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (!stripeConfiguration().test && !stripeConfiguration().live) {
        const error = new Error('Stripe webhook is not configured');
        error.code = 'WEBHOOK_NOT_CONFIGURED';
        throw error;
    }
    return new Stripe(key);
}

export function buildStripeCheckoutParams(order, siteUrl) {
    const origin = publicOrigin(siteUrl);

    const success = new URL('/success.html', origin);
    success.searchParams.set('order', order.orderNumber);
    success.searchParams.set('token', order.publicToken);
    // Stripe replaces this placeholder on redirect. Do not infer paid status from it.
    success.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    const cancel = new URL('/checkout.html', origin);
    cancel.searchParams.set('product', order.productCode);
    cancel.searchParams.set('payment', 'cancelled');

    const lineItems = [{
        price_data: {
            currency: 'czk',
            unit_amount: order.productPrice * 100,
            product_data: { name: order.productName },
        },
        quantity: 1,
    }];
    if (order.shippingPrice > 0) {
        lineItems.push({
            price_data: {
                currency: 'czk',
                unit_amount: order.shippingPrice * 100,
                product_data: { name: order.shippingMethod === 'pickup' ? 'Doprava Balíkovna / BOX' : 'Doprava Balíkovna na adresu' },
            },
            quantity: 1,
        });
    }

    return {
        mode: 'payment',
        line_items: lineItems,
        customer_email: order.customerEmail,
        client_reference_id: order.orderNumber,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
        payment_intent_data: { metadata: { orderNumber: order.orderNumber } },
        locale: order.lang === 'cs' ? 'cs' : 'auto',
        // Stripe requires the placeholder with literal braces, not URL-encoded.
        success_url: success.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}'),
        cancel_url: cancel.toString(),
    };
}

export async function createStripeSession(order) {
    const stripe = stripeClient();
    return stripe.checkout.sessions.create(buildStripeCheckoutParams(order, process.env.PUBLIC_SITE_URL), {
        idempotencyKey: order.id,
    });
}
