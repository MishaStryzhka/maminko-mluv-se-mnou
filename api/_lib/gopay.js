const DEFAULT_GATEWAY = 'https://gw.sandbox.gopay.com/api';

function config() {
    const clientId = process.env.GOPAY_CLIENT_ID;
    const clientSecret = process.env.GOPAY_CLIENT_SECRET;
    const goid = process.env.GOPAY_GOID;
    if (!clientId || !clientSecret || !goid) {
        const error = new Error('GoPay sandbox credentials are not configured');
        error.code = 'GOPAY_NOT_CONFIGURED';
        throw error;
    }
    return {
        clientId,
        clientSecret,
        goid: Number(goid),
        gateway: (process.env.GOPAY_GATEWAY_URL || DEFAULT_GATEWAY).replace(/\/$/, ''),
    };
}

async function accessToken(scope) {
    const { clientId, clientSecret, gateway } = config();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${gateway}/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basic}`,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
        const error = new Error('GoPay OAuth request failed');
        error.code = 'GOPAY_OAUTH_FAILED';
        error.status = response.status;
        throw error;
    }
    return `${body.token_type || 'Bearer'} ${body.access_token}`;
}

function splitName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return {
        firstName: parts.shift() || '',
        lastName: parts.join(' ') || '-',
    };
}

export async function createPayment(order, publicOrigin) {
    const { goid, gateway } = config();
    const token = await accessToken('payment-create');
    const { firstName, lastName } = splitName(order.customerName);
    const amount = order.totalAmount * 100;
    const items = [
        { name: order.productName, amount: order.productPrice * 100, count: 1 },
    ];
    if (order.shippingPrice > 0) {
        items.push({ name: 'Doprava Balíkovna', amount: order.shippingPrice * 100, count: 1 });
    }

    const payload = {
        payer: {
            contact: {
                first_name: firstName,
                last_name: lastName,
                email: order.customerEmail,
                phone_number: order.customerPhone,
                country_code: 'CZE',
            },
        },
        target: { type: 'ACCOUNT', goid },
        amount,
        currency: 'CZK',
        order_number: order.orderNumber,
        order_description: `Maminko, mluv se mnou · ${order.productName}`,
        items,
        callback: {
            return_url: `${publicOrigin}/api/gopay-return?order=${encodeURIComponent(order.orderNumber)}&token=${encodeURIComponent(order.publicToken)}`,
            notification_url: `${publicOrigin}/api/gopay-notify`,
        },
        lang: order.lang === 'uk' ? 'EN' : 'CS',
    };

    const response = await fetch(`${gateway}/payments/payment`, {
        method: 'POST',
        headers: {
            Authorization: token,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.id || !body.gw_url) {
        const error = new Error('GoPay payment creation failed');
        error.code = 'GOPAY_CREATE_FAILED';
        error.status = response.status;
        error.provider = body;
        throw error;
    }
    return body;
}

export async function getPayment(paymentId) {
    const { gateway } = config();
    const token = await accessToken('payment-all');
    const response = await fetch(`${gateway}/payments/payment/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: token, Accept: 'application/json' },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.id) {
        const error = new Error('GoPay payment status request failed');
        error.code = 'GOPAY_STATUS_FAILED';
        error.status = response.status;
        throw error;
    }
    return body;
}

export function localPaymentStatus(gopayState) {
    switch (String(gopayState || '').toUpperCase()) {
        case 'PAID':
            return 'paid';
        case 'REFUNDED':
            return 'refunded';
        case 'CANCELED':
        case 'TIMEOUTED':
        case 'FAILED':
            return 'failed';
        default:
            return 'pending';
    }
}
