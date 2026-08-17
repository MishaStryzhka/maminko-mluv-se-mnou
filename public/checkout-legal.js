const LEGAL_COPY = {
    cs: {
        terms: 'Souhlasím s obchodními podmínkami a beru na vědomí informace o ochraně osobních údajů.',
        digital: 'U kompletního balíčku výslovně souhlasím se zpřístupněním digitálního obsahu ihned po zaplacení před uplynutím 14denní lhůty a beru na vědomí, že po zahájení plnění zaniká právo odstoupit od smlouvy v rozsahu digitálního obsahu.',
    },
    uk: {
        terms: 'Погоджуюся з умовами продажу та підтверджую, що ознайомився/лася з інформацією про захист персональних даних.',
        digital: 'Для повного комплекту прямо погоджуюся на надання цифрового контенту одразу після оплати до закінчення 14-денного строку та підтверджую, що після початку надання втрачаю право на відмову від договору в частині цифрового контенту.',
    },
};

const termsText = document.querySelector('#legal-terms-text');
const digitalRow = document.querySelector('#digital-consent-row');
const digitalText = document.querySelector('#digital-consent-text');
const digitalInput = document.querySelector('#digital-consent');

function legalLanguage() {
    return localStorage.getItem('maminko-lang') === 'cs' ? 'cs' : 'uk';
}

function renderLegalCopy() {
    const lang = legalLanguage();
    if (termsText) termsText.textContent = LEGAL_COPY[lang].terms;
    if (digitalText) digitalText.textContent = LEGAL_COPY[lang].digital;
}

function syncDigitalConsent() {
    const selected = document.querySelector('input[name="product"]:checked')?.value || 'full';
    const needsDigitalConsent = selected === 'full';
    if (digitalRow) digitalRow.hidden = !needsDigitalConsent;
    if (digitalInput) {
        digitalInput.required = needsDigitalConsent;
        if (!needsDigitalConsent) digitalInput.checked = false;
    }
}

document.querySelectorAll('[data-lang]').forEach((button) => {
    button.addEventListener('click', () => queueMicrotask(renderLegalCopy));
});

document.querySelectorAll('input[name="product"]').forEach((radio) => {
    radio.addEventListener('change', syncDigitalConsent);
});

renderLegalCopy();
syncDigitalConsent();
