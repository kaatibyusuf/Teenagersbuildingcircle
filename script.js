// ---------- Scroll reveal ----------
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ring = document.getElementById('wheelRing');
    if (ring) ring.style.animation = 'none';
    document.querySelectorAll('.pillar-node').forEach(function (n) { n.style.animation = 'none'; });
  }
  var revealEls = document.querySelectorAll('.reveal');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(function (el) { io.observe(el); });
})();

// ---------- Mobile hamburger menu ----------
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (!toggle || !links) return;

  function closeMenu() {
    links.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    var isOpen = links.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  toggle.addEventListener('click', toggleMenu);

  // Close the menu once any nav link is actually followed
  links.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });

  // Close if the viewport is resized back up to desktop width
  window.addEventListener('resize', function () {
    if (window.innerWidth > 640) closeMenu();
  });
})();

// ---------- Copy-to-clipboard for account details ----------
(function () {
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var value = btn.getAttribute('data-copy');
      navigator.clipboard.writeText(value).then(function () {
        var original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = original; }, 1800);
      });
    });
  });
})();