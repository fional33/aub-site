(() => {
  const link = [...document.querySelectorAll('header nav a, header [aria-label="Primary"] a')]
    .find(a => a.textContent.trim().toUpperCase() === 'X FEED');
  if (!link) return;

  function scrollFour() {
    const step   = window.innerHeight;
    const total  = step * 4;
    const target = Math.min(
      window.scrollY + total,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
  }

  link.addEventListener('click', (e) => { e.preventDefault(); scrollFour(); }, { passive: false });
})();
