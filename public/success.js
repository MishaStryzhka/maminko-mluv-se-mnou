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
        refundLead: 'Zde najdete aktuální stav vrácení platby. Objednávku znovu neplaťte.',
        testRefundLead: 'Jde o testovací platbu a testovací vrácení peněz. Nic neplaťte; objednávku neexpedujte.',
        refundSummary: 'Vrácení platby',
        refundedAmount: 'Potvrzeně vráceno',
        refundPendingAmount: 'Čeká na vrácení',
        refundAmountUnknown: 'Ověřuje se',
        refundNextTitle: 'Další postup',
        refundNextCopy: 'Pokud řešíte doručení nebo vrácení zboží, kontaktujte nás. Z tohoto stavu nelze potvrdit odeslání zásilky.',
        refundHold: 'Další zpracování objednávky je pozastaveno kvůli vrácení platby. Odeslání nyní nepotvrzujeme.',
        refunds: {
            full: { badge: 'VRÁCENO', title: 'Vrácení celé platby potvrzeno', copy: 'Potvrzenou vrácenou částku najdete níže. Tuto objednávku znovu neplaťte.' },
            partial: { badge: 'ČÁSTEČNĚ VRÁCENO', title: 'Část platby byla vrácena', copy: 'Potvrzenou vrácenou částku najdete níže. Zbývající část není novým požadavkem na platbu; objednávku znovu neplaťte.' },
            pending: { badge: 'VRÁCENÍ SE ZPRACOVÁVÁ', title: 'Čekáme na dokončení vrácení', copy: 'Částka čekající na vrácení ještě není potvrzeným vrácením. Objednávku znovu neplaťte.' },
            requires_action: { badge: 'VRÁCENÍ VYŽADUJE KONTROLU', title: 'Vrácení platby vyžaduje další krok', copy: 'Pro upřesnění nás kontaktujte. Nejde o novou žádost o zaplacení objednávky; znovu ji neplaťte.' },
            failed: { badge: 'VRÁCENÍ SE NEZDAŘILO', title: 'Vrácení se nepodařilo dokončit', copy: 'Nejde o neuhrazenou objednávku. Objednávku znovu neplaťte; kvůli vrácení platby nás kontaktujte.' },
            canceled: { badge: 'VRÁCENÍ ZRUŠENO', title: 'Požadavek na vrácení byl zrušen', copy: 'Případné dříve potvrzené vrácené částky jsou uvedeny níže. Objednávku znovu neplaťte; v případě dotazů nás kontaktujte.' },
            review: { badge: 'VRÁCENÍ K PROVĚŘENÍ', title: 'Stav vrácení platby ověřujeme', copy: 'Stav vrácení potřebuje kontrolu. Objednávku znovu neplaťte; v případě dotazů nás kontaktujte.' },
        },
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
        refundLead: 'Тут наведено поточний статус повернення коштів. Не оплачуйте замовлення повторно.',
        testRefundLead: 'Це тестова оплата і тестове повернення коштів. Нічого не сплачуйте; не відправляйте замовлення.',
        refundSummary: 'Повернення коштів',
        refundedAmount: 'Підтверджено повернення',
        refundPendingAmount: 'Очікує повернення',
        refundAmountUnknown: 'Уточнюється',
        refundNextTitle: 'Подальші дії',
        refundNextCopy: 'Якщо питання стосується доставки чи повернення товару, зв’яжіться з нами. Цей статус не підтверджує відправлення посилки.',
        refundHold: 'Подальшу обробку замовлення призупинено через повернення коштів. Зараз ми не підтверджуємо відправлення.',
        refunds: {
            full: { badge: 'КОШТИ ПОВЕРНУТО', title: 'Підтверджено повернення всієї оплати', copy: 'Підтверджену суму повернення наведено нижче. Не оплачуйте це замовлення повторно.' },
            partial: { badge: 'ЧАСТКОВО ПОВЕРНУТО', title: 'Частину оплати повернуто', copy: 'Підтверджену суму повернення наведено нижче. Залишок не є новою вимогою оплати; не оплачуйте замовлення повторно.' },
            pending: { badge: 'ПОВЕРНЕННЯ ОБРОБЛЯЄТЬСЯ', title: 'Очікуємо завершення повернення', copy: 'Сума, що очікує повернення, ще не є підтвердженим поверненням. Не оплачуйте замовлення повторно.' },
            requires_action: { badge: 'ПОВЕРНЕННЯ ПОТРЕБУЄ ПЕРЕВІРКИ', title: 'Для повернення потрібна додаткова дія', copy: 'Зв’яжіться з нами для уточнення. Це не новий запит на оплату замовлення; не оплачуйте його повторно.' },
            failed: { badge: 'ПОВЕРНЕННЯ НЕ ВДАЛОСЯ', title: 'Не вдалося завершити повернення', copy: 'Це не означає, що замовлення не оплачене. Не оплачуйте його повторно; щодо повернення коштів зв’яжіться з нами.' },
            canceled: { badge: 'ПОВЕРНЕННЯ СКАСОВАНО', title: 'Запит на повернення скасовано', copy: 'Суми раніше підтверджених повернень, якщо вони є, наведено нижче. Не оплачуйте замовлення повторно; за потреби зв’яжіться з нами.' },
            review: { badge: 'ПОВЕРНЕННЯ НА ПЕРЕВІРЦІ', title: 'Перевіряємо статус повернення', copy: 'Статус повернення потребує перевірки. Не оплачуйте замовлення повторно; за потреби зв’яжіться з нами.' },
        },
    },
};

const params = new URLSearchParams(location.search);
const orderNumber = params.get('order');
const token = params.get('token');
let order = null;
let errorState = !orderNumber || !token ? 'missing' : null;
const state = { lang: localStorage.getItem('maminko-lang') === 'cs' ? 'cs' : 'uk' };

function t(key) { return COPY[state.lang][key] ?? key; }
function price(value) { return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(Number(value) || 0)} Kč`; }

function refundState(order) {
    const status = order?.refund?.status;
    if (status && status !== 'none') return Object.hasOwn(COPY[state.lang].refunds, status) ? status : 'review';
    return {
        refunded: 'full', partially_refunded: 'partial', refund_pending: 'pending',
        refund_failed: 'failed', refund_canceled: 'canceled', refund_review: 'review',
    }[order?.payment_status] || (order?.refund?.hold ? 'review' : null);
}

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
    const refundStatus = refundState(order);
    const refundCopy = refundStatus ? COPY[state.lang].refunds[refundStatus] : null;
    const refundNeedsReview = refundStatus === 'review' || order?.payment_status === 'refund_review';
    const testRefund = Boolean(refundCopy && order?.payment_test_mode);
    const statusKey = errorState ? 'failed' : testPaid ? 'paidTest' : paid ? 'paid' : failed ? 'failed' : 'pending';
    const titleKey = errorState ? `${errorState}Title` : testPaid ? 'testPaidTitle' : paid ? 'paidTitle' : failed ? 'failedTitle' : 'simulationTitle';
    const copyKey = errorState ? `${errorState}Copy` : testPaid ? 'testPaidCopy' : paid ? 'paidCopy' : failed ? 'failedCopy' : 'simulationCopy';
    document.querySelector('.paid-pill').textContent = refundCopy && !errorState
        ? `${testRefund ? 'TEST · ' : ''}${refundCopy.badge}` : t(statusKey);
    document.querySelector('.paid-pill').classList.toggle('pending', !paid);
    document.querySelector('.paid-pill').classList.toggle('refund', Boolean(refundCopy));
    document.querySelector('.success-icon').textContent = errorState ? '×' : refundCopy ? '↶' : paid ? '✓' : failed ? '×' : '…';
    document.querySelector('.success-icon').classList.toggle('pending', !paid || Boolean(refundCopy));
    document.querySelector('.simulation-box strong').textContent = refundCopy && !errorState
        ? `${testRefund ? 'TEST · ' : ''}${refundCopy.title}` : t(titleKey);
    document.querySelector('.simulation-box span').textContent = refundCopy && !errorState
        ? `${testRefund ? `${t('testPaidCopy')} ` : ''}${refundCopy.copy}` : t(copyKey);
    if (refundCopy) {
        document.querySelector('.success-lead').textContent = t(testRefund ? 'testRefundLead' : 'refundLead');
        document.querySelector('[data-i18n="nextTitle"]').textContent = t('refundNextTitle');
        document.querySelector('[data-i18n="nextCopy"]').textContent = t('refundNextCopy');
    }
    if (testPaid || testRefund) {
        document.querySelector('[data-i18n="nextTitle"]').textContent = t('testNextTitle');
        document.querySelector('[data-i18n="nextCopy"]').textContent = t('testNextCopy');
    }
    document.querySelector('#refund-summary').hidden = !refundCopy;
    document.querySelector('#refund-summary-title').textContent = `${testRefund ? 'TEST · ' : ''}${t('refundSummary')}`;
    document.querySelector('#refund-refunded').textContent = refundNeedsReview ? t('refundAmountUnknown') : price(order?.refund?.refundedAmount);
    document.querySelector('#refund-pending').textContent = refundNeedsReview ? t('refundAmountUnknown') : price(order?.refund?.pendingAmount);
    document.querySelector('#refund-hold').hidden = !refundCopy || !order?.refund?.hold;
    document.querySelector('[data-i18n="backCheckout"]').hidden = Boolean(refundCopy);
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
            if (order?.payment_status !== 'pending' && refundState(order) !== 'pending') return;
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
