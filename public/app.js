// Checkout uses the language of the last storefront page visited.
try {
    localStorage.setItem('maminko-lang', document.documentElement.lang);
} catch {
    // The public pages also work when browser storage is unavailable.
}
