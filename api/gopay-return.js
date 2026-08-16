import { findOrderByPaymentId, updatePaymentState } from './_lib/db.js';
import { getPayment, localPaymentStatus } from './_lib/gopay.js';

function origin(req) {
    if (process.env.PUBLIC_SITE_URL) return process.env.PUBLIC_SITE_URL.replace(/\/$/, '');
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).send('METHOD_NOT_ALLOWED');

    const paymentId = String(req.query?.id || '').trim();
    const orderNumber = String(req.query?.order || '').trim();
    const publicToken = String(req.query?.token || '').trim();
    const base = origin(req);

    if (!paymentId) {
        return res.redirect(302, `${base}/success.html?state=missing-payment`);
    }

    try {
        const stored = await findOrderByPaymentId(paymentId);
        if (!stored) return res.redirect(302, `${base}/success.html?state=unknown`);

        const payment = await getPayment(paymentId);
        const status = localPaymentStatus(payment.state);
        const order = await updatePaymentState(paymentId, payment.state || 'UNKNOWN', status);
        const ref = orderNumber || order?.order_number || stored.order_number;
        const token = publicToken || stored.public_token;
        const params = new URLSearchParams({ order: ref, token, state: status });
        return res.redirect(302, `${base}/success.html?${params.toString()}`);
    } catch (error) {
        console.error('GoPay return verification failed', error?.code || error?.message);
        const params = new URLSearchParams({ order: orderNumber, token: publicToken, state: 'verification-error' });
        return res.redirect(302, `${base}/success.html?${params.toString()}`);
    }
}
