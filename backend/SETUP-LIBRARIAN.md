# Librarian portal

The librarian signs in at **himaayahschools.com/librarian** with a Librarian ID and access code, then adds, edits, hides and
link-checks library items from a form. The portal can only read and write the **Library** tab. It cannot see students,
payments or quizzes.

## Install
1. In Apps Script, add a file named `Librarian` and paste in `Librarian.gs`.
2. Replace `Library.gs` and `Code.gs` with the new versions (Library.gs gains three columns, Code.gs routes the new actions and adds a menu item).
3. Reload the spreadsheet. In the **Himaayah** menu, choose **Set up the Librarians tab**.
4. In the **Librarians** tab, row 2: an ID (for example `LB-001`), the librarian's name, a strong access code and `TRUE`.
   Give him a code he then changes himself under **Account**.
5. The first time he checks links, Apps Script asks to allow "connect to an external service". Approve it once (Deploy > Manage deployments, or run `lb_check_` from the editor).
6. Deploy > Manage deployments > edit the existing deployment > **New version** > Deploy.
7. Deploy the frontend (`librarian.html`, `js/auth-guard.js`, `css/styles.css`).

## What he can do
- **Items:** search, filter by subject, level or hidden, open an item to change it, hide it from students or show it again. Nothing is deleted.
- **Add an item:** title, author, format (PDF, Book or Link), subject, link, description, date and the levels it is for.
- **Check links:** tests every visible item's link, lists broken ones, and flags sites that block automatic checks.
- **Account:** change his own access code.

Rows typed by hand in the Library tab get an ItemID automatically the first time the page loads. Do not edit the ItemID, UpdatedBy or Updated columns.
To remove a librarian, set Active to FALSE in the Librarians tab.
