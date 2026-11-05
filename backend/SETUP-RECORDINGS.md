# Recitation recordings: setup

Students on **Hifdh, One-Year Hifdh and Muraajah** record or upload a recitation from their dashboard.
Their teacher listens in the teacher dashboard and gives:

- Memorisation out of 10
- Tajwīd out of 10
- Fluency out of 5
- **Pass** or **Repeat**
- A comment for the student

The student sees the mark straight away. A pass on a **New lesson** can also move the student's current sūrah and āyah forward. The teacher ticks a box to do this.

## 1. Add the Apps Script files (about 5 minutes)

Open the Apps Script project that holds `Code.gs`, then:

1. Replace the contents of **Code.gs** with the new `Code.gs`.
2. Replace the contents of **Teacher.gs** with the new `Teacher.gs`.
3. Click **+ → Script**, name it **Recordings**, and paste in `Recordings.gs`.
4. Click **Save**.

## 2. Run the setup once

1. In the function menu at the top, choose **setupRecordings** and click **Run**.
2. Google asks for permission to use **Google Drive**. Click **Review permissions**, choose the school account, then **Advanced → Go to (project) → Allow**.

This creates:

- A **Recordings** tab in the sheet: one row per recording, with the marks.
- A **Himaayah Recitations** folder in the school's Google Drive, with one sub-folder per student.

The folder is private. Students and teachers never get a Drive link. The dashboards fetch the audio through the script after checking the student's or teacher's ID and code. Do not share the folder.

## 3. Deploy a new version

Go to **Deploy → Manage deployments**, click the pencil icon on the web app, set **Version** to **New version**, then **Deploy**.
The web address stays the same. Without this step, the website keeps using the old code.

## Who gets it

A student gets the "Recite to your teacher" card when the **Plan** or **Level** in the Students tab contains *Hifdh* or *Muraajah*. For example: Madrasah — Hifdh Only (Group or Personal), Madrasah — One-Year Hifdh, Madrasah — Muraajah, or the level *Hifdh* or *Muraajah*.
Teachers see recordings only from students assigned to them in the Students tab (the **Teacher** column). Admin teachers see everyone.

## Limits (change them at the top of Recordings.gs)

| Setting | Now |
|---|---|
| Longest recording in the browser | 20 minutes |
| Largest uploaded file | 15 MB |
| Recordings a student can send per day | 6 |
| Unmarked recordings a student can have at once | 5 |

Browser recordings use about 0.5–1 MB a minute, so 15 GB of free Drive space holds a very large number of recitations. To free space, delete old student sub-folders in Drive. The marks stay in the Recordings tab, but those recordings can no longer be played.

## Good to know

- Students can **withdraw** a recording before it is marked. The file goes to the Drive bin.
- Teachers can clear a mark by saving it with no result.
- Uploads accept voice notes and audio files: .ogg, .opus, .m4a, .mp3, .aac, .wav, .amr, .3gp and .webm.
- Recording in the browser needs microphone permission. On iPhone it works in Safari. If a phone blocks the microphone, the student can record a voice note in WhatsApp or the phone's recorder app and upload it instead.

# Daily routine ("Today's routine" on the dashboard)

The same students also get a **Today's routine** card: a numbered list of daily steps that they tick off. These include reading, listening, memorising, reciting by heart with a tap counter, recording, repeating yesterday's lesson, joining it to the page before, and murājaʿah. Muraajah students get a shorter revision routine.

1. Add **Routine.gs** as a new script file, next to Recordings.gs.
2. Replace **Code.gs** with the new one. It adds the routine to the dashboard data.
3. Deploy a **New version**, as in step 3 above.

There is nothing to run. The **Routine** tab is created the first time a student ticks a step. It has one row per student per day: which steps are done, the counter values, and whether the day was complete. You can use it to see who keeps up their routine.

To change the steps, their wording or the counts (for example 20 → 40 times for "Recite the whole portion by heart"), edit `ROUTINES` near the top of the routine section in `dashboard.html`.

# Reminders for the routine and recitations (Nudges.gs)

- **Students:** around 7 pm, each Hifdh, One-Year Hifdh and Muraajah student who hasn't started today's routine gets a short, kind email. It mentions their streak if they have one. If they started but haven't finished and have a streak of 2 or more days, they're reminded to finish.
  - After 5 reminders in a row with no ticks, the reminders pause until the student ticks again, so nobody is emailed every night for weeks.
  - From 3 pm, the dashboard also shows the reminder at the top. It disappears as soon as they tick a step.
- **Teachers:** around 7 am, each teacher with recitations waiting more than 2 days gets one email listing them. Recordings from students with no teacher in the Students tab go to admins (Role = Admin), with a note to assign them.
- Every reminder is also added to the **Reminders** tab, with a ready-to-send WhatsApp link where there's a number. For teachers, add a **WhatsApp** column to the Teachers tab if you want links for them too.

**Setup**
1. Add **Nudges.gs** as a new script file.
2. Run **testNudges**. The Execution log shows who *would* get a reminder today and how many emails are left in today's quota. Nothing is sent.
3. Run **setupNudges** once and allow the permissions. It installs the two daily triggers.

**Settings** are at the top of Nudges.gs: the hours, the 2-day wait, the pause after 5, days to skip (e.g. Friday), and switches to turn student or teacher reminders off.

**Email limit:** a free Gmail account can send about **100 emails a day**, and Google Workspace about 1,500. This is shared with the other reminders. If you have more students than that, set `NG_STUDENT_EMAIL = false`; the reminders then go only to the Reminders tab and the dashboard.
