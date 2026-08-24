(() => {
    if (document.body.dataset.adminPage !== 'users') return;

    const inviteLinks = new Map();
    const pending = document.querySelector('#pending-invites');
    const message = document.querySelector('#users-message');

    function roleLabel(role) {
        return { admin: 'Administrátor', sales: 'Prodej', accountant: 'Účetní' }[role] || role || '—';
    }

    function dateLabel(value) {
        if (!value) return '—';
        return new Intl.DateTimeFormat('cs-CZ', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }).format(new Date(value));
    }

    function showMessage(text) {
        if (!message) return;
        message.textContent = text || '';
        message.hidden = !text;
    }

    async function readJson(response) {
        return response.json().catch(() => ({}));
    }

    async function copyInvite(inviteId, button) {
        const url = inviteLinks.get(inviteId);
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            const original = button.textContent;
            button.textContent = 'Zkopírováno';
            window.setTimeout(() => { button.textContent = original; }, 1600);
        } catch {
            window.prompt('Zkopírujte odkaz:', url);
        }
    }

    function renderPending(invites, highlightedId = null) {
        if (!pending) return;
        pending.replaceChildren();
        pending.hidden = invites.length === 0;
        if (!invites.length) return;

        const title = document.createElement('strong');
        title.textContent = 'Čekající pozvánky';
        pending.appendChild(title);

        invites.forEach((invite) => {
            const row = document.createElement('div');
            row.className = `invite-row${invite.id === highlightedId ? ' invite-row-new' : ''}`;

            const text = document.createElement('p');
            text.textContent = `${invite.displayName} · ${invite.email} · ${roleLabel(invite.role)} · do ${dateLabel(invite.expiresAt)}`;

            const actions = document.createElement('div');
            actions.className = 'invite-actions';

            const linkButton = document.createElement('button');
            linkButton.type = 'button';
            linkButton.className = 'invite-link-button';
            linkButton.dataset.inviteId = invite.id;
            if (inviteLinks.has(invite.id)) {
                linkButton.dataset.copyInvite = 'true';
                linkButton.textContent = 'Kopírovat odkaz';
            } else {
                linkButton.dataset.regenerateInvite = 'true';
                linkButton.textContent = 'Vytvořit nový odkaz';
            }

            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'danger-button';
            cancel.dataset.inviteId = invite.id;
            cancel.textContent = 'Zrušit pozvánku';

            actions.append(linkButton, cancel);
            row.append(text, actions);
            pending.appendChild(row);
        });

        if (highlightedId) {
            pending.querySelector(`[data-invite-id="${CSS.escape(highlightedId)}"]`)?.closest('.invite-row')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    async function refreshPending(highlightedId = null) {
        const response = await fetch('/api/admin-users', { cache: 'no-store' });
        const data = await readJson(response);
        if (!response.ok) throw new Error('Pozvánky se nepodařilo načíst.');
        renderPending(Array.isArray(data.invites) ? data.invites : [], highlightedId);
    }

    document.addEventListener('submit', async (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || form.id !== 'invite-user-form') return;

        event.preventDefault();
        event.stopImmediatePropagation();
        showMessage('Vytvářím pozvánku…');

        const response = await fetch('/api/admin-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'invite',
                displayName: document.querySelector('#invite-name')?.value.trim(),
                email: document.querySelector('#invite-email')?.value.trim(),
                role: document.querySelector('#invite-role')?.value,
            }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            showMessage(data.error === 'USER_EXISTS' ? 'Uživatel s tímto e-mailem už existuje.' : 'Pozvánku se nepodařilo vytvořit.');
            return;
        }

        inviteLinks.set(data.invite.id, data.invite.inviteUrl);
        form.reset();
        showMessage('Pozvánka byla vytvořena. Odkaz je připravený ke zkopírování níže.');
        try {
            await refreshPending(data.invite.id);
        } catch (error) {
            showMessage(error.message || 'Pozvánka byla vytvořena, ale seznam se nepodařilo obnovit.');
        }
    }, true);

    document.addEventListener('click', async (event) => {
        const copyButton = event.target.closest('[data-copy-invite]');
        if (copyButton) {
            event.preventDefault();
            event.stopImmediatePropagation();
            await copyInvite(copyButton.dataset.inviteId, copyButton);
            return;
        }

        const regenerateButton = event.target.closest('[data-regenerate-invite]');
        if (!regenerateButton) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        regenerateButton.disabled = true;
        regenerateButton.textContent = 'Vytvářím…';
        showMessage('Vytvářím nový odkaz a ruším platnost starého…');

        const response = await fetch('/api/admin-invites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'regenerate', id: regenerateButton.dataset.inviteId }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            regenerateButton.disabled = false;
            regenerateButton.textContent = 'Vytvořit nový odkaz';
            showMessage(data.error === 'INVITE_NOT_FOUND' ? 'Pozvánka už neexistuje.' : 'Nový odkaz se nepodařilo vytvořit.');
            return;
        }

        inviteLinks.set(data.invite.id, data.invite.inviteUrl);
        showMessage('Nový odkaz byl vytvořen. Starý odkaz už neplatí.');
        try {
            await refreshPending(data.invite.id);
        } catch (error) {
            showMessage(error.message || 'Odkaz byl vytvořen, ale seznam se nepodařilo obnovit.');
        }
    }, true);

    if (pending) {
        const observer = new MutationObserver(() => {
            const rows = Array.from(pending.querySelectorAll('.invite-row'));
            if (!rows.length || rows.every((row) => row.querySelector('.invite-actions'))) return;

            rows.forEach((row) => {
                if (row.querySelector('.invite-actions')) return;
                const cancel = row.querySelector('.danger-button[data-invite-id]');
                if (!cancel) return;
                const inviteId = cancel.dataset.inviteId;
                const actions = document.createElement('div');
                actions.className = 'invite-actions';
                const linkButton = document.createElement('button');
                linkButton.type = 'button';
                linkButton.className = 'invite-link-button';
                linkButton.dataset.inviteId = inviteId;
                if (inviteLinks.has(inviteId)) {
                    linkButton.dataset.copyInvite = 'true';
                    linkButton.textContent = 'Kopírovat odkaz';
                } else {
                    linkButton.dataset.regenerateInvite = 'true';
                    linkButton.textContent = 'Vytvořit nový odkaz';
                }
                cancel.replaceWith(actions);
                actions.append(linkButton, cancel);
            });
        });
        observer.observe(pending, { childList: true, subtree: true });
    }
})();
