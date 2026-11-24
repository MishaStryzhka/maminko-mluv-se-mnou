import { stripeCheckoutReady, stripeConfiguration } from './_lib/stripe.js';

import { getAdminSession } from './_lib/admin-auth.js';
import { productPrices, readPromotion, regularPrices, savePromotion } from './_lib/promotion.js';

const DEFAULT_SHIPPING = {
    pickup: 89,
    address: 119,
};

function price(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : fallback;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).end();
        const user = await getAdminSession(req);
        if (!user) return res.status(401).end();
        if (user.role !== 'admin') return res.status(403).end();
        const { active, percent } = req.body ?? {};
        if (typeof active !== 'boolean' || !Number.isInteger(percent) || percent < 1 || percent > 99) {
            return res.status(400).json({ error: 'INVALID_PROMOTION' });
        }
        await savePromotion(active, percent);
        return res.status(200).json({ active, percent });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const pickup = price('SHIPPING_PICKUP_CZK', DEFAULT_SHIPPING.pickup);
    const address = price('SHIPPING_ADDRESS_CZK', DEFAULT_SHIPPING.address);
    const stripe = stripeConfiguration();
    const promotion = await readPromotion();
    return res.status(200).json({
        promotion, regularPrices, prices: productPrices(promotion),
        shipping: { pickup, address },
        databaseReady: Boolean(process.env.DATABASE_URL),
        stripeEnabled: stripeCheckoutReady(),
        sandbox: stripe.test,
    });
}
