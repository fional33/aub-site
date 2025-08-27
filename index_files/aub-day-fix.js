(() => {
  const SEL = '.aub-day-odometer';

  function getRoot() { return document.querySelector(SEL); }

  function hashClass(el) {
    return Array.from(el.classList).find(c => /^jsx-/.test(c)) || '';
  }

  function ensureSlots(root) {
    const sc = `slot ${hashClass(root)}`;
    let slots = Array.from(root.querySelectorAll('.slot'));
    while (slots.length < 2) {
      const s = document.createElement('span');
      s.className = sc;
      s.textContent = '0';
      root.appendChild(s);
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    return slots;
  }

  function launchUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]');
    const iso = meta?.content || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z');
    return new Date(iso);
  }

  function computeDay() {
    const now = new Date();
    const day = Math.max(1, Math.floor((now - launchUTC()) / 86400000) + 1);
    return Math.min(day, 99);
  }

  function setLabel(root, n) {
    root.setAttribute('aria-label', `DAY ${String(n).padStart(2, '0')}`);
  }

  function shuffleTo(root, n) {
    const digits = String(n).padStart(2, '0').split('');
    const slots = ensureSlots(root);
    const h = hashClass(root);
    root.classList.add('rolling', h);
    const duration = 700;
    const hops = [14, 20]; // left, right

    const start = performance.now();
    function tick(t) {
      const prog = Math.min(1, (t - start) / duration);
      slots.forEach((slot, i) => {
        if (prog < 1) {
          const step = Math.floor(prog * hops[i]);
          slot.textContent = String((step % 10));
        } else {
          slot.textContent = digits[i];
        }
      });
      if (prog < 1) requestAnimationFrame(tick);
      else root.classList.remove('rolling');
    }
    requestAnimationFrame(tick);
  }

  function apply({ animate } = { animate: true }) {
    const root = getRoot();
    if (!root) return;
    const n = computeDay();
    setLabel(root, n);
    if (animate) shuffleTo(root, n);
    else {
      const d = String(n).padStart(2, '0').split('');
      const [a, b] = ensureSlots(root);
      a.textContent = d[0]; b.textContent = d[1];
    }
  }

  function msUntilNextUtcMidnight() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    return next - now + 50;
  }

  // Run now, then at next UTC midnight (no animation on rollover)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => apply({ animate: true }));
  } else {
    apply({ animate: true });
  }
  setTimeout(() => apply({ animate: false }), msUntilNextUtcMidnight());

  // Minimal debug helpers
  window.AUB_SHUFFLE = () => apply({ animate: true });
  window.AUB_UPDATE  = () => apply({ animate: false });
})();
