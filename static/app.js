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
    conversations: [], // recent chats for the drawer and the continue studying row
    modes: [],
    mode_names: {},
};

const icons = {
    doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
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
    return html;
}

function decorate_code(container) {
    container.querySelectorAll("pre code").forEach((code) => {
        if (window.hljs) hljs.highlightElement(code);
        const copy = document.createElement("button");
        copy.className = "copy-btn";
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
        code.parentElement.appendChild(copy);
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

function add_assistant_message(text = null, sources = []) {
    leave_home();
    const message_el = document.createElement("div");
    message_el.className = "message assistant";
    message_el.innerHTML = '<p class="label"><span class="logo" aria-hidden="true"></span>Rahah</p><div class="answer"></div>';
    const answer = message_el.querySelector(".answer");
    if (text === null) {
        answer.innerHTML = '<span class="thinking">Thinking…</span>';
    } else {
        answer.innerHTML = render_markdown(text);
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

// home and recents are pages, anything else in the thread is a chat

function sync_view() {
    const view = el("welcome") ? "home" : el("recents") ? "recents" : "chat";
    document.body.classList.toggle("is-home", view === "home");
    document.body.classList.toggle("is-recents", view === "recents");
    document.body.classList.toggle("is-page", view !== "chat");
    el("page-title").textContent = view === "recents" ? "Recents" : "Home";
}

function leave_home() {
    if (!el("welcome") && !el("recents")) return;
    el("welcome")?.remove();
    el("recents")?.remove();
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
    let frame = 0;
    let finished = false;
    let saved = false;

    const paint = () => {
        frame = 0;
        const stick = near_bottom();
        answer.innerHTML = render_markdown(raw);
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
            } else if (event.t === "done") {
                raw = event.v.text;
                sources = event.v.sources;
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

const shelves = [
    { title: "Maths, one step at a time", mode: "maths", items: [
        { title: "Derivatives from scratch", text: "Teach me what a derivative is from scratch, then walk me through differentiating x squared from first principles." },
        { title: "Probability with dice", text: "Explain conditional probability using a pair of dice, with two short examples." },
        { title: "Simultaneous equations", text: "Show me how to solve simultaneous equations by substitution and by elimination, using the same example for both." },
        { title: "Why the log rules work", text: "Explain the rules of logarithms and why each one works, then give me four quick practice questions." },
    ] },
    { title: "Science explained", mode: "science", items: [
        { title: "Newton's three laws", text: "Explain Newton's three laws of motion with an everyday example for each." },
        { title: "Balancing chemical equations", text: "Teach me how to balance chemical equations, starting with methane burning in oxygen." },
        { title: "How DNA copies itself", text: "Explain DNA replication step by step in simple terms." },
        { title: "Ohm's law in real circuits", text: "Explain Ohm's law and work through one series circuit and one parallel circuit example." },
    ] },
    { title: "Code with Rahah", mode: "coding", items: [
        { title: "Recursion and the call stack", text: "Explain recursion with a simple Python example, and show what happens on the call stack." },
        { title: "Big O in plain words", text: "Explain Big O notation in plain words with examples of O(1), O(n) and O(n squared)." },
        { title: "Help me find a bug", text: "I'm going to paste some code that isn't working. Ask me what it should do, then help me find the bug." },
        { title: "SQL joins with tiny tables", text: "Explain the difference between inner, left and full joins in SQL using small example tables." },
    ] },
    { title: "Languages and writing", mode: "languages", items: [
        { title: "Write a strong thesis", text: "Teach me how to write a strong thesis statement, with a weak and a strong example on the same topic." },
        { title: "Commas or semicolons", text: "Explain when to use a comma and when to use a semicolon, then give me five sentences to fix." },
        { title: "Persuasive techniques", text: "List the main persuasive writing techniques with a short example of each." },
        { title: "Spanish verb drill", text: "Help me practise Spanish present tense verbs. Quiz me one verb at a time." },
    ] },
    { title: "History and humanities", mode: "humanities", items: [
        { title: "Causes of the French Revolution", text: "Explain the main causes of the French Revolution and how historians weigh them differently." },
        { title: "The Cold War in ten minutes", text: "Give me a ten minute overview of the Cold War, with the key turning points." },
        { title: "The free will debate", text: "Explain the main positions in the free will debate and the strongest objection to each." },
        { title: "How to read a source", text: "Teach me how to analyse a historical source for origin, purpose and reliability." },
    ] },
    { title: "Exam season", mode: "exam", items: [
        { title: "Build my revision plan", text: "Help me build a two week revision plan. Ask me which subjects and exam dates I have first." },
        { title: "Mark my answer like an examiner", text: "I'll paste an exam question and my answer. Mark it like an examiner and tell me how to gain more marks." },
        { title: "Active recall drill", text: "Run an active recall drill on a topic I choose. Ask me questions one at a time and keep score." },
        { title: "Explain it back to me", text: "Pick a topic with me, then ask me to explain it back to you and point out anything I got wrong or missed." },
    ] },
];

function tone(mode) {
    return ["general", "maths", "science", "coding", "languages", "humanities", "exam"].includes(mode) ? mode : "general";
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
        <strong>${escape_html(item.title)}</strong>
        <span class="tile-sub">${escape_html(mode_name(item.mode))}</span>
    </button>`;
}

function subject_tile(mode) {
    return `<button class="tile subject poster tone-${tone(mode.id)}" type="button" data-pick="${mode.id}" title="${escape_html(mode.hint)}">
        <strong>${escape_html(mode.name)}</strong>
    </button>`;
}

function chat_card(c) {
    return `<div class="chat-card">
        <a class="chat-card-art poster tone-${tone(c.mode)}" href="#/c/${c.id}" aria-label="Open ${escape_html(c.title)}">
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

function render_rows() {
    const rows = el("rows");
    if (!rows) return;
    const subjects = state.modes.length ? row_html("Pick a subject", state.modes.map(subject_tile).join("")) : "";
    rows.innerHTML = '<div id="continue-row"></div>'
        + subjects
        + shelves.map((shelf) => row_html(shelf.title, shelf.items.map((item) => prompt_tile({ ...item, mode: shelf.mode })).join(""))).join("");
    render_continue();
}

function render_continue() {
    const slot = el("continue-row");
    if (!slot) return;
    slot.innerHTML = state.conversations.length
        ? row_html("Continue studying", state.conversations.slice(0, 12).map(chat_card).join(""))
        : "";
}

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

// recents page

function day_group(seconds) {
    const midnight = new Date().setHours(0, 0, 0, 0) / 1000;
    if (seconds >= midnight) return "Today";
    if (seconds >= midnight - 86400) return "Yesterday";
    if (seconds >= midnight - 7 * 86400) return "Last 7 days";
    return "Earlier";
}

function render_recents() {
    const page = el("recents");
    if (!page) return;
    if (!state.conversations.length) {
        page.innerHTML = `<div class="recents-empty">
            <strong>Nothing here yet</strong>
            Your chats show up here once you start one.
            <div><button class="btn btn-accent" type="button" data-home>Start studying</button></div>
        </div>`;
        return;
    }
    const groups = new Map();
    state.conversations.forEach((c) => {
        const name = day_group(c.updated);
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(c);
    });
    page.innerHTML = [...groups].map(([name, chats]) => `
        <h3 class="group-title">${name}</h3>
        <div class="card-grid">${chats.map(chat_card).join("")}</div>`).join("");
}

function show_recents() {
    if (state.busy) return;
    state.conversation_id = null;
    state.pending = [];
    render_attachments();
    mode_select.value = state.default_mode;
    sync_placeholder();
    history.replaceState(null, "", "#/recents");
    set_title("");
    document.title = "Recents · Rahah";
    thread.innerHTML = '<div class="recents" id="recents"></div>';
    thread.scrollTop = 0;
    render_recents();
    sync_view();
    load_history();
    close_drawer();
}

thread.addEventListener("click", (event) => {
    if (event.target.closest(".recents [data-home]")) start_new_chat();
});

// conversations and the my chats drawer

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
    const nav = el("history");
    try {
        const response = await api("/api/conversations");
        const { conversations } = await response.json();
        state.conversations = conversations;
    } catch (error) {
        nav.innerHTML = `<p class="history-empty">${escape_html(error.message)}</p>`;
        return;
    }
    render_continue();
    render_recents();
    if (!state.conversations.length) {
        nav.innerHTML = '<p class="history-empty">Your chats will show up here.</p>';
        return;
    }
    nav.innerHTML = "";
    state.conversations.forEach((c) => {
        const item = document.createElement("div");
        item.className = `history-item${c.id === state.conversation_id ? " active" : ""}`;
        item.innerHTML = `<a href="#/c/${c.id}"><span class="t">${escape_html(c.title)}</span><span class="m">${escape_html(mode_name(c.mode))} · ${time_ago(c.updated)}</span></a>`;
        const remove = document.createElement("button");
        remove.className = "icon-btn";
        remove.type = "button";
        remove.setAttribute("aria-label", `Delete ${c.title}`);
        remove.innerHTML = icons.trash;
        remove.addEventListener("click", () => delete_conversation(c));
        item.appendChild(remove);
        nav.appendChild(item);
    });
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
            else add_assistant_message(m.text, m.sources || []);
        });
        sync_view();
        set_title(conversation.title);
        scroll_to_bottom();
    } catch (error) {
        start_new_chat();
    }
    load_history();
    close_drawer();
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
    close_drawer();
    input.focus({ preventScroll: true });
}

function route() {
    if (location.hash === "#/recents") {
        if (!el("recents")) show_recents();
        return;
    }
    const match = location.hash.match(/^#\/c\/([0-9a-f]+)$/);
    if (match && match[1] !== state.conversation_id) open_conversation(match[1]);
}

window.addEventListener("hashchange", route);
el("new-chat").addEventListener("click", start_new_chat);
document.querySelectorAll("[data-recents]").forEach((button) => button.addEventListener("click", show_recents));
document.querySelectorAll("[data-home]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    start_new_chat();
}));

function open_drawer() {
    document.body.classList.add("drawer-open");
    el("drawer").classList.add("open");
    el("scrim").classList.add("open");
    el("close-drawer").focus();
}

function close_drawer() {
    document.body.classList.remove("drawer-open");
    el("drawer").classList.remove("open");
    el("scrim").classList.remove("open");
}

document.querySelectorAll("[data-open-chats]").forEach((button) => button.addEventListener("click", open_drawer));
el("close-drawer").addEventListener("click", close_drawer);
el("scrim").addEventListener("click", close_drawer);
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && el("drawer").classList.contains("open")) close_drawer();
});

// theme

function sync_theme_label() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    const label = light ? "Switch to dark mode" : "Switch to light mode";
    el("theme-toggle").setAttribute("aria-label", label);
    el("theme-toggle").title = label;
}

el("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
        localStorage.setItem("rahah-theme", next);
    } catch (e) {}
    sync_theme_label();
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
        const { modes, default: default_mode } = await response.json();
        state.default_mode = default_mode;
        state.modes = modes;
        modes.forEach((m) => (state.mode_names[m.id] = m.name));
        mode_select.innerHTML = modes.map((m) => `<option value="${m.id}" title="${escape_html(m.hint)}">${escape_html(m.name)}</option>`).join("");
        mode_select.value = default_mode;
    } catch (error) {
        mode_select.innerHTML = '<option value="general">General study</option>';
    }
    render_rows();
    load_history();
    route();
    input.focus({ preventScroll: true });
}

start();
