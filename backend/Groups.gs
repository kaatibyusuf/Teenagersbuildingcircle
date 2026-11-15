/**
 * Class groups (Groups.gs). Replaces the WhatsApp class groups. Add this as a NEW file next to Code.gs, replace Code.gs, Skills.gs and TBC.gs with the
 * updated copies, and add js/groups.js to the portal pages (see the notes that came with this file).
 *
 * WHO USES IT
 *  - A teacher (Madrasah), facilitator (Teenagers Building Circle), mentor (Academy) or tutor (Skills School) opens "Class groups" on their own portal page,
 *    makes a group, chooses which of THEIR students are in it, and posts: the class link and time, and announcements.
 *  - A student opens "Class groups" on their own dashboard and sees the groups they are in.
 *
 * THE FEE RULE (enforced here on the server, not just hidden on the page)
 *  - The day after a student's due date their status becomes Overdue (payStatus_ in Code.gs). While a student is Overdue they get NO posts and NO class links:
 *    only the names of their groups and a message to pay. The moment the payment is applied they get everything back. Students marked Exempt are never locked.
 *  - The old per-student class link is hidden for Overdue students too (Code.gs, Skills.gs, TBC.gs), and class reminders no longer carry the link.
 *
 * HOW PEOPLE SIGN IN: with the same ID and code as on their own portal page. This file reuses each portal's own sign-in, so the 15 minute lockout still applies.
 * Teachers can only put their own students in a group. Admin-level staff (the Admin role in Teachers, lead mentors, Skills tutors with Role Admin) see all.
 *
 * ACTIONS (all sent as { action, programme, id, code, ... }; programme is madrasah, tbc, academy or skills)
 *   grp_s_list                                          student: their groups and posts (locked if Overdue)
 *   grp_t_list | grp_t_create | grp_t_members | grp_t_rename | grp_t_delete | grp_t_post | grp_t_unpost     staff
 */
const GRP_TABS = {
  ClassGroups: ['GroupID', 'Programme', 'Name', 'OwnerID', 'OwnerName', 'Active', 'Created'],
  GroupMembers: ['GroupID', 'StudentID'],
  GroupPosts: ['PostID', 'GroupID', 'Kind', 'Title', 'Body', 'Link', 'When', 'Pinned', 'AuthorID', 'AuthorName', 'Created']
};
const GRP_PROGS = ['madrasah', 'tbc', 'academy', 'skills'];
const GRP_MAX_GROUPS_PER_OWNER = 30;
const GRP_MAX_MEMBERS = 300;
const GRP_FEED = 40;            // posts a student sees per group
const GRP_STAFF_FEED = 30;      // posts a teacher sees per group

function grp_fail_(m) { throw new Error('USER:' + m); }
function grp_tab_(name) {
  let sh = ss_().getSheetByName(name);
  if (!sh) { sh = ss_().insertSheet(name); sh.getRange(1, 1, 1, GRP_TABS[name].length).setValues([GRP_TABS[name]]).setFontWeight('bold'); sh.setFrozenRows(1); }
  return table_(name);
}
function grp_txt_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n); }
function grp_id_(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 7).toUpperCase(); }
function grp_url_(v) {
  const u = grp_txt_(v, 500);
  if (!u) return '';
  if (!/^https?:\/\/[^\s<>"']+$/i.test(u)) grp_fail_('The link must start with http:// or https://');
  return u;
}

/* The students of one programme, by ID. */
function grp_students_(prog) {
  let rows = [];
  if (prog === 'academy') rows = acd_t_(ACD.Students).rows;
  else if (prog === 'skills') rows = table_(SK.Students).rows;
  else rows = table_('Students').rows.filter(function (r) { return (prog === 'tbc') === !!tbcIs_(r); });
  const map = {};
  rows.forEach(function (r) { if (r.StudentID) map[key_(r.StudentID)] = r; });
  return map;
}

/* Sign-in: reuses each portal's own check. Returns { staff, prog, id, name, row, mine(), admin } or throws a USER error. */
function grp_who_(p) {
  const prog = String(p.programme || '').toLowerCase();
  if (GRP_PROGS.indexOf(prog) < 0) grp_fail_('Unknown programme.');
  const staff = /^grp_t_/.test(String(p.action || ''));
  let a;
  if (!staff) {
    if (prog === 'madrasah' || prog === 'tbc') {
      a = auth_(p.id, p.code);
      if (a.error) grp_fail_(a.error);
      if ((prog === 'tbc') !== !!tbcIs_(a.st)) grp_fail_('This sign-in is for a different programme.');
      return { staff: false, prog: prog, id: String(a.st.StudentID).trim(), name: String(a.st.Name || ''), row: a.st };
    }
    a = prog === 'academy' ? acd_studentAuth_(p) : acd_auth_(SK.Students, 'StudentID', p);
    if (a.error) grp_fail_(a.error);
    return { staff: false, prog: prog, id: String(a.row.StudentID).trim(), name: String(a.row.Name || ''), row: a.row };
  }
  if (prog === 'madrasah' || prog === 'tbc') {
    a = tchAuth_(p.id, p.code);
    if (a.error) grp_fail_(a.error);
    const me = a.me;
    return { staff: true, prog: prog, id: String(me.TeacherID).trim(), name: String(me.Name || ''), row: me, admin: tchAdmin_(me),
      mine: function () { return tchMine_(me).rows.filter(function (r) { return (prog === 'tbc') === !!tbcIs_(r); }); } };
  }
  if (prog === 'academy') {
    a = acd_auth_(ACD.Tutors, 'TutorID', p);
    if (a.error) grp_fail_(a.error);
    return { staff: true, prog: prog, id: String(a.row.TutorID).trim(), name: String(a.row.Name || ''), row: a.row, admin: !!acd_isLead_(a.row), mine: function () { return acd_mine_(a.row); } };
  }
  a = acd_auth_(SK.Tutors, 'TutorID', p);
  if (a.error) grp_fail_(a.error);
  return { staff: true, prog: prog, id: String(a.row.TutorID).trim(), name: String(a.row.Name || ''), row: a.row, admin: sk_isAdmin_(a.row), mine: function () { return sk_mine_(a.row); } };
}

/* ---------- reading ---------- */
function grp_active_(prog) {
  return grp_tab_('ClassGroups').rows.filter(function (g) { return g.GroupID && key_(g.Programme).toLowerCase() === prog && key_(g.Active) !== 'FALSE'; });
}
function grp_membersOf_() {
  const by = {};
  grp_tab_('GroupMembers').rows.forEach(function (m) { if (m.GroupID && m.StudentID) (by[key_(m.GroupID)] = by[key_(m.GroupID)] || []).push(key_(m.StudentID)); });
  return by;
}
function grp_postsOf_(limit) {
  const by = {};
  grp_tab_('GroupPosts').rows.forEach(function (r) { if (r.PostID && r.GroupID) (by[key_(r.GroupID)] = by[key_(r.GroupID)] || []).push(r); });
  Object.keys(by).forEach(function (k) {
    by[k].sort(function (a, b) {
      const pa = key_(a.Pinned) === 'TRUE' ? 1 : 0, pb = key_(b.Pinned) === 'TRUE' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ca = iso_(a.Created, true), cb = iso_(b.Created, true);
      return ca < cb ? 1 : ca > cb ? -1 : (b._row || 0) - (a._row || 0);
    });
    by[k] = by[k].slice(0, limit);
  });
  return by;
}
function grp_postOut_(r, withLink) {
  return { PostID: String(r.PostID), Kind: String(r.Kind || 'announcement'), Title: String(r.Title || ''), Body: String(r.Body || ''),
    Link: withLink ? String(r.Link || '') : '', When: String(r.When || ''), Pinned: key_(r.Pinned) === 'TRUE', Author: String(r.AuthorName || ''), Created: iso_(r.Created, true) };
}

/* ---------- student ---------- */
function grp_studentList_(w) {
  const status = payStatus_(w.row), locked = status === 'Overdue';
  const members = grp_membersOf_(), sid = key_(w.id);
  const mine = grp_active_(w.prog).filter(function (g) { return (members[key_(g.GroupID)] || []).indexOf(sid) >= 0; });
  const posts = locked ? {} : grp_postsOf_(GRP_FEED);
  return { ok: true, role: 'student', programme: w.prog, name: w.name, status: status, locked: locked, nextDue: iso_(w.row.NextDue), payLink: payLink_(w.id),
    message: locked ? 'Your fee was due on ' + nice_(iso_(w.row.NextDue)) + '. Your class groups, class links and announcements are paused until it is paid. They come back as soon as the payment is applied.' : '',
    groups: mine.map(function (g) {
      return { GroupID: String(g.GroupID), Name: String(g.Name), Teacher: String(g.OwnerName || ''),
        Posts: locked ? [] : (posts[key_(g.GroupID)] || []).map(function (r) { return grp_postOut_(r, true); }) };
    }) };
}

/* ---------- staff ---------- */
function grp_ownGroups_(w) {
  return grp_active_(w.prog).filter(function (g) { return w.admin || key_(g.OwnerID) === key_(w.id); });
}
function grp_staffList_(w) {
  const members = grp_membersOf_(), posts = grp_postsOf_(GRP_STAFF_FEED), all = grp_students_(w.prog);
  const who = function (id) {
    const s = all[id];
    return s ? { id: String(s.StudentID).trim(), name: String(s.Name || ''), status: payStatus_(s), locked: payStatus_(s) === 'Overdue' } : null;
  };
  const mine = w.mine().filter(function (s) { return s.StudentID && key_(s.Active) !== 'FALSE'; }).map(function (s) {
    return { id: String(s.StudentID).trim(), name: String(s.Name || ''), status: payStatus_(s), locked: payStatus_(s) === 'Overdue' };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  return { ok: true, role: 'staff', programme: w.prog, name: w.name, admin: !!w.admin, students: mine,
    groups: grp_ownGroups_(w).map(function (g) {
      const ms = (members[key_(g.GroupID)] || []).map(who).filter(Boolean).sort(function (a, b) { return a.name.localeCompare(b.name); });
      return { GroupID: String(g.GroupID), Name: String(g.Name), Owner: String(g.OwnerName || ''), mine: key_(g.OwnerID) === key_(w.id),
        members: ms, lockedCount: ms.filter(function (m) { return m.locked; }).length,
        Posts: (posts[key_(g.GroupID)] || []).map(function (r) { return grp_postOut_(r, true); }) };
    }) };
}
function grp_group_(w, id) {
  const g = grp_ownGroups_(w).filter(function (x) { return key_(x.GroupID) === key_(id); })[0];
  if (!g) grp_fail_('That group was not found.');
  return g;
}
function grp_pickStudents_(w, ids) {
  if (!Array.isArray(ids)) grp_fail_('Choose the students for this group.');
  const allowed = {};
  w.mine().forEach(function (s) { if (s.StudentID && key_(s.Active) !== 'FALSE') allowed[key_(s.StudentID)] = true; });
  const out = [];
  ids.forEach(function (x) {
    const k = key_(x);
    if (!k || out.indexOf(k) >= 0) return;
    if (!allowed[k]) grp_fail_('You can only add your own students.');
    out.push(k);
  });
  if (out.length > GRP_MAX_MEMBERS) grp_fail_('A group can have at most ' + GRP_MAX_MEMBERS + ' students.');
  return out;
}
/* Makes the group's members exactly `ids` (already checked). Rows are deleted from the bottom up because deleting shifts the rows below. */
function grp_setMembers_(groupId, ids) {
  grp_tab_('GroupMembers');
  const sh = ss_().getSheetByName('GroupMembers'), gk = key_(groupId);
  table_('GroupMembers').rows.filter(function (m) { return key_(m.GroupID) === gk && ids.indexOf(key_(m.StudentID)) < 0; })
    .map(function (m) { return m._row; }).sort(function (x, y) { return y - x; }).forEach(function (r) { sh.deleteRows(r, 1); });
  const t = table_('GroupMembers'), have = {};
  t.rows.forEach(function (m) { if (key_(m.GroupID) === gk) have[key_(m.StudentID)] = true; });
  ids.forEach(function (k) { if (!have[k]) append_(t, { GroupID: groupId, StudentID: k }, ['GroupID', 'StudentID']); });
}
function grp_create_(w, p) {
  const name = grp_txt_(p.name, 60);
  if (name.length < 2) grp_fail_('Give the group a name.');
  const ids = grp_pickStudents_(w, p.studentIds || []);
  const t = grp_tab_('ClassGroups');
  if (grp_active_(w.prog).filter(function (g) { return key_(g.OwnerID) === key_(w.id); }).length >= GRP_MAX_GROUPS_PER_OWNER) grp_fail_('You have too many groups. Delete one you no longer use.');
  const id = grp_id_('G-');
  append_(t, { GroupID: id, Programme: w.prog, Name: name, OwnerID: w.id, OwnerName: w.name, Active: 'TRUE', Created: today_() }, ['GroupID', 'Programme', 'Name', 'OwnerID', 'OwnerName']);
  grp_setMembers_(id, ids);
}
function grp_post_(w, p) {
  const g = grp_group_(w, p.groupId);
  const kind = String(p.kind || 'announcement') === 'class' ? 'class' : 'announcement';
  const title = grp_txt_(p.title, 120), body = grp_txt_(p.body, 2000), link = grp_url_(p.link), when = String(p.when || '').trim();
  if (!title && !body) grp_fail_('Write a title or a message.');
  if (kind === 'class' && !link) grp_fail_('Add the class link.');
  if (when && !acd_isWhen_(when)) grp_fail_('Use a date and time like 2026-11-16T17:00.');
  const pinned = kind === 'class' && (p.pinned === true || String(p.pinned) === 'true');
  const t = grp_tab_('GroupPosts');
  if (pinned) t.rows.forEach(function (r) { if (key_(r.GroupID) === key_(g.GroupID) && key_(r.Pinned) === 'TRUE') put_(t, r._row, 'Pinned', 'FALSE'); });
  append_(t, { PostID: grp_id_('P-'), GroupID: String(g.GroupID), Kind: kind, Title: title, Body: body, Link: link, When: when, Pinned: pinned ? 'TRUE' : 'FALSE',
    AuthorID: w.id, AuthorName: w.name, Created: acd_now_() }, ['PostID', 'GroupID', 'Kind', 'Title', 'Body', 'Link', 'When', 'AuthorID', 'AuthorName']);
}

/* ---------- router (called from doPost in Code.gs) ---------- */
function groupsFromRequest(p) {
  try {
    const w = grp_who_(p), act = String(p.action || '');
    if (act === 'grp_s_list') return grp_studentList_(w);
    if (!w.staff) grp_fail_('Unknown action.');
    if (act === 'grp_t_list') return grp_staffList_(w);
    const lock = LockService.getScriptLock(); lock.waitLock(15000);
    try {
      if (act === 'grp_t_create') grp_create_(w, p);
      else if (act === 'grp_t_members') { const g = grp_group_(w, p.groupId); grp_setMembers_(g.GroupID, grp_pickStudents_(w, p.studentIds || [])); }
      else if (act === 'grp_t_rename') { const g = grp_group_(w, p.groupId), n = grp_txt_(p.name, 60); if (n.length < 2) grp_fail_('Give the group a name.'); put_(grp_tab_('ClassGroups'), g._row, 'Name', n, true); }
      else if (act === 'grp_t_delete') { const g = grp_group_(w, p.groupId); put_(grp_tab_('ClassGroups'), g._row, 'Active', 'FALSE'); }
      else if (act === 'grp_t_post') grp_post_(w, p);
      else if (act === 'grp_t_unpost') {
        const t = grp_tab_('GroupPosts'), r = t.rows.filter(function (x) { return key_(x.PostID) === key_(p.postId); })[0];
        if (!r) grp_fail_('That post was not found.');
        grp_group_(w, r.GroupID);   // must be your own group (or admin)
        ss_().getSheetByName('GroupPosts').deleteRows(r._row, 1);
      } else grp_fail_('Unknown action.');
    } finally { lock.releaseLock(); }
    return grp_staffList_(w);
  } catch (err) {
    if (/^USER:/.test(String(err && err.message))) return { ok: false, error: String(err.message).slice(5) };
    console.error(err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
