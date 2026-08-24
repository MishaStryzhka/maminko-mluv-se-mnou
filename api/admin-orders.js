import crypto from 'node:crypto';
import { listOrdersForAdmin } from './_lib/db.js';

function adminSecret() {
    return String(process.env.ADMIN_API_TOKEN || '');
}

function authorized(req) {
    const expected = adminSecret();
    const provided = String(req.headers['x-admin-token'] || '');
    if (!expected || !provided) return false;

    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

function mapOrder(row) {
    return {
        orderNumber: row.order_number,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lang: row.lang,
        productCode: row.product_code,
        productName: row.product_name,
        productPrice: row.product_price,
        currency: row.currency,
        customer: {
            name: row.customer_name,
            email: row.customer_email,
            phone: row.customer_phone,
        },
        shipping: {
            method: row.shipping_method,
            price: row.shipping_price,
            status: row.shipping_status,
            pickup: row.shipping_method === 'pickup' ? {
                id: row.pickup_point_id,
                name: row.pickup_point_name,
                zip: row.pickup_point_zip,
                address: row.pickup_point_address,
                type: row.pickup_point_type,
            } : null,
            address: row.shipping_method === 'address' ? {
                street: row.address_street,
                city: row.address_city,
                zip: row.address_zip,
                country: row.address_country,
            } : null,
        },
        totalAmount: row.total_amount,
        payment: {
            status: row.payment_status,
            gopayPaymentId: row.gopay_payment_id,
            gopayState: row.gopay_state,
            paidAt: row.paid_at,
        },
    };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    if (!adminSecret()) {
        return res.status(503).json({ error: 'ADMIN_NOT_CONFIGURED' });
    }

    if (!authorized(req)) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    try {
        const limit = Number(req.query?.limit || 100);
        const rows = await listOrdersForAdmin(limit);
        return res.status(200).json({ orders: rows.map(mapOrder) });
    } catch (error) {
        console.error('Admin orders failed', error?.code || error?.message);
        if (error?.code === 'DATABASE_NOT_CONFIGURED') {
            return res.status(503).json({ error: error.code });
        }
        return res.status(500).json({ error: 'ADMIN_ORDERS_FAILED' });
    }
}
