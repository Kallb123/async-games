// A small ray caster that draws a model built out of simple solids — boxes,
// balls, capsules and tapered cylinders — in the battlefield's isometric
// projection (src/utils/ui/isometric.ts), from any of the eight directions a
// figure on a square grid can face. `npm run ra-characters` draws Realm
// Arena's characters with it (scripts/realmarena-characters.mjs).
//
// The projection is the board's own: a true orthographic camera looking down
// at 30°, turned 45° to the grid, so a square is the 2:1 diamond every tile
// sheet draws and a full height (`FULL_HEIGHT`, four quarters) is half as tall
// on screen as a square is wide. In the model's own units — one square's side
// — that full height is √(2/3) ≈ 0.816 (`FULL_HEIGHT_UNITS`).
//
// A model is a plain list of parts, written in its own frame: x forward, y to
// its left, z up, the origin the middle of its square on the ground. Turning
// it to face a direction turns that frame; the camera and the light never
// move, so every direction is lit as the tile art is, from the upper left.

/** A full height of the battlefield, in a square's sides. */
export const FULL_HEIGHT_UNITS = Math.sqrt(2 / 3);

/**
 * The eight directions a figure can face, in the order a sheet's columns go:
 * named by where they point on screen with the board unturned, so `s` faces
 * the viewer. Index 0 faces along the grid's columns (down and right), and
 * each next one is 45° clockwise; the even ones face along the grid, the odd
 * ones across a diagonal. A figure facing grid direction `d` on a board turned
 * `r` quarters (`IsoRotation`) is drawn with the cell `(d + 2r) % 8`.
 */
export const FACINGS = ['se', 's', 'sw', 'w', 'nw', 'n', 'ne', 'e'];

// --- Vectors ---------------------------------------------------------------

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = a => Math.sqrt(dot(a, a));
const normalise = a => scale(a, 1 / (length(a) || 1));
const rad = degrees => degrees * Math.PI / 180;

/** Turns `v` about `axis` (a unit vector) by `angle` radians. */
function rotate(v, axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** A part's own axes, as three unit vectors in the model's frame. */
function basisFromRotation({ z = 0, y = 0, x = 0 } = {}) {
    // Roll about x, then pitch about y, then yaw about z: degrees, as a
    // master writes them.
    const turn = v => rotate(rotate(rotate(v, [1, 0, 0], rad(x)), [0, 1, 0], rad(y)), [0, 0, 1], rad(z));
    return [turn([1, 0, 0]), turn([0, 1, 0]), turn([0, 0, 1])];
}

/** Axes whose z runs from `from` to `to`, turned `roll` degrees about it. */
function basisAlong(from, to, roll = 0) {
    const zAxis = normalise(sub(to, from));
    const reference = Math.abs(zAxis[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1];
    let xAxis = normalise(cross(reference, zAxis));
    xAxis = rotate(xAxis, zAxis, rad(roll));
    return [xAxis, cross(zAxis, xAxis), zAxis];
}

// --- Solids ----------------------------------------------------------------
//
// Each is intersected in its own frame, where it's simplest: `toLocal` puts a
// ray there, and a hit's normal comes back out through the same axes. Every
// `hit` returns the nearest `{ t, normal }` in front of the ray, or null.

function toLocal(solid, origin, direction) {
    const offset = sub(origin, solid.centre);
    const [ax, ay, az] = solid.axes;
    return {
        o: [dot(offset, ax), dot(offset, ay), dot(offset, az)],
        d: [dot(direction, ax), dot(direction, ay), dot(direction, az)],
    };
}

const toWorld = (solid, n) =>
    normalise(add(add(scale(solid.axes[0], n[0]), scale(solid.axes[1], n[1])), scale(solid.axes[2], n[2])));

/** The nearer root of `a t² + b t + c` past `tMin`, or null. */
function nearestRoot(a, b, c, tMin, accept) {
    if (Math.abs(a) < 1e-12) return null;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].sort((p, q) => p - q);
    for (const t of roots) if (t > tMin && accept(t)) return t;
    return null;
}

const SOLIDS = {
    box(solid, origin, direction) {
        const { o, d } = toLocal(solid, origin, direction);
        let tNear = -Infinity, tFar = Infinity, axis = 0, sign = 1;
        for (let i = 0; i < 3; i++) {
            const half = solid.half[i];
            if (Math.abs(d[i]) < 1e-12) {
                if (Math.abs(o[i]) > half) return null;
                continue;
            }
            let t1 = (-half - o[i]) / d[i], t2 = (half - o[i]) / d[i];
            let s = -1;
            if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
            if (t1 > tNear) { tNear = t1; axis = i; sign = s; }
            tFar = Math.min(tFar, t2);
            if (tNear > tFar) return null;
        }
        if (tNear <= 0) return null;
        const n = [0, 0, 0];
        n[axis] = sign;
        return { t: tNear, normal: toWorld(solid, n) };
    },

    ball(solid, origin, direction) {
        const { o, d } = toLocal(solid, origin, direction);
        const [rx, ry, rz] = solid.radii;
        const os = [o[0] / rx, o[1] / ry, o[2] / rz], ds = [d[0] / rx, d[1] / ry, d[2] / rz];
        const t = nearestRoot(dot(ds, ds), 2 * dot(os, ds), dot(os, os) - 1, 0, () => true);
        if (t === null) return null;
        const p = add(o, scale(d, t));
        return { t, normal: toWorld(solid, [p[0] / (rx * rx), p[1] / (ry * ry), p[2] / (rz * rz)]) };
    },

    // A cylinder whose radius runs from `r0` at its foot (local z = 0) to `r1`
    // at its head (z = length), capped at both ends: a cylinder, a cone or
    // anything between.
    taper(solid, origin, direction) {
        const { o, d } = toLocal(solid, origin, direction);
        const { r0, r1, length: L } = solid;
        const k = (r1 - r0) / L;
        const radiusAt = z => r0 + k * z;
        let best = null;
        const side = nearestRoot(
            d[0] * d[0] + d[1] * d[1] - k * k * d[2] * d[2],
            2 * (o[0] * d[0] + o[1] * d[1] - k * d[2] * radiusAt(o[2])),
            o[0] * o[0] + o[1] * o[1] - radiusAt(o[2]) ** 2,
            0,
            t => { const z = o[2] + t * d[2]; return z >= 0 && z <= L && radiusAt(z) >= 0; },
        );
        if (side !== null) {
            const p = add(o, scale(d, side));
            best = { t: side, normal: [p[0], p[1], -k * radiusAt(p[2])] };
        }
        for (const [z, r, nz] of [[0, r0, -1], [L, r1, 1]]) {
            if (r <= 0 || Math.abs(d[2]) < 1e-12) continue;
            const t = (z - o[2]) / d[2];
            if (t <= 0 || (best && t >= best.t)) continue;
            const x = o[0] + t * d[0], y = o[1] + t * d[1];
            if (x * x + y * y <= r * r) best = { t, normal: [0, 0, nz] };
        }
        return best && { t: best.t, normal: toWorld(solid, best.normal) };
    },

    capsule(solid, origin, direction) {
        const { from, to, r } = solid;
        const axis = sub(to, from), L = length(axis), u = scale(axis, 1 / L);
        const oc = sub(origin, from);
        // The side: a cylinder about the segment.
        const dPerp = sub(direction, scale(u, dot(direction, u)));
        const oPerp = sub(oc, scale(u, dot(oc, u)));
        let best = null;
        const t = nearestRoot(dot(dPerp, dPerp), 2 * dot(oPerp, dPerp), dot(oPerp, oPerp) - r * r, 0, t => {
            const s = dot(add(oc, scale(direction, t)), u);
            return s >= 0 && s <= L;
        });
        if (t !== null) {
            const p = add(oc, scale(direction, t));
            best = { t, normal: normalise(sub(p, scale(u, dot(p, u)))) };
        }
        // The two round ends.
        for (const end of [from, to]) {
            const oe = sub(origin, end);
            const te = nearestRoot(1, 2 * dot(oe, direction), dot(oe, oe) - r * r, 0, () => true);
            if (te !== null && (!best || te < best.t)) best = { t: te, normal: normalise(add(oe, scale(direction, te))) };
        }
        return best;
    },
};

/**
 * A part, as a master writes it, made into a solid the caster can hit:
 *
 *   { box: { at, size, rot? } }                 size is [x, y, z], full lengths
 *   { box: { from, to, size: [w, d], roll? } }  a bar from one point to another
 *   { ball: { at, r, rot? } }                   r is a number, or [rx, ry, rz]
 *   { taper: { from, to, r, r2?, roll? } }      r2 defaults to r: a cylinder; 0 is a cone
 *   { capsule: { from, to, r } }
 *
 * plus `mat`, the name of its material. `rot` is { z, y, x } in degrees.
 */
function solidOf(part) {
    if (part.box) {
        const b = part.box;
        if (b.from) {
            const L = length(sub(b.to, b.from));
            return { kind: 'box', centre: scale(add(b.from, b.to), 0.5), axes: basisAlong(b.from, b.to, b.roll), half: [b.size[0] / 2, b.size[1] / 2, L / 2] };
        }
        return { kind: 'box', centre: b.at, axes: basisFromRotation(b.rot), half: b.size.map(s => s / 2) };
    }
    if (part.ball) {
        const r = typeof part.ball.r === 'number' ? [part.ball.r, part.ball.r, part.ball.r] : part.ball.r;
        return { kind: 'ball', centre: part.ball.at, axes: basisFromRotation(part.ball.rot), radii: r };
    }
    if (part.taper) {
        const { from, to, r, r2 = r, roll } = part.taper;
        return { kind: 'taper', centre: from, axes: basisAlong(from, to, roll), r0: r, r1: r2, length: length(sub(to, from)) };
    }
    if (part.capsule) return { kind: 'capsule', ...part.capsule };
    throw new Error(`A part needs one of box, ball, taper or capsule: ${JSON.stringify(part)}`);
}

/** A sphere round the solid, for the screen box it's tested over. */
function boundsOf(solid) {
    switch (solid.kind) {
        case 'box': return { centre: solid.centre, radius: length(solid.half) };
        case 'ball': return { centre: solid.centre, radius: Math.max(...solid.radii) };
        case 'taper': {
            const mid = add(solid.centre, scale(solid.axes[2], solid.length / 2));
            return { centre: mid, radius: Math.hypot(solid.length / 2, Math.max(solid.r0, solid.r1)) };
        }
        case 'capsule': return { centre: scale(add(solid.from, solid.to), 0.5), radius: length(sub(solid.to, solid.from)) / 2 + solid.r };
    }
}

/** Moves a solid by `move`, a rigid motion: `turn` for its directions, and `move` itself for its points. */
function moveSolid(solid, move, turn = move) {
    if (solid.kind === 'capsule') return { ...solid, from: move(solid.from), to: move(solid.to) };
    return { ...solid, centre: move(solid.centre), axes: solid.axes.map(turn) };
}

/**
 * A pose a whole model can be drawn in, beyond standing as it's written: tipped
 * `tilt` degrees about its own y axis (-90 lays it on its back, its head where
 * its back was) and then shifted by `shift`, in its own frame.
 */
function posed(solid, { tilt = 0, shift = [0, 0, 0] } = {}) {
    if (tilt === 0 && shift.every(n => n === 0)) return solid;
    const turn = v => rotate(v, [0, 1, 0], rad(tilt));
    return moveSolid(solid, v => add(turn(v), shift), turn);
}

// --- The camera and the light ----------------------------------------------
//
// World axes: x east, y north, z up. The grid's columns run south-east and
// its rows south-west, and the camera looks north, down 30°. A square's side
// is `pxPerUnit` pixels, so its diamond is `pxPerUnit·√2` wide.

const ELEVATION = rad(30);
const VIEW = [0, Math.cos(ELEVATION), -Math.sin(ELEVATION)];
/** Where the light comes from: up, to the left, and a little towards the viewer. */
const LIGHT = normalise([-0.55, -0.45, 0.95]);
const HALFWAY = normalise(sub(LIGHT, VIEW));

/** The angle a facing turns the model's forward (+x) to, anticlockwise from east. */
const facingAngle = index => rad(-45 - 45 * index);

function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => c / 255);
}

/**
 * What a material looks like: `{ colour, shine?, glow?, team? }`. `shine` is
 * how strong a highlight it takes (steel 0.6, cloth none), `glow` draws it at
 * full brightness whatever the light (a mage's fire), and `team` marks it as
 * the owner's colour: it's drawn in `colour` — a light grey, to be tinted —
 * and written to the team mask.
 */
function shade(material, normal) {
    const base = material.rgb;
    if (material.glow) return base;
    // Sky above, warm ground bounce below.
    const ambient = 0.42 + 0.16 * normal[2];
    const diffuse = Math.max(0, dot(normal, LIGHT));
    const light = ambient + 0.72 * diffuse;
    const highlight = material.shine ? material.shine * Math.max(0, dot(normal, HALFWAY)) ** 24 : 0;
    return base.map(c => Math.min(1, c * light + highlight));
}

/**
 * Draws one model facing one direction, in a `pose` if it's given one, into a
 * `width`×`height` cell whose foot is the square's diamond, front corner at
 * the middle of the bottom edge — the convention every Realm Arena sheet cell
 * keeps (src/games/RealmArena/art.ts). Nothing below the ground is drawn: the
 * board's ground hides it.
 *
 * Returns the cell's pixels, and the owner's colour on its own: just the
 * pixels drawn in a `team` material, shaded as they are in `pixels`, for the
 * board to tint and lay over them. Both are RGBA in 0–255, not premultiplied.
 */
export function renderCell(parts, materials, { facing, pose, width, height, pxPerUnit, supersample = 4, outline }) {
    const mats = Object.fromEntries(Object.entries(materials).map(([name, m]) => [name, { ...m, rgb: hexToRgb(m.colour) }]));
    const spin = v => rotate(v, [0, 0, 1], facingAngle(facing));
    const solids = parts.map(part => {
        if (!mats[part.mat]) throw new Error(`Unknown material "${part.mat}"`);
        return { ...moveSolid(posed(solidOf(part), pose), spin), mat: part.mat };
    });

    const ss = supersample;
    const W = width * ss, H = height * ss, k = pxPerUnit * ss;
    // The square's middle, on the ground: half a diamond up from the cell's foot.
    const anchor = { x: W / 2, y: H - (pxPerUnit * Math.SQRT2 / 4) * ss };
    const project = p => ({ x: anchor.x + k * p[0], y: anchor.y - k * (p[1] * Math.sin(ELEVATION) + p[2] * Math.cos(ELEVATION)) });
    // A sample's ray: from well in front of the model, through the point on
    // the vertical plane y = 0 that lands on it.
    const rayOrigin = (sx, sy) => sub([(sx - anchor.x) / k, 0, (anchor.y - sy) / (k * Math.cos(ELEVATION))], scale(VIEW, 10));

    const depth = new Float32Array(W * H).fill(Infinity);
    const owner = new Int32Array(W * H).fill(-1);
    const normals = new Float32Array(W * H * 3);
    solids.forEach((solid, index) => {
        const { centre, radius } = boundsOf(solid);
        const c = project(centre), r = radius * k + 2;
        const x0 = Math.max(0, Math.floor(c.x - r)), x1 = Math.min(W - 1, Math.ceil(c.x + r));
        const y0 = Math.max(0, Math.floor(c.y - r)), y1 = Math.min(H - 1, Math.ceil(c.y + r));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const origin = rayOrigin(x + 0.5, y + 0.5);
                const hit = SOLIDS[solid.kind](solid, origin, VIEW);
                const i = y * W + x;
                // The ray only goes down, so a hit under the ground is the
                // nearest this solid has, and the ground would hide it.
                if (!hit || hit.t >= depth[i] || origin[2] + hit.t * VIEW[2] < 0) continue;
                depth[i] = hit.t;
                owner[i] = index;
                normals.set(hit.normal, i * 3);
            }
        }
    });

    // Lines: round the silhouette, a sample's width (`ss`, one pixel of the
    // cell) out from it; and inside it, wherever one part stands well in
    // front of the one behind it, so an arm reads against the body.
    const ink = hexToRgb(outline.colour);
    const reach = Math.max(1, Math.round(ss * (outline.width ?? 1)));
    const samples = new Float32Array(W * H * 4);
    const teamSamples = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            let near = Infinity, foreground = false;
            for (const [dx, dy] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const j = ny * W + nx;
                if (owner[j] < 0) continue;
                foreground = true;
                near = Math.min(near, depth[j]);
            }
            if (owner[i] < 0) {
                if (foreground) samples.set([...ink, 1], i * 4);
                continue;
            }
            const material = mats[solids[owner[i]].mat];
            let rgb = shade(material, [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]);
            if (depth[i] - near > (outline.crease ?? 0.06)) rgb = rgb.map((c, n) => c * 0.35 + ink[n] * 0.65);
            samples.set([...rgb, 1], i * 4);
            if (material.team) teamSamples[i] = 1;
        }
    }

    // Down to the cell: each pixel the mean of its ss×ss samples, colour
    // weighted by how much of it is covered — and, for the team layer, the
    // mean of just its team samples, covering as much as they do.
    const pixels = new Uint8ClampedArray(width * height * 4);
    const team = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const all = [0, 0, 0, 0], own = [0, 0, 0, 0];
            for (let sy = 0; sy < ss; sy++) {
                for (let sx = 0; sx < ss; sx++) {
                    const i = ((y * ss + sy) * W + x * ss + sx);
                    const alpha = samples[i * 4 + 3];
                    for (let c = 0; c < 3; c++) all[c] += samples[i * 4 + c] * alpha;
                    all[3] += alpha;
                    if (!teamSamples[i]) continue;
                    for (let c = 0; c < 3; c++) own[c] += samples[i * 4 + c];
                    own[3] += 1;
                }
            }
            const o = (y * width + x) * 4;
            for (const [sum, out] of [[all, pixels], [own, team]]) {
                if (sum[3] > 0) out.set([sum[0] / sum[3] * 255, sum[1] / sum[3] * 255, sum[2] / sum[3] * 255, sum[3] / (ss * ss) * 255], o);
            }
        }
    }
    return { pixels, team };
}
