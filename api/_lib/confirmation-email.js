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
        subject: 'Platba přijata · Objednávka',
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
        digitalConsent: 'Při objednávce jste výslovně souhlasili se zpřístupněním digitálního obsahu ihned po zaplacení, před uplynutím 14denní lhůty pro odstoupení od smlouvy. Potvrdili jste, že zahájením plnění zaniká vaše právo odstoupit od smlouvy v rozsahu digitálního obsahu.',
        digital: 'Pozvánku do Telegram kanálu vám pošleme samostatně na tuto e-mailovou adresu.',
        digitalTest: 'Digitální přístup ověřujeme samostatnou pozvánkou do testovacího Telegram kanálu.',
        closing: 'V případě dotazů nám odpovězte na tento e-mail.',
        signature: 'Tým Maminko, mluv se mnou',
        test: 'TEST — pouze zkouška integrace. Nejde o skutečnou platbu, objednávku ani potvrzení smlouvy. Zboží neodesílejte.',
    },
    uk: {
        subject: 'Оплату отримано · Замовлення',
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
        digitalConsent: 'Під час оформлення замовлення ви прямо погодилися на надання цифрового контенту одразу після оплати, до закінчення 14-денного строку для відмови від договору. Ви підтвердили, що з початком надання втрачаєте право на відмову від договору в частині цифрового контенту.',
        digital: 'Запрошення до Telegram-каналу надішлемо окремим листом на цю електронну адресу.',
        digitalTest: 'Цифровий доступ перевіряємо окремим запрошенням до тестового Telegram-каналу.',
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
        return [order.pickup_point_name, order.pickup_point_address || order.pickup_point_zip].filter(Boolean).join(', ');
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
        [tr.shippingPrice, price(order.shipping_price)],
        [tr.total, price(order.total_amount)],
    ];
    const digitalParagraphs = [];
    if (order.product_code === 'full') {
        if (order.digital_consent_at) digitalParagraphs.push(tr.digitalConsent);
        digitalParagraphs.push(test ? tr.digitalTest : tr.digital);
    }
    const heading = order.lang === 'uk' ? 'Дякуємо за замовлення!' : 'Děkujeme za objednávku!';
    const receipt = order.lang === 'uk'
        ? `Ми отримали вашу оплату — ${price(order.total_amount)}. Підготуємо ваш посібник до відправлення. Фактура у вкладенні.`
        : `Platbu ${price(order.total_amount)} jsme přijali. Vaši publikaci připravíme k odeslání. Fakturu najdete v příloze.`;
    const text = [
        heading,
        '', test ? tr.test : receipt, '',
        ...rows.map(([label, value]) => `${label}: ${value}`),
        '', shipping, recipientAddress(order),
        ...digitalParagraphs.flatMap((paragraph) => ['', paragraph]),
        '', tr.closing, '', tr.signature, 'GlamGarb Rentals s.r.o.',
    ].join('\n');
    const htmlRows = rows.map(([label, value]) =>
        `<tr><th align="left" style="padding:6px 12px 6px 0">${escapeHtml(label)}</th><td style="font-weight:${label === tr.total ? 700 : 400}">${escapeHtml(value)}</td></tr>`
    ).join('');
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#29302f;line-height:1.6">`
        + `<p style="color:#705899;font-weight:bold">♥ Maminko, mluv se mnou</p><h2>${heading}</h2>`
        + `<p>${escapeHtml(test ? tr.test : receipt)}</p>`
        + `<table style="border-collapse:collapse">${htmlRows}</table>`
        + `<p><strong>${escapeHtml(shipping)}</strong><br>${escapeHtml(recipientAddress(order))}</p>`
        + digitalParagraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')
        + `<p>${escapeHtml(tr.closing)}</p><p>${escapeHtml(tr.signature)}<br>GlamGarb Rentals s.r.o.</p></div>`;
    return {
        subject: `${test ? '[TEST] ' : ''}${tr.subject} ${order.order_number}`,
        text,
        html,
    };
}

export async function sendConfirmationEmail(order, { createTransport = nodemailer.createTransport, resendId } = {}) {
    if (!smtpConfigurationReady()) {
        throw emailError('SMTP_NOT_CONFIGURED');
    }
    if (!validRecipient(order.customer_email)) throw emailError('EMAIL_RECIPIENT_INVALID');
    if (typeof order.payment_test_mode !== 'boolean') throw emailError('EMAIL_PAYMENT_MODE_INVALID');
    if (order.payment_test_mode && (!ownerTestEmailEnabled() || order.customer_email.toLowerCase() !== SHOP_EMAIL)) {
        throw emailError('TEST_EMAIL_NOT_ALLOWED');
    }
    if (!/^MAM-\d{4}-(?:[A-Z0-9]+|(?:0[1-9]|1[0-2])-\d{4,})$/.test(order.order_number)) throw emailError('EMAIL_ORDER_NUMBER_INVALID');
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
        const { invoicePdf } = await import('./invoice-pdf.js');
        const invoice = await invoicePdf(order);
        const result = await transport.sendMail({
            attachments: [{ filename: `${order.payment_test_mode ? 'TEST-' : ''}Faktura-${order.order_number}.pdf`, content: invoice, contentType: 'application/pdf' }],
            from: { name: 'Maminko, mluv se mnou', address: smtpUser() },
            to: { address: order.customer_email },
            replyTo: { address: smtpUser() },
            subject,
            text,
            html,
            messageId: `<${order.order_number.toLowerCase()}.${order.payment_test_mode ? 'test-' : ''}confirmation${resendId ? "." + resendId : ""}@maminko-mluv-se-mnou.cz>`,
        });
        if (!result.accepted?.some((address) => String(address).toLowerCase() === order.customer_email.toLowerCase())) {
            throw emailError('SMTP_RECIPIENT_REJECTED');
        }
        return result;
    } finally {
        transport.close();
    }
}
