/* Class groups on every student and teacher page (groups.js). Replaces the WhatsApp class groups.
 *
 * Add  <script src="js/groups.js" defer></script>  to a portal page. When the person is signed in, a "Class groups" button appears at the bottom of the
 * page. It opens a panel:
 *   - students see the groups their teacher put them in, with the class link and announcements. If their fee is overdue the server sends no posts and no
 *     links, and the panel only explains that and offers to pay.
 *   - teachers, facilitators, mentors and tutors make groups, choose which of their own students are in them, and post class links and announcements.
 *
 * The script finds which page it is on from the address (see PAGES), reads the ID and code the page already keeps in sessionStorage, and calls the same
 * school server (API_URL, defined by the page). It changes nothing else on the page. Every message from the server is shown as plain text, never as HTML.
 * tests/groups.test.js checks the server side; tests/groups-page.test.js checks that every page is listed and loads this script.
 */
(function () {
  var PAGES = {
    'dashboard':           { programme: 'madrasah', staff: false, key: 'hs' },
    'teacher':             { programme: 'madrasah', staff: true,  key: 'ht' },
    'tbc-dashboard':       { programme: 'tbc',      staff: false, key: 'hb' },
    'tbc-facilitator':     { programme: 'tbc',      staff: true,  key: 'hf' },
    'academy-dashboard':   { programme: 'academy',  staff: false, key: 'hc' },
    'academy-tutor':       { programme: 'academy',  staff: true,  key: 'hct' },
    'skills-dashboard':    { programme: 'skills',   staff: false, key: 'hsk' },
    'skills-tutor':        { programme: 'skills',   staff: true,  key: 'hskt' }
  };

  function pageName() {
    var p = String((window.location && window.location.pathname) || '').split('/').pop().replace(/\.html$/, '');
    return p || 'index';
  }
  function cfg() { return PAGES[pageName()] || null; }
  function creds(c) { try { var v = JSON.parse(sessionStorage.getItem(c.key) || 'null'); return v && v.id && v.code ? v : null; } catch (e) { return null; } }
  function apiUrl() { try { return typeof API_URL === 'string' ? API_URL : ''; } catch (e) { return ''; } }
  function safeUrl(u) { return /^https?:\/\/[^\s<>"']+$/i.test(String(u || '')) ? String(u) : ''; }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function niceWhen(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(s || ''));
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    var h = +m[4], ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return wd + ' ' + (+m[3]) + ' ' + mon + ', ' + h + ':' + m[5] + ' ' + ap;
  }

  var CSS =
    '.grp-fab{position:fixed;left:16px;bottom:76px;z-index:60;display:none;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;background:var(--navy,#094570);color:#fff;font-family:inherit;font-weight:600;font-size:15px;box-shadow:0 6px 20px rgba(8,47,82,.28);cursor:pointer}' +
    '.grp-fab.on{display:inline-flex}.grp-ov{position:fixed;inset:0;z-index:100;background:rgba(8,47,82,.45);display:flex;align-items:flex-end;justify-content:center}' +
    '.grp-p{background:var(--bg,#fff);color:var(--ink,#082f52);width:100%;max-width:720px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:18px 18px 28px;font-family:inherit;font-size:15px;line-height:1.5}' +
    '.grp-h{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.grp-h h2{margin:0;font-size:20px}' +
    '.grp-x{border:0;background:#e9f2fa;color:inherit;border-radius:999px;padding:8px 14px;font-family:inherit;font-weight:600;font-size:14px;cursor:pointer}' +
    '.grp-card{border:1px solid #d6e3ee;border-radius:14px;padding:14px;margin:12px 0;background:#fff}.grp-card h3{margin:0 0 4px;font-size:17px}' +
    '.grp-muted{color:#5b7084;font-size:13.5px}.grp-lock{background:#fff4e5;border:1px solid #f0c987;border-radius:14px;padding:14px;margin:12px 0}' +
    '.grp-post{border-top:1px solid #e3ecf3;padding:10px 0}.grp-post:first-of-type{border-top:0}.grp-pin{display:inline-block;font-size:12px;font-weight:700;background:#fff0c2;border-radius:999px;padding:2px 8px;margin-right:6px}' +
    '.grp-btn{display:inline-block;border:0;border-radius:12px;padding:10px 16px;background:var(--navy,#094570);color:#fff;font-family:inherit;font-weight:600;font-size:14.5px;cursor:pointer;text-decoration:none;margin:4px 6px 4px 0}' +
    '.grp-btn.alt{background:#e9f2fa;color:#082f52}.grp-btn.bad{background:#fde8e8;color:#9b1c1c}.grp-btn[disabled]{opacity:.6}' +
    '.grp-f label{display:block;font-weight:600;font-size:13.5px;margin:10px 0 4px}.grp-f input[type=text],.grp-f input[type=url],.grp-f input[type=datetime-local],.grp-f textarea,.grp-f select{width:100%;box-sizing:border-box;border:1px solid #c6d6e4;border-radius:10px;padding:10px;font:inherit;background:#fff;color:inherit}' +
    '.grp-f textarea{min-height:70px}.grp-pick{max-height:220px;overflow:auto;border:1px solid #c6d6e4;border-radius:10px;padding:6px 10px}.grp-pick label{display:flex;gap:8px;align-items:center;font-weight:400;margin:6px 0}' +
    '.grp-tag{font-size:12px;border-radius:999px;padding:2px 8px;background:#fde8e8;color:#9b1c1c;font-weight:600}.grp-err{color:#9b1c1c;font-weight:600;margin:8px 0}.grp-ok{color:#1b6b3a;font-weight:600}';

  var S = { cfg: null, ov: null, body: null, data: null, busy: false, msg: '', err: '', open: {}, editing: null, creating: false, notify: null };

  function call(action, extra) {
    var c = creds(S.cfg), url = apiUrl();
    if (!c) return Promise.resolve({ ok: false, error: 'Please sign in first.' });
    if (!url) return Promise.resolve({ ok: false, error: 'Class groups need the live school server.' });
    var body = { action: action, programme: S.cfg.programme, id: c.id, code: c.code };
    Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
    return fetch(url, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: 'Could not reach the school server. Please try again.' }; });
  }
  function load() {
    S.busy = true; S.err = ''; render();
    call(S.cfg.staff ? 'grp_t_list' : 'grp_s_list').then(function (d) { S.busy = false; if (d.ok) S.data = d; else S.err = d.error || 'Could not load.'; render(); });
  }
  function act(action, extra, okMsg) {
    S.busy = true; S.err = ''; S.msg = ''; S.notify = null; render();
    return call(action, extra).then(function (d) {
      S.busy = false;
      if (d.ok) { S.data = d; S.msg = okMsg || ''; S.creating = false; S.editing = null; S.notify = d.notify || null; } else S.err = d.error || 'That did not work.';
      render(); return d.ok;
    });
  }

  /* ---------- student ---------- */
  function postNode(p) {
    var link = safeUrl(p.Link);
    var kids = [el('div', {}, [p.Pinned ? el('span', { 'class': 'grp-pin', text: 'Pinned' }) : null, el('strong', { text: p.Title || (p.Kind === 'class' ? 'Class' : 'Announcement') })])];
    if (p.When) kids.push(el('div', { 'class': 'grp-muted', text: niceWhen(p.When) }));
    if (p.Body) kids.push(el('div', { text: p.Body, style: 'white-space:pre-wrap' }));
    if (link) kids.push(el('a', { 'class': 'grp-btn', href: link, target: '_blank', rel: 'noopener noreferrer', text: p.Kind === 'class' ? 'Join class' : 'Open link' }));
    kids.push(el('div', { 'class': 'grp-muted', text: (p.Author ? p.Author + ' · ' : '') + String(p.Created || '').replace('T', ' ') }));
    return el('div', { 'class': 'grp-post' }, kids);
  }
  function studentView(d) {
    var out = [];
    if (d.locked) {
      out.push(el('div', { 'class': 'grp-lock' }, [
        el('strong', { text: 'Your class groups are paused' }),
        el('p', { text: d.message || 'Your fee is overdue.' }),
        el('a', { 'class': 'grp-btn', href: safeUrl(d.payLink) || '#', text: 'Pay now' })
      ]));
    }
    if (!d.groups.length) out.push(el('p', { 'class': 'grp-muted', text: 'You are not in a class group yet. Your teacher will add you.' }));
    d.groups.forEach(function (g) {
      var kids = [el('h3', { text: g.Name }), el('div', { 'class': 'grp-muted', text: g.Teacher ? 'Teacher: ' + g.Teacher : '' })];
      if (d.locked) kids.push(el('p', { 'class': 'grp-muted', text: 'Posts and class links are hidden until your fee is paid.' }));
      else if (!g.Posts.length) kids.push(el('p', { 'class': 'grp-muted', text: 'No posts yet.' }));
      else g.Posts.forEach(function (p) { kids.push(postNode(p)); });
      out.push(el('div', { 'class': 'grp-card' }, kids));
    });
    return out;
  }

  /* ---------- staff ---------- */
  function studentPicker(students, chosen, name) {
    var box = el('div', { 'class': 'grp-pick' });
    if (!students.length) box.appendChild(el('p', { 'class': 'grp-muted', text: 'You have no students assigned yet.' }));
    students.forEach(function (s) {
      var cb = el('input', { type: 'checkbox', name: name, value: s.id });
      if (chosen.indexOf(s.id) >= 0) cb.checked = true;
      box.appendChild(el('label', {}, [cb, el('span', { text: s.name + ' (' + s.id + ')' }), s.locked ? el('span', { 'class': 'grp-tag', text: 'fee overdue' }) : null]));
    });
    return box;
  }
  function checked(box) { return Array.prototype.map.call(box.querySelectorAll('input:checked'), function (i) { return i.value; }); }

  function newGroupForm(d) {
    var name = el('input', { type: 'text', maxlength: '60', placeholder: 'For example: Hifdh Group A' }), pick = studentPicker(d.students, [], 'new');
    return el('div', { 'class': 'grp-card grp-f' }, [
      el('h3', { text: 'New group' }), el('label', { text: 'Group name' }), name, el('label', { text: 'Students in this group' }), pick,
      el('button', { 'class': 'grp-btn', text: 'Create group', onclick: function () { act('grp_t_create', { name: name.value, studentIds: checked(pick) }, 'Group created.'); } }),
      el('button', { 'class': 'grp-btn alt', text: 'Cancel', onclick: function () { S.creating = false; render(); } })
    ]);
  }
  function postForm(g) {
    var kind = el('select', {}, [el('option', { value: 'class', text: 'Class link' }), el('option', { value: 'announcement', text: 'Announcement' })]);
    var title = el('input', { type: 'text', maxlength: '120', placeholder: 'Title, for example: Today 5pm' });
    var body = el('textarea', { maxlength: '2000', placeholder: 'Message (optional)' });
    var link = el('input', { type: 'url', maxlength: '500', placeholder: 'https://meet.google.com/...' });
    var when = el('input', { type: 'datetime-local' });
    var pin = el('input', { type: 'checkbox' });
    pin.checked = true;
    var mail = el('input', { type: 'checkbox' });
    mail.checked = true;
    return el('div', { 'class': 'grp-f' }, [
      el('label', { text: 'What are you posting?' }), kind, el('label', { text: 'Title' }), title, el('label', { text: 'Message' }), body,
      el('label', { text: 'Link (required for a class)' }), link, el('label', { text: 'Class time (optional)' }), when,
      el('label', {}, [pin, ' Pin this class at the top (replaces the old pin)']),
      el('label', {}, [mail, ' Email students who are up to date (the email does not contain the link)']),
      el('button', { 'class': 'grp-btn', text: 'Post to group', onclick: function () {
        act('grp_t_post', { groupId: g.GroupID, kind: kind.value, title: title.value, body: body.value, link: link.value, when: when.value, pinned: pin.checked && kind.value === 'class', email: mail.checked }, 'Posted.');
      } })
    ]);
  }
  function groupCard(g, d) {
    var kids = [el('h3', { text: g.Name }),
      el('div', { 'class': 'grp-muted', text: g.members.length + ' student' + (g.members.length === 1 ? '' : 's') + (g.lockedCount ? ' · ' + g.lockedCount + ' locked out for overdue fees' : '') + (g.Owner && !g.mine ? ' · ' + g.Owner : '') })];
    var open = !!S.open[g.GroupID];
    kids.push(el('button', { 'class': 'grp-btn alt', text: open ? 'Hide' : 'Open', onclick: function () { S.open[g.GroupID] = !open; render(); } }));
    if (open) {
      kids.push(postForm(g));
      kids.push(el('h3', { text: 'Posts' }));
      if (!g.Posts.length) kids.push(el('p', { 'class': 'grp-muted', text: 'Nothing posted yet.' }));
      g.Posts.forEach(function (p) {
        var node = postNode(p);
        node.appendChild(el('button', { 'class': 'grp-btn bad', text: 'Delete post', onclick: function () { if (window.confirm('Delete this post?')) act('grp_t_unpost', { postId: p.PostID }, 'Post deleted.'); } }));
        kids.push(node);
      });
      kids.push(el('h3', { text: 'Students' }));
      if (S.editing === g.GroupID) {
        var pick = studentPicker(d.students, g.members.map(function (m) { return m.id; }), 'mem');
        kids.push(pick, el('button', { 'class': 'grp-btn', text: 'Save students', onclick: function () { act('grp_t_members', { groupId: g.GroupID, studentIds: checked(pick) }, 'Students saved.'); } }),
          el('button', { 'class': 'grp-btn alt', text: 'Cancel', onclick: function () { S.editing = null; render(); } }));
      } else {
        kids.push(el('div', {}, g.members.map(function (m) { return el('div', {}, [m.name + ' ', m.locked ? el('span', { 'class': 'grp-tag', text: 'fee overdue' }) : null]); })));
        kids.push(el('button', { 'class': 'grp-btn alt', text: 'Change students', onclick: function () { S.editing = g.GroupID; render(); } }));
      }
      kids.push(el('div', {}, [
        el('button', { 'class': 'grp-btn alt', text: 'Rename', onclick: function () { var n = window.prompt('New name for this group', g.Name); if (n) act('grp_t_rename', { groupId: g.GroupID, name: n }, 'Renamed.'); } }),
        el('button', { 'class': 'grp-btn bad', text: 'Delete group', onclick: function () { if (window.confirm('Delete the group "' + g.Name + '"? Students will no longer see it.')) act('grp_t_delete', { groupId: g.GroupID }, 'Group deleted.'); } })
      ]));
    }
    return el('div', { 'class': 'grp-card' }, kids);
  }
  function notifyBox(n) {
    var kids = [el('strong', { text: 'Students told about this post' })];
    var line = [];
    line.push(n.emailed + ' emailed');
    if (n.noEmail) line.push(n.noEmail + ' with no email address');
    if (n.lockedSkipped) line.push(n.lockedSkipped + ' not told because their fee is overdue');
    kids.push(el('div', { text: line.join(' · ') }));
    if (n.quotaStopped) kids.push(el('div', { 'class': 'grp-err', text: 'The daily email limit was reached, so some students were not emailed. Use the WhatsApp buttons below.' }));
    var wa = (n.whatsapp || []).filter(function (x) { return /^https:\/\/wa\.me\//.test(String(x.link || '')); });
    if (wa.length) {
      kids.push(el('div', { 'class': 'grp-muted', text: 'Tap a name to send them a WhatsApp message (it does not contain the class link):' }));
      wa.forEach(function (x) { kids.push(el('a', { 'class': 'grp-btn alt', href: x.link, target: '_blank', rel: 'noopener noreferrer', text: x.name || 'Student' })); });
    }
    return el('div', { 'class': 'grp-card' }, kids);
  }
  function staffView(d) {
    var out = [el('p', { 'class': 'grp-muted', text: 'Post the class link here instead of WhatsApp. Students whose fee is overdue cannot see the posts or links until they pay.' })];
    if (S.notify) out.push(notifyBox(S.notify));
    if (S.creating) out.push(newGroupForm(d));
    else out.push(el('button', { 'class': 'grp-btn', text: 'New group', onclick: function () { S.creating = true; render(); } }));
    if (!d.groups.length && !S.creating) out.push(el('p', { 'class': 'grp-muted', text: 'You have no groups yet.' }));
    d.groups.forEach(function (g) { out.push(groupCard(g, d)); });
    return out;
  }

  function render() {
    if (!S.ov) return;
    var body = S.body;
    while (body.firstChild) body.removeChild(body.firstChild);
    if (S.err) body.appendChild(el('div', { 'class': 'grp-err', role: 'alert', text: S.err }));
    if (S.msg) body.appendChild(el('div', { 'class': 'grp-ok', role: 'status', text: S.msg }));
    if (S.busy && !S.data) body.appendChild(el('p', { 'class': 'grp-muted', text: 'Loading...' }));
    if (S.data) (S.cfg.staff ? staffView(S.data) : studentView(S.data)).forEach(function (n) { body.appendChild(n); });
    if (S.busy && S.data) body.appendChild(el('p', { 'class': 'grp-muted', text: 'Working...' }));
    if ((S.notify || S.msg || S.err) && body.parentNode) body.parentNode.scrollTop = 0;   // show the result of what was just done
  }
  function close() { if (S.ov && S.ov.parentNode) S.ov.parentNode.removeChild(S.ov); S.ov = null; S.data = null; S.msg = ''; S.err = ''; document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open() {
    if (S.ov) return;
    S.body = el('div', {});
    S.ov = el('div', { 'class': 'grp-ov', onclick: function (e) { if (e.target === S.ov) close(); } }, [
      el('div', { 'class': 'grp-p', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Class groups' }, [
        el('div', { 'class': 'grp-h' }, [el('h2', { text: 'Class groups' }), el('button', { 'class': 'grp-x', text: 'Close', onclick: close })]), S.body])
    ]);
    document.body.appendChild(S.ov);
    document.addEventListener('keydown', onKey);
    load();
  }

  function start() {
    var c = cfg();
    if (!c || !apiUrl() || typeof document === 'undefined') return;
    S.cfg = c;
    var st = el('style', { text: CSS });
    document.head.appendChild(st);
    var fab = el('button', { 'class': 'grp-fab', type: 'button', text: 'Class groups', onclick: open });
    document.body.appendChild(fab);
    // The button only shows while the person is signed in (the page keeps their ID and code in sessionStorage).
    function sync() { var on = !!creds(c); fab.classList[on ? 'add' : 'remove']('on'); }
    sync();
    setInterval(sync, 1500);
  }

  window.ClassGroups = { PAGES: PAGES, pageName: pageName };
  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
