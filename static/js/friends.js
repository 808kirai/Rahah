// rahah, friends and the weekly leaderboard, finding people, friend requests, and counting time spent studying

function study_time_text(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

// one person in search results or a friends list, with what can be done next
function person_html(p) {
    const actions = {
        none: `<button class="btn btn-soft btn-small" type="button" data-friend-add="${escape_html(p.username)}">${icons.plus}Add</button>`,
        sent: `<button class="btn btn-ghost btn-small" type="button" data-friend-drop="${escape_html(p.username)}">Requested · Cancel</button>`,
        asked: `<button class="btn btn-accent btn-small" type="button" data-friend-accept="${escape_html(p.username)}">Accept</button>
            <button class="btn btn-ghost btn-small" type="button" data-friend-drop="${escape_html(p.username)}">Decline</button>`,
        friends: `<span class="page-note on">${icons.check}Friends</span>`,
    };
    return `<li class="person">
        ${face_html(p.photo, p.name, "small")}
        <span class="person-who"><strong>${escape_html(p.name)}</strong><small>@${escape_html(p.username)}</small></span>
        <span class="person-actions">${actions[p.status] || ""}</span>
    </li>`;
}

function people_html(people, words) {
    if (words.length < 2) return "";
    if (!people) return '<p class="page-note">Looking for people…</p>';
    if (!people.length) return '<p class="page-note">Nobody found with that username or name.</p>';
    return `<ul class="people-list">${people.map(person_html).join("")}</ul>`;
}

// people search, shared by the leaderboard, chats and tests, and home on phones
const people_search = { words: "", found: null, timer: 0 };
function find_people(words, done) {
    clearTimeout(people_search.timer);
    if (words.length < 2) {
        people_search.words = words;
        people_search.found = [];
        done();
        return;
    }
    if (people_search.words === words && people_search.found) {
        done();
        return;
    }
    people_search.words = words;
    people_search.found = null;
    done();
    people_search.timer = setTimeout(async () => {
        try {
            const found = (await (await api(`/api/people?q=${encodeURIComponent(words)}`)).json()).people;
            if (people_search.words === words) people_search.found = found;
        } catch (error) {
            if (people_search.words === words) people_search.found = [];
        }
        done();
    }, 250);
}

// the leaderboard page, this week's points for the student and their friends

function show_leaderboard() {
    if (state.busy) return;
    enter_page("#/leaderboard", "Leaderboard", '<div class="performance leaderboard-page" id="leaderboard"><p class="page-note wait">Loading the leaderboard…</p></div>');
    sync_view();
    load_leaderboard();
}

async function load_leaderboard() {
    try {
        const [board, friends] = await Promise.all([api("/api/leaderboard"), api("/api/friends")]);
        state.board = await board.json();
        state.friends = await friends.json();
    } catch (error) {
        if (el("leaderboard")) el("leaderboard").innerHTML = `<p class="page-note wait">${escape_html(error.message)}</p>`;
        return;
    }
    render_leaderboard();
}

function render_leaderboard() {
    const page = el("leaderboard");
    if (!page || !state.board) return;
    const { board, above, rules, standing } = state.board;
    const f = state.friends || { friends: [], asked: [], sent: [] };
    const alone = board.length === 1;
    // a search in progress stays put when the page redraws after adding someone
    const typed = el("people-search")?.value || "";
    const headline = alone ? "Add friends to see how you compare." : above === 0 ? "You're top of your friends this week." : `${above} friend${above === 1 ? " is" : "s are"} above you.`;
    // the top three get gold, silver and bronze, once they've scored something
    const medal = (r) => (r.place <= 3 && r.points > 0 ? ["gold", "silver", "bronze"][r.place - 1] : "");
    const trophy = '<svg class="board-trophy" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5a3 3 0 0 0 3 4.3M17 5.5h2.5a3 3 0 0 1-3 4.3"/><path d="M12 14v3.5"/><path d="M8.5 21h7l-1-3.5h-5z"/></svg>';
    const rows = board.map((r) => `<li class="board-row${r.you ? " you" : ""}${medal(r) ? ` ${medal(r)}` : ""}">
        <span class="board-place">${r.place}</span>
        ${face_html(r.photo, r.name, "small")}
        <span class="board-who"><strong>${escape_html(r.you ? "You" : r.name)}</strong>
            <small>${study_time_text(r.minutes)} studied · ${plural(r.marks, "mark")} · ${plural(r.cards, "card")} · ${plural(r.days, "day")}</small></span>
        ${medal(r) ? `<span class="board-medal" title="${["First", "Second", "Third"][r.place - 1]} place">${trophy}</span>` : ""}
        <span class="board-points" title="${plural(r.points, "point")}"><strong>${r.points}</strong><small>pts</small></span>
    </li>`).join("");
    page.innerHTML = `
        <section class="perf-card board-card">
            <div class="perf-head">
                <h3>This week</h3>
                <p>${headline} It starts again on Monday.</p>
            </div>
            <ol class="board">${rows}</ol>
            <p class="field-hint board-rules">Points: ${rules.mark} for each test mark, ${rules.card} for each flashcard practised, 1 for every ${rules.minutes} minutes studying, and ${rules.day} for each day you study.</p>
        </section>
        ${f.asked.length ? `<section class="perf-card">
            <div class="perf-head"><h3>Friend requests</h3><p>They'd like to compare with you.</p></div>
            <ul class="people-list">${f.asked.map(person_html).join("")}</ul>
        </section>` : ""}
        <p class="page-note phone-friend-note">To add friends, search their name at the top of Home or Chats &amp; Tests.</p>
        <div class="board-grid">
            <section class="perf-card friend-finder">
                <div class="perf-head"><h3>Add friends</h3><p>Search by username or name. They'll need to accept.</p></div>
                <input class="search" id="people-search" type="search" placeholder="Search people" aria-label="Search people" autocomplete="off">
                <div id="people-found"></div>
            </section>
            <section class="perf-card">
                <div class="perf-head"><h3>Your friends</h3><p>${f.friends.length ? `${plural(f.friends.length, "friend")}` : "No friends yet."}</p></div>
                ${f.friends.length || f.sent.length ? `<ul class="people-list">${f.friends.map((p) => person_html(p).replace(`<span class="page-note on">${icons.check}Friends</span>`,
                    `<button class="btn btn-ghost btn-small" type="button" data-friend-drop="${escape_html(p.username)}" data-friend-remove>Remove</button>`)).join("")}${f.sent.map(person_html).join("")}</ul>` : ""}
            </section>
            ${standing_html(standing, board)}
        </div>`;
    if (typed) {
        el("people-search").value = typed;
        render_people_found();
    }
}

// how the race looks from where the student is: who to catch, how far ahead, the trend and accuracy
function standing_html(s, board) {
    const mine = board.find((r) => r.you);
    const change = mine.points - s.last_week;
    const race = s.ahead
        ? `<strong>${s.ahead.gap}</strong><span>point${s.ahead.gap === 1 ? "" : "s"} to pass ${escape_html(s.ahead.name)}</span>`
        : s.behind
            ? `<strong>${s.behind.gap}</strong><span>point${s.behind.gap === 1 ? "" : "s"} ahead of ${escape_html(s.behind.name)}</span>`
            : `<strong>${mine.points}</strong><span>points so far this week</span>`;
    const share = s.top_points ? Math.round((mine.points / s.top_points) * 100) : 0;
    return `<section class="perf-card standing-card">
        <div class="perf-head"><h3>Your standing</h3><p>${board.length > 1 ? `Number ${mine.place} of ${board.length}` : "Just you so far"}</p></div>
        <div class="standing-race">${race}</div>
        <div class="standing-bar" aria-hidden="true"><span style="width: ${share}%"></span></div>
        <p class="standing-bar-note">${mine.place === 1 ? "You're setting the pace." : `${share}% of the leader's points`}</p>
        <dl class="standing-facts">
            <div><dt>On last week</dt><dd class="${change > 0 ? "up" : change < 0 ? "down" : ""}">${change > 0 ? "+" : ""}${change} points</dd></div>
            <div><dt>Test accuracy</dt><dd>${s.accuracy === null ? "No tests yet" : `${s.accuracy}%${s.tested > 1 ? `, ${ordinal(s.accuracy_place)} of ${s.tested}` : ""}`}</dd></div>
            <div><dt>Study time</dt><dd>${study_time_text(mine.minutes)}</dd></div>
        </dl>
    </section>`;
}

function ordinal(n) {
    const end = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
    return `${n}${end}`;
}

function render_people_found() {
    const slot = el("people-found");
    if (slot) slot.innerHTML = people_html(people_search.found, people_search.words);
}

thread.addEventListener("input", (event) => {
    if (event.target.id === "people-search") find_people(event.target.value.trim(), render_people_found);
});

// adding, accepting, cancelling and removing, wherever people are listed
thread.addEventListener("click", async (event) => {
    const add = event.target.closest("[data-friend-add]");
    const accept = event.target.closest("[data-friend-accept]");
    const drop = event.target.closest("[data-friend-drop]");
    const button = add || accept || drop;
    if (!button) return;
    const username = button.dataset.friendAdd || button.dataset.friendAccept || button.dataset.friendDrop;
    if (button.dataset.friendRemove !== undefined && !confirm(`Remove ${username} from your friends?`)) return;
    button.disabled = true;
    try {
        let status;
        if (add) status = (await (await api("/api/friends", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) })).json()).status;
        if (accept) status = (await (await api(`/api/friends/${encodeURIComponent(username)}/accept`, { method: "POST" })).json()).status;
        if (drop) status = (await (await api(`/api/friends/${encodeURIComponent(username)}`, { method: "DELETE" })).json()).status;
        // the same person shown elsewhere on the page changes with them
        (people_search.found || []).forEach((p) => p.username === username && (p.status = status));
        if (el("leaderboard")) load_leaderboard();
        render_people_found();
        if (el("chat-groups")) render_chats();
        render_home_search();
    } catch (error) {
        button.disabled = false;
        alert(error.message);
    }
});

// home on phones has one search for chats, tests and people
function render_home_search() {
    const box = el("home-search");
    const slot = el("home-found");
    if (!box || !slot) return;
    const words = box.value.trim().toLowerCase();
    el("rows").hidden = words.length >= 2;
    if (words.length < 2) {
        slot.innerHTML = "";
        return;
    }
    const tests = state.sets.filter((s) => s.title.toLowerCase().includes(words)).slice(0, 6);
    const chats = state.conversations.filter((c) => c.title.toLowerCase().includes(words)).slice(0, 6);
    const link = (href, title, meta) => `<li><a href="${href}"><strong>${escape_html(title)}</strong><span class="found-meta">${meta}</span></a></li>`;
    slot.innerHTML = `
        ${tests.length ? `<h2 class="section-title">Tests and decks</h2><ul class="found-list">${tests.map((s) => link(`#/set/${s.id}`, s.title, escape_html(mode_name(s.mode)))).join("")}</ul>` : ""}
        ${chats.length ? `<h2 class="section-title">Chats</h2><ul class="found-list">${chats.map((c) => link(`#/c/${c.id}`, c.title, `${escape_html(mode_name(c.mode))} · ${time_ago(c.updated, true)}`)).join("")}</ul>` : ""}
        <h2 class="section-title">People</h2>${people_html(people_search.found, people_search.words)}`;
}

thread.addEventListener("input", (event) => {
    if (event.target.id === "home-search") find_people(event.target.value.trim(), render_home_search);
});

// time spent studying counts towards the leaderboard, one minute at a time, and only minutes in which the
// student did something themselves: a tap, a click, a key, or scrolling with a finger or the mouse wheel.
// rahah scrolling itself while an answer comes in doesn't count, and neither does sitting idle
let acted_this_minute = false;
["pointerdown", "keydown", "wheel", "touchmove", "input"].forEach((name) =>
    document.addEventListener(name, (event) => {
        if (event.isTrusted) acted_this_minute = true;
    }, { passive: true, capture: true }));

function start_study_clock() {
    if (start_study_clock.running) return;
    start_study_clock.running = true;
    setInterval(() => {
        const counts = acted_this_minute && state.me && document.visibilityState === "visible" && navigator.onLine;
        acted_this_minute = false;
        if (counts) api("/api/study-time", { method: "POST" }).catch(() => {});
    }, 60 * 1000);
}
