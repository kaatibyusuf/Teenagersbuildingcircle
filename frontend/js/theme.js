/* The site is light only. Dark mode was removed.
   This file stays because every page still loads it. It clears any dark choice a visitor saved earlier,
   makes sure the page stays light, and removes the old moon button if one is present. */
(function () {
  var root = document.documentElement;
  try { localStorage.removeItem('hs-theme'); } catch (e) {}
  root.removeAttribute('data-theme');
  function tidy() { document.querySelectorAll('.theme-btn').forEach(function (b) { b.remove(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tidy); else tidy();
  window.addEventListener('load', tidy);
})();
