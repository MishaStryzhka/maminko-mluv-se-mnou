const viewer = document.querySelector('#sample-viewer');
const samples = [...document.querySelectorAll('#samples .gallery-pages > a')];
const stage = viewer.querySelector('.viewer-stage');
const photo = stage.querySelector('img');
const previous = viewer.querySelector('[data-prev]');
const next = viewer.querySelector('[data-next]');
const smaller = viewer.querySelector('[data-less]');
const larger = viewer.querySelector('[data-more]');
const pointers = new Map();
let index = 0;
let zoom = 1;
let x = 0;
let y = 0;
let swipeStart;

function clamp(value, limit) {
    return Math.max(-limit, Math.min(value, limit));
}

function paint() {
    x = clamp(x, Math.max(0, (photo.offsetWidth * zoom - stage.clientWidth) / 2));
    y = clamp(y, Math.max(0, (photo.offsetHeight * zoom - stage.clientHeight) / 2));
    photo.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${zoom})`;
    smaller.disabled = zoom <= 1;
    larger.disabled = zoom >= 4;
}

function show(i) {
    index = i;
    photo.src = samples[i].href;
    photo.alt = samples[i].querySelector('img').alt;
    viewer.querySelector('output').textContent = `${i + 1} / ${samples.length}`;
    previous.disabled = i === 0;
    next.disabled = i === samples.length - 1;
    zoom = 1;
    x = y = 0;
    swipeStart = null;
    paint();
}

samples.forEach((link, i) => link.addEventListener('click', event => {
    event.preventDefault();
    viewer.showModal();
    show(i);
}));
previous.onclick = () => show(index - 1);
next.onclick = () => show(index + 1);
viewer.querySelector('[data-close]').onclick = () => viewer.close();
viewer.onclose = () => { pointers.clear(); swipeStart = null; };
viewer.onkeydown = event => {
    if (event.key === 'ArrowLeft' && !previous.disabled) previous.click();
    if (event.key === 'ArrowRight' && !next.disabled) next.click();
};

function changeZoom(value, oldCenter, newCenter = oldCenter) {
    const bounds = stage.getBoundingClientRect();
    const cx = bounds.left + bounds.width / 2;
    const cy = bounds.top + bounds.height / 2;
    const scale = Math.max(1, Math.min(4, value));
    if (oldCenter) {
        x = newCenter.x - cx - (oldCenter.x - cx - x) * scale / zoom;
        y = newCenter.y - cy - (oldCenter.y - cy - y) * scale / zoom;
    } else {
        x *= scale / zoom;
        y *= scale / zoom;
    }
    zoom = scale;
    paint();
}
smaller.onclick = () => changeZoom(zoom / 1.5);
larger.onclick = () => changeZoom(zoom * 1.5);
photo.onload = paint;
window.addEventListener('resize', () => { if (viewer.open) paint(); });

function pinch() {
    const [a, b] = pointers.values();
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
}
stage.onpointerdown = event => {
    if (event.button !== 0 || pointers.size >= 2) return;
    const point = { x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point);
    swipeStart = pointers.size === 1 && zoom === 1 ? point : null;
};
stage.onpointermove = event => {
    const old = pointers.get(event.pointerId);
    if (!old) return;
    const before = pointers.size === 2 ? pinch() : null;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (before && before.distance > 0) {
        const after = pinch();
        changeZoom(zoom * after.distance / before.distance, before, after);
    } else if (zoom > 1) {
        x += event.clientX - old.x;
        y += event.clientY - old.y;
        paint();
    }
};
stage.onpointerup = event => {
    if (!pointers.delete(event.pointerId) || !swipeStart) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        (dx < 0 ? next : previous).click();
    }
};
stage.onlostpointercapture = event => {
    pointers.delete(event.pointerId);
    swipeStart = null;
};
