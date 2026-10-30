Rahah

A study companion for students. Ask about any subject, upload notes, slides or textbook pages and get answers that point to the page they came from, practise with flashcards and tests, keep track of exams and classes, or get help writing and fixing code.

Rahah runs on Claude through the Claude API, using Haiku 5.5, Sonnet 5.5 and Opus 5.5 for different work.

What it does today

Chat

- A model picker beside the send arrow, shown as plain text like "Mage Careful", by names that say how hard each one thinks. Students only ever see the names, never the Claude models behind them. Auto, the default, sends everyday questions to Acolyte (Haiku 5.5) and maths, science and code to Mage (Sonnet 5.5). Students can pick Acolyte or Mage themselves, and the admin also gets Archmage (Opus 5.5). The choice is saved with the account, each answer shows which model wrote it, and a student asking for Archmage is turned away before anything is spent. Haiku sometimes waits in a queue for a minute or more before it starts, so if Acolyte hasn't started an answer within 20 seconds, Rahah drops that request and asks Mage instead. An answer that has started is never cut off, and the usage box counts how often this happens
- Answers stream in as they are written, and a stop button ends an answer early. What arrived so far is kept, marked as stopped
- Try again under the latest answer asks for a fresh one to the same question, and an answer that failed has its own Try again
- Listen reads an answer aloud with the device's own voice, free and offline, saying simple maths in words and skipping code and citation marks
- Thumbs up and down on every answer. The usage box counts them and lists the answers marked not helpful with their questions, to see where Rahah's instructions need work
- Every answer has Test me and Flashcards, which open the test or deck sheet with that answer attached as notes, so a chat turns into practice in one tap
- Rahah searches the web when a question needs current or very specific facts, shows what it searched for, and links each web source
- Hint mode, in the + menu, has Rahah guide with hints and questions one step at a time instead of giving the answer, until you ask for it after having a go
- Upload PDF, TXT, MD, image and code files and ask questions about them
- Take a photo with the camera, choose one from the gallery or paste a screenshot, for example of a homework question, and large photos are shrunk before they upload
- Talk with Rahah, in the + menu, is a hands-free voice chat: speak, Rahah answers in a few spoken sentences and reads them aloud, then listens again. It shows Listening, Thinking or Speaking above the message box, stopping the reading hands the turn back, and it ends with a tap, on leaving the chat, or after three quiet turns
- Speak a question with the mic, the browser turns it into text in the message box as you talk, in Chrome, Edge and Safari. Claude can't hear audio, so only the words are sent
- In coding mode Rahah runs code in a sandbox to check fixes and show real output, each run is shown as a card with the code, the output and any charts it made, and Python examples get a Run button
- Answers about documents show numbered sources with the page and the quoted passage
- Maths is rendered from LaTeX and code blocks are highlighted with a copy button
- Diagrams: when a picture helps, like a process, a cycle or a timeline, Rahah draws a small flowchart, timeline or mind map. It's written as Mermaid and drawn on the page as an image in the current theme, the drawing library loads only when an answer has one, and a diagram that can't be drawn shows as its text

Subjects

- Subject modes for maths, science, coding, languages and writing, history and humanities, and exam prep, grouped as Study, Exam and Code
- Students can add their own subjects from any subject picker. They are saved, listed under Your subjects, and Rahah teaches them the way that subject is taught. Removing one moves its chats, tests, reminders and classes back to General study

Study tools

- Summaries of uploaded notes or a topic, with the same page sources
- Flashcard decks made from a topic or notes, to flip through and shuffle. After flipping a card you mark it Still learning or Got it. A card you're still learning comes back a few cards later, each card moves up a box from learning to mastered as you get it right, and a deck opens with its new and hardest cards first and says how many you know
- Tests of 5, 10, 15 or 20 questions, multiple choice, written or a mix, and every attempt is kept
- A test opens on a start screen with an optional timer of 10 to 60 minutes. The time left shows beside the question number, and when it runs out the test ends, with unanswered questions counted as missed
- Past paper tests: attach a past exam paper and Rahah turns its own questions into a test, in the paper's order and with the paper's marks, writing a mark scheme and model answer for each
- Written questions come with marks, a mark scheme and a model answer. Answer by typing, by speaking, which the browser turns into text, or with a photo of your working from the camera or gallery, handy for maths. Rahah marks each answer against the mark scheme, says what earned marks and what was missing, and shows the model answer
- Multiple choice questions show why the right answer is right
- A notes library on the Chats & Tests page. Keep class notes, slides and past papers by subject, uploaded once, then ask about one, make a test, flashcards or a summary from it, or pick it with From your notes in the + menu and in any test or deck sheet
- Print or save as PDF on any test, deck or answer. A test prints with answer lines or options and the answer key and mark schemes on a separate page, a deck prints each card's question and answer, and an answer prints with its question and sources
- After a test, Review mistakes lists every question that lost marks with your answer, the right or model answer and why, and Ask Rahah about this opens the Ask sheet with all of it filled in
- This week, at the top of Performance: tests taken, average, cards practised and questions asked over the last seven days next to the seven before, study days with a streak, the strongest and weakest subject, and a next step with a button to start it. It's worked out on the server on the student's own clock, with no Claude cost
- A performance page with your average, your average GPA out of 4.0, scores over time, GPA and grades by subject, and a table of every test, plus a summary under Exam on the home page. Choosing Average GPA opens a box with every subject's GPA as a bar, best first. Choosing a subject opens a box with its tests, and choosing a test opens a box with every attempt and a Retake button
- A Usage and cost box at the bottom of the performance page shows what Rahah has cost today, in the last 7 days and in all, what caching saved, and the cost of each kind of request
- Suggested for you, near the top of Home, with ideas of what to study next picked by Claude from your chats, decks and test scores, up to 5 at a time, and a Refresh button

Pages

- Under the greeting on Home, a short line shows what's on today: flashcards due for practice, the next exam in the coming two weeks, and today's classes, each a shortcut. Cards come due again after 1, 2, 4, 8 or 16 days as they move up a box
- Home is laid out like a streaming app, with rows for each subject and your saved decks and tests. Each Continue row shows up to 5 chats
- The tabs are Home, Chats & Tests, Reminders, Performance and Account
- Chats & Tests lists your saved tests with a New test card, then your chats grouped by day. Search looks inside every message of every chat, older ones too, and shows where the words were found. New chat drops down a box with your 5 newest chats
- Reminders and Timetable splits the page in half. Reminders cover exams, CATs, midterms, assignments and other events, with reminders every few days from a chosen start until the day before and on the day, and a pop up and a desktop notification while Rahah is open. An exam, CAT or midterm can get a revision plan: a day by day plan up to the day before, with a focus and a few tasks each day, buttons that open the right tool for each task, days to tick off, and a calendar file. The weekly timetable lists classes day by day from today, with the class happening now marked
- Calendar files for reminders and for the timetable, so a phone's own calendar reminds you even when Rahah is closed. Each class repeats weekly with an alert 15 minutes before it starts
- Every card has a small hand drawn sketch of what it's about, which draws itself in once when the card first shows

Accounts

- Students sign up with a username, email and a password typed twice to catch typos, and sign in with either the username or the email. Usernames keep their capitals and must be typed the same way to sign in, and two usernames can't differ only in capitals. Emails work in any case
- Passwords need 8 or more characters and at least one special character, like ! # @ or ?
- Each student's chats, tests, decks, notes, reminders, timetable, subjects, suggestions, progress and usage are their own. Nobody else can list, open, change or use them, and every route checks this on the server
- The first account is the admin. It takes over everything made before accounts and sees the total usage and every student's answer ratings in the usage box on the Account tab
- Passwords are hashed with scrypt and never stored as typed. Signing in sets a session cookie for 30 days that the page's script can't read, and only a hash of the session is stored
- Wrong passwords are slowed down: after 5 tries for one name or address there's a 15 minute wait
- The Account tab shows who's signed in, with their name and email to edit, Google and Apple to connect, a password change that asks for the new password twice and signs out other devices, today's limit or, for the admin, usage and cost and a way to the Students page, and sign out
- Settings, the gear at the top, keeps the answer language and low-data mode, which are saved with the account so they follow the student to another device
- Signing out, or someone else signing in on the same device, clears the copies saved for offline use, so one student never sees another's decks
- Each student has a daily allowance, 50 cents by default (RAHAH_DAILY_CAP), counted from the usage log and reset at midnight UTC. Once it's used, anything that calls Claude says so and when it starts again, while saved flashcards and tests still work. Students see only the share of today's limit they've used, as a bar with a percentage, never what anything costs, and the server doesn't send them any money figures. The admin has no limit
- The admin's Students page, from Manage students on the Account tab, lists every student with when they joined and were last seen, what they've cost today, what's left of their limit and the share used as a bar, their cost this week and in all, and totals. Money is shown to the cent. The admin can set a student's own daily limit, give a new password to a student who forgot theirs, and turn an account off, which signs them out and stops them signing in
- Sign in with Google and Apple, once their ids are set. A Google or Apple sign in either signs into the account it's linked to or makes a new one, with a username from the email or name. It never joins an account just because the email matches, since emails aren't checked at sign up, so a student with a password account connects Google or Apple from Settings while signed in. Accounts made this way can add a password later
- Google and Apple tokens are checked on the server against the provider's published keys, for this app's id, from the right issuer and not expired, before anything in them is used
- Help goes to studywithrahah@gmail.com (RAHAH_SUPPORT_EMAIL). Every help link opens Gmail with a short message already written for the trouble, with the student's username and email added: Forgot password on the sign in page, the password card, the turned off account notice, and the Help card on the Account tab, which has choices for something not working, the daily limit, a password reset, an account question or anything else. A computer opens Gmail's compose page in a new tab, an iPhone tries the Gmail app first and falls back to the phone's mail app, and Android opens the email link, which goes to Gmail on most phones. A forgotten password is reset by the admin from the Students page after the student emails in from the address on their account
- Not yet: password reset by email and email checks need an email service, which comes with deployment

Security

- Money: each student has a daily allowance, and every student together has a daily budget (10 dollars by default, RAHAH_DAILY_BUDGET), so many accounts can't run up the bill. One internet connection can make 20 accounts a day (a school can share one connection), and a student can have only 2 answers running at once, so firing many at once can't outrun the allowance
- Admin: set RAHAH_ADMIN_EMAIL before Rahah goes online, then only the account with that email is the admin and takes the data made before accounts. Without it the first account is the admin, which is fine on your own computer
- The browser is told exactly which sites may run code, load styles and fonts, and show sign in frames, and nothing else runs, including anything slipped into the page. The one small script written into the page is allowed by its exact fingerprint. Another site can't show Rahah inside its own page, files aren't guessed at by type, and the camera and microphone are only for Rahah itself
- The libraries Rahah loads from other sites are checked against their exact fingerprints, so a changed file is refused. Google's and Apple's sign in scripts change often and can't be fingerprinted
- Changes have to come from Rahah's own pages, on top of the session cookie only being sent by Rahah's own pages, and oversized requests are turned away before they're read
- Answers from Claude are cleaned before they're shown, maths is drawn without running anything, diagrams go in as images, files from code runs download instead of opening on Rahah's address, and links in answers open in a new tab that can't reach back into Rahah
- Sign in takes as long for a wrong name as for a wrong password, so it doesn't give away which usernames exist, and the record of wrong tries can't be grown without end
- The automatic API pages (/docs, /openapi.json) are switched off
- Once Rahah is on https, set RAHAH_HTTPS=1, so the session cookie is only sent over https and browsers are told to stay on it
- Online, the sign up and sign in limits count each visitor by the address their host's proxy puts in its own header (RAHAH_CLIENT_IP_HEADER), not x-forwarded-for, which visitors can write into themselves. The admin can check which address headers arrive at /api/admin/address
- Still to come with deployment: email checks and password reset by email, and keeping the per connection limits in a shared store if Rahah ever runs on more than one server

Look and feel

- The logo is three rising chevrons on a dark circle, the top one in Rahah's blue, used exactly as designed in every theme. It sits beside the name in the top bar and on the sign in page, marks each answer, and is the browser tab icon (static/img/logo.svg) and the app icon on phones and computers
- A near black navy theme with soft teal glows and a solid blue accent, after a Dribbble reference, and a matching light theme
- Faint see through cards and boxes, with a soft shadow in light mode
- The tabs and message box float over the page with a fade underneath, like a streaming app. The message box shows on Home, Chats & Tests and in a chat. On Reminders, Performance, Account, Students and decks and tests it fades and shrinks away while the tabs glide to the middle, and comes back the same way. On phones it folds away above the tabs
- Popups close with a click outside them, and ease in when they open and out when they close, whether by a button, Escape or a click outside. On phones they slide up from the bottom and back down. Pages fade and lift in when you change tab, chat or deck. Anyone with reduced motion turned on gets no animation
- The sign in page has the form on the left with Google and Apple as matching outlined ovals (Google's own button sits unseen over ours, so the click still goes to Google), outlined boxes, a Forgot password link and a link to switch between signing in and making an account, and the halftone picture from the reference design on the right. It's kept as a small shading map (static/img/auth-art.png, 17 KB) and redrawn as crisp diamond dots at the screen's own size, dark on the light page and light on the dark one. Phones get the form alone
- Settings, the gear at the top, kept on the device:
  - Answer language, from 18 including Kiswahili, Arabic, French, Amharic, Somali, Hindi and Chinese. Rahah answers and makes tests and decks in it, gives the English term in brackets for key subject words, and Listen reads in that language
  - Low-data mode for slow or costly connections: shorter answers, no web searches unless asked, smaller photos, no downloaded font, and diagrams shown as text with a Draw button
  - Chips above the message box show what's on, and each one turns off with a tap
- Offline studying: flashcard decks, tests, opened chats, reminders and the timetable still open without internet, a notice says so, and progress made offline is saved once back online
- Rahah can be installed as an app. On Android, Chrome offers Install app or Add to Home screen, on iPhone it's Share then Add to Home Screen, and on a computer Chrome and Edge show an install button in the address bar. It then opens full screen with its own icon, keeps clear of the notch and home bar, and shows a friendly page when there's no internet
- On phones the whole app is a size smaller, so it reads like a small copy of the website, with two chats per row and a full width message box above the tabs

Setup

You need Python 3.12 and an API key from platform.claude.com.

1. Create a virtual environment outside OneDrive, so OneDrive doesn't sync thousands of package files

    python -m venv C:\Users\altru\venvs\rahah

2. Install the packages

    C:\Users\altru\venvs\rahah\Scripts\python -m pip install -r requirements.txt

3. Copy .env.example to .env and paste your key after ANTHROPIC_API_KEY=

4. Start the server. With --reload it restarts by itself whenever the code changes

    C:\Users\altru\venvs\rahah\Scripts\python -m uvicorn app.main:create_app --factory --reload --port 8000

5. Open http://127.0.0.1:8000 in a browser and create your account. The first account made becomes the admin and takes over every chat, test, note and reminder made before accounts existed, so make yours before anyone else signs up

Going online with Render

render.yaml in the repo sets everything up: a Starter server that stays on, a 1 GB disk holding the database at /var/data, a health check at /api/health, and https on an onrender.com address. It comes to about 7.25 dollars a month.

1. On render.com, choose New, then Blueprint, and pick the Rahah repo on GitHub
2. Check the region in render.yaml first, it can't be changed once the service is made. It's set to frankfurt
3. Fill in the three secrets Render asks for: ANTHROPIC_API_KEY, RAHAH_ADMIN_EMAIL and GOOGLE_CLIENT_ID
4. Once it's live, add the onrender.com address to Authorized JavaScript origins for the Google client ID, then sign up with the admin email before sharing the link
5. Signed in as the admin, open /api/admin/address and check that from_header is true, so each visitor is counted by their own address
6. Every push to main updates the site, with under a minute down while it restarts

A backup of the database is made on the same disk each day and kept for a week.

The privacy page at /privacy says what Rahah keeps, why, who else sees it and how to have it removed. The terms at /terms set the rules: one account each, fair use of the allowance, answers can be wrong, the student's work stays theirs. Both are linked from the sign in page and the Account tab, and Google asks for the privacy address, with the homepage, before Sign in with Google can be published for everyone.

Sign in with Google

1. Go to console.cloud.google.com, make a project, then APIs and services, OAuth consent screen, and fill in the app name and your email
2. Under Credentials, create an OAuth client ID of type Web application
3. Add http://localhost:8000 and http://localhost to Authorized JavaScript origins, plus the real address once Rahah is online. Google doesn't accept 127.0.0.1, so open Rahah at http://localhost:8000 to use it
4. Copy the client ID into .env as GOOGLE_CLIENT_ID= and restart the server

Sign in with Apple

Apple needs a paid Apple Developer account (99 dollars a year) and a real https address, so it waits for deployment. Make a Services ID with Sign in with Apple turned on, add the site's domain and its address as the return URL, and put the Services ID in .env as APPLE_CLIENT_ID=.

Running the tests

The tests use a fake Claude client, so they need no key and cost nothing.

    C:\Users\altru\venvs\rahah\Scripts\python -m pytest -q

Project layout

- `app/main.py` - The web server and its routes
- `app/tutor.py` - The prompt, request building and streaming from Claude, including web search and code runs
- `app/study.py` - Flashcards and tests, asked for as structured JSON and checked before saving, and the marking of written answers
- `app/performance.py` - Test attempts turned into percentages, grades and summaries
- `app/reminders.py` - Reminder dates, checks and calendar files
- `app/plans.py` - Revision plans for exams, asked for as structured JSON and checked, and their calendar file
- `app/timetable.py` - Weekly classes and their repeating calendar file
- `app/recommend.py` - Suggestions of what to study next, asked for as structured JSON from the study history
- `app/usage.py` - What each request to Claude used and cost, and the totals for the usage box
- `app/report.py` - The weekly report, this week next to last on the student's own clock
- `app/modes.py` - Subject modes, the instruction each one adds, and the student's own subjects
- `app/store.py` - Local SQLite storage for chats, files, notes, study sets, reminders, classes and subjects
- `app/routing.py` - Which model answers what: the picker's names, Auto, and the fixed models for making study material and marking
- `app/security.py` - Browser rules and headers, the same site check, the request size cap, and the limits on sign ups and answers running at once
- `app/accounts.py` - Password hashing, sign up checks, sessions and the slow down after wrong passwords
- `app/providers.py` - Checking Google and Apple sign in tokens
- `app/config.py` - Settings read from the environment
- `static/` - The page, its styles, the app manifest, the service worker and the offline page
- `static/js/` - The page's script in seven plain files with no build step, loaded in order and sharing one scope: `core.js` (shared helpers, markdown, diagrams), `chat.js` (answers, voice, printing, attachments, settings), `pages.js` (home, chats and tests, notes, suggestions), `reminders.js` (reminders, timetable, revision plans), `study.js` (tool sheets, flashcards, tests), `performance.js` (scores, weekly report, usage) and `main.js` (conversations, theme, message box, start). Code that runs as a file loads can only use what earlier files define
- `tests/` - Tests with a fake Claude client

Settings

- `ANTHROPIC_API_KEY` - Your Claude API key, required
- `RAHAH_MODEL` - Leave it out for the model picker. Set to one model, like `claude-haiku-5-5`, and every request uses it whatever the picker says, which is handy for cheap testing
- `RAHAH_STALL_SECONDS` - How long Acolyte gets to start an answer before Mage is asked instead, defaults to `20`, and `0` turns it off
- `RAHAH_LIGHT_MODEL`, `RAHAH_DEEP_MODEL`, `RAHAH_TOP_MODEL` - The models behind Acolyte, Mage and Archmage, defaulting to `claude-haiku-5-5`, `claude-sonnet-5-5` and `claude-opus-5-5`
- `RAHAH_EFFORT` - How hard Claude thinks, one of low, medium, high, xhigh or max, defaults to `medium`
- `RAHAH_DB` - Where everything is stored, defaults to `data/rahah.db`
- `RAHAH_MAX_UPLOAD_MB` - The largest file a student can upload, defaults to `30`
- `RAHAH_DAILY_CAP` - What each student can spend a day in dollars, defaults to `0.50`. The admin can change it per student
- `RAHAH_SUPPORT_EMAIL` - Where students write for help and password resets, defaults to `studywithrahah@gmail.com`
- `RAHAH_ADMIN_EMAIL` - The admin's email, set it before going online so nobody else can become admin
- `RAHAH_DAILY_BUDGET` - What all students together can spend a day in dollars, defaults to `10`, `0` turns it off
- `RAHAH_SIGNUPS_PER_IP` - Accounts one connection can make a day, defaults to `20`
- `RAHAH_MAX_RUNNING` - Answers one student can have running at once, defaults to `2`
- `RAHAH_HTTPS` - Set to `1` once Rahah is served over https
- `RAHAH_CLIENT_IP_HEADER` - Online behind a host's proxy, the header holding each visitor's own address, `true-client-ip` on Render. Left blank the address comes from the connection
- `GOOGLE_CLIENT_ID` - Turns on Sign in with Google, see above
- `APPLE_CLIENT_ID` - Turns on Sign in with Apple, see above

How it works

Uploaded files go to the Claude Files API once and are referenced by id after that, so a large PDF isn't sent again with every question. Citations are turned on for every document, which is what gives answers their page numbers.

Each reply is saved as Claude returned it, minus the citation details, and sent back unchanged on every later turn. The citations are kept separately for the page, because Claude rejects page citations into uploaded files when they are sent back. Changing the subject mode adds a short system note to the conversation instead of changing the main prompt, which keeps the earlier part of the chat cached and cheaper.

The chat list sends only the 10 newest chats to the page. Older chats stay saved but aren't listed.

Pressing stop cuts the connection. The server notices, stops the request to Claude so the rest isn't billed, and saves the question with the part of the answer that arrived. Try again removes the latest answer and asks Claude again with the same question.

Web search uses Claude's basic web search tool, at most 3 searches per answer. The newer version filters results by running code of its own, which would show up as code runs in ordinary chats, so it isn't used. The prompt tells Rahah to search only for current or specific facts, so most study questions don't search at all.

Code runs on Anthropic's servers with Claude's code execution tool, in a sandbox with no internet. Each chat keeps its sandbox for about an hour after its last run, so files and installed packages carry over between questions, and a new one starts after that. Charts and files a run makes are fetched through Rahah, and only plain images are shown in the page, anything else is downloaded.

The student's own subjects are saved in the database and joined to the built in ones while the app runs, so every check, prompt and calendar accepts them. For now they are shared by everyone using the same copy of Rahah, and they become per student with student accounts.

Reminders and classes are worked out from the student's own calendar dates and times, so they land on the right day wherever the page is opened. A web page can only remind you while it's open, so reminders and the timetable can also be added to a calendar app with the alerts built in. Once Rahah is online, a calendar link that updates by itself and push notifications become possible.

Tests are scored in marks. A multiple choice question is worth one mark and is checked on the page. A written question is worth what its mark scheme says, and each answer is sent to Claude with the question, the mark scheme and the model answer, plus the photo when there is one. Claude replies with a score and feedback as structured JSON, and the score is kept within the question's marks.

GPA counts each test once, at its best attempt, so practising a test again never lowers it. Grade points are A 4, B 3, C 2, D 1, and E and F 0. A subject's GPA is the average over its tests, and the Average GPA at the top is the average of the subject GPAs, so each subject counts the same however many tests it has.

Installing works through a web app manifest and a small service worker served from the root of the site. The service worker always asks the server first and only uses its saved copy when the network is down, so nothing goes stale online. It saves the app itself, the libraries it loads, every flashcard deck and test (each fetched once after it changes, or only the opened ones in low-data mode), opened chats and the lists the home page shows. Card ratings and test scores made offline wait in the browser and are sent when the internet is back. Once accounts arrive, signing out will need to clear these saved copies. Phones only offer to install a site over HTTPS, so on a phone this works once Rahah is online; on the computer running it, http://127.0.0.1 counts as safe.

The database is backed up when the server starts and then once a day, into data/backups, using SQLite's own backup so each copy is consistent. The latest 7 days are kept. To restore one, stop the server and copy it over data/rahah.db.

Suggestions on Home are saved and only made again by themselves when there are none, or when something new has been studied and the last ones are over 12 hours old, or when Refresh is pressed, so opening Home doesn't cost a request every time.

If Claude's safety checks decline a request, the request is retried on a fallback model automatically. A turn that still fails is not saved, and the question goes back into the message box.

Costs

Every request to Claude is logged with its tokens, cache use and web searches, and priced from Claude's price list, so the usage box shows real spending and per student limits can be built on the same log. Chats are cached, so in a long chat each follow up mostly reads the earlier messages from the cache at a twentieth of the price. A test showed a follow up in a long chat costing about a sixth of what it would without the cache. Very short chats are below the size Claude caches.

Every question is billed to the API key. Rahah spreads the work across three models to keep costs down. Haiku 5.5 (Acolyte) costs 10 cents per million input tokens and 50 cents per million output tokens, five times that once a prompt passes 100,000 tokens, and answers everyday questions and makes flashcards, tests, summaries, suggestions and revision plans. Sonnet 5.5 (Mage) costs 2 and 10 dollars, and answers maths, science and code and marks written answers, where a slip costs the student more. Opus 5.5 (Archmage) costs 4 and 20 dollars and only the admin can pick it. In a live check an everyday answer on Haiku cost about 0.07 cents and a worked maths answer on Sonnet about 0.7 cents. The usage box shows cost per model. A chat keeps one model while its subject and choice stay the same, since the cache only works within one model. A web search costs about 1 cent on top, plus the tokens for reading its results. Marking a written answer is one more request, a little more with a photo. Questions that run code cost more, since the code and its output are read by Claude too. Sandbox time is free for the first 1,550 hours a month per organization, then 5 cents an hour. Per student limits come with student accounts.

Roadmap

- A calendar link that updates by itself and push notifications, now that Rahah can go online
- With deployment: password reset and email checks by email, Sign in with Apple turned on, sharing tests with friends and a teacher view
