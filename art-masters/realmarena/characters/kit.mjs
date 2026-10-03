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
