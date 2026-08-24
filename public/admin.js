const TOKEN_KEY = 'maminko-admin-token';

const state = {
    orders: [],
    filter: 'all',
    selectedOrderNumber: null,
};

const authCard = document.querySelector('#admin-auth');
const authForm = document.querySelector('#admin-login-form');
const tokenInput = document.querySelector('#admin-token');
const authMessage = document.querySelector('#auth-message');
const adminContent = document.querySelector('#admin-content');
const connectionState = document.querySelector('#connection-state');
const ordersBody = document.querySelector('#orders-body');
const ordersEmpty = document.querySelector('#orders-empty');
const detail = document.querySelector('#order-detail');
const adminMessage = document.querySelector('#admin-message');

function price(value, currency = 'CZK') {
    return new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: currency || 'CZK',
        maximumFractionDigits: 0,
    }).format(Number(value) || 0);
}

function dateLabel(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('cs-CZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function paymentLabel(status) {
    const labels = {
        paid: 'ZAPLACENO',
        pending: 'ČEKÁ',
        failed: 'CHYBA',
        cancelled: 'ZRUŠENO',
        canceled: 'ZRUŠENO',
    };
    return labels[status] || String(status || '—').toUpperCase();
}

function shippingLabel(status) {
    const labels = {
        ready: 'READY',
        not_ready: 'ČEKÁ',
        sent: 'ODESLÁNO',
        delivered: 'DORUČENO',
        cancelled: 'ZRUŠENO',
    };
    return labels[status] || String(status || '—').toUpperCase();
}

function statusClass(type, status) {
    if (type === 'payment') {
        if (status === 'paid') return 'paid';
        if (['failed', 'cancelled', 'canceled'].includes(status)) return 'error';
        return 'pending';
    }
    if (status === 'ready') return 'ready';
    if (status === 'delivered') return 'paid';
    if (status === 'sent') return 'sent';
    if (status === 'cancelled') return 'error';
    return 'pending';
}

function shippingName(order) {
    if (order.shipping?.method === 'pickup') {
        return order.shipping.pickup?.type
            ? `Balíkovna / ${order.shipping.pickup.type}`
            : 'Balíkovna / výdejní místo';
    }
    return 'Balíkovna na adresu';
}

function destination(order) {
    if (order.shipping?.method === 'pickup') {
        const pickup = order.shipping.pickup || {};
        return [pickup.name, pickup.address, pickup.zip].filter(Boolean).join(' · ') || 'Výdejní místo';
    }
    const address = order.shipping?.address || {};
    return [address.street, [address.zip, address.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Adresa';
}

function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value || '—';
}

function showAuthMessage(message) {
    authMessage.textContent = message;
    authMessage.hidden = !message;
}

function setConnected(connected) {
    connectionState.textContent = connected ? 'PŘIPOJENO' : 'NEPŘIPOJENO';
    connectionState.classList.toggle('connected', connected);
}

function createStatusBadge(type, status) {
    const span = document.createElement('span');
    span.className = `status ${statusClass(type, status)}`;
    span.textContent = type === 'payment' ? paymentLabel(status) : shippingLabel(status);
    return span;
}

function filteredOrders() {
    if (state.filter === 'paid') return state.orders.filter((order) => order.payment?.status === 'paid');
    if (state.filter === 'ready') return state.orders.filter((order) => order.shipping?.status === 'ready');
    return state.orders;
}

function renderStats() {
    const paid = state.orders.filter((order) => order.payment?.status === 'paid');
    const ready = state.orders.filter((order) => order.shipping?.status === 'ready');
    const revenue = paid.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);

    setText('#stat-orders', String(state.orders.length));
    setText('#stat-paid', String(paid.length));
    setText('#stat-ready', String(ready.length));
    setText('#stat-revenue', price(revenue));
}

function cell(primary, secondary) {
    const td = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = primary || '—';
    td.appendChild(strong);
    if (secondary) {
        const small = document.createElement('small');
        small.textContent = secondary;
        td.appendChild(small);
    }
    return td;
}

function renderOrders() {
    const orders = filteredOrders();
    ordersBody.replaceChildren();
    ordersEmpty.hidden = orders.length > 0;

    orders.forEach((order) => {
        const tr = document.createElement('tr');
        tr.appendChild(cell(order.orderNumber, dateLabel(order.createdAt)));
        tr.appendChild(cell(order.customer?.name, order.customer?.email));
        tr.appendChild(cell(order.productName, shippingName(order)));

        const paymentTd = document.createElement('td');
        paymentTd.appendChild(createStatusBadge('payment', order.payment?.status));
        tr.appendChild(paymentTd);

        const shippingTd = document.createElement('td');
        shippingTd.appendChild(createStatusBadge('shipping', order.shipping?.status));
        tr.appendChild(shippingTd);

        tr.appendChild(cell(price(order.totalAmount, order.currency), `včetně dopravy ${price(order.shipping?.price, order.currency)}`));

        const actionTd = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'detail-button';
        button.dataset.orderNumber = order.orderNumber;
        button.textContent = 'Detail';
        actionTd.appendChild(button);
        tr.appendChild(actionTd);
        ordersBody.appendChild(tr);
    });
}

function renderDetail(order) {
    state.selectedOrderNumber = order.orderNumber;
    setText('#detail-ref', order.orderNumber);
    setText('#detail-name', order.customer?.name);
    setText('#detail-contact', `${order.customer?.email || '—'} · ${order.customer?.phone || '—'}`);
    setText('#detail-product', order.productName);
    setText('#detail-price', `${price(order.productPrice, order.currency)} + doprava ${price(order.shipping?.price, order.currency)} = ${price(order.totalAmount, order.currency)}`);
    setText('#detail-payment', paymentLabel(order.payment?.status));
    setText('#detail-gopay', order.payment?.gopayPaymentId ? `GoPay ID: ${order.payment.gopayPaymentId} · ${order.payment.gopayState || '—'}` : 'GoPay ID zatím není k dispozici');
    setText('#detail-shipping', shippingName(order));
    setText('#detail-destination', destination(order));
    setText('#detail-shipment', order.shipping?.status === 'ready' ? 'Připraveno k vytvoření zásilky' : shippingLabel(order.shipping?.status));

    const badge = document.querySelector('#detail-payment-badge');
    badge.className = `status ${statusClass('payment', order.payment?.status)}`;
    badge.textContent = paymentLabel(order.payment?.status);

    adminMessage.hidden = true;
    detail.classList.add('open');
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadOrders(token) {
    showAuthMessage('Načítám objednávky…');
    try {
        const response = await fetch('/api/admin-orders?limit=100', {
            headers: { 'X-Admin-Token': token },
            cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 401) throw new Error('Nesprávný administrační klíč.');
            if (data.error === 'ADMIN_NOT_CONFIGURED') throw new Error('Na Vercelu zatím chybí proměnná ADMIN_API_TOKEN.');
            if (data.error === 'DATABASE_NOT_CONFIGURED') throw new Error('Na Vercelu chybí připojení DATABASE_URL k Neon databázi.');
            throw new Error('Objednávky se nepodařilo načíst.');
        }

        state.orders = Array.isArray(data.orders) ? data.orders : [];
        sessionStorage.setItem(TOKEN_KEY, token);
        authCard.hidden = true;
        adminContent.hidden = false;
        showAuthMessage('');
        setConnected(true);
        renderStats();
        renderOrders();
    } catch (error) {
        sessionStorage.removeItem(TOKEN_KEY);
        adminContent.hidden = true;
        authCard.hidden = false;
        setConnected(false);
        showAuthMessage(error.message || 'Objednávky se nepodařilo načíst.');
    }
}

authForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const token = tokenInput.value.trim();
    if (token) loadOrders(token);
});

ordersBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-order-number]');
    if (!button) return;
    const order = state.orders.find((item) => item.orderNumber === button.dataset.orderNumber);
    if (order) renderDetail(order);
});

document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
        state.filter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('on', item === button));
        detail.classList.remove('open');
        renderOrders();
    });
});

document.querySelector('#create-shipment').addEventListener('click', () => {
    const order = state.orders.find((item) => item.orderNumber === state.selectedOrderNumber);
    adminMessage.hidden = false;
    if (!order || order.shipping?.status !== 'ready') {
        adminMessage.textContent = 'Zásilku lze vytvořit až po potvrzené platbě a stavu READY.';
        return;
    }
    adminMessage.textContent = 'Objednávka je připravena. Další krok bude připojení API Balíkovny, které vytvoří zásilku, tracking a štítek.';
});

document.querySelector('#logout-admin').addEventListener('click', () => {
    sessionStorage.removeItem(TOKEN_KEY);
    state.orders = [];
    state.selectedOrderNumber = null;
    adminContent.hidden = true;
    authCard.hidden = false;
    detail.classList.remove('open');
    tokenInput.value = '';
    setConnected(false);
    showAuthMessage('Odhlášeno.');
});

const storedToken = sessionStorage.getItem(TOKEN_KEY);
if (storedToken) {
    loadOrders(storedToken);
} else {
    setConnected(false);
}
