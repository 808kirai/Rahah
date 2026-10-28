// hand drawn sketches for the cards, simple line drawings on a 64 by 64 grid
// the rough filter in index.html makes the lines wobble like pencil, and each line draws itself in once

const sketches = {
    bulb: '<path d="M32 10c-9 0-15 7-15 15 0 6 3 9 6 12 2 2 3 4 3 7h12c0-3 1-5 3-7 3-3 6-6 6-12 0-8-6-15-15-15z"/><path d="M26 49h12M27 54h10"/><path d="M32 3v3M13 11l2 2M51 11l-2 2M6 25h4M54 25h4"/>',
    graph: '<path d="M10 54h46M14 58V8"/><path d="M18 14c4 26 9 34 14 34s10-8 14-34"/><path d="M50 50l-2-2M8 12l6-6 6 6"/>',
    sigma: '<path d="M46 14H18l15 18-15 18h28"/><path d="M46 14v5M46 50v-5"/>',
    pi: '<path d="M12 22c9-4 29-4 40-2"/><path d="M25 21c0 12-3 22-8 30"/><path d="M41 20c-1 11 0 22 7 29"/>',
    triangle: '<path d="M10 52L32 12l22 40z"/><path d="M19 52c0-3 1-6 3-8"/><path d="M32 12v40"/><path d="M32 47h5v5"/>',
    calculator: '<path d="M18 8h28v48H18z"/><path d="M23 14h18v10H23z"/><path d="M25 32h2M31 32h2M37 32h2M25 40h2M31 40h2M37 40h2M25 48h2M31 48h2M37 48h2"/>',
    chart: '<path d="M10 54h46"/><path d="M16 54V40M28 54V30M40 54V36M52 54V22"/><path d="M13 32l13-11 12 7 15-15"/><path d="M47 13h6v6"/>',
    flask: '<path d="M26 8h12M28 8v16L14 50c-2 4 0 6 4 6h28c4 0 6-2 4-6L36 24V8"/><path d="M19 42c6-3 10 3 16 0s8-2 10 0"/><path d="M29 34c1 0 2 1 2 2M37 30c1 0 1 1 1 2"/>',
    atom: '<ellipse cx="32" cy="32" rx="25" ry="9"/><ellipse cx="32" cy="32" rx="25" ry="9" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="25" ry="9" transform="rotate(-60 32 32)"/><circle cx="32" cy="32" r="3"/>',
    bolt: '<path d="M37 6L17 36h14l-4 22 21-32H34z"/><path d="M10 14l4 2M50 46l4 2"/>',
    planet: '<circle cx="32" cy="32" r="14"/><ellipse cx="32" cy="32" rx="27" ry="8" transform="rotate(-18 32 32)"/><path d="M10 10l2 2M12 10l-2 2M52 52l2 2M54 52l-2 2M50 10h3"/>',
    dna: '<path d="M20 6c0 13 24 13 24 26S20 45 20 58"/><path d="M44 6c0 13-24 13-24 26s24 13 24 26"/><path d="M22 10h20M27 27h10M27 37h10M22 54h20"/>',
    cell: '<path d="M32 8c14 0 25 9 24 23s-11 25-25 25S8 47 8 33 18 8 32 8z"/><circle cx="34" cy="30" r="8"/><path d="M17 41c3-2 6-1 7 2M44 16c3 1 4 3 3 6M42 45h5M20 22h3"/>',
    leaf: '<path d="M12 52C12 26 28 10 54 10c0 26-16 42-42 42z"/><path d="M12 52L44 20"/><path d="M24 40h11M32 32V21M38 26h8"/>',
    heart: '<path d="M32 54S8 40 8 22c0-7 5-12 12-12 6 0 10 4 12 8 2-4 6-8 12-8 7 0 12 5 12 12 0 18-24 32-24 32z"/><path d="M14 30h10l4-8 6 16 4-8h12"/>',
    brain: '<path d="M30 12c-4-3-10-2-12 2-5 0-9 5-7 10-4 3-4 9 0 12-2 5 1 10 6 11 1 4 6 6 10 4 2 2 5 2 7 0V12"/><path d="M34 12c4-3 10-2 12 2 5 0 9 5 7 10 4 3 4 9 0 12 2 5-1 10-6 11-1 4-6 6-10 4"/><path d="M19 25c3 0 6 2 6 5M45 25c-3 0-6 2-6 5M19 40c3-1 6 0 8 3M45 40c-3-1-6 0-8 3"/>',
    code: '<path d="M22 16L10 32l12 16"/><path d="M42 16l12 16-12 16"/><path d="M37 11l-10 42"/>',
    laptop: '<path d="M13 14h38v28H13z"/><path d="M6 48h52l-4 7H10z"/><path d="M19 22l6 5-6 5M29 34h10"/>',
    bug: '<ellipse cx="32" cy="36" rx="12" ry="16"/><path d="M26 21c0-5 3-8 6-8s6 3 6 8"/><path d="M32 22v30M20 30l-9-4M20 38H9M21 46l-8 5M44 30l9-4M44 38h11M43 46l8 5M28 13l-4-6M36 13l4-6"/>',
    database: '<ellipse cx="32" cy="14" rx="18" ry="6"/><path d="M14 14v34c0 3 8 6 18 6s18-3 18-6V14"/><path d="M14 31c0 3 8 6 18 6s18-3 18-6"/>',
    gear: '<circle cx="32" cy="32" r="14"/><circle cx="32" cy="32" r="5"/><path d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6"/>',
    book: '<path d="M32 16c-6-4-14-6-24-6v38c10 0 18 2 24 6 6-4 14-6 24-6V10c-10 0-18 2-24 6z"/><path d="M32 16v38"/><path d="M14 20c4 0 8 1 12 3M38 23c4-2 8-3 12-3M14 30c4 0 8 1 12 3"/>',
    quill: '<path d="M52 8C36 10 23 24 19 44l-4 12"/><path d="M52 8c-2 15-13 28-31 34"/><path d="M26 30h10M22 38h8"/><path d="M8 57h22"/>',
    speech: '<path d="M8 10h30v19H21l-8 7v-7H8z"/><path d="M28 36h28v16h-5v7l-8-7H28z"/><path d="M14 18h18M14 23h11M34 44h16"/>',
    globe: '<circle cx="32" cy="32" r="23"/><ellipse cx="32" cy="32" rx="10" ry="23"/><path d="M10 25h44M10 39h44"/>',
    columns: '<path d="M8 22L32 8l24 14z"/><path d="M10 22h44"/><path d="M15 26v24M25 26v24M39 26v24M49 26v24"/><path d="M8 54h48"/>',
    castle: '<path d="M12 56V26h8v6h6v-6h12v6h6v-6h8v30"/><path d="M28 56V44c0-2 2-4 4-4s4 2 4 4v12"/><path d="M8 56h48"/><path d="M32 26V12l8 3-8 3"/>',
    clock: '<circle cx="32" cy="34" r="22"/><path d="M32 22v12l9 6"/><path d="M26 6h12M32 6v6"/>',
    checklist: '<path d="M16 10h32v46H16z"/><path d="M26 6h12v8H26z"/><path d="M22 25l3 3 6-6M22 38l3 3 6-6"/><path d="M36 25h8M36 38h8M22 49h22"/>',
    cards: '<path d="M10 20h32v30H10z"/><path d="M20 20v-8h34v30h-12"/><path d="M17 31h18M17 38h11"/>',
    pencil: '<path d="M14 50L46 18l6 6-32 32H14z"/><path d="M41 23l6 6"/><path d="M14 50l6 6"/><path d="M8 58h18"/>',
    notes: '<path d="M16 8h24l10 10v38H16z"/><path d="M40 8v10h10"/><path d="M22 27h22M22 35h22M22 43h14"/>',
    trophy: '<path d="M20 10h24v12c0 8-5 14-12 14s-12-6-12-14z"/><path d="M20 14h-8c0 8 4 12 8 12M44 14h8c0 8-4 12-8 12"/><path d="M32 36v10M26 46h12v8H26zM20 56h24"/>',
    target: '<circle cx="30" cy="34" r="20"/><circle cx="30" cy="34" r="12"/><circle cx="30" cy="34" r="4"/><path d="M30 34L54 10M48 8l6 2 2 6"/>',
    magnifier: '<circle cx="27" cy="27" r="16"/><path d="M39 39l15 15"/><path d="M19 22c2-4 5-6 9-6"/>',
    rocket: '<path d="M32 6c9 7 13 17 12 30l-6 8H26l-6-8c-1-13 3-23 12-30z"/><circle cx="32" cy="24" r="5"/><path d="M20 36l-7 8 9 2M44 36l7 8-9 2"/><path d="M28 50l4 8 4-8"/>',
    music: '<path d="M24 46V14l26-6v32"/><ellipse cx="18" cy="46" rx="7" ry="5"/><ellipse cx="44" cy="40" rx="7" ry="5"/><path d="M24 22l26-6"/>',
    coins: '<ellipse cx="26" cy="44" rx="15" ry="6"/><path d="M11 44v-8c0-3 7-6 15-6s15 3 15 6v8"/><ellipse cx="40" cy="20" rx="15" ry="6"/><path d="M25 20v10M55 20v10c0 3-6 6-14 6"/>',
    people: '<circle cx="22" cy="20" r="8"/><circle cx="44" cy="24" r="7"/><path d="M8 54c0-11 6-18 14-18s14 7 14 18"/><path d="M34 40c2-2 6-4 10-4 7 0 12 6 12 16"/>',
    sun: '<circle cx="32" cy="32" r="11"/><path d="M32 6v8M32 50v8M6 32h8M50 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6"/>',
};

// the first words that match decide the sketch, so specific topics come before broad ones
const sketch_words = [
    [/\b(dna|gene|genetic|heredit|chromosom|replicat)/, "dna"],
    [/\b(cell|organelle|mitochond|nucle|membrane|osmosis|bacteri|virus|microb)/, "cell"],
    [/\b(plant|leaf|leaves|photosynth|ecolog|ecosystem|tree|flower|botan)/, "leaf"],
    [/\b(heart|blood|body|organ|anatom|health|medic|disease|circulat)/, "heart"],
    [/\b(brain|neuro|psycholog|memory|recall)/, "brain"],
    [/\b(atom|quantum|electron|proton|nuclear|particle|physics)/, "atom"],
    [/\b(electric|circuit|current|voltage|energy|power)/, "bolt"],
    [/\b(planet|space|star|astronom|orbit|galax|solar|moon)/, "planet"],
    [/\b(chemi|reaction|acid|molecul|compound|element|bond)/, "flask"],
    [/\b(sql|database|table|join|query)/, "database"],
    [/\b(bug|debug|error|fix|exception|traceback)/, "bug"],
    [/\b(recurs|algorithm|big o|complexity|sort|stack)/, "gear"],
    [/\b(project|build|app|website|web)/, "laptop"],
    [/\b(python|javascript|java|code|coding|program|function|loop|script|snippet|variable)/, "code"],
    [/\b(derivative|integral|calculus|differentiat|limit|parabola|curve)/, "graph"],
    [/\b(equation|algebra|series|sequence|sum|polynomial)/, "sigma"],
    [/\b(geometr|triangle|angle|trigonometr|pythag|circle)/, "triangle"],
    [/\b(statistic|probabilit|data|chart|plot|average|percent)/, "chart"],
    [/\b(square|number|arithmetic|fraction|pi\b)/, "pi"],
    [/\b(math|calculat)/, "calculator"],
    [/\b(castle|medieval|king|queen|knight)/, "castle"],
    [/\b(revolution|war|empire|ancient|histor|rome|greek)/, "columns"],
    [/\b(map|geograph|countr|world|climate|continent|ocean)/, "globe"],
    [/\b(econom|money|market|business|financ|trade)/, "coins"],
    [/\b(societ|politic|govern|people|culture|philosoph)/, "people"],
    [/\b(essay|writ|poem|poetry|literat|novel|author)/, "quill"],
    [/\b(grammar|vocab|language|spanish|french|german|translat|speak|word)/, "speech"],
    [/\b(read|book|chapter|story)/, "book"],
    [/\b(music|song)/, "music"],
    [/\b(flashcard|deck|cards)/, "cards"],
    [/\b(summar|notes|cram)/, "notes"],
    [/\b(exam|test|quiz|mark|question)/, "checklist"],
    [/\b(plan|schedule|time|deadline|calm)/, "clock"],
    [/\b(goal|target|weak|improve|review)/, "target"],
    [/\b(explore|research|find|investigat)/, "magnifier"],
    [/\b(next|challenge|launch|start)/, "rocket"],
];

const mode_sketches = {
    general: "bulb", maths: "graph", science: "flask", coding: "code",
    languages: "speech", humanities: "columns", exam: "checklist",
};

function sketch_for(text, mode) {
    const words = String(text || "").toLowerCase();
    const hit = sketch_words.find(([pattern]) => pattern.test(words));
    return hit ? hit[1] : mode_sketches[mode] || "bulb";
}

// every shape gets a path length of 1, so one dash setting draws any of them in
// a fainter second pass with a different wobble sits just off the first, like a pencil going over its line
function sketch_html(name, extra = "") {
    const shapes = (sketches[name] || sketches.bulb).replace(/<(path|circle|ellipse)\b/g, '<$1 pathLength="1"');
    return `<svg class="sketch${extra ? ` ${extra}` : ""}" viewBox="0 0 64 64" aria-hidden="true">
        <g class="pass" filter="url(#rough-2)" transform="translate(0.9 0.7)">${shapes}</g>
        <g filter="url(#rough)">${shapes}</g>
    </svg>`;
}
