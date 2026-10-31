// rahah, the faces students can pick for their profile picture, drawn here so they stay sharp at any size
// each is a small picture on a coloured circle, with a mix of moods, girls and boys, and skin tones

const face_ink = "#1d1d1f";
const face_mouth = "#3b1d1d";

const face_parts = {
    eyes: '<circle cx="25" cy="34" r="2.3"/><circle cx="39" cy="34" r="2.3"/>',
    happy_eyes: `<path d="M21.5 35q3.5-4.5 7 0M35.5 35q3.5-4.5 7 0" fill="none" stroke="${face_ink}" stroke-width="2.3" stroke-linecap="round"/>`,
    sleepy_eyes: `<path d="M21.5 34.5q3.5 3 7 0M35.5 34.5q3.5 3 7 0" fill="none" stroke="${face_ink}" stroke-width="2.3" stroke-linecap="round"/>`,
    smile: `<path d="M25.5 41.5q6.5 6 13 0" fill="none" stroke="${face_ink}" stroke-width="2.4" stroke-linecap="round"/>`,
    grin: `<path d="M24 40.5h16q-1 9-8 9t-8-9z" fill="${face_mouth}"/><path d="M25.5 41h13v2.6h-13z" fill="#fff"/>`,
    smirk: `<path d="M27 43q5 2 10-1.5" fill="none" stroke="${face_ink}" stroke-width="2.4" stroke-linecap="round"/>`,
    small_mouth: `<path d="M29.5 44h5" stroke="${face_ink}" stroke-width="2.3" stroke-linecap="round"/>`,
    wow: `<ellipse cx="32" cy="44" rx="3.4" ry="4.4" fill="${face_mouth}"/>`,
    blush: '<circle cx="21" cy="41" r="3.2" fill="#ff8fa3" opacity="0.5"/><circle cx="43" cy="41" r="3.2" fill="#ff8fa3" opacity="0.5"/>',
    glasses: `<g fill="none" stroke="${face_ink}" stroke-width="2"><circle cx="25" cy="34" r="6"/><circle cx="39" cy="34" r="6"/><path d="M31 34h2M19 33l-3-1M45 33l3-1"/></g>`,
    shades: '<path d="M17 30h30v3c0 5-3.5 8-7.5 8-3 0-5.5-2-6.5-5-1 3-3.5 5-6.5 5-4 0-7.5-3-7.5-8z" fill="#101318"/><path d="M21 32.5l3-1.5" stroke="#6fd3ff" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>',
    stars: '<path d="M25 29.5l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5zM39 29.5l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z" fill="#ffd166"/>',
    brow_up: `<path d="M35 27.5q4-2.5 8 0" fill="none" stroke="${face_ink}" stroke-width="2" stroke-linecap="round"/>`,
    teeth: '<path d="M30 41.6h4v2.6h-4z" fill="#fff"/>',
    zz: '<path d="M46 14h6l-6 6h6M53 7h4l-4 4h4" fill="none" stroke="#cfe8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};

function face_head(skin) {
    return `<circle cx="32" cy="35" r="18.5" fill="${skin}"/><circle cx="13.8" cy="36" r="3.4" fill="${skin}"/><circle cx="50.2" cy="36" r="3.4" fill="${skin}"/>`;
}

// each face: its name, background, skin, hair drawn behind and in front of the head, and the face itself
const avatars = {
    puffs: {
        name: "Sunny", bg: "#0e5a73", skin: "#8d5524",
        back: '<circle cx="15" cy="17" r="8.5" fill="#1f1410"/><circle cx="49" cy="17" r="8.5" fill="#1f1410"/>',
        front: '<path d="M13.5 33a18.5 18.5 0 0 1 37 0c-5-6.5-11-9.5-18.5-9.5S18.5 26.5 13.5 33z" fill="#1f1410"/>',
        face: ["eyes", "grin", "blush"],
    },
    fade: {
        name: "Ace", bg: "#1e3a8a", skin: "#6b4226",
        front: '<path d="M13.6 31.5a18.5 18.5 0 0 1 36.8 0c-3-4.5-9-7.5-18.4-7.5S16.6 27 13.6 31.5z" fill="#141010"/>',
        face: ["eyes", "smile"],
    },
    nerd: {
        name: "Prof", bg: "#155e75", skin: "#c68642",
        front: '<path d="M13.5 32c0-11 8-18 18.5-18s18.5 7 18.5 18c-4-5.5-9-6-12-6l-3-4-3 4c-4 0-12 .5-19 6z" fill="#2b1c14"/>',
        face: ["glasses", "eyes", "smile", "teeth"],
    },
    cool: {
        name: "Blaze", bg: "#3b2f63", skin: "#5c3a1e",
        front: '<g fill="#111"><circle cx="20" cy="20" r="5"/><circle cx="27" cy="16" r="5"/><circle cx="35" cy="15.5" r="5"/><circle cx="42.5" cy="18.5" r="5"/><circle cx="47" cy="25" r="4.5"/><circle cx="16.5" cy="26" r="4.5"/></g>',
        face: ["shades", "smirk"],
    },
    braids: {
        name: "Pearl", bg: "#6b3f5f", skin: "#a0673a",
        back: '<g fill="#1a1210"><rect x="9.5" y="30" width="7" height="26" rx="3.5"/><rect x="47.5" y="30" width="7" height="26" rx="3.5"/></g><g fill="#c9a0ff"><circle cx="13" cy="56" r="3"/><circle cx="51" cy="56" r="3"/></g>',
        front: '<path d="M13.5 34a18.5 18.5 0 0 1 37 0c-3.5-8-10-11.5-18.5-11.5S17 26 13.5 34z" fill="#1a1210"/><path d="M32 16.5v8" stroke="#3a2a24" stroke-width="1.4"/>',
        face: ["happy_eyes", "smile", "blush"],
    },
    starry: {
        name: "Nova", bg: "#0b3a55", skin: "#e0ac69",
        front: '<path d="M13 30a19 19 0 0 1 38 0z" fill="#1fa3a3"/><rect x="12" y="27.5" width="40" height="6" rx="3" fill="#147a7a"/><circle cx="32" cy="10.5" r="3.6" fill="#ffd166"/>',
        face: ["stars", "grin"],
    },
    scarf: {
        name: "Amani", bg: "#2f5d50", skin: "#8d5524",
        back: '<path d="M9.5 60V36a22.5 23.5 0 0 1 45 0v24z" fill="#7fc8b0"/>',
        front: '<path d="M13.5 35a18.5 18.5 0 0 1 37 0" fill="none" stroke="#7fc8b0" stroke-width="4"/>',
        face: ["eyes", "brow_up", "smirk"],
    },
    sleepy: {
        name: "Snooze", bg: "#1b2a4a", skin: "#c68642",
        front: '<path d="M14 31c1-9 8-15 18-15 6 0 10 2 13 5l2-3 1 6c1.5 2 2.5 4.5 2.5 7-5-4-9-6-14-6l-2-3-2 3c-7 0-13 2-18.5 6z" fill="#3a2414"/>',
        face: ["sleepy_eyes", "small_mouth", "zz"],
    },
    bob: {
        name: "Zuri", bg: "#7a3e2e", skin: "#5c3a1e",
        back: '<path d="M11 44V33a21 21 0 0 1 42 0v11c0 3-2 4-4 4H15c-2 0-4-1-4-4z" fill="#0f0b0a"/>',
        front: '<path d="M13.5 33a18.5 18.5 0 0 1 37 0c-6-3-12-8-15-12-4 6-12 10-22 12z" fill="#0f0b0a"/>',
        face: ["eyes", "wow"],
    },
    beats: {
        name: "Kito", bg: "#12485e", skin: "#a0673a",
        back: '<path d="M10 37a22 22 0 0 1 44 0" fill="none" stroke="#2a2f3a" stroke-width="4.5" stroke-linecap="round"/>',
        front: '<path d="M14 30c2-8 9-13 18-13s16 5 18 13c-6-3-12-4-18-4s-12 1-18 4z" fill="#1b120e"/><rect x="6.5" y="31" width="8" height="12" rx="4" fill="#ff7a59"/><rect x="49.5" y="31" width="8" height="12" rx="4" fill="#ff7a59"/>',
        face: ["happy_eyes", "grin"],
    },
};

const avatar_ids = Object.keys(avatars);

function avatar_svg(id) {
    const a = avatars[id];
    if (!a) return "";
    const parts = a.face.map((p) => (p === "eyes" ? `<g fill="${face_ink}">${face_parts.eyes}</g>` : face_parts[p])).join("");
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="${a.bg}"/>${a.back || ""}${face_head(a.skin)}${a.front || ""}${parts}</svg>`;
}

// a student's picture, their chosen face, or the first letter of their name on a blue circle
function face_html(avatar, name, extra = "") {
    if (avatars[avatar]) return `<span class="avatar-face ${extra}" aria-hidden="true">${avatar_svg(avatar)}</span>`;
    return `<span class="account-avatar ${extra}" aria-hidden="true">${escape_html(String(name || "?").slice(0, 1).toUpperCase())}</span>`;
}
