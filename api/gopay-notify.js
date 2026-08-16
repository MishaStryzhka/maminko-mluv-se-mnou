import { findOrderByPaymentId, updatePaymentState } from './_lib/db.js';
import { getPayment, localPaymentStatus } from './_lib/gopay.js';

export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).send('METHOD_NOT_ALLOWED');
    }

    const paymentId = String(req.query?.id || '').trim();
    if (!paymentId) return res.status(400).send('MISSING_PAYMENT_ID');

    try {
        const order = await findOrderByPaymentId(paymentId);
        if (!order) {
            // Acknowledge an unknown ID so GoPay does not repeatedly retry a notification
            // that cannot be matched to an order in this database.
            return res.status(200).send('OK');
        }

        const payment = await getPayment(paymentId);
        const status = localPaymentStatus(payment.state);
        await updatePaymentState(paymentId, payment.state || 'UNKNOWN', status);
        return res.status(200).send('OK');
    } catch (error) {
        console.error('GoPay notification failed', error?.code || error?.message);
        return res.status(500).send('RETRY');
    }
}
