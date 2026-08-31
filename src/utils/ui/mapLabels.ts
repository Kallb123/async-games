// Screen geometry for the name labels a map board prints on its own art —
// Outbreak's 48 cities, Train Time's 36 stations, World Domination's
// continents. Every label has a hand-picked side of its node it *wants* to sit
// on, but on a crowded map that side is often already taken: by a neighbour's
// name, or by a marker drawn beside its own node (a cube stack, a pawn row, a
// research station). Left alone they print on top of each other.
//
// This is the pass that fixes that — greedy point-feature label placement.
// Each label gets a box, tries its preferred side first and then the sides
// around it, and takes the first spot that is both clear and unmistakably its
// own node's; when the map really is that full it settles for the least-bad
// spot. Pixels live here rather than in a board's data so the boards stay a
// thin map over it, and so the placement can be tested without rendering an SVG.

/** The eight sides of a node a label can sit on, clockwise from north. */
export type MapLabelDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MapLabelRequest {
    /** Centre of the node the label names. */
    x: number;
    y: number;
    text: string;
    fontSize: number;
    /** Clearance between the node centre and the near edge of the label. */
    offset: number;
    /** The side it sits on when nothing is in the way. */
    dir: MapLabelDir;
    /** Extra tracking per character in em, matching the drawn `letterSpacing`. */
    letterSpacingEm?: number;
}

export interface PlacedMapLabel {
    /** Where to draw the `<text>`, together with `textAnchor`. */
    x: number;
    y: number;
    textAnchor: 'start' | 'middle' | 'end';
    /** The side it ended up on — the requested one unless it had to move. */
    dir: MapLabelDir;
    /** The box it reserved, padding included. */
    box: Rect;
}

export interface ResolveMapLabelsOptions {
    /** The board's viewBox — a label pushed off it is worse than one overlapping. */
    bounds: Rect;
    /** Everything already on the board the labels must keep off: the node
     *  circles (see `circleRect`), the markers drawn beside them, and any label
     *  this pass does not place itself. */
    obstacles?: Rect[];
    /** Breathing room around each label's text. */
    padding?: number;
}

const ALL_DIRS: MapLabelDir[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** Which way each side pushes the label box off the node, per axis. */
const DIR_SIGN: Record<MapLabelDir, { sx: -1 | 0 | 1; sy: -1 | 0 | 1 }> = {
    n: { sx: 0, sy: -1 },
    ne: { sx: 1, sy: -1 },
    e: { sx: 1, sy: 0 },
    se: { sx: 1, sy: 1 },
    s: { sx: 0, sy: 1 },
    sw: { sx: -1, sy: 1 },
    w: { sx: -1, sy: 0 },
    nw: { sx: -1, sy: -1 },
};

/** A diagonal spends its clearance on both axes, so shorten each. */
const DIAGONAL_SCALE = Math.SQRT1_2;

// Sides are tried at the asked-for clearance first, then held further out. The
// second pass is a shade under twice the clearance, which is what it takes to
// clear a full marker row on top of a node (Outbreak asks for 11 and stacks
// 8px-tall cube chips 3px below a 7px node). There is no third pass: eight
// sides already give a label eight chances, and one held further out than this
// stops reading as attached to its node at all — which `ambiguityOf` then
// rightly refuses.
const OFFSET_SCALES = [1, 1.9];

/** The picked side first, then the sides either way round it, so a label that
 *  has to move drifts round its own node rather than jumping to the far side. */
const DIR_SEARCH_STEPS = [0, 1, -1, 2, -2, 3, -3, 4];

const DEFAULT_PADDING = 1;

/** Fraction of a one-line box that sits above the text's baseline. */
const BASELINE = 0.78;

// How much worse falling off the map is than overlapping something on it. Text
// running off the viewBox is simply cut in half, so anything above 1 gets the
// order right; 6 keeps a comfortable margin without the reverse mistake, where
// a label clipped by a sliver would outrank one lying flat on a neighbour.
const SPILL_WEIGHT = 6;

// Widths are estimated, not measured: placement has to work on the very first
// render (and in tests), and a `getComputedTextLength` pass would mean laying
// every label out twice. These are per-character advances in em for the app's
// Bricolage Grotesque at label weights — near enough to decide what overlaps
// what, and `padding` absorbs the error.
const EM_NARROW = 0.30;
const EM_SPACE = 0.27;
const EM_LOWER = 0.55;
const EM_UPPER = 0.70;
const EM_WIDE = 0.92;
const NARROW_CHARS = new Set('iIljt.,:;\'"!|()[]{}·-');
const WIDE_CHARS = new Set('MWmw@');

/** Roughly how wide `text` draws at `fontSize`, in board units. */
export function estimateTextWidth(text: string, fontSize: number, letterSpacingEm = 0): number {
    let em = 0;
    for (const ch of text) {
        if (ch === ' ') em += EM_SPACE;
        else if (NARROW_CHARS.has(ch)) em += EM_NARROW;
        else if (WIDE_CHARS.has(ch)) em += EM_WIDE;
        else if (ch >= 'A' && ch <= 'Z') em += EM_UPPER;
        else em += EM_LOWER;
        em += letterSpacingEm;
    }
    return em * fontSize;
}

/** The bounding box of a circular node — the commonest thing a label dodges. */
export function circleRect(x: number, y: number, radius: number): Rect {
    return { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
}

/** The box a `<text>` drawn at these coordinates occupies. For labels placed
 *  outside this pass (MapEdges' wrap stubs) that it nonetheless has to avoid. */
export function textRect(
    x: number, y: number, text: string, fontSize: number,
    textAnchor: 'start' | 'middle' | 'end' = 'middle',
): Rect {
    const width = estimateTextWidth(text, fontSize);
    return {
        x: textAnchor === 'start' ? x : textAnchor === 'end' ? x - width : x - width / 2,
        y: y - fontSize * BASELINE,
        width,
        height: fontSize,
    };
}

/**
 * How many *other* labelled nodes lie nearer this box than the node it names.
 * A name that has moved to a free side can end up hugging its neighbour's node,
 * or reaching past it with its far end, and then reads as though it names that
 * one instead — so given two spots that are equally clear, the one that stays
 * plainly its own wins. Distance is to the nearest edge of the whole box, since
 * either end of a name reaching a foreign node is enough to mislead.
 */
function ambiguityOf(box: Rect, requests: MapLabelRequest[], self: number): number {
    const squaredReach = (node: MapLabelRequest) => {
        const dx = Math.max(box.x - node.x, 0, node.x - (box.x + box.width));
        const dy = Math.max(box.y - node.y, 0, node.y - (box.y + box.height));
        return dx * dx + dy * dy;
    };

    const own = squaredReach(requests[self]);
    let nearer = 0;
    for (let j = 0; j < requests.length; j++) {
        if (j !== self && squaredReach(requests[j]) < own) nearer++;
    }
    return nearer;
}

function overlapArea(a: Rect, b: Rect): number {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    if (w <= 0) return 0;
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return h <= 0 ? 0 : w * h;
}

/** How much of the box falls outside the board. */
function spillArea(box: Rect, bounds: Rect): number {
    return box.width * box.height - overlapArea(box, bounds);
}

function dirsPreferring(dir: MapLabelDir): MapLabelDir[] {
    const from = ALL_DIRS.indexOf(dir);
    return DIR_SEARCH_STEPS.map(step => ALL_DIRS[(from + step + ALL_DIRS.length) % ALL_DIRS.length]);
}

function boxFor(req: MapLabelRequest, dir: MapLabelDir, size: { width: number; height: number }, scale: number): Rect {
    const { sx, sy } = DIR_SIGN[dir];
    const clearance = req.offset * scale * (sx !== 0 && sy !== 0 ? DIAGONAL_SCALE : 1);
    return {
        x: sx > 0 ? req.x + clearance : sx < 0 ? req.x - clearance - size.width : req.x - size.width / 2,
        y: sy > 0 ? req.y + clearance : sy < 0 ? req.y - clearance - size.height : req.y - size.height / 2,
        width: size.width,
        height: size.height,
    };
}

/**
 * Where to draw each label so that no two of them, and no label and marker,
 * end up on top of each other. Results come back in the order the requests
 * were given, whatever order they were actually placed in.
 */
export function resolveMapLabels(
    requests: MapLabelRequest[],
    { bounds, obstacles = [], padding = DEFAULT_PADDING }: ResolveMapLabelsOptions,
): PlacedMapLabel[] {
    const sizes = requests.map(r => ({
        width: estimateTextWidth(r.text, r.fontSize, r.letterSpacingEm) + padding * 2,
        height: r.fontSize + padding * 2,
    }));

    // Placed in the order given: every label has eight sides at two clearances
    // to choose from, so on both of today's boards — and on a worst case with a
    // station, a pawn row and a full cube stack at every single node — placing
    // the crowded nodes first makes no difference to the result.
    const taken: Rect[] = [];
    const placed: PlacedMapLabel[] = new Array(requests.length);

    for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        let best = { box: boxFor(req, req.dir, sizes[i], 1), dir: req.dir, cost: Infinity, ambiguity: Infinity };

        search:
        for (const scale of OFFSET_SCALES) {
            for (const dir of dirsPreferring(req.dir)) {
                const box = boxFor(req, dir, sizes[i], scale);
                let cost = spillArea(box, bounds) * SPILL_WEIGHT;
                for (const obstacle of obstacles) cost += overlapArea(box, obstacle);
                for (const other of taken) cost += overlapArea(box, other);
                const ambiguity = ambiguityOf(box, requests, i);
                // Cost first, attribution only to separate spots that tie on it:
                // a name printed on top of something is a worse read than one
                // that has drifted towards the wrong node.
                if (cost < best.cost || (cost === best.cost && ambiguity < best.ambiguity)) {
                    best = { box, dir, cost, ambiguity };
                }
                // The preferred side is tried first, so the first spot that is
                // both clear and unmistakably its own is the most-wanted one.
                if (cost === 0 && ambiguity === 0) break search;
            }
        }

        taken.push(best.box);
        const textAnchor = DIR_SIGN[best.dir].sx > 0 ? 'start' : DIR_SIGN[best.dir].sx < 0 ? 'end' : 'middle';
        placed[i] = {
            x: textAnchor === 'start' ? best.box.x + padding
                : textAnchor === 'end' ? best.box.x + best.box.width - padding
                    : best.box.x + best.box.width / 2,
            y: best.box.y + padding + req.fontSize * BASELINE,
            textAnchor,
            dir: best.dir,
            box: best.box,
        };
    }

    return placed;
}
