import { getAdminSession } from './_lib/admin-auth.js';
import { listOrdersForAdmin } from './_lib/db.js';
import { refundPaymentView } from './_lib/stripe-refunds.js';

export function mapOrder(row) {
    const payment = refundPaymentView(row);
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
            status: payment.refund.hold && row.shipping_status === 'ready' ? 'not_ready' : row.shipping_status,
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
        confirmationEmail: {
            status: row.confirmation_email_status,
            attempts: row.confirmation_email_attempts,
            sentAt: row.confirmation_email_sent_at,
        },
        payment: {
            ...payment,
            provider: row.payment_provider,
            testMode: row.payment_test_mode,
            stripeSessionId: row.stripe_session_id,
            stripePaymentIntentId: row.stripe_payment_intent_id,
            stripeState: row.stripe_payment_status,
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

    try {
        const user = await getAdminSession(req);
        if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
        if (!['admin', 'sales', 'accountant'].includes(user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        const limit = Number(req.query?.limit || 100);
        const rows = await listOrdersForAdmin(limit);
        return res.status(200).json({ orders: rows.map(mapOrder) });
    } catch (error) {
        console.error('Admin orders failed', /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'ADMIN_ORDERS_FAILED');
        if (error?.code === 'DATABASE_NOT_CONFIGURED') {
            return res.status(503).json({ error: error.code });
        }
        return res.status(500).json({ error: 'ADMIN_ORDERS_FAILED' });
    }
}
