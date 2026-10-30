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
    if (!changed("conversations", state.conversations)) return;
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
                add_user_message(m.text, m.files || []);
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
    input.focus({ preventScroll: true });
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
    requestAnimationFrame(draw_auth_art);
    (auth.mode === "login" ? el("auth-login") : el("auth-username")).focus();
}

function set_auth_mode(mode) {
    // leaving the reset screen drops the link from the address bar
    if (auth.mode === "reset" && mode !== "reset") history.replaceState(null, "", "/");
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
                callback: (reply) => send_provider_token("/api/auth/google", { credential: reply.credential, agreed: !!el("auth-agree")?.checked }, state.me ? (text) => alert(text) : show_provider_error),
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
        await send_provider_token("/api/auth/apple", { id_token: reply.authorization.id_token, name, agreed: !!el("auth-agree")?.checked }, on_error);
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
    if (remember_me(me)) await forget_saved_data();
    remember_me(me);
    // a fresh start loads everything for this student
    location.hash = "#/";
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
        el("auth-reset-sent").textContent = "If that account has an email, a link is on its way. It works for 30 minutes, so check your inbox and spam.";
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

el("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (auth.mode === "reset") {
        save_new_password();
        return;
    }
    const signup = auth.mode === "signup";
    const password = el("auth-password").value;
    const body = signup
        ? { username: el("auth-username").value.trim(), email: el("auth-email").value.trim(), password, agreed: el("auth-agree").checked }
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
        show_auth_error("Tick the box to agree to the terms and privacy page first.");
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
    enter_page("#/account", "Account", '<div class="performance account-page" id="account"><div id="account-box"></div><div id="usage-slot"></div><div id="account-end"></div></div>');
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
    // profile and password sit side by side as two tall cards, students and usage stay full width below
    box.innerHTML = `
        <div class="account-grid">
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
                <p>At least 8 characters and a special character. ${me.has_password ? "Changing it signs you out on your other devices." : "Then you can also sign in with your username or email."} Forgot it? <a class="support-link" href="mailto:${escape_html(support_email())}?subject=Password%20reset" data-help="reset">Email us for a new one</a>.</p>
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
        </div>
        <section class="perf-card">
            <div class="perf-head">
                <h3>Help</h3>
                <p>Pick what it's about and Gmail opens with a short message ready to send to ${escape_html(support_email())}. What Rahah keeps about you is on the <a class="support-link" href="/privacy" target="_blank" rel="noopener">privacy page</a>, and the rules are in the <a class="support-link" href="/terms" target="_blank" rel="noopener">terms</a></p>
            </div>
            <div class="help-choices">${Object.entries(help_messages).filter(([, m]) => m.chip).map(([kind, m]) =>
                `<a class="btn btn-soft btn-small" href="mailto:${escape_html(support_email())}" data-help="${kind}">${escape_html(m.chip)}</a>`).join("")}</div>
        </section>
        ${me.is_admin ? `<section class="perf-card">
            <div class="perf-head">
                <h3>Students</h3>
                <p>Everyone's usage, their daily limits, new passwords and turning accounts off</p>
            </div>
            <a class="btn btn-accent btn-small" href="#/admin">Manage students</a>
        </section>` : ""}`;
    render_account_links();
    render_delete_card();
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
            <p>Removes your account and everything in it: chats, tests, decks, notes, reminders and progress. This can't be undone.</p>
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
    const reset = location.hash.match(/^#\/reset\/([\w-]{20,200})$/);
    if (reset) {
        await auth_config();
        show_reset(reset[1]);
        return;
    }
    const me = await load_me();
    if (!me) {
        show_auth();
        return;
    }
    state.me = me;
    await auth_config();
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
