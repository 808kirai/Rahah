// rahah, the home page rows, the chats and tests page, the notes library, search and suggestions
// plain scripts with no build step, loaded in order and sharing one global scope

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
                <span class="card-meta"><span class="meta-what">${escape_html(mode_name(c.mode))}</span><span class="meta-when"><span class="meta-dot"> · </span>${time_ago(c.updated, true)}</span></span>
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
    rows.innerHTML = '<div id="home-suggestions"></div>' + Object.entries(sections).map(([group, html]) => `
        <section class="category">
            <h2 class="category-title">${escape_html(state.groups[group] || group)}</h2>
            ${html}
        </section>`).join("");
    render_continue();
    render_set_rows();
    render_performance_row();
    render_reminder_row();
    render_recommendations();
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
    input.placeholder = !mode || mode === "general" ? "Ask anything, or drop a PDF" : `Ask about ${mode_name(mode).toLowerCase()}`;
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
        focus_input();
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
    // the search also finds people, so it's always there
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
    // while searching, the found list covers chats, titles included
    const searching = words.length >= 2;
    const people = searching ? `<h2 class="section-title">People</h2>${people_html(people_search.found, people_search.words)}` : "";
    list.innerHTML = found_html(words) + tests_html + notes_html(words) + people + (searching ? "" : `<h2 class="section-title">Chats</h2>` + chats_html);
    if (words.length >= 2 && state.found_words !== words) search_chats(words);
    if (searching && people_search.words !== words) find_people(words, render_chats);
}

// the notes library, grouped by subject, each note ready to ask about, test on, make cards from or summarise

function size_text(bytes) {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function notes_html(words) {
    const notes = state.notes.filter((n) => !words || n.name.toLowerCase().includes(words));
    const head = `<div class="section-head"><h2 class="section-title">Notes</h2>
        <button class="btn btn-soft btn-small" type="button" data-notes-add>${icons.plus}Add notes</button></div>`;
    if (!state.notes.length) {
        return head + '<p class="page-note">Save class notes, slides and past papers here, then use them in any chat, test or deck.</p>';
    }
    if (!notes.length) return head + '<p class="page-note">No notes match that search.</p>';
    const groups = new Map();
    notes.forEach((n) => {
        if (!groups.has(n.mode)) groups.set(n.mode, []);
        groups.get(n.mode).push(n);
    });
    const row = (n) => `<li class="note-row">
        <span class="note-icon">${n.kind === "image" ? icons.image : icons.doc}</span>
        <span class="note-text"><strong>${escape_html(n.name)}</strong><small>${size_text(n.size)} · ${time_ago(n.created, true)}</small></span>
        <span class="note-actions">
            <button class="btn btn-ghost btn-small" type="button" data-note-use="ask" data-note="${n.id}">${icons.chat}Ask</button>
            <button class="btn btn-ghost btn-small" type="button" data-note-use="quiz" data-note="${n.id}">${icons.quiz}Test</button>
            <button class="btn btn-ghost btn-small" type="button" data-note-use="flashcards" data-note="${n.id}">${icons.cards}Cards</button>
            <button class="btn btn-ghost btn-small" type="button" data-note-use="summary" data-note="${n.id}">${icons.summary}Summary</button>
            <button class="icon-btn" type="button" data-note-remove="${n.id}" aria-label="Remove ${escape_html(n.name)}" title="Remove">${icons.trash}</button>
        </span>
    </li>`;
    return head + [...groups].map(([mode, items]) => `
        <h3 class="group-title">${escape_html(mode_name(mode))}</h3>
        <ul class="note-list">${items.map(row).join("")}</ul>`).join("");
}

async function load_notes() {
    try {
        state.notes = (await (await api("/api/notes")).json()).notes;
    } catch (error) {
        state.notes = state.notes || [];
        return;
    }
    el("notes-option").hidden = !state.notes.length;
    if (changed("notes", state.notes)) render_chats();
}

// adding notes, each file uploads once and shows how it went
const notes_sheet = el("notes-sheet");

function open_notes_sheet(mode) {
    el("notes-mode").innerHTML = mode_options_html();
    el("notes-mode").value = mode || mode_select.value || state.default_mode;
    el("notes-progress").innerHTML = "";
    el("notes-error").hidden = true;
    notes_sheet.showModal();
    el("notes-choose").focus();
}

el("notes-choose").addEventListener("click", () => el("notes-file-input").click());
el("notes-close").addEventListener("click", () => notes_sheet.close());
el("notes-cancel").addEventListener("click", () => notes_sheet.close());
el("notes-file-input").addEventListener("change", async () => {
    const files = [...el("notes-file-input").files];
    el("notes-file-input").value = "";
    const mode = el("notes-mode").value;
    const progress = el("notes-progress");
    let failed = 0;
    for (const file of files) {
        const pill = document.createElement("span");
        pill.className = "file-pill";
        pill.innerHTML = `${/\.(png|jpe?g|webp|gif)$/i.test(file.name) ? icons.image : icons.doc}<span>${escape_html(file.name)} · uploading</span>`;
        progress.appendChild(pill);
        const form = new FormData();
        form.append("mode", mode);
        form.append("file", file);
        try {
            await api("/api/notes", { method: "POST", body: form });
            pill.querySelector("span").textContent = `${file.name} · saved`;
        } catch (error) {
            failed += 1;
            pill.classList.add("failed");
            pill.querySelector("span").textContent = `${file.name} · ${error.message}`;
        }
    }
    await load_notes();
    // everything saved closes the box, anything that failed stays on show with its reason
    if (!failed && notes_sheet.open) notes_sheet.close();
});

async function remove_note(id) {
    const note = state.notes.find((n) => n.id === id);
    if (!note || !confirm(`Remove ${note.name} from your notes? Chats that used it keep their answers.`)) return;
    try {
        await api(`/api/notes/${id}`, { method: "DELETE" });
    } catch (error) {
        return;
    }
    load_notes();
}

thread.addEventListener("click", (event) => {
    if (event.target.closest("[data-notes-add]")) open_notes_sheet();
    const remove = event.target.closest("[data-note-remove]");
    if (remove) remove_note(remove.dataset.noteRemove);
    const use = event.target.closest("[data-note-use]");
    if (use) {
        const note = state.notes.find((n) => n.id === use.dataset.note);
        if (note) open_sheet(use.dataset.noteUse, note.mode, "", { notes: [note] });
    }
});

// from the + menu, a note goes into the message box like an attached file
function show_notes_picker() {
    const here = mode_select.value;
    const notes = [...state.notes].sort((a, b) => (b.mode === here) - (a.mode === here));
    el("detail-title").textContent = "Your notes";
    el("detail-body").innerHTML = `
        <p class="detail-sub">Choose notes to ask about. They're added to your message.</p>
        <ul class="detail-list">${notes.map((n) => `<li class="pick-row" tabindex="0" role="button" data-attach-note="${n.id}">
            <span class="detail-name">${escape_html(n.name)}</span><span>${escape_html(mode_name(n.mode))}</span>
        </li>`).join("")}</ul>
        <div class="sheet-actions">
            <button class="btn btn-ghost" type="button" data-detail-close>Close</button>
        </div>`;
    open_box(detail_sheet);
}

function attach_note(id) {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    if (!state.pending.some((f) => f.note && f.id === id)) {
        state.pending.push({ key: ++file_key, id: note.id, name: note.name, kind: note.kind, status: "ready", note: true });
        render_attachments();
        update_send_button();
    }
    detail_sheet.close();
    focus_input();
}

el("detail-sheet").addEventListener("click", (event) => {
    const row = event.target.closest("[data-attach-note]");
    if (row) attach_note(row.dataset.attachNote);
});
el("detail-sheet").addEventListener("keydown", (event) => {
    const row = event.target.closest("[data-attach-note]");
    if (row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        attach_note(row.dataset.attachNote);
    }
});

// words found inside any chat, older ones too, each with the bit that matched
function found_html(words) {
    if (words.length < 2) return "";
    if (state.found_words !== words || !state.found) return '<p class="page-note">Searching inside your chats…</p>';
    if (!state.found.length) return '<p class="page-note">Nothing inside your chats matches that.</p>';
    const mark = (text) => {
        const safe = escape_html(text);
        const at = safe.toLowerCase().indexOf(escape_html(words).toLowerCase());
        if (at < 0) return safe;
        const len = escape_html(words).length;
        return `${safe.slice(0, at)}<mark>${safe.slice(at, at + len)}</mark>${safe.slice(at + len)}`;
    };
    return `<h2 class="section-title">Found in your chats</h2>
        <ul class="found-list">${state.found.map((r) => `<li><a href="#/c/${r.id}">
            <strong>${mark(r.title)}</strong>
            <span class="found-snippet">${mark(r.snippet)}</span>
            <span class="found-meta">${escape_html(mode_name(r.mode))} · ${time_ago(r.updated, true)}</span>
        </a></li>`).join("")}</ul>`;
}

let search_timer = 0;
function search_chats(words) {
    clearTimeout(search_timer);
    state.found_words = words;
    state.found = null;
    search_timer = setTimeout(async () => {
        try {
            const results = (await (await api(`/api/search?q=${encodeURIComponent(words)}`)).json()).results;
            if (state.found_words !== words) return;
            state.found = results;
        } catch (error) {
            state.found = [];
        }
        if (el("chat-groups")) render_chats();
    }, 250);
}

function show_chats() {
    if (state.busy) return;
    enter_page("#/chats", "Chats & Tests", `<div class="list-page" id="chats">
        <div class="page-tools">
            <input class="search" id="chat-search" type="search" placeholder="Search chats, tests and people" aria-label="Search chats, tests and people">
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

// suggestions from claude based on what the student has studied

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

// suggestions sit near the top of home, picked by claude from what the student has studied
function render_recommendations() {
    const slot = el("home-suggestions");
    if (!slot) return;
    const recs = state.recs;
    // nothing shows until there's something to go on
    if (!recs || !recs.has_activity) {
        slot.innerHTML = "";
        return;
    }
    const refresh = `<button class="btn btn-ghost btn-small rec-refresh" type="button" data-refresh-recs ${state.recs_loading ? "disabled" : ""}>
        ${state.recs_loading ? "Finding new picks…" : `${icons.retry}Refresh`}</button>`;
    let body;
    if (recs.items.length) {
        body = `<section class="row">
            <h3 class="row-title">Picked from your chats, decks and scores${recs.created && !state.recs_loading ? ` · ${time_ago(recs.created, true)}` : ""}</h3>
            <button class="row-arrow prev" type="button" aria-label="Scroll suggestions left">${icons.prev}</button>
            <div class="row-track">${recs.items.slice(0, 5).map((item, i) => rec_card(item, i)).join("")}</div>
            <button class="row-arrow next" type="button" aria-label="Scroll suggestions right">${icons.next}</button>
        </section>`;
    } else {
        body = `<p class="page-note">${state.recs_loading ? "Looking through what you've studied…" : escape_html(state.recs_error || "Tap Refresh for ideas on what to study next.")}</p>`;
    }
    slot.innerHTML = `<section class="category">
        <div class="category-head"><h2 class="category-title">Suggested for you</h2>${refresh}</div>
        ${body}
    </section>`;
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
    if (changed("recs", [state.recs, state.recs_error])) render_recommendations();
    // new picks are asked for when there are none, or when something new was studied and the last ones are half a day old
    const stale = !state.recs.created || Date.now() / 1000 - state.recs.created > 12 * 3600;
    if (state.recs.has_activity && !state.recs.fresh && !state.recs_error && (!state.recs.items.length || stale)) make_recommendations();
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
