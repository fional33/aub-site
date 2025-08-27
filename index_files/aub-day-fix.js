/* AUB day odometer — smooth randomizer + glow + UTC midnight rollover */
(() => {
  // ---------- CONFIG ----------
  const SEL = '.aub-day-odometer';         // your odometer container
  const MIN_DIGITS = 2;                    // always show at least NN
  const SCRAMBLE_MS = 1400;                // duration of random scramble
  const LAST_TICKS = 4;                    // 3 pre-final + final
  const MIN_INTERVAL = 35;                 // fastest scramble tick (ms)
  const MAX_INTERVAL = 170;                // slowest scramble tick (ms)
  const JITTER_MS = 28;                    // de-sync per slot
  const FINAL_TICK_BASE = 110;             // first slow tick delay (ms)
  const FINAL_TICK_GROW = 1.65;            // successive delay multiplier

  // ---------- helpers ----------
  const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const prefersReduced = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function injectStyles() {
    if (document.getElementById('aub-day-roller-css')) return;
    const css = `
      :root {
        --aub-slot-w: 52px;   /* width of each digit (after your prior shrink) */
        --aub-slot-h: 75px;   /* height of each digit */
        --aub-font:   54px;   /* font size */
        --aub-gap:     4px;   /* gap between digits */
        --aub-fg:    #f8f8f8; /* digit color */
        --aub-bg:    #000;    /* slot background */
        --aub-glow1: rgba(255,255,255,.85);
        --aub-glow2: rgba(156,206,255,.55);
      }
      ${SEL} {
        display:inline-flex;
        align-items:center;
        gap: var(--aub-gap);
        contain: content;
        user-select:none;
        -webkit-tap-highlight-color: transparent;
      }
      ${SEL} .aub-slot {
        position: relative;
        width: var(--aub-slot-w);
        height: var(--aub-slot-h);
        background: var(--aub-bg);
        border-radius: 8px;
        overflow: hidden;              /* no bleed = no second layer visible */
        display:flex; align-items:center; justify-content:center;
        will-change: contents, filter, transform;
        transform: translateZ(0);      /* crisp text on GPU layer */
      }
      ${SEL} .aub-digit {
        font-size: var(--aub-font);
        line-height: 1;
        font-weight: 800;
        color: var(--aub-fg);
        font-variant-numeric: tabular-nums;
        font-feature-settings: "tnum" 1;
        letter-spacing: 0;
        text-shadow:
          0 0 6px  var(--aub-glow1),
          0 0 14px var(--aub-glow2),
          0 0 22px var(--aub-glow2);
        will-change: text-shadow, transform;
        transform: translateZ(0);
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      /* slightly stronger glow during scramble, then snaps clean on final */
      ${SEL}.is-scrambling .aub-digit {
        text-shadow:
          0 0 8px  var(--aub-glow1),
          0 0 18px var(--aub-glow2),
          0 0 26px var(--aub-glow2);
        filter: drop-shadow(0 0 1px rgba(255,255,255,.25));
      }
      ${SEL}.is-final .aub-digit {
        text-shadow:
          0 0 5px var(--aub-glow1),
          0 0 12px var(--aub-glow2);
        filter: none;
      }
    `;
    const s = document.createElement('style');
    s.id = 'aub-day-roller-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function readLaunchUTC() {
    const fromMeta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const fromWin  = window.AUB_LAUNCH_UTC;
    return new Date(fromMeta || fromWin || '2025-08-25T00:00:00Z');
  }

  function daysSinceLaunchUTC(launch) {
    // Floor to whole UTC days since launch, then +1 so launch day = 01
    const now = new Date();
    const ms = Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
    ) - Date.UTC(
      launch.getUTCFullYear(), launch.getUTCMonth(), launch.getUTCDate()
    );
    return Math.floor(ms / 86400000) + 1;
  }

  function rebuildSlots(root, digits) {
    root.innerHTML = ''; // nuke any previous/static layers
    const frag = document.createDocumentFragment();
    for (let i = 0; i < digits; i++) {
      const slot = document.createElement('span');
      slot.className = 'aub-slot';
      const d = document.createElement('span');
      d.className = 'aub-digit';
      d.textContent = '0';
      slot.appendChild(d);
      frag.appendChild(slot);
    }
    root.appendChild(frag);
    return Array.from(root.querySelectorAll('.aub-digit'));
  }

  // Random scramble with easing → 3 slow ticks → final
  function shuffleTo(root, targetNumber) {
    if (prefersReduced()) {
      setDigits(root, targetNumber);
      return;
    }

    const finalStr = String(targetNumber);
    const digits = Math.max(MIN_DIGITS, finalStr.length);
    const els = rebuildSlots(root, digits);
    const final = finalStr.padStart(digits, '0').split('').map(n => +n);

    root.classList.add('is-scrambling');
    root.classList.remove('is-final');

    // Phase A — scramble with decelerating pace
    const start = performance.now();
    const lastTouch = new Array(digits).fill(0);
    function scramble(now) {
      const t = Math.min(1, (now - start) / SCRAMBLE_MS);
      const eased = easeOutExpo(t);
      const interval = MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * eased;

      for (let i = 0; i < digits; i++) {
        const jitter = Math.random() * JITTER_MS + i * 5; // slight stagger per slot
        if (now - lastTouch[i] >= interval + jitter) {
          let r = (Math.random() * 10) | 0;
          els[i].textContent = String(r);
          lastTouch[i] = now;
        }
      }
      if (t < 1) requestAnimationFrame(scramble);
      else settle();
    }

    // Phase B — 3 slow ticks per digit, then final
    function settle() {
      const delays = [];
      let acc = FINAL_TICK_BASE;
      for (let k = 0; k < LAST_TICKS - 1; k++) {
        delays.push(Math.round(acc));
        acc *= FINAL_TICK_GROW;
      }
      // one more for the final reveal
      delays.push(Math.round(acc));

      els.forEach((el, i) => {
        // choose distinct pre-final digits (not equal to final)
        const picks = [];
        for (let p = 0; p < LAST_TICKS - 1; p++) {
          let v;
          do { v = (Math.random() * 10) | 0; } while (v === final[i] || v === picks[p-1]);
          picks.push(v);
        }
        const laneDelay = i * 40; // slight cascade across lanes

        // schedule ticks
        picks.forEach((v, idx) => {
          setTimeout(() => { el.textContent = String(v); }, laneDelay + delays[idx]);
        });
        // final value
        setTimeout(() => {
          el.textContent = String(final[i]);
          if (i === digits - 1) {
            root.classList.remove('is-scrambling');
            root.classList.add('is-final');
          }
        }, laneDelay + delays[delays.length - 1]);
      });
    }

    requestAnimationFrame(scramble);
  }

  function setDigits(root, n) {
    const s = String(n);
    const digits = Math.max(MIN_DIGITS, s.length);
    const els = rebuildSlots(root, digits);
    const final = s.padStart(digits, '0');
    for (let i = 0; i < digits; i++) els[i].textContent = final[i];
    root.classList.add('is-final');
    root.classList.remove('is-scrambling');
  }

  function updateDay(root, launch) {
    const day = Math.max(1, daysSinceLaunchUTC(launch));
    root.setAttribute('aria-label', `DAY ${String(day).padStart(2, '0')}`);
    shuffleTo(root, day);
  }

  function scheduleMidnightUTC(cb) {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1, // next day midnight UTC
      0,0,0,0
    ));
    const wait = next.getTime() - now.getTime();
    setTimeout(() => { cb(); scheduleMidnightUTC(cb); }, wait);
  }

  // ---------- init ----------
  function init() {
    injectStyles();
    const root = document.querySelector(SEL);
    if (!root) return;

    const launch = readLaunchUTC();
    // First render
    updateDay(root, launch);
    // Rollover at UTC midnight
    scheduleMidnightUTC(() => updateDay(root, launch));

    // expose tiny debug helpers
    window.AUB_SHUFFLE = (n) => shuffleTo(root, n);
    window.AUB_SET = (n) => setDigits(root, n);
    window.AUB_UPDATE_DAY = () => updateDay(root, launch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
