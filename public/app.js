// Checkout uses the language of the last storefront page visited.
try {
    localStorage.setItem('maminko-lang', document.documentElement.lang);
} catch {
    // The public pages also work when browser storage is unavailable.
}

async function showPromotion() {
    const response = await fetch('/api/checkout-config', { cache: 'no-store' });
    if (!response.ok) return;
    const { promotion, prices } = await response.json();
    if (!promotion?.active) return;
    const banner = document.querySelector('#sale-banner');
    banner.textContent = document.documentElement.lang === 'cs'
        ? `Black Friday · Sleva ${promotion.percent} % na knihu i kompletní balíček`
        : `Black Friday · Знижка ${promotion.percent}% на книжку та повний комплект`;
    banner.hidden = false;
    document.querySelector('#regular-intro-price').hidden = true;
    const hero = document.querySelector('#sale-hero');
    hero.querySelector('strong').textContent = prices.print + ' Kč';
    hero.hidden = false;
    for (const element of document.querySelectorAll('[data-sale-price]')) {
        const previous = document.createElement('del');
        previous.textContent = element.textContent;
        element.replaceChildren(previous, ' ' + prices[element.dataset.salePrice] + ' Kč');
    }
}

showPromotion().catch(() => {});
