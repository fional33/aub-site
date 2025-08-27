(() => {
  const ROOT_SEL = '.aub-day-odometer';
  const SLOT_CLASS = 'slot';
  const DEFAULT_LAUNCH = '2025-08-25T00:00:00Z';
  const DAY_MS = 864e5;

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  let lastValue = null;
  let timeouts = [];
  let raf = 0;

  function getLaunchUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content?.trim();
    const s = meta || (window.AUB_LAUNCH_UTC || DEFAULT_LAUNCH);
    const d = new Date(s);
    return isNaN(d) ? new Date(DEFAULT_LAUNCH) : d;
  }

  function calcDayNow() {
    const launch = getLaunchUTC().getTime();
    const now = Date.now();
    const diff = Math.floor((now - launch) / DAY_MS) + 1;
    return Math.max(1, diff);
  }

  function ensureSlots(root, count) {
    let slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    while (slots.length < count) {
      const s = document.createElement('span');
      s.className = SLOT_CLASS;
      s.textContent = '0';
      root.prepend(s);
      slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    }
    while (slots.length > count) {
      slots.shift().remove();
      slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    }
    return slots;
  }

  function clearTimers() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    timeouts.forEach(id => clearTimeout(id));
    timeouts = [];
  }

  // Faster, more "shuffly" scramble + short slow reveal
  function shuffleTo(target) {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;

    const finalStr = String(target);
    const slots = ensureSlots(root, finalStr.length);
    const finalDigits = finalStr.padStart(slots.length, '0').split('').map(n => +n);

    clearTimers();

    // Phase A: quick random scramble (desynced per slot)
    const SCRAMBLE_MS = 1000;
    const MIN_IVL = 18;
    const MAX_IVL = 100;
    const start = performance.now();
    const last = new Array(slots.length).fill(0);

    function scramble(now) {
      const t = Math.min(1, (now - start) / SCRAMBLE_MS);
      const ivl = MIN_IVL + (MAX_IVL - MIN_IVL) * easeOutCubic(t);

      slots.forEach((el, i) => {
        const jitter = Math.random() * 50 + i * 7;
        if (now - last[i] >= ivl + jitter) {
          el.textContent = (Math.random() * 10) | 0;
          last[i] = now;
        }
      });

      if (t < 1) { raf = requestAnimationFrame(scramble); }
      else settle();
    }

    // Phase B: 3 fake ticks that slow down, then reveal
    function settle() {
      const STEPS = 4;   // 3 pre-final + final
      const BASE = 60;   // quick-ish base
      const GROW = 1.5;  // slows each tick
      slots.forEach((el, i) => {
        const seq = [];
        for (let k = 0; k < STEPS - 1; k++) {
          let d;
          do { d = (Math.random() * 10) | 0; } while (d === finalDigits[i]);
          seq.push(d);
        }
        seq.push(finalDigits[i]);

        let delay = BASE + i * 25; // slight per-digit stagger
        seq.forEach(d => {
          const id = setTimeout(() => { el.textContent = d; }, Math.round(delay));
          timeouts.push(id);
          delay *= GROW;
        });
      });
    }

    requestAnimationFrame(scramble);
  }

  function render() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;
    const day = calcDayNow();
    if (day === lastValue) return;
    const label = 'DAY ' + String(day).padStart(2, '0');
    root.setAttribute('aria-label', label);
    shuffleTo(day);
    lastValue = day;
  }

  function msToNextMidnightUTC() {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0
    ));
    return next - now;
  }

  function scheduleRollover() {
    setTimeout(() => { lastValue = null; render(); scheduleRollover(); }, msToNextMidnightUTC() + 5);
  }

  function init() {
    render();
    setInterval(render, 60 * 1000); // safety check
    scheduleRollover();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
