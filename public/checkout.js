const COPY = {
    cs: {
        back: '← Zpět',
        previewBadge: 'TESTOVACÍ NÁHLED',
        title: 'Objednávka',
        intro: 'Vyplňte údaje a vyberte způsob doručení. V tomto náhledu se objednávka neodesílá a platba se nespouští.',
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
        reviewTitle: 'Kontrola',
        confirmData: 'Potvrzuji, že jsem zkontroloval/a údaje objednávky.',
        legalNote: 'Obchodní podmínky a ochranu osobních údajů připojíme před spuštěním skutečných plateb.',
        previewOrder: 'Zkontrolovat objednávku',
        summaryKicker: 'Shrnutí',
        summaryTitle: 'Vaše objednávka',
        delivery: 'Doprava',
        pickup: 'Výdejní místo',
        shippingPrice: 'Cena dopravy',
        shippingTbd: 'doplníme',
        subtotal: 'Mezisoučet bez dopravy',
        shippingNote: 'Přesnou cenu dopravy nastavíme po odsouhlasení vašeho smluvního ceníku Balíkovny.',
        paymentNotLive: 'Platba zatím není aktivní',
        paymentNext: 'Po schválení checkoutu sem připojíme platební bránu.',
        pickerTitle: 'Vyberte Balíkovnu / BOX',
        pickerSubtitle: 'Oficiální vyhledávač Balíkovny',
        pickupMethod: 'Balíkovna / BOX',
        addressMethod: 'Balíkovna na adresu',
        previewSuccess: 'Údaje jsou v pořádku. Toto je pouze preview — objednávka nebyla odeslána a žádná platba neproběhla.',
    },
    uk: {
        back: '← Назад',
        previewBadge: 'ТЕСТОВИЙ ПЕРЕГЛЯД',
        title: 'Замовлення',
        intro: 'Заповніть дані та виберіть спосіб доставки. У цьому preview замовлення не надсилається й оплата не запускається.',
        productTitle: 'Виберіть варіант',
        fullName: 'Повний комплект',
        fullDesc: 'Друкований посібник + цифрові матеріали в Telegram-каналі',
        printName: 'Друкований посібник',
        printDesc: 'Друкований посібник A4, 60 практичних сторінок',
        contactTitle: 'Контактні дані',
        name: "Ім’я та прізвище",
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
        reviewTitle: 'Перевірка',
        confirmData: 'Підтверджую, що перевірив/ла дані замовлення.',
        legalNote: 'Умови продажу та захист персональних даних підключимо перед запуском реальних платежів.',
        previewOrder: 'Перевірити замовлення',
        summaryKicker: 'Підсумок',
        summaryTitle: 'Ваше замовлення',
        delivery: 'Доставка',
        pickup: 'Пункт видачі',
        shippingPrice: 'Вартість доставки',
        shippingTbd: 'додамо',
        subtotal: 'Проміжна сума без доставки',
        shippingNote: 'Точну вартість доставки встановимо після погодження вашого договірного тарифу Balíkovna.',
        paymentNotLive: 'Оплата поки не активна',
        paymentNext: 'Після погодження checkout підключимо сюди платіжну браму.',
        pickerTitle: 'Виберіть Balíkovna / BOX',
        pickerSubtitle: 'Офіційний пошук Balíkovna',
        pickupMethod: 'Balíkovna / BOX',
        addressMethod: 'Balíkovna на адресу',
        previewSuccess: 'Дані заповнені коректно. Це лише preview — замовлення не було надіслано і жодної оплати не відбулося.',
    },
};

const PRODUCTS = {
    full: { price: 750, nameKey: 'fullName', descKey: 'fullDesc' },
    print: { price: 490, nameKey: 'printName', descKey: 'printDesc' },
};

const state = {
    lang: localStorage.getItem('maminko-lang') === 'cs' ? 'cs' : 'uk',
    product: 'full',
    shipping: 'pickup',
    pickup: null,
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
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-lang]').forEach((button) => {
        button.classList.toggle('on', button.dataset.lang === state.lang);
    });
    renderSummary();
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
    document.querySelector('#summary-product-name').textContent = t(product.nameKey);
    document.querySelector('#summary-product-desc').textContent = t(product.descKey);
    document.querySelector('#summary-product-price').textContent = price(product.price);
    document.querySelector('#summary-total').textContent = price(product.price);
    document.querySelector('#summary-shipping').textContent = state.shipping === 'pickup' ? t('pickupMethod') : t('addressMethod');

    const pointRow = document.querySelector('#summary-point-row');
    const pointValue = document.querySelector('#summary-point');
    if (state.shipping === 'pickup' && state.pickup) {
        pointRow.hidden = false;
        pointValue.textContent = `${state.pickup.name || 'Balíkovna'} · ${formatZip(state.pickup.zip)}`;
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
    };

    if (event.data.phone) {
        const phoneInput = form.elements.phone;
        if (phoneInput && !phoneInput.value) phoneInput.value = event.data.phone;
    }

    renderPickup();
    renderSummary();
    closePicker();
});

function showPreviewSuccess() {
    const desktop = document.querySelector('#preview-result');
    const mobile = document.querySelector('#preview-result-mobile');
    [desktop, mobile].forEach((box) => {
        box.textContent = t('previewSuccess');
        box.hidden = false;
    });
    const target = window.matchMedia('(max-width: 900px)').matches ? mobile : desktop;
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

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

    showPreviewSuccess();
});

setShippingRequirements();
renderPickup();
applyLanguage();
