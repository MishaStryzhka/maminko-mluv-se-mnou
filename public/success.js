const COPY = {
    cs: {
        previewBadge: 'TESTOVACÍ NÁHLED',
        title: 'Děkujeme za objednávku',
        lead: 'Platba byla úspěšná. Potvrzení objednávky jsme poslali na váš e-mail.',
        simulationTitle: 'Toto je pouze preview',
        simulationCopy: 'Žádná platba neproběhla a objednávka nebyla uložena. Tato stránka simuluje stav po úspěšné platbě.',
        orderNumber: 'Číslo objednávky',
        paid: 'ZAPLACENO',
        product: 'Produkt',
        delivery: 'Doručení',
        customer: 'Zákazník',
        next: 'Co bude dál',
        nextTitle: 'Připravíme zásilku',
        nextCopy: 'Po skutečném spuštění zde zákazník uvidí informaci o expedici a následně tracking Balíkovny.',
        backCheckout: '← Zpět do checkoutu',
        home: 'Zpět na hlavní stránku',
        fallbackProduct: 'Kompletní balíček',
        fallbackShipping: 'Balíkovna / BOX',
        fallbackDestination: 'Vybrané výdejní místo',
    },
    uk: {
        previewBadge: 'ТЕСТОВИЙ ПЕРЕГЛЯД',
        title: 'Дякуємо за замовлення',
        lead: 'Оплату успішно завершено. Підтвердження замовлення надіслано на ваш e-mail.',
        simulationTitle: 'Це лише preview',
        simulationCopy: 'Жодної оплати не відбулося і замовлення не було збережене. Ця сторінка імітує стан після успішної оплати.',
        orderNumber: 'Номер замовлення',
        paid: 'ОПЛАЧЕНО',
        product: 'Товар',
        delivery: 'Доставка',
        customer: 'Покупець',
        next: 'Що далі',
        nextTitle: 'Підготуємо відправлення',
        nextCopy: 'Після реального запуску тут покупець побачить інформацію про відправлення, а потім tracking Balíkovna.',
        backCheckout: '← Назад до checkout',
        home: 'На головну сторінку',
        fallbackProduct: 'Повний комплект',
        fallbackShipping: 'Balíkovna / BOX',
        fallbackDestination: 'Вибраний пункт видачі',
    },
};

let order = null;
try {
    order = JSON.parse(sessionStorage.getItem('maminko-preview-order') || 'null');
} catch (_) {
    order = null;
}

const state = {
    lang: order?.lang === 'cs' || localStorage.getItem('maminko-lang') === 'cs' ? 'cs' : 'uk',
};

function t(key) {
    return COPY[state.lang][key] ?? key;
}

function price(value) {
    return `${new Intl.NumberFormat('cs-CZ').format(Number(value) || 0)} Kč`;
}

function applyLanguage() {
    document.documentElement.lang = state.lang;
    localStorage.setItem('maminko-lang', state.lang);
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-lang]').forEach((button) => {
        button.classList.toggle('on', button.dataset.lang === state.lang);
    });
}

function renderOrder() {
    document.querySelector('#order-reference').textContent = order?.reference || 'PREVIEW-DEMO';
    document.querySelector('#order-product').textContent = order?.productName || t('fallbackProduct');
    document.querySelector('#order-price').textContent = price(order?.productPrice || 750);
    document.querySelector('#order-shipping').textContent = order?.shippingName || t('fallbackShipping');
    document.querySelector('#order-destination').textContent = order?.destination || t('fallbackDestination');
    document.querySelector('#order-customer').textContent = order?.customer?.name || '—';
    document.querySelector('#order-email').textContent = order?.customer?.email || '—';
}

document.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => {
        state.lang = button.dataset.lang;
        applyLanguage();
        renderOrder();
    });
});

applyLanguage();
renderOrder();
