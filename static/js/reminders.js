// rahah, reminders, the weekly timetable and revision plans
// plain scripts with no build step, loaded in order and sharing one global scope

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
    open_box(plan_sheet);
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
