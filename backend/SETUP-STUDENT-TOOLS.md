# Library, daily tracker and quizzes

These three student pages sign in with the Student ID and access code, the same as the dashboard.
The code lives in `Library.gs`, `Tracker.gs` and `Quiz.gs`, and `Code.gs` routes the requests.

## Install
1. In Apps Script, add three files named `Library`, `Tracker` and `Quiz` and paste in the code.
2. Replace `Code.gs` with the new version (it adds the menu item and comments on the routes).
3. Reload the spreadsheet. In the **Himaayah** menu, choose **Set up the Library, Tracker and Quiz tabs** and approve if asked.
4. Deploy > Manage deployments > edit the existing deployment > **New version** > Deploy. The web app address stays the same.

## Library tab
One row per item: Title, Author, Type (PDF, Book or Link), Subject, Level (All, or a level name), URL (https://), Description,
Added (2026-11-05), Active (leave empty or TRUE to show, FALSE to hide).

## Daily tracker
Today's items come from the **Murajaah** tab (the plan teachers already set: StudentID, Day, Portion).
With no plan for today, the student sees one box, "My revision for today". Ticks are saved in the **RevisionLog** tab.
A day counts when at least one item is ticked. The streak counts back from today, and yesterday keeps it alive until today is ticked.

## Quizzes
- **Quizzes**: QuizID, Title, Subject, Level, Description, PassMark (default 70), Active.
- **QuizQuestions**: QuizID, QuestionID (1, 2, 3 ... inside the quiz), Question, A, B, C, D, Correct (A to D), Explanation. Leave C and D empty for two options.
- **QuizAttempts**: written by the script. Teachers read it. Up to 3 attempts per quiz per day are saved.

Correct answers stay on the server until the student submits.
