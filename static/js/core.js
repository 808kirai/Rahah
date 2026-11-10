// rahah, the shared pieces, page elements, state, icons, the api helper, markdown, code runs and diagrams
// plain scripts with no build step, loaded in order and sharing one global scope

const el = (id) => document.getElementById(id);
const thread = el("thread");
const input = el("input");

// on a computer the cursor goes into the message box so typing can start straight away.
// on a phone that would pop the keyboard up, so there it only opens when the student taps the box
const touch_screen = matchMedia("(hover: none) and (pointer: coarse)").matches;
function focus_input() {
    if (touch_screen) return;
    input.focus({ preventScroll: true });
}
const send_btn = el("send");
const mode_select = el("mode");
const attachments = el("attachments");
const file_input = el("file-input");
const composer_box = el("composer-box");

const state = {
    conversation_id: null,
    default_mode: "general",
    pending: [], // files attached to the next message, each {key, id, name, kind, status}, notes from the library marked note
    notes: [], // the notes library, files kept by subject
    settings: { language: "", low_data: false }, // answer language, blank to match the question, and low-data mode
    languages: {}, // answer languages from the server, each with its voice code
    busy: false,
    conversations: [], // recent chats for the chats page and the continue studying row
    reminders: [], // exams, cats, midterms, assignments and events, soonest first
    classes: [], // the weekly timetable, monday first
    reminder_kinds: { exam: "Exam", cat: "CAT", midterm: "Midterm", assignment: "Assignment", event: "Event" },
    recs: null, // suggestions, shown on home
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
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
    printer: '<svg viewBox="0 0 24 24"><path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/></svg>',
    chevron: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    thumb_up: '<svg viewBox="0 0 24 24"><path d="M7 10.5V20H4.5a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1z"/><path d="M7 10.5L11 3.5a2 2 0 0 1 2.3 2.3L12.5 9.5h5.2a2 2 0 0 1 2 2.4l-1.3 6.4a2 2 0 0 1-2 1.7H7"/></svg>',
    thumb_down: '<svg viewBox="0 0 24 24"><path d="M7 13.5V4H4.5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1z"/><path d="M7 13.5l4 7a2 2 0 0 0 2.3-2.3l-.8-3.7h5.2a2 2 0 0 0 2-2.4l-1.3-6.4a2 2 0 0 0-2-1.7H7"/></svg>',
    speaker: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
    retry: '<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4.5v4h4"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
};

// links in answers open in a new tab, and the page they open can't reach back into rahah
if (window.DOMPurify) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A" && node.getAttribute("href") && !node.getAttribute("href").startsWith("#")) {
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
        }
    });
}

function escape_html(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// popup boxes ease out before they really close, so closing is as smooth as opening
// every close goes through here, cancel, done, escape or a click outside, and opening again mid close cancels it
const box_close_ms = 220;
const native_close = HTMLDialogElement.prototype.close;
const native_show_modal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.close = function (value) {
    if (!this.open || this.closing_timer || matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (!this.closing_timer) native_close.call(this, value);
        return;
    }
    this.classList.add("closing");
    this.closing_timer = setTimeout(() => {
        this.closing_timer = null;
        this.classList.remove("closing");
        native_close.call(this, value);
    }, box_close_ms);
};
HTMLDialogElement.prototype.showModal = function () {
    if (this.closing_timer) {
        clearTimeout(this.closing_timer);
        this.closing_timer = null;
        this.classList.remove("closing");
        if (this.open) return;
    }
    native_show_modal.call(this);
};
// opens a box unless it's already showing, and a box that's halfway through closing stays open instead
function open_box(dialog) {
    if (!dialog.open || dialog.closing_timer) dialog.showModal();
}

// escape closes a box the same smooth way
document.addEventListener("cancel", (event) => {
    if (!(event.target instanceof HTMLDialogElement)) return;
    event.preventDefault();
    event.target.close();
}, true);

// the rahah logo exactly as designed, the dark circle with its three chevrons
const logo_mark = '<img class="logo-img" src="/static/img/logo.svg" alt="" aria-hidden="true">';

// a student's picture, their photo, or the first letter of their name on a blue circle
function face_html(photo, name, extra = "") {
    if (photo) return `<img class="avatar-face ${extra}" src="${escape_html(photo)}" alt="" loading="lazy">`;
    return `<span class="account-avatar ${extra}" aria-hidden="true">${escape_html(String(name || "?").slice(0, 1).toUpperCase())}</span>`;
}

// pages draw straight away from what's saved, then the server's answer arrives. drawing again only when
// that answer is different keeps a page from flickering as its cards fade in a second time
const last_seen = {};
function changed(key, value) {
    const text = JSON.stringify(value);
    if (last_seen[key] === text) return false;
    last_seen[key] = text;
    return true;
}

// every error a student sees is one short sentence that says what to do, whatever went wrong

// what a status means, when the server didn't say more, like a proxy's own error page
const status_messages = {
    400: "That didn't work. Check it and try again.",
    401: "Sign in to keep going.",
    403: "You can't do that.",
    404: "That isn't here any more.",
    408: "That took too long. Try again.",
    413: "That's too big to send.",
    429: "Too many tries. Wait a moment, then try again.",
    500: "Something broke on our side. Try again.",
    502: "Rahah couldn't reach a service it needs. Try again soon.",
    503: "Rahah is busy or restarting. Try again in a minute.",
    504: "That took too long. Try again.",
};

function status_message(status) {
    return status_messages[status] || (status >= 500 ? status_messages[500] : status_messages[400]);
}

// an error with a message ready for a student
function plain_error(message, status = 0) {
    const error = new Error(message);
    error.friendly = true;
    error.status = status;
    return error;
}

function connection_error() {
    return plain_error(navigator.onLine === false
        ? "You're offline. Connect to the internet and try again."
        : "Couldn't reach Rahah. Check your connection and try again.");
}

// the browser's own errors, like a blocked camera, said plainly
const browser_errors = {
    NotAllowedError: "That was blocked. Allow it in your browser's settings and try again.",
    SecurityError: "That was blocked. Allow it in your browser's settings and try again.",
    NotFoundError: "No camera or microphone was found.",
    NotReadableError: "Your camera or microphone is busy in another app.",
    QuotaExceededError: "Your browser's storage is full. Free some space and try again.",
    NotSupportedError: "Your browser can't do that. Try another browser.",
    AbortError: "That was stopped.",
};

// what to show for any error: the server's own words, a plain line for the browser's, or a general one
function nice_error(error) {
    if (!error) return status_messages[500];
    if (error.friendly) return error.message;
    if (browser_errors[error.name]) return browser_errors[error.name];
    // a dropped connection shows up as a type error from fetch
    if (error.name === "TypeError" && /fetch|network|load failed/i.test(error.message || "")) return connection_error().message;
    // the page's own slips are never shown as they are
    if (["TypeError", "ReferenceError", "SyntaxError", "RangeError"].includes(error.name) || !error.message) {
        return "Something went wrong on this page. Refresh and try again.";
    }
    return error.message;
}

async function api(path, options = {}) {
    let response;
    try {
        response = await fetch(path, options);
    } catch (error) {
        // a stop button cancels on purpose, everything else here is the connection
        if (error.name === "AbortError") throw error;
        throw connection_error();
    }
    // a session that ran out or was signed out elsewhere goes back to the sign in screen
    if (response.status === 401 && !path.startsWith("/api/auth/") && typeof show_auth === "function") show_auth();
    if (!response.ok) {
        let detail = status_message(response.status);
        try {
            const body = await response.json();
            if (typeof body.detail === "string" && body.detail.trim()) detail = body.detail;
            // a list of form problems shows only the first, one thing to fix at a time
            else if (Array.isArray(body.detail) && body.detail[0]?.msg) detail = String(body.detail[0].msg).replace(/^Value error, /, "");
        } catch (e) {}
        // out of today's study limit: outside a chat, a card at the top offers the plans
        if (response.status === 429 && is_limit_message(detail) && !options.in_chat && typeof offer_upgrade === "function") offer_upgrade();
        throw plain_error(detail, response.status);
    }
    return response;
}

// anything that went wrong and wasn't caught where it happened shows in a small box at the top,
// once, so a student is never left wondering why nothing happened
let last_slip = { text: "", at: 0 };

function show_slip(error) {
    if (error?.name === "AbortError") return;
    const text = nice_error(error);
    // the same message twice in a few seconds is one problem
    if (text === last_slip.text && Date.now() - last_slip.at < 5000) return;
    last_slip = { text, at: Date.now() };
    const toasts = document.getElementById("toasts");
    if (!toasts || document.body.classList.contains("signed-out")) return;
    toasts.querySelector(".slip-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "toast slip-toast";
    toast.setAttribute("role", "alert");
    toast.innerHTML = `<div class="toast-text"><span>${escape_html(text)}</span></div>
        <div class="toast-actions"><button class="icon-btn" type="button" data-toast-close aria-label="Dismiss">${icons.close}</button></div>`;
    toasts.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
}

window.addEventListener("unhandledrejection", (event) => show_slip(event.reason));
window.addEventListener("error", (event) => {
    // a script or picture that failed to load isn't the student's problem
    if (event.error) show_slip(event.error);
});

function is_limit_message(text) {
    return /today's study limit/.test(text || "");
}

// the account tab, scrolled to the plans
function go_to_plans() {
    location.hash = "#/account";
    let tries = 0;
    const find = setInterval(() => {
        const plans = document.querySelector("#pro-slot .plans");
        if (plans || ++tries > 30) {
            clearInterval(find);
            plans?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }, 100);
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

// diagrams, rahah writes them as mermaid and the page draws them
// the library is big, so it loads only when an answer has a diagram, and each drawing goes in as an
// image, which can't run anything even if the diagram text was odd

let mermaid_ready = null;
function load_mermaid() {
    if (!mermaid_ready) {
        mermaid_ready = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js";
            // the browser refuses the file if it isn't exactly the one checked here
            script.integrity = "sha384-WmdflGW9aGfoBdHc4rRyWzYuAjEmDwMdGdiPNacbwfGKxBW/SO6guzuQ76qjnSlr";
            script.crossOrigin = "anonymous";
            script.onload = () => resolve(window.mermaid);
            script.onerror = () => {
                mermaid_ready = null;
                reject(new Error("diagrams couldn't load"));
            };
            document.head.appendChild(script);
        });
    }
    return mermaid_ready;
}

function diagram_theme() {
    const light = document.documentElement.getAttribute("data-theme") === "light"
        || (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: light)").matches);
    return light
        ? { primaryColor: "#e3eef8", primaryTextColor: "#0f2233", primaryBorderColor: "#2f7fb8", lineColor: "#4a6378", secondaryColor: "#eef3f8", tertiaryColor: "#f6f9fc", background: "#ffffff", fontFamily: "Inter, sans-serif" }
        : { primaryColor: "#123049", primaryTextColor: "#e8f1f8", primaryBorderColor: "#3b9edb", lineColor: "#8fb3cc", secondaryColor: "#0f2638", tertiaryColor: "#0b1b29", background: "#0a1622", fontFamily: "Inter, sans-serif" };
}

let diagram_count = 0;
async function draw_diagram(figure) {
    const source = figure.dataset.source;
    try {
        const mermaid = await load_mermaid();
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: diagram_theme(),
            flowchart: { htmlLabels: false, padding: 12 },
            themeCSS: ".node rect, .node polygon { rx: 8px; ry: 8px; } .label text, text { font-size: 14px; }",
        });
        const { svg } = await mermaid.render(`diagram-${++diagram_count}`, source);
        const image = new Image();
        image.alt = "Diagram";
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        figure.querySelector(".diagram-art").replaceChildren(image);
        figure.classList.remove("failed");
    } catch (error) {
        // anything that won't draw is shown as its text instead
        figure.classList.add("failed");
        figure.querySelector(".diagram-art").innerHTML = `<pre><code>${escape_html(source)}</code></pre>`;
        document.querySelectorAll("body > [id^='ddiagram-'], body > svg[id^='diagram-']").forEach((n) => n.remove());
    }
}

function make_diagrams(container) {
    container.querySelectorAll("pre code.language-mermaid").forEach((code) => {
        const figure = document.createElement("figure");
        figure.className = "diagram";
        figure.dataset.source = code.textContent.trim();
        code.parentElement.replaceWith(figure);
        if (state.settings.low_data && !window.mermaid) {
            figure.classList.add("waiting");
            figure.innerHTML = `<div class="diagram-art"><pre><code>${escape_html(figure.dataset.source)}</code></pre></div>
                <button class="btn btn-ghost btn-small" type="button" data-draw-diagram>Draw this diagram</button>`;
            return;
        }
        figure.innerHTML = `<div class="diagram-art"><span class="diagram-wait">Drawing the diagram…</span></div>`;
        draw_diagram(figure);
    });
}

thread.addEventListener("click", (event) => {
    const draw = event.target.closest("[data-draw-diagram]");
    if (!draw) return;
    const figure = draw.closest(".diagram");
    draw.remove();
    figure.classList.remove("waiting");
    draw_diagram(figure);
});

// a theme change redraws them in the new colours
function redraw_diagrams() {
    document.querySelectorAll(".diagram:not(.failed):not(.waiting)").forEach(draw_diagram);
}

function decorate_code(container) {
    make_diagrams(container);
    const can_run = state.code_modes.has(mode_select.value);
    container.querySelectorAll("pre code").forEach((code) => {
        if (code.closest(".diagram")) return;
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
