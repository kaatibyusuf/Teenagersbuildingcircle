/* Choose-your-own-code prompt, for every portal.
 *
 * After an admin resets someone's access code, the person is asked to choose their own code the first time they sign in.
 * This script watches for the portal saving a sign-in (the pages keep { id, code } in this tab's sessionStorage), asks the school
 * server whether that account is flagged, and if so covers the page with a window that must be completed or the person logs out.
 * It is a prompt in the page, not a lock inside the portal; the server side is Resets.gs (rs_mc_check and rs_mc_set).
 * Load it right after auth-guard.js, in the head. */
(function () {
  'use strict';
  var API = 'https://script.google.com/macros/s/AKfycby0AsifBuB_Ad7g1SjDXCipaDU27-BrzYWf67muw5jeY_C0_0uz8AhQYYXdiNRQhvqX/exec';
  var KINDS = { hs: 'student', hb: 'student', ht: 'teacher', hf: 'teacher', hl: 'librarian', ha: 'admin', hta: 'admin', how: 'owner',
    hc: 'academyStudent', hct: 'academyTutor', hca: 'academyAdmin', hsk: 'skillsStudent', hskt: 'skillsTutor', hcsa: 'skillsAdmin', hbc: 'bootcamp', hrf: 'referrer' };
  var open = false, asked = {}, ss;
  try { ss = window.sessionStorage; } catch (e) { return; }

  function creds(key, raw) {
    try { var o = JSON.parse(raw); if (!o) return null; return key === 'hrf' ? (o.code && o.access ? { id: o.code, code: o.access } : null) : (o.id && o.code ? { id: o.id, code: o.code } : null); } catch (e) { return null; }
  }
  function post(body) {
    var url = (typeof API_URL !== 'undefined' && API_URL) ? API_URL : API;
    return fetch(url, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function check(key, raw) {
    var c = creds(key, raw), kind = KINDS[key]; if (!c || !kind || open) return;
    var mark = key + '|' + c.id + '|' + c.code; if (asked[mark]) return; asked[mark] = 1;
    post({ action: 'rs_mc_check', kind: kind, id: c.id, code: c.code }).then(function (d) { if (d && d.ok && d.mustChange) prompt(key, kind, c); }).catch(function () {});
  }

  var orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { var r = orig.apply(this, arguments); try { if (this === ss && KINDS[k]) check(k, v); } catch (e) {} return r; };
  function scan() { Object.keys(KINDS).forEach(function (k) { var v = null; try { v = ss.getItem(k); } catch (e) {} if (v) check(k, v); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();

  function prompt(key, kind, c) {
    if (open) return; open = true;
    var css = document.createElement('style');
    css.textContent = '#fc-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(6,21,33,.82);display:flex;align-items:center;justify-content:center;padding:18px;font-family:inherit}' +
      '#fc-box{background:#fff;color:#0a2b40;border-radius:20px;max-width:420px;width:100%;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.35)}#fc-box h2{margin:0 0 8px;font-size:22px;line-height:1.2}' +
      '#fc-box p{margin:0 0 14px;font-size:14.5px;line-height:1.5;color:#44525b}#fc-box label{display:block;font-weight:600;font-size:13.5px;margin:12px 0 5px}' +
      '#fc-box input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1.5px solid #cdd6db;font:inherit;font-size:16px}#fc-box input:focus{outline:2px solid #3b88a8;border-color:#3b88a8}' +
      '#fc-err{color:#b42318;font-size:13.5px;min-height:20px;margin-top:10px}#fc-box .fc-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px}' +
      '#fc-go{background:#0a2b40;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:600;font-size:15px;font-family:inherit;cursor:pointer}#fc-go[disabled]{opacity:.6}#fc-out{background:none;border:0;color:#44525b;text-decoration:underline;font:inherit;font-size:14px;cursor:pointer}';
    document.head.appendChild(css);
    var ov = document.createElement('div'); ov.id = 'fc-ov';
    ov.innerHTML = '<form id="fc-box" role="dialog" aria-modal="true" aria-labelledby="fc-h" autocomplete="off"><h2 id="fc-h">Choose your own access code</h2>' +
      '<p>An administrator gave you a temporary code. Please choose a code that only you know. Use at least 8 characters, and do not share it.</p>' +
      '<label for="fc-a">New access code</label><input id="fc-a" type="password" minlength="8" maxlength="40" autocomplete="new-password" required>' +
      '<label for="fc-b">Type it again</label><input id="fc-b" type="password" minlength="8" maxlength="40" autocomplete="new-password" required>' +
      '<div id="fc-err" role="alert"></div><div class="fc-row"><button id="fc-go" type="submit">Save my new code</button><button id="fc-out" type="button">Log out</button></div></form>';
    document.body.appendChild(ov);
    var a = ov.querySelector('#fc-a'), b = ov.querySelector('#fc-b'), err = ov.querySelector('#fc-err'), go = ov.querySelector('#fc-go');
    a.focus();
    function leave() { try { Object.keys(KINDS).forEach(function (k) { ss.removeItem(k); }); } catch (e) {} location.reload(); }
    ov.querySelector('#fc-out').addEventListener('click', leave);
    ov.querySelector('#fc-box').addEventListener('submit', function (e) {
      e.preventDefault(); err.style.color = '#b42318';
      if (a.value.length < 8) { err.textContent = 'Your new code must be at least 8 characters.'; return; }
      if (a.value !== b.value) { err.textContent = 'The two codes do not match.'; return; }
      go.disabled = true; go.textContent = 'Saving…'; err.textContent = '';
      post({ action: 'rs_mc_set', kind: kind, id: c.id, code: c.code, newCode: a.value }).then(function (d) {
        if (d && d.ok) { err.style.color = '#1b7f4b'; err.textContent = 'Saved. Please sign in again with your new code.'; setTimeout(leave, 1400); }
        else { err.textContent = (d && d.error) || 'Could not save. Please try again.'; go.disabled = false; go.textContent = 'Save my new code'; }
      }).catch(function () { err.textContent = 'Could not reach the school server. Please try again.'; go.disabled = false; go.textContent = 'Save my new code'; });
    });
  }
})();
