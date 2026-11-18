/* Student portal layout (portal-shell.js).
 *
 * Add to a student dashboard:   <link rel="stylesheet" href="css/portal-shell.css">
 *                               <script>window.PORTAL_SHELL = { ... };</script>   (see the four dashboards for the settings)
 *                               <script src="js/portal-shell.js" defer></script>
 *
 * What it does, without touching the page's own code:
 *   - once a student is signed in (#app is visible and holds the dashboard) it adds a left menu, a top bar with
 *     reminders and an account menu, and puts a welcome row, three summary cards and a banner above the page's own cards;
 *   - on the sign-in screen, and while a test is running, it switches itself off so those screens are unchanged;
 *   - every piece of text it shows is set with textContent, so nothing from the school's data is ever read as HTML.
 *
 * Settings (window.PORTAL_SHELL):
 *   programme  name shown under the logo
 *   data()     returns the data the page last rendered (an object with .student)
 *   nav        [{ label, icon, top | hash | href | tab | groups }]  top = scroll to the top, hash = scroll to #id (hidden if the
 *              card is not on the page), href = another page, tab = click the page's own tab button, groups = open Class groups
 *   stats(d)   returns two summary cards: [{ label, value, valueClass, lab, alt: { value, label }, foot }]
 *   hello(d)   returns the first banner slide: { title, text, cta: { label, href | hash } }
 *   showTop()  optional; return false to hide the welcome row on some views
 */
(function () {
  'use strict';
  var cfg = window.PORTAL_SHELL;
  if (!cfg) return;
  var de = document.documentElement, built = false, side, bar, pop, scrim, navEls = [], timer = null;

  var MARK = 'M0.14 280.14c4.28,65.12 98.42,133.97 163.39,172.42 15.86,9.39 34.24,9.39 50.11,-0.01 52.97,-31.37 159.02,-102.63 163.43,-172.41l-376.92 0zm302.67 -162.41l74.4 105.8 0 -126.48c0,-20.52 -11.85,-38.03 -30.9,-45.66l-125.46 -50.22 81.96 116.56zm-228.42 0l82.79 -117.73 -126.49 51.28c-18.95,7.68 -30.7,25.13 -30.7,45.57l0 126.67 74.4 -105.8zm114.21 -8.75c35.22,0 63.77,28.55 63.77,63.77 0,35.22 -28.55,63.77 -63.77,63.77 -35.22,0 -63.77,-28.55 -63.77,-63.77 0,-35.22 28.55,-63.77 63.77,-63.77z';
  var ICONS = {
    home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
    cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    clip: 'M9 4h6l1 2h3v14H5V6h3zM9 12h6M9 16h4',
    mic: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
    book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13',
    card: 'M3 6h18v12H3zM3 10h18M7 15h4',
    users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3 3 0 0 1 0 6M19 14c2 .7 3 2.4 3 5',
    pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
    chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    key: 'M14 10a4 4 0 1 1-1.2-2.8L21 15v3h-3v-2h-2v-2h-2.2',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
    out: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
    bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21a2 2 0 0 0 4 0',
    menu: 'M4 7h16M4 12h16M4 17h16',
    down: 'M6 9l6 6 6-6'
  };
  var NS = 'http://www.w3.org/2000/svg';

  function $(id) { return document.getElementById(id); }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else if (k === 'class') n.className = props[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), props[k]);
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function svg(path, size) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', path); s.appendChild(p);
    return s;
  }
  function mark(w, h, fill) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 377.21 459.6'); s.setAttribute('aria-hidden', 'true');
    if (w) { s.setAttribute('width', w); s.setAttribute('height', h); }
    s.setAttribute('fill', fill || '#094570');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', MARK); s.appendChild(p);
    return s;
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u == null ? '' : u).trim()); }
  function pageUrl(u) { return /^[a-z0-9._?=&%/-]+$/i.test(String(u || '')); }   // relative pages only, like "exams" or "pay?id=HM-0001"
  function getData() { try { return cfg.data ? cfg.data() : null; } catch (e) { return null; } }
  function nairaText(n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); }
  function dayText(iso) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function daysFrom(iso) {
    var d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
    return isNaN(d) ? null : Math.round((d - new Date(new Date().toDateString())) / 864e5);
  }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function scrollTo(node) { if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  /* ---------- on / off ---------- */
  function setOn(on, focus) {
    de.classList.toggle('ps-on', !!on);
    de.classList.toggle('ps-focus', !!(on && focus));
    if (!on) de.classList.remove('ps-open');
  }
  function close() { de.classList.remove('ps-open'); if (pop) pop.hidden = true; }

  /* ---------- the fixed parts (built once) ---------- */
  function build() {
    if (built) return; built = true;
    var brand = el('a', { 'class': 'ps-brand', href: './' }, [mark(26, 32), el('div', {}, [el('b', { text: 'Himaayah' }), el('small', { text: cfg.programme || 'Schools' })])]);
    var ul = el('ul', { 'class': 'ps-nav' });
    (cfg.nav || []).forEach(function (item) {
      var node, inner = [svg(ICONS[item.icon] || ICONS.layers), el('span', { text: item.label })];
      if (item.href && pageUrl(item.href)) node = el('a', { href: item.href }, inner);
      else node = el('button', { type: 'button' }, inner);
      node.addEventListener('click', function () { go(item); });
      var li = el('li', {}, [node]);
      ul.appendChild(li); navEls.push({ item: item, li: li, node: node });
    });
    var help = el('div', { 'class': 'ps-help', id: 'psHelp' }, [el('b', { text: 'Help Center' }), el('p', { text: 'Having trouble? Message the school and we will help.' }), el('a', { href: '#', target: '_blank', rel: 'noopener noreferrer', text: 'Message the school' })]);
    side = el('aside', { 'class': 'ps-side', 'aria-label': 'Menu' }, [brand, el('nav', { 'aria-label': 'Sections' }, [ul]), help]);

    var burger = el('button', { 'class': 'ps-burger', type: 'button', 'aria-label': 'Open menu', onclick: function () { de.classList.toggle('ps-open'); } }, [svg(ICONS.menu)]);
    var bell = el('button', { 'class': 'ps-bell', type: 'button', 'aria-label': 'Reminders', id: 'psBell', onclick: function () { togglePop('bell'); } }, [svg(ICONS.bell)]);
    var user = el('button', { 'class': 'ps-user', type: 'button', id: 'psUser', 'aria-haspopup': 'true', onclick: function () { togglePop('user'); } }, [el('span', { 'class': 'ps-av', id: 'psAv', text: '' }), el('span', { 'class': 'ps-nm', id: 'psNm', text: '' }), svg(ICONS.down)]);
    bar = el('header', { 'class': 'ps-bar' }, [burger, bell, user]);
    pop = el('div', { 'class': 'ps-pop', id: 'psPop', hidden: '' });
    scrim = el('div', { 'class': 'ps-scrim', onclick: close });
    document.body.appendChild(side); document.body.appendChild(bar); document.body.appendChild(pop); document.body.appendChild(scrim);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.addEventListener('click', function (e) { if (pop && !pop.hidden && !pop.contains(e.target) && !e.target.closest('#psBell, #psUser')) pop.hidden = true; });
  }

  function go(item) {
    close();
    if (item.top) { window.scrollTo({ top: 0, behavior: 'smooth' }); mark_(item); return; }
    if (item.hash) { scrollTo($(item.hash)); mark_(item); return; }
    if (item.tab) { var t = document.querySelector('[data-tab="' + item.tab + '"]'); if (t) t.click(); return; }
    if (item.groups) { var f = document.querySelector('.grp-fab'); if (f) f.click(); }
  }
  function mark_(item) { navEls.forEach(function (n) { n.node.setAttribute('aria-current', n.item === item ? 'true' : 'false'); }); }

  /* what the menu shows depends on what is on the page right now */
  function refreshNav() {
    var tabNow = '';
    var sel = document.querySelector('[data-tab][aria-selected="true"]');
    if (sel) tabNow = sel.getAttribute('data-tab');
    var anyCurrent = false;
    navEls.forEach(function (n) {
      var it = n.item, show = true, badge = '';
      if (it.hash) show = !!$(it.hash);
      if (it.tab) {
        var btn = document.querySelector('[data-tab="' + it.tab + '"]'); show = !!btn;
        if (btn) { var b = btn.querySelector('i'); badge = b ? b.textContent : ''; }
      }
      if (it.groups) show = !!document.querySelector('.grp-fab');
      n.li.hidden = !show;
      var old = n.node.querySelector('i'); if (old) old.remove();
      if (badge) n.node.appendChild(el('i', { text: badge }));
      var cur = it.tab ? it.tab === tabNow : false;
      if (cur) { n.node.setAttribute('aria-current', 'true'); anyCurrent = true; }
      else if (it.tab) n.node.setAttribute('aria-current', 'false');
    });
    if (!anyCurrent && !navEls.some(function (n) { return n.node.getAttribute('aria-current') === 'true'; })) {
      var first = navEls.filter(function (n) { return n.item.top || (n.item.tab && !tabNow && n.item.tab === 'overview'); })[0];
      if (first) first.node.setAttribute('aria-current', 'true');
    }
  }

  function refreshUser(d) {
    var s = (d && d.student) || {}, name = String(s.Name || '').trim() || 'Student';
    var parts = name.split(/\s+/), ini = (parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
    $('psAv').textContent = ini.toUpperCase(); $('psNm').textContent = name;
    var wa = document.querySelector('.greet a[href*="wa.me"]'), link = $('psHelp').querySelector('a');
    if (wa && safeUrl(wa.href)) { link.href = wa.href; link.hidden = false; } else link.hidden = true;
    var n = document.querySelectorAll('#app .remind a').length, em = $('psBell').querySelector('em');
    if (em) em.remove();
    if (n) $('psBell').appendChild(el('em', { text: String(n) }));
  }

  function togglePop(kind) {
    var d = getData();
    if (!pop.hidden && pop.getAttribute('data-kind') === kind) { pop.hidden = true; return; }
    while (pop.firstChild) pop.removeChild(pop.firstChild);
    pop.setAttribute('data-kind', kind);
    if (kind === 'bell') {
      var rem = [].slice.call(document.querySelectorAll('#app .remind a'));
      if (!rem.length) pop.appendChild(el('p', { text: 'No reminders right now. You are all caught up.' }));
      rem.forEach(function (a) {
        pop.appendChild(el('button', { type: 'button', text: a.textContent.replace(/\s+/g, ' ').trim(), onclick: function () { pop.hidden = true; a.click(); } }));
      });
    } else {
      var s = (d && d.student) || {};
      if (s.StudentID) pop.appendChild(el('p', { text: String(s.StudentID) }));
      if ($('account')) pop.appendChild(el('button', { type: 'button', text: 'Change access code', onclick: function () { pop.hidden = true; scrollTo($('account')); } }));
      pop.appendChild(el('a', { href: 'my-card', text: 'My cards' }));
      pop.appendChild(el('a', { href: './', text: 'Himaayah home' }));
      pop.appendChild(el('hr'));
      pop.appendChild(el('button', { type: 'button', text: 'Log out', onclick: function () { pop.hidden = true; var o = $('out'); if (o) o.click(); } }));
    }
    pop.hidden = false;
  }

  /* ---------- the welcome row (rebuilt after every render of the page) ---------- */
  function payState(s) {
    var status = String(s.PaymentStatus || '').toLowerCase(), due = s.NextDue ? daysFrom(s.NextDue) : null;
    if (status === 'exempt') return { value: 'Nothing to pay', big: false, foot: 'You are exempt from fees.', pay: false };
    if (status === 'paid' && !s.NextDue) return { value: 'Paid in full', big: false, foot: 'Nothing more to pay.', pay: false };
    var fee = s.MonthlyFee || s.Fee, base = { value: s.NextDue ? dayText(s.NextDue) : 'No date set', big: true, fee: fee ? nairaText(fee) : '', pay: true };
    if (status === 'overdue') return Object.assign(base, { foot: due != null && due < 0 ? 'Overdue by ' + plural(-due, 'day') : 'Overdue', bad: true });
    if (status === 'paid') return Object.assign(base, { foot: 'Paid. You are up to date.' });
    if (due == null) return Object.assign(base, { foot: 'Due' });
    return Object.assign(base, { foot: due < 0 ? 'Overdue by ' + plural(-due, 'day') : due === 0 ? 'Due today' : due === 1 ? 'Due tomorrow' : 'Due in ' + plural(due, 'day'), bad: due < 0 });
  }

  function statCard(c, dark) {
    var row = [el('div', {}, [el('div', { 'class': 'ps-big' + (c.valueClass ? ' ' + c.valueClass : ''), text: String(c.value == null ? '' : c.value) }), c.lab ? el('span', { 'class': 'ps-lab', text: c.lab }) : null])];
    if (c.alt) row.push(el('div', { 'class': 'ps-alt' }, [el('div', { 'class': 'ps-big', text: String(c.alt.value) }), el('span', { 'class': 'ps-lab', text: c.alt.label })]));
    var kids = [el('small', { text: c.label }), el('div', { 'class': 'ps-row' }, row)];
    if (c.footNode) kids.push(c.footNode); else if (c.foot) kids.push(el('div', { 'class': 'ps-foot', text: c.foot }));
    return el('div', { 'class': 'ps-stat' + (dark ? ' dark' : '') }, kids);
  }

  function slideNode(sl, i) {
    var kids = [el('h2', { text: sl.title }), el('p', { text: sl.text })];
    if (sl.cta) {
      var cta;
      if (sl.cta.href && (safeUrl(sl.cta.href) || pageUrl(sl.cta.href))) {
        cta = el('a', { 'class': 'ps-cta', href: sl.cta.href, text: sl.cta.label });
        if (safeUrl(sl.cta.href)) { cta.target = '_blank'; cta.rel = 'noopener noreferrer'; }
      } else if (sl.cta.hash) {
        cta = el('button', { 'class': 'ps-cta', type: 'button', text: sl.cta.label, onclick: function () { scrollTo($(sl.cta.hash)); } });
        cta.style.border = '0'; cta.style.cursor = 'pointer';
      }
      if (cta) kids.push(cta);
    }
    return el('div', { 'class': 'ps-slide' + (i === 0 ? ' on' : '') }, kids);
  }

  function insertTop(d) {
    var app = $('app'), greet = app.querySelector('.greet');
    if (!greet || app.querySelector('.ps-top')) return;
    if (cfg.showTop && cfg.showTop() === false) return;
    var s = d.student || {}, first = String(s.Name || '').split(' ')[0] || 'student';
    var pay = payState(s), mine = [];
    try { mine = (cfg.stats && cfg.stats(d)) || []; } catch (e) { mine = []; }

    var payFoot = el('div', { 'class': 'ps-foot' }, [el('b', { 'class': pay.bad ? 'bad' : '', text: pay.foot })]);
    if (pay.pay && s.StudentID) { payFoot.appendChild(document.createTextNode(' ')); payFoot.appendChild(el('a', { href: 'pay?id=' + encodeURIComponent(s.StudentID), text: 'Pay now' })); }
    var third = null; try { third = cfg.third && cfg.third(d); } catch (e) { third = null; }
    var payCard = third || { label: 'Next payment', value: pay.value, lab: pay.fee ? 'Amount: ' + pay.fee : '', footNode: payFoot };

    var stats = el('div', { 'class': 'ps-stats' }, [mine[0] && statCard(mine[0]), mine[1] && statCard(mine[1]), statCard(payCard, true)]);

    var slides = [], hello = null;
    try { hello = cfg.hello && cfg.hello(d); } catch (e) { hello = null; }
    slides.push({ title: (hello && hello.title) || 'Assalaamu alaykum, ' + first + '!', text: (hello && hello.text) || 'Check your timetable and tasks often to stay on track.', cta: hello && hello.cta });
    if (pay.pay && pay.bad) slides.push({ title: 'Your fee is overdue', text: 'Class links and class groups are paused until your payment is received. Pay by card and everything comes back straight away.', cta: { label: 'Pay now', href: 'pay?id=' + encodeURIComponent(s.StudentID || '') } });
    else if (pay.pay && /^Due (today|tomorrow|in )/.test(pay.foot)) slides.push({ title: pay.foot + '.', text: 'Pay on time so your classes carry on without a break. Your next due date counts from this due date, not from the day you pay.', cta: { label: 'Pay now', href: 'pay?id=' + encodeURIComponent(s.StudentID || '') } });

    var banner = el('section', { 'class': 'ps-banner', 'aria-label': 'Notices', 'aria-roledescription': 'carousel' });
    var m = mark(150, 183, '#094570'); m.setAttribute('class', 'ps-mark'); banner.appendChild(m);
    slides.forEach(function (sl, i) { banner.appendChild(slideNode(sl, i)); });
    if (slides.length > 1) {
      var dots = el('div', { 'class': 'ps-dots' }), idx = 0, nodes = banner.querySelectorAll('.ps-slide'), ds = [];
      var show = function (i) { idx = i; [].forEach.call(nodes, function (n, k) { n.classList.toggle('on', k === i); }); ds.forEach(function (b, k) { b.setAttribute('aria-current', k === i ? 'true' : 'false'); }); };
      slides.forEach(function (_, i) { var b = el('button', { type: 'button', 'aria-label': 'Notice ' + (i + 1), onclick: function () { show(i); } }); ds.push(b); dots.appendChild(b); });
      banner.appendChild(dots); show(0);
      var t = setInterval(function () { if (!document.body.contains(banner)) { clearInterval(t); return; } if (!banner.matches(':hover') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) show((idx + 1) % slides.length); }, 8000);
    }

    var chips = greet.querySelector('.chips');
    var wrap = el('section', { 'class': 'ps-top', 'aria-label': 'Overview' }, [el('h1', { text: 'Welcome, ' + first }), chips ? chips.cloneNode(true) : null, stats, banner]);
    greet.parentNode.insertBefore(wrap, greet);
  }

  /* ---------- keep in step with the page ---------- */
  function sync() {
    timer = null;
    var app = $('app');
    if (!app || app.hidden) { setOn(false); return; }
    var running = !!app.querySelector('.acx-run'), dash = !!app.querySelector('.greet');
    if (!running && !dash) { setOn(false); return; }
    setOn(true, running);
    if (running) return;
    var d = getData(); if (!d || !d.student) return;
    build(); refreshNav(); refreshUser(d); insertTop(d);
  }
  function queue() { if (!timer) timer = requestAnimationFrame(sync); }

  function start() {
    var app = $('app'); if (!app) return;
    new MutationObserver(queue).observe(app, { childList: true });
    new MutationObserver(queue).observe(app, { attributes: true, attributeFilter: ['hidden'] });
    queue();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
