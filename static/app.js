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
    box.innerHTML = '<p class="sources-title">Sources</p>' + sources.map((s) => `
        <details class="source" data-n="${s.n}">
            <summary><span class="n">${s.n}</span><span>${escape_html(s.title)}${s.where ? ` <span class="where">· ${escape_html(s.where)}</span>` : ""}</span></summary>
            ${s.quote ? `<blockquote>${escape_html(s.quote)}</blockquote>` : ""}
        </details>`).join("");
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

function add_assistant_message(text = null, sources = [], runs = []) {
    leave_home();
    const message_el = document.createElement("div");
    message_el.className = "message assistant";
    message_el.innerHTML = '<p class="label"><span class="logo" aria-hidden="true"></span>Rahah</p><div class="answer"></div>';
    const answer = message_el.querySelector(".answer");
    if (text === null) {
        answer.innerHTML = '<span class="thinking">Thinking…</span>';
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

const page_titles = { home: "Home", chats: "Chats", recommendations: "Suggestions", performance: "Performance" };

function current_view() {
    if (el("welcome")) return "home";
    if (el("chats")) return "chats";
    if (el("recommendations")) return "recommendations";
    if (el("performance")) return "performance";
    if (el("study")) return "study";
    return "chat";
}

function sync_view() {
    const view = current_view();
    document.body.classList.toggle("is-home", view === "home");
    document.body.classList.toggle("is-chats", view === "chats");
    document.body.classList.toggle("is-recommendations", view === "recommendations");
    document.body.classList.toggle("is-performance", view === "performance");
    document.body.classList.toggle("is-study", view === "study");
    document.body.classList.toggle("is-page", view in page_titles);
    el("page-title").textContent = page_titles[view] || "Home";
    sync_nav_line();
}

function leave_home() {
    if (current_view() === "chat") return;
    ["welcome", "chats", "recommendations", "performance", "study"].forEach((id) => el(id)?.remove());
    sync_view();
}

function show_welcome() {
    thread.innerHTML = "";
    thread.appendChild(welcome_template.cloneNode(true));
    thread.scrollTop = 0;
    render_rows();
    sync_view();
}

// sending and streaming

function update_send_button() {
    const uploading = state.pending.some((f) => f.status === "uploading");
    send_btn.disabled = state.busy || uploading || !input.value.trim();
}

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

async function send_message(text) {
    text = text.trim();
    const ready = state.pending.filter((f) => f.status === "ready");
    if (!text || state.busy) return;
    state.busy = true;
    update_send_button();

    const sent_files = [...ready];
    input.value = "";
    resize_input();
    state.pending = state.pending.filter((f) => f.status !== "ready");
    render_attachments();

    add_user_message(text, sent_files);
    const reply = add_assistant_message();
    const answer = reply.querySelector(".answer");
    scroll_to_bottom();

    let raw = "";
    let sources = [];
    let runs = [];
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
        if (stick) scroll_to_bottom();
    };
    const schedule_paint = () => {
        if (!frame) frame = requestAnimationFrame(paint);
    };
    const give_back = () => {
        // a failed turn isn't saved, so hand the question and files back for another try
        if (!input.value.trim()) input.value = text;
        state.pending = [...sent_files, ...state.pending];
        render_attachments();
        resize_input();
    };

    try {
        const conversation_id = await ensure_conversation();
        const response = await api(`/api/conversations/${conversation_id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, mode: mode_select.value, file_ids: sent_files.map((f) => f.id) }),
        });
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
            } else if (event.t === "done") {
                raw = event.v.text;
                sources = event.v.sources;
                runs = event.v.runs || [];
                finished = true;
                saved = true;
                if (frame) cancelAnimationFrame(frame);
                paint();
                if (event.v.truncated) add_notice(reply, "This answer hit the length limit and was cut short. Ask Rahah to continue.");
            } else if (event.t === "refusal" || event.t === "error") {
                // partial text from a failed turn is dropped, it was never saved
                if (frame) cancelAnimationFrame(frame);
                answer.innerHTML = "";
                render_sources(reply, []);
                add_notice(reply, event.v);
                give_back();
                finished = true;
            }
        });
        if (!finished) {
            if (frame) cancelAnimationFrame(frame);
            answer.innerHTML = "";
            render_sources(reply, []);
            add_notice(reply, "The connection dropped before the answer finished. Try sending it again.");
            give_back();
        }
    } catch (error) {
        if (frame) cancelAnimationFrame(frame);
        answer.innerHTML = "";
        render_sources(reply, []);
        add_notice(reply, error.message || "Rahah couldn't send that message.");
        give_back();
    } finally {
        state.busy = false;
        update_send_button();
        load_history();
        if (saved && el("chat-title").textContent === "New chat") set_title(text.slice(0, 60));
        input.focus();
    }
}

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

el("attach").addEventListener("click", () => file_input.click());
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

function tone(mode) {
    return ["general", "maths", "science", "coding", "languages", "humanities", "exam"].includes(mode) ? mode : "general";
}

function group_of(mode) {
    return state.mode_groups[mode] || "study";
}

function mode_name(mode) {
    return state.mode_names[mode] || "General study";
}

function time_ago(seconds) {
    const gap = Math.max(0, Date.now() / 1000 - seconds);
    if (gap < 60) return "just now";
    const steps = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
    const [size, unit] = steps.find(([size]) => gap >= size);
    const n = Math.floor(gap / size);
    return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

function prompt_tile(item) {
    return `<button class="tile poster tone-${tone(item.mode)}" type="button" data-mode="${item.mode}" data-text="${escape_html(item.text)}" title="${escape_html(item.text)}">
        ${sketch_html(sketch_for(`${item.title} ${item.text}`, item.mode))}
        <strong>${escape_html(item.title)}</strong>
        <span class="tile-sub">${escape_html(mode_name(item.mode))}</span>
    </button>`;
}

function subject_tile(mode) {
    return `<button class="tile subject poster tone-${tone(mode.id)}" type="button" data-pick="${mode.id}" title="${escape_html(mode.hint)}">
        ${sketch_html(mode_sketches[mode.id] || "bulb", "inline")}
        <strong>${escape_html(mode.name)}</strong>
    </button>`;
}

function chat_card(c) {
    return `<div class="chat-card">
        <a class="chat-card-art poster tone-${tone(c.mode)}" href="#/c/${c.id}" aria-label="Open ${escape_html(c.title)}">
            ${sketch_html(sketch_for(c.title, c.mode))}
            <span class="play">${icons.play}</span>
        </a>
        <div class="chat-card-info">
            <div class="chat-card-text">
                <strong title="${escape_html(c.title)}">${escape_html(c.title)}</strong>
                <span>${escape_html(mode_name(c.mode))} · ${time_ago(c.updated)}</span>
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
        exam: '<div id="performance-exam"></div>' + saved("exam") + sets("exam") + shelf_rows("exam"),
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
}

function render_continue() {
    Object.entries(continue_titles).forEach(([group, title]) => {
        const slot = el(`continue-${group}`);
        if (!slot) return;
        const chats = state.conversations.filter((c) => group_of(c.mode) === group).slice(0, 12);
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

function render_chats() {
    const list = el("chat-groups");
    if (!list) return;
    el("chat-search").hidden = !state.conversations.length;
    if (!state.conversations.length) {
        list.innerHTML = `<div class="page-empty">
            <strong>Nothing here yet</strong>
            Your chats show up here once you start one.
            <div><button class="btn btn-accent" type="button" data-home>Start studying</button></div>
        </div>`;
        return;
    }
    const words = el("chat-search").value.trim().toLowerCase();
    const shown = state.conversations.filter((c) => !words || c.title.toLowerCase().includes(words));
    if (!shown.length) {
        list.innerHTML = '<p class="page-note">No chats match that search.</p>';
        return;
    }
    const groups = new Map();
    shown.forEach((c) => {
        const name = day_group(c.updated);
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(c);
    });
    list.innerHTML = [...groups].map(([name, chats]) => `
        <h3 class="group-title">${name}</h3>
        <div class="card-grid">${chats.map(chat_card).join("")}</div>`).join("");
}

function show_chats() {
    if (state.busy) return;
    enter_page("#/chats", "Chats", `<div class="list-page" id="chats">
        <div class="page-tools">
            <input class="search" id="chat-search" type="search" placeholder="Search your chats" aria-label="Search your chats" hidden>
            <button class="btn btn-accent btn-small" type="button" data-home>${icons.plus}New chat</button>
        </div>
        <div id="chat-groups"></div>
    </div>`);
    el("chat-search").addEventListener("input", render_chats);
    render_chats();
    sync_view();
    load_history();
}

thread.addEventListener("click", (event) => {
    // home links drawn inside the thread, like the new chat button and quiz results
    if (event.target.closest("[data-home]")) start_new_chat();
});

// recommendations page, suggestions from claude based on what the student has studied, grouped by topic

const rec_kinds = { review: "Review", next: "Next step", related: "Related" };
const rec_actions = {
    ask: { label: "Ask", icon: "chat" },
    flashcards: { label: "Flashcards", icon: "cards" },
    quiz: { label: "Quiz", icon: "quiz" },
    summary: { label: "Summary", icon: "summary" },
};

function rec_action(item) {
    if (item.action !== "open") return rec_actions[item.action];
    const saved = state.sets.find((s) => s.id === item.set_id);
    return saved?.kind === "flashcards" ? { label: "Your deck", icon: "cards" } : { label: "Retake quiz", icon: "quiz" };
}

function rec_card(item, i) {
    const action = rec_action(item);
    // claude picks the sketch, older picks without one get a drawing from their words
    const sketch = item.sketch && sketches[item.sketch] ? item.sketch : sketch_for(`${item.title} ${item.prompt}`, item.mode);
    const kind = rec_kinds[item.kind] ? ` · ${rec_kinds[item.kind]}` : "";
    return `<button class="tile rec poster tone-${tone(item.mode)}" type="button" data-rec="${i}">
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
            Chat, make flashcards or take a quiz, and Rahah suggests what to study next based on it.
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

// study tools, summaries go through chat, flashcards and quizzes are saved sets

const tools = {
    summary: { title: "Summarise notes", sub: "Key points from a PDF or a topic", icon: "summary", tone: "general" },
    flashcards: { title: "Make flashcards", sub: "A deck to flip through", icon: "cards", tone: "languages" },
    quiz: { title: "Make a quiz", sub: "Multiple choice, with a score", icon: "quiz", tone: "exam" },
};

const sheet_copy = {
    ask: {
        title: "Ask a question", submit: "Ask", field: "Question", choices: [], pick: null, limit: 20000,
        topic: "What would you like to know? Add notes if your question is about them",
    },
    summary: {
        title: "Summarise notes", submit: "Summarise", label: "Length",
        choices: [["short", "Short"], ["detailed", "Detailed"]], pick: "short",
        topic: "What should it cover? Leave blank to summarise all of your notes",
    },
    flashcards: {
        title: "Make flashcards", submit: "Make flashcards", working: "Making your flashcards", label: "Cards",
        choices: [[5, "5"], [10, "10"], [15, "15"], [20, "20"]], pick: 10,
        topic: "A topic, like the causes of World War I, or leave blank to use your notes",
    },
    quiz: {
        title: "Make a quiz", submit: "Make the quiz", working: "Writing your quiz", label: "Questions",
        choices: [[5, "5"], [10, "10"], [15, "15"]], pick: 10,
        topic: "A topic, like photosynthesis, or leave blank to use your notes",
    },
};

const sheet = el("sheet");
const sheet_state = { tool: "flashcards", files: [], pick: 10, opened: 0 };

const tool_sketches = { summary: "notes", flashcards: "cards", quiz: "checklist" };

function tool_tile(id, mode) {
    const t = tools[id];
    return `<button class="tile tool poster tone-${t.tone}" type="button" data-tool="${id}" data-mode="${mode}">
        <span class="tool-icon">${icons[t.icon]}</span>
        ${sketch_html(tool_sketches[id] || "notes")}
        <strong>${escape_html(t.title)}</strong>
        <span class="tile-sub">${escape_html(t.sub)}</span>
    </button>`;
}

function set_detail(s) {
    if (s.kind === "flashcards") return `${s.size} card${s.size === 1 ? "" : "s"}`;
    const best = s.best_score === null || s.best_score === undefined ? "" : ` · best ${s.best_score}/${s.size}`;
    return `${s.size} question${s.size === 1 ? "" : "s"}${best}`;
}

function set_card(s) {
    return `<div class="chat-card">
        <a class="chat-card-art poster tone-${tone(s.mode)}" href="#/set/${s.id}" aria-label="Open ${escape_html(s.title)}">
            ${sketch_html(sketch_for(s.title, s.mode))}
            <span class="play outline">${s.kind === "quiz" ? icons.quiz : icons.cards}</span>
        </a>
        <div class="chat-card-info">
            <div class="chat-card-text">
                <strong title="${escape_html(s.title)}">${escape_html(s.title)}</strong>
                <span>${set_detail(s)} · ${time_ago(s.updated)}</span>
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
        if (quiz_slot) quiz_slot.innerHTML = quizzes.length ? row_html("Your quizzes", quizzes.map(set_card).join("")) : "";
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
    const item = (m) => `
        <button type="button" class="picker-option" role="option" aria-selected="${m.id === current}" data-value="${escape_html(m.id)}"${m.hint ? ` title="${escape_html(m.hint)}"` : ""}>
            <span>${escape_html(m.name)}</span>${m.id === current ? icons.check : ""}
        </button>`;
    // in the top picker a group heading can be clicked too, and opens its first subject
    const heading = (group, label) => headings_open
        ? `<button type="button" class="picker-heading" data-group="${escape_html(group)}">${escape_html(label)}</button>`
        : `<p class="picker-heading">${escape_html(label)}</p>`;
    const grouped = Object.entries(state.menu_groups).map(([group, label]) => {
        const items = state.modes.filter((m) => m.menu === group);
        if (!items.length) return "";
        return `<div class="picker-group" role="group" aria-label="${escape_html(label)}">${heading(group, label)}${items.map(item).join("")}</div>`;
    }).join("");
    if (grouped) return grouped;
    // without groups from the server, list whatever the select holds
    const plain = [...select.options].map((o) => ({ id: o.value, name: o.textContent, hint: o.title }));
    return `<div class="picker-group">${plain.map(item).join("")}</div>`;
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

    const options = () => [...menu.querySelectorAll(".picker-option, button.picker-heading")];
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

    button.addEventListener("click", () => (menu.hidden ? open() : close()));
    menu.addEventListener("click", (event) => {
        const heading = event.target.closest("button.picker-heading");
        if (heading && on_pick) {
            const first = state.modes.find((m) => m.menu === heading.dataset.group);
            close();
            if (first) on_pick(first.id);
            return;
        }
        const option = event.target.closest(".picker-option");
        if (!option) return;
        if (on_pick) {
            close();
            on_pick(option.dataset.value);
            return;
        }
        select.value = option.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close(true);
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
        } else if (event.key === "Home" || event.key === "End") {
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

function open_sheet(tool, mode, topic = "") {
    const copy = sheet_copy[tool];
    sheet_state.tool = tool;
    sheet_state.files = [];
    sheet_state.pick = copy.pick;
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
        `<button class="choice" type="button" data-choice="${value}" aria-pressed="${value === copy.pick}">${label}</button>`).join("");
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
            show_sheet_error("Wait for Rahah to finish the answer it's writing first.");
            return;
        }
        run_ask(topic, mode);
        return;
    }
    if (!topic && !sheet_state.files.length) {
        show_sheet_error("Write a topic or add some notes first.");
        return;
    }
    if (state.busy) {
        show_sheet_error("Wait for Rahah to finish the answer it's writing first.");
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
    };
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

function render_deck() {
    const s = state.study;
    const card = s.set.items[s.order[s.index]];
    const last = s.index === s.order.length - 1;
    el("study").innerHTML = `
        <div class="deck">
            <p class="study-meta">Card ${s.index + 1} of ${s.order.length}</p>
            <div class="flashcard${s.flipped ? " flipped" : ""}" role="button" tabindex="0" data-deck="flip" aria-label="Flip the card">
                <div class="flashcard-inner">
                    <div class="face front poster tone-${tone(s.set.mode)}">
                        <span class="face-label">Question</span>
                        <div class="face-text answer">${render_markdown(card.front)}</div>
                    </div>
                    <div class="face back">
                        <span class="face-label">Answer</span>
                        <div class="face-text answer">${render_markdown(card.back)}</div>
                    </div>
                </div>
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

function render_quiz() {
    const s = state.study;
    const total = s.set.items.length;
    if (s.done) {
        render_results();
        return;
    }
    const q = s.set.items[s.index];
    el("study").innerHTML = `
        <div class="quiz">
            <div class="quiz-progress" aria-hidden="true"><span style="width: ${(s.index / total) * 100}%"></span></div>
            <p class="study-meta">Question ${s.index + 1} of ${total}</p>
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

function answer_option(i) {
    const s = state.study;
    if (s.answered || s.done) return;
    const q = s.set.items[s.index];
    if (i < 0 || i >= q.options.length) return;
    s.answered = true;
    const right = i === q.answer;
    if (right) s.score += 1;
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
    s.index += 1;
    s.answered = false;
    if (s.index < s.set.items.length) {
        render_quiz();
        return;
    }
    s.done = true;
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
    const total = s.set.items.length;
    const best = s.set.best_score;
    const note = s.score === total ? "Full marks." : best !== null && best !== undefined && best > s.score ? `Your best is ${best} out of ${total}.` : "Go again to lock it in.";
    el("study").innerHTML = `
        <div class="quiz-results">
            <p class="study-meta">Quiz complete</p>
            <p class="score"><strong>${s.score}</strong> / ${total}</p>
            <p class="score-note">${note}</p>
            <div class="study-controls">
                <button class="btn btn-accent" type="button" data-quiz="again">Try again</button>
                <button class="btn btn-soft" type="button" data-home>Back to home</button>
            </div>
            <div class="study-extra">
                <button class="btn btn-ghost btn-small" type="button" data-study-delete>${icons.trash}Delete quiz</button>
            </div>
        </div>`;
}

function restart_quiz() {
    const s = state.study;
    Object.assign(s, { index: 0, score: 0, answered: false, done: false });
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
        return;
    }
    const option = target.closest("[data-option]");
    if (option) {
        answer_option(Number(option.dataset.option));
        return;
    }
    const quiz = target.closest("[data-quiz]");
    if (quiz) {
        if (quiz.dataset.quiz === "next") next_question();
        if (quiz.dataset.quiz === "again") restart_quiz();
        return;
    }
    if (target.closest("[data-study-delete]")) delete_set(state.study.set);
});

// arrow keys move through a deck, space flips it, number keys answer a quiz
document.addEventListener("keydown", (event) => {
    if (!el("study") || !state.study || sheet.open || event.target.closest("input, textarea, select")) return;
    const s = state.study;
    if (s.set.kind === "flashcards") {
        if (event.key === "ArrowRight") step_deck(1);
        else if (event.key === "ArrowLeft") step_deck(-1);
        else if ((event.key === " " || event.key === "Enter") && !event.target.closest("button")) {
            event.preventDefault();
            flip_card();
        }
    } else if (/^[1-6]$/.test(event.key)) {
        answer_option(Number(event.key) - 1);
    }
});

// performance, quiz scores as percentages and grades, on its own page and as a row under exam

function short_date(seconds) {
    return new Date(seconds * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function plural(n, word) {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
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

const stat_sketches = { "Average score": "chart", "Latest quiz": "pencil", "Quizzes taken": "checklist", "Best subject": "trophy" };

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
        stat_card("Average score", `${o.average}% ${grade_pill(o.grade)}`, `${o.correct} of ${o.questions} questions right`, sparkline(state.performance.timeline)),
        stat_card("Latest quiz", `${o.latest}%`, delta_html(o.change)),
        stat_card("Quizzes taken", o.attempts, `Across ${plural(o.quizzes, "quiz")}`),
        `<button class="stat-card more" type="button" data-performance>See all your results ${icons.next}</button>`,
    ].join(""));
}

function show_performance() {
    if (state.busy) return;
    enter_page("#/performance", "Performance", '<div class="performance" id="performance"></div>');
    render_performance();
    sync_view();
    load_performance();
}

function render_performance() {
    const page = el("performance");
    if (!page || !state.performance) return;
    const p = state.performance;
    const o = p.overall;
    if (!o) {
        page.innerHTML = `<div class="page-empty">
            <strong>No scores yet</strong>
            Take a quiz and your percentages and grades show up here.
            <div><button class="btn btn-accent" type="button" data-tool="quiz" data-mode="exam">Make a quiz</button></div>
        </div>`;
        return;
    }
    const best = p.subjects[0];
    const weakest = o.weakest_subject ? p.subjects[p.subjects.length - 1] : null;
    const max_count = Math.max(...p.grades.map((g) => g.count), 1);
    const scale = p.scale.map((s, i) => (i === p.scale.length - 1 ? `${s.grade} below ${p.scale[i - 1].min}%` : `${s.grade} ${s.min}%+`)).join(" · ");

    page.innerHTML = `
        <div class="kpis">
            ${stat_card("Average score", `${o.average}% ${grade_pill(o.grade)}`, `${o.correct} of ${o.questions} questions right`, sparkline(p.timeline))}
            ${stat_card("Latest quiz", `${o.latest}%`, delta_html(o.change))}
            ${stat_card("Quizzes taken", o.attempts, `Across ${plural(o.quizzes, "quiz")}`)}
            ${stat_card("Best subject", escape_html(mode_name(best.mode)), weakest ? `${best.average}% average · needs work: ${escape_html(mode_name(weakest.mode))}` : `${best.average}% average`, "", true)}
        </div>

        <section class="perf-card">
            <div class="perf-head">
                <h3>Scores over time</h3>
                <p>Each quiz attempt as a percentage, oldest on the left</p>
            </div>
            <div class="chart" id="timeline-chart"></div>
            <details class="perf-details">
                <summary>Show as a table</summary>
                <div class="table-wrap"><table>
                    <thead><tr><th>Date</th><th>Quiz</th><th class="num">Score</th><th class="num">Percent</th><th>Grade</th></tr></thead>
                    <tbody>${p.timeline.slice().reverse().map((t) => `<tr>
                        <td>${short_date(t.created)}</td><td>${escape_html(t.title)}</td>
                        <td class="num">${t.score} / ${t.total}</td><td class="num">${t.percent}%</td><td>${grade_pill(t.grade)}</td>
                    </tr>`).join("")}</tbody>
                </table></div>
            </details>
        </section>

        <div class="perf-grid">
            <section class="perf-card">
                <div class="perf-head">
                    <h3>By subject</h3>
                    <p>Average across every attempt</p>
                </div>
                <div class="bars">${p.subjects.map((s) => `
                    <div class="bar-row" tabindex="0" data-tip="${escape_html(mode_name(s.mode))}" data-tip-value="${s.average}%" data-tip-note="Grade ${s.grade} · ${plural(s.attempts, "attempt")}">
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
                <h3>Your quizzes</h3>
                <p>Most recent first</p>
            </div>
            <div class="table-wrap"><table>
                <thead><tr><th>Quiz</th><th>Subject</th><th class="num">Attempts</th><th class="num">Best</th><th class="num">Latest</th><th>Best grade</th><th></th></tr></thead>
                <tbody>${p.quizzes.map((q) => `<tr>
                    <td>${escape_html(q.title)}</td><td>${escape_html(mode_name(q.mode))}</td>
                    <td class="num">${q.attempts}</td><td class="num">${q.best}%</td><td class="num">${q.latest}%</td>
                    <td>${grade_pill(q.grade)}</td>
                    <td class="row-action"><a class="btn btn-soft btn-small" href="#/set/${q.id}">Retake</a></td>
                </tr>`).join("")}</tbody>
            </table></div>
        </section>
        <div class="chart-tip floating" id="perf-tip" hidden></div>`;
    draw_timeline();
}

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
            aria-label="Quiz scores over time, ${points.length} attempts, latest ${points[last].percent} percent. Use the arrow keys to read each one.">
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
            if (m.role === "user") add_user_message(m.text, m.files || []);
            else add_assistant_message(m.text, m.sources || [], m.runs || []);
        });
        sync_view();
        set_title(conversation.title);
        scroll_to_bottom();
    } catch (error) {
        start_new_chat();
    }
    load_history();
}

function start_new_chat() {
    if (state.busy) return;
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
document.querySelectorAll(".tabs [data-chats]").forEach((button) => button.addEventListener("click", show_chats));
document.querySelectorAll(".tabs [data-recommendations]").forEach((button) => button.addEventListener("click", show_recommendations));
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

async function start() {
    sync_theme_label();
    try {
        const response = await api("/api/modes");
        const { modes, groups, menu_groups, default: default_mode } = await response.json();
        state.default_mode = default_mode;
        state.modes = modes;
        if (groups) state.groups = groups;
        if (menu_groups) state.menu_groups = menu_groups;
        state.code_modes = new Set(modes.filter((m) => m.runs_code).map((m) => m.id));
        modes.forEach((m) => {
            state.mode_names[m.id] = m.name;
            state.mode_groups[m.id] = m.group;
        });
        mode_select.innerHTML = mode_options_html();
        mode_select.value = default_mode;
    } catch (error) {
        mode_select.innerHTML = '<option value="general">General study</option>';
    }
    render_rows();
    load_history();
    load_sets();
    load_performance();
    route();
    input.focus({ preventScroll: true });
}

start();
