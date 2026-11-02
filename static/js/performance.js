// rahah, the performance page, the weekly report, usage and cost, charts and details boxes
// plain scripts with no build step, loaded in order and sharing one global scope

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

const stat_sketches = { "Average score": "chart", "Average GPA": "target", "Tests taken": "checklist", "Best subject": "trophy" };

const gpa_text = (value) => (value === null || value === undefined ? "–" : value.toFixed(2));

// with open set, the card is a button that opens a details box, like average gpa opening each subject's gpa
function stat_card(label, value, note, extra = "", small = false, open = "") {
    const button = open ? ` pick-card" tabindex="0" role="button" ${open} aria-label="${label}, ${String(value).replace(/<[^>]*>/g, "").trim()}. Show each subject` : "";
    return `<div class="stat-card${button}">
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
    if (!changed("performance", state.performance)) return;
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
        stat_card("Average GPA", gpa_text(o.gpa), `Out of 4.0, across ${plural(o.subjects, "subject")}`, "", false, "data-gpa-box"),
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
    load_week();
}

// the weekly report, the last seven days next to the seven before, worked out on the server for free

async function load_week() {
    try {
        const offset = -new Date().getTimezoneOffset();
        state.week = await (await api(`/api/report?offset=${offset}`)).json();
    } catch (error) {
        return;
    }
    render_week();
}

function week_change(now, before, unit = "") {
    if (now === null || now === undefined) return "";
    if (before === null || before === undefined) return before === null && now !== null ? "No tests last week" : "";
    const diff = now - before;
    if (!diff) return "Same as last week";
    return `${diff > 0 ? "+" : "−"}${Math.abs(diff)}${unit} on last week`;
}

function render_week() {
    const slot = el("week-slot");
    const w = state.week;
    if (!slot || !w) return;
    const t = w.this;
    const l = w.last;
    const tile = (label, value, note, up) => `<div class="week-tile">
        <span>${label}</span>
        <strong>${value}</strong>
        <small class="${up === true ? "up" : up === false ? "down" : ""}">${note}</small>
    </div>`;
    const trend = (a, b) => (a === null || b === null || a === b ? null : a > b);
    const day_names = w.days.map((d) => new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" }));
    const focus = w.focus;
    const focus_label = focus.action === "flashcards" ? "Make flashcards" : "Make a test";
    slot.innerHTML = `<section class="perf-card week-card">
        <div class="perf-head">
            <h3>This week</h3>
            <p>The last seven days next to the seven before${w.streak > 1 ? ` · a ${w.streak}-day streak` : ""}</p>
        </div>
        <div class="week-tiles">
            ${tile("Tests taken", t.tests, week_change(t.tests, l.tests), trend(t.tests, l.tests))}
            ${tile("Average", t.average === null ? "–" : `${t.average}%`, t.average === null ? "No tests yet" : week_change(t.average, l.average, " points"), trend(t.average, l.average))}
            ${tile("Cards practised", t.cards, t.mastered ? `${t.mastered} mastered` : week_change(t.cards, l.cards), trend(t.cards, l.cards))}
            ${tile("Questions asked", t.questions, week_change(t.questions, l.questions), trend(t.questions, l.questions))}
            <div class="week-tile">
                <span>Study days</span>
                <strong>${t.days} of 7</strong>
                <span class="week-days" aria-label="${w.days.filter((d) => d.active).length} of the last 7 days">${w.days.map((d, i) => `<i class="${d.active ? "on" : ""}" title="${d.date}">${day_names[i]}</i>`).join("")}</span>
            </div>
        </div>
        <div class="week-focus">
            <p>${w.best ? `Strongest: <strong>${escape_html(w.best.name)}</strong> ${w.best.average}%. ` : ""}${w.weakest ? `Needs work: <strong>${escape_html(w.weakest.name)}</strong> ${w.weakest.average}%. ` : ""}${escape_html(focus.text)}</p>
            <button class="btn btn-soft btn-small" type="button" data-tool="${focus.action}" data-mode="${escape_html(focus.mode || "exam")}">${focus.action === "flashcards" ? icons.cards : icons.quiz}${focus_label}</button>
        </div>
    </section>`;
}

// what rahah has cost on this api key, today, this week and in all, with what caching saved

const usage_kinds = { chat: "Chat", retry: "Try again", quiz: "Making tests", flashcards: "Making flashcards", marking: "Marking answers", marking_photo: "Marking photos", suggestions: "Suggestions", plan: "Revision plans", stall: "Acolyte too slow, Mage answered" };

// money is always shown to the cent
function dollars(value) {
    return `$${(value || 0).toFixed(2)}`;
}

async function load_usage() {
    try {
        state.me = await (await api("/api/me")).json();
        // costs and ratings are only for the admin
        if (state.me.is_admin) {
            const [usage, feedback] = await Promise.all([api("/api/usage"), api("/api/feedback")]);
            state.usage = await usage.json();
            state.feedback = await feedback.json();
        }
    } catch (error) {
        return;
    }
    if (changed("usage", [state.me, state.usage, state.feedback])) render_usage();
}

function hours_text(seconds) {
    const hours = Math.floor(seconds / 3600);
    return hours >= 1 ? plural(hours, "hour") : plural(Math.max(1, Math.round(seconds / 60)), "minute");
}

// a horizontal bar with the share used, for a student's own limit and each student on the admin page
function usage_bar(percent) {
    return `<span class="usage-bar" role="img" aria-label="${percent}% used">
        <span class="allowance-track"><span class="allowance-bar${percent >= 100 ? " full" : ""}" style="width: ${percent}%"></span></span>
        <span class="usage-bar-value">${percent}%</span>
    </span>`;
}

// a student's own box, how much of today's limit is used and when it starts again, never what it costs
// how the student's pace compares: on track, or when the pass or today's limit would run out at this rate
function pace_text(a) {
    const now = Date.now() / 1000;
    const pro = a.pro;
    const day = (seconds) => new Date(seconds * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    if (pro && !pro.active) return `This pass is used up. You're on the free limit until ${day(pro.until)}.`;
    if (pro) {
        const length = pro.ends - pro.starts;
        const gone = Math.max(0, now - pro.starts);
        const used = pro.pass_percent / 100;
        if (gone < 6 * 3600 || gone / length < 0.03) return "Your pass just started. Check back tomorrow to see your pace.";
        if (used <= gone / length + 0.05) return `You're on track. This pass will last until ${day(pro.ends)}.`;
        const runs_out = pro.starts + gone / used;
        const early = Math.max(1, Math.round((pro.ends - runs_out) / 86400));
        return `At this pace, it runs out around ${day(runs_out)}, ${plural(early, "day")} early.`;
    }
    if (a.percent >= 100) return "";
    const day_gone = 1 - a.resets_in / 86400;
    if (a.percent / 100 > day_gone + 0.15 && a.percent >= 30) return "You're going fast today. You might run out before it resets.";
    return "You're on track for today.";
}

function allowance_html(a) {
    if (!a?.limited) return "";
    const pro = a.pro;
    return `<section class="perf-card usage-card">
        <div class="perf-head">
            <h3>Today's limit${pro?.active ? ` ${tier_badge(pro.tier)}` : ""}</h3>
            <p>${pro?.active ? (pro.tier === "max" ? "20x your usual limit with Max" : "10x your usual limit with Pro") : "How much of today's limit you've used"}</p>
        </div>
        <div class="allowance">
            ${usage_bar(a.percent)}
            <small>${a.percent >= 100 ? "Used up for today. Saved flashcards and tests still work." : `${100 - a.percent}% left.`} It starts again in ${hours_text(a.resets_in)}.</small>
        </div>
        ${pro ? `<div class="allowance pass-allowance">
            <span class="allowance-label">This pass</span>
            ${usage_bar(pro.pass_percent)}
        </div>` : ""}
        ${pace_text(a) ? `<p class="pace-note">${pace_text(a)}</p>` : ""}
    </section>`;
}

// what students thought of the answers, with the unhelpful ones to look at
function feedback_html(f) {
    if (!f || (!f.up && !f.down)) return "";
    return `<div class="feedback-box">
        <p class="usage-note">Answer ratings: ${f.up} helpful · ${f.down} not helpful</p>
        ${f.unhelpful.length ? `<details class="perf-details">
            <summary>Answers marked not helpful</summary>
            <ul class="detail-list unhelpful-list">${f.unhelpful.map((u) => `<li>
                <a href="#/c/${u.conversation_id}"><strong>${escape_html(u.question || "A question")}</strong><span>${escape_html(u.answer)}</span></a>
            </li>`).join("")}</ul>
        </details>` : ""}
    </div>`;
}

// a claude model by its picker name, the model behind it isn't shown
function model_label(model) {
    const names = { "claude-haiku": "Acolyte", "claude-sonnet": "Mage", "claude-opus": "Archmage" };
    const found = Object.keys(names).find((key) => model.startsWith(key));
    return found ? names[found] : model || "Other";
}

function render_usage() {
    const slot = el("usage-slot");
    if (!slot || !state.me) return;
    if (!state.me.is_admin) {
        slot.innerHTML = allowance_html(state.me.allowance);
        return;
    }
    const u = state.usage;
    if (!u) return;
    const column = (label, w) => `<div class="usage-col">
        <span>${label}</span>
        <strong>${dollars(w.cost)}</strong>
        <small>${plural(w.requests, "request")}${w.searches ? ` · ${plural(w.searches, "search")}` : ""}</small>
    </div>`;
    const all = u.all;
    slot.innerHTML = `<section class="perf-card usage-card">
        <div class="perf-head">
            <h3>Usage and cost</h3>
            <p>What Rahah has cost on this API key across every student, worked out from Claude's prices</p>
        </div>
        <div class="usage-cols">${column("Today", u.today)}${column("Last 7 days", u.week)}${column("All time", all)}</div>
        <p class="usage-note">${!all.requests ? "Nothing used yet." : all.cache_share ? `Caching saved ${dollars(all.saved)}, and ${all.cache_share}% of what Claude read came from the cache.` : "Nothing came from the cache yet. Caching starts saving once chats get longer."}</p>
        ${all.kinds.length ? `<div class="usage-kinds">${all.kinds.map((k) => `<span>${usage_kinds[k.kind] || k.kind} <strong>${dollars(k.cost)}</strong></span>`).join("")}</div>` : ""}
        ${(all.models || []).length ? `<div class="usage-kinds">${all.models.map((m) => `<span>${escape_html(model_label(m.model))} <strong>${dollars(m.cost)}</strong></span>`).join("")}</div>` : ""}
        ${feedback_html(state.feedback)}
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
        <div id="week-slot"></div>`;
        render_week();
        return;
    }
    const best = p.subjects[0];
    const weakest = o.weakest_subject ? p.subjects[p.subjects.length - 1] : null;
    const max_count = Math.max(...p.grades.map((g) => g.count), 1);
    const scale = p.scale.map((s, i) => (i === p.scale.length - 1 ? `${s.grade} below ${p.scale[i - 1].min}%` : `${s.grade} ${s.min}%+`)).join(" · ");

    page.innerHTML = `
        <div class="kpis">
            ${stat_card("Average score", `${o.average}% ${grade_pill(o.grade)}`, `${o.correct} of ${o.questions} marks`, sparkline(p.timeline))}
            ${stat_card("Average GPA", gpa_text(o.gpa), `Out of 4.0 across ${plural(o.subjects, "subject")}. Tap for each`, "", false, "data-gpa-box")}
            ${stat_card("Tests taken", o.attempts, `Across ${plural(o.quizzes, "test")}`)}
            ${stat_card("Best subject", escape_html(mode_name(best.mode)), weakest ? `${best.average}% average · needs work: ${escape_html(mode_name(weakest.mode))}` : `${best.average}% average`, "", true)}
        </div>

        <div id="week-slot"></div>

        <section class="perf-card">
            <div class="perf-head">
                <h3>Scores over time</h3>
                <p>Every attempt, oldest first</p>
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
                <p>Each test counts once, at its best. Tap a subject to see its tests</p>
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
                    <p>How many attempts got each grade</p>
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
                <p>Newest first. Tap a test to see every attempt</p>
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
        <div class="chart-tip floating" id="perf-tip" hidden></div>`;
    draw_timeline();
    render_usage();
}

// the students page, for the admin, everyone's usage, their daily limit and whether they can sign in

function show_admin() {
    if (state.busy) return;
    if (!state.me?.is_admin) {
        location.hash = "#/";
        return;
    }
    enter_page("#/admin", "Students", '<div class="performance admin-page" id="admin"><p class="page-note">Loading students…</p></div>');
    sync_view();
    load_admin();
}

async function load_admin() {
    try {
        state.admin = await (await api("/api/admin/users")).json();
    } catch (error) {
        if (el("admin")) el("admin").innerHTML = `<p class="page-note">${escape_html(error.message)}</p>`;
        return;
    }
    render_admin();
}

// how students are doing as a group: growth, who's active and who's running out of their limit
function admin_summary_html(s) {
    const change = s.signups_week - s.signups_before;
    const growth = s.signups_before || s.signups_week
        ? (change === 0 ? "Same as the week before" : `${change > 0 ? "Up" : "Down"} ${Math.abs(change)} on the week before`)
        : "No signups yet";
    return `<div class="kpis">
        ${stat_card("New students", s.signups_week, `${s.signups_today} today. ${growth}`)}
        ${stat_card("Active today", s.active_today, s.active_today ? `${dollars(s.avg_today)} each on average. ${s.active_week} active this week` : `${s.active_week} active this week`)}
        ${stat_card("At their limit", s.at_limit, `${s.near_limit} more are over 80% of today's limit`)}
    </div>`;
}

function render_admin() {
    const page = el("admin");
    const a = state.admin;
    if (!page || !a) return;
    const seen = (u) => (u.last_seen ? time_ago(u.last_seen, true) : "never");
    const limit = (u) => u.is_admin
        ? '<span class="admin-tag">No limit</span>'
        : `<span class="admin-cap"><span>$</span><input class="text-input" type="number" min="0" max="100" step="0.05" value="${u.daily_cap ?? ""}" placeholder="${a.default_cap.toFixed(2)}" data-cap="${u.id}" aria-label="Daily limit for ${escape_html(u.username)} in dollars"></span>`;
    page.innerHTML = `
        <div class="kpis">
            ${stat_card("Students", a.users.length, `${a.users.filter((u) => u.last_seen && u.last_seen > Date.now() / 1000 - 7 * 86400).length} active in the last 7 days`)}
            ${stat_card("Cost today", dollars(a.total.today), a.budget > 0 ? `Students used ${dollars(a.budget_used)} of the $${a.budget.toFixed(2)} daily budget` : "Across every student")}
            ${stat_card("Last 7 days", dollars(a.total.week), "Across every student")}
            ${stat_card("All time", dollars(a.total.all), `Default daily limit ${`$${a.default_cap.toFixed(2)}`} each`)}
        </div>
        ${a.summary ? admin_summary_html(a.summary) : ""}
        <section class="perf-card">
            <div class="perf-head">
                <h3>Every student</h3>
                <p>A blank limit uses the default of ${`$${a.default_cap.toFixed(2)}`} a day. Limits start again at each student's own midnight</p>
            </div>
            <div class="table-wrap"><table class="admin-table">
                <thead><tr><th>Student</th><th>Last seen</th><th class="num">Today</th><th class="num">Left today</th><th>Limit used</th><th class="num">7 days</th><th class="num">All</th><th>Daily limit</th><th></th></tr></thead>
                <tbody>${a.users.map((u) => `<tr class="${u.disabled ? "is-off" : ""}">
                    <td><strong>${escape_html(u.name || u.username)}</strong>${u.pro_until ? ` <span class="pro-badge" title="Pro until ${short_date(u.pro_until)}">Pro</span>` : ""}<small>@${escape_html(u.username)}${u.email ? ` · ${escape_html(u.email)}` : ""}${u.is_admin ? " · Admin" : ""}${u.disabled ? " · Turned off" : ""}</small></td>
                    <td>${seen(u)}<small>Joined ${short_date(u.created)}</small></td>
                    <td class="num">${dollars(u.today)}</td>
                    <td class="num">${u.cap === null ? "–" : dollars(u.left)}</td>
                    <td>${u.percent === null ? '<span class="admin-tag">No limit</span>' : usage_bar(u.percent)}</td>
                    <td class="num">${dollars(u.week)}</td>
                    <td class="num">${dollars(u.all)}</td>
                    <td>${limit(u)}</td>
                    <td class="admin-actions">${u.id === state.me.id ? "" : `
                        <button class="btn btn-ghost btn-small" type="button" data-admin-password="${u.id}">New password</button>
                        <button class="btn btn-ghost btn-small" type="button" data-admin-toggle="${u.id}">${u.disabled ? "Turn on" : "Turn off"}</button>`}
                    </td>
                </tr>`).join("")}</tbody>
            </table></div>
        </section>`;
}

async function admin_update(id, body) {
    try {
        const row = await (await api(`/api/admin/users/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })).json();
        state.admin.users = state.admin.users.map((u) => (u.id === id ? row : u));
    } catch (error) {
        alert(error.message);
    }
    render_admin();
}

thread.addEventListener("change", (event) => {
    const cap = event.target.closest("[data-cap]");
    if (!cap || !el("admin")) return;
    const value = cap.value.trim();
    admin_update(cap.dataset.cap, value === "" ? { use_default_cap: true } : { daily_cap: Number(value) });
});

thread.addEventListener("click", async (event) => {
    if (!el("admin")) return;
    const toggle = event.target.closest("[data-admin-toggle]");
    if (toggle) {
        const user = state.admin.users.find((u) => u.id === toggle.dataset.adminToggle);
        const off = !user.disabled;
        if (off && !confirm(`Turn off ${user.username}? They'll be signed out and can't sign in until you turn them back on.`)) return;
        admin_update(user.id, { disabled: off });
    }
    const reset = event.target.closest("[data-admin-password]");
    if (reset) {
        const user = state.admin.users.find((u) => u.id === reset.dataset.adminPassword);
        const fresh = prompt(`A new password for ${user.username}, at least 8 characters with a special character. Give it to them, and they can change it on the Account tab.`);
        if (!fresh) return;
        try {
            await api(`/api/admin/users/${user.id}/password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ new: fresh }),
            });
            alert(`Done. ${user.username} was signed out everywhere and can sign in with the new password.`);
        } catch (error) {
            alert(error.message);
        }
    }
});

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
    open_box(detail_sheet);
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
        <p class="detail-heading">Tests, tap one to see its attempts</p>
        <ul class="detail-list">${tests.map((q) => `<li class="pick-row" tabindex="0" role="button" data-test="${q.id}">
            <span class="detail-name">${escape_html(q.title)}</span><span class="num">best ${q.best}%</span>${grade_pill(q.grade)}
        </li>`).join("")}</ul>
        <div class="sheet-actions">
            <button class="btn btn-ghost" type="button" data-detail-close>Close</button>
        </div>`;
    open_box(detail_sheet);
}

el("detail-close").addEventListener("click", () => detail_sheet.close());

// a subject or test row opens its box, by click or by enter or space, and a test inside a subject's box swaps the box over
// every subject's gpa, best first, each one opening that subject's box
function show_gpa_detail() {
    const p = state.performance;
    if (!p?.overall) return;
    const subjects = [...p.subjects].sort((a, b) => (b.gpa ?? -1) - (a.gpa ?? -1));
    el("detail-title").textContent = "Average GPA";
    el("detail-body").innerHTML = `
        <p class="detail-sub">The average of your subject GPAs, so each subject counts equally. Each test counts once, at its best</p>
        <div class="detail-stats">
            ${detail_stat("Average GPA", gpa_text(p.overall.gpa))}
            ${detail_stat("Subjects", p.overall.subjects)}
        </div>
        <p class="detail-heading">By subject, tap one to see its tests</p>
        <ul class="detail-list gpa-list">${subjects.map((s) => `<li class="pick-row" tabindex="0" role="button" data-subject="${escape_html(s.mode)}">
            <span class="detail-name">${escape_html(mode_name(s.mode))}</span>
            <span class="gpa-track" aria-hidden="true"><span class="allowance-track"><span class="allowance-bar" style="width: ${Math.round(((s.gpa ?? 0) / 4) * 100)}%"></span></span></span>
            <span class="num"><strong>${gpa_text(s.gpa)}</strong></span>${grade_pill(s.grade)}
            <span class="num gpa-tests">${plural(s.tests, "test")}</span>
        </li>`).join("")}</ul>
        <div class="sheet-actions">
            <button class="btn btn-ghost" type="button" data-detail-close>Close</button>
        </div>`;
    open_box(detail_sheet);
}

function pick_detail(target) {
    if (target.closest("[data-gpa-box]")) {
        show_gpa_detail();
        return true;
    }
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
    // the average gpa card also sits in the summary on home
    if (event.target.closest("[data-gpa-box]")) {
        show_gpa_detail();
        return;
    }
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
    const row = event.target.closest?.(".pick-row, .bar-row[data-subject], [data-gpa-box]");
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
