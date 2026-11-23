(() => {
    'use strict';

    const mode = document.body.dataset.passwordReset;
    let token = '';
    if (mode === 'complete') {
        // Never retain the credential in the address bar, history, storage or DOM.
        const match = window.location.hash.match(/^#token=([A-Za-z0-9_-]{43})$/);
        token = match ? match[1] : '';
        window.history.replaceState(null, '', window.location.pathname);
    }

    const form = document.querySelector('#password-reset-form');
    const fields = document.querySelector('#reset-fields');
    const submit = document.querySelector('#reset-submit');
    const message = document.querySelector('#reset-message');
    const email = document.querySelector('#reset-email');
    const password = document.querySelector('#reset-password');
    const confirmation = document.querySelector('#reset-password-confirm');
    const defaultButtonText = submit.textContent;
    let pending = false;
    let finished = false;

    function showMessage(text, error = false) {
        message.textContent = text;
        message.hidden = false;
        message.dataset.error = String(error);
        message.setAttribute('role', error ? 'alert' : 'status');
        message.focus();
    }

    function clearPasswordFields() {
        if (password) password.value = '';
        if (confirmation) confirmation.value = '';
    }

    function invalidLink() {
        token = '';
        finished = true;
        clearPasswordFields();
        form.hidden = true;
        fields.disabled = true;
        document.querySelector('#reset-intro').hidden = true;
        showMessage('Odkaz je neplatný, vypršel nebo už byl použit. Požádejte o nový odkaz pro obnovení hesla.', true);
    }

    function setPending(value) {
        pending = value;
        fields.disabled = value || finished;
        submit.disabled = value || finished;
        form.setAttribute('aria-busy', String(value));
        submit.textContent = value ? 'Odesílám…' : defaultButtonText;
    }

    function errorText(code) {
        return {
            PASSWORD_TOO_SHORT: 'Heslo musí mít alespoň 12 znaků.',
            PASSWORD_TOO_LONG: 'Heslo může mít nejvýše 200 znaků.',
            PASSWORD_INVALID: 'Zadejte platné heslo o délce 12 až 200 znaků.',
            RATE_LIMITED: 'Příliš mnoho pokusů. Zkuste to prosím za chvíli znovu.',
            RESET_UNAVAILABLE: 'Obnovení hesla teď není dostupné. Zkuste to prosím později.',
            REQUEST_INVALID: 'Požadavek se nepodařilo ověřit. Zkontrolujte zadané údaje.',
            ORIGIN_INVALID: 'Otevřete tuto stránku přímo z odkazu na přihlášení nebo z obnovovacího e-mailu.',
        }[code] || 'Požadavek se nepodařilo dokončit. Zkuste to prosím znovu.';
    }

    if (mode === 'complete' && !token) {
        invalidLink();
        return;
    }
    form.hidden = false;
    fields.disabled = false;

    [password, confirmation].filter(Boolean).forEach((field) => {
        field.addEventListener('input', () => {
            field.removeAttribute('aria-invalid');
            field.setAttribute('aria-describedby', 'password-help');
        });
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (pending || finished || !form.reportValidity()) return;

        if (mode === 'complete' && (password.value.length < 12 || password.value.length > 200)) {
            password.setAttribute('aria-invalid', 'true');
            password.setAttribute('aria-describedby', 'password-help reset-message');
            showMessage('Heslo musí mít 12 až 200 znaků.', true);
            password.focus();
            return;
        }

        if (mode === 'complete' && password.value !== confirmation.value) {
            confirmation.setAttribute('aria-invalid', 'true');
            confirmation.setAttribute('aria-describedby', 'password-help reset-message');
            showMessage('Hesla se neshodují. Zadejte stejné nové heslo do obou polí.', true);
            confirmation.focus();
            return;
        }

        setPending(true);
        message.hidden = true;
        try {
            const response = await fetch('/api/admin-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                cache: 'no-store',
                redirect: 'error',
                referrerPolicy: 'no-referrer',
                body: JSON.stringify(mode === 'request'
                    ? { action: 'request', email: email.value.trim() }
                    : { action: 'complete', token, password: password.value }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.status !== (mode === 'request' ? 202 : 200) || data.ok !== true) {
                if (mode === 'complete' && data.error === 'RESET_INVALID') {
                    invalidLink();
                    return;
                }
                showMessage(errorText(data.error), true);
                return;
            }

            finished = true;
            form.hidden = true;
            if (mode === 'request') {
                email.value = '';
                document.querySelector('#request-help').hidden = false;
                showMessage('Pokud existuje aktivní účet s tímto e-mailem, pošleme vám odkaz pro obnovení hesla.');
            } else {
                token = '';
                clearPasswordFields();
                document.querySelector('#reset-intro').hidden = true;
                document.querySelector('#new-reset-link').hidden = true;
                showMessage('Heslo bylo změněno. Všechna dosavadní přihlášení byla ukončena. Přihlaste se novým heslem.');
            }
        } catch {
            showMessage(mode === 'complete'
                ? 'Spojení se nezdařilo. Zkontrolujte internet a zkuste to znovu. Pokud už bylo heslo změněno, přihlaste se novým heslem.'
                : 'Spojení se nezdařilo. Zkontrolujte internet a zkuste to znovu.', true);
        } finally {
            setPending(false);
        }
    });

    window.addEventListener('pagehide', () => {
        token = '';
        clearPasswordFields();
        if (mode === 'complete') {
            finished = true;
            form.hidden = true;
            fields.disabled = true;
        }
    });
    window.addEventListener('pageshow', (event) => {
        if (event.persisted && mode === 'complete') invalidLink();
    });
})();
