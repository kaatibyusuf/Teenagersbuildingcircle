/* Sends the student's own time zone with every request to the school's server, so "today" (daily routine,
   revision tracker, streaks) starts and ends at midnight where the student is, not at midnight in Nigeria. */
(function () {
  var tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  window.HS_TZ = tz;
  if (!tz || !window.fetch) return;
  var orig = window.fetch;
  window.fetch = function (url, opts) {
    try {
      if (opts && typeof opts.body === 'string' && /script\.google\.com\/macros/.test(String(url && url.url || url)) && opts.body.charAt(0) === '{') {
        var o = JSON.parse(opts.body); if (o && typeof o === 'object' && !o.tz) { o.tz = tz; opts = Object.assign({}, opts, { body: JSON.stringify(o) }); }
      }
    } catch (e) {}
    return orig.call(this, url, opts);
  };
})();
