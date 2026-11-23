import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const regular = require.resolve('@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff');
const bold = require.resolve('@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Bold.woff');
const currency = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' });
const date = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague' });

export async function invoicePdf(order) {
    const issued = new Date(order.paid_at);
    if (!order.paid_at || !Number.isFinite(issued.getTime())) throw new Error('INVOICE_PAYMENT_DATE_MISSING');
    const title = (order.payment_test_mode ? 'TEST · Vzor faktury ' : 'Faktura ') + order.order_number;
    const doc = new PDFDocument({ size: 'A4', margin: 27,
        info: { Title: title, Author: 'GlamGarb Rentals s.r.o.', CreationDate: issued } });
    const chunks = [];
    const result = new Promise((resolve, reject) => {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
    doc.registerFont('regular', regular).registerFont('bold', bold);
    const grey = '#5e5e5e';
    function text(value, x, y, width, size = 10, weight = 'regular', color = grey, align = 'left') {
        doc.font(weight).fontSize(size).fillColor(color).text(String(value), x, y, { width, align });
        return doc.y;
    }
    function rule(x, y, width, height = 0.75, color = '#cccccc') {
        doc.rect(x, y, width, height).fill(color);
    }
    rule(300, 29, 268, 2, grey);
    text(title, 300, 41, 268, 16, 'bold');
    text('DODAVATEL', 27, 95, 250);
    text('ODBĚRATEL', 332, 95, 236);
    text('GlamGarb Rentals s.r.o.', 27, 120, 255, 12, 'bold', '#222222');
    text('Bílkova 855/19\n110 00 Praha – Staré Město\nIČO 19970561\nNeplátce DPH', 27, 143, 250);
    const nameEnd = text(order.customer_name, 332, 120, 236, 12, 'bold', '#222222');
    const buyerEnd = text(order.customer_email, 332, nameEnd + 6, 236);
    const meta = Math.max(225, buyerEnd + 26);
    text('Způsob platby: Stripe', 27, meta, 250);
    text('Datum vystavení: ' + date.format(issued), 332, meta, 236);
    let y = meta + 57;
    text('POLOŽKA', 27, y, 350);
    text('CENA', 425, y, 143, 10, 'regular', grey, 'right');
    rule(27, y + 18, 541);
    y += 29;
    for (const [label, amount] of [[order.product_name, order.product_price], ['Doprava – Balíkovna', order.shipping_price]]) {
        const end = text(label, 27, y, 382);
        text(currency.format(amount), 425, y, 143, 10, 'regular', grey, 'right');
        rule(27, end + 5, 541);
        y = end + 15;
    }
    y += 16;
    rule(300, y, 268, 1.5, grey);
    text(order.payment_test_mode ? 'TEST – NEPLATNÝ DOKLAD' : 'UHRAZENO', 27, y + 10, 255, 15, 'bold');
    text(currency.format(order.total_amount), 300, y + 10, 268, 16, 'bold', grey, 'right');
    text('Zbývá k úhradě', 300, y + 44, 140);
    text(currency.format(0), 440, y + 44, 128, 10, 'regular', grey, 'right');
    text('Maminko, mluv se mnou · info@maminko-mluv-se-mnou.cz', 27, y + 90, 541);
    text('Městský soud v Praze, oddíl C, vložka 394851.', 27, 790, 541, 9);
    doc.end();
    return result;
}
