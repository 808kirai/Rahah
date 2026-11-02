// rahah, the chat, messages, sending and streaming answers, read aloud, voice chat, printing, attachments, photos, hint mode, the model and language menu and voice typing
// plain scripts with no build step, loaded in order and sharing one global scope

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
    message_el.innerHTML = `<p class="label"><span class="logo" aria-hidden="true">${logo_mark}</span>Rahah</p><div class="answer"></div>`;
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
    if (text.includes("Rahah Pro gives you")) {
        note.insertAdjacentHTML("beforeend", ' <a class="support-link" href="#/account">Get Rahah Pro</a>');
    }
    message_el.appendChild(note);
}

// home, chats, reminders, performance and account are pages, a deck or quiz is a study view, anything else in the thread is a chat

const page_titles = { home: "Home", chats: "Chats & Tests", reminders: "Reminders and Timetable", performance: "Performance", account: "Account", admin: "Students", leaderboard: "Leaderboard" };

function current_view() {
    if (el("welcome")) return "home";
    if (el("chats")) return "chats";
    if (el("reminders")) return "reminders";
    if (el("performance")) return "performance";
    if (el("account")) return "account";
    if (el("admin")) return "admin";
    if (el("leaderboard")) return "leaderboard";
    if (el("study") || el("shared")) return "study";
    return "chat";
}

// a new page eases in, a fade and a small lift, whenever what's shown changes
let shown_view = "";
// a new page fades and lifts in, starting partly shown so there's no blank moment between pages.
// it's laid on top of each part's own fade in, so when it ends nothing starts over and blinks
function ease_in_view() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const part of thread.children) {
        part.animate(
            [{ opacity: 0.45, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
            { duration: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
    }
}

function sync_view() {
    const view = current_view();
    if (view !== shown_view) {
        shown_view = view;
        ease_in_view();
    }
    document.body.classList.toggle("is-home", view === "home");
    document.body.classList.toggle("is-chats", view === "chats");
    document.body.classList.toggle("is-account", view === "account" || view === "admin");
    document.body.classList.toggle("is-reminders", view === "reminders");
    document.body.classList.toggle("is-performance", view === "performance");
    document.body.classList.toggle("is-study", view === "study");
    document.body.classList.toggle("is-leaderboard", view === "leaderboard");
    document.body.classList.toggle("is-page", view in page_titles);
    el("page-title").textContent = page_titles[view] || "Home";
    sync_nav_line();
    place_composer(view);
}

// on a phone the message box sits at the top of home and chats and tests, under the top bar,
// and goes back down above the tabs everywhere else, like in a chat where replies are typed
const phone_screen = matchMedia("(max-width: 720px)");
function place_composer(view = current_view()) {
    const box = el("composer");
    const up = phone_screen.matches && (view === "home" || view === "chats");
    const home = up ? el("top-composer") : document.querySelector(".dock");
    if (box.parentElement !== home) home.appendChild(box);
    document.body.classList.toggle("composer-up", up);
}
phone_screen.addEventListener("change", () => place_composer());

function leave_home() {
    if (current_view() === "chat") return;
    ["welcome", "chats", "reminders", "performance", "account", "admin", "study"].forEach((id) => el(id)?.remove());
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
    if (changed("today", state.today)) render_today();
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
                reply.message_id = event.v.id;
                reply.rating = 0;
                show_tier(reply, event.v.tier);
                finished = true;
                saved = true;
                if (frame) cancelAnimationFrame(frame);
                paint();
                if (event.v.truncated) add_notice(reply, "This answer got cut off. Ask Rahah to continue.");
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
                body: JSON.stringify({
                    text,
                    mode: mode_select.value,
                    file_ids: sent_files.filter((f) => !f.note).map((f) => f.id),
                    note_ids: sent_files.filter((f) => f.note).map((f) => f.id),
                    hints: Boolean(state.hints),
                    voice: talk.on,
                    ...settings_body(),
                }),
                signal,
            });
        }, give_back, again);
    } finally {
        state.busy = false;
        update_send_button();
        load_history();
        if (saved && el("chat-title").textContent === "New chat") set_title(text.slice(0, 60));
        offer_retry();
        focus_input();
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
        <button class="btn btn-ghost btn-small" type="button" data-answer-action="flashcards">${icons.cards}Flashcards</button>
        ${reply.message_id ? `<span class="rate-answer">
            <button class="icon-btn" type="button" data-print-answer aria-label="Print or save as PDF" title="Print or save as PDF">${icons.printer}</button>
            <button class="icon-btn" type="button" data-rate="1" aria-pressed="${reply.rating === 1}" aria-label="Helpful" title="Helpful">${icons.thumb_up}</button>
            <button class="icon-btn" type="button" data-rate="-1" aria-pressed="${reply.rating === -1}" aria-label="Not helpful" title="Not helpful">${icons.thumb_down}</button>
        </span>` : ""}`;
    reply.appendChild(row);
    return row;
}

// reading an answer aloud with the device's own voice, free and offline
const can_speak = "speechSynthesis" in window;
const reader = { reply: null };

// what gets read, the words without markdown, citation marks or code, and simple maths said in words
function speech_text(raw) {
    return String(raw || "")
        .replace(/```mermaid[\s\S]*?```/g, " (diagram shown on screen) ")
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
    if (talk.on && talk.phase === "speaking") listen_turn();
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

function read_aloud(reply, after = () => {}) {
    if (!can_speak || !reply) return;
    if (reader.reply === reply) {
        stop_reading();
        return;
    }
    stop_reading();
    const text = speech_text(reply.raw_text);
    if (!text) return after();
    reader.reply = reply;
    set_listen_label(reply, true);
    speak(text, () => {
        if (reader.reply === reply) {
            set_listen_label(reply, false);
            reader.reply = null;
            after();
        }
    });
}

// voice chat, rahah listens, answers, reads the answer aloud, then listens again until it's ended
// a few quiet turns in a row end it too, so the microphone isn't left on

const talk = { on: false, phase: "", rec: null, quiet: 0 };
const talk_phases = { listening: "Listening", thinking: "Thinking", speaking: "Speaking" };

function set_talk_phase(phase) {
    talk.phase = phase;
    render_composer_chips();
}

function start_talk() {
    if (state.busy) return;
    stop_voice(true);
    stop_reading();
    talk.on = true;
    talk.quiet = 0;
    listen_turn();
}

function stop_talk(reason = "") {
    talk.on = false;
    talk.phase = "";
    const rec = talk.rec;
    talk.rec = null;
    if (rec) rec.abort();
    stop_reading();
    render_composer_chips();
    if (reason) composer_hint(reason);
}

function listen_turn() {
    const Engine = speech_engine();
    if (!talk.on || !Engine) return;
    const rec = new Engine();
    // in a voice chat the student speaks the language rahah answers in
    rec.lang = state.answer_lang_code || navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let heard = "";
    let error = "";
    rec.onresult = (event) => {
        if (talk.rec !== rec) return;
        heard = [...event.results].map((r) => r[0].transcript).join(" ").trim();
        input.value = heard;
        resize_input();
    };
    rec.onerror = (event) => {
        error = event.error;
    };
    rec.onend = async () => {
        if (talk.rec !== rec) return;
        talk.rec = null;
        if (!talk.on) return;
        if (voice_errors[error]) return stop_talk(voice_errors[error]);
        if (!heard) {
            talk.quiet += 1;
            if (talk.quiet >= 3) return stop_talk("Voice chat ended, Rahah didn't hear anything.");
            return listen_turn();
        }
        talk.quiet = 0;
        set_talk_phase("thinking");
        await send_message(heard);
        if (!talk.on) return;
        const replies = thread.querySelectorAll(".message.assistant.answered");
        const reply = replies[replies.length - 1];
        if (!reply) return listen_turn();
        // reading starts before the phase changes, since starting a reading first stops any other
        read_aloud(reply, () => talk.on && listen_turn());
        if (talk.on && talk.phase === "thinking" && reader.reply === reply) set_talk_phase("speaking");
    };
    talk.rec = rec;
    try {
        rec.start();
        set_talk_phase("listening");
    } catch (e) {
        talk.rec = null;
        stop_talk("Voice chat couldn't start. Try again.");
    }
}

// leaving the chat ends a voice chat
window.addEventListener("hashchange", () => {
    if (talk.on) stop_talk();
});

// thumbs up or down, the same one again clears it
async function rate_answer(reply, rating) {
    if (!reply?.message_id) return;
    const next = reply.rating === rating ? 0 : rating;
    try {
        await api(`/api/messages/${reply.message_id}/rating`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rating: next }),
        });
    } catch (error) {
        return;
    }
    reply.rating = next;
    reply.querySelectorAll("[data-rate]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.rate) === next)));
}

// printing, or saving as pdf from the same dialog, a plain page made just for paper

function print_page(title, body) {
    const area = el("print-area");
    area.innerHTML = `<header class="print-head"><strong>${escape_html(title)}</strong><span>Rahah · ${new Date().toLocaleDateString()}</span></header>${body}`;
    document.body.classList.add("printing");
    const done = () => {
        document.body.classList.remove("printing");
        area.innerHTML = "";
        window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
}

function print_set(s) {
    if (s.kind === "flashcards") {
        print_page(s.title, `<ol class="print-cards">${s.items.map((c) => `
            <li><div class="answer">${render_markdown(c.front)}</div><div class="answer print-back">${render_markdown(c.back)}</div></li>`).join("")}</ol>`);
        return;
    }
    const marks = s.items.reduce((sum, q) => sum + question_marks(q), 0);
    const questions = s.items.map((q, i) => `<li class="print-q">
        <div class="answer">${render_markdown(q.question)}</div>
        <p class="print-marks">${plural(question_marks(q), "mark")}</p>
        ${is_written(q)
            ? `<div class="print-lines">${"<span></span>".repeat(Math.min(3 + q.marks * 2, 16))}</div>`
            : `<ol class="print-options">${q.options.map((o) => `<li>${inline_markdown(o)}</li>`).join("")}</ol>`}
    </li>`).join("");
    const key = s.items.map((q, i) => `<li class="print-q">
        ${is_written(q)
            ? `<div class="answer">${render_markdown(q.model_answer)}</div><p class="print-marks">Mark scheme</p><div class="answer">${render_markdown(q.mark_scheme)}</div>`
            : `<p><strong>${"ABCDEF"[q.answer]}.</strong> ${inline_markdown(q.options[q.answer])}</p>${q.explanation ? `<div class="answer">${render_markdown(q.explanation)}</div>` : ""}`}
    </li>`).join("");
    print_page(s.title, `<p class="print-sub">${plural(s.items.length, "question")} · ${plural(marks, "mark")}</p>
        <ol class="print-questions">${questions}</ol>
        <section class="print-key"><h2>Answers</h2><ol class="print-questions">${key}</ol></section>`);
}

function print_answer(reply) {
    if (!reply) return;
    const question = reply.previousElementSibling?.querySelector(".bubble")?.textContent || "";
    const answer = reply.querySelector(".answer").innerHTML;
    const sources = reply.querySelector(".sources")?.outerHTML || "";
    print_page(question.slice(0, 80) || "Rahah's answer", `${question ? `<p class="print-question">${escape_html(question)}</p>` : ""}<div class="answer">${answer}</div>${sources}`);
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
            body: JSON.stringify({ mode: mode_select.value, hints: Boolean(state.hints), ...settings_body() }),
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
    if (event.target.closest("[data-print-answer]")) print_answer(event.target.closest(".message"));
    const thumb = event.target.closest("[data-rate]");
    if (thumb) rate_answer(thumb.closest(".message"), Number(thumb.dataset.rate));
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
// low-data mode sends smaller photos, still clear enough for handwriting
const photo_edge_full = 1600;
const photo_edge_low = 1024;
const photo_edge_now = () => (state.settings.low_data ? photo_edge_low : photo_edge_full);

function photo_name() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `photo-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.jpg`;
}

function canvas_to_file(canvas, name) {
    const quality = state.settings.low_data ? 0.75 : 0.9;
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], name, { type: "image/jpeg" }) : null), "image/jpeg", quality));
}

function draw_scaled(source, width, height) {
    const scale = Math.min(1, photo_edge_now() / Math.max(width, height));
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
        const big = Math.max(bitmap.width, bitmap.height) > photo_edge_now() || file.size > (state.settings.low_data ? 1 : 4) * 1024 * 1024;
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

// hint mode, rahah guides with hints and questions instead of giving the answer, remembered on this device

function set_hint_mode(on) {
    state.hints = on;
    try {
        localStorage.setItem("rahah-hints", on ? "1" : "");
    } catch (e) {}
    el("hints-option").setAttribute("aria-checked", String(on));
    el("hints-option").classList.toggle("on", on);
    render_composer_chips();
}

function render_composer_chips() {
    const chip = (label, off, name) => `<span class="composer-chip">${label}<button type="button" ${off} aria-label="Turn ${name} off" title="Turn off">${icons.close}</button></span>`;
    el("composer-chips").innerHTML = [
        state.hints ? chip("Hint mode", "data-hints-off", "hint mode") : "",
        state.settings.language ? chip(`In ${escape_html(state.settings.language)}`, "data-lang-off", "the answer language") : "",
        state.settings.low_data ? chip("Low data", "data-low-data-off", "low-data mode") : "",
        talk.on ? `<span class="composer-chip talk-chip"><span class="talk-dot" aria-hidden="true"></span>Voice chat · ${talk_phases[talk.phase] || "On"}<button type="button" data-talk-off aria-label="End voice chat" title="End">${icons.close}</button></span>` : "",
    ].join("");
}

el("composer-chips").addEventListener("click", (event) => {
    if (event.target.closest("[data-hints-off]")) set_hint_mode(false);
    if (event.target.closest("[data-lang-off]")) save_settings({ language: "" });
    if (event.target.closest("[data-low-data-off]")) save_settings({ low_data: false });
    if (event.target.closest("[data-talk-off]")) stop_talk();
});

// the model picker, auto or a name for each model, saved with the account like the other settings

const tier_names = { acolyte: "Acolyte", mage: "Mage", archmage: "Archmage" };

function model_choices() {
    return state.me?.models?.length ? state.me.models : [{ id: "auto", name: "Auto", word: "Rahah picks", hint: "Rahah picks" }];
}

// a choice that's no longer offered, like archmage for someone who stopped being admin, goes back to auto
function model_choice() {
    const choice = state.settings?.model || "auto";
    return model_choices().some((c) => c.id === choice) ? choice : "auto";
}

function render_model_pick() {
    const current = model_choices().find((c) => c.id === model_choice());
    el("model-pick-name").textContent = current.name;
    el("model-pick-word").textContent = current.word || "";
    el("model-pick").title = current.hint;
}

function open_model_menu() {
    const menu = el("model-menu");
    menu.classList.remove("lang-list");
    menu.innerHTML = model_choices().map((c) => `
        <button type="button" class="input-option model-option" role="menuitemradio" aria-checked="${c.id === model_choice()}" data-model="${escape_html(c.id)}">
            <span><strong>${escape_html(c.name)}</strong><small>${escape_html(c.hint)}</small></span>
            ${c.id === model_choice() ? icons.check : ""}
        </button>`).join("") + `
        <div class="menu-line" role="separator"></div>
        <button type="button" class="input-option model-option lang-row" role="menuitem" data-lang-open>
            <span><strong>Answer in</strong><small>Answers, tests, decks and Listen</small></span>
            <span class="lang-now">${escape_html(state.settings.language || "Language")}${icons.next}</span>
        </button>`;
    menu.hidden = false;
    el("model-pick").setAttribute("aria-expanded", "true");
    (menu.querySelector('[aria-checked="true"]') || menu.querySelector(".model-option"))?.focus();
}

// every answer language, in the same menu, with a way back to the models
function open_language_list() {
    const menu = el("model-menu");
    const langs = [["", "Match my question"], ...Object.keys(state.languages).map((name) => [name, name])];
    menu.classList.add("lang-list");
    menu.innerHTML = `
        <button type="button" class="input-option model-option lang-back" data-lang-back>${icons.prev}<span><strong>Answer in</strong></span></button>
        <div class="menu-line" role="separator"></div>
        <div class="lang-options">${langs.map(([value, label]) => `
            <button type="button" class="input-option model-option" role="menuitemradio" aria-checked="${value === state.settings.language}" data-lang="${escape_html(value)}">
                <span><strong>${escape_html(label)}</strong></span>${value === state.settings.language ? icons.check : ""}
            </button>`).join("")}</div>`;
    (menu.querySelector('[data-lang][aria-checked="true"]') || menu.querySelector("[data-lang]"))?.focus();
}

function close_model_menu(refocus = false) {
    const menu = el("model-menu");
    if (menu.hidden) return;
    menu.hidden = true;
    el("model-pick").setAttribute("aria-expanded", "false");
    if (refocus) el("model-pick").focus();
}

el("model-pick").addEventListener("click", () => (el("model-menu").hidden ? open_model_menu() : close_model_menu()));
el("model-menu").addEventListener("click", (event) => {
    if (event.target.closest(".model-locked")) {
        close_model_menu();
        return;
    }
    if (event.target.closest("[data-lang-open]")) {
        open_language_list();
        return;
    }
    if (event.target.closest("[data-lang-back]")) {
        open_model_menu();
        return;
    }
    const lang = event.target.closest("[data-lang]");
    if (lang) {
        save_settings({ language: lang.dataset.lang });
        close_model_menu(true);
        return;
    }
    const option = event.target.closest("[data-model]");
    if (!option) return;
    save_settings({ model: option.dataset.model });
    close_model_menu(true);
});
el("model-menu").addEventListener("keydown", (event) => {
    const options = [...el("model-menu").querySelectorAll(".model-option")];
    const at = options.indexOf(document.activeElement);
    if (event.key === "Escape") {
        event.preventDefault();
        close_model_menu(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        options[(at + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
    } else if (event.key === "Tab") {
        close_model_menu();
    }
});
document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".model-tools")) close_model_menu();
});

// the name of the model that wrote an answer, beside rahah's own name
function show_tier(reply, tier) {
    const label = reply?.querySelector(".label");
    if (!label || !tier_names[tier]) return;
    let tag = label.querySelector(".tier-tag");
    if (!tag) {
        tag = document.createElement("span");
        tag.className = "tier-tag";
        label.appendChild(tag);
    }
    tag.textContent = tier_names[tier];
}

// settings, the answer language and model in the model menu and low-data mode on the account tab

function settings_body() {
    return { language: state.settings.language, low_data: state.settings.low_data, model: model_choice() };
}

function load_settings() {
    let saved = state.me?.settings || {};
    if (!Object.keys(saved).length) {
        try {
            saved = JSON.parse(localStorage.getItem("rahah-settings") || "{}");
        } catch (e) {}
    }
    state.settings = {
        language: typeof saved.language === "string" ? saved.language : "",
        low_data: Boolean(saved.low_data),
        model: typeof saved.model === "string" ? saved.model : "auto",
    };
    try {
        localStorage.setItem("rahah-settings", JSON.stringify(state.settings));
    } catch (e) {}
    apply_settings();
}

// saved with the account, so they follow the student to another device, and here for the next page load
function save_settings(change) {
    state.settings = { ...state.settings, ...change };
    try {
        localStorage.setItem("rahah-settings", JSON.stringify(state.settings));
    } catch (e) {}
    if (state.me) {
        state.me.settings = state.settings;
        api("/api/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings: state.settings }),
        }).catch(() => {});
    }
    apply_settings();
}

function apply_settings() {
    // a language the server no longer offers falls back to matching the question
    if (state.settings.language && Object.keys(state.languages).length && !state.languages[state.settings.language]) {
        state.settings.language = "";
    }
    state.answer_lang_code = state.languages[state.settings.language] || "";
    render_model_pick();
    render_composer_chips();
    // the account tab's low-data switch follows along
    document.querySelector("[data-low-data-toggle]")?.setAttribute("aria-checked", String(Boolean(state.settings.low_data)));
}

// voice typing, the browser turns speech into words in the message box and rahah reads the words
// claude can't hear audio, so only the text is ever sent

const tools_btn = el("attach");
const input_menu = el("input-menu");
const speech_engine = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const voice = { rec: null, base: "", heard: "", error: "" };
el("voice-option").hidden = !speech_engine();
el("talk-option").hidden = !(speech_engine() && can_speak);

const voice_errors = {
    "not-allowed": "Rahah can't use your microphone. Allow it in your browser settings.",
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
        focus_input();
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
    if (talk.on) stop_talk();
    else if (voice.rec) stop_voice();
    else if (input_menu.hidden) open_input_menu();
    else close_input_menu();
});

input_menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-input]");
    if (!option) return;
    close_input_menu();
    if (option.dataset.input === "files") file_input.click();
    else if (option.dataset.input === "photo") open_camera();
    else if (option.dataset.input === "hints") set_hint_mode(!state.hints);
    else if (option.dataset.input === "notes") show_notes_picker();
    else if (option.dataset.input === "talk") start_talk();
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
            ? "Rahah can't use your camera. Allow it in your browser settings, or choose a photo."
            : "No camera found. Choose a photo instead.");
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
