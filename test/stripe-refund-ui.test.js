import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const adminScript = await readFile(new URL('../public/admin-pages.js', import.meta.url), 'utf8');
const successScript = await readFile(new URL('../public/success.js', import.meta.url), 'utf8');

class Element {
    constructor() {
        this.children = [];
        this.dataset = {};
        this.hidden = false;
        this.listeners = new Map();
        this.classes = new Set();
        this.classList = {
            add: (...names) => names.forEach((name) => this.classes.add(name)),
            remove: (...names) => names.forEach((name) => this.classes.delete(name)),
            toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
        };
    }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return (this.text || '') + this.children.map((child) => child.textContent).join(' '); }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    scrollIntoView() {}
}

function adminUi() {
    const ids = [
        'stat-orders', 'stat-paid', 'stat-ready', 'stat-revenue', 'orders-body', 'orders-empty',
        'order-detail', 'detail-ref', 'detail-name', 'detail-contact', 'detail-product', 'detail-price',
        'detail-payment', 'detail-gateway', 'detail-refund', 'detail-refund-amounts', 'detail-refund-attempts',
        'detail-refund-hold', 'detail-shipping', 'detail-destination', 'detail-email', 'detail-email-attempts',
        'detail-payment-badge', 'ship-ready', 'ship-sent', 'ship-delivered', 'shipping-body', 'shipping-empty',
    ];
    const nodes = Object.fromEntries(ids.map((id) => [`#${id}`, new Element()]));
    const context = vm.createContext({
        document: {
            body: { dataset: { adminPage: 'orders' } },
            querySelector: (selector) => nodes[selector] || null,
            querySelectorAll: () => [],
            createElement: () => new Element(),
        },
        // Keep unrelated authentication initialization inert; never access a network.
        fetch: () => new Promise(() => {}),
        window: { location: { replace() { assert.fail('Unexpected navigation'); } } },
    });
    vm.runInContext(`${adminScript}\nglobalThis.ui = { state, price, paymentLabel, refundLabel, filteredOrders, renderOrdersPage, renderOrderDetail, renderShippingPage };`, context);
    return { nodes, api: context.ui };
}

function customerUi(lang = 'cs') {
    const selectors = [
        '.paid-pill', '.success-icon', '.simulation-box strong', '.simulation-box span', '.success-lead',
        '#order-reference', '#order-product', '#order-price', '#order-shipping', '#order-destination', '#order-total',
        '#refund-summary', '#refund-summary-title', '#refund-refunded', '#refund-pending', '#refund-hold',
    ];
    const nodes = Object.fromEntries(selectors.map((selector) => [selector, new Element()]));
    const i18nKeys = [
        'previewBadge', 'title', 'lead', 'simulationTitle', 'simulationCopy', 'orderNumber', 'product', 'delivery',
        'total', 'next', 'nextTitle', 'nextCopy', 'backCheckout', 'home', 'refundSummary', 'refundedAmount',
        'refundPendingAmount', 'refundHold',
    ];
    const shared = {
        lead: '.success-lead', simulationTitle: '.simulation-box strong', simulationCopy: '.simulation-box span',
        refundSummary: '#refund-summary-title', refundHold: '#refund-hold',
    };
    const i18n = i18nKeys.map((key) => {
        const element = shared[key] ? nodes[shared[key]] : new Element();
        element.dataset.i18n = key;
        nodes[`[data-i18n="${key}"]`] = element;
        return element;
    });
    const languages = ['cs', 'uk'].map((value) => {
        const element = new Element();
        element.dataset.lang = value;
        return element;
    });
    const storage = new Map([['maminko-lang', lang]]);
    const context = vm.createContext({
        document: {
            documentElement: { lang },
            querySelector: (selector) => nodes[selector] || null,
            querySelectorAll: (selector) => selector === '[data-i18n]' ? i18n : selector === '[data-lang]' ? languages : [],
        },
        location: { search: '' }, URLSearchParams,
        localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        fetch: () => assert.fail('Offline rendering must not fetch an order'),
    });
    vm.runInContext(`${successScript}\nglobalThis.ui = { price, refundState, setOrder(value) { order = value; errorState = null; render(); } };`, context);
    return { nodes, api: context.ui, languages };
}

function adminOrder({ payment = {}, ...overrides } = {}) {
    return {
        orderNumber: 'MAM-2026-SYNTHETIC', createdAt: '2026-11-13T12:00:00.000Z',
        totalAmount: 100.01, currency: 'CZK', productName: 'Synthetic product', productPrice: 80.01,
        customer: { name: 'Offline test', email: 'offline@example.invalid' },
        shipping: { status: 'ready', price: 20, method: 'address' },
        payment: { status: 'paid', originalStatus: 'paid', ...payment }, ...overrides,
    };
}

const statusMap = {
    full: 'refunded', partial: 'partially_refunded', pending: 'refund_pending', requires_action: 'refund_pending',
    failed: 'refund_failed', canceled: 'refund_canceled', review: 'refund_review',
};

function publicOrder(status, testMode = false) {
    return {
        order_number: 'MAM-2026-SYNTHETIC', product_name: 'Synthetic product', product_price: 80.01,
        total_amount: 100.01, shipping_method: 'address', payment_status: statusMap[status],
        payment_test_mode: testMode,
        refund: { status, refundedAmount: 30.02, pendingAmount: 10.01, failedCount: 1, canceledCount: 2, hold: true },
    };
}

test('Admin distinguishes every refund payment status from payment failure or unpaid status', () => {
    const { api } = adminUi();
    const labels = {
        refunded: 'VRÁCENO', partially_refunded: 'ČÁSTEČNĚ VRÁCENO', refund_pending: 'VRÁCENÍ SE ZPRACOVÁVÁ',
        refund_failed: 'VRÁCENÍ SE NEZDAŘILO', refund_canceled: 'VRÁCENÍ ZRUŠENO', refund_review: 'VRÁCENÍ K PROVĚŘENÍ',
    };
    for (const [status, label] of Object.entries(labels)) assert.equal(api.paymentLabel(status), label);
    assert.equal(api.refundLabel('requires_action'), 'VRÁCENÍ VYŽADUJE KONTROLU');
    assert.equal(api.refundLabel('none'), 'BEZ VRÁCENÍ');
    assert.equal(api.paymentLabel('paid'), 'ZAPLACENO');
});

test('Both customer and admin money formatters preserve haléř precision', () => {
    for (const api of [adminUi().api, customerUi().api]) {
        assert.match(api.price(100.01), /100,01\sKč/);
        assert.match(api.price(0.01), /0,01\sKč/);
        assert.doesNotMatch(api.price(100), /100,00/);
    }
});

test('KPIs count loaded live paid orders and net only succeeded refund amounts in integer minor units', () => {
    const { api, nodes } = adminUi();
    api.state.orders = [
        adminOrder(),
        adminOrder({ payment: { status: 'partially_refunded', refund: { status: 'partial', refundedAmount: 30.02, pendingAmount: 0, hold: true } } }),
        adminOrder({ payment: { status: 'refund_pending', refund: { status: 'pending', refundedAmount: 10.01, pendingAmount: 50, hold: true } } }),
        adminOrder({ payment: { status: 'refund_failed', refund: { status: 'failed', refundedAmount: 0, pendingAmount: 0, hold: true } } }),
        adminOrder({ payment: { status: 'refunded', refund: { status: 'full', refundedAmount: 100.01, pendingAmount: 0, hold: true } } }),
        adminOrder({ totalAmount: 10000, payment: { testMode: true } }),
        adminOrder({ totalAmount: 10000, payment: { status: 'refunded', testMode: true, refund: { status: 'full', refundedAmount: 200, hold: true } } }),
        adminOrder({ payment: { status: 'pending', originalStatus: 'pending' } }),
        adminOrder({ payment: { status: 'failed', originalStatus: 'failed' } }),
        adminOrder({ totalAmount: 0.01, payment: { originalStatus: undefined } }),
    ];
    api.renderOrdersPage();
    assert.equal(nodes['#stat-orders'].textContent, '10');
    assert.equal(nodes['#stat-paid'].textContent, '6');
    assert.match(nodes['#stat-revenue'].textContent, /360,02\sKč/);
});

test('Paid filter retains partial/full refunds and ready filter excludes test and refund-held orders', () => {
    const { api } = adminUi();
    const live = adminOrder({ orderNumber: 'live' });
    const partial = adminOrder({ orderNumber: 'partial', payment: { status: 'partially_refunded', refund: { status: 'partial', hold: true } } });
    const full = adminOrder({ orderNumber: 'full', payment: { status: 'refunded', refund: { status: 'full', hold: true } } });
    const testOrder = adminOrder({ orderNumber: 'test', payment: { testMode: true } });
    const unpaid = adminOrder({ orderNumber: 'unpaid', payment: { status: 'pending', originalStatus: 'pending' }, shipping: { status: 'not_ready' } });
    api.state.orders = [live, partial, full, testOrder, unpaid];
    api.state.filter = 'paid';
    assert.deepEqual(Array.from(api.filteredOrders(), (order) => order.orderNumber), ['live', 'partial', 'full', 'test']);
    api.state.filter = 'ready';
    assert.deepEqual(Array.from(api.filteredOrders(), (order) => order.orderNumber), ['live']);
});

test('Admin refund detail shows confirmed/pending amounts, failure counts and explicit TEST hold warning', () => {
    const { api, nodes } = adminUi();
    api.renderOrderDetail(adminOrder({ payment: {
        status: 'refund_pending', testMode: true,
        refund: { status: 'pending', refundedAmount: 30.02, pendingAmount: 10.01, failedCount: 2, canceledCount: 3, hold: true },
    } }));
    assert.equal(nodes['#detail-refund'].textContent, 'TEST · VRÁCENÍ SE ZPRACOVÁVÁ');
    assert.match(nodes['#detail-refund-amounts'].textContent, /Vráceno: 30,02\sKč · Čeká na vrácení: 10,01\sKč/);
    assert.equal(nodes['#detail-refund-attempts'].textContent, 'Neúspěšné vratky: 2 · Zrušené vratky: 3');
    assert.equal(nodes['#detail-refund-hold'].hidden, false);
    assert.match(nodes['#detail-refund-hold'].textContent, /^TEST · .*Neexpedujte/);
    api.renderOrderDetail(adminOrder());
    assert.equal(nodes['#detail-refund'].textContent, 'BEZ VRÁCENÍ');
    assert.equal(nodes['#detail-refund-hold'].hidden, true);
});

test('Shipping rows carry TEST payment markers and held refunds never show a ready-to-ship badge', () => {
    const { api, nodes } = adminUi();
    api.state.orders = [
        adminOrder({ payment: { testMode: true, status: 'refunded', refund: { status: 'full', refundedAmount: 100.01, hold: true } } }),
        adminOrder({ shipping: { status: 'sent' }, payment: { status: 'refund_review', refund: { status: 'review', hold: true } } }),
    ];
    api.renderShippingPage();
    const rows = nodes['#shipping-body'].children;
    assert.match(rows[0].children[4].textContent, /^TEST · VRÁCENO/);
    assert.match(rows[0].children[3].textContent, /POZASTAVENO · VRATKA/);
    assert.doesNotMatch(rows[0].children[3].textContent, /READY/);
    assert.match(rows[1].children[3].textContent, /ODESLÁNO.*již odeslanou zásilku prověřit/);
    assert.equal(nodes['#ship-ready'].textContent, '0');
});

test('Every refund state has Czech and Ukrainian customer copy without repayment or shipping promises', () => {
    for (const lang of ['cs', 'uk']) {
        for (const status of Object.keys(statusMap)) {
            const { api, nodes } = customerUi(lang);
            api.setOrder(publicOrder(status));
            assert.equal(nodes['#refund-summary'].hidden, false);
            assert.equal(nodes['[data-i18n="backCheckout"]'].hidden, true);
            assert.equal(nodes['#refund-hold'].hidden, false);
            if (statusMap[status] === 'refund_review') {
                assert.equal(nodes['#refund-refunded'].textContent, lang === 'cs' ? 'Ověřuje se' : 'Уточнюється');
                assert.equal(nodes['#refund-pending'].textContent, lang === 'cs' ? 'Ověřuje se' : 'Уточнюється');
            } else {
                assert.match(nodes['#refund-refunded'].textContent, /30,02\sKč/);
                assert.match(nodes['#refund-pending'].textContent, /10,01\sKč/);
            }
            const copy = ['.paid-pill', '.success-lead', '.simulation-box strong', '.simulation-box span', '[data-i18n="nextTitle"]', '[data-i18n="nextCopy"]']
                .map((selector) => nodes[selector].textContent).join(' ');
            assert.doesNotMatch(copy, /ČEKÁ NA PLATBU|ОЧІКУЄ ОПЛАТИ|Můžete vytvořit novou objednávku|Можете створити нове замовлення|připravíme ji k odeslání|підготуємо його до відправлення/i);
            assert.match(copy, lang === 'cs' ? /neplaťte/ : /Не оплачуйте/);
        }
    }
});

test('TEST refunds in both languages remain explicitly synthetic and never suggest shipment', () => {
    for (const lang of ['cs', 'uk']) {
        for (const status of Object.keys(statusMap)) {
            const { api, nodes } = customerUi(lang);
            api.setOrder(publicOrder(status, true));
            assert.match(nodes['.paid-pill'].textContent, /^TEST · /);
            assert.match(nodes['.simulation-box strong'].textContent, /^TEST · /);
            assert.match(nodes['#refund-summary-title'].textContent, /^TEST · /);
            assert.match(nodes['.simulation-box span'].textContent, lang === 'cs' ? /Nejde o skutečnou platbu/ : /Це не справжній платіж/);
            assert.equal(nodes['[data-i18n="nextTitle"]'].textContent, lang === 'cs' ? 'Testovací objednávka' : 'Тестове замовлення');
            assert.equal(nodes['[data-i18n="backCheckout"]'].hidden, true);
        }
    }
});

test('Legacy paid/test/pending/failed success wording remains unchanged when there is no refund', () => {
    const { api, nodes } = customerUi('cs');
    api.setOrder({ ...publicOrder('full'), refund: undefined, payment_status: 'paid', payment_test_mode: false });
    assert.equal(nodes['.simulation-box strong'].textContent, 'Platba potvrzena');
    assert.equal(nodes['#refund-summary'].hidden, true);
    assert.equal(nodes['[data-i18n="backCheckout"]'].hidden, false);
    api.setOrder({ ...publicOrder('full'), refund: { status: 'none' }, payment_status: 'paid', payment_test_mode: true });
    assert.equal(nodes['.simulation-box strong'].textContent, 'Testovací platba potvrzena');
    assert.equal(nodes['.simulation-box span'].textContent, 'Nejde o skutečnou platbu. Tuto objednávku neexpedujte.');
    api.setOrder({ payment_status: 'pending' });
    assert.equal(nodes['.paid-pill'].textContent, 'ČEKÁ NA PLATBU');
    api.setOrder({ payment_status: 'failed' });
    assert.equal(nodes['.simulation-box strong'].textContent, 'Platba nebyla dokončena');
});

test('Unknown refund state or an explicit hold fails safe to review, and language switching keeps refund state', () => {
    const { api, nodes, languages } = customerUi('cs');
    api.setOrder({ ...publicOrder('full'), payment_status: 'paid', refund: { status: 'unknown-future-value', hold: true } });
    assert.equal(nodes['.paid-pill'].textContent, 'VRÁCENÍ K PROVĚŘENÍ');
    languages.find((button) => button.dataset.lang === 'uk').listeners.get('click')();
    assert.equal(nodes['.paid-pill'].textContent, 'ПОВЕРНЕННЯ НА ПЕРЕВІРЦІ');
    assert.equal(nodes['[data-i18n="backCheckout"]'].hidden, true);
    api.setOrder({ payment_status: 'paid', refund: { status: 'none', hold: true } });
    assert.equal(nodes['.paid-pill'].textContent, 'ПОВЕРНЕННЯ НА ПЕРЕВІРЦІ');
});

test('Refund UI is display-only and KPI labels explicitly describe loaded data, not accounting totals', async () => {
    const html = await readFile(new URL('../public/admin/orders.html', import.meta.url), 'utf8');
    assert.match(html, /Přijato po vratkách/);
    assert.match(html, /nikoli účetní výkaz/);
    assert.match(html, /Čekající vratky se od přijaté částky neodečítají/);
    assert.match(html, /Zaplacené \(vč\. vratek\)/);
    assert.doesNotMatch(`${adminScript}\n${successScript}`, /fetch\([^\n]*(?:refund|vrat)/i);
    assert.doesNotMatch(html, /<(?:button|form)[^>]*(?:refund|vrat)/i);
});

test('A live paid refund under review makes net received unknown without changing counts or filters', () => {
    for (const payment of [
        { status: 'refund_review', refund: { status: 'review', refundedAmount: 0, pendingAmount: 0, hold: true } },
        { status: 'refund_review', refund: { status: 'none', refundedAmount: 0, pendingAmount: 0, hold: true } },
        { status: 'paid', refund: { status: 'review', refundedAmount: 0, pendingAmount: 0, hold: true } },
    ]) {
        const { api, nodes } = adminUi();
        const uncertain = adminOrder({ payment });
        api.state.orders = [adminOrder(), uncertain];
        api.renderOrdersPage();
        assert.equal(nodes['#stat-revenue'].textContent, 'K prověření');
        assert.equal(nodes['#stat-paid'].textContent, '2');
        assert.equal(nodes['#stat-orders'].textContent, '2');
        api.state.filter = 'paid';
        assert.equal(api.filteredOrders().length, 2);
        api.renderOrderDetail(uncertain);
        assert.equal(nodes['#detail-refund-amounts'].textContent, 'Vráceno: Ověřuje se · Čeká na vrácení: Ověřuje se');
        assert.doesNotMatch(nodes['#detail-refund-amounts'].textContent, /0\sKč/);
    }
});

test('A test-mode refund under review does not make the loaded live net KPI unknown', () => {
    const { api, nodes } = adminUi();
    api.state.orders = [
        adminOrder(),
        adminOrder({ payment: { testMode: true, status: 'refund_review', refund: { status: 'review', refundedAmount: 0, pendingAmount: 0, hold: true } } }),
    ];
    api.renderOrdersPage();
    assert.match(nodes['#stat-revenue'].textContent, /100,01\sKč/);
    assert.equal(nodes['#stat-paid'].textContent, '1');
});

test('Customer review states display unknown rather than a definitive zero in both languages', () => {
    for (const lang of ['cs', 'uk']) {
        for (const [paymentStatus, refundStatus] of [['refund_review', 'review'], ['refund_review', 'none'], ['paid', 'review']]) {
            const { api, nodes } = customerUi(lang);
            api.setOrder({
                ...publicOrder('review'), payment_status: paymentStatus,
                refund: { status: refundStatus, refundedAmount: 0, pendingAmount: 0, hold: true },
            });
            const unknown = lang === 'cs' ? 'Ověřuje se' : 'Уточнюється';
            assert.equal(nodes['#refund-refunded'].textContent, unknown);
            assert.equal(nodes['#refund-pending'].textContent, unknown);
            assert.equal(nodes['#refund-summary'].hidden, false);
            assert.equal(nodes['[data-i18n="backCheckout"]'].hidden, true);
        }
    }
});
