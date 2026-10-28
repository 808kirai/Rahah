Rahah

A study companion for students. Ask about any subject, upload notes, slides or textbook pages and get answers that point to the page they came from, or get help writing and fixing code.

Rahah runs on Claude Opus 5.5 through the Claude API.

What it does today

- Chat with answers that stream in as they are written
- Subject modes for maths, science, coding, languages and writing, history and humanities, and exam prep, grouped as Study, Exam and Code
- Upload PDF, TXT, MD, image and code files and ask questions about them
- Take a photo with the camera, choose one from the gallery or paste a screenshot, for example of a homework question, and large photos are shrunk before they upload
- Speak a question with the mic button, the browser turns it into text in the message box as you talk, in Chrome, Edge and Safari. Claude can't hear audio, so only the words are sent
- In coding mode Rahah runs code in a sandbox to check fixes and show real output, each run is shown as a card with the code, the output and any charts it made, and Python examples get a Run button
- Answers about documents show numbered sources with the page and the quoted passage
- Maths is rendered from LaTeX and code blocks are highlighted with a copy button
- Summaries of uploaded notes or a topic, with the same page sources
- Flashcard decks made from a topic or notes, to flip through and shuffle
- Multiple choice quizzes with explanations, and every attempt is kept
- A performance page with your average, grades, scores over time, results by subject and a table of every quiz, plus a summary under Exam on the home page
- A home page laid out like a streaming app, with rows for each subject and your saved decks and quizzes
- Chats are saved and listed on the Chats tab, grouped by day, with search
- A Suggestions tab with ideas of what to study next, picked by Claude from your chats, decks and quiz scores and grouped by topic, to review weak areas, take the next step or try a related topic
- A Reminders tab for exams, CATs, midterms, assignments and other events, with reminders every few days from a chosen start until the day before and on the day, a pop up and a desktop notification while Rahah is open, calendar files so phones remind you too, and a Plan revision button that asks Rahah for help
- Every card has a small hand drawn sketch of what it's about, which draws itself in once when the card first shows
- Dark and light themes

Setup

You need Python 3.12 and an API key from platform.claude.com.

1. Create a virtual environment outside OneDrive, so OneDrive doesn't sync thousands of package files

    python -m venv C:\Users\altru\venvs\rahah

2. Install the packages

    C:\Users\altru\venvs\rahah\Scripts\python -m pip install -r requirements.txt

3. Copy .env.example to .env and paste your key after ANTHROPIC_API_KEY=

4. Start the server

    C:\Users\altru\venvs\rahah\Scripts\python -m uvicorn app.main:create_app --factory --port 8000

5. Open http://127.0.0.1:8000 in a browser

Running the tests

The tests use a fake Claude client, so they need no key and cost nothing.

    C:\Users\altru\venvs\rahah\Scripts\python -m pytest -q

Project layout

- `app/main.py` - The web server and its routes
- `app/tutor.py` - The prompt, request building and streaming from Claude
- `app/study.py` - Flashcards and quizzes, asked for as structured JSON and checked before saving
- `app/performance.py` - Quiz attempts turned into percentages, grades and summaries
- `app/reminders.py` - Reminder dates, checks and calendar files
- `app/recommend.py` - Suggestions of what to study next, asked for as structured JSON from the study history
- `app/modes.py` - Subject modes and the instruction each one adds
- `app/store.py` - Local SQLite storage for chats, uploaded files and study sets
- `app/config.py` - Settings read from the environment
- `static/` - The chat page, its styles and its script
- `tests/` - Tests with a fake Claude client

Settings

- `ANTHROPIC_API_KEY` - Your Claude API key, required
- `RAHAH_MODEL` - The Claude model, defaults to `claude-opus-5-5`
- `RAHAH_EFFORT` - How hard Claude thinks, one of low, medium, high, xhigh or max, defaults to `medium`
- `RAHAH_DB` - Where chats are stored, defaults to `data/rahah.db`
- `RAHAH_MAX_UPLOAD_MB` - The largest file a student can upload, defaults to `30`

How it works

Uploaded files go to the Claude Files API once and are referenced by id after that, so a large PDF isn't sent again with every question. Citations are turned on for every document, which is what gives answers their page numbers.

Each reply is saved as Claude returned it, minus the citation details, and sent back unchanged on every later turn. The citations are kept separately for the page, because Claude rejects page citations into uploaded files when they are sent back. Changing the subject mode adds a short system note to the conversation instead of changing the main prompt, which keeps the earlier part of the chat cached and cheaper.

Code runs on Anthropic's servers with Claude's code execution tool, in a sandbox with no internet. Each chat keeps its sandbox for about an hour after its last run, so files and installed packages carry over between questions, and a new one starts after that. Charts and files a run makes are fetched through Rahah, and only plain images are shown in the page, anything else is downloaded.

Reminders are worked out from the student's own calendar dates, so a reminder lands on the right day wherever the page is opened. A web page can only remind you while it's open, so each reminder can also be added to a calendar app with the same alerts built in.

Suggestions on the Suggestions tab are saved and only made again when something new has been studied since, or when Refresh is pressed, so opening the tab doesn't cost a request every time.

If Claude's safety checks decline a request, the request is retried on a fallback model automatically. A turn that still fails is not saved, and the question goes back into the message box.

Costs

Every question is billed to the API key. Opus 5.5 costs 4 dollars per million input tokens and 20 dollars per million output tokens, which is roughly 1 to 5 cents per question, and more when large PDFs are attached. Questions that run code cost more, since the code and its output are read by Claude too. Sandbox time is free for the first 1,550 hours a month per organization, then 5 cents an hour. Per student limits come with student accounts.

Roadmap

- Student accounts with saved chats and daily usage limits
- Deployment to a public web address
