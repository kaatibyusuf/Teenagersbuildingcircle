/**
 * Madrasah library (library.html)
 *
 * The page signs a student in with their Student ID and access code, then shows the items in the "Library" tab.
 * Setup: none. The "Library" tab is created the first time a student opens the page (or run setupLibrary once).
 *
 * Library tab columns (one row per item):
 *   Title        required
 *   Author       optional
 *   Type         PDF, Book or Link (anything else is shown as a PDF)
 *   Subject      for example Hadith, Tajweed, Arabic, Fiqh
 *   Level        All (or empty) for everyone, or a level name such as Rawdah. Separate several with commas.
 *   URL          required, must start with https:// (or http://)
 *   Description  one or two sentences
 *   Added        date as 2026-11-05, used for "New this month" and sorting
 *   Active       leave empty or TRUE to show, FALSE to hide
 *   ItemID, UpdatedBy, Updated   filled in by the librarian page (librarian.html). Leave them alone.
 *
 * Every signed-in student sees every active item. Items for other levels are marked, and the page hides them
 * until the student chooses "Show other levels too".
 */

const LIB_TAB = 'Library';
const LIB_HEADERS = ['Title', 'Author', 'Type', 'Subject', 'Level', 'URL', 'Description', 'Added', 'Active', 'ItemID', 'UpdatedBy', 'Updated'];

function setupLibrary() {
  lib_table_();
  try { ss_().toast('The Library tab is ready.', SCHOOL_NAME); } catch (e) {}
}
function lib_table_() {
  const ss = ss_();
  let sh = ss.getSheetByName(LIB_TAB);
  if (!sh) {
    sh = ss.insertSheet(LIB_TAB);
    sh.getRange(1, 1, 1, LIB_HEADERS.length).setValues([LIB_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {   // an older tab: add any new columns at the end
    const have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    LIB_HEADERS.forEach(function (h) { if (have.indexOf(h) < 0) { have.push(h); sh.getRange(1, have.length).setValue(h).setFontWeight('bold'); } });
  }
  return table_(LIB_TAB);
}

function libraryRequest(p) {
  const a = auth_(p.id, p.code);
  if (a.error) return { ok: false, error: a.error };
  const st = a.st, lvl = key_(st.Level);
  const items = lib_table_().rows.filter(function (r) {
    return r.Title && /^https?:\/\//i.test(String(r.URL || '').trim()) && key_(r.Active) !== 'FALSE';
  }).map(function (r) {
    const type = String(r.Type || '').trim().toLowerCase();
    return {
      Title: String(r.Title), Author: String(r.Author || ''),
      Type: type === 'link' ? 'Link' : type === 'book' ? 'Book' : 'PDF',
      Subject: String(r.Subject || '').trim() || 'General',
      Level: String(r.Level || '').trim() || 'All',
      Url: String(r.URL).trim(), Description: String(r.Description || ''),
      Added: iso_(r.Added), forMe: matches_(r.Level, [lvl])
    };
  });
  return { ok: true, student: { name: st.Name, level: st.Level }, items: items };
}

/* One menu item sets up the three student tools (Library.gs, Tracker.gs, Quiz.gs). */
function setupStudentTools() {
  setupLibrary(); setupTracker(); setupQuizzes();
  try { ss_().toast('Library, RevisionLog and quiz tabs are ready.', SCHOOL_NAME); } catch (e) {}
}
