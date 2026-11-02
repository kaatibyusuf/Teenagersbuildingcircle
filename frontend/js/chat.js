/* Live chat with staff (Tawk.to, free)
   Paste your Tawk.to IDs below. While PROPERTY_ID is empty, this file does nothing.

   Where to find them: Tawk.to dashboard → Administration (gear) → Chat Widget.
   The "Direct Chat Link" looks like https://tawk.to/chat/PROPERTY_ID/WIDGET_ID
   For Arabic, add a second widget (Chat Widget → Add widget, language Arabic) and paste its ID as WIDGET_AR.

   On pages with the green "Chat with us" button, live chat is added to that menu and the Tawk bubble
   stays hidden until a chat is open or staff reply. On other pages the Tawk bubble shows normally. */
(function () {
  var PROPERTY_ID = '6adbb5ba40fa183474c62b87';
  var WIDGET_EN = '1k5l3rp1h';
  var WIDGET_AR = '';            // optional; leave empty to use the English widget for both languages

  if (!PROPERTY_ID || !WIDGET_EN) return;

  var root = document.documentElement;
  var isAr = function () { return root.getAttribute('lang') === 'ar'; };
  var widgetFor = function () { return isAr() && WIDGET_AR ? WIDGET_AR : WIDGET_EN; };
  var current = widgetFor();
  var inMenu = false, ready = false;

  var T = window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();

  var api = function (name) { try { if (typeof T[name] === 'function') return T[name].apply(T, [].slice.call(arguments, 1)); } catch (e) {} };
  var ongoing = function () { return !!api('isChatOngoing'); };
  var hideIfIdle = function () { if (inMenu && !ongoing()) api('hideWidget'); };

  T.onLoad = function () { ready = true; hideIfIdle(); };
  T.onChatMinimized = function () { setTimeout(hideIfIdle, 300); };
  T.onChatEnded = function () { setTimeout(hideIfIdle, 300); };
  T.onUnreadCountChanged = function (n) { if (n > 0) api('showWidget'); };

  function open() {
    api('showWidget'); api('maximize');
    var w = document.getElementById('waWidget'), b = document.getElementById('waBtn');
    if (w) w.classList.remove('open');
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  // add "Live chat" to the green "Chat with us" menu
  function addToMenu() {
    var menu = document.getElementById('waMenu');
    if (!menu || menu.querySelector('.wa-live')) return;
    inMenu = true;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'wa-live';
    b.innerHTML = '<span>Live chat</span><small>Talk to us here, now</small>';
    b.addEventListener('click', function (e) { e.stopPropagation(); if (ready) open(); else { T.onLoad = function () { ready = true; open(); }; } });
    menu.insertBefore(b, menu.firstChild);
    if (ready) hideIfIdle();
  }

  function load() {
    addToMenu();
    var s = document.createElement('script');
    s.async = true; s.charset = 'UTF-8'; s.setAttribute('crossorigin', '*');
    s.src = 'https://embed.tawk.to/' + PROPERTY_ID + '/' + current;
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();

  // the site's language switch: move to the Arabic or English widget without reloading
  new MutationObserver(function () {
    var want = widgetFor();
    if (want === current || !ready) return;
    current = want;
    api('switchWidget', { propertyId: PROPERTY_ID, widgetId: want }, function () { hideIfIdle(); });
  }).observe(root, { attributes: true, attributeFilter: ['lang'] });
})();
