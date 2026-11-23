import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const chromiumPath = '/usr/bin/chromium';
const runBrowserTests = process.env.RUN_BROWSER_TESTS === 'true' && existsSync(chromiumPath);
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

async function openCheckout(t, config) {
    const server = createServer((req, res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        const filename = join(publicDir, pathname === '/' ? 'checkout.html' : pathname);
        if (!filename.startsWith(`${publicDir}/`) || !existsSync(filename)) {
            res.writeHead(404).end('Not found');
            return;
        }
        const type = mimeTypes[filename.slice(filename.lastIndexOf('.'))] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        createReadStream(filename).pipe(res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    let browser;
    t.after(async () => {
        if (browser) await browser.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route('**/api/checkout-config', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ shipping: { pickup: 89, address: 119 }, stripeEnabled: config.enabled, sandbox: true }),
    }));
    await page.goto(`http://127.0.0.1:${server.address().port}/checkout.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#summary-shipping-price').textContent.includes('89'));
    return page;
}

test('Disabled Stripe cannot create a preview-paid order', { skip: !runBrowserTests }, async (t) => {
    const page = await openCheckout(t, { enabled: false });
    assert.equal(await page.locator('.submit-desktop').isDisabled(), true);
    assert.equal(await page.locator('#summary-total').textContent(), '839 Kč');
    assert.equal(await page.locator('#preview-success').count(), 0);
    assert.match(await page.locator('.payment-note').textContent(), /Stripe/);
});

test('Enabled checkout submits validated order to API and exposes failure', { skip: !runBrowserTests }, async (t) => {
    const page = await openCheckout(t, { enabled: true });
    assert.equal(await page.locator('.submit-desktop').isEnabled(), true);
    await page.locator('input[name="name"]').fill('Jan Novák');
    await page.locator('input[name="phone"]').fill('+420 777 111 222');
    await page.locator('input[name="email"]').fill('buyer@example.cz');
    await page.locator('[data-shipping-card="address"]').click();
    await page.locator('input[name="street"]').fill('Testovací 12');
    await page.locator('input[name="city"]').fill('Praha');
    await page.locator('input[name="zip"]').fill('11000');
    await page.locator('input[name="checked"]').check();
    await page.locator('input[name="termsAccepted"]').check();
    await page.locator('input[name="digitalConsent"]').check();
    assert.equal(await page.locator('#summary-total').textContent(), '869 Kč');
    await page.locator('.submit-desktop').click();
    await page.locator('#review-dialog[open]').waitFor();
    assert.equal(await page.locator('#review-total').textContent(), '869 Kč');

    let submitted;
    await page.route('**/api/checkout', (route) => {
        submitted = JSON.parse(route.request().postData());
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'PAYMENTS_NOT_READY' }) });
    });
    await page.locator('#start-payment').click();
    await page.locator('#review-error:visible').waitFor();
    assert.equal(submitted.product, 'full');
    assert.equal(submitted.shipping, 'address');
    assert.equal(submitted.termsAccepted, true);
    assert.equal(submitted.digitalConsent, true);
    assert.equal(submitted.address.zip, '110 00');
    assert.equal('totalAmount' in submitted, false);
    assert.equal(await page.locator('#start-payment').isEnabled(), true);
});
