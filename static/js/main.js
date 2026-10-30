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
    // suggestions moved onto home, so old links to their page land there
    if (["#/suggestions", "#/recommendations", "#/for-you"].includes(location.hash)) {
        start_new_chat();
        return;
    }
    if (location.hash === "#/account") {
        if (!el("account")) show_account();
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
document.querySelectorAll(".tabs [data-account]").forEach((button) => button.addEventListener("click", show_account));
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
    (document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(draw_auth_art));
    (auth.mode === "login" ? el("auth-login") : el("auth-username")).focus();
}

function set_auth_mode(mode) {
    auth.mode = mode;
    const signup = mode === "signup";
    document.querySelectorAll(".auth-signup-only").forEach((n) => (n.hidden = !signup));
    document.querySelectorAll(".auth-login-only").forEach((n) => (n.hidden = signup));
    el("auth-forgot-note").hidden = true;
    el("auth-title").textContent = signup ? "Create an account" : "Sign in";
    el("auth-switch-text").textContent = signup ? "Already have an account?" : "Don't have an account?";
    el("auth-switch").textContent = signup ? "Sign in" : "Create an account";
    el("apple-button").lastChild.textContent = signup ? " Sign up with Apple" : " Sign in with Apple";
    el("auth-submit").textContent = signup ? "Create account" : "Sign in";
    el("auth-password").autocomplete = signup ? "new-password" : "current-password";
    el("auth-password").placeholder = signup ? "8 or more characters with a symbol like !" : "Enter your password";
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

el("auth-switch").addEventListener("click", () => {
    set_auth_mode(auth.mode === "signup" ? "login" : "signup");
    (auth.mode === "login" ? el("auth-login") : el("auth-username")).focus();
});
el("auth-forgot").addEventListener("click", () => {
    el("auth-forgot-note").hidden = !el("auth-forgot-note").hidden;
});

// the halftone beside the form, a big R for rahah made of diamond dots
// the letter is drawn blurred on a small hidden canvas, then each dot's size follows how much of the letter is under it,
// so the strokes are dense, the edges scatter, and a little noise breaks it up like print. a seeded random keeps the
// same picture on every visit
function auth_random(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function letter_map(width, height) {
    // a quarter size is plenty, since it's only read for how dark each spot is
    const scale = 0.25;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d");
    const size = h * 1.3;
    octx.filter = `blur(${Math.max(1, size * 0.022)}px)`;
    octx.fillStyle = "#000";
    octx.font = `800 ${size}px Inter, "Segoe UI", Arial, sans-serif`;
    octx.textBaseline = "alphabetic";
    // tilted a little and pushed right and down, so the letter runs off the edges like a cropped print
    octx.translate(w * 0.6, h * 1.02);
    octx.rotate(-0.12);
    octx.textAlign = "center";
    octx.fillText("R", 0, 0);
    const data = octx.getImageData(0, 0, w, h).data;
    return (x, y) => {
        const px = Math.min(w - 1, Math.max(0, Math.floor(x * scale)));
        const py = Math.min(h - 1, Math.max(0, Math.floor(y * scale)));
        return data[(py * w + px) * 4 + 3] / 255;
    };
}

function draw_auth_art() {
    const canvas = el("auth-art");
    if (!canvas || el("auth").hidden || getComputedStyle(canvas).display === "none") return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent-text").trim() || "#3b9edb";
    // a little dimmer than the accent, so it sits behind the form rather than competing with it
    ctx.globalAlpha = 0.75;

    const letter = letter_map(width, height);
    // smooth value noise for the print texture
    const rand = auth_random(7);
    const size = 11;
    const grid = Array.from({ length: size * size }, rand);
    const at = (x, y) => grid[((y % size) + size) % size * size + ((x % size) + size) % size];
    const smooth = (t) => t * t * (3 - 2 * t);
    const noise = (x, y) => {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const sx = smooth(x - x0), sy = smooth(y - y0);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        return top + (bottom - top) * sy;
    };
    const step = 9;
    const dots = auth_random(11);
    for (let y = step / 2; y < height; y += step) {
        for (let x = step / 2; x < width; x += step) {
            const u = x / width, v = y / height;
            const grain = 0.6 * noise(u * 6, v * 6) + 0.4 * noise(u * 14 + 5, v * 14 + 5);
            // the letter shaded by the grain, light and dark patches inside the strokes, and a faint scatter around it
            const value = letter(x, y) * (0.45 + 0.85 * grain) + 0.1 * grain;
            const density = Math.min(Math.max((value - 0.2) * 1.7, 0), 1);
            if (density <= 0 || dots() > Math.pow(density, 0.7)) continue;
            const r = (step / 2) * (0.4 + 0.55 * density);
            ctx.beginPath();
            ctx.moveTo(x, y - r);
            ctx.lineTo(x + r, y);
            ctx.lineTo(x, y + r);
            ctx.lineTo(x - r, y);
            ctx.closePath();
            ctx.fill();
        }
    }
}

let auth_art_timer = 0;
window.addEventListener("resize", () => {
    clearTimeout(auth_art_timer);
    auth_art_timer = setTimeout(draw_auth_art, 150);
});

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
    // the password typed twice must match, so a typo doesn't lock the student out of a new account
    if (signup && password !== el("auth-password-again").value) {
        show_auth_error("The passwords don't match.");
        el("auth-password-again").focus();
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

// the account tab, who's signed in, their details, connected accounts, password, usage and limits

function show_account() {
    if (state.busy) return;
    enter_page("#/account", "Account", '<div class="performance account-page" id="account"><div id="account-box"></div><div id="usage-slot"></div></div>');
    render_account();
    render_usage();
    sync_view();
    load_usage();
}

function render_account() {
    const me = state.me;
    const box = el("account-box");
    if (!box || !me) return;
    const shown = me.name || me.username;
    box.innerHTML = `
        <section class="perf-card">
            <div class="account-row">
                <span class="account-avatar" aria-hidden="true">${escape_html(shown.slice(0, 1).toUpperCase())}</span>
                <span class="account-text"><strong>${escape_html(shown)}</strong><small>@${escape_html(me.username)}${me.is_admin ? " · Admin" : ""}</small></span>
                <button class="btn btn-ghost btn-small" type="button" data-sign-out>Sign out</button>
            </div>
            <div class="account-fields">
                <label class="field">
                    <span class="field-label">Name</span>
                    <input class="text-input" id="account-name" maxlength="60" autocomplete="name" value="${escape_html(me.name || "")}" placeholder="Your name">
                </label>
                <label class="field">
                    <span class="field-label">Email</span>
                    <input class="text-input" id="account-email" type="email" maxlength="200" autocomplete="email" value="${escape_html(me.email || "")}" placeholder="you@example.com">
                </label>
            </div>
            <div class="account-actions">
                <button class="btn btn-soft btn-small" type="button" data-save-profile>Save details</button>
                <p class="field-hint" id="profile-note" hidden></p>
            </div>
            <div class="account-links" id="account-links"></div>
        </section>
        <section class="perf-card">
            <div class="perf-head">
                <h3>${me.has_password ? "Password" : "Add a password"}</h3>
                <p>8 or more characters with a symbol like ! or #. ${me.has_password ? "Changing it signs you out on your other devices." : "Then you can also sign in with your username or email."} Forgot it? Ask the person who runs Rahah for a new one.</p>
            </div>
            <div class="account-fields">
                ${me.has_password ? '<input class="text-input" type="password" id="password-current" autocomplete="current-password" placeholder="Current password">' : ""}
                <input class="text-input" type="password" id="password-new" autocomplete="new-password" placeholder="New password">
                <input class="text-input" type="password" id="password-again" autocomplete="new-password" placeholder="Repeat the new password">
            </div>
            <div class="account-actions">
                <button class="btn btn-soft btn-small" type="button" data-save-password>Save password</button>
                <p class="field-hint" id="password-note" hidden></p>
            </div>
        </section>
        ${me.is_admin ? `<section class="perf-card">
            <div class="perf-head">
                <h3>Students</h3>
                <p>Everyone's usage, their daily limits, new passwords and turning accounts off</p>
            </div>
            <a class="btn btn-accent btn-small" href="#/admin">Manage students</a>
        </section>` : ""}`;
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

function account_note(id, text) {
    el(id).textContent = text;
    el(id).hidden = false;
}

thread.addEventListener("click", async (event) => {
    if (!event.target.closest("#account-box")) return;
    if (event.target.closest("[data-connect-apple]")) apple_sign_in((text) => alert(text));
    if (event.target.closest("[data-sign-out]")) sign_out();
    if (event.target.closest("[data-save-profile]")) {
        try {
            state.me = await (await api("/api/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: el("account-name").value, email: el("account-email").value }),
            })).json();
            remember_me(state.me);
            render_account();
            account_note("profile-note", "Saved.");
        } catch (error) {
            account_note("profile-note", error.message);
        }
    }
    if (event.target.closest("[data-save-password]")) {
        if (el("password-new").value !== el("password-again").value) {
            account_note("password-note", "The new passwords don't match.");
            return;
        }
        try {
            await api("/api/me/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current: el("password-current")?.value || "", new: el("password-new").value }),
            });
            state.me.has_password = true;
            render_account();
            account_note("password-note", "Password saved. Your other devices were signed out.");
        } catch (error) {
            account_note("password-note", error.message);
        }
    }
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
    load_recommendations();
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
