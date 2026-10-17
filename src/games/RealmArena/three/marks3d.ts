// What a figure wears on the 3D board (docs/realm-arena-3d.md §3), as the
// isometric board draws it (§20.2, §21.2): the column of effect marks down its
// left — its watch mark first when it's on watch — the AP pips down its right on
// its owner's turn, the item it carries by its right shoulder, and the rings
// round its feet (rings3d.ts).
//
// The marks are quads facing the camera, hung from the figure's feet
// (billboards.ts) and laid out across the frame in the isometric board's own
// units: `figureMarks`, below, is the pure part — which marks, and where from
// its feet — using the same `EFFECT_MARK_*`, `AP_PIP_*` and `ITEM_MARK_*` the
// isometric board is drawn by (ui.ts). `MarkLayer` draws them: three draws of
// marks (the effects' sheet, the items' sheet, the pips' atlas) and one of rings.

import { Color, Group } from "three";
import { EFFECT_ART, ITEM_ART, WATCH_ART, type Sprite } from "@/games/RealmArena/art";
import type { EffectId, ItemId } from "@/games/RealmArena/characters";
import type { Fighter } from "@/games/RealmArena/rules";
import {
    AP_PIP_OFFSET, AP_PIP_RADIUS, AP_PIP_STEP, apPips, EFFECT_MARK_OFFSET, EFFECT_MARK_SIZE, EFFECT_MARK_STEP, effectsOn, FIGURE_RISE, ITEM_MARK_OFFSET, ITEM_MARK_SIZE, MARK_SHADOW,
} from "@/games/RealmArena/ui";
import { Billboards, CanvasAtlas, sheetTexture, spriteRect, type BillboardAxes, type TexRect } from "./billboards";
import { DISC_BOX, discRect, type RingColours } from "./canvasShapes";
import type { Vec3 } from "./iso3d";
import { GroundRings, type RingKind } from "./rings3d";
import type { Sheets } from "./terrain3d";

/** Where something hangs from a figure's feet, in the isometric board's units: right, and down. */
export interface MarkSpot { x: number; y: number }

/** What a figure is marked with, as the board is told it. */
export interface FigureMarkInput {
    /** Its status effects, in the order the column lists them. */
    effects: readonly EffectId[];
    /** On watch (§13.4): its mark heads the column. */
    watching: boolean;
    item?: ItemId | null;
    /** Its AP left as pips, lit while unspent; none off its owner's turn. */
    pips?: readonly boolean[];
}

/** `FigureMarkInput`, laid out round a figure's feet. */
export interface FigureMarks {
    marks: (MarkSpot & { sprite: Sprite })[];
    item: (MarkSpot & { sprite: Sprite }) | null;
    pips: (MarkSpot & { on: boolean })[];
}

/** The middles of `count` things `step` apart down a column centred on zero. */
export function columnAt(count: number, step: number): number[] {
    return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
}

/**
 * Where each mark goes, from the figure's feet: the columns are centred on its
 * disc, `FIGURE_RISE` above them, as `RealmArenaEffectMarks` and `ApPips` are
 * on the isometric board.
 */
export function figureMarks({ effects, watching, item, pips = [] }: FigureMarkInput): FigureMarks {
    const sprites = [...(watching ? [WATCH_ART] : []), ...effects.map(effect => EFFECT_ART[effect])];
    return {
        marks: columnAt(sprites.length, EFFECT_MARK_STEP).map((y, i) => ({ sprite: sprites[i], x: -EFFECT_MARK_OFFSET, y: y - FIGURE_RISE })),
        item: item ? { sprite: ITEM_ART[item], x: ITEM_MARK_OFFSET.x, y: ITEM_MARK_OFFSET.y - FIGURE_RISE } : null,
        pips: columnAt(pips.length, AP_PIP_STEP).map((y, i) => ({ on: pips[i], x: AP_PIP_OFFSET, y: y - FIGURE_RISE })),
    };
}

/**
 * How much of its marks a figure wears just now. A figure at rest wears them
 * all; one walking an action's path wears its item and nothing else, as the
 * isometric board draws a walker, and until it has walked there its effects
 * and pips stay hidden; one that's down, or about to be, wears none.
 */
export type MarkLevel = "all" | "item" | "none";

/**
 * What a figure is marked with at `level`: `drawn` is the fighter as its
 * marks are to be shown — as an action being played found it, until the cue
 * that changed them lands (`toldAt`) — and `acting` that it's its owner's turn
 * in battle, so its AP shows.
 */
export function marksOf(level: MarkLevel, drawn: Fighter, acting: boolean): FigureMarkInput {
    if (level === "none") return { effects: [], watching: false };
    if (level === "item") return { effects: [], watching: false, item: drawn.item };
    return { effects: effectsOn(drawn), watching: drawn.banked > 0, item: drawn.item, pips: acting ? apPips(drawn) : [] };
}

/** Drawn after the HP bars (2 and 3, board3d.ts) and over the figures. */
const MARKS_ORDER = 4;
/** How far a mark is drawn towards the camera from where it hangs, in the world's units, so the figure beside it never cuts into it. */
const MARK_LIFT = 0.5;
/** The width of a pip's edge, as `.ag-ra-ap` strokes it. */
const PIP_EDGE = 0.25;
/** The side of the box a pip is drawn in: its diameter and its edge. */
const PIP_BOX = 2 * AP_PIP_RADIUS + PIP_EDGE;
/** A pip not lit is a faint black (`.ag-ra-ap`, which has no token for it). */
const PIP_OFF = new Color(0, 0, 0);
const PIP_OFF_OPACITY = 0.35;

/**
 * Everything drawn round the figures: laid out afresh with `begin`, a
 * `figure` and a `ring` as many as are needed, and `end`, whenever the figures
 * are laid — a frame at a time while one walks.
 */
export class MarkLayer {
    readonly group = new Group();
    private readonly effects: Billboards;
    private readonly items: Billboards;
    private readonly pips: Billboards;
    private readonly rings = new GroundRings();
    private readonly pipAtlas = new CanvasAtlas(24, 256);
    /** A pip is a disc for its fill, and a ring over it for its edge, each tinted when it's added. */
    private readonly pipShapes: { disc: TexRect; edge: TexRect };
    private colours: RingColours | null = null;

    constructor(sheets: Sheets, axes: BillboardAxes) {
        // Hidden by whatever stands in front of the figure they hang from, as the isometric board's are by a wall drawn after them.
        const options = { depthTest: true, lift: MARK_LIFT, order: MARKS_ORDER };
        // The marks wear a soft shadow, as `.ag-ra-figure-mark` gives them; the pips are drawn flat, as `.ag-ra-ap` has it.
        const shadowed = { ...options, shadow: MARK_SHADOW };
        this.effects = new Billboards(sheetTexture(sheets, WATCH_ART.sheet), axes, shadowed);
        this.items = new Billboards(sheetTexture(sheets, "items"), axes, shadowed);
        this.pips = new Billboards(this.pipAtlas.texture, axes, options);
        const edge = this.pipAtlas.rect("pip-edge", PIP_BOX, PIP_BOX, context => {
            context.beginPath();
            context.arc(PIP_BOX / 2, PIP_BOX / 2, AP_PIP_RADIUS, 0, 2 * Math.PI);
            context.lineWidth = PIP_EDGE;
            context.strokeStyle = "#fff";
            context.stroke();
        });
        this.pipShapes = { disc: discRect(this.pipAtlas), edge };
        this.group.add(this.effects.mesh, this.items.mesh, this.pips.mesh, this.rings.mesh);
    }

    /** Starts laying out afresh, in `colours`: until the board has any, nothing is drawn. */
    begin(colours: RingColours | null): void {
        this.colours = colours;
        this.effects.begin();
        this.items.begin();
        this.pips.begin();
        this.rings.begin();
    }

    /** What `input` marks a figure with, hung from its feet at `feet`. */
    figure(feet: Vec3, input: FigureMarkInput): void {
        const colours = this.colours;
        if (!colours) return;
        const { marks, item, pips } = figureMarks(input);
        for (const { sprite, x, y } of marks) {
            this.effects.add({ at: feet, x, y, width: EFFECT_MARK_SIZE, height: EFFECT_MARK_SIZE, rect: spriteRect(sprite) });
        }
        if (item) this.items.add({ at: feet, x: item.x, y: item.y, width: ITEM_MARK_SIZE, height: ITEM_MARK_SIZE, rect: spriteRect(item.sprite) });
        for (const { on, x, y } of pips) {
            this.pips.add({ at: feet, x, y, width: 2 * AP_PIP_RADIUS * DISC_BOX, rect: this.pipShapes.disc, colour: on ? colours.gold : PIP_OFF, opacity: on ? 1 : PIP_OFF_OPACITY });
            this.pips.add({ at: feet, x, y, width: PIP_BOX, height: PIP_BOX, rect: this.pipShapes.edge, colour: colours.onDark });
        }
    }

    /** A ring of `kind` round a figure whose feet are at `feet`. */
    ring(feet: Vec3, kind: RingKind): void {
        if (this.colours) this.rings.add(feet, kind, this.colours);
    }

    end(): void {
        this.effects.end();
        this.items.end();
        this.pips.end();
        this.rings.end();
    }

    dispose(): void {
        this.effects.dispose();
        this.items.dispose();
        this.pips.dispose();
        this.rings.dispose();
        this.pipAtlas.dispose();
    }
}
