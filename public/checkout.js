const COPY = {
    cs: {
        back: '← Zpět',
        productTitle: 'Vyberte variantu',
        fullName: 'Kompletní balíček',
        fullDesc: 'Tištěná publikace + digitální materiály v Telegram kanálu',
        printName: 'Tištěná publikace',
        printDesc: 'Tištěná publikace A4, 60 praktických stran',
        contactTitle: 'Kontaktní údaje',
        name: 'Jméno a příjmení',
        phone: 'Telefon',
        shippingTitle: 'Doručení',
        pickupDesc: 'Vyberte si box nebo výdejní místo, které vám vyhovuje.',
        addressName: 'Balíkovna na adresu',
        addressDesc: 'Doručíme na vámi vybranou adresu v České republice.',
        pickupChooseTitle: 'Vyberte Balíkovnu nebo BOX',
        pickupChooseCopy: 'Otevře se oficiální vyhledávač Balíkovny s mapou a aktuální databází výdejních míst.',
        choosePickup: 'Vybrat Balíkovnu',
        selectedPickup: 'Vybrané výdejní místo',
        change: 'Změnit',
        pickupRequired: 'Vyberte prosím Balíkovnu nebo BOX.',
        street: 'Ulice a číslo',
        city: 'Město',
        zip: 'PSČ',
        country: 'Země',
        pay: 'Zaplatit',
        summaryKicker: 'Shrnutí',
        summaryTitle: 'Vaše objednávka',
        delivery: 'Doprava',
        pickup: 'Výdejní místo',
        shippingPrice: 'Cena dopravy',
        shippingTbd: 'Načítání…',
        subtotal: 'Celkem včetně dopravy',
        stripeTestBadge: 'TESTOVACÍ PLATBA',
        pickerTitle: 'Vyberte Balíkovnu / BOX',
        pickerSubtitle: 'Oficiální vyhledávač Balíkovny',
        pickupMethod: 'Balíkovna / BOX',
        addressMethod: 'Balíkovna na adresu',
        paymentStarting: 'Načítání platby',
        paymentError: 'Platbu se nepodařilo zahájit. Zkuste to prosím znovu.',
        paymentUnavailable: 'Platby se zatím připravují. Zkuste to prosím později.',
        paymentCancelled: 'Platba byla zrušena. Zboží si můžete znovu objednat.',
    },
    uk: {
        back: '← Назад',
        productTitle: 'Виберіть варіант',
        fullName: 'Повний комплект',
        fullDesc: 'Друкований посібник + цифрові матеріали в Telegram-каналі',
        printName: 'Друкований посібник',
        printDesc: 'Друкований посібник A4, 60 практичних сторінок',
        contactTitle: 'Контактні дані',
        name: 'Ім’я та прізвище',
        phone: 'Телефон',
        shippingTitle: 'Доставка',
        pickupDesc: 'Виберіть зручний BOX або пункт видачі Balíkovna.',
        addressName: 'Balíkovna на адресу',
        addressDesc: 'Доставимо на вибрану вами адресу в Чехії.',
        pickupChooseTitle: 'Виберіть Balíkovna або BOX',
        pickupChooseCopy: 'Відкриється офіційний пошук Balíkovna з картою та актуальною базою пунктів видачі.',
        choosePickup: 'Вибрати Balíkovna',
        selectedPickup: 'Вибраний пункт видачі',
        change: 'Змінити',
        pickupRequired: 'Будь ласка, виберіть Balíkovna або BOX.',
        street: 'Вулиця та номер',
        city: 'Місто',
        zip: 'PSČ',
        country: 'Країна',
        pay: 'Оплатити',
        summaryKicker: 'Підсумок',
        summaryTitle: 'Ваше замовлення',
        delivery: 'Доставка',
        pickup: 'Пункт видачі',
        shippingPrice: 'Вартість доставки',
        shippingTbd: 'Завантаження…',
        subtotal: 'Разом із доставкою',
        stripeTestBadge: 'ТЕСТОВА ОПЛАТА',
        pickerTitle: 'Виберіть Balíkovna / BOX',
        pickerSubtitle: 'Офіційний пошук Balíkovna',
        pickupMethod: 'Balíkovna / BOX',
        addressMethod: 'Balíkovna на адресу',
        paymentStarting: 'Завантаження оплати',
        paymentError: 'Не вдалося запустити оплату. Спробуйте ще раз.',
        paymentUnavailable: 'Оплата ще готується. Спробуйте пізніше.',
        paymentCancelled: 'Оплату скасовано. Ви можете оформити замовлення знову.',
    },
};

const PRODUCTS = {
    full: { price: 750, nameKey: 'fullName', descKey: 'fullDesc' },
    print: { price: 490, nameKey: 'printName', descKey: 'printDesc' },
};

const state = {
    lang: localStorage.getItem('maminko-lang') === 'uk' ? 'uk' : 'cs',
    product: 'full',
    shipping: 'pickup',
    pickup: null,
    shippingPrices: null,
    promotion: null,
    checkoutEnabled: false,
    sandbox: false,
};

const form = document.querySelector('#checkout-form');
const pickerDialog = document.querySelector('#picker-dialog');
const pickupPanel = document.querySelector('#pickup-panel');
const addressPanel = document.querySelector('#address-panel');
const pickupEmpty = document.querySelector('#pickup-empty');
const pickupSelected = document.querySelector('#pickup-selected');
const pickupError = document.querySelector('#pickup-error');
const addressInputs = [...document.querySelectorAll('[data-address-required]')];

const queryProduct = new URLSearchParams(location.search).get('product');
if (PRODUCTS[queryProduct]) state.product = queryProduct;

document.querySelector(`input[name="product"][value="${state.product}"]`).checked = true;
document.querySelector('input[name="shipping"][value="pickup"]').checked = true;

function t(key) {
    return COPY[state.lang][key] ?? key;
}

function price(value) {
    return `${new Intl.NumberFormat('cs-CZ').format(value)} Kč`;
}

function formatZip(value) {
    const raw = String(value || '').replace(/\s/g, '');
    return raw.length === 5 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw;
}

function applyLanguage() {
    document.documentElement.lang = state.lang;
    localStorage.setItem('maminko-lang', state.lang);
    document.querySelectorAll('a[data-storefront]').forEach((link) => {
        link.pathname = state.lang === 'uk' ? '/uk' : '/';
    });
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-lang]').forEach((button) => {
        button.classList.toggle('on', button.dataset.lang === state.lang);
    });
    renderSummary();
    refreshPaymentAvailability();
}

function setShippingRequirements() {
    const isAddress = state.shipping === 'address';
    pickupPanel.hidden = isAddress;
    addressPanel.hidden = !isAddress;
    addressInputs.forEach((input) => {
        input.required = isAddress;
    });
    if (isAddress) pickupError.hidden = true;
}

function renderPickup() {
    const hasPoint = Boolean(state.pickup);
    pickupEmpty.hidden = hasPoint;
    pickupSelected.hidden = !hasPoint;
    if (!hasPoint) return;

    document.querySelector('#pickup-name').textContent = state.pickup.name || 'Balíkovna';
    document.querySelector('#pickup-address').textContent = state.pickup.address || `${formatZip(state.pickup.zip)} ${state.pickup.name || ''}`.trim();
    document.querySelector('#pickup-id').textContent = `ID: ${state.pickup.id} · ZIP: ${formatZip(state.pickup.zip)}`;
    pickupError.hidden = true;
}

function renderSummary() {
    const product = PRODUCTS[state.product];
    const deliveryPrice = state.shippingPrices?.[state.shipping];
    const saving = document.querySelector('#summary-saving');
    saving.hidden = !state.promotion;
    if (state.promotion) {
        const difference = state.promotion.regularPrices[state.product] - product.price;
        const label = state.lang === 'cs' ? 'Ušetříte' : 'Ваша економія';
        saving.textContent = `Black Friday · ${label} ${price(difference)}`;
    }
    document.querySelector('#summary-product-name').textContent = t(product.nameKey);
    document.querySelector('#summary-product-desc').textContent = t(product.descKey);
    document.querySelector('#summary-product-price').textContent = price(product.price);
    document.querySelector('#summary-total').textContent = Number.isInteger(deliveryPrice) ? price(product.price + deliveryPrice) : price(product.price);
    document.querySelector('#summary-shipping-price').textContent = Number.isInteger(deliveryPrice) ? price(deliveryPrice) : t('shippingTbd');
    document.querySelector('#summary-shipping').textContent = state.shipping === 'pickup' ? t('pickupMethod') : t('addressMethod');

    const pointRow = document.querySelector('#summary-point-row');
    const pointValue = document.querySelector('#summary-point');
    if (state.shipping === 'pickup' && state.pickup) {
        pointRow.hidden = false;
        pointValue.textContent = state.pickup.name || 'Balíkovna';
    } else {
        pointRow.hidden = true;
        pointValue.textContent = '';
    }
}

function openPicker() {
    pickupError.hidden = true;
    if (typeof pickerDialog.showModal === 'function') pickerDialog.showModal();
    else pickerDialog.setAttribute('open', '');
}

function closePicker() {
    if (typeof pickerDialog.close === 'function' && pickerDialog.open) pickerDialog.close();
    else pickerDialog.removeAttribute('open');
}

function formValues() {
    const data = new FormData(form);
    return {
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        street: String(data.get('street') || '').trim(),
        city: String(data.get('city') || '').trim(),
        zip: formatZip(String(data.get('zip') || '').trim()),
    };
}

function buildOrder() {
    const values = formValues();
    return {
        lang: state.lang,
        product: state.product,
        shipping: state.shipping,
        customer: {
            name: values.name,
            email: values.email,
            phone: values.phone,
        },
        address: state.shipping === 'address'
            ? { street: values.street, city: values.city, zip: values.zip, country: 'CZ' }
            : null,
        pickup: state.shipping === 'pickup' ? state.pickup : null,
    };
}

document.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => {
        state.lang = button.dataset.lang;
        applyLanguage();
    });
});

document.querySelectorAll('input[name="product"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        state.product = radio.value;
        const url = new URL(location.href);
        url.searchParams.set('product', state.product);
        history.replaceState({}, '', url);
        renderSummary();
    });
});

document.querySelectorAll('input[name="shipping"]').forEach((radio) => {
    radio.addEventListener('change', () => {
        state.shipping = radio.value;
        setShippingRequirements();
        renderSummary();
    });
});

document.querySelector('#open-picker').addEventListener('click', openPicker);
document.querySelector('#change-picker').addEventListener('click', openPicker);
document.querySelector('#close-picker').addEventListener('click', closePicker);
const payButton = document.querySelector('#start-payment');

let paymentPending = false;

async function startPayment() {
    if (payButton.disabled) return;
    const order = buildOrder();
    const errorBox = document.querySelector('#checkout-error');
    errorBox.hidden = true;
    paymentPending = true;
    refreshPaymentAvailability();
    try {
        const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product: order.product,
                expectedProductPrice: PRODUCTS[order.product].price,
                lang: order.lang,
                shipping: order.shipping,
                customer: order.customer,
                address: order.address,
                pickup: order.pickup,
                termsAccepted: form.elements.termsAccepted.checked,
                digitalConsent: form.elements.digitalConsent.checked,
            }),
        });
        const result = await response.json();
        if (!response.ok || !/^https:\/\/checkout\.stripe\.com\//.test(result.payment?.gatewayUrl || '')) {
            throw new Error(result.error || 'CHECKOUT_FAILED');
        }
        location.assign(result.payment.gatewayUrl);
    } catch (error) {
        errorBox.textContent = t(error.message === 'PAYMENTS_NOT_READY' ? 'paymentUnavailable' : 'paymentError');
        if (error.message === 'PRICE_CHANGED') {
            await loadCheckoutConfiguration();
            errorBox.textContent = state.lang === 'cs' ? 'Cena se změnila. Zkontrolujte součet a potvrďte objednávku.' : 'Ціна змінилася. Перевірте підсумок і підтвердьте замовлення.';
        }
        errorBox.hidden = false;
        paymentPending = false;
        refreshPaymentAvailability();
    }
}

pickerDialog.addEventListener('click', (event) => {
    if (event.target === pickerDialog) closePicker();
});

window.addEventListener('message', (event) => {
    if (event.origin !== 'https://b2c.cpost.cz') return;
    if (!event.data || event.data.message !== 'pickerResult' || !event.data.point) return;

    const point = event.data.point;
    state.pickup = {
        id: point.id ?? event.data.id,
        zip: point.zip ?? '',
        name: point.name ?? '',
        address: point.address ?? '',
        type: point.type ?? 'BALIKOVNY',
        lat: point.coor_y_wgs84 ?? point.coords?.lat ?? null,
        lng: point.coor_x_wgs84 ?? point.coords?.lng ?? null,
    };

    if (event.data.phone) {
        const phoneInput = form.elements.phone;
        if (phoneInput && !phoneInput.value) phoneInput.value = event.data.phone;
    }

    renderPickup();
    renderSummary();
    closePicker();
});

form.addEventListener('submit', (event) => {
    event.preventDefault();
    setShippingRequirements();

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    if (state.shipping === 'pickup' && !state.pickup) {
        pickupError.hidden = false;
        pickupPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    if (!state.checkoutEnabled || !state.shippingPrices) {
        const errorBox = document.querySelector('#checkout-error');
        errorBox.textContent = t('paymentUnavailable');
        errorBox.hidden = false;
        return;
    }

    startPayment();
});

setShippingRequirements();
renderPickup();
applyLanguage();

async function loadCheckoutConfiguration() {
    try {
        const response = await fetch('/api/checkout-config', { cache: 'no-store' });
        if (!response.ok) throw new Error('CONFIG_FAILED');
        const config = await response.json();
        if (!Number.isInteger(config.shipping?.pickup) || !Number.isInteger(config.shipping?.address)) throw new Error('CONFIG_INVALID');
        state.promotion = config.promotion?.active && config.regularPrices
            ? { percent: config.promotion.percent, regularPrices: config.regularPrices } : null;
        const badge = document.querySelector('#checkout-sale-badge');
        badge.hidden = !state.promotion;
        if (state.promotion) badge.textContent = `Black Friday −${state.promotion.percent} %`;
        for (const [code, amount] of Object.entries(config.prices || {})) {
            PRODUCTS[code].price = amount;
            const previous = document.querySelector('[data-regular-price="' + code + '"]');
            previous.hidden = !state.promotion;
            if (state.promotion) previous.textContent = price(state.promotion.regularPrices[code]);
            document.querySelector('[data-product-price="' + code + '"]').textContent = price(amount);
        }
        state.shippingPrices = config.shipping;
        state.checkoutEnabled = config.stripeEnabled === true;
        state.sandbox = config.sandbox === true;
    } catch (error) {
        state.checkoutEnabled = false;
        console.warn('Could not load checkout configuration', error?.message);
    }
    renderSummary();
    refreshPaymentAvailability();
}

function refreshPaymentAvailability() {
    const status = document.querySelector('#checkout-status');
    status.hidden = state.checkoutEnabled && !state.sandbox;
    status.textContent = status.hidden ? '' : t(state.checkoutEnabled ? 'stripeTestBadge' : 'paymentUnavailable');
    payButton.disabled = !state.checkoutEnabled || paymentPending;
    payButton.setAttribute('aria-busy', String(paymentPending));
    payButton.setAttribute('aria-label', t(paymentPending ? 'paymentStarting' : 'pay'));
    payButton.textContent = t('pay');
}

loadCheckoutConfiguration();

if (new URLSearchParams(location.search).get('payment') === 'cancelled') {
    const errorBox = document.querySelector('#checkout-error');
    errorBox.textContent = t('paymentCancelled');
    errorBox.hidden = false;
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted && paymentPending) {
        paymentPending = false;
        refreshPaymentAvailability();
    }
});
