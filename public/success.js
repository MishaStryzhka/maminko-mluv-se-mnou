const COPY = {
    cs: {
        previewBadge: 'STAV OBJEDNÁVKY',
        title: 'Stav objednávky',
        lead: 'Ověřujeme stav platby. Objednávka se připraví až po jejím potvrzení.',
        simulationTitle: 'Čekáme na potvrzení Stripe',
        simulationCopy: 'Platba se potvrzuje automaticky. Pokud jste právě zaplatili, chvíli prosím vyčkejte.',
        orderNumber: 'Číslo objednávky',
        paid: 'ZAPLACENO',
        paidTest: 'TESTOVACÍ PLATBA',
        pending: 'ČEKÁ NA PLATBU',
        failed: 'NEZAPLACENO',
        paidTitle: 'Platba potvrzena',
        paidCopy: 'Děkujeme. Vaše objednávka byla zaplacena a připravíme ji k odeslání.',
        testPaidTitle: 'Testovací platba potvrzena',
        testPaidCopy: 'Nejde o skutečnou platbu. Tuto objednávku neexpedujte.',
        testNextTitle: 'Testovací objednávka',
        testNextCopy: 'Tato objednávka slouží pouze ke zkoušce platební integrace.',
        failedTitle: 'Platba nebyla dokončena',
        failedCopy: 'Platba nebyla úspěšně uhrazena. Můžete vytvořit novou objednávku.',
        missingTitle: 'Objednávku nelze zobrazit',
        missingCopy: 'Odkaz je neúplný nebo objednávka nebyla nalezena. V případě potřeby nás kontaktujte.',
        retryTitle: 'Stav se nepodařilo načíst',
        retryCopy: 'Zkuste stránku obnovit. Pokud problém přetrvá, kontaktujte nás.',
        product: 'Produkt',
        delivery: 'Doručení',
        total: 'Celková cena',
        next: 'Co bude dál',
        nextTitle: 'Připravíme zásilku',
        nextCopy: 'Po potvrzení platby začneme objednávku připravovat. O odeslání vás budeme informovat.',
        backCheckout: '← Nová objednávka',
        home: 'Zpět na hlavní stránku',
        pickup: 'Balíkovna / BOX',
        address: 'Balíkovna na adresu',
    },
    uk: {
        previewBadge: 'СТАТУС ЗАМОВЛЕННЯ',
        title: 'Статус замовлення',
        lead: 'Перевіряємо статус оплати. Замовлення готуватиметься лише після підтвердження платежу.',
        simulationTitle: 'Очікуємо підтвердження Stripe',
        simulationCopy: 'Оплата підтверджується автоматично. Якщо ви щойно заплатили, зачекайте трохи.',
        orderNumber: 'Номер замовлення',
        paid: 'ОПЛАЧЕНО',
        paidTest: 'ТЕСТОВА ОПЛАТА',
        pending: 'ОЧІКУЄ ОПЛАТИ',
        failed: 'НЕ ОПЛАЧЕНО',
        paidTitle: 'Оплату підтверджено',
        paidCopy: 'Дякуємо! Замовлення оплачено, ми підготуємо його до відправлення.',
        testPaidTitle: 'Тестову оплату підтверджено',
        testPaidCopy: 'Це не справжній платіж. Не відправляйте це замовлення.',
        testNextTitle: 'Тестове замовлення',
        testNextCopy: 'Це замовлення використовується лише для перевірки оплати.',
        failedTitle: 'Оплату не завершено',
        failedCopy: 'Оплата не пройшла. Можете створити нове замовлення.',
        missingTitle: 'Не вдалося знайти замовлення',
        missingCopy: 'Посилання неповне або замовлення не знайдено. За потреби зв’яжіться з нами.',
        retryTitle: 'Не вдалося завантажити статус',
        retryCopy: 'Оновіть сторінку. Якщо помилка повториться, зв’яжіться з нами.',
        product: 'Товар',
        delivery: 'Доставка',
        total: 'Загальна сума',
        next: 'Що далі',
        nextTitle: 'Підготуємо відправлення',
        nextCopy: 'Після підтвердження оплати підготуємо замовлення. Про відправлення повідомимо.',
        backCheckout: '← Нове замовлення',
        home: 'На головну сторінку',
        pickup: 'Balíkovna / BOX',
        address: 'Balíkovna на адресу',
    },
};

const params = new URLSearchParams(location.search);
const orderNumber = params.get('order');
const token = params.get('token');
let order = null;
let errorState = !orderNumber || !token ? 'missing' : null;
const state = { lang: localStorage.getItem('maminko-lang') === 'cs' ? 'cs' : 'uk' };

function t(key) { return COPY[state.lang][key] ?? key; }
function price(value) { return `${new Intl.NumberFormat('cs-CZ').format(Number(value) || 0)} Kč`; }

function render() {
    document.documentElement.lang = state.lang;
    localStorage.setItem('maminko-lang', state.lang);
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-lang]').forEach((button) => {
        button.classList.toggle('on', button.dataset.lang === state.lang);
    });

    const paid = order?.payment_status === 'paid';
    const failed = ['failed', 'cancelled'].includes(order?.payment_status);
    const testPaid = paid && order?.payment_test_mode;
    const statusKey = errorState ? 'failed' : testPaid ? 'paidTest' : paid ? 'paid' : failed ? 'failed' : 'pending';
    const titleKey = errorState ? `${errorState}Title` : testPaid ? 'testPaidTitle' : paid ? 'paidTitle' : failed ? 'failedTitle' : 'simulationTitle';
    const copyKey = errorState ? `${errorState}Copy` : testPaid ? 'testPaidCopy' : paid ? 'paidCopy' : failed ? 'failedCopy' : 'simulationCopy';
    document.querySelector('.paid-pill').textContent = t(statusKey);
    document.querySelector('.paid-pill').classList.toggle('pending', !paid);
    document.querySelector('.success-icon').textContent = paid ? '✓' : failed || errorState ? '×' : '…';
    document.querySelector('.success-icon').classList.toggle('pending', !paid);
    document.querySelector('.simulation-box strong').textContent = t(titleKey);
    document.querySelector('.simulation-box span').textContent = t(copyKey);
    if (testPaid) {
        document.querySelector('[data-i18n="nextTitle"]').textContent = t('testNextTitle');
        document.querySelector('[data-i18n="nextCopy"]').textContent = t('testNextCopy');
    }
    document.querySelector('#order-reference').textContent = order?.order_number || orderNumber || '—';
    document.querySelector('#order-product').textContent = order?.product_name || '—';
    document.querySelector('#order-price').textContent = order ? price(order.product_price) : '—';
    document.querySelector('#order-shipping').textContent = order ? t(order.shipping_method) : '—';
    document.querySelector('#order-destination').textContent = order?.shipping_method === 'pickup'
        ? [order.pickup_point_name, order.pickup_point_zip].filter(Boolean).join(' · ')
        : [order?.address_street, order?.address_zip, order?.address_city].filter(Boolean).join(', ');
    document.querySelector('#order-total').textContent = order ? price(order.total_amount) : '—';
}

document.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => { state.lang = button.dataset.lang; render(); });
});

async function pollPaymentStatus() {
    if (errorState) return;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        try {
            const url = `/api/order-status?order=${encodeURIComponent(orderNumber)}&token=${encodeURIComponent(token)}`;
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error('ORDER_STATUS_FAILED');
            order = (await response.json()).order;
            if (['cs', 'uk'].includes(order?.lang)) state.lang = order.lang;
            render();
            if (order?.payment_status !== 'pending') return;
        } catch {
            errorState = 'retry';
            render();
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
    }
}

render();
pollPaymentStatus();
