function price(name) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 ? value : null;
}

export default function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const pickup = price('SHIPPING_PICKUP_CZK');
    const address = price('SHIPPING_ADDRESS_CZK');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
        shipping: { pickup, address },
        databaseReady: Boolean(process.env.DATABASE_URL),
        gopaySandboxReady: Boolean(process.env.GOPAY_GOID && process.env.GOPAY_CLIENT_ID && process.env.GOPAY_CLIENT_SECRET),
        sandbox: (process.env.GOPAY_GATEWAY_URL || 'https://gw.sandbox.gopay.com/api').includes('sandbox'),
    });
}
