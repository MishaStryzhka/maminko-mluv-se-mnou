const state = {
    user: null,
    orders: [],
    filter: 'all',
    selectedOrderNumber: null,
    users: [],
    invites: [],
};

const authCard = document.querySelector('#admin-auth');
const setupCard = document.querySelector('#admin-setup');
const authForm = document.querySelector('#admin-login-form');
const setupForm = document.querySelector('#admin-setup-form');
const authMessage = document.querySelector('#auth-message');
const setupMessage = document.querySelector('#setup-message');
const adminContent = document.querySelector('#admin-content');
const connectionState = document.querySelector('#connection-state');
const sidebarUser = document.querySelector('#sidebar-user');
const currentUser = document.querySelector('#current-user');
const logoutButton = document.querySelector('#logout-admin');
const ordersBody = document.querySelector('#orders-body');
const ordersEmpty = document.querySelector('#orders-empty');
const detail = document.querySelector('#order-detail');
const adminMessage = document.querySelector('#admin-message');
const usersSection = document.querySelector('#users');
const usersNav = document.querySelector('#users-nav');
const usersBody = document.querySelector('#users-body');
const usersMessage = document.querySelector('#users-message');
const pendingInvites = document.querySelector('#pending-invites');
const inviteResult = document.querySelector('#invite-result');
const inviteForm = document.querySelector('#invite-user-form');
const createShipmentButton = document.querySelector('#create-shipment');

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

function roleLabel(role) {
    return {
        admin: 'Administrátor',
        sales: 'Prodej',
        accountant: 'Účetní',
    }[role] || role || '—';
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

function showMessage(element, message) {
    element.textContent = message || '';
    element.hidden = !message;
}

async function readJson(response) {
    return response.json().catch(() => ({}));
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

function setSignedOut(message = '') {
    state.user = null;
    state.orders = [];
    state.users = [];
    state.invites = [];
    state.selectedOrderNumber = null;
    adminContent.hidden = true;
    setupCard.hidden = true;
    authCard.hidden = false;
    usersNav.hidden = true;
    usersSection.hidden = true;
    currentUser.hidden = true;
    logoutButton.hidden = true;
    connectionState.textContent = 'NEPŘIHLÁŠENO';
    connectionState.classList.remove('connected');
    sidebarUser.textContent = 'Administrace';
    detail.classList.remove('open');
    showMessage(authMessage, message);
}

async function startSession(user) {
    state.user = user;
    authCard.hidden = true;
    setupCard.hidden = true;
    adminContent.hidden = false;
    currentUser.hidden = false;
    logoutButton.hidden = false;
    currentUser.textContent = `${user.displayName} · ${roleLabel(user.role)}`;
    connectionState.textContent = 'PŘIHLÁŠENO';
    connectionState.classList.add('connected');
    sidebarUser.textContent = user.displayName;
    const isAdmin = user.role === 'admin';
    usersNav.hidden = !isAdmin;
    usersSection.hidden = !isAdmin;
    createShipmentButton.hidden = !['admin', 'sales'].includes(user.role);
    showMessage(authMessage, '');
    showMessage(setupMessage, '');
    await loadOrders();
    if (isAdmin) await loadUsers();
}

async function loadOrders() {
    try {
        const response = await fetch('/api/admin-orders?limit=100', { cache: 'no-store' });
        const data = await readJson(response);
        if (response.status === 401) {
            setSignedOut('Přihlášení vypršelo. Přihlaste se znovu.');
            return;
        }
        if (!response.ok) {
            if (data.error === 'DATABASE_NOT_CONFIGURED') throw new Error('Na Vercelu chybí připojení DATABASE_URL k Neon databázi.');
            throw new Error('Objednávky se nepodařilo načíst.');
        }
        state.orders = Array.isArray(data.orders) ? data.orders : [];
        renderStats();
        renderOrders();
    } catch (error) {
        showMessage(adminMessage, error.message || 'Objednávky se nepodařilo načíst.');
    }
}

function renderUsers() {
    usersBody.replaceChildren();
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
        usersBody.appendChild(tr);
    });

    pendingInvites.replaceChildren();
    pendingInvites.hidden = state.invites.length === 0;
    if (state.invites.length) {
        const title = document.createElement('strong');
        title.textContent = 'Čekající pozvánky';
        pendingInvites.appendChild(title);
        state.invites.forEach((invite) => {
            const line = document.createElement('p');
            line.textContent = `${invite.displayName} · ${invite.email} · ${roleLabel(invite.role)} · do ${dateLabel(invite.expiresAt)}`;
            pendingInvites.appendChild(line);
        });
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/admin-users', { cache: 'no-store' });
        const data = await readJson(response);
        if (!response.ok) throw new Error('Uživatele se nepodařilo načíst.');
        state.users = Array.isArray(data.users) ? data.users : [];
        state.invites = Array.isArray(data.invites) ? data.invites : [];
        renderUsers();
    } catch (error) {
        showMessage(usersMessage, error.message || 'Uživatele se nepodařilo načíst.');
    }
}

function showInvite(invite) {
    inviteResult.replaceChildren();
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
    inviteResult.append(text, link, copy);
    inviteResult.hidden = false;
}

authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(authMessage, 'Přihlašuji…');
    try {
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
            if (response.status === 429) throw new Error('Účet je po několika chybných pokusech na 15 minut uzamčen.');
            throw new Error('Nesprávný e-mail nebo heslo.');
        }
        document.querySelector('#admin-password').value = '';
        await startSession(data.user);
    } catch (error) {
        showMessage(authMessage, error.message || 'Přihlášení se nezdařilo.');
    }
});

setupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.querySelector('#setup-password').value;
    const confirmation = document.querySelector('#setup-password-confirm').value;
    if (password !== confirmation) {
        showMessage(setupMessage, 'Hesla se neshodují.');
        return;
    }
    showMessage(setupMessage, 'Vytvářím účet administrátora…');
    try {
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
            if (data.error === 'PASSWORD_TOO_SHORT') throw new Error('Heslo musí mít alespoň 12 znaků.');
            if (data.error === 'INVALID_SETUP_CODE') throw new Error('Jednorázový setup kód není správný.');
            if (data.error === 'SETUP_NOT_CONFIGURED') throw new Error('Na Vercelu chybí dočasná proměnná ADMIN_API_TOKEN pro první nastavení.');
            throw new Error('Účet administrátora se nepodařilo vytvořit.');
        }
        document.querySelector('#setup-password').value = '';
        document.querySelector('#setup-password-confirm').value = '';
        document.querySelector('#setup-code').value = '';
        await startSession(data.user);
        showMessage(adminMessage, 'Administrátor byl vytvořen. ADMIN_API_TOKEN už můžete z Vercelu odstranit.');
    } catch (error) {
        showMessage(setupMessage, error.message || 'První nastavení se nezdařilo.');
    }
});

logoutButton.addEventListener('click', async () => {
    try {
        await fetch('/api/admin-auth', { method: 'DELETE' });
    } finally {
        setSignedOut('Odhlášeno.');
    }
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

createShipmentButton.addEventListener('click', () => {
    const order = state.orders.find((item) => item.orderNumber === state.selectedOrderNumber);
    adminMessage.hidden = false;
    if (!order || order.shipping?.status !== 'ready') {
        adminMessage.textContent = 'Zásilku lze vytvořit až po potvrzené platbě a stavu READY.';
        return;
    }
    adminMessage.textContent = 'Objednávka je připravena. Další krok bude připojení API Balíkovny, které vytvoří zásilku, tracking a štítek.';
});

inviteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(usersMessage, 'Vytvářím pozvánku…');
    inviteResult.hidden = true;
    try {
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
            if (data.error === 'USER_EXISTS') throw new Error('Uživatel s tímto e-mailem už existuje.');
            throw new Error('Pozvánku se nepodařilo vytvořit.');
        }
        showMessage(usersMessage, '');
        showInvite(data.invite);
        inviteForm.reset();
        await loadUsers();
    } catch (error) {
        showMessage(usersMessage, error.message || 'Pozvánku se nepodařilo vytvořit.');
    }
});

usersBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-user-id]');
    if (!button || button.disabled) return;
    showMessage(usersMessage, 'Ukládám změnu…');
    try {
        const response = await fetch('/api/admin-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'setActive',
                userId: button.dataset.userId,
                active: button.dataset.active === 'true',
            }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            if (data.error === 'LAST_ADMIN') throw new Error('Nelze deaktivovat posledního administrátora.');
            throw new Error('Stav uživatele se nepodařilo změnit.');
        }
        showMessage(usersMessage, '');
        await loadUsers();
    } catch (error) {
        showMessage(usersMessage, error.message || 'Stav uživatele se nepodařilo změnit.');
    }
});

async function initialize() {
    try {
        const authResponse = await fetch('/api/admin-auth', { cache: 'no-store' });
        if (authResponse.ok) {
            const authData = await readJson(authResponse);
            await startSession(authData.user);
            return;
        }

        const setupResponse = await fetch('/api/admin-setup', { cache: 'no-store' });
        const setupData = await readJson(setupResponse);
        if (setupResponse.ok && setupData.setupRequired) {
            authCard.hidden = true;
            setupCard.hidden = false;
            document.querySelector('#setup-email').value = setupData.ownerEmail || 'mykhailo.stryzhka@seznam.cz';
            if (!setupData.setupConfigured) {
                showMessage(setupMessage, 'Pro jednorázové první nastavení je potřeba dočasně nastavit ADMIN_API_TOKEN ve Vercelu. Po vytvoření účtu ho odstraníte.');
            }
            return;
        }
        setSignedOut();
    } catch {
        setSignedOut('Administrace se nepodařila připojit.');
    }
}

initialize();
