(() => {
  // ----- CONFIG: UTC launch moment -----
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
    || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  // Wipe any leftover static markup that might overlap/blur
  while (root.firstChild) root.removeChild(root.firstChild);

  ensureCSS();

  // ---------- DOM builders ----------
  function buildReel() {
    const reel = document.createElement('span');
    reel.className = 'aub-reel';
    // 0..9 twice so we can land on the second cycle (avoids jump)
    for (let r = 0; r < 2; r++) {
      for (let d = 0; d <= 9; d++) {
        const cell = document.createElement('span');
        cell.className = 'aub-cell';
        cell.textContent = d;
        reel.appendChild(cell);
      }
    }
    return reel;
  }

  function ensureSlots(count) {
    let slots = Array.from(root.querySelectorAll('.aub-slot'));
    const need = count - slots.length;
    for (let i = 0; i < need; i++) {
      const slot = document.createElement('span');
      slot.className = 'aub-slot';
      slot.setAttribute('aria-hidden', 'true');
      slot.appendChild(buildReel());                // <-- guarantees firstChild
      root.prepend(slot);                           // prepend to keep leftmost = most significant
    }
    slots = Array.from(root.querySelectorAll('.aub-slot'));
    // Repair any slot that somehow lost its reel
    for (const slot of slots) {
      const reel = slot.firstElementChild;
      if (!reel || !reel.classList.contains('aub-reel')) {
        slot.innerHTML = '';
        slot.appendChild(buildReel());
      }
    }
    return slots;
  }

  // ---------- Layout helpers ----------
  function cellHeight(slot) {
    const c = slot.querySelector('.aub-cell');
    const h = c ? c.getBoundingClientRect().height : 0;
    return Math.max(1, Math.round(h)); // integer px to avoid subpixel blur
  }

  // Move a reel to a digit (uses the second 0..9 cycle: +10)
  function setReel(slot, digit, immediate = false) {
    const reel = slot.querySelector('.aub-reel');
    if (!reel) return; // safety guard
    const h = cellHeight(slot);
    const off = h * (((digit % 10) + 10) % 10 + 10); // 10..19
    if (immediate) {
      reel.style.transition = 'none';
      reel.style.transform  = `translate3d(0, ${-off}px, 0)`;
      // force reflow then restore transition
      // eslint-disable-next-line no-unused-expressions
      reel.offsetHeight;
      reel.style.transition = '';
    } else {
      reel.style.transform  = `translate3d(0, ${-off}px, 0)`;
    }
  }

  // ---------- Shuffle animation ----------
  function scrambleThenReveal(target) {
    const str   = String(target);
    const slots = ensureSlots(str.length);
    const final = str.padStart(slots.length, '0').split('').map(n => +n);

    // Init each reel to a valid transform so transitions apply
    slots.forEach(s => setReel(s, Math.floor(Math.random() * 10), true));

    // Phase A: smooth random scramble (GPU-friendly transform only)
    const A_MS = 900; // fast but smooth
    const t0   = performance.now();
    const easeOut = t => 1 - Math.pow(1 - t, 3);

    function tick(now) {
      const t = Math.min(1, (now - t0) / A_MS);
      const v = easeOut(t); // velocity factor (decelerates)
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        if (!reel) continue;
        const h    = cellHeight(slot);
        // base = exact digit line, noise = random additional pixels
        const base = h * 10; // start from 0 at second cycle
        const noise = (50 + Math.random() * 120) * (1 - (0.15 * i)) * v; // slight stagger by slot
        reel.style.transform = `translate3d(0, ${-(base + noise)}px, 0)`;
      }
      if (t < 1) requestAnimationFrame(tick);
      else settle();
    }

    // Phase B: three soft ticks into the final digit
    function settle() {
      const TICKS = 3;
      const STEP  = 110; // ms between ticks (overall settle ~ 0.5–0.6s)
      slots.forEach((slot, i) => {
        const fd = final[i];
        for (let k = 0; k <= TICKS; k++) {
          const d = (fd - (TICKS - k) + 20) % 10; // fd-3, fd-2, fd-1, fd
          const delay = STEP * (k + 1) * (1 + i * 0.08); // tiny stagger by slot
          setTimeout(() => setReel(slot, d), delay);
        }
      });
    }

    requestAnimationFrame(tick);
  }

  // ---------- Day calc + schedule ----------
  function daySinceLaunch() {
    const ms = Date.now() - LAUNCH_UTC.getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }

  function updateDay() {
    const day = daySinceLaunch();
    const label = String(day).padStart(2, '0');
    root.setAttribute('aria-label', `DAY ${label}`);
    scrambleThenReveal(label);
  }

  // Initial render
  updateDay();

  // Next UTC midnight, then every 24h
  (function scheduleMidnight() {
    const n = new Date();
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0));
    setTimeout(() => { updateDay(); setInterval(updateDay, 86400000); }, next - n);
  })();

  // Console helper
  window.AUB_SHUFFLE = (n) => scrambleThenReveal(String(n).padStart(2, '0'));

  // ---------- Styles (scoped) ----------
  function ensureCSS() {
    if (document.getElementById('aub-odo-css')) return;
    const css = `
.aub-day-odometer{display:inline-flex;gap:.08em;align-items:center;
  font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.aub-day-odometer .aub-slot{position:relative;display:inline-block;
  width:.7em;height:1.1em;overflow:hidden;border-radius:.08em;background:#000}
.aub-day-odometer .aub-reel{display:block;will-change:transform;
  transform:translate3d(0,0,0);transition:transform 140ms cubic-bezier(.2,.7,.2,1)}
.aub-day-odometer .aub-cell{display:flex;align-items:center;justify-content:center;
  width:100%;height:1.1em;font-weight:700;font-size:1.2em;line-height:1.1;
  color:#f4f8ff;text-shadow:0 0 6px rgba(216,234,255,.55),0 0 16px rgba(64,160,255,.35)}
/* subtle trap-door shading top/bottom; full black body, grayish edges */
.aub-day-odometer .aub-slot::before,
.aub-day-odometer .aub-slot::after{content:"";position:absolute;left:0;width:100%;
  height:50%;pointer-events:none}
.aub-day-odometer .aub-slot::before{top:0;background:linear-gradient(#000,rgba(0,0,0,.65))}
.aub-day-odometer .aub-slot::after{bottom:0;background:linear-gradient(rgba(0,0,0,.65),#000)}
`;
    const style = document.createElement('style');
    style.id = 'aub-odo-css';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
