let order = null;
try {
    order = JSON.parse(sessionStorage.getItem('maminko-preview-order') || 'null');
} catch (_) {
    order = null;
}

const demo = {
    reference: 'PREVIEW-1025',
    createdAt: new Date().toISOString(),
    productName: 'Kompletní balíček',
    productPrice: 750,
    shippingName: 'Balíkovna / BOX',
    destination: 'Balíkovna Praha 1',
    customer: {
        name: 'Anna Novak',
        email: 'anna@example.cz',
        phone: '+420 777 000 000',
    },
};

order = order || demo;

function price(value) {
    return `${new Intl.NumberFormat('cs-CZ').format(Number(value) || 0)} Kč`;
}

function dateLabel(value) {
    const date = value ? new Date(value) : new Date();
    return new Intl.DateTimeFormat('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value || '—';
}

setText('#order-ref', order.reference);
setText('#order-date', dateLabel(order.createdAt));
setText('#order-name', order.customer?.name);
setText('#order-email', order.customer?.email);
setText('#order-product', order.productName);
setText('#order-destination', order.shippingName);
setText('#order-price', price(order.productPrice));
setText('#stat-revenue', price(order.productPrice));

setText('#detail-ref', order.reference);
setText('#detail-name', order.customer?.name);
setText('#detail-contact', `${order.customer?.email || '—'} · ${order.customer?.phone || '—'}`);
setText('#detail-product', order.productName);
setText('#detail-price', price(order.productPrice));
setText('#detail-shipping', order.shippingName);
setText('#detail-destination', order.destination);

const detail = document.querySelector('#order-detail');
document.querySelector('#open-detail').addEventListener('click', () => {
    detail.classList.toggle('open');
    if (detail.classList.contains('open')) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.querySelector('#create-shipment').addEventListener('click', () => {
    const message = document.querySelector('#admin-message');
    message.hidden = false;
    document.querySelector('#detail-shipment').textContent = 'PREVIEW — API Balíkovny není připojeno';
});
