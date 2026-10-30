// rahah, study tools, the tool sheet and subject pickers, flashcards and tests
// plain scripts with no build step, loaded in order and sharing one global scope

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
const sheet_state = { tool: "flashcards", files: [], notes: [], pick: 10, style: "choice", opened: 0 };
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
    save_sets_for_offline();
}

// offline studying, the service worker keeps each deck and test it sees, so every one is fetched once
// after it changes, which saves it for when there's no internet. low-data mode only keeps what's opened

async function save_sets_for_offline() {
    if (!navigator.onLine || state.settings.low_data || !navigator.serviceWorker?.controller) return;
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem("rahah-offline-sets") || "{}");
    } catch (e) {}
    const kept = {};
    for (const s of state.sets) {
        if (saved[s.id] === s.updated) {
            kept[s.id] = s.updated;
            continue;
        }
        try {
            await fetch(`/api/sets/${s.id}`);
            kept[s.id] = s.updated;
        } catch (error) {
            break;
        }
    }
    try {
        localStorage.setItem("rahah-offline-sets", JSON.stringify(kept));
    } catch (e) {}
}

// card ratings and scores made offline wait here and are sent once the internet is back
function queue_post(path, body) {
    try {
        const queue = JSON.parse(localStorage.getItem("rahah-queue") || "[]");
        queue.push({ path, body });
        localStorage.setItem("rahah-queue", JSON.stringify(queue.slice(-500)));
    } catch (e) {}
}

let sending_queue = false;
async function send_queue() {
    if (sending_queue || !navigator.onLine) return;
    let queue = [];
    try {
        queue = JSON.parse(localStorage.getItem("rahah-queue") || "[]");
    } catch (e) {}
    if (!queue.length) return;
    sending_queue = true;
    while (queue.length) {
        const item = queue[0];
        try {
            await fetch(item.path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
        } catch (error) {
            break; // still offline, the rest waits
        }
        // anything the server turned down, like a deleted deck, is dropped too
        queue.shift();
        try {
            localStorage.setItem("rahah-queue", JSON.stringify(queue));
        } catch (e) {}
    }
    sending_queue = false;
    if (!queue.length) {
        load_sets();
        load_performance();
    }
}

const offline_error = (error) => !navigator.onLine || error instanceof TypeError;

function show_net_status() {
    const status = el("net-status");
    status.hidden = navigator.onLine;
    status.textContent = "You're offline. Decks and tests you've opened still work, and your progress saves when you're back.";
}

window.addEventListener("offline", show_net_status);
window.addEventListener("online", () => {
    show_net_status();
    send_queue();
});

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
        menu.classList.remove("up", "narrow");
        menu.style.maxWidth = "";
        menu.style.maxHeight = "";
        menu.hidden = false;
        button.setAttribute("aria-expanded", "true");
        const sheet = box.closest("dialog");
        const bounds = sheet ? sheet.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
        // a menu inside a sheet stays inside it, the sheet would cut off anything past its edges
        const edge = { left: bounds.left + 12, right: bounds.right - 12 };
        const placed = menu.getBoundingClientRect();
        if (placed.right > edge.right || placed.left < edge.left) {
            const room = placed.right > edge.right ? edge.right - Math.max(placed.left, edge.left) : placed.right - edge.left;
            menu.style.maxWidth = `${Math.max(room, 200)}px`;
            // too narrow for two columns of subjects, so they stack in one
            if (room < 360) menu.classList.add("narrow");
        }
        // open upwards when there's more room above, inside a sheet or near the bottom of the window
        const spot = button.getBoundingClientRect();
        const room_below = bounds.bottom - spot.bottom;
        const room_above = spot.top - bounds.top;
        const up = menu.offsetHeight + 16 > room_below && room_above > room_below;
        if (up) menu.classList.add("up");
        // never taller than the space on its side, so the top or bottom row isn't cut off by the sheet
        menu.style.maxHeight = `${Math.max((up ? room_above : room_below) - 20, 160)}px`;
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
make_picker(el("notes-mode"));

function show_sheet_error(text) {
    el("sheet-error").textContent = text;
    el("sheet-error").hidden = !text;
}

function render_sheet_files() {
    el("sheet-files").innerHTML = sheet_state.files.map((file, i) => `
        <span class="file-pill">${/\.(png|jpe?g|webp|gif)$/i.test(file.name) ? icons.image : icons.doc}<span>${escape_html(file.name)}</span>
            <button type="button" data-sheet-remove="${i}" aria-label="Remove ${escape_html(file.name)}">${icons.close}</button>
        </span>`).join("") + sheet_state.notes.map((note) => `
        <span class="file-pill note-pill">${note.kind === "image" ? icons.image : icons.doc}<span>${escape_html(note.name)}</span>
            <button type="button" data-sheet-unnote="${note.id}" aria-label="Remove ${escape_html(note.name)}">${icons.close}</button>
        </span>`).join("");
    el("sheet-from-notes").hidden = !state.notes.length;
    const list = el("sheet-note-list");
    if (!list.hidden) {
        const mode = el("sheet-mode").value;
        const notes = [...state.notes].sort((a, b) => (b.mode === mode) - (a.mode === mode));
        list.innerHTML = notes.map((n) => {
            const on = sheet_state.notes.some((p) => p.id === n.id);
            return `<button class="choice" type="button" data-sheet-note="${n.id}" aria-pressed="${on}">${escape_html(n.name)}</button>`;
        }).join("");
    }
}

// files and notes together, at most five
const sheet_count = () => sheet_state.files.length + sheet_state.notes.length;

el("sheet-from-notes").addEventListener("click", () => {
    const list = el("sheet-note-list");
    list.hidden = !list.hidden;
    el("sheet-from-notes").setAttribute("aria-expanded", String(!list.hidden));
    render_sheet_files();
});
el("sheet-note-list").addEventListener("click", (event) => {
    const pick = event.target.closest("[data-sheet-note]");
    if (!pick) return;
    const id = pick.dataset.sheetNote;
    if (sheet_state.notes.some((n) => n.id === id)) {
        sheet_state.notes = sheet_state.notes.filter((n) => n.id !== id);
    } else if (sheet_count() < 5) {
        sheet_state.notes.push(state.notes.find((n) => n.id === id));
    }
    render_sheet_files();
});

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
    sheet_state.notes = options.notes || [];
    el("sheet-note-list").hidden = true;
    el("sheet-from-notes").setAttribute("aria-expanded", "false");
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
    sheet_state.files = [...sheet_state.files, ...el("sheet-file-input").files].slice(0, 5 - sheet_state.notes.length);
    el("sheet-file-input").value = "";
    render_sheet_files();
});
el("sheet-files").addEventListener("click", (event) => {
    const unnote = event.target.closest("[data-sheet-unnote]");
    if (unnote) {
        sheet_state.notes = sheet_state.notes.filter((n) => n.id !== unnote.dataset.sheetUnnote);
        render_sheet_files();
    }
    const remove = event.target.closest("[data-sheet-remove]");
    if (!remove) return;
    sheet_state.files.splice(Number(remove.dataset.sheetRemove), 1);
    render_sheet_files();
});
el("sheet-close").addEventListener("click", () => sheet.close());
el("sheet-cancel").addEventListener("click", () => sheet.close());

// a question from the sheet goes into the open chat, or starts one from the home page
function pend_notes(notes) {
    notes.forEach((note) => {
        if (!state.pending.some((f) => f.note && f.id === note.id)) {
            state.pending.push({ key: ++file_key, id: note.id, name: note.name, kind: note.kind, status: "ready", note: true });
        }
    });
    render_attachments();
}

async function run_ask(question, mode) {
    const files = [...sheet_state.files];
    const notes = [...sheet_state.notes];
    sheet.close();
    pend_notes(notes);
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
    const notes = [...sheet_state.notes];
    const what = files.length || notes.length
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
    pend_notes(notes);
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
    if (!topic && !sheet_count()) {
        show_sheet_error("Write a topic or add some notes first.");
        return;
    }
    if (sheet_state.tool === "quiz" && sheet_state.style === "paper" && !sheet_count()) {
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
    if (state.settings.language) form.append("language", state.settings.language);
    sheet_state.files.forEach((file) => form.append("files", file));
    sheet_state.notes.forEach((note) => form.append("note_ids", note.id));
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
                <button class="btn btn-ghost btn-small" type="button" data-print-set>${icons.printer}Print or save as PDF</button>
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
        // the rating still counts for this session if it couldn't be saved, and offline it's sent later
        s.progress[at] = known ? Math.min(Math.max(s.progress[at] || 0, 1) + 1, 5) : 1;
        if (offline_error(error)) queue_post(`/api/sets/${s.set.id}/cards`, { card: at, known });
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
            <div class="study-extra">
                <button class="btn btn-ghost btn-small" type="button" data-print-set>${icons.printer}Print or save as PDF</button>
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
    } catch (error) {
        if (offline_error(error)) queue_post(`/api/sets/${s.set.id}/score`, { score: s.score });
    }
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
                <button class="btn btn-ghost btn-small" type="button" data-print-set>${icons.printer}Print or save as PDF</button>
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
    if (target.closest("[data-print-set]")) print_set(state.study.set);
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
