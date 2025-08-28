(function () {
  var Y = 2490; // <— change this number to move the landing spot
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a');
    if (!a) return;
    var txt = (a.textContent || '').trim();
    if (/^X\s*FEED$/i.test(txt) || a.dataset.xfeed === '1') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      window.scrollTo({ top: Y, behavior: 'smooth' });
    }
  }, { capture: true, passive: false });

  // Quick helper to retune without editing files:
  window.AUB_SET_XFEED_Y = function (n) { Y = +n || 0; console.log('X FEED →', Y); };
})();
