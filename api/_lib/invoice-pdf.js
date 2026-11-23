import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const regular = require.resolve('@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Regular.woff');
const bold = require.resolve('@ibm/plex-sans/fonts/complete/woff/IBMPlexSans-Bold.woff');
const currency = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' });
const date = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: '2-digit', month: '2-digit', year: 'numeric' });

export async function invoicePdf(order) {
    const issued = new Date(order.paid_at);
    if (!order.paid_at || !Number.isFinite(issued.getTime())) throw new Error('INVOICE_PAYMENT_DATE_MISSING');
    const title = (order.payment_test_mode ? 'TEST · Vzor faktury ' : 'Faktura ') + order.order_number;
    const doc = new PDFDocument({ size: 'A4', margin: 0,
        info: { Title: title, Author: 'GlamGarb Rentals s.r.o.', CreationDate: issued } });
    const chunks = [];
    const result = new Promise((resolve, reject) => {
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
    doc.registerFont('regular', regular).registerFont('bold', bold);
    // Coordinates and baseline offsets in PDF points from the AniraKids A4 template.
    const left = 26.9291, right = 568.3465, column = 332.6303, leftEnd = 291.3803;
    const grey = '#5e5e5e', black = '#000000', ruleGrey = '#595959';
    function text(value, x, y, width, size = 9.75, color = black, weight = 'regular', align = 'left') {
        doc.font(weight).fontSize(size).fillColor(color)
            .text(String(value), x, y - size * 0.245, { width, align, lineGap: 0 });
        return doc.y - size * 0.055;
    }
    function rule(x, y, width, height = 0.75, color = '#cccccc') {
        doc.rect(x, y, width, height).fill(color);
    }
    function pair(label, value, x, end, y) {
        text(label, x, y, 115, 9.75, grey);
        text(value, x + 117, y, end - x - 117, 9.75, black, 'regular', 'right');
    }

    rule(column, 29, right - column, 2.25, ruleGrey);
    const heading = order.payment_test_mode ? 'TEST · Faktura' : 'Faktura';
    doc.font('bold').fontSize(18);
    const headingSize = Math.min(18, 18 * (right - column - 1) / doc.widthOfString(heading + ' ' + order.order_number));
    doc.fontSize(headingSize);
    const headingWidth = doc.widthOfString(heading);
    text(heading, column, 40.55, headingWidth + 1, headingSize, black, 'bold');
    text(' ' + order.order_number, column + headingWidth, 40.55, right - column - headingWidth, headingSize, grey, 'bold');
    rule(left, 82.1, 13.5, 0.75, grey);
    rule(column, 82.1, 13.5, 0.75, grey);
    text('DODAVATEL', left, 92.7875, leftEnd - left, 9.75, grey);
    text('ODBĚRATEL', column, 92.7875, right - column, 9.75, grey);
    const sellerEnd = text('GlamGarb Rentals s.r.o.', left, 118.2875, leftEnd - left, 11.25, black, 'bold');
    const buyerEnd = text(order.customer_name, column, 118.2875, right - column, 11.25, black, 'bold');
    const streetEnd = text('Bílkova 855/19', left, Math.max(134.7875, sellerEnd + 2), leftEnd - left, 9.75, grey);
    const addressEnd = text('110 00 Praha - Staré Město', left, streetEnd + 4.875, leftEnd - left, 9.75, grey);
    const emailEnd = text(order.customer_email, column, Math.max(134.7875, buyerEnd + 2), right - column, 9.75, grey);
    const identityY = Math.max(179.0375, addressEnd + 4.875 + 14, emailEnd + 14);
    pair('IČO', '19970561', left, leftEnd, identityY);
    text('Neplátce DPH', left, identityY + 14.625, leftEnd - left);
    const metaY = identityY + 44.25;
    pair('Číslo objednávky', order.order_number, left, leftEnd, metaY);
    pair('Způsob platby', 'Stripe', left, leftEnd, metaY + 29.25);
    pair('Datum vystavení', date.format(issued), column, right, metaY);
    pair('Datum splatnosti', 'Uhrazeno', column, right, metaY + 14.625);

    let y = Math.max(299.975, metaY + 76.6875);
    const priceX = 460.063;
    text('CENA', priceX, y, right - priceX, 9, grey, 'regular', 'right');
    rule(left, y + 14.25, right - left);
    y += 20.4375;
    for (const [label, amount] of [[order.product_name, order.product_price], ['Doprava – Balíkovna', order.shipping_price]]) {
        doc.font('regular').fontSize(9.75);
        const height = Math.max(11.7, doc.heightOfString(label, { width: 421, lineGap: 0 }) - 2.925);
        text(label, left, y, 421);
        text(currency.format(amount), priceX, y, right - priceX, 9.75, black, 'regular', 'right');
        y += height + 9.675;
        rule(left, y - 6.1875, right - left);
    }
    const summaryY = y + 23.0625, summaryX = 297.6378;
    rule(summaryX, summaryY, right - summaryX, 1.5, ruleGrey);
    text(currency.format(order.total_amount), summaryX, summaryY + 6.75, right - summaryX, 15, ruleGrey, 'bold', 'right');
    text(order.payment_test_mode ? 'TEST – NEPLATNÝ DOKLAD' : 'UHRAZENO', left, summaryY + 6.75, leftEnd - left, 15, grey, 'bold');
    pair('Uhrazeno k vystavení', currency.format(order.total_amount), summaryX, right, summaryY + 32);
    pair('Zbývá k vystavení', currency.format(0), summaryX, right, summaryY + 47);
    text('Maminko, mluv se mnou · info@maminko-mluv-se-mnou.cz', left, summaryY + 120, right - left, 8.25, grey);
    text('Společnost je zapsána v obchodním rejstříku vedeném Městským soudem v Praze oddíl C, vložka 394851.',
        left, 814.0726, right - left, 8.25, grey);
    doc.end();
    return result;
}
