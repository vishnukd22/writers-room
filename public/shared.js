// Shared helpers for the TV and the phones.
window.W = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let offset = 0;
  const syncClock = (t) => { offset = t - Date.now(); };
  const now = () => Date.now() + offset;
  const left = (t) => (t ? Math.max(0, t - now()) : 0);
  const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  let manifest = { img: [], music: [], sfx: [] };
  const ready = fetch('/assets-manifest').then((r) => r.json()).then((m) => { manifest = m; return m; }).catch(() => manifest);
  const img = (name) => (manifest.img.includes(`${name}.png`) ? `/assets/img/${name}.png` : manifest.img.includes(`${name}.jpg`) ? `/assets/img/${name}.jpg` : manifest.img.includes(`${name}.webp`) ? `/assets/img/${name}.webp` : null);
  const bustSrc = (n, small) => (small && img(`t-bust-${String(n).padStart(2, '0')}`)) || img(`bust-${String(n).padStart(2, '0')}`);
  const thumb = (name) => img(`t-${name}`) || img(name);
  // A character portrait: the generated bust if we have it, otherwise a drawn stand-in.
  const bust = (c, size = '') => {
    if (!c) return '';
    const src = bustSrc(c.bust, !/lg|xl/.test(size));
    if (src) return `<span class="bust ${size}" style="--c:${c.color || '#E07A3F'}"><img src="${src}" alt=""></span>`;
    return `<span class="bust drawn ${size}" style="--c:${c.color || '#E07A3F'}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="40" r="20" fill="#F6EAD4" opacity=".92"/><path d="M14 100c4-24 18-36 36-36s32 12 36 36z" fill="#F6EAD4" opacity=".92"/></svg><b>${esc(initials(c.name))}</b></span>`;
  };
  return { esc, syncClock, now, left, initials, ready, img, thumb, bustSrc, bust, manifest: () => manifest };
})();

window.mount = (el, html) => { if (el.__html !== html) { el.innerHTML = html; el.__html = html; return true; } return false; };

(function tick() {
  document.querySelectorAll('[data-ends]').forEach((el) => {
    const ms = W.left(Number(el.dataset.ends));
    if (el.dataset.kind === 'bar') el.style.transform = `scaleX(${Math.min(1, ms / Number(el.dataset.total || 1))})`;
    else el.textContent = Math.ceil(ms / 1000);
  });
  requestAnimationFrame(tick);
})();
