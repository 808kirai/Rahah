Rahah

A study companion for students. Ask about any subject, upload notes, slides or textbook pages and get answers that point to the page they came from, practise with flashcards and tests, keep track of exams and classes, or get help writing and fixing code.

Rahah runs on Claude Opus 5.5 through the Claude API.

What it does today

Chat

- Answers stream in as they are written, and a stop button ends an answer early. What arrived so far is kept, marked as stopped
- Try again under the latest answer asks for a fresh one to the same question, and an answer that failed has its own Try again
- Rahah searches the web when a question needs current or very specific facts, shows what it searched for, and links each web source
- Upload PDF, TXT, MD, image and code files and ask questions about them
- Take a photo with the camera, choose one from the gallery or paste a screenshot, for example of a homework question, and large photos are shrunk before they upload
- Speak a question with the mic, the browser turns it into text in the message box as you talk, in Chrome, Edge and Safari. Claude can't hear audio, so only the words are sent
- In coding mode Rahah runs code in a sandbox to check fixes and show real output, each run is shown as a card with the code, the output and any charts it made, and Python examples get a Run button
- Answers about documents show numbered sources with the page and the quoted passage
- Maths is rendered from LaTeX and code blocks are highlighted with a copy button

Subjects

- Subject modes for maths, science, coding, languages and writing, history and humanities, and exam prep, grouped as Study, Exam and Code
- Students can add their own subjects from any subject picker. They are saved, listed under Your subjects, and Rahah teaches them the way that subject is taught. Removing one moves its chats, tests, reminders and classes back to General study

Study tools

- Summaries of uploaded notes or a topic, with the same page sources
- Flashcard decks made from a topic or notes, to flip through and shuffle. After flipping a card you mark it Still learning or Got it. A card you're still learning comes back a few cards later, each card moves up a box from learning to mastered as you get it right, and a deck opens with its new and hardest cards first and says how many you know
- Tests of 5, 10, 15 or 20 questions, multiple choice, written or a mix, and every attempt is kept
- Written questions come with marks, a mark scheme and a model answer. Answer by typing, by speaking, which the browser turns into text, or with a photo of your working from the camera or gallery, handy for maths. Rahah marks each answer against the mark scheme, says what earned marks and what was missing, and shows the model answer
- Multiple choice questions show why the right answer is right
- After a test, Review mistakes lists every question that lost marks with your answer, the right or model answer and why, and Ask Rahah about this opens the Ask sheet with all of it filled in
- A performance page with your average, your GPA out of 4.0, scores over time, GPA and grades by subject, and a table of every test, plus a summary under Exam on the home page. Choosing a subject opens a box with its tests, and choosing a test opens a box with every attempt and a Retake button
- A Usage and cost box at the bottom of the performance page shows what Rahah has cost today, in the last 7 days and in all, what caching saved, and the cost of each kind of request
- A Suggestions tab with ideas of what to study next, picked by Claude from your chats, decks and test scores and grouped by topic

Pages

- Home is laid out like a streaming app, with rows for each subject and your saved decks and tests. Each Continue row shows up to 5 chats
- Chats & Tests lists your saved tests with a New test card, then your chats grouped by day, with search across both. New chat drops down a box with your 5 newest chats
- Reminders and Timetable splits the page in half. Reminders cover exams, CATs, midterms, assignments and other events, with reminders every few days from a chosen start until the day before and on the day, a pop up and a desktop notification while Rahah is open, and a Plan revision button. The weekly timetable lists classes day by day from today, with the class happening now marked
- Calendar files for reminders and for the timetable, so a phone's own calendar reminds you even when Rahah is closed. Each class repeats weekly with an alert 15 minutes before it starts
- Every card has a small hand drawn sketch of what it's about, which draws itself in once when the card first shows

Look and feel

- A near black navy theme with soft teal glows and a solid blue accent, after a Dribbble reference, and a matching light theme
- Faint see through cards and boxes, with a soft shadow in light mode
- The tabs and message box float over the page with a fade underneath, like a streaming app
- Popups close with a click outside them
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

5. Open http://127.0.0.1:8000 in a browser

Running the tests

The tests use a fake Claude client, so they need no key and cost nothing.

    C:\Users\altru\venvs\rahah\Scripts\python -m pytest -q

Project layout

- `app/main.py` - The web server and its routes
- `app/tutor.py` - The prompt, request building and streaming from Claude, including web search and code runs
- `app/study.py` - Flashcards and tests, asked for as structured JSON and checked before saving, and the marking of written answers
- `app/performance.py` - Test attempts turned into percentages, grades and summaries
- `app/reminders.py` - Reminder dates, checks and calendar files
- `app/timetable.py` - Weekly classes and their repeating calendar file
- `app/recommend.py` - Suggestions of what to study next, asked for as structured JSON from the study history
- `app/usage.py` - What each request to Claude used and cost, and the totals for the usage box
- `app/modes.py` - Subject modes, the instruction each one adds, and the student's own subjects
- `app/store.py` - Local SQLite storage for chats, files, study sets, reminders, classes and subjects
- `app/config.py` - Settings read from the environment
- `static/` - The page, its styles and its script, the app manifest, the service worker and the offline page
- `tests/` - Tests with a fake Claude client

Settings

- `ANTHROPIC_API_KEY` - Your Claude API key, required
- `RAHAH_MODEL` - The Claude model, defaults to `claude-opus-5-5`
- `RAHAH_EFFORT` - How hard Claude thinks, one of low, medium, high, xhigh or max, defaults to `medium`
- `RAHAH_DB` - Where everything is stored, defaults to `data/rahah.db`
- `RAHAH_MAX_UPLOAD_MB` - The largest file a student can upload, defaults to `30`

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

GPA counts each test once, at its best attempt, so practising a test again never lowers it. Grade points are A 4, B 3, C 2, D 1, and E and F 0. A subject's GPA is the average over its tests, and the overall GPA is the average over every test.

Installing works through a web app manifest and a small service worker served from the root of the site. The service worker caches nothing but the offline page and its logo, so every page and answer still comes fresh from the server. Phones only offer to install a site over HTTPS, so on a phone this works once Rahah is online; on the computer running it, http://127.0.0.1 counts as safe.

Suggestions on the Suggestions tab are saved and only made again when something new has been studied since, or when Refresh is pressed, so opening the tab doesn't cost a request every time.

If Claude's safety checks decline a request, the request is retried on a fallback model automatically. A turn that still fails is not saved, and the question goes back into the message box.

Costs

Every request to Claude is logged with its tokens, cache use and web searches, and priced from Claude's price list, so the usage box shows real spending and per student limits can be built on the same log. Chats are cached, so in a long chat each follow up mostly reads the earlier messages from the cache at a twentieth of the price. A test showed a follow up in a long chat costing about a sixth of what it would without the cache. Very short chats are below the size Claude caches.

Every question is billed to the API key. Opus 5.5 costs 4 dollars per million input tokens and 20 dollars per million output tokens, which is roughly 1 to 5 cents per question, and more when large PDFs are attached. A web search costs about 1 cent on top, plus the tokens for reading its results. Marking a written answer is one more request, a little more with a photo. Questions that run code cost more, since the code and its output are read by Claude too. Sandbox time is free for the first 1,550 hours a month per organization, then 5 cents an hour. Per student limits come with student accounts.

Roadmap

- Student accounts with saved chats, their own subjects and daily usage limits
- Deployment to a public web address, with a calendar link that updates by itself and push notifications
