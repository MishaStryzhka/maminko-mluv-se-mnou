import nodemailer from 'nodemailer';

const SMTP_HOST = 'smtp.seznam.cz';
const SMTP_PORT = 465;
export const SHOP_EMAIL = 'info@maminko-mluv-se-mnou.cz';

function emailError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

export function smtpUser() {
    return String(process.env.SMTP_USER || '').trim().toLowerCase();
}

export function ownerTestEmailEnabled() {
    return process.env.ORDER_EMAIL_TEST_ENABLED === 'true' && smtpUser() === SHOP_EMAIL;
}

// A single address only, never Nodemailer's comma-separated address syntax.
// All names and other untrusted order fields are escaped separately below.
export function validRecipient(value) {
    return typeof value === 'string' && value.length <= 254
        && /^[A-Z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(value);
}

const translations = {
    cs: {
        subject: 'Potvrzení přijetí objednávky',
        greeting: 'Dobrý den',
        intro: 'Potvrzujeme přijetí a úhradu vaší objednávky Maminko, mluv se mnou.',
        order: 'Číslo objednávky',
        product: 'Produkt',
        productPrice: 'Cena produktu',
        delivery: 'Doprava',
        shippingPrice: 'Cena dopravy',
        total: 'Celkem zaplaceno',
        address: 'Doručení',
        pickup: 'Balíkovna / výdejní místo',
        home: 'Balíkovna na adresu',
        digital: 'Pokyny ke zpřístupnění digitálních materiálů vám zašleme samostatně.',
        closing: 'V případě dotazů nám odpovězte na tento e-mail.',
        signature: 'Tým Maminko, mluv se mnou',
        test: 'TEST — pouze zkouška integrace. Nejde o skutečnou platbu, objednávku ani potvrzení smlouvy. Zboží neodesílejte.',
    },
    uk: {
        subject: 'Підтвердження прийняття замовлення',
        greeting: 'Вітаємо',
        intro: 'Підтверджуємо отримання та оплату вашого замовлення Maminko, mluv se mnou.',
        order: 'Номер замовлення',
        product: 'Товар',
        productPrice: 'Вартість товару',
        delivery: 'Доставка',
        shippingPrice: 'Вартість доставки',
        total: 'Усього оплачено',
        address: 'Адреса доставки',
        pickup: 'Balíkovna / пункт видачі',
        home: 'Balíkovna на адресу',
        digital: 'Інструкції для доступу до цифрових матеріалів надішлемо окремо.',
        closing: 'Якщо виникнуть запитання, дайте відповідь на цей лист.',
        signature: 'Команда Maminko, mluv se mnou',
        test: 'TEST — лише перевірка інтеграції. Це не справжня оплата, замовлення чи підтвердження договору. Не відправляйте товар.',
    },
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

function price(value) {
    return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Number(value))} Kč`;
}

function recipientAddress(order) {
    if (order.shipping_method === 'pickup') {
        return [order.pickup_point_name, order.pickup_point_address, order.pickup_point_zip].filter(Boolean).join(', ');
    }
    return [order.address_street, order.address_zip, order.address_city, 'Česká republika'].filter(Boolean).join(', ');
}

export function smtpConfigurationReady() {
    return Boolean(process.env.SMTP_APP_PASSWORD?.trim())
        && smtpUser() === SHOP_EMAIL;
}

export function buildConfirmationEmail(order) {
    const tr = translations[order.lang] || translations.cs;
    const test = order.payment_test_mode === true;
    const shipping = order.shipping_method === 'pickup' ? tr.pickup : tr.home;
    const rows = [
        [tr.order, order.order_number],
        [tr.product, order.product_name],
        [tr.productPrice, price(order.product_price)],
        [tr.delivery, shipping],
        [tr.address, recipientAddress(order)],
        [tr.shippingPrice, price(order.shipping_price)],
        [tr.total, price(order.total_amount)],
    ];
    const addendum = order.product_code === 'full' ? tr.digital : null;
    const text = [
        `${tr.greeting}, ${order.customer_name}!`,
        '', test ? tr.test : tr.intro, '',
        ...rows.map(([label, value]) => `${label}: ${value}`),
        ...(addendum ? ['', addendum] : []),
        '', tr.closing, '', tr.signature, 'GlamGarb Rentals s.r.o.',
    ].join('\n');
    const htmlRows = rows.map(([label, value]) =>
        `<tr><th align="left" style="padding:6px 12px 6px 0">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    ).join('');
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#29302f;line-height:1.6">`
        + `<p>${escapeHtml(tr.greeting)}, ${escapeHtml(order.customer_name)}!</p>`
        + `<p>${escapeHtml(test ? tr.test : tr.intro)}</p>`
        + `<table style="border-collapse:collapse">${htmlRows}</table>`
        + (addendum ? `<p>${escapeHtml(addendum)}</p>` : '')
        + `<p>${escapeHtml(tr.closing)}</p><p>${escapeHtml(tr.signature)}<br>GlamGarb Rentals s.r.o.</p></div>`;
    return {
        subject: `${test ? '[TEST] ' : ''}${tr.subject} ${order.order_number}`,
        text,
        html,
    };
}

export async function sendConfirmationEmail(order, { createTransport = nodemailer.createTransport } = {}) {
    if (!smtpConfigurationReady()) {
        throw emailError('SMTP_NOT_CONFIGURED');
    }
    if (!validRecipient(order.customer_email)) throw emailError('EMAIL_RECIPIENT_INVALID');
    if (typeof order.payment_test_mode !== 'boolean') throw emailError('EMAIL_PAYMENT_MODE_INVALID');
    if (order.payment_test_mode && (!ownerTestEmailEnabled() || order.customer_email.toLowerCase() !== SHOP_EMAIL)) {
        throw emailError('TEST_EMAIL_NOT_ALLOWED');
    }
    if (!/^MAM-\d{4}-[A-Z0-9]+$/.test(order.order_number)) throw emailError('EMAIL_ORDER_NUMBER_INVALID');
    const { subject, text, html } = buildConfirmationEmail(order);
    const transport = createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: { user: smtpUser(), pass: process.env.SMTP_APP_PASSWORD },
        disableFileAccess: true,
        disableUrlAccess: true,
        maxRecipients: 1,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
    try {
        const result = await transport.sendMail({
            from: { name: 'Maminko, mluv se mnou', address: smtpUser() },
            to: { address: order.customer_email },
            replyTo: { address: smtpUser() },
            subject,
            text,
            html,
            messageId: `<${order.order_number.toLowerCase()}.${order.payment_test_mode ? 'test-' : ''}confirmation@maminko-mluv-se-mnou.cz>`,
        });
        if (!result.accepted?.some((address) => String(address).toLowerCase() === order.customer_email.toLowerCase())) {
            throw emailError('SMTP_RECIPIENT_REJECTED');
        }
        return result;
    } finally {
        transport.close();
    }
}
