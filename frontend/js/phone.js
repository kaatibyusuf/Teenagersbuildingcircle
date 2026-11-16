/* Phone numbers from anywhere in the world (enrolment form).
   hsPhone(raw) -> { ok: true, digits: '447700900123' } or { ok: false, why: '...' }
   The same rules are in backend/Phone.gs, and tests/phone.test.js checks they agree. */
(function () {
  function hsPhone(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: false, why: 'Enter a phone number.' };
    if (/[^0-9+\s().\-]/.test(s) || s.lastIndexOf('+') > 0) return { ok: false, why: 'Use only digits, spaces and a leading +.' };
    var plus = s.charAt(0) === '+', d = s.replace(/\D/g, '');
    var NEED = 'Start with + and your country code, for example +44 7700 900123.';
    if (!plus && d.slice(0, 2) === '00') { plus = true; d = d.slice(2); }
    if (plus) {
      if (d.slice(0, 4) === '2340') d = '234' + d.slice(4);
      if (d.charAt(0) === '0') return { ok: false, why: NEED };
    } else if (/^0(70|80|81|90|91)\d{8}$/.test(d)) d = '234' + d.slice(1);
    else if (/^(70|80|81|90|91)\d{8}$/.test(d)) d = '234' + d;
    else if (!/^234\d{10}$/.test(d)) return { ok: false, why: NEED };
    if (d.length < 8 || d.length > 15) return { ok: false, why: 'That number is the wrong length. Check it and include your country code.' };
    return { ok: true, digits: d };
  }
  if (typeof window !== "undefined") window.hsPhone = hsPhone;
  if (typeof module !== 'undefined' && module.exports) module.exports = hsPhone;
})();
