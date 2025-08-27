(() => {
  // >>>> SET THIS to the UTC midnight of DAY 01 (example below) <<<<
  const LAUNCH_UTC = '2025-08-25T00:00:00Z';

  const DAY_MS = 86400000;
  const $root = document.querySelector('.aub-day-odometer');
  if (!$root) return;

  // Use existing slot class exactly (preserves styled-jsx hash)
  const slotClass = ($root.querySelector('.slot') || {}).className || 'slot';

  function calcDay() {
    const t0 = Date.parse(LAUNCH_UTC);
    if (isNaN(t0)) return 1;
    // Day count in LOCAL time, rounded like “day 01” starts at local midnight after LAUNCH_UTC
    const now = Date.now();
    const day = Math.floor((now - t0) / DAY_MS) + 1;
    return Math.max(1, day);
  }

  function ensureSlots(nDigits) {
    let slots = Array.from($root.querySelectorAll('.slot'));
    while (slots.length < nDigits) {
      const clone = (slots[0] || document.createElement('span')).cloneNode(true);
      clone.className = slotClass;
      clone.textContent = '0';
      $root.prepend(clone);
      slots = Array.from($root.querySelectorAll('.slot'));
    }
    return slots;
  }

  // Quick shuffle effect then settle on target
  function shuffleTo(target) {
    const str = String(target).padStart(2, '0');       // at least 2 digits
    const slots = ensureSlots(str.length);

    const frames = 10, step = 55; // ~550ms total
    let i = 0;
    $root.classList.add('rolling'); // uses existing CSS glow

    const jitter = setInterval(() => {
      // random spin
      slots.forEach(s => (s.textContent = Math.floor(Math.random() * 10)));
      if (++i >= frames) {
        clearInterval(jitter);
        // set final digits (align right)
        const start = slots.length - str.length;
        slots.forEach((s, idx) => {
          const d = idx >= start ? str[idx - start] : '0';
          s.textContent = d;
        });
        setTimeout(() => $root.classList.remove('rolling'), 240);
      }
    }, step);
  }

  function updateNowAndSchedule() {
    shuffleTo(calcDay());

    // schedule next local midnight update
    const now = new Date();
    const next = new Date(now);
    next.setHours(24,0,0,0);
    const wait = Math.max(1000, next - now + 1000);
    setTimeout(updateNowAndSchedule, wait);
  }

  window.addEventListener('DOMContentLoaded', updateNowAndSchedule);
})();
