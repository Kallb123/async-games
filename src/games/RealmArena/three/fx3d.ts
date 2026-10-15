// What an action does, played over the 3D battlefield (docs/games/realm-arena.md
// §26): the hit text rising off a figure, a strike's slash across it, a burst
// where something went off, the missiles in flight — and the smoke pot's cloud
// that stands on its squares after. The isometric board draws these in an
// overlay SVG (RealmArenaFx); here each is a quad that faces the camera
// (billboards.ts), hung from a square of the world and laid out across the
// frame in the isometric board's own units, by the same maths and on the same
// clock (ui.ts's `hitTextAt`, `burstAt`, `slashAt`, `flightAt`). So an effect
// is placed where the isometric board would put it, whatever the camera's turn,
// and shakes and zooms with the board for free.
//
// Few draws, however many effects: one for the sprites of the fx sheet (every
// burst but the smoke pot's, every slash and every missile), one for the smoke
// pot's burst, one for the effect marks beside the text, one for the text itself
// (drawn once each into a canvas, see `CanvasAtlas`), all over everything the way
// the isometric board's effects layer is; and one for the standing smoke, which
// a wall in front of hides.

import type { Scene, Texture } from "three";
import { BURST_ART, EFFECT_ART, MISSILE_ART, SLASH_ART, SMOKE_ART } from "@/games/RealmArena/art";
import {
    burstAt, flightAt, fxPointsAt, HIT_MARK_SIZE, hitTextAt, MARK_SHADOW, SLASH_SIZE, slashAt,
    type BattleCue, type BurstCue, type FlightCue, type HitTone, type SlashCue, type TextCue,
} from "@/games/RealmArena/ui";
import { squareCentre, onScreen, type CameraBasis, type Vec3 } from "./iso3d";
import { Billboards, CanvasAtlas, sheetTexture, spriteRect, toBoardUnits, type BillboardAxes, type BillboardShadow } from "./billboards";
import { drawText, textWidth, whenFontReady, type TextStyle } from "./canvasShapes";
import { BODY, burstBox, flightPlace, hitTextLayout, SMOKE_PUFF } from "./fxLayout";
import type { Sheets } from "./terrain3d";
import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import type { Point } from "@/utils/ui/isometric";

/** What an action plays, sorted by the kind of thing to draw. */
interface Cues {
    /** Reduced motion: text appears where it happened and fades, and nothing flies, bursts or slashes. */
    still: boolean;
    texts: TextCue[];
    bursts: BurstCue[];
    slashes: SlashCue[];
    flights: FlightCue[];
}

/** How one line of hit text is painted, as the stylesheet has it (`.ag-ra-hit-value`, `.ag-ra-hit-label`): its font in board units, the fill and outline as CSS colours, and the outline's width. */
interface TextLook {
    style: TextStyle;
    fill: string;
    stroke: string;
    strokeWidth: number;
}

/** The look of the big text and the small text of one tone of hit text. */
interface HitLook {
    value: TextLook;
    label: TextLook;
}

/** The layers it draws into: one `Billboards` each. */
interface Layers {
    /** The fx sheet's sprites: the bursts, the slashes and the missiles. */
    effects: Billboards;
    /** The smoke pot's burst, from the items sheet. */
    smokeBursts: Billboards;
    /** The effect marks beside the hit text. */
    marks: Billboards;
    /** The hit text. */
    words: Billboards;
    /** The smoke standing on its squares, which whatever is in front hides. */
    clouds: Billboards;
    atlas: CanvasAtlas;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Reads what the stylesheet gives the classes the isometric board's SVG wears,
 * rather than writing it out again here: `build` puts elements of those classes
 * on a throwaway SVG under `host`, so the tokens they use resolve where the
 * board is, and `read` makes what it wants of what they computed.
 */
function probe<Result>(host: HTMLElement, build: (svg: SVGSVGElement) => Element[], read: (elements: Element[]) => Result): Result {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;visibility:hidden";
    const elements = build(svg);
    host.appendChild(svg);
    const result = read(elements);
    svg.remove();
    return result;
}

const svgElement = (parent: Element, name: string, className: string): SVGElement => {
    const element = document.createElementNS(SVG_NS, name);
    element.setAttribute("class", className);
    parent.appendChild(element);
    return element;
};

/** How a tone of hit text is painted: the fill the tone gives it, and the outline in the night (`.ag-ra-hit`). */
function readHitLook(host: HTMLElement, tone: HitTone): HitLook {
    return probe(host, svg => {
        const group = svgElement(svg, "g", `ag-ra-hit ag-ra-hit--${tone}`);
        return [svgElement(group, "text", "ag-ra-hit-value"), svgElement(group, "text", "ag-ra-hit-label")];
    }, ([value, label]) => {
        const lookOf = (element: Element): TextLook => {
            const style = getComputedStyle(element);
            const text: TextStyle = { family: style.fontFamily, weight: parseFloat(style.fontWeight), size: parseFloat(style.fontSize) };
            return { style: text, fill: style.fill, stroke: style.stroke, strokeWidth: parseFloat(style.strokeWidth) };
        };
        return { value: lookOf(value), label: lookOf(label) };
    });
}

/** How faint a puff of smoke is (`.ag-ra-smoke-puff`). */
function readPuffOpacity(host: HTMLElement): number {
    return probe(host, svg => [svgElement(svg, "use", "ag-ra-smoke-puff")], ([puff]) => parseFloat(getComputedStyle(puff).opacity));
}

export class BattleFx {
    private layers: Layers | null = null;
    private field: Battlefield | null = null;
    private smoke: readonly Square[] = [];
    private cues: Cues | null = null;
    private readonly styles = new Map<HitTone, HitLook>();
    private puffOpacity: number | null = null;
    /** How wide each line of text is as its font draws it, by what `word` keys it with. */
    private readonly advances = new Map<string, number>();
    /** Bumped when the font arrives, so text drawn before it is drawn again: it is part of every key. */
    private generation = 0;

    /** `relay` lays the playing action out again, for whatever has changed under it. */
    constructor(private readonly scene: Scene, private readonly host: HTMLElement, private readonly axes: BillboardAxes, private readonly relay: () => void) {}

    /** The art arrived: the layers can be made. */
    setArt(sheets: Sheets): void {
        this.disposeLayers();
        const atlas = new CanvasAtlas();
        const over = (texture: Texture, order: number, shadow?: BillboardShadow) => new Billboards(texture, this.axes, { order, shadow });
        this.layers = {
            effects: over(sheetTexture(sheets, SLASH_ART.sheet), 10),
            smokeBursts: over(sheetTexture(sheets, SMOKE_ART.sheet), 10),
            // The mark beside a hit's text wears the soft shadow every mark does (`.ag-ra-figure-mark`).
            marks: over(sheetTexture(sheets, "effects"), 11, MARK_SHADOW),
            words: over(atlas.texture, 12),
            // Standing on the ground a little in front of its square's middle, so the ground in front of it doesn't cut into it; it's drawn after the figures and bars, under the effects.
            clouds: new Billboards(sheetTexture(sheets, SMOKE_ART.sheet), this.axes, { depthTest: true, order: 4, lift: 0.25 }),
            atlas,
        };
        for (const layer of [this.layers.clouds, this.layers.effects, this.layers.smokeBursts, this.layers.marks, this.layers.words]) {
            layer.mesh.visible = false;
            this.scene.add(layer.mesh);
        }
        this.layClouds();
    }

    /** The battlefield the squares are in: smoke stands at the height of the square it's over. */
    setField(field: Battlefield): void {
        this.field = field;
        this.layClouds();
    }

    /** The squares under a smoke pot's cloud, a puff over each. */
    setSmoke(squares: ReadonlySet<Square>): void {
        this.smoke = [...squares];
        this.layClouds();
    }

    /** What an action plays, or none. With `still` (reduced motion) only the text is played, and it doesn't rise. */
    play(cues: readonly BattleCue[] | null, still: boolean): void {
        if (!cues) {
            this.cues = null;
            return;
        }
        const of = <Kind extends BattleCue["kind"]>(kind: Kind) => (still && kind !== "text" ? [] : cues.filter(cue => cue.kind === kind)) as Extract<BattleCue, { kind: Kind }>[];
        this.cues = { still, texts: of("text"), bursts: of("burst"), slashes: of("slash"), flights: of("flight") };
    }

    /** Lays out what is playing as it is `ms` in, for the camera at `basis` (a missile's arc is across the frame). */
    lay(ms: number, basis: CameraBasis): void {
        const layers = this.layers, field = this.field;
        if (!layers || !field) return;
        const { effects, smokeBursts, marks, words } = layers;
        const drawn = [effects, smokeBursts, marks, words];
        drawn.forEach(layer => layer.begin());
        const cues = this.cues;
        if (cues) {
            const ground = (square: Square) => squareCentre(field, square);
            for (const cue of cues.bursts) {
                const frame = burstAt(cue, ms);
                const sprite = BURST_ART[cue.burst];
                const box = burstBox(sprite, cue.radius);
                (cue.burst === "smoke" ? smokeBursts : effects).add({ at: ground(cue.at), y: box.y, width: box.width, height: box.height, rect: spriteRect(sprite), scale: frame.scale, opacity: frame.opacity });
            }
            for (const cue of cues.slashes) {
                const frame = slashAt(cue, ms);
                effects.add({ at: ground(cue.square), x: BODY.x + frame.dx, y: BODY.y + frame.dy, width: SLASH_SIZE, rect: spriteRect(SLASH_ART), scale: frame.scale, opacity: frame.opacity });
            }
            if (cues.flights.length > 0) this.layFlights(cues.flights, ms, basis);
            for (const cue of cues.texts) this.layText(cue, ms, cues.still);
        }
        drawn.forEach(layer => {
            layer.end();
            layer.mesh.visible = layer.mesh.geometry.instanceCount > 0;
        });
    }

    /**
     * The missiles in flight, along the arcs the isometric board draws: the
     * squares are put where they land across the frame, in its units, and
     * `flightAt` finds the point and the heading there. Each is hung from the
     * square it was loosed from, so its depth is a real one.
     */
    private layFlights(flights: readonly FlightCue[], ms: number, basis: CameraBasis): void {
        const field = this.field!, { effects } = this.layers!;
        const across = (point: Vec3): Point => toBoardUnits(onScreen(basis, point));
        const pointsOf = (square: Square) => fxPointsAt(across(squareCentre(field, square)));
        for (const cue of flights) {
            const now = flightAt(cue, pointsOf, ms);
            if (!now) continue;
            const place = flightPlace(cue.missile, now, ms - cue.start, across(squareCentre(field, cue.from)));
            effects.add({ at: squareCentre(field, cue.from), x: place.x, y: place.y, width: place.size, rect: spriteRect(MISSILE_ART[cue.missile]), rotate: place.rotate, scale: place.scale, opacity: place.opacity });
        }
    }

    /** One piece of hit text: its number, the label under it and the mark beside it, hung from the head of the figure on its square. */
    private layText(cue: TextCue, ms: number, still: boolean): void {
        const frame = hitTextAt(cue, ms, still);
        const field = this.field!, { atlas, marks, words } = this.layers!;
        if (frame.opacity <= 0) return;
        const look = this.lookOf(cue.tone);
        const at = squareCentre(field, cue.square);
        const value = this.word(cue.value, look.value, cue.tone, "value");
        const layout = hitTextLayout(cue, frame, value.advance);
        const place = (word: ReturnType<BattleFx["word"]>, to: Point) =>
            words.add({ at, x: to.x, y: to.y, width: word.rect.width / atlas.scale, height: word.rect.height / atlas.scale, rect: word.rect, scale: layout.scale, opacity: frame.opacity });
        place(value, layout.value);
        if (cue.label && layout.label) place(this.word(cue.label, look.label, cue.tone, "label"), layout.label);
        if (cue.mark && layout.mark) marks.add({ at, x: layout.mark.x, y: layout.mark.y, width: HIT_MARK_SIZE, rect: spriteRect(EFFECT_ART[cue.mark]), scale: layout.scale, opacity: frame.opacity });
    }

    /** A line of text drawn into the atlas, if it isn't there yet: where, and how wide the font sets it (what the mark beside it is cleared of). */
    private word(text: string, look: TextLook, tone: HitTone, part: "value" | "label") {
        const { atlas } = this.layers!;
        const key = `${this.generation}|${tone}|${part}|${text}`;
        let advance = this.advances.get(key);
        if (advance === undefined) this.advances.set(key, advance = textWidth(atlas, text, look.style));
        // Centred in a box a little wider than the text and its outline, and taller than the line.
        const width = advance + look.strokeWidth + 1, height = look.style.size * 1.35 + look.strokeWidth;
        const outline = { colour: look.stroke, width: look.strokeWidth, join: "round" as const };
        return { rect: atlas.rect(key, width, height, context => drawText(context, text, width / 2, height / 2, look.style, look.fill, { baseline: "middle", outline })), advance };
    }

    /** How a tone of hit text looks, read from the stylesheet the first time it's wanted. */
    private lookOf(tone: HitTone): HitLook {
        let look = this.styles.get(tone);
        if (!look) {
            this.styles.set(tone, look = readHitLook(this.host, tone));
            // Text drawn before its font arrives would be drawn in the fallback for good: draw it again once it does.
            const { weight, size, family } = look.value.style;
            whenFontReady(`${weight} ${size}px ${family}`, () => { this.generation++; this.relay(); });
        }
        return look;
    }

    /** The smoke standing on each smoked square. */
    private layClouds(): void {
        const field = this.field;
        if (!this.layers || !field) return;
        const { clouds } = this.layers;
        const opacity = this.puffOpacity ??= readPuffOpacity(this.host);
        clouds.begin();
        for (const square of this.smoke) {
            if (square < field.tiles.length) clouds.add({ at: squareCentre(field, square), y: SMOKE_PUFF.y, width: SMOKE_PUFF.width, rect: spriteRect(SMOKE_ART), opacity });
        }
        clouds.end();
        clouds.mesh.visible = clouds.mesh.geometry.instanceCount > 0;
    }

    private disposeLayers(): void {
        if (!this.layers) return;
        const { atlas, ...billboards } = this.layers;
        for (const layer of Object.values(billboards)) {
            this.scene.remove(layer.mesh);
            layer.dispose();
        }
        atlas.dispose();
        this.layers = null;
    }

    dispose(): void {
        this.disposeLayers();
    }
}
