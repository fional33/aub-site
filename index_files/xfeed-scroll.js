(() => {
  const Y = 2490; // <— change this number anytime
  function wire() {
    const link = [...document.querySelectorAll('nav a')].find(a => /X\s*FEED/i.test(a.textContent || ''));
    if (!link) return;
    link.setAttribute('href', '#');
    link.addEventListener('click', e => {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.scrollTo({ top: Y, behavior: 'smooth' });
    }, { capture: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
  else wire();
})();
