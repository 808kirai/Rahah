// rahah, the demo on the sign in page: a question typed and sent, the answer streamed in, then the flashcards
// chip pressed and a card flying out of it to flip to its answer. it plays once, the first time the sign in page
// shows on a wide screen, and stays on the finished picture. with reduced motion that picture shows straight away

const demo_question = "What is osmosis?";
const demo_answer = "Osmosis is water moving across a membrane, from where there's more water to where there's less. It needs no energy, which is why a raisin swells in a glass of water.";
let demo_played = false;

const demo_wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const demo_part = (name, open) => document.querySelector(`.demo-fold[data-part="${name}"]`).classList.toggle("open", open);

// every word is laid out at the start, so the answer grows in place as the words show
function demo_setup() {
    el("demo-stream").innerHTML = demo_answer.split(" ").map((word) => `<span class="w">${escape_html(word)}</span>`).join(" ");
    document.querySelector(".demo-logo").innerHTML = logo_mark;
}

// the picture the demo ends on: the question answered and its flashcard turned to the answer
function demo_finish() {
    demo_part("question", true);
    demo_part("answer", true);
    el("demo-stream").querySelectorAll(".w").forEach((word) => word.classList.add("on"));
    document.querySelector(".demo-actions").classList.add("on");
    el("demo-cards").classList.add("chosen");
    el("demo-card").style.opacity = 1;
    el("demo-card").classList.add("flipped");
}

// where an element's middle is, measured inside the demo
function demo_point(target) {
    const box = el("demo").getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    return { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 };
}

// the arrow's tip sits a little in from the corner of its box
const demo_tip = { x: 4.6, y: 2.8 };
let demo_at = { x: 0, y: 0 };

function demo_place(point) {
    demo_at = point;
    el("demo-cursor").style.transform = `translate(${point.x - demo_tip.x}px, ${point.y - demo_tip.y}px)`;
}

// the cursor travels on a shallow arc, longer moves take a little longer, easing out of the start and into the stop
async function demo_move(to) {
    const from = demo_at;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const bend = { x: (from.x + to.x) / 2 + (to.y - from.y) * 0.12, y: (from.y + to.y) / 2 - (to.x - from.x) * 0.12 };
    const frames = [];
    for (let i = 0; i <= 12; i += 1) {
        const t = i / 12;
        const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * bend.x + t ** 2 * to.x;
        const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * bend.y + t ** 2 * to.y;
        frames.push({ transform: `translate(${x - demo_tip.x}px, ${y - demo_tip.y}px)` });
    }
    const duration = Math.min(900, 350 + distance * 0.9);
    await el("demo-cursor").animate(frames, { duration, easing: "cubic-bezier(0.45, 0, 0.1, 1)" }).finished;
    demo_place(to);
}

// a press: the cursor dips and the thing under it squeezes
async function demo_click(target) {
    el("demo-cursor").animate([{ scale: 1 }, { scale: 0.85 }, { scale: 1 }], { duration: 220, easing: "ease-out" });
    target.classList.add("pressed");
    await demo_wait(120);
    target.classList.remove("pressed");
}

async function play_demo() {
    const demo = el("demo");
    if (!demo || demo_played || el("auth").hidden || getComputedStyle(demo.parentElement).display === "none") return;
    demo_played = true;
    demo_setup();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        demo_finish();
        return;
    }
    const composer = document.querySelector(".demo-composer");
    const draft = el("demo-draft");
    const send = el("demo-send");
    const cursor = el("demo-cursor");

    // the question is typed, then sent with the button
    await demo_wait(700);
    composer.classList.add("typing");
    for (const letter of demo_question) {
        draft.textContent += letter;
        await demo_wait(45);
    }
    send.classList.add("ready");
    const to_send = demo_point(send);
    demo_place({ x: to_send.x - 110, y: to_send.y - 46 });
    cursor.classList.add("on");
    await demo_wait(300);
    await demo_move(to_send);
    await demo_click(send);
    draft.textContent = "";
    composer.classList.remove("typing");
    send.classList.remove("ready");
    demo_part("question", true);

    // a moment of thinking, then the answer opens and streams in
    await demo_wait(450);
    demo_part("thinking", true);
    await demo_wait(1100);
    demo_part("thinking", false);
    demo_part("answer", true);
    await demo_wait(250);
    for (const word of el("demo-stream").querySelectorAll(".w")) {
        word.classList.add("on");
        await demo_wait(42);
    }
    await demo_wait(300);
    document.querySelector(".demo-actions").classList.add("on");

    // flashcards is pressed and a card flies out of the chip to sit over the window's edge, then turns over
    await demo_wait(700);
    const chip = el("demo-cards");
    await demo_move(demo_point(chip));
    await demo_click(chip);
    chip.classList.add("chosen");
    const card = el("demo-card");
    const from = demo_point(chip);
    const to = demo_point(card);
    const shrink = chip.getBoundingClientRect().width / card.getBoundingClientRect().width;
    card.style.opacity = 1;
    await card.animate(
        [{ opacity: 0, transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${shrink})` }, { opacity: 1, transform: "none" }],
        { duration: 800, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" },
    ).finished;
    await demo_wait(900);
    card.classList.add("flipped");
    await demo_wait(800);
    cursor.classList.remove("on");
}

// a window made wide enough while the sign in page shows plays it then
window.addEventListener("resize", () => {
    if (!demo_played) play_demo();
});
