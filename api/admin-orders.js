import { getAdminSession } from './_lib/admin-auth.js';
import { randomUUID } from 'node:crypto';
import { claimPaidConfirmation, releaseConfirmationClaim, markConfirmationSent, removeOrderFromAdmin, listOrdersForAdmin } from './_lib/db.js';
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
        digitalConsentAt: row.digital_consent_at ?? null,
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

    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        const user = await getAdminSession(req);
        if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
        if (!['admin', 'sales', 'accountant'].includes(user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN' });
        }

        if (req.method === 'POST') {
            if (req.headers['x-order-action'] === 'remove-order') {
                if (user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN' });
                const number = req.body?.orderNumber;
                if (typeof number !== 'string' || !number || number.length > 64) return res.status(400).json({ error: 'INVALID_REQUEST' });
                const removed = await removeOrderFromAdmin(number);
                return removed ? res.status(200).json({ removed }) : res.status(409).json({ error: 'ORDER_NOT_REMOVABLE' });
            }
            if (!['admin', 'sales'].includes(user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
            if (req.headers['x-order-action'] !== 'resend-confirmation') return res.status(400).json({ error: 'INVALID_ACTION' });
            const { orderNumber, attempts } = req.body || {};
            if (typeof orderNumber !== 'string' || orderNumber.length > 64 || !Number.isSafeInteger(attempts) || attempts < 0) {
                return res.status(400).json({ error: 'INVALID_REQUEST' });
            }
            const claimId = randomUUID();
            const order = await claimPaidConfirmation(orderNumber, claimId, false, { expectedAttempts: attempts });
            if (!order) return res.status(409).json({ error: 'ORDER_NOT_AVAILABLE' });
            try {
                const { sendConfirmationEmail } = await import('./_lib/confirmation-email.js');
                await sendConfirmationEmail(order, { resendId: claimId });
            } catch {
                await releaseConfirmationClaim(orderNumber, claimId);
                return res.status(502).json({ error: 'EMAIL_SEND_FAILED' });
            }
            await markConfirmationSent(orderNumber, claimId);
            return res.status(200).json({ sent: true });
        }
        if (req.query?.orderNumber !== undefined) {
            const number = req.query.orderNumber;
            if (typeof number !== 'string' || !/^MAM-\d{4}-(?:[A-F0-9]{8}|\d{2}-\d{4,})$/i.test(number)) {
                return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
            }
            const [row] = await listOrdersForAdmin(1, { orderNumber: number.toUpperCase() });
            if (!row) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
            return res.status(200).json({ order: mapOrder(row) });
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
