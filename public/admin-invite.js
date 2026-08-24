const params = new URLSearchParams(window.location.search);
const token = params.get('token') || '';
const loading = document.querySelector('#invite-loading');
const content = document.querySelector('#invite-content');
const message = document.querySelector('#invite-message');
const form = document.querySelector('#accept-invite-form');

function roleLabel(role) {
    return { admin: 'Administrátor', sales: 'Prodej', accountant: 'Účetní' }[role] || role || '—';
}

function showMessage(text) {
    message.textContent = text || '';
    message.hidden = !text;
}

async function readJson(response) {
    return response.json().catch(() => ({}));
}

async function loadInvite() {
    if (!token) {
        loading.textContent = 'Pozvánka není platná.';
        return;
    }
    try {
        const response = await fetch(`/api/admin-accept-invite?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const data = await readJson(response);
        if (!response.ok) throw new Error('Pozvánka není platná nebo už vypršela.');
        document.querySelector('#invite-name').textContent = data.invite.displayName;
        document.querySelector('#invite-email').textContent = data.invite.email;
        document.querySelector('#invite-role').textContent = `Role: ${roleLabel(data.invite.role)}`;
        loading.hidden = true;
        content.hidden = false;
    } catch (error) {
        loading.textContent = error.message || 'Pozvánku se nepodařilo ověřit.';
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.querySelector('#invite-password').value;
    const confirmation = document.querySelector('#invite-password-confirm').value;
    if (password !== confirmation) {
        showMessage('Hesla se neshodují.');
        return;
    }
    showMessage('Vytvářím účet…');
    try {
        const response = await fetch('/api/admin-accept-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            if (data.error === 'PASSWORD_TOO_SHORT') throw new Error('Heslo musí mít alespoň 12 znaků.');
            if (data.error === 'INVITE_INVALID') throw new Error('Pozvánka není platná nebo už vypršela.');
            throw new Error('Účet se nepodařilo vytvořit.');
        }
        showMessage('Účet byl vytvořen. Přesměrovávám do administrace…');
        window.setTimeout(() => { window.location.href = 'admin.html'; }, 700);
    } catch (error) {
        showMessage(error.message || 'Účet se nepodařilo vytvořit.');
    }
});

loadInvite();
