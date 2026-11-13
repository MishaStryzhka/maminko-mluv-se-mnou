import nodemailer from 'nodemailer';
import { SHOP_EMAIL, smtpConfigurationReady, smtpUser, validRecipient } from './confirmation-email.js';

function resetEmailError(code) {
    return Object.assign(new Error(code), { code });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
}

// Never derive a credential-bearing link from Host, forwarded headers or input.
export function passwordResetOrigin() {
    const configured = String(process.env.PUBLIC_SITE_URL || '').trim();
    if (!/^https:\/\/[^/?#\\\s]+\/?$/i.test(configured)) {
        throw resetEmailError('RESET_UNAVAILABLE');
    }
    let url;
    try {
        url = new URL(configured);
    } catch {
        throw resetEmailError('RESET_UNAVAILABLE');
    }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password
        || url.port || url.pathname !== '/' || url.search || url.hash) {
        throw resetEmailError('RESET_UNAVAILABLE');
    }
    return url.origin;
}

function requireConfiguration(email) {
    if (process.env.ADMIN_PASSWORD_RESET_ENABLED !== 'true' || !smtpConfigurationReady()) {
        throw resetEmailError('RESET_UNAVAILABLE');
    }
    if (!validRecipient(email)) throw resetEmailError('EMAIL_RECIPIENT_INVALID');
    return passwordResetOrigin();
}

async function deliver(email, content, createTransport) {
    let transport;
    try {
        transport = createTransport({
            host: 'smtp.seznam.cz',
            port: 465,
            secure: true,
            auth: { user: smtpUser(), pass: process.env.SMTP_APP_PASSWORD },
            disableFileAccess: true,
            disableUrlAccess: true,
            maxRecipients: 1,
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
        });
        const result = await transport.sendMail({
            from: { name: 'Maminko, mluv se mnou', address: SHOP_EMAIL },
            to: { address: email },
            replyTo: { address: SHOP_EMAIL },
            ...content,
        });
        if (!result.accepted?.some((address) => String(address).toLowerCase() === email.toLowerCase())) {
            throw resetEmailError('RESET_EMAIL_FAILED');
        }
        // SMTP responses may contain recipient information; callers only need success.
        return { sent: true };
    } catch {
        // Never propagate SMTP messages, recipient details, message content or tokens.
        throw resetEmailError('RESET_EMAIL_FAILED');
    } finally {
        try { transport?.close(); } catch { /* Do not leak transport errors. */ }
    }
}

// The caller must resolve email from an active admin_users record, not request input.
export async function sendAdminPasswordResetEmail(
    { email, token },
    { createTransport = nodemailer.createTransport } = {},
) {
    const origin = requireConfiguration(email);
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw resetEmailError('RESET_INVALID');
    }
    const resetUrl = `${origin}/admin/reset-password#token=${token}`;
    const text = [
        'Dobrý den,',
        '',
        'obdrželi jsme žádost o obnovení hesla do administrace Maminko, mluv se mnou.',
        'Nové heslo nastavíte pomocí tohoto jednorázového odkazu:',
        resetUrl,
        '',
        'Odkaz platí 15 minut. Po změně hesla budou všechna dřívější přihlášení ukončena.',
        'Pokud jste o obnovení hesla nežádali, tento e-mail ignorujte. Vaše heslo se nezmění.',
        'Odkaz nikomu nepřeposílejte. Heslo nám neposílejte e-mailem.',
        '',
        'Tým Maminko, mluv se mnou',
        'GlamGarb Rentals s.r.o.',
    ].join('\n');
    const html = '<div style="font-family:Arial,sans-serif;max-width:620px;color:#29302f;line-height:1.6">'
        + '<p>Dobrý den,</p><p>obdrželi jsme žádost o obnovení hesla do administrace Maminko, mluv se mnou.</p>'
        + `<p><a href="${escapeHtml(resetUrl)}" rel="noreferrer">Nastavit nové heslo</a></p>`
        + '<p>Odkaz je jednorázový a platí <strong>15 minut</strong>. Po změně hesla budou všechna dřívější přihlášení ukončena.</p>'
        + '<p>Pokud jste o obnovení hesla nežádali, tento e-mail ignorujte. Vaše heslo se nezmění.</p>'
        + '<p>Odkaz nikomu nepřeposílejte. Heslo nám neposílejte e-mailem.</p>'
        + '<p>Tým Maminko, mluv se mnou<br>GlamGarb Rentals s.r.o.</p></div>';
    return deliver(email, { subject: 'Obnovení hesla · Maminko, mluv se mnou', text, html }, createTransport);
}

export async function sendAdminPasswordChangedEmail(
    { email },
    { createTransport = nodemailer.createTransport } = {},
) {
    requireConfiguration(email);
    const paragraphs = [
        'Dobrý den,',
        'vaše heslo do administrace Maminko, mluv se mnou bylo změněno.',
        'Všechna dřívější přihlášení byla ukončena. Znovu se přihlaste svým novým heslem.',
        'Pokud jste heslo nezměnili vy, ihned nás kontaktujte odpovědí na tento e-mail a zkontrolujte zabezpečení své e-mailové schránky. Heslo nám neposílejte.',
        'Tým Maminko, mluv se mnou',
        'GlamGarb Rentals s.r.o.',
    ];
    return deliver(email, {
        subject: 'Heslo do administrace bylo změněno · Maminko, mluv se mnou',
        text: paragraphs.join('\n\n'),
        html: '<div style="font-family:Arial,sans-serif;max-width:620px;color:#29302f;line-height:1.6">'
            + paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('') + '</div>',
    }, createTransport);
}
