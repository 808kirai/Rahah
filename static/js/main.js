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
        const { conversations, hidden } = await response.json();
        state.conversations = conversations;
        state.hidden_chats = hidden || 0;
    } catch (error) {
        return;
    }
    if (!changed("conversations", [state.conversations, state.hidden_chats])) return;
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
        ease_in_view();
        if (!conversation.messages.length) show_welcome();
        conversation.messages.forEach((m) => {
            if (m.role === "user") {
                add_user_message(m.text, m.files || [], true);
                return;
            }
            const reply = add_assistant_message(m.text, m.sources || [], m.runs || []);
            render_searches(reply, m.searches);
            if (m.stopped) add_notice(reply, "You stopped this answer.");
            reply.classList.add("answered");
            reply.raw_text = m.text;
            show_tier(reply, m.tier);
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
    focus_input();
}

function route() {
    const reset = location.hash.match(/^#\/reset\/([\w-]{20,200})$/);
    if (reset) {
        show_reset(reset[1]);
        return;
    }
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
    if (location.hash === "#/leaderboard") {
        if (!el("leaderboard")) show_leaderboard();
        return;
    }
    if (location.hash === "#/admin") {
        if (!el("admin")) show_admin();
        return;
    }
    const shared = location.hash.match(/^#\/shared\/([\w-]{20,200})$/);
    if (shared) {
        if (!el("shared")) return show_shared(shared[1]);
        return;
    }
    const set_match = location.hash.match(/^#\/set\/([0-9a-f]+)$/);
    if (set_match) {
        if (!el("study") || state.study?.set.id !== set_match[1]) return open_set(set_match[1]);
        return;
    }
    const match = location.hash.match(/^#\/c\/([0-9a-f]+)$/);
    if (match && match[1] !== state.conversation_id) return open_conversation(match[1]);
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
    // the buttons sit in the middle beside one line, and drop to the bottom once the text runs onto more
    input.closest(".composer-row").classList.toggle("tall", input.scrollHeight > input.offsetHeight + 4 || input.offsetHeight > 60);
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

// the device's time zone, so the daily limit starts again at the student's own midnight
async function send_timezone() {
    let zone = "";
    try {
        zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (e) {}
    if (!zone || !state.me || state.me.timezone === zone || !navigator.onLine) return;
    try {
        state.me = await (await api("/api/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ timezone: zone }),
        })).json();
        remember_me(state.me);
    } catch (e) {}
}

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
    requestAnimationFrame(draw_auth_art);
    (auth.mode === "login" ? el("auth-login") : el("auth-username")).focus();
}

function set_auth_mode(mode) {
    // leaving the reset screen drops the link from the address bar
    if (auth.mode === "reset" && mode !== "reset") history.replaceState(null, "", "/");
    if (mode === "signup") history.replaceState(null, "", "#/signup");
    else if (mode === "login" && location.hash === "#/signup") history.replaceState(null, "", "/");
    auth.mode = mode;
    const signup = mode === "signup";
    const reset = mode === "reset";
    document.querySelectorAll(".auth-signup-only").forEach((n) => (n.hidden = !signup));
    document.querySelectorAll(".auth-login-only").forEach((n) => (n.hidden = signup || reset));
    // choosing a new password asks for it twice, and nothing else
    if (reset) el("auth-password-again").closest(".field").hidden = false;
    document.body.classList.toggle("auth-resetting", reset);
    el("auth-forgot-note").hidden = true;
    el("auth-title").textContent = reset ? "Choose a new password" : signup ? "Create an account" : "Sign in";
    el("auth-switch-text").textContent = reset ? "Remembered it?" : signup ? "Already have an account?" : "Don't have an account?";
    el("auth-switch").textContent = signup || reset ? "Sign in" : "Create an account";
    el("apple-label").textContent = signup ? "Sign up with Apple" : "Sign in with Apple";
    el("google-label").textContent = signup ? "Sign up with Google" : "Sign in with Google";
    el("auth-submit").textContent = reset ? "Save new password" : signup ? "Create account" : "Sign in";
    document.querySelector('label[for="auth-password"]').textContent = reset ? "New password" : "Password";
    el("auth-password").autocomplete = signup || reset ? "new-password" : "current-password";
    el("auth-password").placeholder = signup || reset ? "At least 8 characters and a special character" : "Enter your password";
    show_auth_error("");
}

// a brand new google or apple account needs the terms box first, so the form switches to sign up and points at it
function show_provider_error(text) {
    if (text.includes("Tick the box") && auth.mode !== "signup") set_auth_mode("signup");
    show_auth_error(text);
    if (text.includes("Tick the box")) el("auth-agree").focus();
}

function show_auth_error(text) {
    const box = el("auth-error");
    box.textContent = text;
    if (text && text.includes(support_email())) {
        box.insertAdjacentHTML("beforeend", ` <a class="support-link" href="mailto:${escape_html(support_email())}" data-help="turned_off">Write to us</a>`);
    }
    box.hidden = !text;
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
                callback: (reply) => send_provider_token("/api/auth/google", { credential: reply.credential, agreed: !!el("auth-agree")?.checked, ref: invited_by() }, state.me ? (text) => alert(text) : show_provider_error),
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
            width: Math.min(400, slot.clientWidth || 360),
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
        await send_provider_token("/api/auth/apple", { id_token: reply.authorization.id_token, name, agreed: !!el("auth-agree")?.checked, ref: invited_by() }, on_error);
    } catch (error) {
        // closing apple's window isn't an error worth showing
        if (error?.error !== "popup_closed_by_user") on_error("Sign in with Apple didn't finish. Try again.");
    }
}

// where students write for help, from the server's settings
function support_email() {
    return auth.config?.support_email || "studywithrahah@gmail.com";
}

// emailing for help, gmail opens with a short message already written for the trouble
// chip is the label on the account tab's help card, the others come from their own links
const help_messages = {
    broken: { chip: "Something isn't working", subject: "Something isn't working", lines: ["Something in Rahah isn't working for me.", "", "What I was doing:", "What happened:"], device: true },
    unsafe: { chip: "Report something unsafe", subject: "Reporting something unsafe", lines: ["I want to report something unsafe or upsetting in Rahah.", "", "What happened:", "The chat or test it was in:"] },
    limit: { chip: "My daily limit", subject: "Question about my daily limit", lines: ["I've run out of my daily study limit and would like to ask about it."] },
    reset: { chip: "Password reset", subject: "Password reset", lines: ["I've forgotten my password and need a new one. I'm writing from the email on my account."] },
    account: { chip: "Account question", subject: "Account question", lines: ["I have a question about my account:"] },
    other: { chip: "Something else", subject: "Question about Rahah", lines: ["My question:"] },
    turned_off: { subject: "My account was turned off", lines: ["My account has been turned off. Could you tell me why, or turn it back on?"] },
};

// who's writing, from the account, or on the sign in page from what they typed
function help_sender() {
    if (state.me) return { username: state.me.username, email: state.me.email };
    const typed = (el("auth-login")?.value || el("auth-username")?.value || "").trim();
    return typed.includes("@") ? { email: typed } : { username: typed };
}

function help_body(kind) {
    const m = help_messages[kind] || help_messages.other;
    const who = help_sender();
    const details = [
        who.username ? `Username: ${who.username}` : "Username:",
        who.email ? `Email on my account: ${who.email}` : "",
        m.device ? `Device: ${navigator.userAgentData?.platform || navigator.platform || "unknown"}, ${navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] || "browser"}` : "",
    ].filter(Boolean);
    const subject = who.username ? `${m.subject}, @${who.username}` : m.subject;
    return { subject, body: ["Hi Rahah team,", "", ...m.lines, "", ...details, "", "Thanks"].join("\n") };
}

// a computer opens gmail's compose window in a new tab, a phone opens the gmail app
function open_help_email(kind) {
    const { subject, body } = help_body(kind);
    const to = support_email();
    const enc = encodeURIComponent;
    const mailto = `mailto:${to}?subject=${enc(subject)}&body=${enc(body)}`;
    const agent = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(agent)) {
        // the gmail app on iphone has its own link, and the phone's own mail app takes over if it isn't installed
        const started = Date.now();
        location.href = `googlegmail:///co?to=${enc(to)}&subject=${enc(subject)}&body=${enc(body)}`;
        setTimeout(() => {
            if (document.visibilityState === "visible" && Date.now() - started < 2000) location.href = mailto;
        }, 900);
        return;
    }
    if (/Android/i.test(agent)) {
        // email links open gmail, the mail app on most android phones
        location.href = mailto;
        return;
    }
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(subject)}&body=${enc(body)}`, "_blank", "noopener");
}

// every help link anywhere goes through here
document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-help]");
    if (!link) return;
    event.preventDefault();
    open_help_email(link.dataset.help);
});

async function set_up_providers() {
    const config_for_help = await auth_config();
    if (config_for_help.support_email) {
        el("auth-forgot-note").querySelectorAll(".support-link").forEach((link) => {
            link.textContent = `Email ${config_for_help.support_email}`;
            link.href = `mailto:${config_for_help.support_email}?subject=Password%20reset`;
        });
    }
    const config = await auth_config();
    el("auth-providers").hidden = !config.google_client_id && !config.apple_client_id;
    el("apple-button").hidden = !config.apple_client_id;
    el("auth-google").hidden = !config.google_client_id;
    if (config.google_client_id) draw_google_button(el("google-button"));
}

el("apple-button").addEventListener("click", () => apple_sign_in(show_provider_error));

async function finish_sign_in(me) {
    // a new account, or the admin signing in, is asked for the code that was just emailed
    if (me.two_step || me.verify_email) return show_two_step(me);
    if (remember_me(me)) await forget_saved_data();
    remember_me(me);
    // a fresh sign in starts the hour away again
    try {
        localStorage.setItem(active_key, String(Date.now()));
    } catch (e) {}
    // a fresh start loads everything for this student, on the shared link they came from if there was one
    let next = "#/";
    try {
        next = sessionStorage.getItem("rahah-after-sign-in") || "#/";
        sessionStorage.removeItem("rahah-after-sign-in");
    } catch (e) {}
    location.hash = next;
    location.reload();
}

el("auth-switch").addEventListener("click", () => {
    set_auth_mode(auth.mode === "login" ? "signup" : "login");
    (auth.mode === "login" ? el("auth-login") : el("auth-username")).focus();
});
el("auth-forgot").addEventListener("click", async () => {
    const note = el("auth-forgot-note");
    if (!note.hidden) {
        note.hidden = true;
        return;
    }
    const config = await auth_config();
    const help = `<a class="support-link" href="mailto:${escape_html(support_email())}?subject=Password%20reset" data-help="reset">Email ${escape_html(support_email())}</a>`;
    note.innerHTML = config.reset_by_email
        ? `Type your username or email above and we'll email you a link to choose a new password.
            <button class="btn btn-soft btn-small auth-send-reset" type="button" id="auth-send-reset">Email me a link</button>
            <span class="auth-reset-sent" id="auth-reset-sent" hidden></span>
            <span class="auth-reset-help">Can't get into that email? ${help}.</span>`
        : `${help} and we'll set you a new password. The message is written for you, just send it from the email on your account.`;
    note.hidden = false;
});

el("auth-forgot-note").addEventListener("click", async (event) => {
    const button = event.target.closest("#auth-send-reset");
    if (!button) return;
    const login = el("auth-login").value.trim();
    if (!login) {
        show_auth_error("Type your username or email first.");
        el("auth-login").focus();
        return;
    }
    button.disabled = true;
    show_auth_error("");
    try {
        await api("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login }) });
        el("auth-reset-sent").textContent = "If that account exists, a link is on its way. Check your inbox and spam, it works for 30 minutes.";
        el("auth-reset-sent").hidden = false;
    } catch (error) {
        show_auth_error(error.message);
    }
    button.disabled = false;
});

// the link in a reset email opens this, the sign in page asking for a new password
function show_reset(token) {
    auth.reset_token = token;
    document.body.classList.add("signed-out");
    el("auth").hidden = false;
    set_auth_mode("reset");
    requestAnimationFrame(draw_auth_art);
    el("auth-password").focus();
}

// the halftone picture beside the form
// a seeded random keeps the same picture on every visit, it only stretches to fit
// the picture is kept as a small map of how dark each spot is, and redrawn here as diamond dots at the screen's
// own size, so it stays sharp on any screen and takes the page's colours
const auth_picture = { tones: null, width: 0, height: 0, loading: null };

function load_auth_picture() {
    if (!auth_picture.loading) {
        auth_picture.loading = new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                const off = document.createElement("canvas");
                off.width = image.width;
                off.height = image.height;
                const octx = off.getContext("2d");
                octx.drawImage(image, 0, 0);
                const data = octx.getImageData(0, 0, image.width, image.height).data;
                // dark is 1 and white is 0
                auth_picture.tones = new Float32Array(image.width * image.height);
                for (let i = 0; i < auth_picture.tones.length; i += 1) auth_picture.tones[i] = 1 - data[i * 4] / 255;
                auth_picture.width = image.width;
                auth_picture.height = image.height;
                resolve();
            };
            image.onerror = () => resolve();
            image.src = "/static/img/auth-art.png";
        });
    }
    return auth_picture.loading;
}

// how dark the picture is at a point, blended between its neighbours so the shading is smooth
function picture_tone(x, y) {
    const { tones, width, height } = auth_picture;
    const fx = Math.min(Math.max(x, 0), width - 1.001);
    const fy = Math.min(Math.max(y, 0), height - 1.001);
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const at = (cx, cy) => tones[cy * width + cx];
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
}

async function draw_auth_art() {
    const canvas = el("auth-art");
    if (!canvas || el("auth").hidden || getComputedStyle(canvas).display === "none") return;
    await load_auth_picture();
    if (!auth_picture.tones) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    // dark dots on the light page and light dots on the dark one, the page's own text colour
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#edf5fa";
    ctx.globalAlpha = 0.92;

    // the picture covers the panel, centred, the way a background photo would
    const scale = Math.max(width / auth_picture.width, height / auth_picture.height);
    const left = (width - auth_picture.width * scale) / 2;
    const top = (height - auth_picture.height * scale) / 2;

    // dots on a diagonal grid, every other row shifted half a step, sized by how dark the picture is under them
    const step = 11;
    const half = step / 2;
    for (let row = 0, y = 0; y < height + step; row += 1, y += half) {
        for (let x = (row % 2) * half; x < width + step; x += step) {
            const tone = Math.min(Math.max((picture_tone((x - left) / scale, (y - top) / scale) - 0.06) / 0.78, 0), 1);
            if (tone < 0.07) continue;
            const r = half * Math.min(0.9, Math.sqrt(tone) * 0.95);
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

// the six digit code from the email: to finish a new account, or the admin's second step, which can trust this device
function show_two_step(info) {
    const signup = Boolean(info.verify_email);
    const card = document.querySelector(".auth-card");
    card.classList.add("two-step");
    el("auth-title").textContent = "Check your email";
    card.querySelector(".two-step-form")?.remove();
    const form = document.createElement("form");
    form.className = "auth-form two-step-form";
    form.noValidate = true;
    form.innerHTML = `
        <p class="auth-hint">We sent a 6-digit code to ${escape_html(info.to)}${signup ? " to check it's yours" : ""}. It works for 10 minutes.</p>
        <div class="field">
            <label class="field-label" for="two-step-code">Code</label>
            <input class="text-input auth-input" id="two-step-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code">
        </div>
        ${signup ? "" : '<label class="auth-agree"><input type="checkbox" id="two-step-trust" checked><span>Trust this device for 30 days</span></label>'}
        <p class="sheet-error" id="two-step-error" role="alert" hidden></p>
        <button class="btn btn-accent auth-submit" type="submit">${signup ? "Create account" : "Verify"}</button>
        <button class="auth-link two-step-back" type="button">${signup ? "Go back" : "Use a different account"}</button>`;
    el("auth-form").after(form);
    el("two-step-code").focus();
    form.querySelector(".two-step-back").addEventListener("click", () => {
        // going back from a new account keeps what was typed, so a wrong email can be fixed
        if (!signup) return location.reload();
        form.remove();
        card.classList.remove("two-step");
        el("auth-title").textContent = "Create an account";
        el("auth-submit").disabled = false;
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = form.querySelector(".auth-submit");
        button.disabled = true;
        try {
            const response = await api(signup ? "/api/auth/signup/verify" : "/api/auth/two-step", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(signup
                    ? { ticket: info.ticket, code: el("two-step-code").value }
                    : { ticket: info.ticket, code: el("two-step-code").value, trust: el("two-step-trust").checked }),
            });
            await finish_sign_in(await response.json());
        } catch (error) {
            const note = el("two-step-error");
            note.textContent = error.message;
            note.hidden = false;
            button.disabled = false;
            el("two-step-code").select();
        }
    });
}

el("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (auth.mode === "reset") {
        save_new_password();
        return;
    }
    const signup = auth.mode === "signup";
    const password = el("auth-password").value;
    const body = signup
        ? { username: el("auth-username").value.trim(), email: el("auth-email").value.trim(), password, agreed: el("auth-agree").checked, ref: invited_by() }
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
    if (signup && !el("auth-agree").checked) {
        show_auth_error("Tick the box to agree to the terms first.");
        el("auth-agree").focus();
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
        // the cursor goes to whichever part was wrong
        if (!signup && error.message.startsWith("There's no account")) el("auth-login").select();
        if (!signup && error.message.startsWith("That password")) el("auth-password").select();
    }
});

async function save_new_password() {
    const password = el("auth-password").value;
    if (!password) {
        show_auth_error("Choose a new password.");
        return;
    }
    if (password !== el("auth-password-again").value) {
        show_auth_error("The passwords don't match.");
        el("auth-password-again").focus();
        return;
    }
    el("auth-submit").disabled = true;
    show_auth_error("");
    try {
        const response = await api("/api/auth/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: auth.reset_token, password }),
        });
        await finish_sign_in(await response.json());
    } catch (error) {
        show_auth_error(error.message);
        el("auth-submit").disabled = false;
    }
}

async function sign_out() {
    await sign_out_of_push();
    try {
        await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    await forget_saved_data();
    try {
        localStorage.removeItem("rahah-user");
        localStorage.removeItem(active_key);
    } catch (e) {}
    location.hash = "#/";
    location.reload();
}

// the account tab, who's signed in, their details, connected accounts, password, usage and limits

function show_account() {
    if (state.busy) return;
    enter_page("#/account", "Account", '<div class="performance account-page" id="account"><div id="account-box"></div><div id="pro-slot"></div><div id="usage-slot"></div><div class="account-rest" id="account-rest"></div></div>');
    render_account();
    render_usage();
    sync_view();
    load_usage();
}

thread.addEventListener("change", async (event) => {
    // from the pen on the picture at the top, or the button on the picture card, the student crops it first
    if (!event.target.matches("[data-photo-input]") || !event.target.files[0]) return;
    const file = event.target.files[0];
    event.target.value = "";
    const cropped = await crop_photo(file);
    if (cropped) upload_profile_photo(cropped);
});

async function upload_profile_photo(blob) {
    account_note("photo-note", "Uploading your photo…");
    try {
        const form = new FormData();
        form.append("file", blob, "photo.jpg");
        state.me = await (await api("/api/me/photo", { method: "POST", body: form })).json();
        remember_me(state.me);
        render_account();
        render_me_face();
    } catch (error) {
        account_note("photo-note", error.message);
    }
}

// cropping: the photo fills a square, the student drags it and zooms until the part they want sits in the
// circle, and that square is cut out at 512 pixels. gives null if they cancel
const crop = { k: 1, base: 1, x: 0, y: 0, w: 0, h: 0, size: 0, done: null, drag: null };

function crop_place() {
    const shown_w = crop.w * crop.k, shown_h = crop.h * crop.k;
    crop.x = Math.min(0, Math.max(crop.size - shown_w, crop.x));
    crop.y = Math.min(0, Math.max(crop.size - shown_h, crop.y));
    const image = el("crop-image");
    image.style.width = `${shown_w}px`;
    image.style.height = `${shown_h}px`;
    image.style.transform = `translate(${crop.x}px, ${crop.y}px)`;
}

function crop_zoom_to(zoom) {
    // zooming keeps the middle of the circle on the same spot of the photo
    const middle_x = (crop.size / 2 - crop.x) / crop.k, middle_y = (crop.size / 2 - crop.y) / crop.k;
    crop.k = crop.base * zoom;
    crop.x = crop.size / 2 - middle_x * crop.k;
    crop.y = crop.size / 2 - middle_y * crop.k;
    crop_place();
}

function crop_photo(file) {
    return new Promise((resolve) => {
        const image = el("crop-image");
        const url = URL.createObjectURL(file);
        crop.done = (result) => {
            crop.done = null;
            URL.revokeObjectURL(url);
            if (el("crop-sheet").open) el("crop-sheet").close();
            resolve(result);
        };
        image.onload = () => {
            el("crop-sheet").showModal();
            crop.size = el("crop-stage").clientWidth;
            crop.w = image.naturalWidth;
            crop.h = image.naturalHeight;
            crop.base = crop.size / Math.min(crop.w, crop.h);
            crop.k = crop.base;
            crop.x = (crop.size - crop.w * crop.k) / 2;
            crop.y = (crop.size - crop.h * crop.k) / 2;
            el("crop-zoom").value = 1;
            crop_place();
        };
        image.onerror = () => {
            account_note("photo-note", "That file isn't a photo Rahah can open.");
            crop.done(null);
        };
        image.src = url;
    });
}

async function crop_result() {
    const image = el("crop-image");
    const side = crop.size / crop.k;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.round(Math.min(512, side));
    canvas.getContext("2d").drawImage(image, -crop.x / crop.k, -crop.y / crop.k, side, side, 0, 0, canvas.width, canvas.height);
    return await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.9));
}

el("crop-zoom").addEventListener("input", (event) => crop_zoom_to(Number(event.target.value)));
el("crop-stage").addEventListener("wheel", (event) => {
    event.preventDefault();
    const zoom = Math.min(4, Math.max(1, Number(el("crop-zoom").value) - event.deltaY * 0.002));
    el("crop-zoom").value = zoom;
    crop_zoom_to(zoom);
}, { passive: false });
el("crop-stage").addEventListener("pointerdown", (event) => {
    crop.drag = { id: event.pointerId, x: event.clientX - crop.x, y: event.clientY - crop.y };
    el("crop-stage").setPointerCapture(event.pointerId);
});
el("crop-stage").addEventListener("pointermove", (event) => {
    if (!crop.drag || crop.drag.id !== event.pointerId) return;
    crop.x = event.clientX - crop.drag.x;
    crop.y = event.clientY - crop.drag.y;
    crop_place();
});
["pointerup", "pointercancel"].forEach((name) => el("crop-stage").addEventListener(name, () => (crop.drag = null)));
el("crop-use").addEventListener("click", async () => crop.done?.(await crop_result()));
["crop-cancel", "crop-close"].forEach((id) => el(id).addEventListener("click", () => crop.done?.(null)));
el("crop-sheet").addEventListener("close", () => crop.done?.(null));

// the student's picture beside rahah's name at the top, a way to the account tab
function render_me_face() {
    const slot = el("me-face");
    if (!slot) return;
    slot.hidden = !state.me;
    // signed in, the student's picture takes the logo's place beside rahah's name
    document.body.classList.toggle("has-face", Boolean(state.me));
    slot.classList.toggle("pro", Boolean(state.me?.pro && !state.me?.is_admin));
    slot.classList.toggle("max", state.me?.tier === "max" && !state.me?.is_admin);
    // pro or max beside rahah's name
    const tier = el("nav-tier");
    if (tier) tier.innerHTML = state.me && !state.me.is_admin ? tier_badge(state.me.tier) : "";
    if (state.me) slot.innerHTML = face_html(state.me.photo, state.me.name || state.me.username, "tiny");
}

function render_account() {
    const me = state.me;
    const box = el("account-box");
    if (!box || !me) return;
    const shown = me.name || me.username;
    // profile and password sit side by side as two tall cards, students and usage stay full width below
    box.innerHTML = `
        <div class="account-grid">
        <section class="perf-card">
            <div class="account-row">
                <label class="face-edit" title="Change your picture" aria-label="Change your picture">
                    ${face_html(me.photo, shown)}
                    <span class="face-pen" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></span>
                    <input type="file" accept="image/*" hidden data-photo-input>
                </label>
                <span class="account-text"><strong>${escape_html(shown)}${me.is_admin ? "" : tier_badge(me.tier)}</strong><small>@${escape_html(me.username)}${me.is_admin ? " · Admin" : ""}</small></span>
                <button class="btn btn-ghost btn-small" type="button" data-sign-out>Sign out</button>
            </div>
            <div class="switch-row">
                <span><strong>Low-data mode</strong><small>Shorter answers, smaller photos, no web search</small></span>
                <button class="switch" type="button" role="switch" aria-checked="${Boolean(state.settings?.low_data)}" aria-label="Low-data mode" data-low-data-toggle><span></span></button>
            </div>
            ${me.is_admin ? `<div class="switch-row">
                <span><strong>Show me on the leaderboard</strong><small>Off keeps the admin account off every leaderboard</small></span>
                <button class="switch" type="button" role="switch" aria-checked="${Boolean(me.on_board)}" aria-label="Show me on the leaderboard" data-board-toggle><span></span></button>
            </div>` : ""}
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
                <p>At least 8 characters and a special character. ${me.has_password ? "Changing it signs you out on your other devices." : "Then you can also sign in with your username or email."} ${auth.config?.reset_by_email && me.email ? "Forgot it? We can email you a link to choose a new one." : `Forgot it? <a class="support-link" href="mailto:${escape_html(support_email())}?subject=Password%20reset" data-help="reset">Email us for a new one</a>.`}</p>
            </div>
            <div class="account-fields">
                ${me.has_password ? '<input class="text-input" type="password" id="password-current" autocomplete="current-password" placeholder="Current password">' : ""}
                <input class="text-input" type="password" id="password-new" autocomplete="new-password" placeholder="New password">
                <input class="text-input" type="password" id="password-again" autocomplete="new-password" placeholder="Repeat the new password">
            </div>
            <div class="account-actions">
                <button class="btn btn-soft btn-small" type="button" data-save-password>Save password</button>
                ${auth.config?.reset_by_email && me.email ? '<button class="btn btn-ghost btn-small" type="button" data-send-reset>Reset password</button>' : ""}
                <p class="field-hint" id="password-note" hidden></p>
            </div>
        </section>
        </div>`;
    // friends, the parent report, invites, help and deleting the account sit below as cards side by side
    el("account-rest").innerHTML = `
        <section class="perf-card">
            <div class="perf-head">
                <h3>Your picture</h3>
                <p>Choose a photo from your gallery. Friends and students on the leaderboard can see it.</p>
            </div>
            <div class="photo-row">
                ${face_html(me.photo, shown, "large")}
                <label class="btn btn-soft btn-small">
                    <input type="file" id="photo-pick" accept="image/*" hidden data-photo-input>${me.photo ? "Change photo" : "Choose a photo"}
                </label>
                ${me.photo ? '<button class="btn btn-ghost btn-small" type="button" data-photo-remove>Remove</button>' : ""}
                <p class="field-hint" id="photo-note" hidden></p>
            </div>
        </section>
        <section class="perf-card">
            <div class="perf-head">
                <h3>Friend search</h3>
                <p>Let others find you by username or name. They only see your username and first name.</p>
            </div>
            <div class="choices" role="group" aria-label="Friend search">
                <button class="choice" type="button" data-findable="0" aria-pressed="${!me.findable}">Off</button>
                <button class="choice" type="button" data-findable="1" aria-pressed="${Boolean(me.findable)}">On</button>
            </div>
        </section>
        ${me.is_admin ? "" : `<section class="perf-card">
            <div class="perf-head">
                <h3>Weekly report for a parent ${me.pro ? "" : '<span class="pro-badge">Pro</span>'}</h3>
                <p>${me.pro ? "Every Sunday evening, a short email on how your week went." : "A short email every Sunday on how your week went. Starts once you're on Pro."}</p>
            </div>
            <input class="text-input" id="parent-email" type="email" maxlength="200" autocomplete="off" placeholder="Parent or guardian's email" value="${escape_html(me.parent_email || "")}">
            <div class="account-actions">
                <button class="btn btn-soft btn-small" type="button" data-save-parent>Save</button>
                ${me.parent_email ? '<button class="btn btn-ghost btn-small" type="button" data-remove-parent>Remove</button>' : ""}
                <p class="field-hint" id="parent-note" hidden></p>
            </div>
        </section>
        <section class="perf-card" id="invite-card" hidden></section>`}
        <section class="perf-card">
            <div class="perf-head">
                <h3>Help</h3>
                <p>Pick a topic and Gmail opens with a message ready to send. What Rahah keeps is on the <a class="support-link" href="/privacy" target="_blank" rel="noopener">privacy page</a>, and the rules are in the <a class="support-link" href="/terms" target="_blank" rel="noopener">terms</a></p>
            </div>
            <div class="help-choices">${Object.entries(help_messages).filter(([, m]) => m.chip).map(([kind, m]) =>
                `<a class="btn btn-soft btn-small" href="mailto:${escape_html(support_email())}" data-help="${kind}">${escape_html(m.chip)}</a>`).join("")}</div>
        </section>
        <div id="account-end"></div>
        ${me.is_admin ? `<section class="perf-card account-wide">
            <div class="perf-head">
                <h3>Students</h3>
                <p>Usage, daily limits, new passwords and turning accounts off</p>
            </div>
            <a class="btn btn-accent btn-small" href="#/admin">Manage students</a>
        </section>` : ""}`;
    render_account_links();
    render_delete_card();
    render_pro_card();
}

// rahah pro and max on the account tab: free, pro and max as cards side by side, with a switch for how long.
// the icons are rahah's own chevrons, one more for each step up
const plan_details = {
    free: { name: "Free", tag: "Try Rahah", note: "Free for every student", steps: 1,
        features: ["Ask anything, any subject", "Tests, flashcards and summaries", "Mage, 10 answers a day", "5 web searches a day", "5 photo markings a day", "Files up to about 40 pages", "Your 5 newest chats", "Friends and leaderboard"] },
    pro: { name: "Pro", tag: "For steady study", steps: 2, popular: true, plus: "Everything in Free, plus:",
        features: ["10x the daily limit", "Unlimited Mage", "Unlimited web searches and photo marking", "All your chats, searchable", "Weekly report for a parent", "Files up to about 100 pages", "200 notes, double uploads"] },
    max: { name: "Max", tag: "For intense study", steps: 3, plus: "Everything in Free, plus:",
        features: ["20x the daily limit", "Unlimited Mage", "Unlimited web searches and photo marking", "All your chats, searchable", "Weekly report for a parent", "Files up to about 200 pages", "500 notes, double uploads", "A Max badge on the leaderboard"] },
};
const plan_lengths = { week: "Week", month: "Month", term: "Term" };

// a small pro or max badge
function tier_badge(tier) {
    return tier ? `<span class="pro-badge${tier === "max" ? " max" : ""}">${tier === "max" ? "Max" : "Pro"}</span>` : "";
}

function plan_icon(steps) {
    const rows = Array.from({ length: steps }, (_, i) => `<path d="M8 ${30 - i * 7}l12-8 12 8" opacity="${1 - i * 0.18}"/>`).join("");
    return `<svg class="plan-icon" viewBox="0 0 40 40" aria-hidden="true">${rows}</svg>`;
}

async function render_pro_card() {
    const slot = el("pro-slot");
    if (!slot || !state.me || state.me.is_admin) return;
    try {
        state.pro = await (await api("/api/pro")).json();
    } catch (error) {
        return;
    }
    draw_plans();
}

function draw_plans() {
    if (!el("pro-slot") || !state.pro?.enabled) return;
    const pro = state.pro.pro;
    const now_tier = pro?.active ? pro.tier : null;
    const length = state.plan_length || "month";
    const day = (seconds) => new Date(seconds * 1000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    const tick = '<svg class="plan-tick" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9"/><path d="M6 10.2l2.7 2.6L14 7.6"/></svg>';
    const usd = (n) => `$${n % 1 ? n.toFixed(2) : n}`;
    const card = (id, price, note, button, dollars = 0) => {
        const d = plan_details[id];
        return `<article class="plan-card${d.popular ? " popular" : ""}">
            ${d.popular ? '<span class="plan-flag">Most popular</span>' : ""}
            ${plan_icon(d.steps)}
            <h3 class="plan-name">${d.name}</h3>
            <p class="plan-tag">${d.tag}</p>
            <p class="plan-price">${usd(dollars)}${id === "free" ? "" : `<small> / ${length}</small>`}</p>
            <p class="plan-note">${note}</p>
            ${button}
            <div class="plan-line"></div>
            ${d.plus ? `<p class="plan-plus">${d.plus}</p>` : ""}
            <ul class="plan-features">${d.features.map((f) => `<li>${tick}<span>${escape_html(f)}</span></li>`).join("")}</ul>
        </article>`;
    };
    const free = card("free", 0, plan_details.free.note, state.pro.trial
        ? '<button class="btn btn-soft plan-btn" type="button" data-pro-trial>Try Pro free for 3 days</button>'
        : `<button class="btn btn-soft plan-btn" type="button" disabled>${now_tier ? "Free plan" : "Your plan"}</button>`);
    const paid = ["pro", "max"].map((tier) => {
        const p = state.pro.plans.find((x) => x.id === `${tier}_${length}`);
        if (!p) return "";
        const span = { week: "A week", month: "A month", term: "A term of 3 months" }[length];
        const label = now_tier === "pro" && tier === "max" ? "Upgrade to Max"
            : now_tier ? `Add a ${plan_details[tier].name} ${length}` : `Get ${plan_details[tier].name}`;
        return card(tier, p.price, `${span} · about $${(p.usd / p.days).toFixed(2)} a day`,
            `<button class="btn ${tier === "pro" ? "btn-accent" : "btn-soft"} plan-btn" type="button" data-pro-plan="${p.id}">${label}</button>`, p.usd);
    }).join("");
    // the exam day pass, a quick top up for the day before an exam
    const day_pass = state.pro.plans.find((p) => p.id === "day");
    const day_strip = day_pass ? `<div class="day-pass">
        ${plan_icon(1)}
        <span><strong>Exam tomorrow?</strong><small>24 hours of 5x study for ${usd(day_pass.usd)}.</small></span>
        <button class="btn btn-soft btn-small" type="button" data-pro-plan="day">Get exam day</button>
    </div>` : "";
    const name = now_tier === "max" ? "Max" : "Pro";
    const sub_line = !pro ? "Need more study time? Pay once with M-Pesa or card. Nothing renews."
        : !pro.active ? `Your pass is used up. You're on the free limit until ${day(pro.until)}.`
        : now_tier === "max" && pro.until > pro.max_until + 60 ? `You're on Max until ${day(pro.max_until)}, then Pro until ${day(pro.until)}.`
        : `You're on ${name} until ${day(pro.until)}.` + (now_tier === "pro" ? " Max starts right away, and your Pro days carry on after it." : " New passes start after this one.");
    el("pro-slot").innerHTML = `<section class="plans">
        <div class="plans-head">
            <div>
                <h2 class="plans-title">Plans ${tier_badge(now_tier)}</h2>
                <p class="plans-sub">${sub_line}</p>
            </div>
            <div class="plan-length" role="group" aria-label="How long">
                ${Object.entries(plan_lengths).map(([k, v]) => `<button type="button" class="${k === length ? "on" : ""}" aria-pressed="${k === length}" data-plan-length="${k}">${v}</button>`).join("")}
            </div>
        </div>
        <div class="plan-grid">${free}${paid}</div>
        ${day_strip}
        <p class="field-hint plans-note" id="pro-note">Paid through Paystack in shillings, at about KES ${state.pro.kes_per_usd} to $1. We never see your card or M-Pesa PIN.</p>
    </section>`;
    // where the plans are a swipe row, it opens on pro
    const grid = el("pro-slot").querySelector(".plan-grid");
    const pro_card = grid.querySelector(".plan-card.popular");
    if (pro_card && grid.scrollWidth > grid.clientWidth) {
        grid.scrollLeft += pro_card.getBoundingClientRect().left - grid.getBoundingClientRect().left - (grid.clientWidth - pro_card.offsetWidth) / 2;
    }
    render_invite_card();
}

thread.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-plan-length]");
    if (!pick) return;
    state.plan_length = pick.dataset.planLength;
    draw_plans();
});

// bringing friends: 24 hours of pro free for each friend who joins with the link and buys a pass
function render_invite_card() {
    const box = el("invite-card");
    if (!box || !state.pro) return;
    box.hidden = false;
    box.innerHTML = `
        <div class="perf-head">
            <h3>Invite friends</h3>
            <p>Get 24 hours of Pro free for each friend who joins with your link and buys a pass.</p>
        </div>
        <input class="text-input" readonly value="${escape_html(state.pro.invite)}" aria-label="Your invite link">
        <div class="account-actions">
            ${navigator.share ? '<button class="btn btn-soft btn-small" type="button" data-invite-share>Share</button>' : ""}
            <button class="btn btn-soft btn-small" type="button" data-invite-copy>Copy link</button>
            <p class="field-hint" id="invite-note">${state.pro.invite_days ? `You've earned ${plural(state.pro.invite_days, "free day")} so far.` : ""}</p>
        </div>`;
}

thread.addEventListener("click", async (event) => {
    if (event.target.closest("[data-invite-share]")) {
        try {
            await navigator.share({ title: "Rahah", text: "Study with me on Rahah, it's free:", url: state.pro.invite });
        } catch (e) {}
    }
    if (event.target.closest("[data-invite-copy]")) {
        try {
            await navigator.clipboard.writeText(state.pro.invite);
            account_note("invite-note", "Copied. Send it to a friend.");
        } catch (e) {
            account_note("invite-note", state.pro.invite);
        }
    }
    const trial = event.target.closest("[data-pro-trial]");
    if (trial) {
        trial.disabled = true;
        try {
            await api("/api/pro/trial", { method: "POST" });
            state.me = (await load_me()) || state.me;
            remember_me(state.me);
            render_account();
            render_me_face();
            load_usage();
            load_history();
        } catch (error) {
            trial.disabled = false;
            account_note("pro-note", error.message);
        }
    }
});

thread.addEventListener("click", async (event) => {
    const plan = event.target.closest("[data-pro-plan]");
    if (!plan) return;
    plan.disabled = true;
    account_note("pro-note", "Opening Paystack…");
    try {
        const { url, access_code, reference } = await (await api("/api/pro/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: plan.dataset.proPlan }),
        })).json();
        // paystack's checkout opens on top of rahah. if its script can't load, paystack's own page takes the
        // payment instead and sends the student back here
        const Pop = access_code ? await paystack_popup() : null;
        if (!Pop) {
            location.href = url;
            return;
        }
        new Pop().resumeTransaction(access_code, {
            onSuccess: () => verify_payment(reference),
            onCancel: () => {
                plan.disabled = false;
                account_note("pro-note", "Payment closed. You weren't charged.");
            },
            onError: () => {
                location.href = url;
            },
        });
        account_note("pro-note", "Paid through Paystack. We never see your card or M-Pesa PIN.");
    } catch (error) {
        plan.disabled = false;
        account_note("pro-note", error.message);
    }
});

// paystack's popup script, loaded only when a student goes to pay, so nobody else downloads it
function paystack_popup() {
    const ready = () => window.PaystackPop || window.Paystack || null;
    if (ready()) return Promise.resolve(ready());
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://js.paystack.co/v2/inline.js";
        script.onload = () => resolve(ready());
        script.onerror = () => resolve(null);
        setTimeout(() => resolve(ready()), 15000);
        document.head.appendChild(script);
    });
}

// a payment is checked with the server before anything changes
async function verify_payment(reference) {
    try {
        const result = await (await api(`/api/pro/verify/${encodeURIComponent(reference)}`)).json();
        state.me = await load_me() || state.me;
        remember_me(state.me);
        render_me_face();
        if (result.status === "paid" && result.pro) {
            const p = result.pro;
            const date = (t) => new Date(t * 1000).toLocaleDateString();
            alert(p.tier === "max" && p.until > p.max_until + 60
                ? `You're on Max until ${date(p.max_until)}, then Pro until ${date(p.until)}. Enjoy!`
                : `You're on ${p.tier === "max" ? "Max" : "Pro"} until ${date(p.until)}. Enjoy!`);
        } else {
            alert("That payment didn't go through, so you weren't charged. Try again any time.");
        }
    } catch (error) {
        alert(error.message);
    }
    if (el("pro-slot")) {
        render_account();
        load_usage();
    }
}

// back from paystack, the payment is checked with the server before anything changes
async function finish_pro_payment() {
    const params = new URLSearchParams(location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (!params.get("paid") || !reference) return;
    history.replaceState(null, "", "/#/account");
    await verify_payment(reference);
}

// deleting the account sits last on the page, behind a second step, and the admin can't delete theirs here
function render_delete_card(open = false) {
    const me = state.me;
    const slot = el("account-end");
    if (!slot || !me) return;
    if (me.is_admin) {
        slot.innerHTML = "";
        return;
    }
    const check = me.has_password
        ? '<input class="text-input" type="password" id="delete-check" autocomplete="current-password" placeholder="Your password">'
        : `<input class="text-input" id="delete-check" autocomplete="off" placeholder="Type ${escape_html(me.username)} to confirm">`;
    slot.innerHTML = `<section class="perf-card delete-card">
        <div class="perf-head">
            <h3>Delete account</h3>
            <p>Deletes your account and everything in it. This can't be undone.</p>
        </div>
        ${open ? `<div class="account-fields">${check}</div>
        <div class="account-actions">
            <button class="btn btn-soft btn-small delete-go" type="button" data-delete-confirm>Delete my account for good</button>
            <button class="btn btn-ghost btn-small" type="button" data-delete-cancel>Keep it</button>
            <p class="field-hint" id="delete-note" hidden></p>
        </div>` : '<button class="btn btn-ghost btn-small delete-go" type="button" data-delete-open>Delete my account</button>'}
    </section>`;
    if (open) el("delete-check").focus();
}

el("thread").addEventListener("click", async (event) => {
    if (!event.target.closest("#account-end")) return;
    if (event.target.closest("[data-delete-open]")) render_delete_card(true);
    if (event.target.closest("[data-delete-cancel]")) render_delete_card(false);
    const go = event.target.closest("[data-delete-confirm]");
    if (!go) return;
    const typed = el("delete-check").value;
    go.disabled = true;
    try {
        await api("/api/me/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.me.has_password ? { password: typed } : { confirm: typed.trim() }),
        });
        // everything kept on this device for offline use goes too, then back to the sign in page
        await forget_saved_data();
        try {
            localStorage.removeItem("rahah-user");
        } catch (e) {}
        location.hash = "#/";
        location.reload();
    } catch (error) {
        go.disabled = false;
        account_note("delete-note", error.message);
    }
});

// connected accounts, and a way to connect google or apple to an account made with a password
async function render_account_links() {
    const me = state.me;
    const slot = el("account-links");
    const config = await auth_config();
    if (!slot || !me || (!config.google_client_id && !config.apple_client_id)) return;
    const done = (name) => `<span class="account-linked">${icons.check}${name} connected</span>`;
    // the logos come from the sign in page's own buttons, so both places look the same
    const google_logo = el("auth-google").querySelector(".google-logo").outerHTML;
    const apple_logo = el("apple-button").querySelector(".apple-logo").outerHTML;
    slot.innerHTML = `
        ${config.google_client_id ? (me.google ? done("Google") : `<div class="auth-provider auth-google account-provider">
            <span class="auth-provider-face" aria-hidden="true">${google_logo}<span>Connect Google</span></span>
            <div class="auth-google-hit" id="google-connect"></div>
        </div>`) : ""}
        ${config.apple_client_id ? (me.apple ? done("Apple") : `<button class="auth-provider account-provider" type="button" data-connect-apple>${apple_logo}<span>Connect Apple</span></button>`) : ""}`;
    if (config.google_client_id && !me.google) draw_google_button(el("google-connect"), "signin_with");
}

function account_note(id, text) {
    el(id).textContent = text;
    el(id).hidden = false;
}

thread.addEventListener("click", async (event) => {
    if (!event.target.closest("#account-box, #account-rest")) return;
    if (event.target.closest("[data-low-data-toggle]")) save_settings({ low_data: !state.settings.low_data });
    if (event.target.closest("[data-board-toggle]")) {
        try {
            state.me = await (await api("/api/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ on_board: !state.me.on_board }),
            })).json();
            remember_me(state.me);
            render_account();
        } catch (error) {
            account_note("profile-note", error.message);
        }
    }
    if (event.target.closest("[data-photo-remove]")) {
        try {
            state.me = await (await api("/api/me/photo", { method: "DELETE" })).json();
            remember_me(state.me);
            render_account();
            render_me_face();
        } catch (error) {
            alert(error.message);
        }
    }
    const parent_save = event.target.closest("[data-save-parent]");
    const parent_remove = event.target.closest("[data-remove-parent]");
    if (parent_save || parent_remove) {
        try {
            state.me = await (await api("/api/me/parent", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: parent_remove ? "" : el("parent-email").value }),
            })).json();
            remember_me(state.me);
            render_account();
            account_note("parent-note", parent_remove ? "Removed." : state.me.pro ? "Saved. The first report comes on Sunday." : "Saved. Reports start once you're on Pro.");
        } catch (error) {
            account_note("parent-note", error.message);
        }
    }
    const findable = event.target.closest("[data-findable]");
    if (findable) {
        try {
            state.me = await (await api("/api/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ findable: findable.dataset.findable === "1" }),
            })).json();
            remember_me(state.me);
            render_account();
        } catch (error) {
            alert(error.message);
        }
    }
    // a forgotten password, the same emailed link as the sign in page, sent to the email on the account
    const reset = event.target.closest("[data-send-reset]");
    if (reset) {
        reset.disabled = true;
        try {
            await api("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: state.me.email }) });
            account_note("password-note", `A link is on its way to ${state.me.email}. Check your inbox and spam, it works for 30 minutes.`);
        } catch (error) {
            account_note("password-note", error.message);
            reset.disabled = false;
        }
    }
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

// someone opening a friend's invite link, remembered until they sign up
function remember_invite() {
    const ref = new URLSearchParams(location.search).get("ref");
    if (!ref) return;
    try {
        localStorage.setItem("rahah-ref", ref.slice(0, 40));
    } catch (e) {}
    history.replaceState(null, "", location.pathname + location.hash);
}

function invited_by() {
    try {
        return localStorage.getItem("rahah-ref") || "";
    } catch (e) {
        return "";
    }
}

function done_booting() {
    document.body.classList.remove("booting");
}

// signing out after an hour away. the last time the student did something is kept on the device, so it
// counts across tabs and after the page was closed or the phone slept. reminders keep coming
const active_key = "rahah-active";
let marked_active = 0;

function mark_active() {
    const now = Date.now();
    if (now - marked_active < 30 * 1000) return;
    marked_active = now;
    try {
        localStorage.setItem(active_key, String(now));
    } catch (e) {}
}

function away_too_long(me = state.me) {
    const limit = (me?.idle_minutes || 0) * 60 * 1000;
    let last = marked_active;
    try {
        last = Math.max(last, Number(localStorage.getItem(active_key)) || 0);
    } catch (e) {}
    return limit > 0 && last > 0 && Date.now() - last > limit;
}

async function sign_out_idle() {
    if (sign_out_idle.going) return;
    sign_out_idle.going = true;
    try {
        await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    await forget_saved_data();
    try {
        localStorage.removeItem("rahah-user");
        localStorage.removeItem(active_key);
        sessionStorage.setItem("rahah-idle", "1");
    } catch (e) {}
    location.hash = "#/";
    location.reload();
}

function check_away() {
    if (state.me && away_too_long()) sign_out_idle();
}

["pointerdown", "keydown", "wheel", "touchmove", "input"].forEach((name) =>
    document.addEventListener(name, (event) => {
        if (event.isTrusted && state.me && !away_too_long()) mark_active();
    }, { passive: true, capture: true }));
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check_away());
setInterval(check_away, 60 * 1000);

async function start() {
    // if anything goes wrong on the way, the page still shows
    setTimeout(done_booting, 5000);
    remember_invite();
    const reset = location.hash.match(/^#\/reset\/([\w-]{20,200})$/);
    if (reset) {
        await auth_config();
        show_reset(reset[1]);
        done_booting();
        return;
    }
    const me = await load_me();
    // back after more than an hour away, signed out first
    if (me && away_too_long(me)) {
        await sign_out_idle();
        return;
    }
    if (!me) {
        try {
            if (sessionStorage.getItem("rahah-idle")) {
                sessionStorage.removeItem("rahah-idle");
                el("auth-idle-note").hidden = false;
            }
        } catch (e) {}
        // a shared link waits until they've signed in or made an account
        if (location.hash.startsWith("#/shared/")) {
            try {
                sessionStorage.setItem("rahah-after-sign-in", location.hash);
            } catch (e) {}
            auth.mode = "signup";
            el("auth-shared-note").hidden = false;
        }
        // a refresh on create account stays on create account
        if (location.hash === "#/signup") auth.mode = "signup";
        await show_auth();
        done_booting();
        return;
    }
    state.me = me;
    await auth_config();
    if (remember_me(me)) await forget_saved_data();
    remember_me(me);
    render_account();
    render_me_face();
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
    await finish_pro_payment();
    send_timezone();
    try {
        await route();
    } catch (e) {}
    place_composer();
    done_booting();
    start_study_clock();
    setTimeout(offer_install, 4000);
    focus_input();
}

start();

// installing rahah as an app needs a service worker, it only steps in to show a page when offline
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// a small card offering to install rahah as an app: a button where the browser can install it, the steps on
// an iphone, where safari can't. never once it's installed, and closing it keeps it away for two weeks
let install_event = null;
const install_later_key = "rahah-install-later";

function installed_app() {
    return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function install_put_off() {
    try {
        return Date.now() - (Number(localStorage.getItem(install_later_key)) || 0) < 14 * 86400 * 1000;
    } catch (e) {
        return false;
    }
}

function offer_install() {
    if (!state.me || installed_app() || install_put_off() || document.querySelector(".install-toast")) return;
    if (!install_event && !iphone_browser) return;
    const toast = document.createElement("div");
    toast.className = "toast install-toast";
    toast.innerHTML = `<img class="toast-logo" src="/static/img/icon-192.png" alt="" aria-hidden="true">
        <div class="toast-text"><strong>Install Rahah</strong><span>${install_event
            ? "Open it like an app."
            : "Tap Share, then Add to Home Screen."}</span></div>
        <div class="toast-actions">
            ${install_event ? '<button class="btn btn-accent btn-small" type="button" data-install>Install</button>' : ""}
            <button class="icon-btn" type="button" data-install-later aria-label="Not now">${icons.close}</button>
        </div>`;
    el("toasts").appendChild(toast);
}

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    install_event = event;
    offer_install();
});

window.addEventListener("appinstalled", () => {
    install_event = null;
    document.querySelector(".install-toast")?.remove();
});

el("toasts").addEventListener("click", async (event) => {
    if (event.target.closest("[data-install-later]")) {
        try {
            localStorage.setItem(install_later_key, String(Date.now()));
        } catch (e) {}
        document.querySelector(".install-toast")?.remove();
    }
    if (event.target.closest("[data-install]") && install_event) {
        const prompt = install_event;
        install_event = null;
        document.querySelector(".install-toast")?.remove();
        prompt.prompt();
        try {
            const { outcome } = await prompt.userChoice;
            if (outcome !== "accepted") localStorage.setItem(install_later_key, String(Date.now()));
        } catch (e) {}
    }
});

// out of today's study limit somewhere outside a chat, like making a test: a card at the top with the way to the plans
function offer_upgrade() {
    if (!state.me || state.me.is_admin || document.querySelector(".upgrade-toast")) return;
    const toast = document.createElement("div");
    toast.className = "toast upgrade-toast";
    toast.innerHTML = `<img class="toast-logo" src="/static/img/icon-192.png" alt="" aria-hidden="true">
        <div class="toast-text"><strong>You've used today's study limit</strong><span>Upgrade for 10 times more each day.</span></div>
        <div class="toast-actions">
            <button class="btn btn-accent btn-small" type="button" data-upgrade>Upgrade</button>
            <button class="icon-btn" type="button" data-toast-close aria-label="Dismiss">${icons.close}</button>
        </div>`;
    el("toasts").appendChild(toast);
}

document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-upgrade]")) return;
    event.target.closest(".upgrade-toast")?.remove();
    go_to_plans();
});
