# Class groups (replaces the WhatsApp class groups)

## Install
1. Add `backend/Groups.gs` as a NEW file in the Apps Script project next to `Code.gs`.
2. Replace `Code.gs`, `Skills.gs`, `TBC.gs` (and `Fees.gs`, `Academy.gs` from the late-payment fix, included in the same zip).
3. Put `frontend/js/groups.js` in the site, and replace the eight portal pages (each only gains one `<script src="js/groups.js" defer>` line):
   `dashboard`, `teacher`, `tbc-dashboard`, `tbc-facilitator`, `academy-dashboard`, `academy-tutor`, `skills-dashboard`, `skills-tutor`.
4. Redeploy the Apps Script web app (new version). The three tabs `ClassGroups`, `GroupMembers` and `GroupPosts` are created by themselves the first time they are needed.

## Using it
- Teacher / facilitator / mentor / tutor: sign in to your portal page, press **Class groups** (bottom left), **New group**, name it, tick your students. Open the group to post the class link and time or an announcement. Pin a class post to keep today's link at the top.
- Student: sign in, press **Class groups**.
- A student whose fee is overdue (from the day AFTER the due date) sees only the group names and a Pay now button. No posts, no class links. When the payment is applied the due date moves forward and everything comes back at once. Exempt students are never locked.
- The old per-student class link is hidden for overdue students too, and class reminder emails leave the link out.

## Good to know
- Anyone who already saw a class link can still use it. Post a fresh Meet link each day, or turn on "ask to join" in Google Meet, if you need a hard stop.
- Students must open the portal to see posts; nothing is sent to them when you post.
- A teacher can only add their own students. Admin-level staff (Teachers tab Role Admin, lead mentors, Skills tutors with Role Admin) see every group in their programme.
- The Parent page does not show class groups or links.
