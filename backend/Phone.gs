/* Phone numbers from anywhere in the world.
   phone_normalise_(raw) -> { ok: true, digits: '447700900123' }  (digits only, country code first, no +)
                          or { ok: false, why: 'plain English reason' }
   The same rules are in frontend/js/phone.js (the enrolment form), and tests/phone.test.js checks they agree.

   How a number is read:
   - "+" or "00" first: an international number. Used as typed, e.g. +44 7700 900123.
   - A Nigerian mobile typed the Nigerian way (0704 722 6487, or 704 722 6487): becomes +234.
   - 234 followed by ten digits: Nigerian, used as typed.
   - Anything else (for example 07700 900123 or 2025550123) is not guessed. We ask for the country code,
     because a UK or US number must never be turned into a Nigerian one. */
function phone_normalise_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: false, why: 'Enter a phone number.' };
  if (/[^0-9+\s().\-]/.test(s) || s.lastIndexOf('+') > 0) return { ok: false, why: 'Use only digits, spaces and a leading +.' };
  var plus = s.charAt(0) === '+', d = s.replace(/\D/g, '');
  var NEED = 'Start with + and your country code, for example +44 7700 900123.';
  if (!plus && d.slice(0, 2) === '00') { plus = true; d = d.slice(2); }
  if (plus) {
    if (d.slice(0, 4) === '2340') d = '234' + d.slice(4);       // +234 0704...: the 0 is not part of the number
    if (d.charAt(0) === '0') return { ok: false, why: NEED };
  } else if (/^0(70|80|81|90|91)\d{8}$/.test(d)) d = '234' + d.slice(1);
  else if (/^(70|80|81|90|91)\d{8}$/.test(d)) d = '234' + d;
  else if (!/^234\d{10}$/.test(d)) return { ok: false, why: NEED };
  if (d.length < 8 || d.length > 15) return { ok: false, why: 'That number is the wrong length. Check it and include your country code.' };
  return { ok: true, digits: d };
}
