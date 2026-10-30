// rahah, conversations, sheets, motion, the theme and the message box, then it all starts
// plain scripts with no build step, loaded in order and sharing one global scope

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
    stop_reading();
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
            if (m.role === "user") {
                add_user_message(m.text, m.files || []);
                return;
            }
            const reply = add_assistant_message(m.text, m.sources || [], m.runs || []);
            render_searches(reply, m.searches);
            if (m.stopped) add_notice(reply, "You stopped this answer.");
            reply.classList.add("answered");
            reply.raw_text = m.text;
            reply.message_id = m.id;
            reply.rating = m.rating || 0;
            add_answer_actions(reply);
        });
        sync_view();
        set_title(conversation.title);
        offer_retry();
        scroll_to_bottom();
    } catch (error) {
        start_new_chat();
    }
    load_history();
}

function start_new_chat() {
    if (state.busy) return;
    stop_reading();
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
    if (location.hash === "#/reminders") {
        if (!el("reminders")) show_reminders();
        return;
    }
    if (location.hash === "#/performance") {
        if (!el("performance")) show_performance();
        return;
    }
    if (location.hash === "#/admin") {
        if (!el("admin")) show_admin();
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

// a click outside any sheet closes it like cancel, but only when the press started outside too,
// so dragging out of a text field while selecting doesn't throw away what was typed
document.querySelectorAll("dialog.sheet").forEach((dialog) => {
    let pressed_outside = false;
    const outside = (event) => {
        const box = dialog.getBoundingClientRect();
        return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    };
    // clicks on the dimmed backdrop land on the dialog itself
    dialog.addEventListener("pointerdown", (event) => {
        pressed_outside = event.target === dialog && outside(event);
    });
    dialog.addEventListener("click", (event) => {
        if (pressed_outside && event.target === dialog && outside(event)) dialog.close();
        pressed_outside = false;
    });
});

// the bar floats over the page, so the page keeps room at its end that matches the bar as it grows and shrinks
new ResizeObserver(([entry]) => {
    document.querySelector(".main").style.setProperty("--dock-h", `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`);
}).observe(el("dock-wrap"));
document.querySelectorAll(".tabs [data-chats]").forEach((button) => button.addEventListener("click", show_chats));
document.querySelectorAll(".tabs [data-recommendations]").forEach((button) => button.addEventListener("click", show_recommendations));
document.querySelectorAll(".tabs [data-reminders]").forEach((button) => button.addEventListener("click", show_reminders));
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
        redraw_diagrams();
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

function apply_modes(modes, redraw = true) {
    state.modes = modes;
    state.code_modes = new Set(modes.filter((m) => m.runs_code).map((m) => m.id));
    modes.forEach((m) => {
        state.mode_names[m.id] = m.name;
        state.mode_groups[m.id] = m.group;
    });
    // the top picker keeps its choice, or goes back to the default if that subject was removed
    const picked = mode_select.value;
    mode_select.innerHTML = mode_options_html();
    mode_select.value = modes.some((m) => m.id === picked) ? picked : state.default_mode;
    if (redraw) render_rows();
}

// accounts, the sign in screen and what changes when a student signs in or out

async function load_me() {
    try {
        const response = await fetch("/api/me");
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("not reachable");
        return await response.json();
    } catch (error) {
        // offline, the last student on this device carries on with what's saved
        try {
            return JSON.parse(localStorage.getItem("rahah-me") || "null");
        } catch (e) {
            return null;
        }
    }
}

// saved copies on this device belong to whoever was signed in, so they go when someone else signs in or out
async function forget_saved_data() {
    try {
        ["rahah-queue", "rahah-offline-sets", "rahah-me", "rahah-settings"].forEach((key) => localStorage.removeItem(key));
    } catch (e) {}
    try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("rahah-data")).map((k) => caches.delete(k)));
    } catch (e) {}
}

function remember_me(me) {
    try {
        const before = localStorage.getItem("rahah-user");
        localStorage.setItem("rahah-user", me.id);
        localStorage.setItem("rahah-me", JSON.stringify(me));
        return before && before !== me.id;
    } catch (e) {
        return false;
    }
}

const auth = { mode: "login", config: null };

async function show_auth() {
    if (!el("auth").hidden) return;
    document.body.classList.add("signed-out");
    el("auth").hidden = false;
    set_auth_mode(auth.mode);
    set_up_providers();
    (auth.mode === "login" ? el("auth-login") : el("auth-username")).focus();
}

function set_auth_mode(mode) {
    auth.mode = mode;
    const signup = mode === "signup";
    document.querySelectorAll("[data-auth-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.authTab === mode)));
    document.querySelectorAll(".auth-signup-only").forEach((n) => (n.hidden = !signup));
    document.querySelectorAll(".auth-login-only").forEach((n) => (n.hidden = signup));
    el("auth-title").textContent = signup ? "Make your account" : "Welcome back";
    el("auth-sub").textContent = signup ? "Free to start. Your chats, tests and notes stay in your own account." : "Sign in to pick up where you left off.";
    el("auth-submit").textContent = signup ? "Create account" : "Sign in";
    el("auth-password").autocomplete = signup ? "new-password" : "current-password";
    el("auth-password").placeholder = signup ? "At least 8 characters" : "";
    show_auth_error("");
}

function show_auth_error(text) {
    el("auth-error").textContent = text;
    el("auth-error").hidden = !text;
}

// google and apple buttons appear once their keys are set on the server
// their scripts load only when they're set up, so nobody's browser talks to them otherwise

function load_script(src) {
    return new Promise((resolve, reject) => {
        const found = document.querySelector(`script[src="${src}"]`);
        if (found) return found.dataset.loaded ? resolve() : found.addEventListener("load", () => resolve());
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => {
            script.dataset.loaded = "1";
            resolve();
        };
        script.onerror = () => reject(new Error("couldn't load"));
        document.head.appendChild(script);
    });
}

async function auth_config() {
    if (!auth.config) {
        try {
            auth.config = await (await fetch("/api/auth/config")).json();
        } catch (e) {
            auth.config = {};
        }
    }
    return auth.config;
}

// the token from google or apple goes to the server, which checks it and signs in, or connects it when already signed in
async function send_provider_token(path, body, on_error) {
    try {
        const response = await api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const me = await response.json();
        if (state.me) {
            state.me = me;
            render_account();
            return;
        }
        await finish_sign_in(me);
    } catch (error) {
        on_error(error.message);
    }
}

let google_ready = null;
function set_up_google(client_id) {
    if (!google_ready) {
        google_ready = load_script("https://accounts.google.com/gsi/client").then(() => {
            google.accounts.id.initialize({
                client_id,
                ux_mode: "popup",
                callback: (reply) => send_provider_token("/api/auth/google", { credential: reply.credential }, state.me ? (text) => alert(text) : show_auth_error),
            });
        });
    }
    return google_ready;
}

// google draws its own button, in an oval to match the rest of rahah
async function draw_google_button(slot, text = "continue_with") {
    const config = await auth_config();
    if (!config.google_client_id || !slot) return;
    try {
        await set_up_google(config.google_client_id);
        const light = document.documentElement.getAttribute("data-theme") === "light";
        google.accounts.id.renderButton(slot, {
            theme: light ? "outline" : "filled_black", size: "large", shape: "pill", text, logo_alignment: "center",
            width: Math.min(360, slot.clientWidth || 360),
        });
    } catch (e) {
        slot.innerHTML = '<p class="field-hint">Google sign in couldn\'t load. Check the connection.</p>';
    }
}

async function apple_sign_in(on_error) {
    const config = await auth_config();
    try {
        await load_script("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js");
        AppleID.auth.init({ clientId: config.apple_client_id, scope: "name email", redirectURI: `${location.origin}/`, usePopup: true });
        const reply = await AppleID.auth.signIn();
        const name = reply.user?.name ? `${reply.user.name.firstName || ""} ${reply.user.name.lastName || ""}`.trim() : "";
        await send_provider_token("/api/auth/apple", { id_token: reply.authorization.id_token, name }, on_error);
    } catch (error) {
        // closing apple's window isn't an error worth showing
        if (error?.error !== "popup_closed_by_user") on_error("Sign in with Apple didn't finish. Try again.");
    }
}

async function set_up_providers() {
    const config = await auth_config();
    el("auth-providers").hidden = !config.google_client_id && !config.apple_client_id;
    el("apple-button").hidden = !config.apple_client_id;
    if (config.google_client_id) draw_google_button(el("google-button"));
}

el("apple-button").addEventListener("click", () => apple_sign_in(show_auth_error));

async function finish_sign_in(me) {
    if (remember_me(me)) await forget_saved_data();
    remember_me(me);
    // a fresh start loads everything for this student
    location.hash = "#/";
    location.reload();
}

document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.addEventListener("click", () => set_auth_mode(tab.dataset.authTab)));

el("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const signup = auth.mode === "signup";
    const password = el("auth-password").value;
    const body = signup
        ? { username: el("auth-username").value.trim(), email: el("auth-email").value.trim(), password }
        : { login: el("auth-login").value.trim(), password };
    if (signup ? !body.username || !body.email || !password : !body.login || !password) {
        show_auth_error(signup ? "Fill in a username, email and password." : "Fill in your username or email and password.");
        return;
    }
    el("auth-submit").disabled = true;
    show_auth_error("");
    try {
        const response = await api(signup ? "/api/auth/signup" : "/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        await finish_sign_in(await response.json());
    } catch (error) {
        show_auth_error(error.message);
        el("auth-submit").disabled = false;
    }
});

async function sign_out() {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    await forget_saved_data();
    try {
        localStorage.removeItem("rahah-user");
    } catch (e) {}
    location.hash = "#/";
    location.reload();
}

// the account part of the settings box, who's signed in, a new password and signing out
function render_account() {
    const me = state.me;
    const box = el("account-box");
    if (!me) {
        box.innerHTML = "";
        return;
    }
    const shown = me.name || me.username;
    box.innerHTML = `
        <div class="account-row">
            <span class="account-avatar" aria-hidden="true">${escape_html(shown.slice(0, 1).toUpperCase())}</span>
            <span class="account-text"><strong>${escape_html(shown)}</strong><small>@${escape_html(me.username)}${me.email ? ` · ${escape_html(me.email)}` : ""}${me.is_admin ? " · Admin" : ""}</small></span>
            <button class="btn btn-ghost btn-small" type="button" data-sign-out>Sign out</button>
        </div>
        ${me.is_admin ? `<a class="btn btn-soft btn-small account-admin" href="#/admin" data-detail-close>Manage students</a>` : ""}
        <div class="account-links" id="account-links"></div>
        <details class="perf-details account-password">
            <summary>${me.has_password ? "Change password" : "Add a password"}</summary>
            <div class="account-password-form">
                ${me.has_password ? '<input class="text-input" type="password" id="password-current" autocomplete="current-password" placeholder="Current password">' : ""}
                <input class="text-input" type="password" id="password-new" autocomplete="new-password" placeholder="New password, at least 8 characters">
                <button class="btn btn-soft btn-small" type="button" data-save-password>Save password</button>
                <p class="field-hint" id="password-note" hidden></p>
            </div>
        </details>`;
    render_account_links();
}

// connected accounts, and a way to connect google or apple to an account made with a password
async function render_account_links() {
    const me = state.me;
    const slot = el("account-links");
    const config = await auth_config();
    if (!slot || !me || (!config.google_client_id && !config.apple_client_id)) return;
    const done = (name) => `<span class="account-linked">${icons.check}${name} connected</span>`;
    slot.innerHTML = `
        ${config.google_client_id ? (me.google ? done("Google") : '<div class="account-google" id="google-connect"></div>') : ""}
        ${config.apple_client_id ? (me.apple ? done("Apple") : '<button class="btn btn-ghost btn-small" type="button" data-connect-apple>Connect Apple</button>') : ""}`;
    if (config.google_client_id && !me.google) draw_google_button(el("google-connect"), "signin_with");
}

el("account-box").addEventListener("click", async (event) => {
    if (event.target.closest("[data-connect-apple]")) apple_sign_in((text) => alert(text));
    if (event.target.closest("[data-sign-out]")) sign_out();
    if (event.target.closest(".account-admin")) el("settings-sheet").close();
    if (!event.target.closest("[data-save-password]")) return;
    const note = el("password-note");
    try {
        await api("/api/me/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ current: el("password-current")?.value || "", new: el("password-new").value }),
        });
        note.textContent = "Password saved. Other devices were signed out.";
        state.me.has_password = true;
    } catch (error) {
        note.textContent = error.message;
    }
    note.hidden = false;
});

async function start() {
    const me = await load_me();
    if (!me) {
        show_auth();
        return;
    }
    state.me = me;
    if (remember_me(me)) await forget_saved_data();
    remember_me(me);
    render_account();
    // the greeting uses the student's first name, or their username before they've added one
    // set on the page and on the copy home is rebuilt from, so it stays after leaving home
    const hello = `Welcome back, ${(me.name || me.username).split(" ")[0]}`;
    [el("welcome")?.querySelector(".welcome-line"), welcome_template.querySelector(".welcome-line")].forEach((line) => line && (line.textContent = hello));
    sync_theme_label();
    try {
        set_hint_mode(localStorage.getItem("rahah-hints") === "1");
    } catch (e) {}
    try {
        const response = await api("/api/modes");
        const { modes, groups, menu_groups, default: default_mode, languages } = await response.json();
        state.default_mode = default_mode;
        if (languages) state.languages = languages;
        if (groups) state.groups = groups;
        if (menu_groups) state.menu_groups = menu_groups;
        apply_modes(modes, false);
        mode_select.value = default_mode;
    } catch (error) {
        mode_select.innerHTML = '<option value="general">General study</option>';
    }
    load_settings();
    show_net_status();
    send_queue();
    render_rows();
    load_today();
    load_history();
    load_sets();
    load_notes();
    load_performance();
    load_reminders();
    route();
    input.focus({ preventScroll: true });
}

start();

// installing rahah as an app needs a service worker, it only steps in to show a page when offline
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
