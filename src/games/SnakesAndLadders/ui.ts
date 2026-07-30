import { SNAKES_AND_LADDERS_LADDERS, SNAKES_AND_LADDERS_SNAKES } from "@/utils/apiModels/GameLogic";

// Pure geometry for the drawn board: where each square sits, and the shapes of
// the ladders and snakes that join them. Everything is expressed in a 0–100
// square viewBox so the SVG overlay lines up with the 10×10 CSS grid at any
// screen size. The board never moves, so the finished shapes are built once at
// module load and exported as constants.

/** Rematch-link key for the re-roll-on-6 house rule (see utils/ui/rematch.ts). */
export const SL_REROLL_PARAM = "reroll";

export const SL_GRID = 10;
const CELL = 100 / SL_GRID;

export interface SLPoint { x: number; y: number }
export interface SLLine { x1: number; y1: number; x2: number; y2: number }

/** Square number at a grid position — row 0 is the bottom row (squares 1–10). */
export function squareAt(row: number, col: number): number {
    return row % 2 === 0 ? row * SL_GRID + col + 1 : row * SL_GRID + (SL_GRID - 1 - col) + 1;
}

// Built by walking the grid through squareAt, so the serpentine numbering is
// written down once rather than once forwards and once inverted.
const CENTRES: SLPoint[] = [];
for (let row = 0; row < SL_GRID; row++) {
    for (let col = 0; col < SL_GRID; col++) {
        CENTRES[squareAt(row, col) - 1] = {
            x: (col + 0.5) * CELL,
            y: (SL_GRID - 1 - row + 0.5) * CELL,
        };
    }
}

/** Centre of a square in viewBox coordinates (y grows downwards). */
export function squareCentre(square: number): SLPoint {
    return CENTRES[square - 1];
}

const round = (n: number) => Math.round(n * 100) / 100;

// ── Ladders ─────────────────────────────────────────────────────────────────
// A straight ladder: two parallel rails from the foot square to the top square,
// with evenly spaced rungs between them.

const LADDER_HALF_WIDTH = 2.1;
const LADDER_RUNG_SPACING = 5.5;

export interface SLLadder {
    from: number;
    to: number;
    rails: SLLine[];
    rungs: SLLine[];
}

export function ladderGeometry(from: number, to: number): SLLadder {
    const a = squareCentre(from);
    const b = squareCentre(to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    // Perpendicular offset — one rail either side of the centre line.
    const px = (-dy / length) * LADDER_HALF_WIDTH;
    const py = (dx / length) * LADDER_HALF_WIDTH;

    const rails: SLLine[] = [
        { x1: round(a.x + px), y1: round(a.y + py), x2: round(b.x + px), y2: round(b.y + py) },
        { x1: round(a.x - px), y1: round(a.y - py), x2: round(b.x - px), y2: round(b.y - py) },
    ];

    // Rungs are inset from both ends so the rails read as poles that overhang.
    const rungCount = Math.max(2, Math.round(length / LADDER_RUNG_SPACING));
    const rungs: SLLine[] = [];
    for (let i = 0; i <= rungCount; i++) {
        const t = 0.06 + (i / rungCount) * 0.88;
        const cx = a.x + dx * t;
        const cy = a.y + dy * t;
        rungs.push({ x1: round(cx + px), y1: round(cy + py), x2: round(cx - px), y2: round(cy - py) });
    }

    return { from, to, rails, rungs };
}

// ── Snakes ──────────────────────────────────────────────────────────────────
// A snake is a sine-wave spine from the square you land on (the head) down to
// the square it drops you to (the tail), drawn as one filled ribbon that
// narrows towards the tail. Using whole half-waves keeps both ends exactly on
// their squares whatever the length.

const SNAKE_SAMPLES = 36;

export interface SLSnake {
    from: number;
    to: number;
    /** Open path for the body — stroked, so its width lives in the CSS. */
    body: string;
    head: SLPoint;
    /** Degrees to rotate the head by so it faces away from the body. */
    headAngle: number;
}

export function snakeGeometry(from: number, to: number): SLSnake {
    const a = squareCentre(from);
    const b = squareCentre(to);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;

    // Longer snakes get more wriggle; the side the first bend goes is derived
    // from the head square, so each snake looks distinct but always identical.
    const waves = Math.max(2, Math.round(length / 15));
    const amplitude = Math.min(5, length / 9);
    const side = from % 2 === 0 ? 1 : -1;

    const spine: SLPoint[] = [];
    for (let i = 0; i <= SNAKE_SAMPLES; i++) {
        const t = i / SNAKE_SAMPLES;
        const wobble = Math.sin(t * Math.PI * waves) * amplitude * side;
        spine.push({ x: a.x + dx * t + nx * wobble, y: a.y + dy * t + ny * wobble });
    }

    const body = `M${spine.map(p => `${round(p.x)} ${round(p.y)}`).join(" L")}`;

    const facing = spine[2];
    const headAngle = Math.round((Math.atan2(a.y - facing.y, a.x - facing.x) * 180) / Math.PI);

    return { from, to, body, head: a, headAngle };
}

const entries = (map: Record<number, number>) =>
    Object.entries(map).map(([from, to]) => [Number(from), to] as const);

/** Every ladder on the board, ready to draw. */
export const SL_LADDER_ART: SLLadder[] = entries(SNAKES_AND_LADDERS_LADDERS)
    .map(([from, to]) => ladderGeometry(from, to));

/** Every snake on the board, ready to draw. */
export const SL_SNAKE_ART: SLSnake[] = entries(SNAKES_AND_LADDERS_SNAKES)
    .map(([from, to]) => snakeGeometry(from, to));
