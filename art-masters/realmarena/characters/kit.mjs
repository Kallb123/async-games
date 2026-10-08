// What every Realm Arena character is built from: the palette, and a body to
// dress. A character's master (`<characterId>.mjs` beside this) exports its
// parts, and `npm run ra-characters` draws it from every direction.
//
// Units are a square's side; the frame is the figure's own: x forward, y to
// its left, z up, the origin the middle of its square on the ground. A full
// height of the battlefield — what hides a figure (docs/games/realm-arena.md
// §25) — is `FULL_HEIGHT_UNITS`, about 0.82, and a figure stands a little
// over it. Parts are listed by the solid they're made of — see `solidOf` in
// scripts/lib/isoRender.mjs for each one's fields.

export { FULL_HEIGHT_UNITS } from '../../../scripts/lib/isoRender.mjs';

/**
 * Every material a character is drawn in. `team` is the owner's colour: it's
 * drawn a light grey and written to the team mask, so the board can tint it
 * per seat. `shine` takes a highlight; `glow` ignores the light.
 */
export const MATERIALS = {
    team: { colour: '#d9d6d0', team: true },
    skin: { colour: '#e2b48f' },
    hair: { colour: '#5a3a24' },
    beard: { colour: '#cfc8bd' },
    eye: { colour: '#241812' },
    steel: { colour: '#a9b1ba', shine: 0.55 },
    darkSteel: { colour: '#6d747d', shine: 0.4 },
    gold: { colour: '#d8a73c', shine: 0.5 },
    leather: { colour: '#7a5233' },
    darkLeather: { colour: '#4d3424' },
    wood: { colour: '#8d6238' },
    cloth: { colour: '#6f6a5f' },
    linen: { colour: '#e8e0cc' },
    forest: { colour: '#4f6b3a' },
    night: { colour: '#3a3d5c' },
    feather: { colour: '#efe9dc' },
    fire: { colour: '#ffb43a', glow: true },
    flame: { colour: '#ff6a1f', glow: true },
    // The Swarm's (§31): a dark shell, its pale underside, bone-white claws, and acid.
    chitin: { colour: '#4a3548', shine: 0.35 },
    belly: { colour: '#a8867a' },
    bone: { colour: '#e6dcc4', shine: 0.2 },
    sac: { colour: '#b9c66a', shine: 0.3 },
    acid: { colour: '#a6e03a', glow: true },
    // The Miners' (§33): a red beard, iron, brass, stone, dynamite and its
    // spark, a helmet lamp, and the runes' glow.
    ginger: { colour: '#b4612c' },
    iron: { colour: '#5d6168', shine: 0.45 },
    brass: { colour: '#c79a3e', shine: 0.55 },
    stone: { colour: '#8d877c' },
    dynamite: { colour: '#c4322a', shine: 0.25 },
    spark: { colour: '#ffe27a', glow: true },
    lamp: { colour: '#fff1b0', glow: true },
    rune: { colour: '#7fd8ff', glow: true },
};

/**
 * How a whole figure is drawn in each pose the board shows it in — one for
 * each of `CHARACTER_POSES` in src/games/RealmArena/art.ts. Fallen, it's laid
 * on its back, its head where its back was, and slid forward and up so it
 * lies on the ground across the middle of its square.
 */
export const POSES = {
    standing: {},
    fallen: { tilt: -90, shift: [0.34, 0, 0.09] },
};

/** The line drawn round a figure and between its parts. */
export const OUTLINE = { colour: '#22170f', width: 1, crease: 0.06 };

const SHOULDER_Z = 0.56;
const HIP_Z = 0.3;

/** Where a figure's head sits, for a hat or a helmet to sit on. */
export const HEAD = { at: [0, 0, 0.69], r: 0.105 };

/**
 * A body: legs, a torso, arms ending at `hands` and a head with eyes, so the
 * way it faces reads even before what it carries does. Every material is
 * picked by the caller, so the same body is a knight in steel or a mage in a
 * robe; leave `legs` out for a body whose robe hides them.
 *
 *   hands: { right: [x, y, z], left: [x, y, z] }, where each hand is held
 *   elbows: the same, where each arm bends (defaults halfway, dropped a little)
 */
export function body({
    torso, sleeves = torso, legs, boots = 'darkLeather', belt = 'leather', skin = 'skin',
    hands, elbows = {}, stance = 0.065, crouch = 0, head = true,
}) {
    const drop = crouch;
    const parts = [];
    if (legs) {
        for (const side of [1, -1]) {
            const y = side * stance;
            parts.push(
                { capsule: { from: [0, y * 0.8, HIP_Z - drop], to: [0.01, y, 0.07], r: 0.046 }, mat: legs },
                { ball: { at: [0.025, y, 0.04], r: [0.075, 0.047, 0.042] }, mat: boots },
            );
        }
    }
    parts.push(
        { ball: { at: [0, 0, 0.45 - drop], r: [0.1, 0.135, 0.17] }, mat: torso },
        { taper: { from: [0, 0, HIP_Z - 0.02 - drop], to: [0, 0, HIP_Z + 0.04 - drop], r: 0.118, r2: 0.112 }, mat: belt },
    );
    for (const [side, key] of [[-1, 'right'], [1, 'left']]) {
        const shoulder = [0, side * 0.14, SHOULDER_Z - drop];
        const hand = hands[key];
        const elbow = elbows[key] ?? [
            (shoulder[0] + hand[0]) / 2 - 0.02,
            (shoulder[1] + hand[1]) / 2 + side * 0.03,
            (shoulder[2] + hand[2]) / 2 - 0.04,
        ];
        parts.push(
            { ball: { at: shoulder, r: 0.058 }, mat: sleeves },
            { capsule: { from: shoulder, to: elbow, r: 0.04 }, mat: sleeves },
            { capsule: { from: elbow, to: hand, r: 0.036 }, mat: sleeves },
            { ball: { at: hand, r: 0.042 }, mat: skin },
        );
    }
    if (head) parts.push(...face({ skin, drop }));
    return parts;
}

/** A head, and the eyes that say which way it's looking. */
export function face({ skin = 'skin', drop = 0 } = {}) {
    const [x, y, z] = HEAD.at;
    return [
        { ball: { at: [x, y, z - drop], r: HEAD.r }, mat: skin },
        { ball: { at: [x + 0.093, y + 0.036, z + 0.008 - drop], r: 0.017 }, mat: 'eye' },
        { ball: { at: [x + 0.093, y - 0.036, z + 0.008 - drop], r: 0.017 }, mat: 'eye' },
    ];
}

/** A bow's limb, bent through `bend` from `from` to `to`, as a run of short capsules. */
export function arc(from, to, bend, { r, mat, steps = 6 }) {
    const point = s => from.map((f, i) => f + (to[i] - f) * s + bend[i] * 4 * s * (1 - s));
    const parts = [];
    for (let i = 0; i < steps; i++) parts.push({ capsule: { from: point(i / steps), to: point((i + 1) / steps), r }, mat });
    return parts;
}

/**
 * A many-jointed limb, the Swarm's (§31): a run of capsules from `from`
 * through each of `joints`, thinning as it goes, ending in a claw's point.
 */
export function limb(from, joints, { r, mat = 'chitin', tip = 'bone' }) {
    const points = [from, ...joints];
    const parts = [];
    for (let i = 0; i < points.length - 1; i++) {
        const thick = r * (1 - 0.25 * i / points.length);
        parts.push({ capsule: { from: points[i], to: points[i + 1], r: thick }, mat: i === points.length - 2 ? tip : mat });
    }
    return parts;
}

/** A limb and its mirror across the body: `from` and `joints` given for the left one (y > 0). */
export function limbPair(from, joints, options) {
    const mirror = ([x, y, z]) => [x, -y, z];
    return [...limb(from, joints, options), ...limb(mirror(from), joints.map(mirror), options)];
}

/** A pair of legs, from `hip` through `knee` to `foot`, given for the left one. */
export function legPair(hip, knee, foot, { r = 0.025, mat = 'chitin', tip = mat } = {}) {
    return limbPair(hip, [knee, foot], { r, mat, tip });
}

/** How far a dwarf stands below a man (§33): its body crouched by it, its legs the shorter for it. */
const DWARF_DROP = 0.1;

/** Where a dwarf's head sits, for its helmet and beard. */
export const DWARF_HEAD = { at: [HEAD.at[0], HEAD.at[1], HEAD.at[2] - DWARF_DROP], r: HEAD.r };

/**
 * A dwarf, the Miners' (§33): `body`, short in the leg and broad in the
 * chest, and a beard down to its belt. Takes `body`'s options, with
 * `girth` — the material its barrel chest is — and `beard`'s.
 */
export function dwarf({ girth, beard = 'ginger', ...options }) {
    const [x, , z] = DWARF_HEAD.at;
    return [
        ...body({ stance: 0.08, ...options, crouch: DWARF_DROP }),
        { ball: { at: [0.005, 0, 0.36], r: [0.125, 0.165, 0.15] }, mat: girth ?? options.torso },
        // The beard: full round the jaw, falling in a broad wedge to the belt.
        { ball: { at: [x + 0.06, 0, z - 0.05], r: [0.06, 0.095, 0.07] }, mat: beard },
        { taper: { from: [x + 0.08, 0, z - 0.06], to: [x + 0.11, 0, z - 0.3], r: 0.075, r2: 0.02 }, mat: beard },
        { box: { at: [x + 0.098, 0, z - 0.02], size: [0.02, 0.09, 0.022] }, mat: beard },
    ];
}

/**
 * A pick, the Miners' tool and weapon: a haft from `hand` up to `top`, and a
 * curved steel head across it, its point forward and its back spike behind.
 */
export function pick(hand, top, { haft = 'wood', head = 'steel', reach = 0.15 } = {}) {
    const [x, y, z] = top;
    return [
        { capsule: { from: [hand[0] - 0.02, hand[1], hand[2] - 0.07], to: top, r: 0.016 }, mat: haft },
        { ball: { at: top, r: 0.03 }, mat: head },
        { taper: { from: top, to: [x + reach * 0.6, y, z + 0.01], r: 0.026, r2: 0.018 }, mat: head },
        { taper: { from: [x + reach * 0.6, y, z + 0.01], to: [x + reach, y, z - 0.06], r: 0.018, r2: 0 }, mat: head },
        { taper: { from: top, to: [x - reach * 0.6, y, z - 0.04], r: 0.022, r2: 0 }, mat: head },
    ];
}

/** A stick of dynamite from `from` to `to`, its fuse out of the `to` end, lit when `lit`. */
export function dynamiteStick(from, to, { lit = false } = {}) {
    const [x, y, z] = to;
    const fuse = [x + (x - from[0]) * 0.5, y + (y - from[1]) * 0.5, z + (z - from[2]) * 0.5 + 0.02];
    return [
        { capsule: { from, to, r: 0.02 }, mat: 'dynamite' },
        { capsule: { from: to, to: fuse, r: 0.005 }, mat: 'darkLeather' },
        ...(lit ? [{ ball: { at: fuse, r: 0.022 }, mat: 'spark' }] : []),
    ];
}
