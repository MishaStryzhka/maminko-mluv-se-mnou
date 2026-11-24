const page = document.body.dataset.adminPage || 'orders';

const state = {
    user: null,
    orders: [],
    shippingFilter: 'ready',
    users: [],
    invites: [],
    filter: 'all',
};

const authCard = document.querySelector('#admin-auth');
const authForm = document.querySelector('#admin-login-form');
const authMessage = document.querySelector('#auth-message');
const setupCard = document.querySelector('#admin-setup');
const setupForm = document.querySelector('#admin-setup-form');
const setupMessage = document.querySelector('#setup-message');
const adminContent = document.querySelector('#admin-content');
const connectionState = document.querySelector('#connection-state');
const sidebarUser = document.querySelector('#sidebar-user');
const currentUser = document.querySelector('#current-user');
const logoutButton = document.querySelector('#logout-admin');

function roleLabel(role) {
    return { admin: 'Administrátor', sales: 'Prodej', accountant: 'Účetní' }[role] || role || '—';
}

function price(value, currency = 'CZK') {
    return new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: currency || 'CZK',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);
}

function dateLabel(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('cs-CZ', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
}

function paymentLabel(status) {
    return {
        paid: 'ZAPLACENO', pending: 'ČEKÁ', failed: 'CHYBA', cancelled: 'ZRUŠENO', canceled: 'ZRUŠENO',
        refunded: 'VRÁCENO', partially_refunded: 'ČÁSTEČNĚ VRÁCENO',
        refund_pending: 'VRÁCENÍ SE ZPRACOVÁVÁ', refund_failed: 'VRÁCENÍ SE NEZDAŘILO',
        refund_canceled: 'VRÁCENÍ ZRUŠENO', refund_review: 'VRÁCENÍ K PROVĚŘENÍ',
    }[status] || String(status || '—').toUpperCase();
}

function refundLabel(status) {
    return {
        none: 'BEZ VRÁCENÍ', full: 'VRÁCENO V PLNÉ VÝŠI', partial: 'ČÁSTEČNĚ VRÁCENO',
        pending: 'VRÁCENÍ SE ZPRACOVÁVÁ', requires_action: 'VRÁCENÍ VYŽADUJE KONTROLU',
        failed: 'VRÁCENÍ SE NEZDAŘILO', canceled: 'VRÁCENÍ ZRUŠENO', review: 'VRÁCENÍ K PROVĚŘENÍ',
    }[status || 'none'] || 'VRÁCENÍ K PROVĚŘENÍ';
}

function wasPaid(order) {
    return (order.payment?.originalStatus ?? order.payment?.status) === 'paid';
}

function refundNeedsReview(order) {
    return order.payment?.status === 'refund_review' || order.payment?.refund?.status === 'review';
}

function readyToShip(order) {
    return order.shipping?.status === 'ready' && wasPaid(order) && !order.payment?.testMode && !order.payment?.refund?.hold;
}

function amountInCents(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function refundAmounts(order) {
    if (refundNeedsReview(order)) return 'Vráceno: Ověřuje se · Čeká na vrácení: Ověřuje se';
    const refund = order.payment?.refund || {};
    return `Vráceno: ${price(refund.refundedAmount, order.currency)} · Čeká na vrácení: ${price(refund.pendingAmount, order.currency)}`;
}

function shippingLabel(status) {
    return {
        ready: 'K ODESLÁNÍ', not_ready: 'ČEKÁ', sent: 'ODESLÁNO', delivered: 'DORUČENO', cancelled: 'ZRUŠENO',
        refund_hold: 'POZASTAVENO · VRATKA',
    }[status] || String(status || '—').toUpperCase();
}

function statusClass(type, status) {
    if (type === 'payment') {
        if (status === 'paid') return 'paid';
        if (['refunded', 'partially_refunded'].includes(status)) return 'refund';
        if (['failed', 'cancelled', 'canceled', 'refund_failed', 'refund_canceled'].includes(status)) return 'error';
        return 'pending';
    }
    if (status === 'ready') return 'ready';
    if (status === 'sent') return 'sent';
    if (status === 'delivered') return 'paid';
    if (status === 'cancelled') return 'error';
    return 'pending';
}

function shippingName(order) {
    if (order.shipping?.method === 'pickup') {
        return order.shipping.pickup?.type ? `Balíkovna / ${order.shipping.pickup.type}` : 'Balíkovna / výdejní místo';
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
    if (element) element.textContent = value ?? '—';
}

function showMessage(element, message) {
    if (!element) return;
    element.textContent = message || '';
    element.hidden = !message;
}

async function readJson(response) {
    return response.json().catch(() => ({}));
}

function cell(primary, secondary, href) {
    const td = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = primary || '—';
    if (href) {
        const link = document.createElement('a');
        link.className = 'order-row-link';
        link.href = href;
        link.appendChild(strong);
        td.appendChild(link);
    } else {
        td.appendChild(strong);
    }
    if (secondary) {
        const small = document.createElement('small');
        small.textContent = secondary;
        td.appendChild(small);
    }
    return td;
}

function badge(type, status) {
    const span = document.createElement('span');
    span.className = `status ${statusClass(type, status)}`;
    span.textContent = type === 'payment' ? paymentLabel(status) : shippingLabel(status);
    return span;
}

function appendPaymentStatus(container, order) {
    const payment = order.payment || {};
    const status = badge('payment', payment.status);
    if (payment.testMode) status.textContent = `TEST · ${status.textContent}`;
    container.appendChild(status);
    if (payment.refund && payment.refund.status !== 'none') {
        const amounts = document.createElement('small');
        amounts.textContent = refundAmounts(order);
        container.appendChild(amounts);
    }
}

function appendShippingStatus(container, order) {
    const hold = order.payment?.refund?.hold;
    const status = hold && !['sent', 'delivered'].includes(order.shipping?.status)
        ? 'refund_hold' : order.shipping?.status;
    container.appendChild(badge('shipping', status));
    if (hold) {
        const warning = document.createElement('small');
        warning.className = 'refund-hold-note';
        warning.textContent = 'Neexpedovat; již odeslanou zásilku prověřit.';
        container.appendChild(warning);
    }
}

function pageAllowed(user) {
    if (!user) return false;
    if (page === 'orders') return ['admin', 'sales', 'accountant'].includes(user.role);
    if (page === 'shipping' || page === 'products') return ['admin', 'sales'].includes(user.role);
    return user.role === 'admin';
}

function applyRoleNavigation(user) {
    document.querySelectorAll('[data-admin-only]').forEach((element) => {
        element.hidden = user.role !== 'admin';
    });
    document.querySelectorAll('[data-sales-access]').forEach((element) => {
        element.hidden = !['admin', 'sales'].includes(user.role);
    });
}

function setSignedOut(message = '') {
    state.user = null;
    if (adminContent) adminContent.hidden = true;
    if (setupCard) setupCard.hidden = true;
    if (authCard) authCard.hidden = false;
    if (currentUser) currentUser.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
    if (connectionState) {
        connectionState.textContent = 'NEPŘIHLÁŠENO';
        connectionState.classList.remove('connected');
    }
    if (sidebarUser) sidebarUser.textContent = 'Administrace';
    showMessage(authMessage, message);
}

async function startSession(user) {
    if (!pageAllowed(user)) {
        window.location.replace('/admin/orders');
        return;
    }
    state.user = user;
    if (authCard) authCard.hidden = true;
    if (setupCard) setupCard.hidden = true;
    if (adminContent) adminContent.hidden = false;
    if (currentUser) {
        currentUser.hidden = false;
        currentUser.textContent = `${user.displayName} · ${roleLabel(user.role)}`;
    }
    if (logoutButton) logoutButton.hidden = false;
    if (connectionState) {
        connectionState.textContent = 'PŘIHLÁŠENO';
        connectionState.classList.add('connected');
    }
    if (sidebarUser) sidebarUser.textContent = user.displayName;
    applyRoleNavigation(user);
    showMessage(authMessage, '');
    showMessage(setupMessage, '');

    if (page === 'orders') {
        const detailNumber = window.location.pathname.match(/^\/admin\/orders\/([^/]+)\/?$/)?.[1];
        if (detailNumber) await loadOrderDetail(detailNumber);
        else await loadOrders(renderOrdersPage);
    }
    if (page === 'shipping') await loadOrders(renderShippingPage);
    if (page === 'users') await loadUsers();
    if (page === 'settings') await loadSettings();
}

async function loadOrders(renderer) {
    const response = await fetch('/api/admin-orders?limit=200', { cache: 'no-store' });
    const data = await readJson(response);
    if (response.status === 401) {
        setSignedOut('Přihlášení vypršelo. Přihlaste se znovu.');
        return;
    }
    if (!response.ok) throw new Error('Objednávky se nepodařilo načíst.');
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    renderer();
}

async function loadOrderDetail(number) {
    document.querySelector('.stats').hidden = true;
    document.querySelector('.orders-card').hidden = true;
    document.querySelector('#order-navigation').hidden = false;
    setText('.admin-header h1', 'Detail objednávky');
    document.title = 'Detail objednávky · Administrace';
    const message = document.querySelector('#order-error');
    try {
        const response = await fetch('/api/admin-orders?orderNumber=' + encodeURIComponent(number), { cache: 'no-store' });
        if (response.status === 401) return setSignedOut('Přihlášení vypršelo. Přihlaste se znovu.');
        if (response.status === 404) return showMessage(message, 'Objednávka nebyla nalezena.');
        if (!response.ok) throw new Error('ORDER_LOAD_FAILED');
        const { order } = await response.json();
        document.title = order.orderNumber + ' · Administrace';
        renderOrderDetail(order);
    } catch {
        showMessage(message, 'Detail objednávky se nepodařilo načíst.');
    }
}

function filteredOrders() {
    if (state.filter === 'paid') return state.orders.filter(wasPaid);
    if (state.filter === 'ready') return state.orders.filter(readyToShip);
    return state.orders;
}

let editingOrders = false;
const editOrders = document.querySelector('#edit-orders');
editOrders?.addEventListener('click', () => {
    editingOrders = !editingOrders;
    editOrders.textContent = editingOrders ? 'Hotovo' : 'Upravit';
    editOrders.setAttribute('aria-pressed', String(editingOrders));
    document.querySelector('#order-actions-heading').hidden = !editingOrders;
    document.querySelector('#edit-orders-note').hidden = !editingOrders;
    renderOrdersPage();
});

function orderActionCell(order) {
    const td = document.createElement('td');
    const payment = order.payment || {};
    const oldUnpaid = !payment.paidAt && !payment.refund?.hold
        && ['pending', 'failed', 'cancelled'].includes(payment.status)
        && Date.now() - Date.parse(order.createdAt) >= 86400000;
    if (!payment.testMode && !oldUnpaid) return td;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'detail-button remove-order';
    button.textContent = 'Odebrat';
    button.addEventListener('click', async () => {
        if (!window.confirm('Odebrat objednávku ' + order.orderNumber + ' z přehledu?')) return;
        button.disabled = true;
        const result = document.querySelector('#edit-orders-result');
        try {
            const response = await fetch('/api/admin-orders', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Order-Action': 'remove-order' },
                body: JSON.stringify({ orderNumber: order.orderNumber }),
            });
            showMessage(result, response.ok ? 'Objednávka byla odebrána z přehledu.' : 'Objednávku nelze odebrat.');
            await loadOrders(renderOrdersPage);
        } catch {
            showMessage(result, 'Výsledek se nepodařilo ověřit. Obnovte stránku.');
        } finally {
            button.disabled = false;
        }
    });
    td.appendChild(button);
    return td;
}

function renderOrdersPage() {
    const paid = state.orders.filter((order) => wasPaid(order) && !order.payment?.testMode);
    const ready = state.orders.filter(readyToShip);
    // Work in minor units. Pending/failed/canceled refunds are not deducted.
    const revenueCents = paid.reduce((sum, order) => sum + amountInCents(order.totalAmount)
        - amountInCents(order.payment?.refund?.refundedAmount), 0);
    setText('#stat-orders', state.orders.length);
    setText('#stat-paid', paid.length);
    setText('#stat-ready', ready.length);
    setText('#stat-revenue', paid.some(refundNeedsReview) ? 'K prověření' : price(revenueCents / 100));

    const body = document.querySelector('#orders-body');
    const empty = document.querySelector('#orders-empty');
    if (!body) return;
    const orders = filteredOrders();
    body.replaceChildren();
    if (empty) empty.hidden = orders.length > 0;

    orders.forEach((order) => {
        const tr = document.createElement('tr');
        const href = '/admin/orders/' + encodeURIComponent(order.orderNumber.toLowerCase());
        tr.appendChild(cell(order.orderNumber, dateLabel(order.createdAt), href));
        tr.appendChild(cell(order.customer?.name, order.customer?.email));
        tr.appendChild(cell(order.productName, shippingName(order)));
        const paymentTd = document.createElement('td');
        appendPaymentStatus(paymentTd, order);
        tr.appendChild(paymentTd);
        const shippingTd = document.createElement('td');
        appendShippingStatus(shippingTd, order);
        tr.appendChild(shippingTd);
        tr.appendChild(cell(price(order.totalAmount, order.currency), `doprava ${price(order.shipping?.price, order.currency)}`));
        if (editingOrders && state.user?.role === 'admin') tr.appendChild(orderActionCell(order));
        body.appendChild(tr);
    });
}

function renderOrderDetail(order) {
    const detail = document.querySelector('#order-detail');
    if (!detail) return;
    setText('.admin-header h1', order.orderNumber);
    setText('#detail-date', dateLabel(order.createdAt));
    setText('#detail-name', order.customer?.name);
    setText('#detail-contact', [order.customer?.email, order.customer?.phone].filter(Boolean).join('\n'));
    setText('#detail-product', order.productName);
    setText('#detail-price', price(order.productPrice, order.currency));
    setText('#detail-freight', price(order.shipping?.price, order.currency));
    setText('#detail-total', price(order.totalAmount, order.currency));
    const payment = order.payment || {};
    const paymentReference = payment.provider === 'stripe'
        ? `Stripe ${payment.testMode ? '(TEST) ' : ''}${payment.stripeSessionId || 'bez ID'} · ${payment.stripeState || '—'}`
        : payment.gopayPaymentId ? `GoPay ID: ${payment.gopayPaymentId} · ${payment.gopayState || '—'}` : 'Platební ID zatím není k dispozici';
    setText('#detail-gateway', paymentReference);
    const refund = payment.refund || {};
    const refundSection = document.querySelector('#detail-refund-section');
    if (refundSection) refundSection.hidden = !refund.hold && (!refund.status || refund.status === 'none');
    setText('#detail-refund', `${payment.testMode ? 'TEST · ' : ''}${refundLabel(refund.status)}`);
    setText('#detail-refund-amounts', refundAmounts(order));
    setText('#detail-refund-attempts', `Neúspěšné vratky: ${Number(refund.failedCount) || 0} · Zrušené vratky: ${Number(refund.canceledCount) || 0}`);
    showMessage(document.querySelector('#detail-refund-hold'), refund.hold
        ? `${payment.testMode ? 'TEST · ' : ''}Objednávka je pozastavena kvůli vrácení platby. Neexpedujte ji; již odeslanou zásilku a další postup prověřte.` : '');
    setText('#detail-shipping', order.shipping?.method === 'pickup' ? 'Výdejní místo Balíkovny' : shippingName(order));
    const pickup = order.shipping?.pickup;
    setText('#detail-destination', pickup ? [pickup.name, pickup.address || pickup.zip].filter(Boolean).join('\n') : destination(order));
    const email = order.confirmationEmail || {};
    const emailLabels = { pending: 'ČEKÁ', sending: 'ODESÍLÁ SE', sent: 'PŘIJATO SMTP SERVEREM', failed: 'CHYBA — ČEKÁ NA OPAKOVÁNÍ' };
    const resend = document.querySelector('#resend-confirmation');
    if (resend) {
        resend.hidden = !['admin', 'sales'].includes(state.user?.role) || payment.provider !== 'stripe'
            || payment.status !== 'paid' || payment.testMode || refund.hold;
        resend.disabled = false;
        resend.onclick = async () => {
            resend.disabled = true;
            const result = document.querySelector('#resend-result');
            showMessage(result, 'Odesílání…');
            try {
                const response = await fetch('/api/admin-orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Order-Action': 'resend-confirmation' },
                    body: JSON.stringify({ orderNumber: order.orderNumber, attempts: email.attempts || 0 }),
                });
                showMessage(result, response.ok ? 'Potvrzení s fakturou bylo odesláno.'
                    : response.status === 409 ? 'Stav objednávky se změnil. Zkontrolujte poslední pokus.'
                    : 'Odeslání se nezdařilo.');
            } catch {
                showMessage(result, 'Výsledek odeslání se nepodařilo ověřit.');
            }
            await loadOrderDetail(order.orderNumber);
        };
    }
    const testSuppressed = order.payment?.testMode && !email.attempts;
    setText('#detail-email', testSuppressed ? 'TEST — E-MAIL NEODESLÁN' : emailLabels[email.status] || '—');
    setText('#detail-email-attempts', `Pokusy: ${email.attempts || 0}${email.sentAt ? ` · ${dateLabel(email.sentAt)}` : ''}`);
    const digital = document.querySelector('#detail-digital');
    if (digital) {
        digital.hidden = order.productCode !== 'full';
        setText('#detail-digital-consent', order.digitalConsentAt ? dateLabel(order.digitalConsentAt) : 'Souhlas není zaznamenán');
    }
    const paymentBadge = document.querySelector('#detail-payment-badge');
    if (paymentBadge) {
        paymentBadge.className = `status ${statusClass('payment', order.payment?.status)}`;
        paymentBadge.textContent = `${order.payment?.testMode ? 'TEST · ' : ''}${paymentLabel(order.payment?.status)}`;
    }
    detail.classList.add('open');
}

function trackingCell(order) {
    if (!readyToShip(order)) return cell(order.shipping?.trackingNumber, order.shipping?.shippedAt ? dateLabel(order.shipping.shippedAt) : '');
    const td = document.createElement('td');
    const form = document.createElement('form');
    form.className = 'dispatch-form';
    const label = document.createElement('label');
    label.textContent = 'Podací číslo';
    const input = document.createElement('input');
    input.required = true;
    input.maxLength = 64;
    input.pattern = '[A-Za-z0-9][A-Za-z0-9\\-]{0,63}';
    label.appendChild(input);
    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'detail-button';
    button.textContent = 'Označit jako odeslané';
    form.append(label, button);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;
        button.disabled = true;
        const result = document.querySelector('#shipping-result');
        try {
            const response = await fetch('/api/admin-orders', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Order-Action': 'mark-shipped' },
                body: JSON.stringify({ orderNumber: order.orderNumber, trackingNumber: input.value.trim() }),
            });
            if (!response.ok && response.status !== 409) throw new Error();
            showMessage(result, response.ok ? 'Zásilka ' + order.orderNumber + ' byla označena jako odeslaná.'
                : 'Stav objednávky se změnil. Zkontrolujte zásilku v přehledu.');
            await loadOrders(renderShippingPage);
        } catch {
            showMessage(result, 'Odeslání se nepodařilo ověřit. Obnovte přehled a zkontrolujte stav zásilky.');
        } finally {
            button.disabled = false;
        }
    });
    const disclosure = document.createElement('details');
    disclosure.className = 'dispatch-entry';
    const summary = document.createElement('summary');
    summary.textContent = 'Zadat podací číslo';
    disclosure.append(summary, form);
    td.appendChild(disclosure);
    return td;
}

const shippingFilters = document.querySelectorAll('[data-shipping-filter]');
shippingFilters.forEach(button => button.addEventListener('click', () => {
    state.shippingFilter = button.dataset.shippingFilter;
    shippingFilters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderShippingPage();
}));

function renderShippingPage() {
    const ready = state.orders.filter(readyToShip).length;
    const sent = state.orders.filter((order) => order.shipping?.status === 'sent').length;
    const delivered = state.orders.filter((order) => order.shipping?.status === 'delivered').length;
    setText('#ship-ready', ready);
    setText('#ship-sent', sent);
    setText('#ship-delivered', delivered);

    const body = document.querySelector('#shipping-body');
    const empty = document.querySelector('#shipping-empty');
    if (!body) return;
    body.replaceChildren();
    const orders = state.orders.filter(order => state.shippingFilter === 'ready'
        ? readyToShip(order) : order.shipping?.status === state.shippingFilter);
    const hint = document.querySelector('#dispatch-hint');
    if (hint) hint.hidden = state.shippingFilter !== 'ready';
    if (empty) empty.hidden = orders.length > 0;
    orders.forEach((order) => {
        const tr = document.createElement('tr');
        tr.appendChild(cell(order.orderNumber, dateLabel(order.createdAt)));
        tr.appendChild(cell(order.customer?.name, order.customer?.phone));
        tr.appendChild(cell(shippingName(order), destination(order)));
        const statusTd = document.createElement('td');
        appendShippingStatus(statusTd, order);
        tr.appendChild(statusTd);
        const paymentTd = document.createElement('td');
        appendPaymentStatus(paymentTd, order);
        tr.appendChild(paymentTd);
        tr.appendChild(trackingCell(order));
        body.appendChild(tr);
    });
}

async function loadUsers() {
    const response = await fetch('/api/admin-users', { cache: 'no-store' });
    const data = await readJson(response);
    if (response.status === 401) {
        setSignedOut('Přihlášení vypršelo. Přihlaste se znovu.');
        return;
    }
    if (!response.ok) throw new Error('Uživatele se nepodařilo načíst.');
    state.users = Array.isArray(data.users) ? data.users : [];
    state.invites = Array.isArray(data.invites) ? data.invites : [];
    renderUsers();
}

function renderUsers() {
    const body = document.querySelector('#users-body');
    if (body) {
        body.replaceChildren();
        state.users.forEach((user) => {
            const tr = document.createElement('tr');
            tr.appendChild(cell(user.displayName, user.email));
            tr.appendChild(cell(roleLabel(user.role)));
            tr.appendChild(cell(user.active ? 'Aktivní' : 'Deaktivovaný'));
            tr.appendChild(cell(dateLabel(user.lastLoginAt)));
            const actionTd = document.createElement('td');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'detail-button';
            button.dataset.userId = user.id;
            button.dataset.active = String(!user.active);
            button.textContent = user.active ? 'Deaktivovat' : 'Aktivovat';
            if (user.id === state.user?.id) button.disabled = true;
            actionTd.appendChild(button);
            tr.appendChild(actionTd);
            body.appendChild(tr);
        });
    }

    const pending = document.querySelector('#pending-invites');
    if (!pending) return;
    pending.replaceChildren();
    pending.hidden = state.invites.length === 0;
    if (!state.invites.length) return;
    const title = document.createElement('strong');
    title.textContent = 'Čekající pozvánky';
    pending.appendChild(title);
    state.invites.forEach((invite) => {
        const row = document.createElement('div');
        row.className = 'invite-row';
        const text = document.createElement('p');
        text.textContent = `${invite.displayName} · ${invite.email} · ${roleLabel(invite.role)} · do ${dateLabel(invite.expiresAt)}`;
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'danger-button';
        cancel.dataset.inviteId = invite.id;
        cancel.textContent = 'Zrušit pozvánku';
        row.append(text, cancel);
        pending.appendChild(row);
    });
}

function showInvite(invite) {
    const result = document.querySelector('#invite-result');
    if (!result) return;
    result.replaceChildren();
    const text = document.createElement('p');
    text.textContent = `Pozvánka pro ${invite.displayName} je připravena. Odkaz platí ${invite.expiresInHours} hodin:`;
    const link = document.createElement('a');
    link.href = invite.inviteUrl;
    link.textContent = invite.inviteUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'secondary-action';
    copy.textContent = 'Kopírovat odkaz';
    copy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(invite.inviteUrl);
            copy.textContent = 'Zkopírováno';
        } catch {
            copy.textContent = 'Zkopírujte odkaz ručně';
        }
    });
    result.append(text, link, copy);
    result.hidden = false;
}

async function loadSettings() {
    const status = document.querySelector('#settings-status');
    try {
        const response = await fetch('/api/checkout-config', { cache: 'no-store' });
        const data = await readJson(response);
        if (!response.ok) throw new Error();
        setText('#setting-db', data.databaseReady ? 'Připojeno' : 'Chybí DATABASE_URL');
        setText('#setting-stripe', data.stripeEnabled ? (data.sandbox ? 'Testovací režim připraven' : 'Produkční režim připraven') : 'Není aktivní');
        setText('#setting-pickup', data.shipping?.pickup == null ? '—' : price(data.shipping.pickup));
        setText('#setting-address', data.shipping?.address == null ? '—' : price(data.shipping.address));
    } catch {
        showMessage(status, 'Stav systému se nepodařilo načíst.');
    }
}

if (authForm) {
    authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        showMessage(authMessage, 'Přihlašuji…');
        const response = await fetch('/api/admin-auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.querySelector('#admin-email').value.trim(),
                password: document.querySelector('#admin-password').value,
            }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            showMessage(authMessage, response.status === 429 ? 'Účet je na 15 minut uzamčen.' : 'Nesprávný e-mail nebo heslo.');
            return;
        }
        document.querySelector('#admin-password').value = '';
        await startSession(data.user);
    });
}

if (setupForm) {
    setupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const password = document.querySelector('#setup-password').value;
        if (password !== document.querySelector('#setup-password-confirm').value) {
            showMessage(setupMessage, 'Hesla se neshodují.');
            return;
        }
        const response = await fetch('/api/admin-setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                displayName: document.querySelector('#setup-name').value.trim(),
                email: document.querySelector('#setup-email').value.trim(),
                password,
                setupCode: document.querySelector('#setup-code').value,
            }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            showMessage(setupMessage, data.error === 'PASSWORD_TOO_SHORT' ? 'Heslo musí mít alespoň 12 znaků.' : 'První nastavení se nezdařilo.');
            return;
        }
        await startSession(data.user);
    });
}

if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try { await fetch('/api/admin-auth', { method: 'DELETE' }); } finally { window.location.replace('/admin/orders'); }
    });
}

document.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
        state.filter = button.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('on', item === button));
        document.querySelector('#order-detail')?.classList.remove('open');
        renderOrdersPage();
    });
});

const inviteForm = document.querySelector('#invite-user-form');
if (inviteForm) {
    inviteForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.querySelector('#users-message');
        showMessage(message, 'Vytvářím pozvánku…');
        const response = await fetch('/api/admin-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'invite',
                displayName: document.querySelector('#invite-name').value.trim(),
                email: document.querySelector('#invite-email').value.trim(),
                role: document.querySelector('#invite-role').value,
            }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            showMessage(message, data.error === 'USER_EXISTS' ? 'Uživatel s tímto e-mailem už existuje.' : 'Pozvánku se nepodařilo vytvořit.');
            return;
        }
        showMessage(message, '');
        showInvite(data.invite);
        inviteForm.reset();
        await loadUsers();
    });
}

const usersBody = document.querySelector('#users-body');
if (usersBody) {
    usersBody.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-user-id]');
        if (!button || button.disabled) return;
        const response = await fetch('/api/admin-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'setActive', userId: button.dataset.userId, active: button.dataset.active === 'true' }),
        });
        const data = await readJson(response);
        const message = document.querySelector('#users-message');
        if (!response.ok) {
            showMessage(message, data.error === 'LAST_ADMIN' ? 'Nelze deaktivovat posledního administrátora.' : 'Stav uživatele se nepodařilo změnit.');
            return;
        }
        showMessage(message, '');
        await loadUsers();
    });
}

const pendingInvites = document.querySelector('#pending-invites');
if (pendingInvites) {
    pendingInvites.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-invite-id]');
        if (!button) return;
        if (!window.confirm('Opravdu chcete tuto pozvánku zrušit?')) return;
        button.disabled = true;
        const response = await fetch(`/api/admin-invites?id=${encodeURIComponent(button.dataset.inviteId)}`, { method: 'DELETE' });
        const data = await readJson(response);
        const message = document.querySelector('#users-message');
        if (!response.ok) {
            button.disabled = false;
            showMessage(message, data.error === 'INVITE_NOT_FOUND' ? 'Pozvánka už neexistuje.' : 'Pozvánku se nepodařilo zrušit.');
            return;
        }
        showMessage(message, 'Pozvánka byla zrušena. Můžete vytvořit novou a zkopírovat nový odkaz.');
        await loadUsers();
    });
}

async function initialize() {
    try {
        const authResponse = await fetch('/api/admin-auth', { cache: 'no-store' });
        if (authResponse.ok) {
            const data = await readJson(authResponse);
            await startSession(data.user);
            return;
        }

        const setupResponse = await fetch('/api/admin-setup', { cache: 'no-store' });
        const setup = await readJson(setupResponse);
        if (setupResponse.ok && setup.setupRequired) {
            if (page !== 'orders') {
                window.location.replace('/admin/orders');
                return;
            }
            if (authCard) authCard.hidden = true;
            if (setupCard) setupCard.hidden = false;
            const email = document.querySelector('#setup-email');
            if (email) email.value = setup.ownerEmail || 'mykhailo.stryzhka@seznam.cz';
            return;
        }
        setSignedOut();
    } catch (error) {
        setSignedOut('Administrace se nepodařila připojit.');
        console.error(error);
    }
}

initialize().catch((error) => {
    setSignedOut('Administrace se nepodařila načíst.');
    console.error(error);
});
