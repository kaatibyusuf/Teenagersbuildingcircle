/* Reset code panel, shared by every admin page (owner, admin, tbc-admin, academy-admin, skills-admin).
 *
 * Use:  ResetPanel.init({ role: 'admin', api, toast, root: document.getElementById('app') });
 *       then in the page's VIEWS add   reset: () => ResetPanel.view()   and a tab ['reset', 'Reset code'].
 * role is one of owner | admin | academy | skills (it decides which accounts the server lets this admin reset).
 * api(action, extra) must send the signed-in admin's id and code with every call (each page already has that).
 * The new code is shown once, here, and is never stored in the page after "Done". */
(function () {
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { q: '', results: null, busy: false, ask: null, email: true, shown: null, recent: null, note: '', loaded: false };
  let cfg = null;

  const CSS = '.rsp-hit{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;background:var(--wash,#f3f6f8);border-radius:12px;font-size:14px;flex-wrap:wrap}' +
    '.rsp-hit b{font-weight:700}.rsp-hit small{display:block;color:var(--muted,#5e6b73);font-size:12.5px;margin-top:2px}.rsp-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
    '.rsp-code{font:700 26px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;padding:14px 16px;border-radius:12px;background:#fff;box-shadow:inset 0 0 0 2px var(--ink,#062f4d);word-break:break-all;user-select:all;margin:10px 0}' +
    '.rsp-msg{white-space:pre-wrap;font-size:13.5px;padding:12px 14px;background:var(--wash,#f3f6f8);border-radius:12px;margin:10px 0}' +
    '.rsp-warn{font-size:13.5px;color:var(--bad,#b42318);margin:6px 0}.rsp-chk{display:flex;gap:8px;align-items:center;font-size:14px;margin:8px 0}' +
    '.rsp-tag{font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.14)}' +
    '.rsp-off{opacity:.6}@media(max-width:560px){.rsp-code{font-size:21px}}';
  function style() { if (document.getElementById('rsp-css')) return; const s = document.createElement('style'); s.id = 'rsp-css'; s.textContent = CSS; document.head.appendChild(s); }

  function paint() { const el = document.getElementById('rsp'); if (el) el.innerHTML = inner(); }

  function hit(r) {
    const asking = S.ask && S.ask.kind === r.kind && S.ask.id === r.id;
    const who = esc(r.name || r.id);
    let right;
    if (r.self) right = '<span class="rsp-tag">This is you: use Account</span>';
    else if (asking) right = '<div class="rsp-act"><button class="btn btn-ink btn-sm" type="button" data-rs="go"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Working…' : 'Yes, give a new code') + '</button><button class="btn btn-line btn-sm" type="button" data-rs="no">Cancel</button></div>';
    else right = '<button class="btn btn-line btn-sm" type="button" data-rs="ask" data-k="' + esc(r.kind) + '" data-id="' + esc(r.id) + '">Reset code</button>';
    const sub = esc(r.kindLabel) + ' · ' + esc(r.id) + (r.emailMasked ? ' · ' + esc(r.emailMasked) : '') + (r.active ? '' : ' · <b>not active</b>');
    const opt = asking && !r.self ? '<label class="rsp-chk" style="flex-basis:100%"><input type="checkbox" data-rs="email"' + (S.email ? ' checked' : '') + (r.emailMasked ? '' : ' disabled') + '> Also email it to ' + (r.emailMasked ? esc(r.emailMasked) : 'them (no email on file)') + '</label>' +
      '<p class="rsp-warn" style="flex-basis:100%">The old code stops working at once.</p>' : '';
    return '<li class="rsp-hit' + (r.active ? '' : ' rsp-off') + '"><span><b>' + who + '</b><small>' + sub + '</small></span>' + right + opt + '</li>';
  }

  function shown() {
    const x = S.shown;
    return '<div class="rsp-box"><h3 style="margin:0 0 4px">New code for ' + esc(x.name || x.id) + '</h3><p class="sub">' + esc(x.kindLabel) + ' · ' + esc(x.id) + '. Send it to them privately. It will not be shown again after you press Done.</p>' +
      '<div class="rsp-code" id="rsp-code">' + esc(x.code) + '</div>' +
      '<p class="sub">' + (x.emailed === 'Sent' ? 'Emailed to them.' : x.emailed === 'No email' ? 'No valid email on file, so nothing was emailed.' : x.emailed === 'Off' ? 'Emails are switched off in the script, so nothing was emailed.' : x.emailed === 'Quota reached' ? 'Today’s email limit is used up, so nothing was emailed.' : x.emailed === 'Error' ? 'The email could not be sent.' : 'Not emailed.') + ' Their old sign-in lockout (if any) is cleared.</p>' +
      '<div class="rsp-act"><button class="btn btn-ink btn-sm" type="button" data-rs="copy">Copy code</button><button class="btn btn-line btn-sm" type="button" data-rs="copymsg">Copy message</button>' +
      (x.whatsapp ? '<a class="btn btn-line btn-sm" href="' + esc(x.whatsapp) + '" target="_blank" rel="noopener">Send on WhatsApp</a>' : '') +
      '<button class="btn btn-line btn-sm" type="button" data-rs="done">Done</button></div>' +
      '<details style="margin-top:10px"><summary class="sub" style="cursor:pointer">Message you can paste</summary><div class="rsp-msg">' + esc(x.message) + '</div></details></div>';
  }

  function inner() {
    if (S.shown) return shown();
    const list = S.results == null ? '' : S.results.length ? '<ul class="list" style="gap:8px">' + S.results.map(hit).join('') + '</ul>' + (S.more ? '<p class="sub">Showing the first matches. Type more of the name or ID to narrow it.</p>' : '')
      : '<p class="empty">' + (S.tooShort ? 'Type at least 2 letters or numbers.' : 'No account matches that.') + '</p>';
    const rec = S.recent && S.recent.length ? '<h3 style="margin:22px 0 8px;font-size:15px">Recent resets</h3><ul class="list">' + S.recent.map((r) =>
      '<li><span><b>' + esc(r.target) + '</b> <span class="sub">' + esc(r.kindLabel) + '</span></span><span class="sub">' + esc(r.by) + ' · ' + esc(String(r.when).replace('T', ' ')) + '</span></li>').join('') + '</ul>' : '';
    return '<form data-rs-form autocomplete="off"><label class="fl" for="rsq">Find the person</label>' +
      '<div class="rsp-act"><input class="in" id="rsq" name="q" value="' + esc(S.q) + '" placeholder="Name, ID, email or phone" style="flex:1;min-width:200px" maxlength="60"><button class="btn btn-ink" type="submit"' + (S.busy ? ' disabled' : '') + '>Search</button></div></form>' +
      '<div style="margin-top:14px">' + list + '</div>' + rec;
  }

  function view() {
    style();
    if (!S.loaded) { S.loaded = true; call('rs_recent').then((d) => { if (d && d.ok) { S.recent = d.recent; paint(); } }); }
    return '<article class="c w12" style="max-width:720px"><h2>Reset an access code</h2><p class="sub">For someone who has forgotten their code. Find them, give them a new one, and send it to them privately. They can change it under Account after they sign in. You can never see anyone’s current code.</p><div id="rsp">' + inner() + '</div></article>';
  }

  async function call(action, extra) {
    try { return await cfg.api(action, Object.assign({ as: cfg.role }, extra || {})); }
    catch (e) { cfg.toast('Could not reach the school server. Please try again.', true); return null; }
  }
  const copy = (t, ok) => { try { navigator.clipboard.writeText(t).then(() => cfg.toast(ok), () => cfg.toast('Select the text and copy it.', true)); } catch (e) { cfg.toast('Select the text and copy it.', true); } };

  async function search() {
    S.busy = true; S.ask = null; paint();
    const d = await call('rs_find', { q: S.q });
    S.busy = false;
    if (d && d.ok) { S.results = d.results; S.more = d.more; S.tooShort = d.tooShort; } else if (d) cfg.toast(d.error || 'Search failed.', true);
    paint();
  }
  async function go() {
    if (!S.ask || S.busy) return;
    S.busy = true; paint();
    const d = await call('rs_reset', { kind: S.ask.kind, targetId: S.ask.id, email: S.email ? 1 : 0 });
    S.busy = false;
    if (d && d.ok) { S.shown = d; S.ask = null; S.results = null; S.q = ''; call('rs_recent').then((r) => { if (r && r.ok) { S.recent = r.recent; } }); }
    else if (d) { cfg.toast(d.error || 'Could not reset.', true); S.ask = null; }
    paint();
  }

  function init(c) {
    cfg = c;
    c.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rs]'); if (!b || !document.getElementById('rsp')) return;
      const a = b.dataset.rs;
      if (a === 'ask') { S.ask = { kind: b.dataset.k, id: b.dataset.id }; paint(); }
      else if (a === 'no') { S.ask = null; paint(); }
      else if (a === 'go') go();
      else if (a === 'copy') copy(S.shown.code, 'Code copied.');
      else if (a === 'copymsg') copy(S.shown.message, 'Message copied.');
      else if (a === 'done') { S.shown = null; paint(); }
    });
    c.root.addEventListener('change', (e) => { if (e.target.matches && e.target.matches('[data-rs="email"]')) S.email = e.target.checked; });
    c.root.addEventListener('input', (e) => { if (e.target.id === 'rsq') S.q = e.target.value; });
    c.root.addEventListener('submit', (e) => { const f = e.target.closest && e.target.closest('[data-rs-form]'); if (!f) return; e.preventDefault(); e.stopPropagation(); S.q = (f.elements.q.value || '').trim(); search(); }, true);
  }
  function reset() { S.q = ''; S.results = null; S.ask = null; S.shown = null; S.recent = null; S.loaded = false; }

  window.ResetPanel = { init: init, view: view, reset: reset };
})();
