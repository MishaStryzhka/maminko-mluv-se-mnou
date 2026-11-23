import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../public/admin-password-reset.js', import.meta.url), 'utf8');
const syntheticToken = 'A'.repeat(43);
const syntheticPassword = 'local-test-password-only';

function mount({ mode = 'request', hash = '', response, fetchImpl } = {}) {
    const handlers = new Map();
    const windowHandlers = new Map();
    const requests = [];
    const history = [];
    let focused;
    const selectors = [
        '#password-reset-form', '#reset-fields', '#reset-submit', '#reset-message',
        ...(mode === 'request'
            ? ['#reset-email', '#request-help']
            : ['#reset-password', '#reset-password-confirm', '#reset-intro', '#new-reset-link']),
    ];
    const nodes = Object.fromEntries(selectors.map((selector) => [selector, {
        value: '', textContent: selector === '#reset-submit' ? 'Odeslat' : '',
        hidden: false, disabled: selector === '#reset-fields', dataset: {}, attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        addEventListener(name, listener) { handlers.set(`${selector}:${name}`, listener); },
        reportValidity() { return true; },
        focus() { focused = selector; },
    }]));
    const location = { hash, pathname: `/admin/${mode === 'request' ? 'forgot' : 'reset'}-password`, search: '?ignored=1' };
    const context = {
        document: { body: { dataset: { passwordReset: mode } }, querySelector: (selector) => nodes[selector] || null },
        window: {
            location,
            history: { replaceState(...args) { history.push(args); location.hash = ''; location.search = ''; } },
            addEventListener(name, listener) { windowHandlers.set(name, listener); },
        },
        fetch: async (...args) => {
            requests.push(args);
            if (fetchImpl) return fetchImpl(...args);
            return response || { status: mode === 'request' ? 202 : 200, json: async () => ({ ok: true }) };
        },
    };
    vm.runInNewContext(script, context);
    return {
        nodes, requests, history, location,
        get focused() { return focused; },
        async submit() { return handlers.get('#password-reset-form:submit')?.({ preventDefault() {} }); },
        input(selector) { handlers.get(`${selector}:input`)?.({}); },
        windowEvent(name, event = {}) { windowHandlers.get(name)?.(event); },
    };
}

test('Every admin login entry links to password recovery, including the legacy redirect fallback', async () => {
    for (const path of ['admin.html', ...['orders', 'shipping', 'products', 'users', 'settings'].map((page) => `admin/${page}.html`)]) {
        const html = await readFile(new URL(`../public/${path}`, import.meta.url), 'utf8');
        assert.match(html, /class="auth-recovery-link" href="\/admin\/forgot-password">Zapomenuté heslo\?<\/a>/);
    }
});

test('Recovery pages use local assets, no-referrer, disabled fallback forms, and accessible new-password fields', async () => {
    for (const page of ['forgot-password', 'reset-password']) {
        const html = await readFile(new URL(`../public/admin/${page}.html`, import.meta.url), 'utf8');
        assert.match(html, /name="referrer" content="no-referrer"/);
        assert.match(html, /name="robots" content="noindex,nofollow"/);
        assert.match(html, /<fieldset id="reset-fields" disabled>/);
        assert.match(html, /method="post" action="\/api\/admin-password-reset"/);
        assert.match(html, /role="status" aria-live="polite" tabindex="-1"/);
        assert.doesNotMatch(html, /(?:href|src)="(?:https?:|\/\/)/);
        assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/);
        if (page === 'reset-password') {
            assert.equal((html.match(/autocomplete="new-password" minlength="12" maxlength="200"/g) || []).length, 2);
        }
    }
    assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie|innerHTML|console\.|location\.search/);
});

test('Valid fragment is removed immediately; opening the reset form never submits or validates the token remotely', () => {
    const ui = mount({ mode: 'complete', hash: `#token=${syntheticToken}` });
    assert.equal(ui.history.length, 1);
    assert.equal(ui.history[0][2], '/admin/reset-password');
    assert.equal(ui.location.hash, '');
    assert.equal(ui.location.search, '');
    assert.equal(ui.nodes['#password-reset-form'].hidden, false);
    assert.equal(ui.nodes['#reset-fields'].disabled, false);
    assert.equal(ui.requests.length, 0);
});

test('Missing, malformed, and ambiguous token fragments fail closed without contacting the server', async () => {
    for (const hash of ['', '#token=short', `#token=${syntheticToken}&token=${syntheticToken}`, '#token=%41'.repeat(43)]) {
        const ui = mount({ mode: 'complete', hash });
        assert.equal(ui.history.length, 1);
        assert.equal(ui.nodes['#password-reset-form'].hidden, true);
        assert.equal(ui.nodes['#reset-fields'].disabled, true);
        assert.match(ui.nodes['#reset-message'].textContent, /Odkaz je neplatný, vypršel nebo už byl použit/);
        assert.equal(ui.focused, '#reset-message');
        await ui.submit();
        assert.equal(ui.requests.length, 0);
    }
});

test('Request sends only the entered account email and displays a generic response without repeating it', async () => {
    const ui = mount();
    ui.nodes['#reset-email'].value = '  owner@example.invalid  ';
    await ui.submit();
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.requests[0][0], '/api/admin-password-reset');
    assert.deepEqual(JSON.parse(ui.requests[0][1].body), { action: 'request', email: 'owner@example.invalid' });
    assert.equal(ui.requests[0][1].method, 'POST');
    assert.equal(ui.requests[0][1].credentials, 'same-origin');
    assert.equal(ui.requests[0][1].cache, 'no-store');
    assert.equal(ui.requests[0][1].redirect, 'error');
    assert.equal(ui.requests[0][1].referrerPolicy, 'no-referrer');
    assert.match(ui.nodes['#reset-message'].textContent, /^Pokud existuje aktivní účet s tímto e-mailem/);
    assert.doesNotMatch(ui.nodes['#reset-message'].textContent, /owner@example/);
    assert.equal(ui.nodes['#reset-email'].value, '');
    assert.equal(ui.nodes['#password-reset-form'].hidden, true);
    assert.equal(ui.nodes['#request-help'].hidden, false);
    await ui.submit();
    assert.equal(ui.requests.length, 1);
});

test('Password length and confirmation are checked locally with focus and error associations', async () => {
    const ui = mount({ mode: 'complete', hash: `#token=${syntheticToken}` });
    for (const password of ['short', 'A'.repeat(201)]) {
        ui.nodes['#reset-password'].value = password;
        ui.nodes['#reset-password-confirm'].value = password;
        await ui.submit();
        assert.equal(ui.requests.length, 0);
        assert.equal(ui.focused, '#reset-password');
        assert.equal(ui.nodes['#reset-password'].attributes['aria-invalid'], 'true');
    }
    ui.nodes['#reset-password'].value = syntheticPassword;
    ui.nodes['#reset-password-confirm'].value = 'different-test-password';
    await ui.submit();
    assert.equal(ui.requests.length, 0);
    assert.equal(ui.focused, '#reset-password-confirm');
    assert.equal(ui.nodes['#reset-password-confirm'].attributes['aria-describedby'], 'password-help reset-message');
    ui.input('#reset-password-confirm');
    assert.equal(ui.nodes['#reset-password-confirm'].attributes['aria-invalid'], undefined);
});

test('Successful completion posts token in JSON only, clears passwords, and does not auto-login', async () => {
    const ui = mount({ mode: 'complete', hash: `#token=${syntheticToken}` });
    ui.nodes['#reset-password'].value = syntheticPassword;
    ui.nodes['#reset-password-confirm'].value = syntheticPassword;
    await ui.submit();
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.requests[0][0], '/api/admin-password-reset');
    assert.deepEqual(JSON.parse(ui.requests[0][1].body), { action: 'complete', token: syntheticToken, password: syntheticPassword });
    assert.equal(ui.nodes['#reset-password'].value, '');
    assert.equal(ui.nodes['#reset-password-confirm'].value, '');
    assert.equal(ui.nodes['#password-reset-form'].hidden, true);
    assert.equal(ui.nodes['#new-reset-link'].hidden, true);
    assert.match(ui.nodes['#reset-message'].textContent, /Heslo bylo změněno/);
    assert.equal(ui.location.pathname, '/admin/reset-password');
    assert.equal(ui.location.hash, '');
    await ui.submit();
    assert.equal(ui.requests.length, 1);
});

test('Expired or used server token clears sensitive fields and cannot be resubmitted', async () => {
    const ui = mount({ mode: 'complete', hash: `#token=${syntheticToken}`, response: { status: 400, json: async () => ({ error: 'RESET_INVALID' }) } });
    ui.nodes['#reset-password'].value = syntheticPassword;
    ui.nodes['#reset-password-confirm'].value = syntheticPassword;
    await ui.submit();
    assert.equal(ui.nodes['#reset-password'].value, '');
    assert.equal(ui.nodes['#reset-password-confirm'].value, '');
    assert.equal(ui.nodes['#password-reset-form'].hidden, true);
    assert.equal(ui.nodes['#reset-fields'].disabled, true);
    assert.match(ui.nodes['#reset-message'].textContent, /Odkaz je neplatný, vypršel nebo už byl použit/);
    await ui.submit();
    assert.equal(ui.requests.length, 1);
});

test('Busy submission prevents duplicate requests and restores controls after a network failure', async () => {
    let rejectRequest;
    const ui = mount({ fetchImpl: () => new Promise((resolve, reject) => { rejectRequest = reject; }) });
    ui.nodes['#reset-email'].value = 'owner@example.invalid';
    const first = ui.submit();
    assert.equal(ui.nodes['#reset-fields'].disabled, true);
    assert.equal(ui.nodes['#password-reset-form'].attributes['aria-busy'], 'true');
    await ui.submit();
    assert.equal(ui.requests.length, 1);
    rejectRequest(new Error('Synthetic network failure'));
    await first;
    assert.equal(ui.nodes['#reset-fields'].disabled, false);
    assert.equal(ui.nodes['#reset-submit'].disabled, false);
    assert.equal(ui.nodes['#password-reset-form'].attributes['aria-busy'], 'false');
    assert.match(ui.nodes['#reset-message'].textContent, /Spojení se nezdařilo/);
});

test('Unknown API errors are not reflected and throttled completion permits a later retry', async () => {
    for (const [status, error] of [[429, 'RATE_LIMITED'], [500, '<script>unsafe</script>']]) {
        const ui = mount({ mode: 'complete', hash: `#token=${syntheticToken}`, response: { status, json: async () => ({ error }) } });
        ui.nodes['#reset-password'].value = syntheticPassword;
        ui.nodes['#reset-password-confirm'].value = syntheticPassword;
        await ui.submit();
        assert.equal(ui.nodes['#password-reset-form'].hidden, false);
        assert.equal(ui.nodes['#reset-fields'].disabled, false);
        assert.equal(ui.nodes['#reset-message'].attributes.role, 'alert');
        assert.doesNotMatch(ui.nodes['#reset-message'].textContent, /unsafe|script/);
    }
});

test('Leaving the page clears passwords and a restored cached page cannot reuse its in-memory credential', async () => {
    const ui = mount({ mode: 'complete', hash: `#token=${syntheticToken}` });
    ui.nodes['#reset-password'].value = syntheticPassword;
    ui.nodes['#reset-password-confirm'].value = syntheticPassword;
    ui.windowEvent('pagehide');
    assert.equal(ui.nodes['#reset-password'].value, '');
    assert.equal(ui.nodes['#reset-password-confirm'].value, '');
    ui.windowEvent('pageshow', { persisted: true });
    assert.equal(ui.nodes['#password-reset-form'].hidden, true);
    await ui.submit();
    assert.equal(ui.requests.length, 0);
});
