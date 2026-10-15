// The HP bars over the standing figures on the 3D board (docs/realm-arena-3d.md),
// as the isometric board draws them (`HpBar`, `HpChange`): the dark back, the
// fill in the figure's owner's colour, the pale chip of the HP a blow has just
// taken off draining after it, the dark edge round the whole, and — on the
// viewer's turn — what the action lined up would do to the bar, flashing at
// the end of it. All of it is quads facing the camera, in the isometric board's
// units (`HP_BAR_*`), hung from the figure's feet: one `Billboards`, one draw
// for every bar however many.

import { Color } from "three";
import type { Fighter } from "@/games/RealmArena/rules";
import { HP_BAR_HEIGHT, HP_BAR_RISE, HP_BAR_WIDTH, hpFraction } from "@/games/RealmArena/ui";
import { Billboards, CanvasAtlas, type BillboardAxes } from "./billboards";
import { solidRect, type BoardLook } from "./canvasShapes";
import type { Vec3 } from "./iso3d";

/** How far the dark edge's stroke is wide (`.ag-ra-hp-edge`). */
const EDGE_WIDTH = 0.45;
/** How strong the pale chip is (`.ag-ra-hp-chip`), and how dark the back (`.ag-ra-hp`). */
const CHIP_OPACITY = 0.8;
const BACK_OPACITY = 0.7;
/** How faint the lined-up HP change flashes, and how long a flash takes (`.ag-ra-pulse--hp`). */
const PULSE_MIN = 0.15;
const PULSE_MS = 800;
/** The fill of a bar whose figure has no owner's colour; the back is `.ag-ra-hp`'s black. */
const UNOWNED = new Color(0.85, 0.85, 0.85);
const BLACK = new Color(0, 0, 0);

/** One standing figure's bar, as fractions of its width from the left. */
export interface BarSpec {
    feet: Vec3;
    fill: number;
    /** How far the chip reaches: the fill, or past it while the HP a blow took off drains away. */
    chip: number;
    /** What the action lined up would do to the bar: the stretch of it a blow would take off, or a heal give. */
    preview: { from: number; to: number; gain: boolean } | null;
    tint: Color | null;
    /** How clearly the bar shows, 0–1 (default 1): a downed figure's bar fades with it. */
    fade?: number;
}

/**
 * The levels of one bar. `drawn` is the figure as its bar shows it (an
 * action playing steps its HP, `toldAt`) with `chip` the level the pale chip
 * is draining down to; `fighter` is the figure as it stands, which `change`
 * — the HP an action lined up on it would add, negative for a blow — is
 * measured from.
 */
export function barLevels(drawn: Fighter, fighter: Fighter, chip: number | undefined, change: number | undefined): Pick<BarSpec, "fill" | "chip" | "preview"> {
    const fill = hpFraction(drawn);
    const now = hpFraction(fighter), after = change ? hpFraction(fighter, -change) : now;
    return {
        fill,
        chip: chip === undefined ? fill : Math.max(fill, hpFraction(drawn, drawn.hp - chip)),
        preview: now === after ? null : { from: Math.min(now, after), to: Math.max(now, after), gain: after > now },
    };
}

/** How opaque a flash is `ms` into the playback's clock: full, down to `min` and back every `length`, smooth at both ends, as `ag-pulse` eases. */
export function pulseAt(ms: number, min = PULSE_MIN, length = PULSE_MS): number {
    return min + (1 - min) * (0.5 + 0.5 * Math.cos(2 * Math.PI * (ms % length) / length));
}

export class HpBars {
    private readonly atlas = new CanvasAtlas(24, 512);
    /** Behind a wall that stands in front of a figure, as the figure is. */
    readonly billboards: Billboards;
    private bars: readonly BarSpec[] = [];
    private look: BoardLook | null = null;
    private opacity = 1;
    /** Reduced motion: a lined-up change shows at a steady middle opacity, not flashing. */
    private still = false;

    constructor(axes: BillboardAxes) {
        // Drawn after the solids and the ring, before the previews and the marks.
        this.billboards = new Billboards(this.atlas.texture, axes, { depthTest: true, order: 3, lift: 0.9 });
    }

    /** Whether any bar has a change to flash, which the board runs frames for. */
    get pulsing(): boolean {
        return !this.still && this.bars.some(bar => bar.preview);
    }

    /** Every standing figure's bar, as they are now; `still` is reduced motion, from the board. */
    lay(bars: readonly BarSpec[], look: BoardLook | null, still: boolean): void {
        this.bars = bars;
        this.look = look;
        this.still = still;
        this.build();
    }

    /** The lined-up changes flashing as they are `ms` in. */
    pulse(ms: number): void {
        this.opacity = pulseAt(ms);
        this.build();
    }

    private build(): void {
        const { billboards, look, atlas } = this;
        const solid = solidRect(atlas);
        const edge = atlas.rect("edge", HP_BAR_WIDTH + EDGE_WIDTH, HP_BAR_HEIGHT + EDGE_WIDTH, context => {
            context.strokeStyle = "#fff";
            context.lineWidth = EDGE_WIDTH;
            context.strokeRect(EDGE_WIDTH / 2, EDGE_WIDTH / 2, HP_BAR_WIDTH, HP_BAR_HEIGHT);
        });
        const y = -(HP_BAR_RISE + HP_BAR_HEIGHT / 2);
        /** The stretch of a bar from `from` to `to` of its width. */
        const stretch = (at: Vec3, from: number, to: number, colour: Color, opacity = 1) => {
            if (to <= from) return;
            billboards.add({ at, x: HP_BAR_WIDTH * ((from + to) / 2 - 0.5), y, width: HP_BAR_WIDTH * (to - from), height: HP_BAR_HEIGHT, rect: solid, colour, opacity });
        };
        billboards.begin();
        for (const { feet, fill, chip, tint, fade = 1 } of this.bars) {
            stretch(feet, 0, 1, BLACK, BACK_OPACITY * fade);
            stretch(feet, 0, fill, tint ?? UNOWNED, fade);
            if (look) {
                stretch(feet, fill, chip, look.hpLight, CHIP_OPACITY * fade);
                // A dark edge round the whole bar, over what's in it, so it reads on grass, stone or a figure alike.
                billboards.add({ at: feet, y, width: HP_BAR_WIDTH + EDGE_WIDTH, height: HP_BAR_HEIGHT + EDGE_WIDTH, rect: edge, colour: look.hpDark, opacity: fade });
            }
        }
        // After every bar, as the isometric board draws its pulses after everything else.
        const opacity = this.still ? (1 + PULSE_MIN) / 2 : this.opacity;
        if (look) {
            for (const { feet, preview } of this.bars) {
                if (preview) stretch(feet, preview.from, preview.to, preview.gain ? look.hpLight : look.hpDark, opacity);
            }
        }
        billboards.end();
    }

    dispose(): void {
        this.billboards.dispose();
        this.atlas.dispose();
    }
}
