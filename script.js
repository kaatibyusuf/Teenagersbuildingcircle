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

// ---------- Payment / Registration modal ----------
(function () {
  var REGISTRATION_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfAeWdbBg1oYPyFIAmxOvJaXQm6Q43lbYUuQFirXBZMaPuCyw/viewform?usp=header";

  var modal = document.getElementById('paymentModal');
  if (!modal) return;

  var openers = document.querySelectorAll('.js-register-btn');
  var closeBtn = modal.querySelector('.modal-close');
  var continueBtn = document.getElementById('continueToRegister');
  var copyBtn = modal.querySelector('.copy-btn');
  var lastFocused = null;

  function openModal(e) {
    if (e) e.preventDefault();
    lastFocused = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  openers.forEach(function (btn) { btn.addEventListener('click', openModal); });
  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var number = copyBtn.getAttribute('data-copy');
      navigator.clipboard.writeText(number).then(function () {
        var original = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = original; }, 1800);
      });
    });
  }

  if (continueBtn) {
    continueBtn.addEventListener('click', function () {
      window.location.href = REGISTRATION_URL;
    });
  }
})();