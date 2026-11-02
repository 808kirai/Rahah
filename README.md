Rahah

A study companion for students. Ask about any subject, upload notes, slides or textbook pages and get answers that point to the page they came from, practise with flashcards and tests, keep track of exams and classes, or get help writing and fixing code.

Rahah runs on Claude through the Claude API, using Haiku 5.5, Sonnet 5.5 and Opus 5.5 for different work.

What it does today

Chat

- A model picker beside the send arrow, shown as plain text like "Mage Careful", by names that say how hard each one thinks. Students only ever see the names, never the Claude models behind them. Auto, the default, sends everyday questions to Acolyte (Haiku 5.5) and maths, science and code to Mage (Sonnet 5.5). Students can pick Acolyte or Mage themselves (10 Mage answers a day on the free plan, after that auto uses Acolyte), and the admin also gets Archmage (Opus 5.5). The choice is saved with the account, each answer shows which model wrote it, and a student asking for Archmage is turned away before anything is spent. Haiku sometimes waits in a queue for a minute or more before it starts, so if Acolyte hasn't started an answer within 20 seconds, Rahah drops that request and asks Mage instead. An answer that has started is never cut off, and the usage box counts how often this happens
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
- Friends and a weekly leaderboard: the trophy at the top opens the Leaderboard, where a student sees this week's points for themselves and their friends, ranked, and how many friends are above them. Every board shows only the top 5, and the student's own place still shows in their standing. An oval Overall, Friends switch shows the same week across every student instead, leaving out anyone who turned off being found, with everyone's pictures shown. The admin is left off every leaderboard, friends' too, until they turn on Show me on the leaderboard on their Account tab. Each row has the points in a circle marked pts, and the top three, once they've scored, get their place number and circle in gold, silver and bronze with a matching trophy, while fourth and below stay grey. Points: 1 for each test mark (each test's best this week), 1 for each flashcard practised, 1 for every 6 minutes spent studying, and 5 for each day something was studied. The week starts on Monday at midnight Kenya time (RAHAH_LEADERBOARD_ZONE)
- Study time only counts minutes the student is interacting: a minute is added only if, during that minute, the page was showing and they tapped, clicked, typed, or scrolled with a finger or the mouse wheel. Rahah scrolling itself while an answer streams in doesn't count, made up events from scripts are ignored, a minute can't be counted twice, and a day stops at 10 hours
- Under the week's ranking sit three cards side by side: Add friends, Your friends, and Your standing, which shows the points needed to pass the friend just ahead (or the lead over the one behind), a bar against the leader, this week against last week, test accuracy and where it ranks among friends who took tests, and study time
- Profile photos: a student picks any picture from their gallery on the Account tab, or taps the pen on their picture, then crops it: the photo fills a square, they drag it and zoom with a slider or the mouse wheel until the part they want sits in the circle, and that square is cut out at up to 512 pixels before uploading, then the server opens it with Pillow and draws it again as a 256 pixel jpeg, turned the right way up, so nothing hidden inside the file, like where it was taken, is kept. The student, friends they've accepted, and other students on the overall leaderboard can see it, unless the student turned off being found, then only friends; search results and waiting requests show the first letter. It takes the logo's place before Rahah's name at the top of every tab, where it opens the Account tab, and shows on the leaderboard. Photos are kept on the disk beside the database, and go when the photo is removed or the account is deleted
- Friends are found by username or name, and only see each other's username and first name. A request has to be accepted, either side can remove the other, and a student can send up to 30 requests a day and have up to 200 friends. Friend search on the Account tab turns off being found. The Leaderboard has its own people search, and the Chats & Tests search finds people too
- In a test, Previous steps back through questions already answered to read them again: the answer given, the right answer and the explanation or marking, with nothing that can be changed. Next steps forward, and something half written on the current question is kept. The score at the end sits in a ring that fills to the share of marks, green from 70 percent, blue from 40 and mauve below, with the percentage large in the middle and the marks under it, and a short message below that fits the score, from Full marks. Brilliant work! down to Tough one. Ask Rahah to explain it, then have another go.
- Rahah Pro and Max: passes bought by M-Pesa or card through Paystack. Prices are set in dollars ending in .99 and charged in shillings at KES 129 to $1 (kes_per_usd in app/billing.py): Pro is $1.99 a week, $3.99 a month or $11.49 a term and gives 10 times the daily limit; Max is $2.99, $5.99 or $16.99 and gives 20 times. The plan cards show only the dollar price, with a note that payment is in shillings. Each pass has a fair-use total of about 70% of its price (Pro $1.40, $2.80, $8.05; Max $2.10, $4.20, $11.90) so no student costs more than they paid; once that's used they're on the free limit until the pass ends. A pass bought while another runs starts when it ends, except Max bought during Pro, which starts now while the Pro days left (and the Pro allowance left) move to after it. Passes bought before Max existed count as Pro. The Account tab shows Free, Pro and Max as plan cards side by side with an oval Week, Month, Term switch for the prices, each with Rahah's chevrons as its icon, the price and price per day, a full width button and what it gives (a swipe row on phones), sends the student to Paystack's own page and checks the payment with Paystack when they come back; Paystack's signed webhook gives the pass too, in case they close the page. Every payment is checked against the plan's price and currency before a pass is given, and only once. Pro students don't count towards the shared free budget, the Students page marks them, and a student who runs out of the free limit is pointed to Pro. It stays hidden until PAYSTACK_SECRET_KEY is set
- What Pro adds, and what the free plan keeps: free students see their 5 newest chats (with a note that older ones are saved for Pro) and search only those, get 10 Mage answers, 5 web searches (after that Claude answers from what it knows and says Pro has more) and 5 photo markings a day, and 25 notes. Pro opens unlimited Mage, all chats and search, unlimited searches and photo marking, a weekly parent report, 200 notes, and uploads up to twice the size. Max gives everything in Pro with 500 notes, and its plan card lists it all as everything in Free, plus. An exam day pass gives 5 times the limit for 24 hours for $0.49
- A receipt email when a purchase goes through, once per payment: a short plain text email with the details and the terms link, and the receipt attached as a picture drawn with Pillow in Inter (bundled in app/fonts with its licence): a navy to teal banner with the Rahah logo thanking the student by first name, the total in dollars, the plan, daily limit, dates on the student's clock, the shillings charged, the reference and what the plan gives (`app/receipt.py`). It goes out only when email is set up
- A 3 day free trial of Pro, once per account and at most 2 from one connection a day, capped at 30 cents
- Invite friends: each student has an invite link (/?ref=username). Someone who signs up through it is remembered, and when they first buy a pass the friend who invited them gets 3 days of Pro free, once per friend
- Weekly report for a parent: a student adds a parent or guardian's email on the Account tab, and while they're on Pro the parent gets a short email every Sunday from 6pm Kenya time with study time, days studied, tests and their average, flashcards, questions asked, and the strongest and weakest subject. Never chats or answers. Sent once a week
- Long chats send only their later part to Claude, dropping older messages in blocks of 20 so the cache keeps working between drops, and keeping the subject note
- Pro and Max badges are the plain bold word, white in dark mode and black in light with a thin outline in the other colour, sitting at the far right of each leaderboard row and a little larger there. Pro students get a blue ring round their picture at the top, Max students a blue to teal double ring
- An Install Rahah card at the top, a few seconds after signing in: an Install button where the browser offers one (Android, Chrome and Edge on a computer), and the Share, then Add to Home Screen steps on an iPhone. It never shows once Rahah is installed, and closing it, or saying no, keeps it away for two weeks
- Share a test or deck: Share makes a private link, sent through the phone's share menu or copied. A friend who opens it sees what it is and who shared it, and Add to my tests copies it into their own account, with no AI used. Their answers and scores are their own, and the owner's best score doesn't come across. Someone signed out signs in or makes an account first, then lands on it. Stop sharing turns the link off, and copies already added stay
- Phone notifications for reminders, even when Rahah is closed: Turn on notifications on the Reminders page signs that phone or browser up, and on each reminder day a notification arrives at 9am in the student's own time zone. Tapping it opens Reminders. Each day is sent once, a phone that turns notifications off is forgotten, and signing out stops them on that device. Rahah only sends to the real push services of Google, Apple, Mozilla and Microsoft, and signs each notification with a key pair it makes once and keeps in its database. On iPhone, notifications need Rahah added to the home screen first, and the page says so
- Add to calendar gives each student a private calendar link with every upcoming reminder and their weekly classes, with alerts. An iPhone or Mac adds it in one tap, Google Calendar opens it to add, and the calendar checks it for changes, so new reminders and classes show up by themselves. Make a new link stops the old one working, and single reminders and revision plans can still be downloaded as calendar files
- Every card has a small hand drawn sketch of what it's about, which draws itself in once when the card first shows

Accounts

- Students sign up with a username, email and a password typed twice to catch typos, and sign in with either the username or the email. Usernames keep their capitals and must be typed the same way to sign in, and two usernames can't differ only in capitals. Emails work in any case
- Passwords need 8 or more characters and at least one special character, like ! # @ or ?
- Each student's chats, tests, decks, notes, reminders, timetable, subjects, suggestions, progress and usage are their own. Nobody else can list, open, change or use them, and every route checks this on the server
- The first account is the admin. It takes over everything made before accounts and sees the total usage and every student's answer ratings in the usage box on the Account tab
- Passwords are hashed with scrypt and never stored as typed. Signing in sets a session cookie for 30 days that the page's script can't read, and only a hash of the session is stored
- Wrong passwords are slowed down: after 5 tries for one name or address there's a 15 minute wait
- A failed sign in says which part is wrong: no account with that username or email, or the password isn't right. An account made with Google or Apple is told to use that button
- The Account tab shows who's signed in, with their name and email to edit, Google and Apple to connect, a password change that asks for the new password twice and signs out other devices, today's limit or, for the admin, usage and cost and a way to the Students page, and sign out
- The answer language sits at the bottom of the model menu by the send arrow, and low-data mode is a card on the Account tab. Both are saved with the account, so they follow the student to another device
- Signing out, or someone else signing in on the same device, clears the copies saved for offline use, so one student never sees another's decks
- Each student has a daily allowance, 15 cents by default (RAHAH_DAILY_CAP), ten times that with Rahah Pro and twenty with Max, counted from the usage log and reset at the student's own midnight. The page sends the device's time zone, saved with the account and changeable once a week so hopping zones can't start a new day early; until it's known, Kenya time is used. The free-plan daily counts (Mage, searches, photo marking) follow the same midnight, while the shared free budget for everyone resets at midnight UTC. Once it's used, anything that calls Claude says so and when it starts again, while saved flashcards and tests still work. Students see only the share of today's limit they've used, as a bar with a percentage, never what anything costs, and the server doesn't send them any money figures. The admin has no limit
- The admin's Students page, from Manage students on the Account tab, lists every student with when they joined and were last seen, what they've cost today, what's left of their limit and the share used as a bar, their cost this week and in all, and totals. Above the table are cards for new students this week (against the week before), how many students are active today with the average each has cost, and how many are at or near their daily limit, the admin's own account left out. Money is shown to the cent. The admin can set a student's own daily limit, give a new password to a student who forgot theirs, and turn an account off, which signs them out and stops them signing in
- Sign in with Google and Apple, once their ids are set. A Google or Apple sign in either signs into the account it's linked to or makes a new one, with a username from the email or name. It never joins an account just because the email matches, since emails aren't checked at sign up, so a student with a password account connects Google or Apple from the Account tab while signed in. Accounts made this way can add a password later
- Google and Apple tokens are checked on the server against the provider's published keys, for this app's id, from the right issuer and not expired, before anything in them is used
- Help goes to studywithrahah@gmail.com (RAHAH_SUPPORT_EMAIL). Every help link opens Gmail with a short message already written for the trouble, with the student's username and email added: Forgot password on the sign in page, the password card, the turned off account notice, and the Help card on the Account tab, which has choices for something not working, reporting something unsafe, the daily limit, a password reset, an account question or anything else. A computer opens Gmail's compose page in a new tab, an iPhone tries the Gmail app first and falls back to the phone's mail app, and Android opens the email link, which goes to Gmail on most phones. A forgotten password is reset by the admin from the Students page after the student emails in from the address on their account
- New accounts, by password, Google or Apple, tick a box agreeing to the terms and privacy page, and that a parent or guardian said yes if they're under 18, as Kenya's Data Protection Act asks. The server refuses a new account without it and records when it was ticked. Signing back in doesn't ask again
- Young students: many are under 18, so Rahah follows Anthropic's guidelines for products used by minors. The page says Rahah is an AI, Claude is told to keep everything suitable for school, never to claim to be human, to refuse romantic, sexual, dangerous or hurtful requests, not to ask for personal details, and to point a student in danger to a trusted adult, Childline Kenya on 116, Kenya Red Cross on 1199, or 999 and 112. Report something unsafe on the Help card emails a report, and the privacy page and terms explain these safeguards
- The Account tab runs in this order: profile with Sign out and a Low-data mode switch beside the password card, the plans, today's limit with a line on the student's pace (on track for today, or for a Pro pass whether it lasts its whole length or when it would run out at this rate, with its own bar), then their picture and friend search, help, and deleting the account
- Students can delete their own account from the bottom of the Account tab, after typing their password, or their username for a Google or Apple account. Everything in it goes: chats, tests, decks, notes, reminders, progress and usage, their files kept with Claude, and the copies saved on that device. The admin account can't be deleted this way
- Forgot password on the sign in page emails a link once RAHAH_SMTP_USER and RAHAH_SMTP_PASSWORD are set, sent through Gmail from studywithrahah@gmail.com. The link works once, for 30 minutes, and only the newest one works. It opens a page to choose a new password, which signs the account out everywhere else and signs in here. The reply is the same whether or not the account exists, the email goes out after the reply so timing gives nothing away, and asking is limited to 3 emails an hour per account and 10 per connection. The token sits after the # in the link, so it never reaches server logs. Without those settings, Forgot password says to email for help as before
- Not yet: checking a new account's email

Security

- Money: each student has a daily allowance, and every student together has a daily budget (10 dollars by default, RAHAH_DAILY_BUDGET), so many accounts can't run up the bill. One internet connection can make 20 accounts a day (a school can share one connection), and a student can have only 2 answers running at once, so firing many at once can't outrun the allowance
- Admin: set RAHAH_ADMIN_EMAIL before Rahah goes online, then only the account with that email is the admin and takes the data made before accounts. Without it the first account is the admin, which is fine on your own computer
- The browser is told exactly which sites may run code, load styles and fonts, and show sign in frames, and nothing else runs, including anything slipped into the page. The one small script written into the page is allowed by its exact fingerprint. Another site can't show Rahah inside its own page, files aren't guessed at by type, and the camera and microphone are only for Rahah itself
- The libraries Rahah loads from other sites are checked against their exact fingerprints, so a changed file is refused. Google's and Apple's sign in scripts change often and can't be fingerprinted
- Changes have to come from Rahah's own pages, on top of the session cookie only being sent by Rahah's own pages, and oversized requests are turned away before they're read
- Answers from Claude are cleaned before they're shown, maths is drawn without running anything, diagrams go in as images, files from code runs download instead of opening on Rahah's address, and links in answers open in a new tab that can't reach back into Rahah
- Sign in says whether the name or the password is wrong, chosen for students over hiding which accounts exist. The wait after 5 wrong tries still stops guessing, and the record of wrong tries can't be grown without end
- The automatic API pages (/docs, /openapi.json) are switched off
- Once Rahah is on https, set RAHAH_HTTPS=1, so the session cookie is only sent over https and browsers are told to stay on it
- Online, the sign up and sign in limits count each visitor by the address their host's proxy puts in its own header (RAHAH_CLIENT_IP_HEADER), not x-forwarded-for, which visitors can write into themselves. The admin can check which address headers arrive at /api/admin/address
- Still to come with deployment: email checks and password reset by email, and keeping the per connection limits in a shared store if Rahah ever runs on more than one server

Look and feel

- The logo is three rising chevrons on a dark circle, the top one in Rahah's blue, used exactly as designed in every theme. It sits beside the name in the top bar and on the sign in page, marks each answer, and is the browser tab icon (static/img/logo.svg) and the app icon on phones and computers
- A near black navy theme with soft teal glows and a solid blue accent, after a Dribbble reference, and a matching light theme
- Faint see through cards and boxes, with a soft shadow in light mode
- The tabs and message box float over the page with a fade underneath, like a streaming app. The message box shows on Home, Chats & Tests and in a chat. On Reminders, Performance, Account, Students and decks and tests it fades and shrinks away while the tabs glide to the middle, and comes back the same way. On phones, on Home and Chats & Tests, the message box sits at the top under the top bar instead of above the tabs, with its menus opening downwards, and in a chat it's back at the bottom where replies are typed. On other pages it folds away
- Popups close with a click outside them, and ease in when they open and out when they close, whether by a button, Escape or a click outside. On phones they slide up from the bottom and back down. Pages fade and lift in when you change tab, chat or deck. Anyone with reduced motion turned on gets no animation
- The sign in page has the form on the left with Google and Apple as matching outlined ovals (Google's own button sits unseen over ours, so the click still goes to Google), outlined boxes, a Forgot password link and a link to switch between signing in and making an account, and the halftone picture from the reference design on the right. It's kept as a small shading map (static/img/auth-art.png, 17 KB) and redrawn as crisp diamond dots at the screen's own size, dark on the light page and light on the dark one. Phones get the form alone
- How Rahah answers:
  - Answer language, at the bottom of the model menu, from 18 including Kiswahili, Arabic, French, Amharic, Somali, Hindi and Chinese. Rahah answers and makes tests and decks in it, gives the English term in brackets for key subject words, and Listen reads in that language
  - Low-data mode, on the Account tab, for slow or costly connections: shorter answers, no web searches unless asked, smaller photos, no downloaded font, and diagrams shown as text with a Draw button
  - Chips above the message box show what's on, and each one turns off with a tap
- Offline studying: flashcard decks, tests, opened chats, reminders and the timetable still open without internet, a notice says so, and progress made offline is saved once back online
- Rahah can be installed as an app. On Android, Chrome offers Install app or Add to Home screen, on iPhone it's Share then Add to Home Screen, and on a computer Chrome and Edge show an install button in the address bar. It then opens full screen with its own icon, keeps clear of the notch and home bar, and shows a friendly page when there's no internet
- On phones the whole app is a size smaller, so it reads like a small copy of the website, with two chats per row and a full width message box above the tabs

Setup

You need Python 3.12 and an API key from platform.claude.com.

1. Create a virtual environment outside OneDrive, so OneDrive doesn't sync thousands of package files

    python -m venv C:\Users\altru\venvs\rahah

2. Install the packages

    C:\Users\altru\venvs\rahah\Scripts\python -m pip install -r requirements-dev.txt

    requirements.txt holds exactly the versions that were tested, which is all the server installs. requirements-dev.txt adds pytest for running the tests. To update a package, change its version there, run the tests, and check it at osv.dev for known problems

3. Copy .env.example to .env and paste your key after ANTHROPIC_API_KEY=

4. Start the server. With --reload it restarts by itself whenever the code changes

    C:\Users\altru\venvs\rahah\Scripts\python -m uvicorn app.main:create_app --factory --reload --port 8000

5. Open http://127.0.0.1:8000 in a browser and create your account. The first account made becomes the admin and takes over every chat, test, note and reminder made before accounts existed, so make yours before anyone else signs up

Going online with Render

render.yaml in the repo sets everything up: a Starter server that stays on, a 1 GB disk holding the database at /var/data, a health check at /api/health, and https on an onrender.com address. It comes to about 7.25 dollars a month.

1. On render.com, choose New, then Blueprint, and pick the Rahah repo on GitHub
2. Check the region in render.yaml first, it can't be changed once the service is made. It's set to frankfurt
3. Fill in the secrets Render asks for: ANTHROPIC_API_KEY, RAHAH_ADMIN_EMAIL, GOOGLE_CLIENT_ID, and for password reset emails RAHAH_SMTP_USER and RAHAH_SMTP_PASSWORD
4. Once it's live, add the onrender.com address to Authorized JavaScript origins for the Google client ID, then sign up with the admin email before sharing the link
5. Signed in as the admin, open /api/admin/address and check that from_header is true, so each visitor is counted by their own address
6. Every push to main updates the site, with under a minute down while it restarts

A backup of the database is made on the same disk each day and kept for a week. Once email is set up, that day's backup is also zipped and emailed to studywithrahah@gmail.com (RAHAH_BACKUP_EMAIL), so losing the disk doesn't lose everything. To restore one, unzip it and put it back on the disk as /var/data/rahah.db while Rahah is stopped.

Problems on the server, like Claude failing or anything that breaks a request, are emailed to the admin (RAHAH_ALERT_EMAIL), gathered into one email at most every half hour so a bad spell doesn't flood the inbox. The full details stay in Render's logs.

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
- `app/billing.py` - Rahah Pro and Max passes and the calls to Paystack
- `app/friends.py` - Leaderboard points and the week they're counted in
- `app/push.py` - Phone notifications for reminders and the calendar link's feed
- `app/alerts.py` - Emails the admin when something breaks, gathered into one email at most every half hour
- `app/mailer.py` - Sends email through Gmail, for password resets, backups and alerts
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
- `static/js/` - The page's script in eight plain files with no build step, loaded in order and sharing one scope: `core.js` (shared helpers, markdown, diagrams), `chat.js` (answers, voice, printing, attachments, settings), `pages.js` (home, chats and tests, notes, suggestions), `reminders.js` (reminders, timetable, revision plans), `study.js` (tool sheets, flashcards, tests), `performance.js` (scores, weekly report, usage), `friends.js` (friends, leaderboard, study time) and `main.js` (conversations, theme, message box, start). Code that runs as a file loads can only use what earlier files define
- `tests/` - Tests with a fake Claude client

Settings

- `ANTHROPIC_API_KEY` - Your Claude API key, required
- `RAHAH_MODEL` - Leave it out for the model picker. Set to one model, like `claude-haiku-5-5`, and every request uses it whatever the picker says, which is handy for cheap testing
- `RAHAH_STALL_SECONDS` - How long Acolyte gets to start an answer before Mage is asked instead, defaults to `20`, and `0` turns it off
- `RAHAH_LIGHT_MODEL`, `RAHAH_DEEP_MODEL`, `RAHAH_TOP_MODEL` - The models behind Acolyte, Mage and Archmage, defaulting to `claude-haiku-5-5`, `claude-sonnet-5-5` and `claude-opus-5-5`
- `RAHAH_EFFORT` - How hard Claude thinks, one of low, medium, high, xhigh or max, defaults to `medium`
- `RAHAH_DB` - Where everything is stored, defaults to `data/rahah.db`
- `RAHAH_MAX_UPLOAD_MB` - The largest file a student can upload, defaults to `30`
- `RAHAH_DAILY_CAP` - What each student on the free plan can spend a day in dollars, defaults to `0.15`. Pro gives 10 times this and Max 20. The admin can change it per student
- `RAHAH_SUPPORT_EMAIL` - Where students write for help and password resets, defaults to `studywithrahah@gmail.com`
- `RAHAH_ADMIN_EMAIL` - The admin's email, set it before going online so nobody else can become admin. Whenever Rahah starts, the account with this email is made admin, so a mistyped email can be fixed after the account exists
- `RAHAH_DAILY_BUDGET` - What all students together can spend a day in dollars, defaults to `10`, `0` turns it off
- `RAHAH_SIGNUPS_PER_IP` - Accounts one connection can make a day, defaults to `20`
- `RAHAH_MAX_RUNNING` - Answers one student can have running at once, defaults to `2`
- `RAHAH_HTTPS` - Set to `1` once Rahah is served over https
- `RAHAH_SMTP_USER`, `RAHAH_SMTP_PASSWORD` - The Gmail address and app password that send password reset emails. Leave them out and Forgot password points to the help email instead. `RAHAH_SMTP_HOST` and `RAHAH_SMTP_PORT` change the provider, defaulting to Gmail on 587, and `RAHAH_PUBLIC_URL` sets the address in links if Render's own isn't there
- `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` - Turn on Rahah Pro and Max. Test keys take pretend payments, live keys take real ones. Set the webhook in Paystack's dashboard to `https://<your address>/api/paystack/webhook`
- `RAHAH_LEADERBOARD_ZONE` - The time zone the leaderboard's week and study days follow, defaulting to `Africa/Nairobi`
- `RAHAH_BACKUP_EMAIL`, `RAHAH_ALERT_EMAIL` - Where the daily backup and problem alerts go once email is set up, defaulting to the sending Gmail account and the admin's email. `off` turns either one off
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

Reminders and classes are worked out from the student's own calendar dates and times, so they land on the right day wherever the page is opened. Phone notifications go through each browser's own push service, so they arrive while Rahah is closed, and the calendar link lets a phone's calendar keep its own copy that stays up to date.

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

- Sign in with Apple once there is a custom domain, and a teacher view
