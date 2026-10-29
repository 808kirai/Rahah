// rahah chat page, plain javascript with no build step

const el = (id) => document.getElementById(id);
const thread = el("thread");
const input = el("input");
const send_btn = el("send");
const mode_select = el("mode");
const attachments = el("attachments");
const file_input = el("file-input");
const composer_box = el("composer-box");

const state = {
    conversation_id: null,
    default_mode: "general",
    pending: [], // files attached to the next message, each {key, id, name, kind, status}
    busy: false,
    conversations: [], // recent chats for the chats page and the continue studying row
    reminders: [], // exams, cats, midterms, assignments and events, soonest first
    classes: [], // the weekly timetable, monday first
    reminder_kinds: { exam: "Exam", cat: "CAT", midterm: "Midterm", assignment: "Assignment", event: "Event" },
    recs: null, // suggestions for the recommendations page
    recs_loading: false,
    recs_error: "",
    modes: [],
    mode_names: {},
    mode_groups: {},
    groups: { study: "Study", exam: "Exam", code: "Code" },
    menu_groups: {}, // the smaller groups the subject picker shows
    code_modes: new Set(["coding"]), // modes where claude can run code
    sets: [], // saved flashcard decks and quizzes
    study: null, // the open deck or quiz and where the student is in it
    performance: null, // quiz results worked out by the server
};

const icons = {
    doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
    cards: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="14" height="13" rx="2.5"/><path d="M7 4h11.5A2.5 2.5 0 0 1 21 6.5V16"/></svg>',
    quiz: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    summary: '<svg viewBox="0 0 24 24"><path d="M5 6h14M5 10h14M5 14h9M5 18h6"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.5M13 10.5C13.9 8.6 15 7 16.5 7H20M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/></svg>',
    terminal: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7.5 9.5l3 2.5-3 2.5M13 15h3.5"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    speaker: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
    retry: '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v4h4"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
};

function escape_html(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function api(path, options = {}) {
    const response = await fetch(path, options);
    if (!response.ok) {
        let detail = `Something went wrong (${response.status}).`;
        try {
            const body = await response.json();
            if (typeof body.detail === "string") detail = body.detail;
            // a form the server turned down lists what was wrong with each field
            else if (Array.isArray(body.detail)) detail = body.detail.map((d) => String(d.msg || "").replace(/^Value error, /, "")).join(" ");
        } catch (e) {}
        throw new Error(detail);
    }
    return response;
}

// markdown, maths and citations

if (window.hljs) hljs.configure({ ignoreUnescapedHTML: true });

function render_math(item) {
    if (!window.katex) return `<code>${escape_html(item.tex)}</code>`;
    return katex.renderToString(item.tex, { displayMode: item.display, throwOnError: false });
}

function render_markdown(raw) {
    // pull maths out first so markdown doesn't eat the backslashes, but leave code alone
    const math = [];
    const pieces = raw.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
    const guarded = pieces.map((piece, i) => {
        if (i % 2 === 1) return piece;
        return piece.replace(/\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\\\(([\s\S]+?)\\\)/g, (match, block_a, block_b, inline) => {
            math.push({ tex: block_a ?? block_b ?? inline, display: inline === undefined });
            return `@@math${math.length - 1}@@`;
        });
    }).join("");

    let html = window.marked && window.DOMPurify
        ? DOMPurify.sanitize(marked.parse(guarded, { gfm: true }))
        : `<p>${escape_html(guarded).replace(/\n/g, "<br>")}</p>`;
    html = html.replace(/@@math(\d+)@@/g, (match, i) => render_math(math[Number(i)]));
    html = html.replace(/⟦(\d+)⟧/g, (match, n) => `<button class="cite" data-n="${n}" aria-label="Source ${n}">${n}</button>`);
    // code runs get a slot here and are filled in by fill_runs
    html = html.replace(/<p>⟦run:(\d+)⟧<\/p>|⟦run:(\d+)⟧/g, (match, a, b) => `<div class="run-slot" data-run="${a ?? b}"></div>`);
    return html;
}

// code that claude ran in the sandbox, shown as a card with its output

const run_errors = {
    execution_time_exceeded: "Took too long",
    output_file_too_large: "Output too large",
    too_many_requests: "Sandbox busy",
    unavailable: "Sandbox unavailable",
    file_not_found: "File not found",
    invalid_tool_input: "Couldn't run",
};

const file_languages = {
    py: "python", js: "javascript", ts: "typescript", java: "java", c: "c", cpp: "cpp", h: "c", cs: "csharp",
    go: "go", rs: "rust", rb: "ruby", php: "php", kt: "kotlin", swift: "swift", r: "r", sql: "sql",
    sh: "bash", html: "xml", css: "css", json: "json", md: "markdown",
};

function language_of(path) {
    const ext = (path.split(".").pop() || "").toLowerCase();
    return file_languages[ext] || "plaintext";
}

function run_title(run) {
    const name = escape_html(run.path.split("/").pop() || "a file");
    if (run.kind === "create") return `Wrote <span class="run-path">${name}</span>`;
    if (run.kind === "str_replace") return `Edited <span class="run-path">${name}</span>`;
    if (run.kind === "view") return `Opened <span class="run-path">${name}</span>`;
    if (run.kind === "file") return `Changed <span class="run-path">${name}</span>`;
    return "Ran code";
}

function run_status(run) {
    if (!run.done) return '<span class="run-status busy">Running</span>';
    if (run.error) return `<span class="run-status fail">${escape_html(run_errors[run.error] || "Couldn't run")}</span>`;
    if (run.exit) return `<span class="run-status fail">Error, exit code ${escape_html(run.exit)}</span>`;
    if (run.kind === "bash" || run.kind === "python") return '<span class="run-status ok">Done</span>';
    return "";
}

function run_file_html(file) {
    const url = `/api/outputs/${encodeURIComponent(file.id)}`;
    if (/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
        return `<a class="run-image" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${escape_html(file.name)}" loading="lazy"></a>`;
    }
    return `<a class="run-file" href="${url}" download>${icons.download}<span>${escape_html(file.name)}</span></a>`;
}

function run_html(run) {
    const lang = run.kind === "bash" ? "bash" : run.kind === "python" ? "python" : language_of(run.path);
    const code = run.code ? `<pre><code class="language-${lang}">${escape_html(run.code)}</code></pre>` : "";
    const output = run.stdout || run.stderr
        ? `<pre class="run-output">${escape_html(run.stdout || "")}${run.stderr ? `<span class="stderr">${escape_html(run.stderr)}</span>` : ""}</pre>`
        : "";
    const files = (run.files || []).map(run_file_html).join("");
    const failed = run.done && (run.error || run.exit);
    return `<div class="run${failed ? " failed" : ""}">
        <div class="run-head">${icons.terminal}<span class="run-title">${run_title(run)}</span>${run_status(run)}</div>
        ${code}${output}${files ? `<div class="run-files">${files}</div>` : ""}
    </div>`;
}

function fill_runs(container, runs) {
    container.querySelectorAll(".run-slot").forEach((slot) => {
        const run = runs[Number(slot.dataset.run)];
        if (run) slot.outerHTML = run_html(run);
        else slot.remove();
    });
}

function decorate_code(container) {
    const can_run = state.code_modes.has(mode_select.value);
    container.querySelectorAll("pre code").forEach((code) => {
        if (window.hljs) hljs.highlightElement(code);
        const actions = document.createElement("div");
        actions.className = "code-actions";
        // python in an answer can be sent back to be run, code already inside a run card has been run
        if (can_run && code.classList.contains("language-python") && !code.closest(".run")) {
            const run = document.createElement("button");
            run.className = "code-btn run-btn";
            run.type = "button";
            run.innerHTML = `${icons.play}<span>Run</span>`;
            run.addEventListener("click", () => {
                if (state.busy) return;
                send_message(`Run this code and show me the output.\n\n\`\`\`python\n${code.innerText.trimEnd()}\n\`\`\``);
            });
            actions.appendChild(run);
        }
        const copy = document.createElement("button");
        copy.className = "code-btn";
        copy.type = "button";
        copy.textContent = "Copy";
        copy.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(code.innerText);
                copy.textContent = "Copied";
            } catch (e) {
                copy.textContent = "Copy failed";
            }
            setTimeout(() => (copy.textContent = "Copy"), 1500);
        });
        actions.appendChild(copy);
        code.parentElement.appendChild(actions);
    });
}

function render_sources(message_el, sources) {
    let box = message_el.querySelector(".sources");
    if (!sources.length) {
        if (box) box.remove();
        return;
    }
    if (!box) {
        box = document.createElement("div");
        box.className = "sources";
        message_el.appendChild(box);
    }
    // only plain web links are drawn, so a source can never carry a script link
    const link = (s) => s.url && /^https?:\/\//i.test(s.url)
        ? `<a class="source-link" href="${escape_html(s.url)}" target="_blank" rel="noopener noreferrer">Open the page</a>`
        : "";
    box.innerHTML = '<p class="sources-title">Sources</p>' + sources.map((s) => `
        <details class="source" data-n="${s.n}">
            <summary><span class="n">${s.n}</span><span>${escape_html(s.title)}${s.where ? ` <span class="where">· ${escape_html(s.where)}</span>` : ""}</span></summary>
            ${s.quote ? `<blockquote>${escape_html(s.quote)}</blockquote>` : ""}
            ${link(s)}
        </details>`).join("");
}

// a short line above an answer saying what rahah looked up on the web
function render_searches(message_el, searches) {
    let line = message_el.querySelector(".searches");
    if (!searches || !searches.length) {
        if (line) line.remove();
        return;
    }
    if (!line) {
        line = document.createElement("p");
        line.className = "searches";
        message_el.querySelector(".answer").before(line);
    }
    line.innerHTML = `${icons.search}<span>Searched the web for ${searches.map((q) => `<q>${escape_html(q)}</q>`).join(", ")}</span>`;
}

thread.addEventListener("click", (event) => {
    const chip = event.target.closest(".cite");
    if (!chip) return;
    const message_el = chip.closest(".message");
    const source = message_el && message_el.querySelector(`.source[data-n="${chip.dataset.n}"]`);
    if (!source) return;
    source.open = true;
    source.scrollIntoView({ behavior: "smooth", block: "nearest" });
    source.classList.add("flash");
    setTimeout(() => source.classList.remove("flash"), 1200);
});

// messages on the page

function near_bottom() {
    return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
}

function scroll_to_bottom() {
    thread.scrollTop = thread.scrollHeight;
}

function file_pill_html(file) {
    return `<span class="file-pill">${file.kind === "image" ? icons.image : icons.doc}<span>${escape_html(file.name)}</span></span>`;
}

function add_user_message(text, files = []) {
    leave_home();
    const message_el = document.createElement("div");
    message_el.className = "message user";
    if (files.length) message_el.innerHTML = `<div class="files">${files.map(file_pill_html).join("")}</div>`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    message_el.appendChild(bubble);
    thread.appendChild(message_el);
    return message_el;
}

// what the answer says while claude works, one slang word with ing on the end, no spaces or punctuation
// each answer picks three and rotates through them until the words start arriving
// taken from internet slang, keeping only what fits a study app
const thinking_words = [
    "Skibidiing", "Rizzing", "Sigmaing", "Mewing", "Mogging", "Glazing", "Cooking", "Auraing",
    "Ohioing", "Bratting", "Demuring", "Capping", "Deluluing", "Chatting", "Finnaing", "Locking",
    "Bruhing", "Sheeshing", "Basing", "Sussing", "Pookieing", "Tralaleroing", "Bombardinoing",
    "Cappuccinoing", "Sixsevening", "Brainrotting", "NPCing",
];
const thinking_every = 1400;

function three_thinking_words() {
    const pool = [...thinking_words];
    const picked = [];
    while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return picked;
}

// swaps the word in place, and stops by itself once the answer has replaced the label
function rotate_thinking(label, words) {
    let at = 0;
    const timer = setInterval(() => {
        if (!label.isConnected) {
            clearInterval(timer);
            return;
        }
        at = (at + 1) % words.length;
        label.textContent = words[at];
    }, thinking_every);
}

function show_thinking(answer) {
    const words = three_thinking_words();
    answer.innerHTML = `<span class="thinking"><span class="spark" aria-hidden="true">✻</span><span class="thinking-word">${escape_html(words[0])}</span></span>`;
    rotate_thinking(answer.querySelector(".thinking-word"), words);
}

function add_assistant_message(text = null, sources = [], runs = []) {
    leave_home();
    const message_el = document.createElement("div");
    message_el.className = "message assistant";
    message_el.innerHTML = '<p class="label"><span class="logo" aria-hidden="true"></span>Rahah</p><div class="answer"></div>';
    const answer = message_el.querySelector(".answer");
    if (text === null) {
        show_thinking(answer);
    } else {
        answer.innerHTML = render_markdown(text);
        fill_runs(answer, runs);
        decorate_code(answer);
        render_sources(message_el, sources);
    }
    thread.appendChild(message_el);
    return message_el;
}

function add_notice(message_el, text) {
    const note = document.createElement("p");
    note.className = "notice";
    note.textContent = text;
    message_el.appendChild(note);
}

// home, chats, recommendations and performance are pages, a deck or quiz is a study view, anything else in the thread is a chat

const page_titles = { home: "Home", chats: "Chats & Tests", recommendations: "Suggestions", reminders: "Reminders and Timetable", performance: "Performance" };

function current_view() {
    if (el("welcome")) return "home";
    if (el("chats")) return "chats";
    if (el("recommendations")) return "recommendations";
    if (el("reminders")) return "reminders";
    if (el("performance")) return "performance";
    if (el("study")) return "study";
    return "chat";
}

function sync_view() {
    const view = current_view();
    document.body.classList.toggle("is-home", view === "home");
    document.body.classList.toggle("is-chats", view === "chats");
    document.body.classList.toggle("is-recommendations", view === "recommendations");
    document.body.classList.toggle("is-reminders", view === "reminders");
    document.body.classList.toggle("is-performance", view === "performance");
    document.body.classList.toggle("is-study", view === "study");
    document.body.classList.toggle("is-page", view in page_titles);
    el("page-title").textContent = page_titles[view] || "Home";
    sync_nav_line();
}

function leave_home() {
    if (current_view() === "chat") return;
    ["welcome", "chats", "recommendations", "reminders", "performance", "study"].forEach((id) => el(id)?.remove());
    sync_view();
}

function show_welcome() {
    thread.innerHTML = "";
    thread.appendChild(welcome_template.cloneNode(true));
    thread.scrollTop = 0;
    render_rows();
    sync_view();
    load_today();
}

// a short line under the greeting with what's on today, each part a shortcut to it

async function load_today() {
    const now = new Date();
    try {
        const response = await api(`/api/today?today=${local_today()}&weekday=${week_day(now)}`);
        state.today = await response.json();
    } catch (error) {
        return;
    }
    render_today();
}

function render_today() {
    const box = el("today");
    const t = state.today;
    if (!box || !t) return;
    const chips = [];
    if (t.cards_due) chips.push(`<button class="today-chip" type="button" data-today-deck="${t.deck.id}">${icons.cards}${plural(t.cards_due, "flashcard")} due</button>`);
    if (t.exam) {
        const when = t.exam.days === 0 ? "today" : t.exam.days === 1 ? "tomorrow" : `in ${t.exam.days} days`;
        chips.push(`<button class="today-chip" type="button" data-today-page="reminders">${icons.calendar}${escape_html(t.exam.title)} ${when}</button>`);
    }
    const now = clock_now();
    const next = t.classes.find((c) => c.end_time > now);
    if (t.classes.length) {
        const rest = next ? ` · next ${escape_html(next.title)} at ${next.start_time}` : " · all done";
        chips.push(`<button class="today-chip" type="button" data-today-page="reminders">${icons.bell}${plural(t.classes.length, "class", "classes")} today${rest}</button>`);
    }
    box.innerHTML = chips.join("");
    box.hidden = !chips.length;
}

// sending and streaming

const send_icon = send_btn.innerHTML;

function update_send_button() {
    const stoppable = Boolean(state.answer_controller);
    send_btn.classList.toggle("stop", stoppable);
    send_btn.innerHTML = stoppable ? icons.stop : send_icon;
    send_btn.setAttribute("aria-label", stoppable ? "Stop the answer" : "Send");
    send_btn.title = stoppable ? "Stop" : "";
    if (stoppable) {
        send_btn.disabled = false;
        return;
    }
    const uploading = state.pending.some((f) => f.status === "uploading");
    send_btn.disabled = state.busy || uploading || !input.value.trim();
}

// pressing stop cuts the connection, and the server keeps what had arrived, marked stopped
send_btn.addEventListener("click", (event) => {
    if (!state.answer_controller) return;
    event.preventDefault();
    state.answer_controller.abort();
});

async function ensure_conversation() {
    if (state.conversation_id) return state.conversation_id;
    const response = await api("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: mode_select.value }),
    });
    const { id } = await response.json();
    state.conversation_id = id;
    history.replaceState(null, "", `#/c/${id}`);
    return id;
}

async function read_events(response, on_event) {
    // the server sends server sent events over a post, so they are parsed by hand
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            const data = chunk.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("");
            if (data) on_event(JSON.parse(data));
        }
    }
}

// streams one answer into a reply on the page, for a new question and for try again
// request is handed the abort signal, on_fail runs when nothing was saved, and again is what the notice's
// try again button does then
async function run_answer(reply, request, on_fail, again) {
    const answer = reply.querySelector(".answer");
    let raw = "";
    let sources = [];
    let runs = [];
    let searches = [];
    let frame = 0;
    let finished = false;
    let saved = false;

    const paint = () => {
        frame = 0;
        const stick = near_bottom();
        answer.innerHTML = render_markdown(raw);
        fill_runs(answer, runs);
        decorate_code(answer);
        render_sources(reply, sources);
        render_searches(reply, searches);
        if (stick) scroll_to_bottom();
    };
    const schedule_paint = () => {
        if (!frame) frame = requestAnimationFrame(paint);
    };
    const fail = (text) => {
        if (frame) cancelAnimationFrame(frame);
        answer.innerHTML = "";
        render_sources(reply, []);
        render_searches(reply, []);
        const note = document.createElement("div");
        note.className = "notice notice-retry";
        note.innerHTML = `<span>${escape_html(text)}</span>`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-ghost btn-small";
        button.innerHTML = `${icons.retry}Try again`;
        button.addEventListener("click", () => {
            if (!state.busy) again();
        });
        note.appendChild(button);
        reply.appendChild(note);
        on_fail();
        finished = true;
    };

    const controller = new AbortController();
    state.answer_controller = controller;
    update_send_button();
    try {
        const response = await request(controller.signal);
        await read_events(response, (event) => {
            if (event.t === "text") {
                raw += event.v;
                schedule_paint();
            } else if (event.t === "cite") {
                raw += event.v.marks;
                sources = sources.concat(event.v.sources);
                schedule_paint();
            } else if (event.t === "run") {
                raw += event.v.marks;
                runs[event.v.run.n] = event.v.run;
                schedule_paint();
            } else if (event.t === "run_done") {
                runs[event.v.n] = event.v;
                schedule_paint();
            } else if (event.t === "search") {
                searches = searches.concat(event.v);
                schedule_paint();
            } else if (event.t === "done") {
                raw = event.v.text;
                sources = event.v.sources;
                runs = event.v.runs || [];
                searches = event.v.searches || [];
                finished = true;
                saved = true;
                if (frame) cancelAnimationFrame(frame);
                paint();
                if (event.v.truncated) add_notice(reply, "This answer hit the length limit. Ask Rahah to continue.");
            } else if (event.t === "refusal" || event.t === "error") {
                // partial text from a failed turn is dropped, it was never saved
                fail(event.v);
            }
        });
        if (!finished) fail("The connection dropped before the answer finished.");
    } catch (error) {
        if (controller.signal.aborted) {
            // what arrived stays on the page, the server saved the same
            if (frame) cancelAnimationFrame(frame);
            if (raw) paint();
            else answer.innerHTML = "";
            add_notice(reply, "You stopped this answer.");
            saved = true;
        } else {
            fail(error.message || "Rahah couldn't send that message.");
        }
    } finally {
        state.answer_controller = null;
    }
    if (saved) {
        reply.classList.add("answered");
        reply.raw_text = raw;
        add_answer_actions(reply);
    }
    return saved;
}

async function send_message(text) {
    text = text.trim();
    const ready = state.pending.filter((f) => f.status === "ready");
    if (!text || state.busy) return;
    // a question that was spoken is sent as it is, and listening stops so nothing lands in the cleared box
    stop_voice(true);
    state.busy = true;
    update_send_button();

    const sent_files = [...ready];
    input.value = "";
    resize_input();
    state.pending = state.pending.filter((f) => f.status !== "ready");
    render_attachments();

    const question = add_user_message(text, sent_files);
    const reply = add_assistant_message();
    scroll_to_bottom();

    const give_back = () => {
        // a failed turn isn't saved, so hand the question and files back for another try
        if (!input.value.trim()) input.value = text;
        state.pending = [...sent_files, ...state.pending];
        render_attachments();
        resize_input();
    };
    // trying a failed question again sends it fresh, so the failed copy comes off the page first
    const again = () => {
        question.remove();
        reply.remove();
        send_message(input.value);
    };

    let saved = false;
    try {
        saved = await run_answer(reply, async (signal) => {
            const conversation_id = await ensure_conversation();
            return api(`/api/conversations/${conversation_id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, mode: mode_select.value, file_ids: sent_files.map((f) => f.id) }),
                signal,
            });
        }, give_back, again);
    } finally {
        state.busy = false;
        update_send_button();
        load_history();
        if (saved && el("chat-title").textContent === "New chat") set_title(text.slice(0, 60));
        offer_retry();
        input.focus();
    }
}

// try again sits under the latest answer only, and asks for a fresh answer to the same question
function offer_retry() {
    thread.querySelectorAll("[data-retry]").forEach((button) => button.remove());
    if (current_view() !== "chat" || !state.conversation_id) return;
    const messages = thread.querySelectorAll(".message");
    const last = messages[messages.length - 1];
    if (!last || !last.classList.contains("answered")) return;
    const row = add_answer_actions(last);
    row.insertAdjacentHTML("afterbegin", `<button class="btn btn-ghost btn-small" type="button" data-retry>${icons.retry}Try again</button>`);
}

// under each answer, ways to keep studying it
function add_answer_actions(reply) {
    let row = reply.querySelector(".answer-actions");
    if (row) return row;
    row = document.createElement("div");
    row.className = "answer-actions";
    row.innerHTML = `
        ${can_speak ? `<button class="btn btn-ghost btn-small" type="button" data-answer-action="listen">${icons.speaker}Listen</button>` : ""}
        <button class="btn btn-ghost btn-small" type="button" data-answer-action="quiz">${icons.quiz}Test me</button>
        <button class="btn btn-ghost btn-small" type="button" data-answer-action="flashcards">${icons.cards}Flashcards</button>`;
    reply.appendChild(row);
    return row;
}

// reading an answer aloud with the device's own voice, free and offline
const can_speak = "speechSynthesis" in window;
const reader = { reply: null };

// what gets read, the words without markdown, citation marks or code, and simple maths said in words
function speech_text(raw) {
    return String(raw || "")
        .replace(/```[\s\S]*?```/g, " (code shown on screen) ")
        .replace(/⟦[^⟧]*⟧/g, "")
        .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1 over $2")
        .replace(/\^\{?2\}?/g, " squared").replace(/\^\{?3\}?/g, " cubed").replace(/\^\{([^{}]*)\}/g, " to the power $1")
        .replace(/\\(times|cdot)/g, " times ").replace(/\\div/g, " divided by ").replace(/\\sqrt\{([^{}]*)\}/g, "the square root of $1")
        .replace(/\\[()\[\]]/g, " ").replace(/\\[a-zA-Z]+/g, " ").replace(/[{}]/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*_#>`|]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function set_listen_label(reply, on) {
    const button = reply?.querySelector('[data-answer-action="listen"]');
    if (button) button.innerHTML = on ? `${icons.stop}Stop` : `${icons.speaker}Listen`;
}

function stop_reading() {
    if (!can_speak) return;
    speechSynthesis.cancel();
    set_listen_label(reader.reply, false);
    reader.reply = null;
}

// long answers are read a sentence at a time, since some browsers stop a long single reading early
function speak(text, on_done = () => {}) {
    const parts = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
    parts.forEach((part, i) => {
        const line = new SpeechSynthesisUtterance(part.trim());
        line.lang = state.answer_lang_code || navigator.language || "en-US";
        if (i === parts.length - 1) line.onend = on_done;
        speechSynthesis.speak(line);
    });
}

function read_aloud(reply) {
    if (!can_speak || !reply) return;
    if (reader.reply === reply) {
        stop_reading();
        return;
    }
    stop_reading();
    const text = speech_text(reply.raw_text);
    if (!text) return;
    reader.reply = reply;
    set_listen_label(reply, true);
    speak(text, () => {
        if (reader.reply === reply) {
            set_listen_label(reply, false);
            reader.reply = null;
        }
    });
}

// a test or deck from one answer, the answer goes in as notes so nothing is cut short
function study_answer(reply, tool) {
    const text = String(reply.raw_text || "").replace(/⟦[^⟧]*⟧/g, "").trim();
    if (!text) return;
    open_sheet(tool, mode_select.value || state.default_mode, "", { pick: 5 });
    sheet_state.files = [new File([text], "rahah-answer.txt", { type: "text/plain" })];
    render_sheet_files();
}

async function retry_answer() {
    if (state.busy || !state.conversation_id) return;
    const messages = thread.querySelectorAll(".message.assistant");
    const reply = messages[messages.length - 1];
    if (!reply) return;
    state.busy = true;
    // the old answer clears and the thinking label comes back while the new one is written
    reply.classList.remove("answered");
    reply.querySelectorAll(".notice, .answer-actions, .sources, .searches").forEach((part) => part.remove());
    show_thinking(reply.querySelector(".answer"));
    update_send_button();
    const conversation_id = state.conversation_id;
    try {
        await run_answer(reply, (signal) => api(`/api/conversations/${conversation_id}/retry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: mode_select.value }),
            signal,
        }), () => {}, retry_answer);
    } finally {
        state.busy = false;
        update_send_button();
        load_history();
        offer_retry();
    }
}

thread.addEventListener("click", (event) => {
    const deck = event.target.closest("[data-today-deck]");
    if (deck) open_set(deck.dataset.todayDeck);
    if (event.target.closest('[data-today-page="reminders"]')) show_reminders();
    if (event.target.closest("[data-retry]")) retry_answer();
    const action = event.target.closest("[data-answer-action]");
    if (action && action.dataset.answerAction === "listen") read_aloud(action.closest(".message"));
    else if (action) study_answer(action.closest(".message"), action.dataset.answerAction);
});

// attachments

let file_key = 0;

function render_attachments() {
    attachments.innerHTML = "";
    state.pending.forEach((file) => {
        const pill = document.createElement("span");
        pill.className = `file-pill ${file.status === "ready" ? "" : file.status}`;
        const label = file.status === "uploading" ? "Uploading…" : file.status === "failed" ? `Failed: ${file.error}` : "";
        pill.title = label || file.name;
        pill.innerHTML = `${file.kind === "image" ? icons.image : icons.doc}<span>${escape_html(file.name)}${file.status === "uploading" ? " · uploading" : ""}${file.status === "failed" ? ` · ${escape_html(file.error)}` : ""}</span>`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove ${file.name}`);
        remove.innerHTML = icons.close;
        remove.addEventListener("click", () => {
            state.pending = state.pending.filter((f) => f.key !== file.key);
            render_attachments();
        });
        pill.appendChild(remove);
        attachments.appendChild(pill);
    });
    update_send_button();
}

async function upload_files(files) {
    for (const file of files) {
        const kind = /\.(png|jpe?g|webp|gif)$/i.test(file.name) ? "image" : "document";
        const item = { key: ++file_key, id: null, name: file.name, kind, status: "uploading" };
        state.pending.push(item);
        render_attachments();
        try {
            const conversation_id = await ensure_conversation();
            const form = new FormData();
            form.append("conversation_id", conversation_id);
            form.append("file", file);
            const response = await api("/api/files", { method: "POST", body: form });
            const saved = await response.json();
            Object.assign(item, { id: saved.id, kind: saved.kind, status: "ready" });
        } catch (error) {
            Object.assign(item, { status: "failed", error: error.message });
        }
        render_attachments();
    }
}

file_input.addEventListener("change", () => {
    upload_files([...file_input.files]);
    file_input.value = "";
});

["dragenter", "dragover"].forEach((name) => composer_box.addEventListener(name, (event) => {
    event.preventDefault();
    composer_box.classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => composer_box.addEventListener(name, () => composer_box.classList.remove("dragging")));
composer_box.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer.files.length) upload_files([...event.dataTransfer.files]);
});

// photos, from the camera, the gallery or pasted in, shrunk first so they upload quickly
// claude reads images up to about this many pixels on the long side, so nothing is lost
const photo_edge = 1600;

function photo_name() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `photo-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.jpg`;
}

function canvas_to_file(canvas, name) {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], name, { type: "image/jpeg" }) : null), "image/jpeg", 0.9));
}

function draw_scaled(source, width, height) {
    const scale = Math.min(1, photo_edge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
}

async function shrink_photo(file) {
    // gifs can move, and small images are fine as they are
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return file;
    try {
        const bitmap = await createImageBitmap(file);
        const big = Math.max(bitmap.width, bitmap.height) > photo_edge || file.size > 4 * 1024 * 1024;
        if (!big) return file;
        const canvas = draw_scaled(bitmap, bitmap.width, bitmap.height);
        const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        return (await canvas_to_file(canvas, name)) || file;
    } catch (e) {
        // a format this browser can't open goes up as it is, and the server explains if it can't read it either
        return file;
    }
}

async function add_photos(files) {
    const ready = await Promise.all([...files].map(shrink_photo));
    upload_files(ready);
}

input.addEventListener("paste", (event) => {
    const images = [...(event.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    event.preventDefault();
    // pasted screenshots have no real name, so they get a dated one
    add_photos(images.map((f) => new File([f], f.name && f.name !== "image.png" ? f.name : photo_name().replace(".jpg", ".png"), { type: f.type })));
});

// voice typing, the browser turns speech into words in the message box and rahah reads the words
// claude can't hear audio, so only the text is ever sent

const tools_btn = el("attach");
const input_menu = el("input-menu");
const speech_engine = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const voice = { rec: null, base: "", heard: "", error: "" };
el("voice-option").hidden = !speech_engine();

const voice_errors = {
    "not-allowed": "Rahah isn't allowed to use the microphone. Allow it in the browser's site settings.",
    "service-not-allowed": "Voice typing is turned off in this browser.",
    "audio-capture": "Rahah couldn't find a microphone.",
    "network": "Voice typing needs an internet connection.",
};

// a short message in the message box itself, gone after a few seconds
function composer_hint(text) {
    input.placeholder = text;
    clearTimeout(composer_hint.timer);
    composer_hint.timer = setTimeout(sync_placeholder, 6000);
}

// while listening the + button becomes a mic in the accent colour, and tapping it stops
function set_listening(on) {
    const label = on ? "Stop listening" : "Add files, a photo or your voice";
    tools_btn.classList.toggle("listening", on);
    tools_btn.setAttribute("aria-label", label);
    tools_btn.title = label;
    composer_box.classList.toggle("listening", on);
    if (on) input.placeholder = "Listening, say your question…";
    else sync_placeholder();
}

// discard throws away anything still being heard, used when the message is sent
function stop_voice(discard = false) {
    const rec = voice.rec;
    if (!rec) return;
    if (discard) {
        voice.rec = null;
        rec.abort();
        set_listening(false);
    } else {
        rec.stop();
    }
}

function start_voice() {
    const Engine = speech_engine();
    if (!Engine) {
        composer_hint("Voice typing isn't available in this browser. Try Chrome, Edge or Safari.");
        return;
    }
    const rec = new Engine();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    // what was already typed stays, and the spoken words follow it
    voice.base = input.value.trim() ? `${input.value.trimEnd()} ` : "";
    voice.heard = "";
    voice.error = "";
    rec.onresult = (event) => {
        if (voice.rec !== rec) return;
        let guess = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const words = event.results[i][0].transcript.trim();
            if (!words) continue;
            if (event.results[i].isFinal) voice.heard += (voice.heard ? " " : "") + words;
            else guess += (guess ? " " : "") + words;
        }
        input.value = voice.base + voice.heard + (guess ? `${voice.heard ? " " : ""}${guess}` : "");
        resize_input();
        update_send_button();
    };
    rec.onerror = (event) => {
        voice.error = voice_errors[event.error] || "";
    };
    rec.onend = () => {
        if (voice.rec !== rec) return;
        voice.rec = null;
        set_listening(false);
        if (voice.error) composer_hint(voice.error);
        input.focus();
    };
    voice.rec = rec;
    try {
        rec.start();
        set_listening(true);
    } catch (e) {
        voice.rec = null;
        composer_hint("Voice typing couldn't start. Try again.");
    }
}

// the + menu, files, a photo or voice

function close_input_menu(refocus = false) {
    if (input_menu.hidden) return;
    input_menu.hidden = true;
    tools_btn.setAttribute("aria-expanded", "false");
    if (refocus) tools_btn.focus();
}

function open_input_menu() {
    input_menu.hidden = false;
    tools_btn.setAttribute("aria-expanded", "true");
    input_menu.querySelector(".input-option:not([hidden])")?.focus();
}

tools_btn.addEventListener("click", () => {
    if (voice.rec) stop_voice();
    else if (input_menu.hidden) open_input_menu();
    else close_input_menu();
});

input_menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-input]");
    if (!option) return;
    close_input_menu();
    if (option.dataset.input === "files") file_input.click();
    else if (option.dataset.input === "photo") open_camera();
    else start_voice();
});

input_menu.addEventListener("keydown", (event) => {
    const options = [...input_menu.querySelectorAll(".input-option:not([hidden])")];
    const at = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
        event.preventDefault();
        close_input_menu(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        options[(at + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
    } else if (event.key === "Tab") {
        close_input_menu();
    }
});

document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".input-tools")) close_input_menu();
});

// the camera sheet, a live preview, then the shot to keep or retake

const camera_sheet = el("camera-sheet");
const camera_video = el("camera-video");
const camera = { stream: null, facing: "environment", file: null, url: "" };

function camera_state(mode) {
    // live, shot or off when there's no camera to show
    el("camera-video").hidden = mode !== "live";
    el("camera-shot").hidden = mode !== "shot";
    el("camera-snap").hidden = mode !== "live";
    el("camera-retake").hidden = mode !== "shot";
    el("camera-use").hidden = mode !== "shot";
    if (mode !== "live") el("camera-flip").hidden = true;
}

function camera_note(text) {
    el("camera-note").textContent = text;
    el("camera-note").hidden = !text;
}

function stop_camera() {
    camera.stream?.getTracks().forEach((track) => track.stop());
    camera.stream = null;
    camera_video.srcObject = null;
}

async function start_camera() {
    stop_camera();
    camera_note("");
    camera_state("live");
    if (!navigator.mediaDevices?.getUserMedia) {
        camera_state("off");
        camera_note("This browser can't open a camera here. Choose a photo instead.");
        return;
    }
    try {
        camera.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: camera.facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
        });
        camera_video.srcObject = camera.stream;
        camera_video.classList.toggle("mirror", camera.facing === "user");
        await camera_video.play();
        const devices = await navigator.mediaDevices.enumerateDevices();
        el("camera-flip").hidden = devices.filter((d) => d.kind === "videoinput").length < 2;
    } catch (error) {
        stop_camera();
        camera_state("off");
        camera_note(error.name === "NotAllowedError"
            ? "Rahah isn't allowed to use the camera. Allow it in the browser's site settings, or choose a photo instead."
            : "Rahah couldn't find a camera to use. Choose a photo instead.");
    }
}

function open_camera() {
    camera.file = null;
    camera_sheet.showModal();
    start_camera();
}

async function take_photo() {
    if (!camera.stream || !camera_video.videoWidth) return;
    const canvas = draw_scaled(camera_video, camera_video.videoWidth, camera_video.videoHeight);
    camera.file = await canvas_to_file(canvas, photo_name());
    if (!camera.file) return;
    if (camera.url) URL.revokeObjectURL(camera.url);
    camera.url = URL.createObjectURL(camera.file);
    el("camera-shot").src = camera.url;
    // the camera light goes off while the student looks at the shot
    stop_camera();
    camera_state("shot");
}

el("camera-close").addEventListener("click", () => camera_sheet.close());
el("camera-snap").addEventListener("click", take_photo);
el("camera-retake").addEventListener("click", start_camera);
el("camera-flip").addEventListener("click", () => {
    camera.facing = camera.facing === "environment" ? "user" : "environment";
    start_camera();
});
el("camera-use").addEventListener("click", () => {
    const file = camera.file;
    camera_sheet.close();
    if (file) upload_files([file]);
});
el("camera-choose").addEventListener("click", () => el("photo-input").click());
el("photo-input").addEventListener("change", () => {
    const files = [...el("photo-input").files];
    el("photo-input").value = "";
    if (!files.length) return;
    camera_sheet.close();
    add_photos(files);
});
camera_sheet.addEventListener("close", () => {
    stop_camera();
    if (camera.url) URL.revokeObjectURL(camera.url);
    camera.url = "";
});

// home rows, laid out like a streaming app
// each section has its own suggestion rows of three cards, and a card with a tool opens that tool instead of a chat

const shelves = [
    { title: "Try these", group: "study", items: [
        { mode: "maths", title: "Derivatives from scratch", text: "Teach me what a derivative is from scratch, then walk me through differentiating x squared from first principles." },
        { mode: "science", title: "How DNA copies itself", text: "Explain DNA replication step by step in simple terms." },
        { mode: "humanities", title: "Causes of the French Revolution", text: "Explain the main causes of the French Revolution and how historians weigh them differently." },
    ] },
    { title: "Practice", group: "exam", items: [
        { tool: "quiz", mode: "exam" },
        { mode: "exam", title: "Exam style questions", text: "Give me exam style questions on a topic I choose, one at a time, with the marks each is worth, then mark my answers. Ask me the topic first." },
        { mode: "exam", title: "Mark my answer like an examiner", text: "I'll paste an exam question and my answer. Mark it like an examiner and tell me how to gain more marks." },
    ] },
    { title: "Revision", group: "exam", items: [
        { mode: "exam", title: "Build my revision plan", text: "Help me build a two week revision plan. Ask me which subjects and exam dates I have first." },
        { mode: "exam", title: "Last minute cram sheet", text: "Make me a one page cram sheet for a topic I choose, with the key facts, formulas and common mistakes. Ask me the topic first." },
        { mode: "exam", title: "Active recall drill", text: "Run an active recall drill on a topic I choose. Ask me questions one at a time and keep score." },
    ] },
    { title: "Exam technique", group: "exam", items: [
        { mode: "exam", title: "Read the question right", text: "Teach me how to break down exam questions, the command words, the marks and what the examiner is looking for." },
        { mode: "exam", title: "Plan an essay in five minutes", text: "Show me how to plan an exam essay in five minutes, using a practice question on a subject I choose." },
        { mode: "exam", title: "Stay calm and use the time well", text: "Give me practical ways to stay calm and manage my time in an exam, from the night before to the last ten minutes." },
    ] },
    { title: "Learn", group: "code", items: [
        { mode: "coding", title: "Recursion and the call stack", text: "Explain recursion with a simple Python example, and show what happens on the call stack." },
        { mode: "coding", title: "Big O in plain words", text: "Explain Big O notation in plain words with examples of O(1), O(n) and O(n squared)." },
        { mode: "coding", title: "SQL joins with tiny tables", text: "Explain the difference between inner, left and full joins in SQL using small example tables." },
    ] },
    { title: "Fix and improve", group: "code", items: [
        { mode: "coding", title: "Help me find a bug", text: "I'm going to paste some code that isn't working. Ask me what it should do, then help me find the bug." },
        { mode: "coding", title: "Review my code", text: "I'll paste some code I wrote. Review it like a friendly senior developer, starting with the most important improvement." },
        { mode: "coding", title: "Explain an error message", text: "I'll paste an error message. Explain what it means in plain words, what usually causes it and how to fix it." },
    ] },
    { title: "Practise", group: "code", items: [
        { mode: "coding", title: "A small coding challenge", text: "Give me a small coding challenge in Python at my level. Wait for my solution, then review it and suggest one improvement." },
        { mode: "coding", title: "Predict the output", text: "Show me a short Python snippet and ask me to predict its output, then explain the answer. Do five of these, one at a time." },
        { mode: "coding", title: "Build a mini project", text: "Help me plan and build a small beginner project in Python step by step. Start by asking what I'm interested in." },
    ] },
];

function group_of(mode) {
    return state.mode_groups[mode] || "study";
}

function mode_name(mode) {
    return state.mode_names[mode] || "General study";
}

// short is for the small line on cards, like 19h ago instead of 19 hours ago
function time_ago(seconds, short = false) {
    const gap = Math.max(0, Date.now() / 1000 - seconds);
    if (gap < 60) return "just now";
    const steps = [[31536000, "year", "y"], [2592000, "month", "mo"], [604800, "week", "w"], [86400, "day", "d"], [3600, "hour", "h"], [60, "minute", "m"]];
    const [size, unit, letter] = steps.find(([size]) => gap >= size);
    const n = Math.floor(gap / size);
    return short ? `${n}${letter} ago` : `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

function prompt_tile(item) {
    return `<button class="tile poster" type="button" data-mode="${item.mode}" data-text="${escape_html(item.text)}" title="${escape_html(item.text)}">
        ${sketch_html(sketch_for(`${item.title} ${item.text}`, item.mode))}
        <strong>${escape_html(item.title)}</strong>
        <span class="tile-sub">${escape_html(mode_name(item.mode))}</span>
    </button>`;
}

function subject_tile(mode) {
    return `<button class="tile subject poster" type="button" data-pick="${mode.id}" title="${escape_html(mode.hint)}">
        ${sketch_html(mode_sketches[mode.id] || "bulb", "inline")}
        <strong>${escape_html(mode.name)}</strong>
    </button>`;
}

function chat_card(c) {
    return `<div class="chat-card">
        <a class="chat-card-art poster" href="#/c/${c.id}" aria-label="Open ${escape_html(c.title)}">
            ${sketch_html(sketch_for(c.title, c.mode))}
            <span class="play">${icons.play}</span>
        </a>
        <div class="chat-card-info">
            <div class="chat-card-text">
                <strong title="${escape_html(c.title)}">${escape_html(c.title)}</strong>
                <span class="card-meta"><span class="meta-what">${escape_html(mode_name(c.mode))}</span><span class="meta-when"> · ${time_ago(c.updated, true)}</span></span>
            </div>
            <button class="icon-btn" type="button" data-remove="${c.id}" aria-label="Delete ${escape_html(c.title)}">${icons.trash}</button>
        </div>
    </div>`;
}

function row_html(title, cards) {
    return `<section class="row">
        <h3 class="row-title">${escape_html(title)}</h3>
        <button class="row-arrow prev" type="button" aria-label="Scroll ${escape_html(title)} left">${icons.prev}</button>
        <div class="row-track">${cards}</div>
        <button class="row-arrow next" type="button" aria-label="Scroll ${escape_html(title)} right">${icons.next}</button>
    </section>`;
}

// home is split into study, exam and code, each with its own rows underneath
const continue_titles = { study: "Continue studying", exam: "Continue revising", code: "Continue coding" };
const max_suggestions = 3;

// each section holds its own chats, tools, saved sets and suggestions, in that order
function render_rows() {
    const rows = el("rows");
    if (!rows) return;
    const card = (item) => (item.tool ? tool_tile(item.tool, item.mode) : prompt_tile(item));
    const shelf_rows = (group) => shelves
        .filter((shelf) => shelf.group === group)
        .map((shelf) => row_html(shelf.title, shelf.items.slice(0, max_suggestions).map(card).join("")))
        .join("");
    const saved = (group) => `<div id="continue-${group}"></div>`;
    const sets = (group) => `<div id="decks-${group}"></div><div id="quizzes-${group}"></div>`;
    const study_subjects = state.modes.filter((m) => m.group === "study");
    const sections = {
        study: saved("study")
            + row_html("Study tools", tool_tile("summary", "general") + tool_tile("flashcards", "general"))
            + sets("study")
            + (study_subjects.length ? row_html("Pick a subject", study_subjects.map(subject_tile).join("")) : "")
            + shelf_rows("study"),
        exam: '<div id="reminders-exam"></div><div id="performance-exam"></div>' + saved("exam") + sets("exam") + shelf_rows("exam"),
        code: saved("code") + sets("code") + shelf_rows("code"),
    };
    rows.innerHTML = Object.entries(sections).map(([group, html]) => `
        <section class="category">
            <h2 class="category-title">${escape_html(state.groups[group] || group)}</h2>
            ${html}
        </section>`).join("");
    render_continue();
    render_set_rows();
    render_performance_row();
    render_reminder_row();
}

function render_continue() {
    Object.entries(continue_titles).forEach(([group, title]) => {
        const slot = el(`continue-${group}`);
        if (!slot) return;
        const chats = state.conversations.filter((c) => group_of(c.mode) === group).slice(0, 5);
        slot.innerHTML = chats.length ? row_html(title, chats.map(chat_card).join("")) : "";
    });
}

// scroll arrows only show when a row has more to see in that direction
function sync_arrows(row) {
    const track = row.querySelector(".row-track");
    if (!track) return;
    row.classList.toggle("can-prev", track.scrollLeft > 4);
    row.classList.toggle("can-next", track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
}

thread.addEventListener("pointerover", (event) => {
    const row = event.target.closest(".row");
    if (row) sync_arrows(row);
});
thread.addEventListener("focusin", (event) => {
    const row = event.target.closest(".row");
    if (row) sync_arrows(row);
});
// scroll doesn't bubble, so the rows' scrolling is caught on the way down
thread.addEventListener("scroll", (event) => {
    if (event.target.classList?.contains("row-track")) sync_arrows(event.target.parentElement);
}, { capture: true, passive: true });

// the placeholder names the chosen subject so picking one feels like it did something
function sync_placeholder() {
    const mode = mode_select.value;
    input.placeholder = !mode || mode === "general" ? "Ask anything, or drop a PDF here" : `Ask about ${mode_name(mode).toLowerCase()}`;
}

mode_select.addEventListener("change", sync_placeholder);

thread.addEventListener("click", (event) => {
    const target = event.target;
    const tile = target.closest(".tile[data-text]");
    if (tile) {
        mode_select.value = tile.dataset.mode;
        send_message(tile.dataset.text);
        return;
    }
    const pick = target.closest("[data-pick]");
    if (pick) {
        mode_select.value = pick.dataset.pick;
        sync_placeholder();
        input.focus();
        return;
    }
    const remove = target.closest("[data-remove]");
    if (remove) {
        const c = state.conversations.find((item) => item.id === remove.dataset.remove);
        if (c) delete_conversation(c);
        return;
    }
    const arrow = target.closest(".row-arrow");
    if (arrow) {
        const track = arrow.parentElement.querySelector(".row-track");
        const step = track.clientWidth * 0.85;
        track.scrollBy({ left: arrow.classList.contains("prev") ? -step : step, behavior: "smooth" });
    }
});

// leaving a chat for one of the pages starts the next question fresh
function enter_page(hash, name, html) {
    stop_reading();
    state.conversation_id = null;
    state.pending = [];
    render_attachments();
    mode_select.value = state.default_mode;
    sync_placeholder();
    history.replaceState(null, "", hash);
    set_title("");
    document.title = `${name} · Rahah`;
    thread.innerHTML = html;
    thread.scrollTop = 0;
}

// chats page, every chat as a card grouped by day, with search and a new chat button

function day_group(seconds) {
    const midnight = new Date().setHours(0, 0, 0, 0) / 1000;
    if (seconds >= midnight) return "Today";
    if (seconds >= midnight - 86400) return "Yesterday";
    if (seconds >= midnight - 7 * 86400) return "Last 7 days";
    return "Earlier";
}

// the chats and tests page, saved tests first with a card to make a new one, then chats by day
function render_chats() {
    const list = el("chat-groups");
    if (!list) return;
    const all_tests = state.sets.filter((s) => s.kind === "quiz");
    el("chat-search").hidden = !state.conversations.length && !all_tests.length;
    const words = el("chat-search").value.trim().toLowerCase();
    const matches = (title) => !words || title.toLowerCase().includes(words);
    const tests = all_tests.filter((s) => matches(s.title));
    const chats = state.conversations.filter((c) => matches(c.title));

    // the make a test card only shows when nothing is being searched for
    const new_test = `<button class="tile tool poster new-test" type="button" data-tool="quiz" data-mode="exam">
        ${sketch_html("checklist")}
        <strong>New test</strong>
        <span class="tile-sub">Questions on a topic or your notes, with a score</span>
    </button>`;
    const test_cards = tests.map(set_card).join("") + (words ? "" : new_test);
    const tests_html = `<h2 class="section-title">Tests</h2>
        ${test_cards ? `<div class="card-grid">${test_cards}</div>` : '<p class="page-note">No tests match that search.</p>'}`;

    let chats_html;
    if (!state.conversations.length) {
        chats_html = '<p class="page-note">Your chats show up here once you start one.</p>';
    } else if (!chats.length) {
        chats_html = '<p class="page-note">No chats match that search.</p>';
    } else {
        const groups = new Map();
        chats.forEach((c) => {
            const name = day_group(c.updated);
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(c);
        });
        chats_html = [...groups].map(([name, items]) => `
            <h3 class="group-title">${name}</h3>
            <div class="card-grid">${items.map(chat_card).join("")}</div>`).join("");
    }
    list.innerHTML = tests_html + `<h2 class="section-title">Chats</h2>` + chats_html;
}

function show_chats() {
    if (state.busy) return;
    enter_page("#/chats", "Chats & Tests", `<div class="list-page" id="chats">
        <div class="page-tools">
            <input class="search" id="chat-search" type="search" placeholder="Search chats and tests" aria-label="Search chats and tests" hidden>
            <button class="btn btn-soft btn-small" type="button" data-tool="quiz" data-mode="exam">${icons.quiz}New test</button>
            <div class="new-chat">
                <button class="btn btn-accent btn-small" type="button" id="new-chat-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="new-chat-menu">${icons.plus}New chat</button>
                <div class="new-chat-menu" id="new-chat-menu" role="menu" aria-label="New chat" hidden></div>
            </div>
        </div>
        <div id="chat-groups"></div>
    </div>`);
    el("chat-search").addEventListener("input", render_chats);
    el("new-chat-btn").addEventListener("click", () => (el("new-chat-menu").hidden ? open_new_chat_menu() : close_new_chat_menu()));
    el("new-chat-menu").addEventListener("keydown", new_chat_menu_keys);
    render_chats();
    sync_view();
    load_history();
}

// the new chat button drops a box down with a fresh chat at the top and the five newest chats under it

function open_new_chat_menu() {
    const menu = el("new-chat-menu");
    const recent = state.conversations.slice(0, 5).map((c) => `
        <a class="input-option recent-option" role="menuitem" href="#/c/${c.id}">
            <span class="opt-icon">${icons.chat}</span>
            <span class="recent-text"><strong>${escape_html(c.title)}</strong><small>${escape_html(mode_name(c.mode))} · ${time_ago(c.updated)}</small></span>
        </a>`).join("");
    menu.innerHTML = `
        <button class="input-option" type="button" role="menuitem" data-home>
            <span class="opt-icon">${icons.plus}</span>
            <span><strong>Start a new chat</strong><small>A fresh page, any subject</small></span>
        </button>
        ${recent ? `<p class="new-chat-heading">Recent</p>${recent}` : ""}`;
    menu.hidden = false;
    el("new-chat-btn").setAttribute("aria-expanded", "true");
    menu.querySelector(".input-option").focus();
}

function close_new_chat_menu(refocus = false) {
    const menu = el("new-chat-menu");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    el("new-chat-btn").setAttribute("aria-expanded", "false");
    if (refocus) el("new-chat-btn").focus();
}

function new_chat_menu_keys(event) {
    const options = [...el("new-chat-menu").querySelectorAll(".input-option")];
    const at = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
        event.preventDefault();
        close_new_chat_menu(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        options[(at + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
    } else if (event.key === "Tab") {
        close_new_chat_menu();
    }
}

document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".new-chat")) close_new_chat_menu();
});

thread.addEventListener("click", (event) => {
    // home links drawn inside the thread, like the new chat button and quiz results
    if (event.target.closest("[data-home]")) start_new_chat();
});

// recommendations page, suggestions from claude based on what the student has studied, grouped by topic

const rec_kinds = { review: "Review", next: "Next step", related: "Related" };
const rec_actions = {
    ask: { label: "Ask", icon: "chat" },
    flashcards: { label: "Flashcards", icon: "cards" },
    quiz: { label: "Test", icon: "quiz" },
    summary: { label: "Summary", icon: "summary" },
};

function rec_action(item) {
    if (item.action !== "open") return rec_actions[item.action];
    const saved = state.sets.find((s) => s.id === item.set_id);
    return saved?.kind === "flashcards" ? { label: "Your deck", icon: "cards" } : { label: "Retake test", icon: "quiz" };
}

function rec_card(item, i) {
    const action = rec_action(item);
    // claude picks the sketch, older picks without one get a drawing from their words
    const sketch = item.sketch && sketches[item.sketch] ? item.sketch : sketch_for(`${item.title} ${item.prompt}`, item.mode);
    const kind = rec_kinds[item.kind] ? ` · ${rec_kinds[item.kind]}` : "";
    return `<button class="tile rec poster" type="button" data-rec="${i}">
        <span class="rec-chip">${icons[action.icon]}${escape_html(action.label)}</span>
        ${sketch_html(sketch)}
        <strong>${inline_markdown(item.title)}</strong>
        <span class="tile-sub">${inline_markdown(item.reason)}</span>
        <span class="rec-subject">${escape_html(mode_name(item.mode))}${kind}</span>
    </button>`;
}

// suggestions about the same topic sit together, in the order claude ranked them
function rec_groups(items) {
    const groups = new Map();
    items.forEach((item, i) => {
        const topic = item.topic || mode_name(item.mode);
        if (!groups.has(topic)) groups.set(topic, []);
        groups.get(topic).push([item, i]);
    });
    return [...groups];
}

function render_recommendations() {
    const page = el("recommendations");
    if (!page) return;
    const recs = state.recs;
    if (!recs) {
        page.innerHTML = '<p class="page-note">Loading…</p>';
        return;
    }
    if (!recs.has_activity) {
        page.innerHTML = `<div class="page-empty">
            <strong>Nothing to go on yet</strong>
            Chat, make flashcards or take a test, and Rahah will suggest what to study next.
            <div><button class="btn btn-accent" type="button" data-home>Start studying</button></div>
        </div>`;
        return;
    }
    const when = recs.created ? ` · updated ${time_ago(recs.created)}` : "";
    const top = `<div class="page-tools">
        <p class="page-note">Picked from your chats, decks and quiz scores${state.recs_loading ? "" : when}</p>
        <button class="btn btn-soft btn-small" type="button" data-refresh-recs ${state.recs_loading ? "disabled" : ""}>
            ${state.recs_loading ? "Finding new picks…" : "Refresh"}
        </button>
    </div>`;
    const error = state.recs_error ? `<p class="notice">${escape_html(state.recs_error)}</p>` : "";
    if (!recs.items.length) {
        const note = state.recs_loading ? "Looking through what you've studied…" : "";
        page.innerHTML = top + error + (note ? `<p class="page-note wait">${note}</p>` : "");
        return;
    }
    page.innerHTML = top + error + rec_groups(recs.items).map(([topic, entries]) => `
        <h3 class="group-title">${escape_html(topic)}</h3>
        <div class="card-grid">${entries.map(([item, i]) => rec_card(item, i)).join("")}</div>`).join("");
}

async function make_recommendations() {
    if (state.recs_loading) return;
    state.recs_loading = true;
    state.recs_error = "";
    render_recommendations();
    try {
        const response = await api("/api/recommendations", { method: "POST" });
        state.recs = await response.json();
    } catch (error) {
        state.recs_error = error.message;
    }
    state.recs_loading = false;
    render_recommendations();
}

async function load_recommendations() {
    try {
        const response = await api("/api/recommendations");
        state.recs = await response.json();
    } catch (error) {
        state.recs = { items: [], has_activity: true, created: null, fresh: false };
        state.recs_error = error.message;
    }
    render_recommendations();
    // new picks are only asked for when something new has been studied since the last ones
    if (state.recs.has_activity && !state.recs.fresh && !state.recs_error) make_recommendations();
}

function show_recommendations() {
    if (state.busy) return;
    enter_page("#/suggestions", "Suggestions", '<div class="list-page" id="recommendations"></div>');
    state.recs_error = "";
    render_recommendations();
    sync_view();
    load_sets();
    load_recommendations();
}

thread.addEventListener("click", (event) => {
    if (event.target.closest("[data-refresh-recs]")) {
        make_recommendations();
        return;
    }
    const card = event.target.closest("[data-rec]");
    if (!card || !state.recs) return;
    const item = state.recs.items[Number(card.dataset.rec)];
    if (!item) return;
    if (item.action === "open") open_set(item.set_id);
    else open_sheet(item.action, item.mode, item.prompt);
});

// reminders for exams, cats, midterms, assignments and other events
// dates are the student's own calendar dates, so today is worked out here rather than on the server

const reminder_every = [[1, "Every day"], [2, "Every 2 days"], [3, "Every 3 days"], [7, "Every week"]];
const reminder_lead = [[3, "3 days before"], [7, "1 week before"], [14, "2 weeks before"], [30, "1 month before"]];
const reminder_sketches = { exam: "checklist", cat: "pencil", midterm: "clock", assignment: "notes", event: "calendar" };
const revision_kinds = ["exam", "cat", "midterm"];
const reminder_form = { kind: "exam", every: 2, lead: 7, editing: null };
const toasted = new Set(); // reminders already shown as a pop up in this visit

function iso_day(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function local_today() {
    return iso_day(new Date());
}

function parse_day(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function shift_day(iso, days) {
    const d = parse_day(iso);
    d.setDate(d.getDate() + days);
    return iso_day(d);
}

function days_left(iso) {
    // counted on whole calendar days, so clock changes don't throw it off by one
    const [a, b] = [parse_day(local_today()), parse_day(iso)];
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

function nice_day(iso) {
    return parse_day(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// the same rule as the server, starting lead days before, every few days, plus the day before and the day itself
function reminder_offsets(lead, every) {
    const days = new Set([1, 0]);
    for (let d = lead; d > 1; d -= every) days.add(d);
    return [...days].sort((a, b) => b - a);
}

function reminder_dates(r) {
    return (r.reminder_days || reminder_offsets(r.lead_days, r.every_days)).map((d) => shift_day(r.due_date, -d));
}

function countdown(left) {
    if (left === 0) return { big: "Today", small: "" };
    if (left === 1) return { big: "Tomorrow", small: "" };
    return { big: String(left), small: "days to go" };
}

function reminder_message(r) {
    const left = days_left(r.due_date);
    const name = `${state.reminder_kinds[r.kind] || "Event"}: ${r.title}`;
    const at = r.due_time ? ` at ${r.due_time}` : "";
    if (left === 0) return `${name} is today${at}`;
    if (left === 1) return `${name} is tomorrow${at}`;
    return `${name} is in ${left} days, on ${nice_day(r.due_date)}${at}`;
}

function is_upcoming(r) {
    return !r.done && days_left(r.due_date) >= 0;
}

function next_reminder(r) {
    const today = local_today();
    const next = reminder_dates(r).find((d) => d >= today && !(d === today && r.seen.includes(today)));
    if (!next) return "";
    return next === today ? "Reminding you today" : `Next reminder ${nice_day(next)}`;
}

function every_text(r) {
    return (reminder_every.find(([v]) => v === r.every_days)?.[1] || `Every ${r.every_days} days`).toLowerCase();
}

function help_text(r) {
    const when = `${nice_day(r.due_date)}${r.due_time ? ` at ${r.due_time}` : ""}`;
    const notes = r.notes ? ` My notes: ${r.notes}` : "";
    const kind = (state.reminder_kinds[r.kind] || "event").toLowerCase();
    if (revision_kinds.includes(r.kind)) {
        const left = days_left(r.due_date);
        const away = left === 0 ? "It's today." : left === 1 ? "It's tomorrow." : `That's ${left} days away.`;
        return `Help me plan my revision for my ${kind}, ${r.title}, on ${when}. ${away} Ask me what it covers first if you need to.${notes}`;
    }
    if (r.kind === "assignment") return `Help me get started on my assignment, ${r.title}, due ${when}. Help me break it into steps I can finish in time.${notes}`;
    return `Help me get ready for ${r.title} on ${when}.${notes}`;
}

function reminder_card(r) {
    const left = days_left(r.due_date);
    const past = r.done || left < 0;
    const count = past ? { big: r.done ? "Done" : "Past", small: "" } : countdown(left);
    const kind = state.reminder_kinds[r.kind] || "Event";
    const sketch = sketch_for(r.title, r.mode, reminder_sketches[r.kind]);
    const subject = r.mode ? ` · ${escape_html(mode_name(r.mode))}` : "";
    const next = past ? "" : next_reminder(r);
    return `<div class="reminder-card${past ? " past" : ""}${!past && left <= 1 ? " soon" : ""}">
        <div class="reminder-art poster">
            <span class="rec-chip">${escape_html(kind)}</span>
            ${sketch_html(sketch)}
            <div class="countdown"><strong>${count.big}</strong>${count.small ? `<span>${count.small}</span>` : ""}</div>
        </div>
        <div class="reminder-info">
            <strong title="${escape_html(r.title)}">${escape_html(r.title)}</strong>
            <span>${nice_day(r.due_date)}${r.due_time ? ` · ${escape_html(r.due_time)}` : ""}${subject}</span>
            ${next ? `<span class="reminder-next">${next} · ${every_text(r)}</span>` : ""}
            ${r.plan && !past ? `<span class="reminder-next">Plan: ${r.plan.days.filter((d) => d.done).length} of ${plural(r.plan.days.length, "day")} done</span>` : ""}
            ${r.notes ? `<span class="reminder-notes" title="${escape_html(r.notes)}">${escape_html(r.notes)}</span>` : ""}
            <div class="reminder-actions">
                ${past ? "" : revision_kinds.includes(r.kind)
                    ? `<button class="btn btn-soft btn-small" type="button" data-rem-plan="${r.id}">${r.plan ? "Revision plan" : "Plan revision"}</button>`
                    : `<button class="btn btn-soft btn-small" type="button" data-rem-help="${r.id}">Get help</button>`}
                <span class="spacer"></span>
                <button class="icon-btn" type="button" data-rem-done="${r.id}" aria-label="${r.done ? "Mark as not done" : "Mark as done"}" title="${r.done ? "Mark as not done" : "Mark as done"}">${r.done ? icons.close : icons.check}</button>
                <button class="icon-btn" type="button" data-rem-edit="${r.id}" aria-label="Edit ${escape_html(r.title)}" title="Edit">${icons.pencil}</button>
                <a class="icon-btn" href="/api/reminders/${r.id}/calendar.ics" download aria-label="Add ${escape_html(r.title)} to your calendar" title="Add to calendar">${icons.calendar}</a>
                <button class="icon-btn" type="button" data-rem-delete="${r.id}" aria-label="Delete ${escape_html(r.title)}" title="Delete">${icons.trash}</button>
            </div>
        </div>
    </div>`;
}

function notification_tools() {
    if (!("Notification" in window)) return "";
    if (Notification.permission === "default") {
        return `<button class="btn btn-soft btn-small" type="button" data-notify>${icons.bell}Turn on notifications</button>`;
    }
    if (Notification.permission === "denied") return '<span class="page-note">Notifications are blocked in this browser\'s settings</span>';
    return `<span class="page-note on">${icons.check}Notifications on</span>`;
}

function render_reminders() {
    const page = el("reminders");
    if (!page) return;
    const upcoming = state.reminders.filter(is_upcoming);
    const soon = upcoming.filter((r) => days_left(r.due_date) <= 7);
    const later = upcoming.filter((r) => days_left(r.due_date) > 7);
    // the most recently finished come first
    const finished = state.reminders.filter((r) => !is_upcoming(r)).reverse();
    const tools = `<div class="planner-head">
        <h2 class="planner-title">Reminders</h2>
        <div class="tool-buttons">
            ${upcoming.length ? `<a class="btn btn-soft btn-small" href="/api/reminders/calendar.ics" download title="Every upcoming reminder goes into your calendar with its alerts">${icons.calendar}Add to calendar</a>` : ""}
            <button class="btn btn-accent btn-small" type="button" data-rem-add>${icons.plus}Add reminder</button>
        </div>
    </div>
    <div class="planner-note-row">
        <p class="planner-note">Alerts show while Rahah is open. Add them to your calendar to get them when it's closed.</p>
        ${notification_tools()}
    </div>`;
    if (!state.reminders.length) {
        page.innerHTML = tools + `<div class="planner-empty">
            <strong>No reminders yet</strong>
            Add exams, CATs, midterms and deadlines, and Rahah will remind you as they get close.
        </div>`;
        return;
    }
    const group = (title, items) => items.length
        ? `<h3 class="group-title">${title}</h3><div class="card-grid reminder-grid">${items.map(reminder_card).join("")}</div>`
        : "";
    page.innerHTML = tools + group("This week", soon) + group("Coming up", later) + group("Done and past", finished);
}

function render_reminder_row() {
    const box = el("reminders-exam");
    if (!box) return;
    const upcoming = state.reminders.filter(is_upcoming).slice(0, 6);
    const add_tile = `<button class="tile poster" type="button" data-rem-add>
        ${sketch_html("calendar")}
        <strong>${upcoming.length ? "Add another reminder" : "Set a reminder"}</strong>
        <span class="tile-sub">Exams, CATs, midterms and deadlines</span>
    </button>`;
    box.innerHTML = row_html("Coming up", upcoming.map(reminder_card).join("") + add_tile);
}

function sync_reminder_badge() {
    // how many things are due in the next three days
    const close = state.reminders.filter((r) => is_upcoming(r) && days_left(r.due_date) <= 3).length;
    const badge = el("reminder-badge");
    badge.hidden = !close;
    badge.textContent = close;
    badge.parentElement.setAttribute("aria-label", close ? `Reminders, ${close} coming up soon` : "Reminders");
}

async function load_reminders() {
    try {
        const response = await api("/api/reminders");
        const body = await response.json();
        state.reminders = body.reminders;
        if (body.kinds) state.reminder_kinds = body.kinds;
    } catch (error) {
        return;
    }
    render_reminders();
    render_reminder_row();
    sync_reminder_badge();
    check_reminders();
}

// anything due a reminder today is shown once as a pop up, and as a notification when they're on
function check_reminders() {
    const today = local_today();
    state.reminders.forEach((r) => {
        if (!is_upcoming(r) || r.seen.includes(today) || toasted.has(r.id)) return;
        if (!reminder_dates(r).includes(today)) return;
        toasted.add(r.id);
        show_toast(r);
        if ("Notification" in window && Notification.permission === "granted") {
            try {
                new Notification(reminder_message(r), { body: r.notes || "Open Rahah to plan for it.", tag: `${r.id}-${today}`, icon: "/static/img/icon-180.png" });
            } catch (e) {}
        }
        r.seen.push(today);
        api(`/api/reminders/${r.id}/seen`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ day: today }),
        }).catch(() => {});
    });
}

function show_toast(r) {
    const box = el("toasts");
    // only a few at a time, the reminders page lists the rest
    if (box.children.length >= 3) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `${sketch_html(reminder_sketches[r.kind] || "calendar", "small")}
        <div class="toast-text"><strong>${escape_html(reminder_message(r))}</strong>${r.notes ? `<span>${escape_html(r.notes)}</span>` : ""}</div>
        <div class="toast-actions">
            ${revision_kinds.includes(r.kind)
                ? `<button class="btn btn-accent btn-small" type="button" data-rem-plan="${r.id}">${r.plan ? "Revision plan" : "Plan revision"}</button>`
                : `<button class="btn btn-accent btn-small" type="button" data-rem-help="${r.id}">Get help</button>`}
            <button class="icon-btn" type="button" data-toast-close aria-label="Dismiss">${icons.close}</button>
        </div>`;
    box.appendChild(toast);
}

el("toasts").addEventListener("click", (event) => {
    const toast = event.target.closest(".toast");
    if (!toast) return;
    if (event.target.closest("[data-toast-close], [data-rem-help], [data-rem-plan]")) toast.remove();
});

function show_reminders() {
    if (state.busy) return;
    enter_page("#/reminders", "Reminders and Timetable", `<div class="list-page planner">
        <section class="planner-col" id="reminders" aria-label="Reminders"></section>
        <section class="planner-col" id="timetable" aria-label="Timetable"></section>
    </div>`);
    render_reminders();
    render_timetable();
    sync_view();
    load_reminders();
    load_timetable();
}

// the weekly timetable, classes that repeat every week, listed day by day starting today
// days run monday 0 to sunday 6, the same as the server

const day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const day_short = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const class_form = { day: 0, editing: null };

function week_day(d = new Date()) {
    return (d.getDay() + 6) % 7;
}

function clock_now() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function class_row(c, today) {
    const now = today && c.start_time <= clock_now() && clock_now() < c.end_time;
    const about = [c.mode ? mode_name(c.mode) : "", c.place].filter(Boolean).map(escape_html).join(" · ");
    return `<div class="class-row${now ? " now" : ""}">
        <div class="class-time"><strong>${c.start_time}</strong><span>${c.end_time}</span></div>
        <div class="class-info">
            <strong title="${escape_html(c.title)}">${escape_html(c.title)}</strong>
            ${about ? `<span>${about}</span>` : ""}
        </div>
        ${now ? '<span class="class-now">Now</span>' : ""}
        <button class="icon-btn" type="button" data-class-edit="${c.id}" aria-label="Edit ${escape_html(c.title)}" title="Edit">${icons.pencil}</button>
        <button class="icon-btn" type="button" data-class-delete="${c.id}" aria-label="Delete ${escape_html(c.title)}" title="Delete">${icons.trash}</button>
    </div>`;
}

function render_timetable() {
    const box = el("timetable");
    if (!box) return;
    const head = `<div class="planner-head">
        <h2 class="planner-title">Timetable</h2>
        <div class="tool-buttons">
            ${state.classes.length ? `<a class="btn btn-soft btn-small" href="/api/timetable/calendar.ics" download title="Every class repeats weekly in your calendar, with an alert 15 minutes before">${icons.calendar}Add to calendar</a>` : ""}
            <button class="btn btn-accent btn-small" type="button" data-class-add>${icons.plus}Add class</button>
        </div>
    </div>
    <div class="planner-note-row">
        <p class="planner-note">Classes repeat weekly. Add them to your calendar for an alert 15 minutes before each.</p>
    </div>`;
    if (!state.classes.length) {
        box.innerHTML = head + `<div class="planner-empty">
            <strong>No classes yet</strong>
            Add your weekly classes to see each day at a glance.
        </div>`;
        return;
    }
    const today = week_day();
    // today always shows, the other days only when they have classes
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => (today + i) % 7).filter((d, i) => i === 0 || state.classes.some((c) => c.day === d));
    box.innerHTML = head + days.map((d) => {
        const ahead = (d - today + 7) % 7;
        const label = ahead === 0 ? `Today · ${day_names[d]}` : ahead === 1 ? `Tomorrow · ${day_names[d]}` : day_names[d];
        const rows = state.classes.filter((c) => c.day === d).map((c) => class_row(c, ahead === 0)).join("");
        return `<div class="timetable-day${ahead === 0 ? " today" : ""}">
            <h3 class="timetable-day-title">${label}</h3>
            ${rows || '<p class="timetable-free">No classes today</p>'}
        </div>`;
    }).join("");
}

async function load_timetable() {
    try {
        const response = await api("/api/timetable");
        state.classes = (await response.json()).classes;
    } catch (error) {
        return;
    }
    render_timetable();
}

// the class under now moves on as the day goes, so the list is redrawn each minute while it's open
setInterval(() => {
    if (el("timetable") && document.visibilityState === "visible") render_timetable();
}, 60 * 1000);

const class_sheet = el("class-sheet");

function render_class_days() {
    el("class-days").innerHTML = choice_buttons(day_short.map((name, i) => [i, name]), class_form.day, "day");
}

function open_class_sheet(c = null) {
    class_form.editing = c ? c.id : null;
    class_form.day = c ? c.day : week_day();
    el("class-title").textContent = c ? "Edit class" : "Add a class";
    el("class-submit").textContent = c ? "Save changes" : "Save class";
    el("class-name").value = c ? c.title : "";
    el("class-start").value = c ? c.start_time : "";
    el("class-end").value = c ? c.end_time : "";
    el("class-place").value = c ? c.place : "";
    el("class-mode").innerHTML = mode_options_html();
    el("class-mode").value = c ? c.mode || "general" : "general";
    el("class-error").hidden = true;
    render_class_days();
    class_sheet.showModal();
    el("class-name").focus();
}

el("class-days").addEventListener("click", (event) => {
    const button = event.target.closest("[data-day]");
    if (!button) return;
    class_form.day = Number(button.dataset.day);
    el("class-days").querySelectorAll(".choice").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
});

// picking a start fills in an end an hour later, when there isn't one yet
el("class-start").addEventListener("change", () => {
    const start = el("class-start").value;
    if (!start || el("class-end").value) return;
    const [h, m] = start.split(":").map(Number);
    const end = Math.min(h * 60 + m + 60, 23 * 60 + 59);
    el("class-end").value = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
});

el("class-close").addEventListener("click", () => class_sheet.close());
el("class-cancel").addEventListener("click", () => class_sheet.close());

el("class-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const show_error = (text) => {
        el("class-error").textContent = text;
        el("class-error").hidden = false;
    };
    const title = el("class-name").value.trim();
    const start_time = el("class-start").value;
    const end_time = el("class-end").value;
    if (!title) return show_error("Name the class, like Biology.");
    if (!start_time || !end_time) return show_error("Pick when it starts and ends.");
    if (end_time <= start_time) return show_error("The class has to end after it starts.");
    const body = {
        title, day: class_form.day, start_time, end_time, place: el("class-place").value,
        mode: el("class-mode").value === "general" ? "" : el("class-mode").value,
    };
    const editing = class_form.editing;
    el("class-submit").disabled = true;
    try {
        await api(editing ? `/api/timetable/${editing}` : "/api/timetable", {
            method: editing ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        class_sheet.close();
        await load_timetable();
    } catch (error) {
        show_error(error.message);
    } finally {
        el("class-submit").disabled = false;
    }
});

document.addEventListener("click", async (event) => {
    const find = (name) => event.target.closest(`[data-${name}]`);
    if (find("class-add")) {
        open_class_sheet();
        return;
    }
    const edit = find("class-edit");
    if (edit) {
        const c = state.classes.find((x) => x.id === edit.dataset.classEdit);
        if (c) open_class_sheet(c);
        return;
    }
    const remove = find("class-delete");
    if (remove) {
        const c = state.classes.find((x) => x.id === remove.dataset.classDelete);
        if (!c || !confirm(`Delete ${c.title} on ${day_names[c.day]}?`)) return;
        try {
            await api(`/api/timetable/${c.id}`, { method: "DELETE" });
        } catch (error) {
            alert(error.message);
        }
        load_timetable();
    }
});

// the add and edit sheet

const reminder_sheet = el("reminder-sheet");

function choice_buttons(items, picked, name) {
    return items.map(([value, label]) =>
        `<button class="choice" type="button" data-${name}="${value}" aria-pressed="${String(value) === String(picked)}">${escape_html(label)}</button>`).join("");
}

function render_reminder_choices() {
    el("reminder-kinds").innerHTML = choice_buttons(Object.entries(state.reminder_kinds), reminder_form.kind, "kind");
    el("reminder-every").innerHTML = choice_buttons(reminder_every, reminder_form.every, "every");
    el("reminder-lead").innerHTML = choice_buttons(reminder_lead, reminder_form.lead, "lead");
    preview_reminders();
}

function preview_reminders() {
    const due = el("reminder-date").value;
    const preview = el("reminder-preview");
    if (!due) {
        preview.textContent = "Pick a date to see when you'll be reminded.";
        return;
    }
    const today = local_today();
    const dates = reminder_offsets(reminder_form.lead, reminder_form.every).map((d) => shift_day(due, -d)).filter((d) => d >= today);
    if (!dates.length) {
        preview.textContent = "That date has already passed.";
        return;
    }
    const before = dates.filter((d) => d !== due);
    if (!before.length) preview.textContent = "You'll be reminded on the day.";
    else if (before.length > 4) preview.textContent = `${before.length} reminders starting ${nice_day(before[0])}, then one on the day.`;
    else preview.textContent = `Reminders on ${before.map(nice_day).join(", ")}, then one on the day.`;
}

function open_reminder_sheet(r = null) {
    reminder_form.editing = r ? r.id : null;
    reminder_form.kind = r ? r.kind : "exam";
    reminder_form.every = r ? r.every_days : 2;
    reminder_form.lead = r ? r.lead_days : 7;
    el("reminder-title").textContent = r ? "Edit reminder" : "Add a reminder";
    el("reminder-submit").textContent = r ? "Save changes" : "Save reminder";
    el("reminder-name").value = r ? r.title : "";
    el("reminder-date").value = r ? r.due_date : "";
    el("reminder-date").min = r ? "" : local_today();
    el("reminder-time").value = r ? r.due_time : "";
    el("reminder-notes").value = r ? r.notes : "";
    el("reminder-mode").innerHTML = mode_options_html();
    el("reminder-mode").value = r ? r.mode || "general" : (mode_select.value || state.default_mode);
    el("reminder-error").hidden = true;
    render_reminder_choices();
    reminder_sheet.showModal();
    el("reminder-name").focus();
}

["kind", "every", "lead"].forEach((name) => {
    const box = { kind: "reminder-kinds", every: "reminder-every", lead: "reminder-lead" }[name];
    el(box).addEventListener("click", (event) => {
        const button = event.target.closest(`[data-${name}]`);
        if (!button) return;
        const value = button.dataset[name];
        reminder_form[name] = name === "kind" ? value : Number(value);
        el(box).querySelectorAll(".choice").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        preview_reminders();
    });
});

el("reminder-date").addEventListener("input", preview_reminders);
el("reminder-close").addEventListener("click", () => reminder_sheet.close());
el("reminder-cancel").addEventListener("click", () => reminder_sheet.close());

el("reminder-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const show_error = (text) => {
        el("reminder-error").textContent = text;
        el("reminder-error").hidden = false;
    };
    const title = el("reminder-name").value.trim();
    const due_date = el("reminder-date").value;
    if (!title) return show_error("Give it a title, like Biology paper 2.");
    if (!due_date) return show_error("Pick the date it's on.");
    const body = {
        kind: reminder_form.kind, title, due_date, due_time: el("reminder-time").value,
        mode: el("reminder-mode").value === "general" ? "" : el("reminder-mode").value,
        every_days: reminder_form.every, lead_days: reminder_form.lead, notes: el("reminder-notes").value,
    };
    const editing = reminder_form.editing;
    el("reminder-submit").disabled = true;
    try {
        await api(editing ? `/api/reminders/${editing}` : "/api/reminders", {
            method: editing ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        reminder_sheet.close();
        await load_reminders();
    } catch (error) {
        show_error(error.message);
    } finally {
        el("reminder-submit").disabled = false;
    }
});

// a revision plan in the details box, a short form first, then the days with their tasks

// the same details box the performance page uses
const plan_sheet = el("detail-sheet");
const plan_icons = { read: "doc", flashcards: "cards", test: "quiz", practice: "pencil", rest: "check" };

function plan_day_label(iso) {
    const left = days_left(iso);
    const day = nice_day(iso);
    return left === 0 ? `Today · ${day}` : left === 1 ? `Tomorrow · ${day}` : day;
}

function show_plan(id, remake = false) {
    const r = state.reminders.find((x) => x.id === id);
    if (!r) return;
    el("detail-title").textContent = `Revision plan · ${r.title}`;
    const sub = `${escape_html(state.reminder_kinds[r.kind] || "Exam")} on ${nice_day(r.due_date)} · ${plural(days_left(r.due_date), "day")} to go`;
    if (!r.plan || remake) {
        el("detail-body").innerHTML = `
            <p class="detail-sub">${sub}</p>
            <label class="field">
                <span class="field-label">What does it cover? Optional</span>
                <textarea class="text-input" id="plan-topics" rows="3" maxlength="1000" placeholder="Like cells, genetics and ecology">${escape_html(r.plan?.topics || "")}</textarea>
            </label>
            <p class="sheet-error" id="plan-error" role="alert" hidden></p>
            <div class="sheet-actions">
                <button class="btn btn-ghost" type="button" data-plan-ask="${r.id}">Ask Rahah instead</button>
                <button class="btn btn-accent" type="button" data-plan-make="${r.id}">Make my plan</button>
            </div>`;
    } else {
        const done = r.plan.days.filter((d) => d.done).length;
        el("detail-body").innerHTML = `
            <p class="detail-sub">${sub} · ${done} of ${plural(r.plan.days.length, "day")} done</p>
            <ul class="plan-days">${r.plan.days.map((d) => `
                <li class="plan-day${d.done ? " done" : ""}${days_left(d.date) === 0 ? " today" : ""}">
                    <input type="checkbox" class="plan-check" data-plan-day="${d.date}" data-plan-id="${r.id}" aria-label="Done ${escape_html(d.focus)}"${d.done ? " checked" : ""}>
                    <div class="plan-day-body">
                        <p class="plan-date">${plan_day_label(d.date)}</p>
                        <strong>${escape_html(d.focus)}</strong>
                        <div class="plan-tasks">${d.tasks.map((t) => t.kind === "rest"
                            ? `<span class="plan-task rest">${icons.check}${escape_html(t.topic)} · ${t.minutes} min</span>`
                            : `<button class="plan-task" type="button" data-plan-task="${t.kind}" data-plan-topic="${escape_html(t.topic)}" data-plan-id="${r.id}">${icons[plan_icons[t.kind]] || ""}${escape_html(t.topic)} · ${t.minutes} min</button>`).join("")}</div>
                    </div>
                </li>`).join("")}
            </ul>
            <div class="sheet-actions">
                <button class="btn btn-ghost" type="button" data-plan-remake="${r.id}">Make a new plan</button>
                <a class="btn btn-soft" href="/api/reminders/${r.id}/plan.ics" download>${icons.calendar}Add to calendar</a>
            </div>`;
    }
    if (!plan_sheet.open) plan_sheet.showModal();
}

async function make_revision_plan(id) {
    const button = el("detail-body").querySelector("[data-plan-make]");
    const error = el("plan-error");
    button.disabled = true;
    button.textContent = "Making your plan…";
    error.hidden = true;
    try {
        const response = await api(`/api/reminders/${id}/plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ today: local_today(), topics: el("plan-topics").value }),
        });
        const updated = await response.json();
        state.reminders = state.reminders.map((x) => (x.id === id ? updated : x));
        render_reminders();
        render_reminder_row();
        if (plan_sheet.open) show_plan(id);
    } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        button.disabled = false;
        button.textContent = "Make my plan";
    }
}

async function tick_plan_day(id, day, done) {
    try {
        const response = await api(`/api/reminders/${id}/plan/day`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date: day, done }),
        });
        const updated = await response.json();
        state.reminders = state.reminders.map((x) => (x.id === id ? updated : x));
        render_reminders();
        show_plan(id);
    } catch (e) {
        alert(e.message);
    }
}

// a task opens the right tool on its topic, the plan box steps aside for it
function start_plan_task(id, kind, topic) {
    const r = state.reminders.find((x) => x.id === id);
    if (!r) return;
    const mode = r.mode || "exam";
    plan_sheet.close();
    if (kind === "flashcards") open_sheet("flashcards", mode, topic);
    else if (kind === "test") open_sheet("quiz", mode, topic);
    else open_sheet("ask", mode, `Help me revise ${topic} for my ${(state.reminder_kinds[r.kind] || "exam").toLowerCase()}, ${r.title}. Teach me the key points, then check my understanding with a few questions.`);
}

plan_sheet.addEventListener("click", (event) => {
    const find = (name) => event.target.closest(`[data-${name}]`);
    if (find("plan-make")) make_revision_plan(find("plan-make").dataset.planMake);
    else if (find("plan-remake")) show_plan(find("plan-remake").dataset.planRemake, true);
    else if (find("plan-ask")) {
        const r = state.reminders.find((x) => x.id === find("plan-ask").dataset.planAsk);
        plan_sheet.close();
        if (r) open_sheet("ask", r.mode || "exam", help_text(r));
    } else if (find("plan-task")) {
        const task = find("plan-task");
        start_plan_task(task.dataset.planId, task.dataset.planTask, task.dataset.planTopic);
    }
});
plan_sheet.addEventListener("change", (event) => {
    const box = event.target.closest("[data-plan-day]");
    if (box) tick_plan_day(box.dataset.planId, box.dataset.planDay, box.checked);
});

// buttons on reminder cards, wherever they're drawn
document.addEventListener("click", async (event) => {
    const find = (name) => event.target.closest(`[data-${name}]`);
    if (find("rem-add")) {
        open_reminder_sheet();
        return;
    }
    if (find("rem-plan")) {
        show_plan(find("rem-plan").dataset.remPlan);
        return;
    }
    if (find("notify")) {
        await Notification.requestPermission();
        render_reminders();
        return;
    }
    const help = find("rem-help");
    if (help) {
        const r = state.reminders.find((x) => x.id === help.dataset.remHelp);
        if (r) open_sheet("ask", r.mode || "exam", help_text(r));
        return;
    }
    const edit = find("rem-edit");
    if (edit) {
        const r = state.reminders.find((x) => x.id === edit.dataset.remEdit);
        if (r) open_reminder_sheet(r);
        return;
    }
    const done = find("rem-done");
    if (done) {
        const r = state.reminders.find((x) => x.id === done.dataset.remDone);
        if (!r) return;
        try {
            await api(`/api/reminders/${r.id}/done`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ done: !r.done }),
            });
        } catch (error) {
            alert(error.message);
        }
        load_reminders();
        return;
    }
    const remove = find("rem-delete");
    if (remove) {
        const r = state.reminders.find((x) => x.id === remove.dataset.remDelete);
        if (!r || !confirm(`Delete the reminder for "${r.title}"?`)) return;
        try {
            await api(`/api/reminders/${r.id}`, { method: "DELETE" });
        } catch (error) {
            alert(error.message);
        }
        load_reminders();
    }
});

// a new day can start while the page is open, so reminders are checked again now and then
setInterval(check_reminders, 15 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        check_reminders();
        sync_reminder_badge();
    }
});

// study tools, summaries go through chat, flashcards and quizzes are saved sets

const tools = {
    summary: { title: "Summarise notes", sub: "Key points from a PDF or a topic", icon: "summary" },
    flashcards: { title: "Make flashcards", sub: "A deck to flip through", icon: "cards" },
    quiz: { title: "Make a test", sub: "Multiple choice, with a score", icon: "quiz" },
};

const sheet_copy = {
    ask: {
        title: "Ask a question", submit: "Ask", field: "Question", choices: [], pick: null, limit: 20000,
        topic: "What would you like to know? Attach notes if it's about them.",
    },
    summary: {
        title: "Summarise notes", submit: "Summarise", label: "Length",
        choices: [["short", "Short"], ["detailed", "Detailed"]], pick: "short",
        topic: "What should it cover? Leave blank to summarise all your notes.",
    },
    flashcards: {
        title: "Make flashcards", submit: "Make flashcards", working: "Making your flashcards", label: "Cards",
        choices: [[5, "5"], [10, "10"], [15, "15"], [20, "20"]], pick: 10,
        topic: "A topic, like the causes of World War I, or leave blank to use your notes",
    },
    quiz: {
        title: "Make a test", submit: "Make the test", working: "Writing your test", label: "Questions",
        choices: [[5, "5"], [10, "10"], [15, "15"], [20, "20"]], pick: 10,
        topic: "A topic, like photosynthesis, or leave blank to use your notes",
    },
};

const sheet = el("sheet");
const sheet_state = { tool: "flashcards", files: [], pick: 10, style: "choice", opened: 0 };
const test_styles = [["choice", "Multiple choice"], ["written", "Written"], ["mixed", "Mixed"], ["paper", "Past paper"]];

const tool_sketches = { summary: "notes", flashcards: "cards", quiz: "checklist" };

function tool_tile(id, mode) {
    const t = tools[id];
    return `<button class="tile tool poster" type="button" data-tool="${id}" data-mode="${mode}">
        ${sketch_html(tool_sketches[id] || "notes")}
        <strong>${escape_html(t.title)}</strong>
        <span class="tile-sub">${escape_html(t.sub)}</span>
    </button>`;
}

function set_detail(s) {
    if (s.kind === "flashcards") return `${s.size} card${s.size === 1 ? "" : "s"}${s.known ? ` · ${s.known} known` : ""}`;
    const out_of = s.marks || s.size;
    const best = s.best_score === null || s.best_score === undefined ? "" : ` · best ${s.best_score}/${out_of}`;
    return `${s.size} question${s.size === 1 ? "" : "s"}${best}`;
}

function set_card(s) {
    return `<div class="chat-card">
        <a class="chat-card-art poster" href="#/set/${s.id}" aria-label="Open ${escape_html(s.title)}">
            ${sketch_html(sketch_for(s.title, s.mode))}
            <span class="play outline">${s.kind === "quiz" ? icons.quiz : icons.cards}</span>
        </a>
        <div class="chat-card-info">
            <div class="chat-card-text">
                <strong title="${escape_html(s.title)}">${escape_html(s.title)}</strong>
                <span class="card-meta"><span class="meta-what">${set_detail(s)}</span><span class="meta-when"> · ${time_ago(s.updated, true)}</span></span>
            </div>
            <button class="icon-btn" type="button" data-remove-set="${s.id}" aria-label="Delete ${escape_html(s.title)}">${icons.trash}</button>
        </div>
    </div>`;
}

// sets follow their subject, except quizzes for study subjects, which are exam practice
function set_group(s) {
    const group = group_of(s.mode);
    return s.kind === "quiz" && group === "study" ? "exam" : group;
}

function render_set_rows() {
    Object.keys(continue_titles).forEach((group) => {
        const mine = state.sets.filter((s) => set_group(s) === group);
        const decks = mine.filter((s) => s.kind === "flashcards");
        const quizzes = mine.filter((s) => s.kind === "quiz");
        const deck_slot = el(`decks-${group}`);
        const quiz_slot = el(`quizzes-${group}`);
        if (deck_slot) deck_slot.innerHTML = decks.length ? row_html("Your flashcards", decks.map(set_card).join("")) : "";
        if (quiz_slot) quiz_slot.innerHTML = quizzes.length ? row_html("Your tests", quizzes.map(set_card).join("")) : "";
    });
}

async function load_sets() {
    try {
        const response = await api("/api/sets");
        state.sets = (await response.json()).sets;
    } catch (error) {
        return;
    }
    render_set_rows();
    render_chats();
}

async function delete_set(s) {
    if (!confirm(`Delete "${s.title}"?`)) return;
    try {
        await api(`/api/sets/${s.id}`, { method: "DELETE" });
    } catch (error) {
        alert(error.message);
        return;
    }
    if (el("study") && state.study && state.study.set.id === s.id) start_new_chat();
    else load_sets();
    load_performance();
}

// the sheet that sets up a tool

function mode_options_html() {
    const option = (m) => `<option value="${m.id}" title="${escape_html(m.hint)}">${escape_html(m.name)}</option>`;
    const grouped = Object.entries(state.groups).map(([group, label]) => {
        const items = state.modes.filter((m) => m.group === group);
        return items.length ? `<optgroup label="${escape_html(label)}">${items.map(option).join("")}</optgroup>` : "";
    }).join("");
    // an older server sends subjects without groups, so they're listed plainly rather than dropped
    if (grouped) return grouped;
    return state.modes.length ? state.modes.map(option).join("") : '<option value="general">General study</option>';
}

// subject pickers, a rounded menu in place of the browser's own dropdown
// the hidden select still holds the value, so the rest of the page reads and sets it as before

const select_value = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");

function picker_menu_html(select, headings_open) {
    const current = select.value;
    const option = (m) => `
        <button type="button" class="picker-option" role="option" aria-selected="${m.id === current}" data-value="${escape_html(m.id)}"${m.hint ? ` title="${escape_html(m.hint)}"` : ""}>
            <span>${escape_html(m.name)}</span>${m.id === current ? icons.check : ""}
        </button>`;
    const item = (m) => m.custom
        ? `<div class="picker-row">${option(m)}<button type="button" class="picker-remove" data-remove-subject="${escape_html(m.id)}" aria-label="Remove ${escape_html(m.name)}" title="Remove">${icons.close}</button></div>`
        : option(m);
    // a plain box rather than a form, since pickers inside sheets already sit in the sheet's form
    const add = `<div class="picker-add">
        <input class="picker-add-input" maxlength="40" placeholder="Add your own subject" aria-label="Add your own subject" autocomplete="off" enterkeyhint="done">
        <button type="button" class="picker-add-btn" aria-label="Add subject">${icons.plus}</button>
    </div>`;
    // in the top picker a group heading can be clicked too, and opens its first subject
    const heading = (group, label) => headings_open
        ? `<button type="button" class="picker-heading" data-group="${escape_html(group)}">${escape_html(label)}</button>`
        : `<p class="picker-heading">${escape_html(label)}</p>`;
    const grouped = Object.entries(state.menu_groups).map(([group, label]) => {
        const items = state.modes.filter((m) => m.menu === group);
        if (!items.length) return "";
        return `<div class="picker-group" role="group" aria-label="${escape_html(label)}">${heading(group, label)}${items.map(item).join("")}</div>`;
    }).join("");
    if (grouped) return grouped + add;
    // without groups from the server, list whatever the select holds
    const plain = [...select.options].map((o) => ({ id: o.value, name: o.textContent, hint: o.title }));
    return `<div class="picker-group">${plain.map(item).join("")}</div>` + add;
}

// with on_pick, choosing a subject hands it over instead of selecting it straight away
function make_picker(select, on_pick = null) {
    const box = document.createElement("div");
    box.className = "picker";
    box.innerHTML = `
        <button type="button" class="picker-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${escape_html(select.getAttribute("aria-label") || "Subject")}">
            <span class="picker-label"></span>${icons.chevron}
        </button>
        <div class="picker-menu" role="listbox" hidden></div>`;
    select.hidden = true;
    select.after(box);
    const button = box.querySelector(".picker-btn");
    const menu = box.querySelector(".picker-menu");
    const label = box.querySelector(".picker-label");

    const sync = () => {
        label.textContent = select.selectedOptions[0]?.textContent || "General study";
    };
    // setting .value in code doesn't fire any event, so the label is kept in step here
    Object.defineProperty(select, "value", {
        get() { return select_value.get.call(this); },
        set(value) { select_value.set.call(this, value); sync(); },
    });
    new MutationObserver(sync).observe(select, { childList: true, subtree: true });

    const options = () => [...menu.querySelectorAll(".picker-option, button.picker-heading, .picker-add-input")];
    const close = (refocus = false) => {
        if (menu.hidden) return;
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
        if (refocus) button.focus();
    };
    const open = () => {
        menu.innerHTML = picker_menu_html(select, Boolean(on_pick));
        menu.classList.remove("up");
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
        // open upwards when there's more room above, inside a sheet or near the bottom of the window
        const sheet = box.closest("dialog");
        const bounds = sheet ? sheet.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const spot = button.getBoundingClientRect();
        const room_below = bounds.bottom - spot.bottom;
        if (menu.offsetHeight + 16 > room_below && spot.top - bounds.top > room_below) menu.classList.add("up");
        (options().find((o) => o.getAttribute("aria-selected") === "true") || options()[0])?.focus();
    };

    const choose = (value) => {
        if (on_pick) {
            close();
            on_pick(value);
            return;
        }
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close(true);
    };

    // a new subject is saved, every list is refreshed, then it's picked
    const add_subject = async () => {
        const field = menu.querySelector(".picker-add-input");
        const name = field.value.trim();
        if (!name) return field.focus();
        field.disabled = true;
        try {
            const response = await api("/api/subjects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            const body = await response.json();
            apply_modes(body.modes);
            if (select !== mode_select) select.innerHTML = mode_options_html();
            choose(body.id);
        } catch (error) {
            field.disabled = false;
            field.value = "";
            field.placeholder = error.message;
            field.focus();
        }
    };

    // enter in the box adds the subject, and never submits the sheet around it
    menu.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target.closest(".picker-add-input")) {
            event.preventDefault();
            event.stopPropagation();
            add_subject();
        }
    });

    button.addEventListener("click", () => (menu.hidden ? open() : close()));
    menu.addEventListener("click", async (event) => {
        if (event.target.closest(".picker-add-btn")) {
            add_subject();
            return;
        }
        const remove = event.target.closest("[data-remove-subject]");
        if (remove) {
            const id = remove.dataset.removeSubject;
            if (!confirm(`Remove ${mode_name(id)}? Anything filed under it moves to General study.`)) return;
            try {
                const response = await api(`/api/subjects/${id}`, { method: "DELETE" });
                apply_modes((await response.json()).modes);
                if (select !== mode_select) {
                    const picked = select.value;
                    select.innerHTML = mode_options_html();
                    select.value = picked === id ? "general" : picked;
                }
                menu.innerHTML = picker_menu_html(select, Boolean(on_pick));
                // chats, reminders and classes may have moved to general study
                load_history();
                load_reminders();
                if (el("timetable")) load_timetable();
            } catch (error) {
                alert(error.message);
            }
            return;
        }
        const heading = event.target.closest("button.picker-heading");
        if (heading && on_pick) {
            const first = state.modes.find((m) => m.menu === heading.dataset.group);
            close();
            if (first) on_pick(first.id);
            return;
        }
        const option = event.target.closest(".picker-option");
        if (option) choose(option.dataset.value);
    });
    box.addEventListener("keydown", (event) => {
        if (menu.hidden) return;
        const list = options();
        const at = list.indexOf(document.activeElement);
        if (event.key === "Escape") {
            // keeps a sheet open when only the menu should close
            event.preventDefault();
            event.stopPropagation();
            close(true);
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            list[(at + step + list.length) % list.length]?.focus();
        } else if ((event.key === "Home" || event.key === "End") && !event.target.closest(".picker-add")) {
            event.preventDefault();
            list[event.key === "Home" ? 0 : list.length - 1]?.focus();
        } else if (event.key === "Tab") {
            close();
        }
    });
    document.addEventListener("pointerdown", (event) => {
        if (!box.contains(event.target)) close();
    });
    box.closest("dialog")?.addEventListener("close", () => close());
    sync();
}

// the setup sheet, opened from the top picker with a subject already chosen

const setup = el("setup");
const setup_mode = el("setup-mode");

const setup_actions = [
    { id: "chat", title: "Ask a question", icon: "chat" },
    { id: "summary", title: tools.summary.title, icon: tools.summary.icon },
    { id: "flashcards", title: tools.flashcards.title, icon: tools.flashcards.icon },
    { id: "quiz", title: tools.quiz.title, icon: tools.quiz.icon },
];

function sync_setup() {
    const mode = state.modes.find((m) => m.id === setup_mode.value);
    el("setup-title").textContent = mode ? mode.name : mode_name(setup_mode.value);
    el("setup-hint").textContent = mode ? mode.hint : "";
}

function open_setup(mode) {
    if (state.busy) return;
    setup_mode.innerHTML = mode_options_html();
    setup_mode.value = mode;
    sync_setup();
    el("setup-actions").innerHTML = setup_actions.map((a, i) => `
        <button class="setup-action${i === 0 ? " primary" : ""}" type="button" data-setup="${a.id}">
            ${icons[a.icon]}<span>${escape_html(a.title)}</span>
        </button>`).join("");
    setup.showModal();
    el("setup-actions").querySelector("button").focus();
}

setup_mode.addEventListener("change", sync_setup);
el("setup-close").addEventListener("click", () => setup.close());
el("setup-actions").addEventListener("click", (event) => {
    const action = event.target.closest("[data-setup]");
    if (!action) return;
    const mode = setup_mode.value;
    setup.close();
    // every action opens its own sheet, and the subject only changes once that sheet is sent
    open_sheet(action.dataset.setup === "chat" ? "ask" : action.dataset.setup, mode);
});

make_picker(mode_select, open_setup);
make_picker(el("sheet-mode"));
make_picker(setup_mode);
make_picker(el("reminder-mode"));
make_picker(el("class-mode"));

function show_sheet_error(text) {
    el("sheet-error").textContent = text;
    el("sheet-error").hidden = !text;
}

function render_sheet_files() {
    el("sheet-files").innerHTML = sheet_state.files.map((file, i) => `
        <span class="file-pill">${/\.(png|jpe?g|webp|gif)$/i.test(file.name) ? icons.image : icons.doc}<span>${escape_html(file.name)}</span>
            <button type="button" data-sheet-remove="${i}" aria-label="Remove ${escape_html(file.name)}">${icons.close}</button>
        </span>`).join("");
}

function set_sheet_busy(busy) {
    const copy = sheet_copy[sheet_state.tool];
    const submit = el("sheet-submit");
    submit.disabled = busy;
    submit.textContent = busy ? `${copy.working}…` : copy.submit;
    el("sheet-note").hidden = !busy;
}

function open_sheet(tool, mode, topic = "", options = {}) {
    const copy = sheet_copy[tool];
    sheet_state.tool = tool;
    sheet_state.files = [];
    sheet_state.pick = copy.choices.some(([v]) => v === options.pick) ? options.pick : copy.pick;
    sheet_state.opened += 1;
    el("sheet-title").textContent = copy.title;
    el("sheet-topic-label").textContent = copy.field || "Topic";
    el("sheet-topic").value = topic;
    el("sheet-topic").placeholder = copy.topic;
    el("sheet-topic").maxLength = copy.limit || 2000;
    el("sheet-choice-field").hidden = !copy.choices.length;
    el("sheet-mode").innerHTML = mode_options_html();
    el("sheet-mode").value = mode || mode_select.value || state.default_mode;
    el("sheet-choice-label").textContent = copy.label;
    el("sheet-choices").innerHTML = copy.choices.map(([value, label]) =>
        `<button class="choice" type="button" data-choice="${value}" aria-pressed="${value === sheet_state.pick}">${label}</button>`).join("");
    // tests can be multiple choice, written answers marked by rahah, or a mix
    sheet_state.style = "choice";
    el("sheet-style-field").hidden = tool !== "quiz";
    el("sheet-styles").innerHTML = choice_buttons(test_styles, sheet_state.style, "style");
    show_sheet_error("");
    set_sheet_busy(false);
    render_sheet_files();
    sheet.showModal();
    el("sheet-topic").focus();
}

el("sheet-choices").addEventListener("click", (event) => {
    const choice = event.target.closest("[data-choice]");
    if (!choice) return;
    const value = sheet_copy[sheet_state.tool].choices.find(([v]) => String(v) === choice.dataset.choice)[0];
    sheet_state.pick = value;
    el("sheet-choices").querySelectorAll(".choice").forEach((b) => b.setAttribute("aria-pressed", String(b === choice)));
});

el("sheet-styles").addEventListener("click", (event) => {
    const choice = event.target.closest("[data-style]");
    if (!choice) return;
    sheet_state.style = choice.dataset.style;
    el("sheet-styles").querySelectorAll(".choice").forEach((b) => b.setAttribute("aria-pressed", String(b === choice)));
    // a past paper is the notes themselves, so the topic only narrows it down
    el("sheet-topic").placeholder = sheet_state.style === "paper"
        ? "Optional, like Section B only. Attach the past paper under Notes"
        : sheet_copy.quiz.topic;
});

el("sheet-attach").addEventListener("click", () => el("sheet-file-input").click());
el("sheet-file-input").addEventListener("change", () => {
    sheet_state.files = [...sheet_state.files, ...el("sheet-file-input").files].slice(0, 5);
    el("sheet-file-input").value = "";
    render_sheet_files();
});
el("sheet-files").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-sheet-remove]");
    if (!remove) return;
    sheet_state.files.splice(Number(remove.dataset.sheetRemove), 1);
    render_sheet_files();
});
el("sheet-close").addEventListener("click", () => sheet.close());
el("sheet-cancel").addEventListener("click", () => sheet.close());

// a question from the sheet goes into the open chat, or starts one from the home page
async function run_ask(question, mode) {
    const files = [...sheet_state.files];
    sheet.close();
    mode_select.value = mode;
    sync_placeholder();
    if (files.length) {
        await upload_files(files);
        if (state.pending.some((f) => f.status !== "ready")) {
            input.value = question;
            resize_input();
            update_send_button();
            return;
        }
    }
    send_message(question);
}

// enter sends a question, shift and enter starts a new line, as in the message box
el("sheet-topic").addEventListener("keydown", (event) => {
    if (sheet_state.tool !== "ask" || event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    el("sheet-form").requestSubmit();
});

async function run_summary(topic, mode) {
    const files = [...sheet_state.files];
    const what = files.length
        ? (topic ? `Summarise the attached notes, focusing on ${topic}.` : "Summarise the attached notes.")
        : `Summarise ${topic}.`;
    const how = sheet_state.pick === "detailed"
        ? "Go section by section with short headings, define the key terms, and end with three questions to check my understanding."
        : "Keep it short, the key points as a few bullets and one line on the big idea.";
    const text = `${what} ${how}`;
    sheet.close();
    start_new_chat();
    mode_select.value = mode;
    sync_placeholder();
    if (files.length) {
        await upload_files(files);
        // a failed upload stays in the composer with its reason, and the request waits there
        if (state.pending.some((f) => f.status !== "ready")) {
            input.value = text;
            resize_input();
            update_send_button();
            return;
        }
    }
    send_message(text);
}

el("sheet-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const topic = el("sheet-topic").value.trim();
    const mode = el("sheet-mode").value;
    if (sheet_state.tool === "ask") {
        if (!topic) {
            show_sheet_error("Write your question first.");
            return;
        }
        if (state.busy) {
            show_sheet_error("Wait for Rahah to finish her current answer.");
            return;
        }
        run_ask(topic, mode);
        return;
    }
    if (!topic && !sheet_state.files.length) {
        show_sheet_error("Write a topic or add some notes first.");
        return;
    }
    if (sheet_state.tool === "quiz" && sheet_state.style === "paper" && !sheet_state.files.length) {
        show_sheet_error("Attach the past paper under Notes first.");
        return;
    }
    if (state.busy) {
        show_sheet_error("Wait for Rahah to finish her current answer.");
        return;
    }
    if (sheet_state.tool === "summary") {
        run_summary(topic, mode);
        return;
    }

    const opened = sheet_state.opened;
    const form = new FormData();
    form.append("kind", sheet_state.tool);
    form.append("topic", topic);
    form.append("count", String(sheet_state.pick));
    form.append("mode", mode);
    if (sheet_state.tool === "quiz") form.append("style", sheet_state.style);
    sheet_state.files.forEach((file) => form.append("files", file));
    show_sheet_error("");
    set_sheet_busy(true);
    try {
        const response = await api("/api/sets", { method: "POST", body: form });
        const made = await response.json();
        await load_sets();
        // only jump to the new set if the sheet is still the one that asked for it
        if (sheet.open && sheet_state.opened === opened) {
            sheet.close();
            show_set(made);
        }
    } catch (error) {
        if (sheet_state.opened === opened) {
            show_sheet_error(error.message);
            set_sheet_busy(false);
        }
    }
});

// flashcards and quizzes

function inline_markdown(raw) {
    return render_markdown(raw).replace(/^\s*<p>/, "").replace(/<\/p>\s*$/, "");
}

function show_set(study_set) {
    if (state.busy) return;
    state.conversation_id = null;
    state.pending = [];
    render_attachments();
    history.replaceState(null, "", `#/set/${study_set.id}`);
    set_title(study_set.title);
    state.study = {
        set: study_set,
        index: 0,
        flipped: false,
        order: study_set.items.map((_, i) => i),
        score: 0,
        answered: false,
        done: false,
        results: [], // how each question went, for reviewing mistakes at the end
        progress: { ...(study_set.progress || {}) }, // each card's box, 1 still learning up to 5 mastered
        session: { known: 0, learning: 0 },
        deck_done: false,
        started: false, // a test opens on a start screen with an optional timer
        deadline: null,
        time_up: false,
    };
    if (study_set.kind === "flashcards") state.study.order = practice_order(study_set.items, state.study.progress);
    thread.innerHTML = '<div class="study" id="study"></div>';
    thread.scrollTop = 0;
    render_study();
    sync_view();
}

async function open_set(set_id) {
    if (state.busy) return;
    try {
        const response = await api(`/api/sets/${set_id}`);
        show_set(await response.json());
    } catch (error) {
        start_new_chat();
    }
}

function render_study() {
    if (state.study.set.kind === "flashcards") render_deck();
    else render_quiz();
}

// cards that need practice come first, in a random order within each box
function practice_order(items, progress) {
    return items.map((_, i) => i)
        .map((i) => ({ i, box: progress[i] || 0, tie: Math.random() }))
        .sort((a, b) => a.box - b.box || a.tie - b.tie)
        .map((c) => c.i);
}

const box_names = ["New", "Still learning", "Known", "Known", "Known", "Mastered"];

function known_count(s) {
    return Object.values(s.progress).filter((box) => box >= 2).length;
}

function render_deck() {
    const s = state.study;
    if (s.deck_done) {
        render_deck_done();
        return;
    }
    const at = s.order[s.index];
    const card = s.set.items[at];
    const last = s.index === s.order.length - 1;
    const box = s.progress[at] || 0;
    el("study").innerHTML = `
        <div class="deck">
            <p class="study-meta">Card ${s.index + 1} of ${s.order.length} · <span class="box-name box-${box}">${box_names[box]}</span> · ${known_count(s)} of ${s.set.items.length} known</p>
            <div class="flashcard${s.flipped ? " flipped" : ""}" role="button" tabindex="0" data-deck="flip" aria-label="Flip the card">
                <div class="flashcard-inner">
                    <div class="face front poster">
                        <span class="face-label">Question</span>
                        <div class="face-text answer">${render_markdown(card.front)}</div>
                    </div>
                    <div class="face back">
                        <span class="face-label">Answer</span>
                        <div class="face-text answer">${render_markdown(card.back)}</div>
                    </div>
                </div>
            </div>
            <div class="rate-row"${s.flipped ? "" : " hidden"}>
                <button class="btn btn-soft" type="button" data-deck="learning">Still learning</button>
                <button class="btn btn-accent" type="button" data-deck="known">Got it</button>
            </div>
            <div class="study-controls">
                <button class="icon-btn round" type="button" data-deck="prev" aria-label="Previous card"${s.index === 0 ? " disabled" : ""}>${icons.prev}</button>
                <button class="btn btn-soft" type="button" data-deck="flip">${s.flipped ? "Show question" : "Show answer"}</button>
                <button class="icon-btn round" type="button" data-deck="next" aria-label="Next card"${last ? " disabled" : ""}>${icons.next}</button>
            </div>
            <div class="study-extra">
                <button class="btn btn-ghost btn-small" type="button" data-deck="shuffle">${icons.shuffle}Shuffle</button>
                <button class="btn btn-ghost btn-small" type="button" data-study-delete>${icons.trash}Delete deck</button>
            </div>
        </div>`;
}

function flip_card() {
    const s = state.study;
    s.flipped = !s.flipped;
    document.querySelector(".flashcard")?.classList.toggle("flipped", s.flipped);
    const rate = document.querySelector(".rate-row");
    if (rate) rate.hidden = !s.flipped;
    const button = document.querySelector('.study-controls [data-deck="flip"]');
    if (button) button.textContent = s.flipped ? "Show question" : "Show answer";
}

function step_deck(by) {
    const s = state.study;
    const next = s.index + by;
    if (next < 0 || next >= s.order.length) return;
    s.index = next;
    s.flipped = false;
    render_deck();
}

// still learning brings the card back a few cards later, got it moves it up a box, then on to the next card
async function rate_card(known) {
    const s = state.study;
    if (!s.flipped || s.rating) return;
    const at = s.order[s.index];
    s.rating = true;
    try {
        const response = await api(`/api/sets/${s.set.id}/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ card: at, known }),
        });
        s.progress[at] = (await response.json()).box;
    } catch (error) {
        // the rating still counts for this session if it couldn't be saved
        s.progress[at] = known ? Math.min(Math.max(s.progress[at] || 0, 1) + 1, 5) : 1;
    } finally {
        s.rating = false;
    }
    if (state.study !== s || !el("study")) return;
    s.session[known ? "known" : "learning"] += 1;
    if (!known) {
        const again = Math.min(s.index + 4, s.order.length);
        if (!s.order.slice(s.index + 1, again).includes(at)) s.order.splice(again, 0, at);
    }
    s.flipped = false;
    if (s.index === s.order.length - 1) {
        s.deck_done = true;
        render_deck_done();
        load_sets();
        return;
    }
    s.index += 1;
    render_deck();
}

function render_deck_done() {
    const s = state.study;
    const known = known_count(s);
    const total = s.set.items.length;
    el("study").innerHTML = `
        <div class="quiz-results">
            <p class="study-meta">Deck done</p>
            <p class="score"><strong>${known}</strong> / ${total} known</p>
            <p class="score-note">This time ${plural(s.session.known, "card")} got it and ${s.session.learning} still learning. ${known === total ? "You know the whole deck." : "Practise again and the hard ones come first."}</p>
            <div class="study-controls">
                <button class="btn btn-accent" type="button" data-deck="again">Practise again</button>
                <button class="btn btn-soft" type="button" data-home>Back to home</button>
            </div>
        </div>`;
}

function practise_again() {
    const s = state.study;
    Object.assign(s, { order: practice_order(s.set.items, s.progress), index: 0, flipped: false, deck_done: false, session: { known: 0, learning: 0 } });
    render_deck();
}

function shuffle_deck() {
    const s = state.study;
    for (let i = s.order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [s.order[i], s.order[j]] = [s.order[j], s.order[i]];
    }
    s.index = 0;
    s.flipped = false;
    render_deck();
}

const is_written = (q) => q.type === "written";
const question_marks = (q) => (is_written(q) ? q.marks : 1);

function render_quiz() {
    const s = state.study;
    const total = s.set.items.length;
    if (s.done) {
        render_results();
        return;
    }
    if (!s.started) {
        render_quiz_start();
        return;
    }
    const q = s.set.items[s.index];
    if (is_written(q)) {
        render_written(q, total);
        return;
    }
    el("study").innerHTML = `
        <div class="quiz">
            <div class="quiz-progress" aria-hidden="true"><span style="width: ${(s.index / total) * 100}%"></span></div>
            <p class="study-meta">Question ${s.index + 1} of ${total}${timer_html()}</p>
            <div class="quiz-question answer">${render_markdown(q.question)}</div>
            <div class="quiz-options">${q.options.map((option, i) => `
                <button class="option" type="button" data-option="${i}">
                    <span class="option-key">${"ABCDEF"[i]}</span>
                    <span class="option-text">${inline_markdown(option)}</span>
                </button>`).join("")}
            </div>
            <div id="quiz-feedback"></div>
        </div>`;
}

// before a test, how long it is and whether to time it, like sitting the real exam

const timer_choices = [[0, "No timer"], [10, "10 min"], [20, "20 min"], [30, "30 min"], [45, "45 min"], [60, "60 min"]];

function render_quiz_start() {
    const s = state.study;
    const total = s.set.items.length;
    const marks = s.set.items.reduce((sum, q) => sum + question_marks(q), 0);
    const best = s.set.best_score;
    s.minutes = s.minutes || 0;
    el("study").innerHTML = `
        <div class="quiz-results quiz-start">
            <p class="study-meta">Ready when you are</p>
            <p class="score"><strong>${total}</strong> question${total === 1 ? "" : "s"}</p>
            <p class="score-note">${marks} mark${marks === 1 ? "" : "s"}${best !== null && best !== undefined ? ` · your best is ${best} out of ${marks}` : ""}</p>
            <div class="field timer-field">
                <span class="field-label" id="timer-label">Timer</span>
                <div class="choices" role="group" aria-labelledby="timer-label">${choice_buttons(timer_choices, s.minutes, "minutes")}</div>
            </div>
            <div class="study-controls">
                <button class="btn btn-accent" type="button" data-quiz="start">Start the test</button>
            </div>
        </div>`;
}

function start_quiz() {
    const s = state.study;
    s.started = true;
    s.deadline = s.minutes ? Date.now() + s.minutes * 60000 : null;
    clearInterval(s.ticker);
    if (s.deadline) s.ticker = setInterval(() => tick_timer(s), 1000);
    render_quiz();
}

function time_left(s) {
    return Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
}

function clock_text(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function timer_html() {
    const s = state.study;
    if (!s.deadline || s.done) return "";
    const left = time_left(s);
    return ` · <span class="quiz-timer${left <= 60 ? " low" : ""}" id="quiz-timer">${clock_text(left)} left</span>`;
}

// the clock counts down on the page, and the test ends itself when it runs out
function tick_timer(s) {
    if (state.study !== s || s.done || !el("study")) {
        clearInterval(s.ticker);
        return;
    }
    const left = time_left(s);
    const shown = el("quiz-timer");
    if (shown) {
        shown.textContent = `${clock_text(left)} left`;
        shown.classList.toggle("low", left <= 60);
    }
    if (left <= 0) {
        clearInterval(s.ticker);
        s.time_up = true;
        stop_answer_voice();
        finish_quiz();
    }
}

// a written answer, typed, spoken or a photo of the working, then marked by rahah against the mark scheme

function render_written(q, total) {
    const s = state.study;
    s.photo = null;
    el("study").innerHTML = `
        <div class="quiz">
            <div class="quiz-progress" aria-hidden="true"><span style="width: ${(s.index / total) * 100}%"></span></div>
            <p class="study-meta">Question ${s.index + 1} of ${total} · ${q.marks} mark${q.marks === 1 ? "" : "s"}${timer_html()}</p>
            <div class="quiz-question answer">${render_markdown(q.question)}</div>
            <div class="written">
                <textarea class="text-input written-answer" id="written-answer" rows="5" maxlength="5000" placeholder="Write your answer, say it, or add a photo of your working" aria-label="Your answer"></textarea>
                <div class="written-photo" id="written-photo" hidden></div>
                <div class="written-tools">
                    <button class="btn btn-soft btn-small" type="button" data-written="photo">${icons.camera}Add a photo</button>
                    ${speech_engine() ? `<button class="btn btn-soft btn-small" type="button" data-written="mic" id="written-mic">${icons.mic}Say it</button>` : ""}
                    <span class="spacer"></span>
                    <button class="btn btn-accent" type="button" data-written="mark" id="written-mark">Mark my answer</button>
                </div>
                <input type="file" id="written-photo-input" accept="image/*" hidden>
            </div>
            <div id="quiz-feedback"></div>
        </div>`;
    el("written-photo-input").addEventListener("change", async () => {
        const file = el("written-photo-input").files[0];
        el("written-photo-input").value = "";
        if (file) set_written_photo(await shrink_photo(file));
    });
}

function set_written_photo(file) {
    const s = state.study;
    const box = el("written-photo");
    if (s.photo_url) URL.revokeObjectURL(s.photo_url);
    s.photo = file;
    s.photo_url = file ? URL.createObjectURL(file) : null;
    box.hidden = !file;
    box.innerHTML = file ? `<img src="${s.photo_url}" alt="Your working">
        <button class="icon-btn" type="button" data-written="unphoto" aria-label="Remove the photo" title="Remove">${icons.close}</button>` : "";
}

// speaking an answer, the browser turns the words into text in the answer box
const answer_voice = { rec: null };

function stop_answer_voice() {
    if (answer_voice.rec) answer_voice.rec.stop();
}

function toggle_answer_voice() {
    if (answer_voice.rec) {
        stop_answer_voice();
        return;
    }
    const Engine = speech_engine();
    const box = el("written-answer");
    const button = el("written-mic");
    if (!Engine || !box) return;
    const rec = new Engine();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    const base = box.value.trim() ? `${box.value.trimEnd()} ` : "";
    let heard = "";
    rec.onresult = (event) => {
        let guess = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const words = event.results[i][0].transcript.trim();
            if (!words) continue;
            if (event.results[i].isFinal) heard += (heard ? " " : "") + words;
            else guess += (guess ? " " : "") + words;
        }
        box.value = base + heard + (guess ? `${heard ? " " : ""}${guess}` : "");
    };
    rec.onend = () => {
        answer_voice.rec = null;
        if (button?.isConnected) button.innerHTML = `${icons.mic}Say it`;
        button?.classList.remove("listening");
    };
    try {
        rec.start();
        answer_voice.rec = rec;
        button.innerHTML = `${icons.stop}Stop`;
        button.classList.add("listening");
    } catch (e) {
        answer_voice.rec = null;
    }
}

async function mark_written() {
    const s = state.study;
    if (s.answered || s.done || s.marking) return;
    stop_answer_voice();
    const q = s.set.items[s.index];
    const text = el("written-answer").value.trim();
    const feedback = el("quiz-feedback");
    if (!text && !s.photo) {
        feedback.innerHTML = '<p class="sheet-error">Write, say or add a photo of your answer first.</p>';
        return;
    }
    const form = new FormData();
    form.append("index", String(s.index));
    form.append("answer", text);
    if (s.photo) form.append("photo", s.photo, s.photo.name || "working.jpg");
    s.marking = true;
    const button = el("written-mark");
    button.disabled = true;
    button.textContent = "Marking…";
    feedback.innerHTML = "";
    const at = s.index;
    try {
        const response = await api(`/api/sets/${s.set.id}/mark`, { method: "POST", body: form });
        const result = await response.json();
        // the student may have left the test while it was being marked
        if (state.study !== s || s.index !== at || !el("study")) return;
        s.answered = true;
        s.score += result.score;
        s.results[at] = { text, photo: Boolean(s.photo), score: result.score, marks: result.marks, feedback: result.feedback };
        // once marked the answer stays as it was sent, and the tools for changing it go away
        el("written-answer").readOnly = true;
        el("study").querySelector(".written-tools").hidden = true;
        el("study").querySelector('#written-photo [data-written="unphoto"]')?.remove();
        const grade = result.score === result.marks ? "right" : result.score === 0 ? "wrong" : "partial";
        const last = s.index === s.set.items.length - 1;
        feedback.innerHTML = `
            <div class="feedback ${grade}">
                <strong>${result.score} out of ${result.marks}</strong>
                <div class="answer">${render_markdown(result.feedback)}</div>
                <details class="model-answer">
                    <summary>Model answer</summary>
                    <div class="answer">${render_markdown(result.model_answer)}</div>
                </details>
            </div>
            <div class="study-controls">
                <button class="btn btn-accent" type="button" data-quiz="next">${last ? "See your score" : "Next question"}</button>
            </div>`;
        feedback.querySelector("[data-quiz]").focus({ preventScroll: true });
    } catch (error) {
        if (state.study !== s || !el("study")) return;
        feedback.innerHTML = `<p class="sheet-error">${escape_html(error.message)}</p>`;
        button.disabled = false;
        button.textContent = "Mark my answer";
    } finally {
        s.marking = false;
    }
}

function answer_option(i) {
    const s = state.study;
    if (s.answered || s.done) return;
    const q = s.set.items[s.index];
    if (is_written(q) || i < 0 || i >= q.options.length) return;
    s.answered = true;
    const right = i === q.answer;
    if (right) s.score += 1;
    s.results[s.index] = { chosen: i, score: right ? 1 : 0, marks: 1 };
    document.querySelectorAll(".option").forEach((button, j) => {
        button.disabled = true;
        if (j === q.answer) button.classList.add("correct");
        else if (j === i) button.classList.add("wrong");
    });
    const last = s.index === s.set.items.length - 1;
    el("quiz-feedback").innerHTML = `
        <div class="feedback ${right ? "right" : "wrong"}">
            <strong>${right ? "Correct" : "Not quite"}</strong>
            ${q.explanation ? `<div class="answer">${render_markdown(q.explanation)}</div>` : ""}
        </div>
        <div class="study-controls">
            <button class="btn btn-accent" type="button" data-quiz="next">${last ? "See your score" : "Next question"}</button>
        </div>`;
    el("quiz-feedback").querySelector("button").focus({ preventScroll: true });
}

async function next_question() {
    const s = state.study;
    stop_answer_voice();
    s.index += 1;
    s.answered = false;
    if (s.index < s.set.items.length) {
        render_quiz();
        return;
    }
    finish_quiz();
}

async function finish_quiz() {
    const s = state.study;
    if (s.done) return;
    s.done = true;
    clearInterval(s.ticker);
    render_results();
    try {
        const response = await api(`/api/sets/${s.set.id}/score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ score: s.score }),
        });
        s.set.best_score = (await response.json()).best_score;
        if (el("study") && state.study === s) render_results();
        load_sets();
        load_performance();
    } catch (error) {}
}

function render_results() {
    const s = state.study;
    const total = s.set.items.reduce((sum, q) => sum + question_marks(q), 0);
    const best = s.set.best_score;
    let note = s.score === total ? "Full marks." : best !== null && best !== undefined && best > s.score ? `Your best is ${best} out of ${total}.` : "Go again to lock it in.";
    if (s.time_up) note = `Time's up. ${note}`;
    const in_marks = s.set.items.some(is_written);
    const missed = missed_questions().length;
    el("study").innerHTML = `
        <div class="quiz-results">
            <p class="study-meta">Test complete</p>
            <p class="score"><strong>${s.score}</strong> / ${total}${in_marks ? " marks" : ""}</p>
            <p class="score-note">${note}</p>
            <div class="study-controls">
                ${missed ? `<button class="btn btn-accent" type="button" data-quiz="review">Review ${plural(missed, "mistake")}</button>` : ""}
                <button class="btn ${missed ? "btn-soft" : "btn-accent"}" type="button" data-quiz="again">Try again</button>
                <button class="btn btn-soft" type="button" data-home>Back to home</button>
            </div>
            <div class="study-extra">
                <button class="btn btn-ghost btn-small" type="button" data-study-delete>${icons.trash}Delete test</button>
            </div>
        </div>`;
}

// the questions that lost marks, in test order
function missed_questions() {
    const s = state.study;
    return s.set.items
        .map((q, i) => ({ q, i, r: s.results[i] || (s.time_up ? { score: 0, marks: question_marks(q), unanswered: true } : null) }))
        .filter(({ r }) => r && r.score < r.marks);
}

function your_answer(q, r) {
    if (r.unanswered) return "<em>No answer, time ran out</em>";
    if (!is_written(q)) return inline_markdown(q.options[r.chosen]);
    const parts = [];
    if (r.text) parts.push(escape_html(r.text));
    if (r.photo) parts.push("<em>A photo of your working</em>");
    return parts.join("<br>") || "<em>No answer</em>";
}

// each missed question with the right answer, why, and a way to ask rahah about it
function render_review() {
    const s = state.study;
    const missed = missed_questions();
    el("study").innerHTML = `
        <div class="review">
            <p class="study-meta">Your mistakes, ${missed.length} of ${s.set.items.length} questions</p>
            ${missed.map(({ q, i, r }) => `
                <article class="review-item">
                    <p class="review-head">Question ${i + 1}${is_written(q) ? ` · ${r.score} of ${r.marks} marks` : ""}</p>
                    <div class="answer review-question">${render_markdown(q.question)}</div>
                    <div class="review-answers">
                        <div class="review-answer wrong"><span>Your answer</span><div class="answer">${your_answer(q, r)}</div></div>
                        <div class="review-answer right"><span>${is_written(q) ? "Model answer" : "Right answer"}</span><div class="answer">${is_written(q) ? render_markdown(q.model_answer) : inline_markdown(q.options[q.answer])}</div></div>
                    </div>
                    ${is_written(q) && r.feedback ? `<div class="answer review-why">${render_markdown(r.feedback)}</div>` : ""}
                    ${!is_written(q) && q.explanation ? `<div class="answer review-why">${render_markdown(q.explanation)}</div>` : ""}
                    <button class="btn btn-soft btn-small" type="button" data-ask-question="${i}">${icons.chat}Ask Rahah about this</button>
                </article>`).join("")}
            <div class="study-controls">
                <button class="btn btn-soft" type="button" data-quiz="results">Back to your score</button>
                <button class="btn btn-accent" type="button" data-quiz="again">Try again</button>
            </div>
        </div>`;
    thread.scrollTop = 0;
}

// a question for rahah with everything she needs, opened in the ask sheet so it can be changed first
function ask_about_question(i) {
    const s = state.study;
    const q = s.set.items[i];
    const r = s.results[i];
    if (!q || !r) return;
    const plain = (text) => String(text || "").trim();
    let prompt;
    if (r.unanswered) {
        prompt = `I ran out of time before answering this test question. Help me answer it and understand the topic.\n\nQuestion: ${plain(q.question)}${is_written(q) ? `\n\nModel answer: ${plain(q.model_answer)}` : `\n\nOptions: ${q.options.map((o, j) => `${"ABCDEF"[j]}) ${plain(o)}`).join("; ")}\n\nRight answer: ${plain(q.options[q.answer])}`}`;
    } else if (is_written(q)) {
        const mine = [plain(r.text), r.photo ? "(I also sent a photo of my working.)" : ""].filter(Boolean).join(" ") || "(no answer)";
        prompt = `I got ${r.score} out of ${r.marks} on this test question. Help me understand what I missed and how to get full marks.\n\nQuestion: ${plain(q.question)}\n\nMy answer: ${mine}\n\nModel answer: ${plain(q.model_answer)}`;
    } else {
        prompt = `I got this test question wrong. Help me understand why the right answer is right and where my thinking went wrong.\n\nQuestion: ${plain(q.question)}\n\nOptions: ${q.options.map((o, j) => `${"ABCDEF"[j]}) ${plain(o)}`).join("; ")}\n\nMy answer: ${plain(q.options[r.chosen])}\n\nRight answer: ${plain(q.options[q.answer])}`;
    }
    open_sheet("ask", s.set.mode, prompt);
}

function restart_quiz() {
    const s = state.study;
    clearInterval(s.ticker);
    Object.assign(s, { index: 0, score: 0, answered: false, done: false, photo: null, results: [], started: false, deadline: null, time_up: false });
    render_quiz();
}

thread.addEventListener("click", (event) => {
    const target = event.target;
    const tool = target.closest("[data-tool]");
    if (tool) {
        open_sheet(tool.dataset.tool, tool.dataset.mode);
        return;
    }
    const remove_set = target.closest("[data-remove-set]");
    if (remove_set) {
        const s = state.sets.find((item) => item.id === remove_set.dataset.removeSet);
        if (s) delete_set(s);
        return;
    }
    if (!state.study || !el("study")) return;
    const deck = target.closest("[data-deck]");
    if (deck) {
        const action = deck.dataset.deck;
        if (action === "flip") flip_card();
        if (action === "prev") step_deck(-1);
        if (action === "next") step_deck(1);
        if (action === "shuffle") shuffle_deck();
        if (action === "known") rate_card(true);
        if (action === "learning") rate_card(false);
        if (action === "again") practise_again();
        return;
    }
    const option = target.closest("[data-option]");
    if (option) {
        answer_option(Number(option.dataset.option));
        return;
    }
    const written = target.closest("[data-written]");
    if (written) {
        const action = written.dataset.written;
        if (action === "photo") el("written-photo-input").click();
        if (action === "unphoto") set_written_photo(null);
        if (action === "mic") toggle_answer_voice();
        if (action === "mark") mark_written();
        return;
    }
    const quiz = target.closest("[data-quiz]");
    if (quiz) {
        if (quiz.dataset.quiz === "next") next_question();
        if (quiz.dataset.quiz === "again") restart_quiz();
        if (quiz.dataset.quiz === "review") render_review();
        if (quiz.dataset.quiz === "start") start_quiz();
        if (quiz.dataset.quiz === "results") render_results();
        return;
    }
    const minutes = target.closest("[data-minutes]");
    if (minutes) {
        state.study.minutes = Number(minutes.dataset.minutes);
        minutes.parentElement.querySelectorAll(".choice").forEach((b) => b.setAttribute("aria-pressed", String(b === minutes)));
        return;
    }
    const ask = target.closest("[data-ask-question]");
    if (ask) {
        ask_about_question(Number(ask.dataset.askQuestion));
        return;
    }
    if (target.closest("[data-study-delete]")) delete_set(state.study.set);
});

// arrow keys move through a deck, space flips it, number keys answer a quiz
document.addEventListener("keydown", (event) => {
    if (!el("study") || !state.study || sheet.open || event.target.closest("input, textarea, select")) return;
    const s = state.study;
    if (s.set.kind === "flashcards") {
        if (s.deck_done) return;
        if (event.key === "ArrowRight") step_deck(1);
        else if (event.key === "ArrowLeft") step_deck(-1);
        else if (s.flipped && event.key === "1") rate_card(false);
        else if (s.flipped && event.key === "2") rate_card(true);
        else if ((event.key === " " || event.key === "Enter") && !event.target.closest("button")) {
            event.preventDefault();
            flip_card();
        }
    } else if (s.started && /^[1-6]$/.test(event.key)) {
        answer_option(Number(event.key) - 1);
    }
});

// performance, quiz scores as percentages and grades, on its own page and as a row under exam

function short_date(seconds) {
    return new Date(seconds * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function plural(n, word, many = `${word}s`) {
    return `${n} ${n === 1 ? word : many}`;
}

function delta_html(change) {
    if (change === null || change === undefined) return "Your first attempt";
    if (change === 0) return "Same as the one before";
    const up = change > 0;
    return `<span class="delta ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${plural(Math.abs(change), "point")}</span> on the one before`;
}

// the last few scores as a small line, older ones muted and the latest in the accent
function sparkline(points) {
    const values = points.slice(-12).map((p) => p.percent);
    if (values.length < 2) return "";
    const width = 120;
    const height = 30;
    const x = (i) => 2 + (i / (values.length - 1)) * (width - 6);
    const y = (v) => 3 + (1 - v / 100) * (height - 6);
    const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const last = values.length - 1;
    return `<svg class="spark" width="${width}" height="${height}" style="width: ${width}px; height: ${height}px" aria-hidden="true">
        <path d="${path}"/><circle cx="${x(last)}" cy="${y(values[last])}" r="3"/>
    </svg>`;
}

const stat_sketches = { "Average score": "chart", "GPA": "target", "Tests taken": "checklist", "Best subject": "trophy" };

const gpa_text = (value) => (value === null || value === undefined ? "–" : value.toFixed(2));

function stat_card(label, value, note, extra = "", small = false) {
    return `<div class="stat-card">
        ${stat_sketches[label] ? sketch_html(stat_sketches[label], "small") : ""}
        <span class="stat-label">${label}</span>
        <span class="stat-value${small ? " small" : ""}">${value}</span>
        <span class="stat-note">${note}</span>
        ${extra}
    </div>`;
}

function grade_pill(grade) {
    return `<span class="grade-pill" aria-label="Grade ${grade}">${grade}</span>`;
}

async function load_performance() {
    try {
        const response = await api("/api/performance");
        state.performance = await response.json();
    } catch (error) {
        return;
    }
    render_performance_row();
    render_performance();
}

function render_performance_row() {
    const slot = el("performance-exam");
    if (!slot) return;
    const o = state.performance && state.performance.overall;
    if (!o) {
        slot.innerHTML = "";
        return;
    }
    slot.innerHTML = row_html("Your performance", [
        stat_card("Average score", `${o.average}% ${grade_pill(o.grade)}`, `${o.correct} of ${o.questions} marks`, sparkline(state.performance.timeline)),
        stat_card("GPA", gpa_text(o.gpa), `Out of 4.0, across ${plural(o.subjects, "subject")}`),
        stat_card("Tests taken", o.attempts, `Across ${plural(o.quizzes, "test")}`),
        `<button class="stat-card more" type="button" data-performance>See all your results ${icons.next}</button>`,
    ].join(""));
}

function show_performance() {
    if (state.busy) return;
    enter_page("#/performance", "Performance", '<div class="performance" id="performance"></div>');
    render_performance();
    sync_view();
    load_performance();
    load_usage();
}

// what rahah has cost on this api key, today, this week and in all, with what caching saved

const usage_kinds = { chat: "Chat", retry: "Try again", quiz: "Making tests", flashcards: "Making flashcards", marking: "Marking answers", suggestions: "Suggestions" };

function dollars(value) {
    return `$${value >= 1 ? value.toFixed(2) : value.toFixed(4)}`;
}

async function load_usage() {
    try {
        state.usage = await (await api("/api/usage")).json();
    } catch (error) {
        return;
    }
    render_usage();
}

function render_usage() {
    const slot = el("usage-slot");
    const u = state.usage;
    if (!slot || !u) return;
    const column = (label, w) => `<div class="usage-col">
        <span>${label}</span>
        <strong>${dollars(w.cost)}</strong>
        <small>${plural(w.requests, "request")}${w.searches ? ` · ${plural(w.searches, "search")}` : ""}</small>
    </div>`;
    const all = u.all;
    slot.innerHTML = `<section class="perf-card usage-card">
        <div class="perf-head">
            <h3>Usage and cost</h3>
            <p>What Rahah has cost on this API key, worked out from Claude's prices</p>
        </div>
        <div class="usage-cols">${column("Today", u.today)}${column("Last 7 days", u.week)}${column("All time", all)}</div>
        <p class="usage-note">${!all.requests ? "Nothing used yet." : all.cache_share ? `Caching saved ${dollars(all.saved)}, and ${all.cache_share}% of what Claude read came from the cache.` : "Nothing came from the cache yet. Caching starts saving once chats get longer."}</p>
        ${all.kinds.length ? `<div class="usage-kinds">${all.kinds.map((k) => `<span>${usage_kinds[k.kind] || k.kind} <strong>${dollars(k.cost)}</strong></span>`).join("")}</div>` : ""}
    </section>`;
}

function render_performance() {
    const page = el("performance");
    if (!page || !state.performance) return;
    const p = state.performance;
    const o = p.overall;
    if (!o) {
        page.innerHTML = `<div class="page-empty">
            <strong>No scores yet</strong>
            Take a test to see your scores and grades here.
            <div><button class="btn btn-accent" type="button" data-tool="quiz" data-mode="exam">Make a test</button></div>
        </div>
        <div id="usage-slot"></div>`;
        render_usage();
        return;
    }
    const best = p.subjects[0];
    const weakest = o.weakest_subject ? p.subjects[p.subjects.length - 1] : null;
    const max_count = Math.max(...p.grades.map((g) => g.count), 1);
    const scale = p.scale.map((s, i) => (i === p.scale.length - 1 ? `${s.grade} below ${p.scale[i - 1].min}%` : `${s.grade} ${s.min}%+`)).join(" · ");

    page.innerHTML = `
        <div class="kpis">
            ${stat_card("Average score", `${o.average}% ${grade_pill(o.grade)}`, `${o.correct} of ${o.questions} marks`, sparkline(p.timeline))}
            ${stat_card("GPA", gpa_text(o.gpa), `Out of 4.0, across ${plural(o.subjects, "subject")}`)}
            ${stat_card("Tests taken", o.attempts, `Across ${plural(o.quizzes, "test")}`)}
            ${stat_card("Best subject", escape_html(mode_name(best.mode)), weakest ? `${best.average}% average · needs work: ${escape_html(mode_name(weakest.mode))}` : `${best.average}% average`, "", true)}
        </div>

        <section class="perf-card">
            <div class="perf-head">
                <h3>Scores over time</h3>
                <p>Each test attempt as a percentage, oldest on the left</p>
            </div>
            <div class="chart" id="timeline-chart"></div>
            <details class="perf-details">
                <summary>Show as a table</summary>
                <div class="table-wrap"><table>
                    <thead><tr><th>Date</th><th>Test</th><th class="num">Score</th><th class="num">Percent</th><th>Grade</th></tr></thead>
                    <tbody>${p.timeline.slice().reverse().map((t) => `<tr>
                        <td>${short_date(t.created)}</td><td>${escape_html(t.title)}</td>
                        <td class="num">${t.score} / ${t.total}</td><td class="num">${t.percent}%</td><td>${grade_pill(t.grade)}</td>
                    </tr>`).join("")}</tbody>
                </table></div>
            </details>
        </section>

        <section class="perf-card">
            <div class="perf-head">
                <h3>GPA by subject</h3>
                <p>Each test counts once, at its best attempt. Choose a subject for its tests</p>
            </div>
            <div class="table-wrap"><table>
                <thead><tr><th>Subject</th><th class="num">GPA</th><th class="num">Average</th><th>Grade</th><th class="num">Tests</th></tr></thead>
                <tbody>${p.subjects.map((s) => `<tr class="pick-row" tabindex="0" role="button" data-subject="${escape_html(s.mode)}" aria-label="${escape_html(mode_name(s.mode))}, GPA ${gpa_text(s.gpa)}">
                    <td>${escape_html(mode_name(s.mode))}</td><td class="num"><strong>${gpa_text(s.gpa)}</strong></td>
                    <td class="num">${s.average}%</td><td>${grade_pill(s.grade)}</td><td class="num">${s.tests}</td>
                </tr>`).join("")}</tbody>
            </table></div>
            <p class="scale-note">GPA points: ${p.scale.map((g) => `${g.grade} ${g.points}`).join(" · ")}</p>
        </section>

        <div class="perf-grid">
            <section class="perf-card">
                <div class="perf-head">
                    <h3>By subject</h3>
                    <p>Average across every attempt</p>
                </div>
                <div class="bars">${p.subjects.map((s) => `
                    <div class="bar-row" tabindex="0" role="button" data-subject="${escape_html(s.mode)}" data-tip="${escape_html(mode_name(s.mode))}" data-tip-value="${s.average}%" data-tip-note="Grade ${s.grade} · GPA ${gpa_text(s.gpa)} · ${plural(s.attempts, "attempt")}">
                        <span class="bar-label">${escape_html(mode_name(s.mode))}</span>
                        <span class="bar-track">
                            <span class="bar" style="--v: ${Math.max(s.average, 1)}"></span>
                            <span class="bar-value">${s.average}% · ${s.grade}</span>
                        </span>
                    </div>`).join("")}
                </div>
            </section>
            <section class="perf-card">
                <div class="perf-head">
                    <h3>Grades</h3>
                    <p>How many attempts landed on each grade</p>
                </div>
                <div class="columns">${p.grades.map((g) => `
                    <div class="col" tabindex="0" data-tip="Grade ${g.grade}" data-tip-value="${plural(g.count, "attempt")}" data-tip-note="${Math.round((g.count / o.attempts) * 100)}% of all attempts">
                        <span class="col-plot">
                            <span class="col-value">${g.count}</span>
                            <span class="col-bar" style="height: ${(g.count / max_count) * 100}%"></span>
                        </span>
                        <span class="col-label">${g.grade}</span>
                    </div>`).join("")}
                </div>
                <p class="scale-note">${scale}</p>
            </section>
        </div>

        <section class="perf-card">
            <div class="perf-head">
                <h3>Your tests</h3>
                <p>Most recent first. Choose a test for its attempts</p>
            </div>
            <div class="table-wrap"><table>
                <thead><tr><th>Test</th><th>Subject</th><th class="num">Attempts</th><th class="num">Best</th><th class="num">Latest</th><th>Best grade</th><th></th></tr></thead>
                <tbody>${p.quizzes.map((q) => `<tr class="pick-row" tabindex="0" role="button" data-test="${q.id}" aria-label="${escape_html(q.title)}, best ${q.best}%">
                    <td>${escape_html(q.title)}</td><td>${escape_html(mode_name(q.mode))}</td>
                    <td class="num">${q.attempts}</td><td class="num">${q.best}%</td><td class="num">${q.latest}%</td>
                    <td>${grade_pill(q.grade)}</td>
                    <td class="row-action"><a class="btn btn-soft btn-small" href="#/set/${q.id}">Retake</a></td>
                </tr>`).join("")}</tbody>
            </table></div>
        </section>
        <div id="usage-slot"></div>
        <div class="chart-tip floating" id="perf-tip" hidden></div>`;
    draw_timeline();
    render_usage();
}

// a box with the details of one test or one subject, opened from the performance page

const detail_sheet = el("detail-sheet");

function detail_stat(label, value) {
    return `<div class="detail-stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function show_test_detail(id) {
    const q = state.performance?.quizzes.find((item) => item.id === id);
    if (!q) return;
    el("detail-title").textContent = q.title;
    el("detail-body").innerHTML = `
        <p class="detail-sub">${escape_html(mode_name(q.mode))} · out of ${plural(q.size, "mark")}</p>
        <div class="detail-stats">
            ${detail_stat("Best", `${q.best}% ${grade_pill(q.grade)}`)}
            ${detail_stat("Latest", `${q.latest}%`)}
            ${detail_stat("Attempts", q.attempts)}
            ${detail_stat("Last taken", short_date(q.last_taken))}
        </div>
        <p class="detail-heading">Attempts, newest first</p>
        <ul class="detail-list">${(q.history || []).map((h) => `<li>
            <span>${short_date(h.created)}</span><span class="num">${h.score} / ${h.total}</span><span class="num">${h.percent}%</span>${grade_pill(h.grade)}
        </li>`).join("")}</ul>
        <div class="sheet-actions">
            <button class="btn btn-ghost" type="button" data-detail-close>Close</button>
            <a class="btn btn-accent" href="#/set/${q.id}" data-detail-close>Retake</a>
        </div>`;
    if (!detail_sheet.open) detail_sheet.showModal();
}

function show_subject_detail(mode) {
    const s = state.performance?.subjects.find((item) => item.mode === mode);
    if (!s) return;
    const tests = state.performance.quizzes.filter((q) => q.mode === mode);
    el("detail-title").textContent = mode_name(mode);
    el("detail-body").innerHTML = `
        <p class="detail-sub">${plural(s.tests, "test")} · ${plural(s.attempts, "attempt")}</p>
        <div class="detail-stats">
            ${detail_stat("GPA", gpa_text(s.gpa))}
            ${detail_stat("Average", `${s.average}% ${grade_pill(s.grade)}`)}
        </div>
        <p class="detail-heading">Tests, choose one for its attempts</p>
        <ul class="detail-list">${tests.map((q) => `<li class="pick-row" tabindex="0" role="button" data-test="${q.id}">
            <span class="detail-name">${escape_html(q.title)}</span><span class="num">best ${q.best}%</span>${grade_pill(q.grade)}
        </li>`).join("")}</ul>
        <div class="sheet-actions">
            <button class="btn btn-ghost" type="button" data-detail-close>Close</button>
        </div>`;
    if (!detail_sheet.open) detail_sheet.showModal();
}

el("detail-close").addEventListener("click", () => detail_sheet.close());

// a subject or test row opens its box, by click or by enter or space, and a test inside a subject's box swaps the box over
function pick_detail(target) {
    const test = target.closest("[data-test]");
    if (test) {
        show_test_detail(test.dataset.test);
        return true;
    }
    const subject = target.closest("[data-subject]");
    if (subject) {
        show_subject_detail(subject.dataset.subject);
        return true;
    }
    return false;
}

thread.addEventListener("click", (event) => {
    if (!el("performance") || event.target.closest("a, button")) return;
    pick_detail(event.target);
});
detail_sheet.addEventListener("click", (event) => {
    if (event.target.closest("[data-detail-close]")) {
        detail_sheet.close();
        return;
    }
    pick_detail(event.target);
});
document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest?.(".pick-row, .bar-row[data-subject]");
    if (!row) return;
    event.preventDefault();
    pick_detail(row);
});

// the line chart is drawn at the box's real width, so lines and text never stretch
function draw_timeline() {
    const box = el("timeline-chart");
    if (!box || !state.performance) return;
    const points = state.performance.timeline;
    const width = Math.max(box.clientWidth, 260);
    const height = 220;
    const pad = { left: 44, right: 52, top: 14, bottom: 30 };
    const plot_w = width - pad.left - pad.right;
    const plot_h = height - pad.top - pad.bottom;
    const x = (i) => pad.left + (points.length === 1 ? plot_w / 2 : (i / (points.length - 1)) * plot_w);
    const y = (v) => pad.top + plot_h - (v / 100) * plot_h;
    const last = points.length - 1;
    const line = points.map((pt, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pt.percent).toFixed(1)}`).join("");
    const area = points.length > 1 ? `${line}L${x(last).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
    const grid = [0, 25, 50, 75, 100].map((t) => `
        <line class="grid" x1="${pad.left}" x2="${width - pad.right}" y1="${y(t)}" y2="${y(t)}"/>
        <text class="tick" x="${pad.left - 10}" y="${y(t)}" text-anchor="end" dominant-baseline="middle">${t}%</text>`).join("");
    const dates = points.length > 1
        ? `<text class="tick" x="${x(0)}" y="${height - 8}" text-anchor="start">${short_date(points[0].created)}</text>
           <text class="tick" x="${x(last)}" y="${height - 8}" text-anchor="end">${short_date(points[last].created)}</text>`
        : `<text class="tick" x="${x(0)}" y="${height - 8}" text-anchor="middle">${short_date(points[0].created)}</text>`;

    box.innerHTML = `
        <svg width="${width}" height="${height}" style="width: ${width}px; height: ${height}px" tabindex="0" role="img"
            aria-label="Test scores over time, ${points.length} attempts, latest ${points[last].percent} percent. Use the arrow keys to read each one.">
            ${grid}
            ${area ? `<path class="area" d="${area}"/>` : ""}
            <path class="line" d="${line}"/>
            <line class="crosshair" x1="0" x2="0" y1="${pad.top}" y2="${y(0)}" visibility="hidden"/>
            <circle class="end-dot" cx="${x(last)}" cy="${y(points[last].percent)}" r="4.5"/>
            <circle class="hover-dot" r="5" visibility="hidden"/>
            <text class="end-label" x="${x(last) + 11}" y="${y(points[last].percent)}" dominant-baseline="middle">${points[last].percent}%</text>
            ${dates}
            <rect class="hit" x="${pad.left - 12}" y="0" width="${plot_w + 24}" height="${height}"/>
        </svg>
        <div class="chart-tip" hidden></div>`;

    const svg = box.querySelector("svg");
    const tip = box.querySelector(".chart-tip");
    const crosshair = svg.querySelector(".crosshair");
    const dot = svg.querySelector(".hover-dot");
    let current = last;

    const show = (i) => {
        current = i;
        const pt = points[i];
        const cx = x(i);
        const cy = y(pt.percent);
        crosshair.setAttribute("x1", cx);
        crosshair.setAttribute("x2", cx);
        crosshair.setAttribute("visibility", "visible");
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", cy);
        dot.setAttribute("visibility", "visible");
        tip.replaceChildren();
        const strong = document.createElement("strong");
        strong.textContent = `${pt.percent}%`;
        const detail = document.createElement("span");
        detail.textContent = `Grade ${pt.grade} · ${pt.score} of ${pt.total}`;
        const name = document.createElement("span");
        name.textContent = `${pt.title} · ${short_date(pt.created)}`;
        tip.append(strong, detail, name);
        tip.hidden = false;
        tip.style.left = `${Math.min(Math.max(cx, 90), width - 90)}px`;
        tip.style.top = `${cy}px`;
    };
    const hide = () => {
        crosshair.setAttribute("visibility", "hidden");
        dot.setAttribute("visibility", "hidden");
        tip.hidden = true;
    };

    svg.addEventListener("pointermove", (event) => {
        const left = event.clientX - svg.getBoundingClientRect().left;
        const i = points.length === 1 ? 0 : Math.round(((left - pad.left) / plot_w) * last);
        show(Math.min(Math.max(i, 0), last));
    });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("focus", () => show(current));
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            show(Math.min(Math.max(current + (event.key === "ArrowRight" ? 1 : -1), 0), last));
        }
    });
}

let timeline_frame = 0;
window.addEventListener("resize", () => {
    if (!el("timeline-chart") || timeline_frame) return;
    timeline_frame = requestAnimationFrame(() => {
        timeline_frame = 0;
        draw_timeline();
    });
});

// one shared tooltip for the subject bars and grade columns, on hover and keyboard focus
function show_perf_tip(mark) {
    const tip = el("perf-tip");
    if (!tip) return;
    tip.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = mark.dataset.tipValue;
    const name = document.createElement("span");
    name.textContent = mark.dataset.tip;
    const note = document.createElement("span");
    note.textContent = mark.dataset.tipNote;
    tip.append(strong, name, note);
    const box = mark.getBoundingClientRect();
    tip.style.left = `${box.left + box.width / 2}px`;
    tip.style.top = `${box.top}px`;
    tip.hidden = false;
}

function hide_perf_tip() {
    const tip = el("perf-tip");
    if (tip) tip.hidden = true;
}

thread.addEventListener("pointerover", (event) => {
    const mark = event.target.closest("#performance [data-tip]");
    if (mark) show_perf_tip(mark);
});
thread.addEventListener("pointerout", (event) => {
    if (event.target.closest("#performance [data-tip]") && !event.relatedTarget?.closest?.("#performance [data-tip]")) hide_perf_tip();
});
thread.addEventListener("focusin", (event) => {
    const mark = event.target.closest("#performance [data-tip]");
    if (mark) show_perf_tip(mark);
});
thread.addEventListener("focusout", hide_perf_tip);
thread.addEventListener("scroll", hide_perf_tip, { passive: true });

thread.addEventListener("click", (event) => {
    if (event.target.closest("[data-performance]")) show_performance();
});

// conversations

function set_title(text) {
    el("chat-title").textContent = text || "New chat";
    document.title = text ? `${text} · Rahah` : "Rahah";
}

async function delete_conversation(c) {
    if (!confirm(`Delete "${c.title}"?`)) return;
    try {
        await api(`/api/conversations/${c.id}`, { method: "DELETE" });
    } catch (error) {
        alert(error.message);
        return;
    }
    if (c.id === state.conversation_id) start_new_chat();
    else load_history();
}

async function load_history() {
    try {
        const response = await api("/api/conversations");
        const { conversations } = await response.json();
        state.conversations = conversations;
    } catch (error) {
        return;
    }
    render_continue();
    render_chats();
}

async function open_conversation(conversation_id) {
    if (state.busy) return;
    stop_reading();
    try {
        const response = await api(`/api/conversations/${conversation_id}`);
        const conversation = await response.json();
        state.conversation_id = conversation.id;
        state.pending = [];
        render_attachments();
        mode_select.value = conversation.mode;
        sync_placeholder();
        thread.innerHTML = "";
        if (!conversation.messages.length) show_welcome();
        conversation.messages.forEach((m) => {
            if (m.role === "user") {
                add_user_message(m.text, m.files || []);
                return;
            }
            const reply = add_assistant_message(m.text, m.sources || [], m.runs || []);
            render_searches(reply, m.searches);
            if (m.stopped) add_notice(reply, "You stopped this answer.");
            reply.classList.add("answered");
            reply.raw_text = m.text;
            add_answer_actions(reply);
        });
        sync_view();
        set_title(conversation.title);
        offer_retry();
        scroll_to_bottom();
    } catch (error) {
        start_new_chat();
    }
    load_history();
}

function start_new_chat() {
    if (state.busy) return;
    stop_reading();
    state.conversation_id = null;
    state.pending = [];
    render_attachments();
    mode_select.value = state.default_mode;
    sync_placeholder();
    history.replaceState(null, "", "/");
    set_title("");
    show_welcome();
    load_history();
    load_sets();
    load_performance();
    input.focus({ preventScroll: true });
}

function route() {
    // recents was merged into chats, so old links still land there
    if (location.hash === "#/chats" || location.hash === "#/recents") {
        if (!el("chats")) show_chats();
        return;
    }
    // the suggestions page was called for you and then recommendations, so those links still land here
    if (["#/suggestions", "#/recommendations", "#/for-you"].includes(location.hash)) {
        if (!el("recommendations")) show_recommendations();
        return;
    }
    if (location.hash === "#/reminders") {
        if (!el("reminders")) show_reminders();
        return;
    }
    if (location.hash === "#/performance") {
        if (!el("performance")) show_performance();
        return;
    }
    const set_match = location.hash.match(/^#\/set\/([0-9a-f]+)$/);
    if (set_match) {
        if (!el("study") || state.study?.set.id !== set_match[1]) open_set(set_match[1]);
        return;
    }
    const match = location.hash.match(/^#\/c\/([0-9a-f]+)$/);
    if (match && match[1] !== state.conversation_id) open_conversation(match[1]);
}

window.addEventListener("hashchange", route);

// a click outside any sheet closes it like cancel, but only when the press started outside too,
// so dragging out of a text field while selecting doesn't throw away what was typed
document.querySelectorAll("dialog.sheet").forEach((dialog) => {
    let pressed_outside = false;
    const outside = (event) => {
        const box = dialog.getBoundingClientRect();
        return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    };
    // clicks on the dimmed backdrop land on the dialog itself
    dialog.addEventListener("pointerdown", (event) => {
        pressed_outside = event.target === dialog && outside(event);
    });
    dialog.addEventListener("click", (event) => {
        if (pressed_outside && event.target === dialog && outside(event)) dialog.close();
        pressed_outside = false;
    });
});

// the bar floats over the page, so the page keeps room at its end that matches the bar as it grows and shrinks
new ResizeObserver(([entry]) => {
    document.querySelector(".main").style.setProperty("--dock-h", `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`);
}).observe(el("dock-wrap"));
document.querySelectorAll(".tabs [data-chats]").forEach((button) => button.addEventListener("click", show_chats));
document.querySelectorAll(".tabs [data-recommendations]").forEach((button) => button.addEventListener("click", show_recommendations));
document.querySelectorAll(".tabs [data-reminders]").forEach((button) => button.addEventListener("click", show_reminders));
document.querySelectorAll(".tabs [data-performance]").forEach((button) => button.addEventListener("click", show_performance));
document.querySelectorAll("[data-home]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    start_new_chat();
}));

// motion, rows fade up once as they scroll into view, all of it skipped when someone prefers less motion

const calm = matchMedia("(prefers-reduced-motion: reduce)");
const reveal_kinds = [[".row", "reveal-row"], [".card-grid", "reveal-grid"], [".category-title, .group-title, .greeting, .kpis, .perf-card, .perf-grid", "reveal"]];
let reveal_frame = 0;

const reveal_observer = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("shown");
            reveal_observer.unobserve(entry.target);
        });
    }, { root: thread, rootMargin: "0px 0px -6% 0px", threshold: 0.1 })
    : null;

function reveal_new() {
    reveal_frame = 0;
    if (!reveal_observer || calm.matches) return;
    reveal_kinds.forEach(([selector, name]) => {
        thread.querySelectorAll(selector).forEach((item) => {
            if (item.classList.contains(name)) return;
            item.classList.add(name);
            reveal_observer.observe(item);
        });
    });
}

// anything new in the thread is picked up before it is first painted, so nothing flashes
new MutationObserver(() => {
    if (!reveal_frame) reveal_frame = requestAnimationFrame(reveal_new);
}).observe(thread, { childList: true, subtree: true });

function sync_nav_line() {
    document.querySelector(".nav").classList.toggle("scrolled", thread.scrollTop > 8);
}

thread.addEventListener("scroll", sync_nav_line, { passive: true });

// theme

function sync_theme_label() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    const label = light ? "Switch to dark mode" : "Switch to light mode";
    el("theme-toggle").setAttribute("aria-label", label);
    el("theme-toggle").title = label;
}

el("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    const apply = () => {
        document.documentElement.setAttribute("data-theme", next);
        sync_theme_label();
    };
    // the browser cross fades the whole page where it can
    if (document.startViewTransition && !calm.matches) document.startViewTransition(apply);
    else apply();
    try {
        localStorage.setItem("rahah-theme", next);
    } catch (e) {}
});

// composer

function resize_input() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
}

input.addEventListener("input", () => {
    resize_input();
    update_send_button();
});

input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!send_btn.disabled) send_message(input.value);
    }
});

el("composer").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!send_btn.disabled) send_message(input.value);
});

const welcome_template = el("welcome").cloneNode(true);

function apply_modes(modes, redraw = true) {
    state.modes = modes;
    state.code_modes = new Set(modes.filter((m) => m.runs_code).map((m) => m.id));
    modes.forEach((m) => {
        state.mode_names[m.id] = m.name;
        state.mode_groups[m.id] = m.group;
    });
    // the top picker keeps its choice, or goes back to the default if that subject was removed
    const picked = mode_select.value;
    mode_select.innerHTML = mode_options_html();
    mode_select.value = modes.some((m) => m.id === picked) ? picked : state.default_mode;
    if (redraw) render_rows();
}

async function start() {
    sync_theme_label();
    try {
        const response = await api("/api/modes");
        const { modes, groups, menu_groups, default: default_mode } = await response.json();
        state.default_mode = default_mode;
        if (groups) state.groups = groups;
        if (menu_groups) state.menu_groups = menu_groups;
        apply_modes(modes, false);
        mode_select.value = default_mode;
    } catch (error) {
        mode_select.innerHTML = '<option value="general">General study</option>';
    }
    render_rows();
    load_today();
    load_history();
    load_sets();
    load_performance();
    load_reminders();
    route();
    input.focus({ preventScroll: true });
}

start();

// installing rahah as an app needs a service worker, it only steps in to show a page when offline
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
