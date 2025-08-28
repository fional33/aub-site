(function () {
  function headerOffset() {
    var h = document.querySelector('header[role="banner"], header.sticky, header');
    return h ? h.getBoundingClientRect().height : 0;
  }
  function findTarget() {
    return document.getElementById('xfeed') ||
           document.querySelector('#xfeed,[data-xfeed],.aub-xfeed,.twitter-timeline,iframe[src*="x.com"],iframe[src*="twitter.com"]') ||
           document.body;
  }
  var EXTRA = 8; // fine-tune landing in px; change with AUB_XFEED_OFFSET(n)
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a');
    if (!a) return;
    var href = (a.getAttribute('href') || '').trim();
    var txt  = (a.textContent || '').trim();
    var isX  = /^X\s*FEED$/i.test(txt) || href === '#xfeed';
    if (!isX) return;

    ev.preventDefault();
    ev.stopImmediatePropagation();

    var t = findTarget();
    var y = t.getBoundingClientRect().top + window.pageYOffset - headerOffset() - EXTRA;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }, { capture: true, passive: false });

  // Dev helpers:
  window.AUB_XFEED_OFFSET   = function (px) { EXTRA = +px || 0; console.log('XFEED offset =', EXTRA); };
  window.AUB_XFEED_SELECTOR = function (sel) {
    var el = document.querySelector(sel);
    if (el) { document.getElementById('xfeed') || el.insertAdjacentHTML('beforebegin','<div id="xfeed"></div>'); console.log('Pinned XFEED to', sel); }
    else { console.warn('Selector not found:', sel); }
  };
})();
