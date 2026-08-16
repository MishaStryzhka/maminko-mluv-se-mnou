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

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const pickup = price('SHIPPING_PICKUP_CZK', DEFAULT_SHIPPING.pickup);
    const address = price('SHIPPING_ADDRESS_CZK', DEFAULT_SHIPPING.address);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
        shipping: { pickup, address },
        databaseReady: Boolean(process.env.DATABASE_URL),
        gopaySandboxReady: Boolean(process.env.GOPAY_GOID && process.env.GOPAY_CLIENT_ID && process.env.GOPAY_CLIENT_SECRET),
        sandbox: (process.env.GOPAY_GATEWAY_URL || 'https://gw.sandbox.gopay.com/api').includes('sandbox'),
    });
}
