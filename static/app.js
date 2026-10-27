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
};

const icons = {
    doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
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
    el("welcome")?.remove();
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
    el("welcome")?.remove();
    const message_el = document.createElement("div");
    message_el.className = "message assistant";
    message_el.innerHTML = '<p class="label">Rahah</p><div class="answer"></div>';
    const answer = message_el.querySelector(".answer");
    if (text === null) {
        answer.innerHTML = '<span class="thinking" aria-label="Thinking"><i></i><i></i><i></i></span>';
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

function show_welcome() {
    thread.innerHTML = "";
    thread.appendChild(welcome_template.cloneNode(true));
    bind_suggestions();
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

// conversations and the sidebar

function set_title(text) {
    el("chat-title").textContent = text || "New chat";
    document.title = text ? `${text} · Rahah` : "Rahah";
}

async function load_history() {
    const nav = el("history");
    try {
        const response = await api("/api/conversations");
        const { conversations } = await response.json();
        if (!conversations.length) {
            nav.innerHTML = '<p class="history-empty">Your chats will show up here.</p>';
            return;
        }
        nav.innerHTML = "";
        conversations.forEach((c) => {
            const item = document.createElement("div");
            item.className = `history-item${c.id === state.conversation_id ? " active" : ""}`;
            item.innerHTML = `<a href="#/c/${c.id}">${escape_html(c.title)}</a>`;
            const remove = document.createElement("button");
            remove.className = "icon-btn";
            remove.setAttribute("aria-label", `Delete ${c.title}`);
            remove.innerHTML = icons.trash;
            remove.addEventListener("click", async () => {
                if (!confirm(`Delete "${c.title}"?`)) return;
                await api(`/api/conversations/${c.id}`, { method: "DELETE" });
                if (c.id === state.conversation_id) start_new_chat();
                else load_history();
            });
            item.appendChild(remove);
            nav.appendChild(item);
        });
    } catch (error) {
        nav.innerHTML = `<p class="history-empty">${escape_html(error.message)}</p>`;
    }
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
        thread.innerHTML = "";
        if (!conversation.messages.length) show_welcome();
        conversation.messages.forEach((m) => {
            if (m.role === "user") add_user_message(m.text, m.files || []);
            else add_assistant_message(m.text, m.sources || []);
        });
        set_title(conversation.title);
        scroll_to_bottom();
    } catch (error) {
        start_new_chat();
    }
    load_history();
    close_sidebar();
}

function start_new_chat() {
    if (state.busy) return;
    state.conversation_id = null;
    state.pending = [];
    render_attachments();
    mode_select.value = state.default_mode;
    history.replaceState(null, "", "/");
    set_title("");
    show_welcome();
    load_history();
    close_sidebar();
    input.focus();
}

function route() {
    const match = location.hash.match(/^#\/c\/([0-9a-f]+)$/);
    if (match && match[1] !== state.conversation_id) open_conversation(match[1]);
}

window.addEventListener("hashchange", route);
el("new-chat").addEventListener("click", start_new_chat);

// sidebar on small screens

function close_sidebar() {
    el("sidebar").classList.remove("open");
    el("scrim").classList.remove("open");
}

el("open-sidebar").addEventListener("click", () => {
    el("sidebar").classList.add("open");
    el("scrim").classList.add("open");
});
el("close-sidebar").addEventListener("click", close_sidebar);
el("scrim").addEventListener("click", close_sidebar);

// theme

function sync_theme_label() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    document.querySelector(".theme-label").textContent = light ? "Dark mode" : "Light mode";
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

function bind_suggestions() {
    thread.querySelectorAll(".suggestion").forEach((button) => {
        button.addEventListener("click", () => {
            mode_select.value = button.dataset.mode;
            send_message(button.dataset.text);
        });
    });
}

async function start() {
    sync_theme_label();
    bind_suggestions();
    try {
        const response = await api("/api/modes");
        const { modes, default: default_mode } = await response.json();
        state.default_mode = default_mode;
        mode_select.innerHTML = modes.map((m) => `<option value="${m.id}" title="${escape_html(m.hint)}">${escape_html(m.name)}</option>`).join("");
        mode_select.value = default_mode;
    } catch (error) {
        mode_select.innerHTML = '<option value="general">General study</option>';
    }
    load_history();
    route();
    input.focus();
}

start();
