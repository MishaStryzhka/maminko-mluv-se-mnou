import crypto from 'node:crypto';
import { insertOrder, attachGoPayPayment } from './_lib/db.js';
import { createPayment } from './_lib/gopay.js';

const PRODUCTS = {
    full: { name: 'Kompletní balíček', price: 750 },
    print: { name: 'Tištěná publikace', price: 490 },
};

function jsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    return {};
}

function clean(value, max = 200) {
    return String(value || '').trim().slice(0, max);
}

function shippingPrice(method) {
    const key = method === 'pickup' ? 'SHIPPING_PICKUP_CZK' : 'SHIPPING_ADDRESS_CZK';
    const raw = process.env[key];
    if (raw === undefined || raw === '') {
        const error = new Error(`${key} is not configured`);
        error.code = 'SHIPPING_NOT_CONFIGURED';
        throw error;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        const error = new Error(`${key} must be a non-negative integer CZK amount`);
        error.code = 'SHIPPING_CONFIG_INVALID';
        throw error;
    }
    return value;
}

function publicOrigin(req) {
    if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, '');
    const proto = clean(req.headers['x-forwarded-proto'] || 'https', 10);
    const host = clean(req.headers['x-forwarded-host'] || req.headers.host, 250);
    return `${proto}://${host}`;
}

function validate(body) {
    if (!PRODUCTS[body.product]) return 'INVALID_PRODUCT';
    if (!['cs', 'uk'].includes(body.lang)) return 'INVALID_LANGUAGE';
    if (!['pickup', 'address'].includes(body.shipping)) return 'INVALID_SHIPPING';
    if (!clean(body.customer?.name, 120)) return 'NAME_REQUIRED';
    if (!/^\S+@\S+\.\S+$/.test(clean(body.customer?.email, 180))) return 'EMAIL_INVALID';
    if (!clean(body.customer?.phone, 50)) return 'PHONE_REQUIRED';
    if (body.shipping === 'pickup' && !clean(body.pickup?.id, 80)) return 'PICKUP_REQUIRED';
    if (body.shipping === 'address') {
        if (!clean(body.address?.street, 180) || !clean(body.address?.city, 120) || !clean(body.address?.zip, 20)) {
            return 'ADDRESS_REQUIRED';
        }
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    let body;
    try {
        body = jsonBody(req);
    } catch {
        return res.status(400).json({ error: 'INVALID_JSON' });
    }

    const validationError = validate(body);
    if (validationError) return res.status(400).json({ error: validationError });

    try {
        const product = PRODUCTS[body.product];
        const delivery = shippingPrice(body.shipping);
        const id = crypto.randomUUID();
        const publicToken = crypto.randomBytes(24).toString('base64url');
        const orderNumber = `MAM-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        const order = {
            id,
            orderNumber,
            publicToken,
            lang: body.lang,
            productCode: body.product,
            productName: product.name,
            productPrice: product.price,
            customerName: clean(body.customer.name, 120),
            customerEmail: clean(body.customer.email, 180).toLowerCase(),
            customerPhone: clean(body.customer.phone, 50),
            shippingMethod: body.shipping,
            shippingPrice: delivery,
            pickupPointId: body.shipping === 'pickup' ? clean(body.pickup?.id, 80) : null,
            pickupPointName: body.shipping === 'pickup' ? clean(body.pickup?.name, 200) : null,
            pickupPointZip: body.shipping === 'pickup' ? clean(body.pickup?.zip, 20) : null,
            pickupPointAddress: body.shipping === 'pickup' ? clean(body.pickup?.address, 300) : null,
            pickupPointType: body.shipping === 'pickup' ? clean(body.pickup?.type, 80) : null,
            pickupPointLat: body.shipping === 'pickup' && Number.isFinite(Number(body.pickup?.lat)) ? Number(body.pickup.lat) : null,
            pickupPointLng: body.shipping === 'pickup' && Number.isFinite(Number(body.pickup?.lng)) ? Number(body.pickup.lng) : null,
            addressStreet: body.shipping === 'address' ? clean(body.address?.street, 180) : null,
            addressCity: body.shipping === 'address' ? clean(body.address?.city, 120) : null,
            addressZip: body.shipping === 'address' ? clean(body.address?.zip, 20) : null,
            addressCountry: body.shipping === 'address' ? 'CZ' : null,
            totalAmount: product.price + delivery,
        };

        await insertOrder(order);

        let payment;
        try {
            payment = await createPayment(order, publicOrigin(req));
            await attachGoPayPayment(orderNumber, payment);
        } catch (error) {
            console.error('GoPay create payment failed', error?.code || error?.message);
            return res.status(502).json({
                error: error?.code || 'PAYMENT_CREATE_FAILED',
                orderNumber,
                publicToken,
            });
        }

        return res.status(201).json({
            orderNumber,
            publicToken,
            productPrice: product.price,
            shippingPrice: delivery,
            totalAmount: order.totalAmount,
            payment: {
                id: String(payment.id),
                state: payment.state || null,
                gatewayUrl: payment.gw_url,
            },
        });
    } catch (error) {
        console.error('Checkout failed', error?.code || error?.message);
        const configurationErrors = new Set([
            'DATABASE_NOT_CONFIGURED',
            'SHIPPING_NOT_CONFIGURED',
            'SHIPPING_CONFIG_INVALID',
        ]);
        if (configurationErrors.has(error?.code)) {
            return res.status(503).json({ error: error.code });
        }
        return res.status(500).json({ error: 'CHECKOUT_FAILED' });
    }
}
