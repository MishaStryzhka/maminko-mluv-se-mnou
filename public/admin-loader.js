(() => {
    const body = document.body;
    const page = body.dataset.adminPage;
    if (!page) return;

    const auth = document.querySelector('#admin-auth');
    const setup = document.querySelector('#admin-setup');
    const content = document.querySelector('#admin-content');

    function visible(element) {
        return Boolean(element && !element.hidden);
    }

    function pageReady() {
        if (visible(auth) || visible(setup)) return true;
        if (!visible(content)) return false;

        if (page === 'products') return true;

        if (page === 'orders') {
            const rows = document.querySelector('#orders-body');
            const empty = document.querySelector('#orders-empty');
            return Boolean((rows && rows.children.length) || (empty && !empty.hidden));
        }

        if (page === 'shipping') {
            const rows = document.querySelector('#shipping-body');
            const empty = document.querySelector('#shipping-empty');
            return Boolean((rows && rows.children.length) || (empty && !empty.hidden));
        }

        if (page === 'users') {
            const rows = document.querySelector('#users-body');
            const message = document.querySelector('#users-message');
            return Boolean((rows && rows.children.length) || (message && !message.hidden));
        }

        if (page === 'settings') {
            const database = document.querySelector('#setting-db');
            const message = document.querySelector('#settings-status');
            return Boolean((database && database.textContent !== 'Načítám…') || (message && !message.hidden));
        }

        return true;
    }

    let finished = false;
    let observer;

    function finish() {
        if (finished) return;
        finished = true;
        observer?.disconnect();
        requestAnimationFrame(() => body.classList.add('admin-ready'));
    }

    function check() {
        if (pageReady()) finish();
    }

    observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
        attributeFilter: ['hidden'],
    });

    check();

    // Never leave the interface permanently covered if an unexpected client error occurs.
    window.setTimeout(finish, 10000);
})();