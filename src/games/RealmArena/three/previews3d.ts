// What the 3D board draws over its geometry of an action being lined up and of
// the map (docs/realm-arena-3d.md), as the isometric board draws them over
// its figures: the path a move takes with the dot where it ends, the chance
// to hit over each target (`Odds`), the shields of the cover a square gives
// (`CoverShields`), and the centre's name. All of it is quads facing the camera
// hung from points of the world and sized in the isometric board's units, from
// one atlas of shapes and text drawn as they're needed — so one draw, and the
// numbers the isometric board's CSS gives each carry over.
//
// It is laid out afresh when what it shows changes, when the figures move (the
// centre's name keeps off them) and as the view turns (a path's runs lie along
// the frame the camera sees), and not otherwise.

import { CENTRE_LABEL, ODDS_HEIGHT, ODDS_RISE, ODDS_WIDTH, PATH_END_RADIUS, PATH_WIDTH, SHIELD_HEIGHT, SHIELD_WIDTH, shieldPath } from "@/games/RealmArena/ui";
import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import type { Rect } from "@/utils/ui/mapLabels";
import { Billboards, CanvasAtlas, type BillboardAxes } from "./billboards";
import { DISC_BOX, discRect, drawText, layStable, rgba, solidRect, textWidth, whenFontReady, type BoardLook, type TextStyle } from "./canvasShapes";
import { boardFrame, squareCentre, topOf, type CameraBasis } from "./iso3d";
import { areaMiddle, centreLabel, pathPieces, pathPoints, shieldsAt, textMiddle } from "./previewGeometry";

/** What's previewed: all of it comes from the board's props, and none of it is the board's to decide. */
export interface PreviewSpec {
    /** The squares a lined-up move takes, in order. */
    path: readonly Square[] | null;
    /** The chance to hit each target in reach. */
    odds: readonly { square: Square; chance: number }[];
    /** The square a lined-up move ends on, whose cover is shown. */
    coverAt: Square | null;
    /** The centre's area, in squares, when it is drawn with its name. */
    centre: Rect | null;
}

export const NO_PREVIEWS: PreviewSpec = { path: null, odds: [], coverAt: null, centre: null };

// The strokes the isometric board's CSS gives each (`.ag-ra-odds`, `.ag-ra-cover-*`), in board units.
const ODDS_STROKE = 0.3;
const ODDS_FONT = { weight: 800, size: 3.1 };
const SHIELD_STROKE = 0.4;
/** The dark ground of an odds pill (`--ra-night` at 88%), and of a shield (80%). */
const ODDS_GROUND = 0.88;
const SHIELD_GROUND = 0.8;
/** The centre's name, as `MapLabel` draws a name on the map by default (its `fill`, `stroke` and `strokeWidth`): white, outlined dark. */
const LABEL_FILL = "#fff";
const LABEL_OUTLINE = { colour: "rgba(0, 0, 0, 0.6)", width: 3 };

export class Previews3D {
    private readonly atlas = new CanvasAtlas(16);
    readonly billboards: Billboards;
    private spec: PreviewSpec = NO_PREVIEWS;
    /** The squares figures stand on, which the centre's name keeps clear of (`setFigures`). */
    private figures: readonly Square[] = [];
    private look: BoardLook | null = null;
    /** Which look the atlas was drawn in: keys carry it, so a new look draws afresh. */
    private looks = 0;
    /** The typeface has loaded, so text is drawn in it and not in whatever stands in until it has. */
    private typeset = false;

    constructor(axes: BillboardAxes) {
        // Over the figures and their bars, and not hidden by a wall: the isometric board draws these over everything.
        this.billboards = new Billboards(this.atlas.texture, axes, { order: 11 });
    }

    /** The colours and typeface to draw in; `typeset` is told when text can be drawn, which is once the typeface has loaded. */
    setLook(look: BoardLook, typeset: () => void): void {
        this.look = look;
        this.looks++;
        this.typeset = false;
        const ready = () => {
            if (this.look !== look) return;
            this.typeset = true;
            typeset();
        };
        // A page without the font API, or a typeface that won't load, draws in what stands in for it.
        if (!whenFontReady(`${CENTRE_LABEL.fontWeight} 16px ${look.font}`, ready)) ready();
    }

    set(spec: PreviewSpec): void {
        this.spec = spec;
    }

    /** Where figures stand, standing or fallen, and the sealed squad: told when they move, not a frame at a time while one walks. */
    setFigures(squares: readonly Square[]): void {
        this.figures = squares;
    }

    /** Lays everything out for a battlefield and the camera it is seen by. */
    lay(field: Battlefield | null, basis: CameraBasis): void {
        const { billboards, look } = this;
        billboards.begin();
        if (field && look) {
            layStable(this.atlas, () => {
                billboards.begin();
                this.layCentre(field, basis, look);
                this.layPath(field, basis, look);
                this.layCover(field, look);
                this.layOdds(field, look);
            });
        }
        billboards.end();
    }

    /** The centre's name, clear of the top of its area as the camera sees it, and of the figures standing there if it can be (`centreLabel`). */
    private layCentre(field: Battlefield, basis: CameraBasis, look: BoardLook): void {
        const { centre } = this.spec;
        if (!centre || !this.typeset) return;
        const style: TextStyle = { family: look.font, weight: CENTRE_LABEL.fontWeight, size: CENTRE_LABEL.fontSize };
        const text = "Centre";
        const { width: stroke } = LABEL_OUTLINE;
        const textWide = textWidth(this.atlas, text, style);
        const width = textWide + stroke + 1;
        // A box with the baseline in it: the caps' height over it, the stroke's half-width under.
        const baseline = stroke / 2 + style.size * 0.8;
        const height = baseline + style.size * 0.2 + stroke / 2;
        const rect = this.atlas.rect(`${this.looks}:centre`, width, height, context => drawText(context, text, width / 2, baseline, style, LABEL_FILL, { outline: LABEL_OUTLINE }));
        // The name is drawn from the middle of its box, and `placed` says where its text starts, ends or is centred.
        const placed = centreLabel(field, basis, centre, this.figures, boardFrame(basis, field, topOf(field)), text);
        this.billboards.add({ at: areaMiddle(centre), x: textMiddle(placed, textWide), y: placed.y - (baseline - height / 2), width, height, rect });
    }

    /** The line a move takes, over the squares' tops, round-jointed, with the dot where it ends. */
    private layPath(field: Battlefield, basis: CameraBasis, look: BoardLook): void {
        const { path } = this.spec;
        if (!path || path.length === 0) return;
        const points = pathPoints(field, path);
        const solid = solidRect(this.atlas), disc = discRect(this.atlas);
        for (const { at, length, rotate } of pathPieces(points, basis)) {
            this.billboards.add({ at, width: length, height: PATH_WIDTH, rect: solid, rotate, colour: look.onDark });
        }
        for (const at of points) this.billboards.add({ at, width: PATH_WIDTH * DISC_BOX, rect: disc, colour: look.onDark });
        this.billboards.add({ at: points[points.length - 1], width: 2 * PATH_END_RADIUS * DISC_BOX, rect: disc, colour: look.onDark });
    }

    /** A shield standing on the middle of each side of a square that gives cover: whole for full cover, half-filled for half. */
    private layCover(field: Battlefield, look: BoardLook): void {
        const { coverAt } = this.spec;
        if (coverAt === null) return;
        const width = SHIELD_WIDTH + SHIELD_STROKE + 0.6, height = SHIELD_HEIGHT + SHIELD_STROKE + 0.6;
        for (const { cover, at } of shieldsAt(field, coverAt)) {
            const rect = this.atlas.rect(`${this.looks}:shield:${cover}`, width, height, context => {
                // Its point at the foot of the box, a stroke's half-width above its edge.
                context.translate(width / 2, height - SHIELD_STROKE / 2 - 0.3);
                const outline = new Path2D(shieldPath());
                context.fillStyle = rgba(look.night, SHIELD_GROUND);
                context.fill(outline);
                context.strokeStyle = rgba(look.gold);
                context.lineWidth = SHIELD_STROKE;
                context.lineJoin = "round";
                context.stroke(outline);
                context.fillStyle = rgba(look.gold);
                context.fill(new Path2D(shieldPath(cover === "half")));
            });
            // Hung by its point, which stands on the edge.
            this.billboards.add({ at, y: -(height / 2 - SHIELD_STROKE / 2 - 0.3), width, height, rect });
        }
    }

    /** The chance to hit, a pill over each target, above its HP bar. */
    private layOdds(field: Battlefield, look: BoardLook): void {
        if (!this.typeset) return;
        const style: TextStyle = { family: look.font, ...ODDS_FONT };
        const width = ODDS_WIDTH + ODDS_STROKE, height = ODDS_HEIGHT + ODDS_STROKE;
        for (const { square, chance } of this.spec.odds) {
            const rect = this.atlas.rect(`${this.looks}:odds:${chance}`, width, height, context => this.drawPill(context, `${chance}%`, width, height, style, look));
            this.billboards.add({ at: squareCentre(field, square), y: -ODDS_RISE, width, height, rect });
        }
    }

    private drawPill(context: CanvasRenderingContext2D, text: string, width: number, height: number, style: TextStyle, look: BoardLook): void {
        const inset = ODDS_STROKE / 2;
        context.beginPath();
        context.roundRect(inset, inset, width - 2 * inset, height - 2 * inset, ODDS_HEIGHT / 2);
        context.fillStyle = rgba(look.night, ODDS_GROUND);
        context.fill();
        context.strokeStyle = rgba(look.gold);
        context.lineWidth = ODDS_STROKE;
        context.stroke();
        drawText(context, text, width / 2, height / 2, style, rgba(look.gold), { baseline: "middle" });
    }

    dispose(): void {
        this.billboards.dispose();
        this.atlas.dispose();
    }
}
