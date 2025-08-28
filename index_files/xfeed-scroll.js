(function () {
  // Auto-find the X FEED block on the page:
  function findTarget() {
    var sel = [
      '#xfeed','[data-xfeed]','.aub-xfeed','#feed','#timeline',
      '.twitter-timeline','iframe[src*="x.com"]','iframe[src*="twitter.com"]'
    ];
    for (var i=0;i<sel.length;i++){ var el=document.querySelector(sel[i]); if(el) return el; }
    // fallback: a heading that says “X FEED”
    var h = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).find(
      el => /X\s*FEED/i.test(el.textContent||'')
    );
    return h || document.body;
  }

  function headerOffsetPx(){
    var h = document.querySelector('header[role="banner"], header.sticky, header');
    return h ? h.getBoundingClientRect().height : 0;
  }

  var EXTRA_OFFSET = 10;         // fine tune landing (px)
  var TARGET = findTarget();

  // Intercept header link clicks early (works even if other scripts attach later)
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a');
    if (!a) return;
    var txt = (a.textContent||'').trim();
    var isX = /^X\s*FEED$/i.test(txt) || /#xfeed\b/i.test(a.getAttribute('href')||'') || a.dataset.xfeed === '1';
    if (!isX) return;

    ev.preventDefault();
    ev.stopImmediatePropagation();

    // re-locate in case DOM changed
    TARGET = TARGET && document.contains(TARGET) ? TARGET : findTarget();

    var y = TARGET.getBoundingClientRect().top + window.pageYOffset - headerOffsetPx() - EXTRA_OFFSET;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }, { capture: true, passive: false });

  // Dev helpers in console:
  window.AUB_SET_XFEED_OFFSET = function(px){ EXTRA_OFFSET = +px||0; console.log('XFEED offset =', EXTRA_OFFSET); };
  window.AUB_SET_XFEED_SELECTOR = function(sel){ var el=document.querySelector(sel); if(el){ TARGET=el; console.log('XFEED target =', sel);} else {console.warn('Selector not found:', sel);} };
})();
