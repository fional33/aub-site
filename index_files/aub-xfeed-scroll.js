(() => {
  const nav = document.querySelector('header [aria-label="Primary"]') || document.querySelector('header nav');
  const link = nav ? [...nav.querySelectorAll('a')].find(a => a.textContent.trim().toUpperCase() === 'X FEED') : null;
  const targetEl = document.getElementById('xfeed');

  if (!link || !targetEl) return;

  function scrollToXFeed() {
    const header = document.querySelector('header');
    const headerH = header ? header.getBoundingClientRect().height : 0;

    const yNow    = window.scrollY;
    const yTarget = Math.max(
      0,
      Math.round(targetEl.getBoundingClientRect().top + window.scrollY - headerH - 8)
    );

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { window.scrollTo(0, yTarget); return; }

    // animate in 4 equal segments, easing each segment (feels like 4 mouse wheels)
    const segments = 4;
    let seg = 0, yStart = yNow;

    function runSeg() {
      const segEnd = yNow + (yTarget - yNow) * ((seg + 1) / segments);
      const dur = 220; // ms per segment
      const t0 = performance.now();

      function tick(now) {
        const t = Math.min(1, (now - t0) / dur);
        // easeInOutQuad
        const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
        const y = yStart + (segEnd - yStart) * e;
        window.scrollTo(0, y);

        if (t < 1) { requestAnimationFrame(tick); }
        else {
          seg++; yStart = segEnd;
          if (seg < segments) requestAnimationFrame(runSeg);
        }
      }
      requestAnimationFrame(tick);
    }

    if (Math.abs(yTarget - yNow) > 2) requestAnimationFrame(runSeg);
  }

  link.addEventListener('click', (e) => { e.preventDefault(); scrollToXFeed(); }, { passive: false });
})();
