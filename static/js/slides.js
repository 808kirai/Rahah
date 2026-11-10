// rahah, the slides from the promo video on the sign in page, in a 3d stack that shuffles the same way as the
// certificates in runie's portfolio: the top slide swings open like a door and tucks in behind the deck while
// the rest step forward. it shuffles by itself every few seconds for everyone, reduced motion included as runie
// asked, and a tap shuffles it too

const slides = [
    ["meet", "Meet Rahah, your AI study companion."],
    ["explains", "Explains anything."],
    ["marks", "Marks your work."],
    ["notes", "Turns notes into tests and flashcards."],
    ["plans-light", "Plans your revision."],
    ["plans-dark", "Plans your revision, with reminders and a timetable."],
    ["progress", "Tracks your progress."],
    ["compete", "Compete with friends on the leaderboard."],
];
const slide_every_ms = 4000;
// how many slides fan out behind the top one, the rest wait unseen behind the last
const slide_fan = 3;
const slide_state = { cards: [], order: [], animating: false, paused_until: 0, timer: 0 };

// slides behind the top one fan out up and to the right, slightly turned
function slide_pose(pos) {
    if (pos === 0) return { transform: "translate3d(0, 0, 0) rotate(0deg)", filter: "brightness(1)", opacity: 1, z: 100 };
    const p = Math.min(pos, slide_fan);
    return {
        transform: `translate3d(${p * 16}px, ${p * -10}px, ${p * -40}px) rotate(${p * 4}deg)`,
        filter: `brightness(${1 - p * 0.08})`,
        opacity: pos > slide_fan ? 0 : 1,
        z: 100 - pos,
    };
}

function apply_slide_poses() {
    slide_state.order.forEach((index, pos) => {
        const card = slide_state.cards[index];
        const p = slide_pose(pos);
        card.style.transform = p.transform;
        card.style.filter = p.filter;
        card.style.opacity = p.opacity;
        card.style.zIndex = p.z;
    });
}

// the top slide goes to the back
function shuffle_slides() {
    const { cards } = slide_state;
    if (slide_state.animating || cards.length < 2) return;
    const old_order = slide_state.order.slice();
    const leaving = old_order[0];
    slide_state.order = old_order.slice(1).concat(leaving);
    slide_state.animating = true;
    const back = slide_pose(cards.length - 1);
    const moves = [];
    // the leaving slide swings open to the right like a door, then tucks in behind the deck, 1.5 times the portfolio's pace
    moves.push(cards[leaving].animate([
        { transform: slide_pose(0).transform, filter: "brightness(1)", opacity: 1, zIndex: 200, offset: 0 },
        { transform: "translate3d(62%, -6%, 60px) rotateY(-58deg) rotate(6deg)", filter: "brightness(1)", opacity: 1, zIndex: 200, offset: 0.45 },
        { transform: "translate3d(60%, -6%, -60px) rotateY(-50deg) rotate(6deg)", filter: "brightness(0.95)", opacity: 1, zIndex: 0, offset: 0.5 },
        { transform: back.transform, filter: back.filter, opacity: back.opacity, zIndex: 0, offset: 1 },
    ], { duration: 600, easing: "cubic-bezier(0.65, 0, 0.35, 1)" }));
    // everyone else steps one place forward
    slide_state.order.forEach((index, pos) => {
        if (index === leaving) return;
        const from = slide_pose(old_order.indexOf(index));
        const to = slide_pose(pos);
        moves.push(cards[index].animate([
            { transform: from.transform, filter: from.filter, opacity: from.opacity },
            { transform: to.transform, filter: to.filter, opacity: to.opacity },
        ], { duration: 467, delay: 80, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" }));
    });
    apply_slide_poses();
    Promise.all(moves.map((move) => move.finished)).finally(() => {
        slide_state.animating = false;
    });
}

// built the first time the sign in page shows on a wide screen, so phones never download the pictures
function start_slides() {
    const deck = el("slide-deck");
    if (!deck || slide_state.cards.length || el("auth").hidden || getComputedStyle(deck.closest(".auth-stage")).display === "none") return;
    slide_state.cards = slides.map(([name, words]) => {
        const card = document.createElement("div");
        card.className = "slide-card";
        card.innerHTML = `<img src="/static/img/slides/${name}.webp" alt="${escape_html(words)}" width="1280" height="720" decoding="async">`;
        deck.appendChild(card);
        return card;
    });
    slide_state.order = slides.map((_, i) => i);
    apply_slide_poses();
    deck.addEventListener("click", () => {
        slide_state.paused_until = Date.now() + 8000;
        shuffle_slides();
    });
    // shuffles by itself while the sign in page shows, like a slow photo carousel, resting a little after a tap
    slide_state.timer = setInterval(() => {
        if (el("auth").hidden || document.visibilityState !== "visible" || Date.now() < slide_state.paused_until) return;
        shuffle_slides();
    }, slide_every_ms);
}

// a window made wide enough while the sign in page shows starts them then
window.addEventListener("resize", () => {
    if (!slide_state.cards.length) start_slides();
});
