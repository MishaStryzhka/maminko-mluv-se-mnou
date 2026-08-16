import { findOrderByPublicToken } from './_lib/db.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const orderNumber = String(req.query?.order || '').trim();
    const publicToken = String(req.query?.token || '').trim();
    if (!orderNumber || !publicToken) return res.status(400).json({ error: 'MISSING_ORDER_TOKEN' });

    try {
        const order = await findOrderByPublicToken(orderNumber, publicToken);
        if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        return res.status(200).json({ order });
    } catch (error) {
        console.error('Order status failed', error?.code || error?.message);
        if (error?.code === 'DATABASE_NOT_CONFIGURED') return res.status(503).json({ error: error.code });
        return res.status(500).json({ error: 'ORDER_STATUS_FAILED' });
    }
}
