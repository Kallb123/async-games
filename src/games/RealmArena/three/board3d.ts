// The 3D battlefield, imperatively (docs/realm-arena-3d.md): a three.js scene
// the React board (`RealmArenaBoard3D`) owns one of and feeds — the battlefield,
// the figures on it, what's shaded on the ground, the turn of the view, and what
// an action is playing — and that draws itself only when something has changed,
// or a frame at a time while something moves.
//
// It is a camera, and `BoardZoom` drives it (its camera mode): the pane's
// scrolling, the zoom pill, a pinch, a focus glide and a follow all arrive as one
// thing, the part of the board's frame (`iso3d`'s `BoardFrame`) in the pane
// (`setView`), and this sets its orthographic camera to show exactly that. It
// takes no gesture of its own but a tap.
//
// It keeps no clock of its own for what an action plays: the board's
// `PlaybackProvider` hands it the playback's time (`frame`), and where
// everything is at that time comes from the same pure functions the isometric
// board draws from (`walkerAt`, `toldAt`, `shakeAt`, the cues' own timings),
// placed in the world rather than on the isometric board.

import { Color, Matrix4, OrthographicCamera, Scene, Vector3, WebGLRenderer, type ShaderMaterial } from "three";
import type { CharacterId } from "@/games/RealmArena/characters";
import { isStanding, type Fighter, type FogGhost, type MusterPick } from "@/games/RealmArena/rules";
import { CLIMB_LEG, endOf, fadeOutAt, shakeAt, shovesOf, toldAt, toldOf, walkerAt, walkLift, type BattleCue, type FallCue, type Ring, type ScorchCue, type Shove, type Told, type WalkCue } from "@/games/RealmArena/ui";
import { facingTowards, type Battlefield, type Facing, type Square } from "@/utils/games/battlefield/terrain";
import { easeInOut } from "@/utils/ui/boardZoom";
import type { Rect } from "@/utils/ui/mapLabels";
import { billboardAxes, fromBoardUnits, setAxes } from "./billboards";
import { barLevels, HpBars, type BarSpec } from "./bars3d";
import type { BoardLook } from "./canvasShapes";
import type { CharacterModels } from "./characterModels";
import { fallingAt, mayBeHidden, shoveOf, type Falling } from "./figureCues";
import { FigurePools } from "./figurePools";
import { BattleFx } from "./fx3d";
import { azimuthOf, cameraBasis, cameraFor, figureMatrix, lerp3, lightOf, lookAtFor, lookAtGround, onScreen, QUARTER, squareCentre, toFrame, type BoardFrame, type BoardLayout, type CameraBasis, type Vec3 } from "./iso3d";
import { MarkLayer, marksOf, type MarkLevel } from "./marks3d";
import { GroundOutlines, type Outline } from "./outlines3d";
import { NO_PREVIEWS, Previews3D, type PreviewSpec } from "./previews3d";
import type { Shading } from "./shading3d";
import { GroundShadows } from "./shadows3d";
import { lightSolids } from "./solidMaterial";
import { buildCover, buildTerrain, type Cover, type Sheets, type Terrain } from "./terrain3d";

/** How often the wave's breathing is drawn (§30.11): a slow glow needs no more, and every frame of it draws the whole board. */
const WAVE_FRAME_MS = 66;
/** Where the strokes round the shaded areas are drawn: over the ground's shading and the wave's (renderOrder 0), under the rings (1). */
const OUTLINE_ORDER = 0.5;
/** How long a quarter turn of the view takes. */
const TURN_MS = 320;
/** How far a press may move and still be a tap, in pixels. */
const TAP_SLOP = 8;

/** A board unit up the frame, in the world's height: a full height is 10 of them. */
const BOARD_RISE = QUARTER * 4 / 10;
/** How often a lined-up HP change's flash is drawn: smooth enough for a flash of 0.8s, and every frame of it draws the whole board. */
const PULSE_FRAME_MS = 33;

/** A figure the board can pick: where it stands, roughly, for a tap to find. */
interface Placed { id: number; feet: Vec3; standing: boolean }

export type { Outline, Shading };

/** What the board is told about a figure, as the React board works it out. */
export interface FigureSpec {
    fighter: Fighter;
    facing: Facing;
    /** Its owner's colour, its team parts tinted with; none for one nobody owns. */
    tint: Color | null;
}

/** A pick of the viewer's sealed squad (the muster), and which way it's drawn facing. */
export interface SealedSpec {
    pick: MusterPick;
    facing: Facing;
}

/** How much of a stale sighting in the fog (§27) shows: faint. */
const GHOST_OPACITY = 0.35;

/** How faint the sealed squad is drawn, as the isometric board has it (`.ag-ra-sealed`). */
const SEALED_OPACITY = 0.7;

/** What the figures are marked with: whose turn it is in battle (their AP shows), and the ring round each figure's feet. */
export interface Marking {
    acting: string | null;
    rings: ReadonlyMap<number, Ring>;
}

/** What an action plays, ready to place a frame at a time. */
interface Playing {
    /** Which playback it is (`PlaybackProvider`'s `playKey`). */
    key: string;
    cues: readonly BattleCue[];
    walks: Map<number, WalkCue[]>;
    falls: Map<number, FallCue>;
    told: Map<number, Told>;
    /** The cover each blast takes away, standing as the action found it until its cue (`layCovers`): built once the art is here. */
    covers: { cue: ScorchCue; cover: Cover | null }[];
    /** The battlefield as the action found it, which the cover it blasts is drawn from. */
    field: Battlefield;
    /** Every blow a figure takes and strike it makes that moves it, by fighter, worked out as they are asked for (`shovesOf`). */
    shoves: Map<number, Shove[]>;
    /** When each walker's last walk is over, by fighter. */
    arrivals: Map<number, number>;
    /** The walker whose walk the camera follows. */
    tracked: number | null;
    end: number;
    /** Reduced motion: nobody walks, nothing flies, bursts, slashes or shakes the board, and hit text only fades. */
    still: boolean;
}

/** What every 3D board has drawn so far, for the rendering bench: frames, and the draw calls and triangles the GPU was handed. */
const drawn = { frames: 0, calls: 0, triangles: 0 };

export function renderStats(): Readonly<typeof drawn> {
    return { ...drawn };
}

/** What the board tells whoever holds it. */
export interface Handlers {
    onFigure: (id: number) => void;
    onSquare: (square: Square) => void;
}

/** What the board draws from: the art sheets (the ground, the terrain's colours) and the characters' models. */
export interface Art { sheets: Sheets; models: CharacterModels }

export class Board3D {
    readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private readonly scene = new Scene();
    private readonly lens = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    private terrain: Terrain | null = null;
    private field: Battlefield | null = null;
    /** The battlefield's tallest top, in quarters (`setField`). */
    private top = 0;
    private art: Art | null = null;
    private readonly solids: ShaderMaterial[] = [];
    /** Which way the camera faces, for everything drawn flat to it (`Billboards`): set as it turns. */
    readonly axes = billboardAxes();

    private readonly pools = new FigurePools(this.scene);
    private figures: FigureSpec[] = [];
    private ghosts: { ghost: FogGhost; facing: Facing; tint: Color | null }[] = [];
    private placed: Placed[] = [];

    /** The HP bars, and the lined-up action's previews and the centre's name: flat to the camera, one draw each. */
    private readonly bars: HpBars;
    private readonly previews: Previews3D;
    /** What the marks, bars and previews are drawn in, and the HP an action lined up would change, for the bars (`setLook`, `setHpChange`). */
    private look: BoardLook | null = null;
    private hpChange: ReadonlyMap<number, number> | null = null;
    /** Reduced motion, as the board was last told (`play`): the bars' lined-up change holds steady instead of flashing. */
    private still = false;
    /** The effects an action plays over the battlefield, and the smoke that stands on it. */
    private readonly fx: BattleFx;
    /** What hangs round the figures: marks, pips, items and rings. Made with the art it draws from. */
    private marks: MarkLayer | null = null;
    private marking: Marking | null = null;
    /** The viewer's sealed squad while the muster lasts, and which of them is picked up. Their ids in `placed` are `-(index + 1)`. */
    private sealed: SealedSpec[] = [];
    private pickedUp: number | null = null;

    // The view: the part of the frame in the pane (`setView`, in the frame's own
    // units), the frame it is measured in, and how far the camera has turned.
    private view: Rect | null = null;
    private azimuth = azimuthOf(0);
    /** The camera as it is now, turned to `azimuth`: what the scene is lit and its bars faced by. */
    private basis: CameraBasis = cameraBasis(azimuthOf(0));
    /** The camera at the turn the view is going to: the turn the frame, and so the view, is laid out at. Differs from `basis` only while the view is turning. */
    private frameBasis: CameraBasis = this.basis;
    /** The whole battlefield's frame, at the turn `frameBasis` is at (`setFrame`). */
    private layout: BoardFrame | null = null;
    private shake: Vec3 = [0, 0, 0];
    private size = { width: 1, height: 1 };
    /**
     * The view turning about the ground at the middle of the frame: from the
     * ground it was showing, to the ground the view now shows. The two are the
     * same ground unless `BoardZoom` could not keep the middle where it was (the
     * turn's pivot, clamped at the edge of the board), when it glides between.
     */
    private turn: { from: number; to: number; start: number; ground: Vec3; progress: number } | null = null;
    /** What's shaded on the ground, kept to lay again over ground built afresh. */
    private shading: { shade: (square: Square) => Shading | null; wave: ReadonlyMap<Square, Color> | null } | null = null;
    /** The strokes round the areas shaded on it, and the wave's, which breathe with the wave's shading (`setOutlines`). */
    private readonly outlines = new GroundOutlines(OUTLINE_ORDER);
    private readonly waveOutlines = new GroundOutlines(OUTLINE_ORDER + 0.1);
    private outlined: { outlines: readonly Outline[]; wave: readonly Outline[] } | null = null;
    /** The soft shadow under each figure, lying on the ground. */
    private readonly shadows = new GroundShadows();
    private animating = 0;
    private waveDue = false;
    private waveDrawn = 0;
    private pulseDrawn = 0;

    private playing: Playing | null = null;
    /** How far into the playing action the figures were last laid, for a turn of the view to lay them there again. */
    private playedMs = 0;
    /** `frame` is working: a view arriving in it is drawn by it, not a second time. */
    private framing = false;
    /** `BoardZoom`'s `useBoardCentre`, while a camera follows a walker, and whether it has been told of one. */
    private centre: ((point: { x: number; y: number } | null) => void) | null = null;
    private following = false;
    private drawPending = 0;
    private readonly resize: ResizeObserver;

    /** Who hears of a tap on a figure, or on a square where none stands. */
    private handlers: Handlers = { onFigure: () => {}, onSquare: () => {} };

    constructor(private readonly host: HTMLElement) {
        this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x000000, 0);
        this.canvas = this.renderer.domElement;
        host.appendChild(this.canvas);

        this.bars = new HpBars(this.axes);
        this.previews = new Previews3D(this.axes);
        this.scene.add(this.outlines.mesh, this.waveOutlines.mesh, this.shadows.mesh, this.bars.billboards.mesh, this.previews.billboards.mesh);
        this.fx = new BattleFx(this.scene, host, this.axes, () => this.playing && this.frame(this.playedMs));

        this.resize = new ResizeObserver(() => this.measure());
        this.resize.observe(host);
        this.measure();
        this.handleTaps();
    }

    dispose(): void {
        this.stopFollowing();
        cancelAnimationFrame(this.drawPending);
        cancelAnimationFrame(this.animating);
        this.resize.disconnect();
        this.terrain?.dispose();
        this.fx.dispose();
        this.marks?.dispose();
        this.bars.dispose();
        this.previews.dispose();
        this.outlines.dispose();
        this.waveOutlines.dispose();
        this.shadows.dispose();
        this.clearCovers();
        this.pools.dispose();
        this.renderer.dispose();
        // Hand the context back now, not whenever it's collected: a page allows only so many at once, and drops the oldest past that.
        this.renderer.forceContextLoss();
        this.canvas.remove();
    }

    listen(handlers: Handlers): void {
        this.handlers = handlers;
    }

    /**
     * The way to keep a point of the frame in the middle of the pane
     * (`BoardZoom`'s `useBoardCentre`), for a camera that follows a walker too
     * far to frame; none when there is nothing to follow with.
     */
    follow(centre: ((point: { x: number; y: number } | null) => void) | null): void {
        this.stopFollowing();
        this.centre = centre;
    }

    private stopFollowing(): void {
        if (!this.following) return;
        this.following = false;
        this.centre?.(null);
    }

    // ---- What it draws ----

    /** What it draws from, arrived: nothing is drawn before it, ground or figure. */
    setArt(art: Art): void {
        this.art = art;
        this.fx.setArt(art.sheets);
        if (this.marks) {
            this.scene.remove(this.marks.group);
            this.marks.dispose();
        }
        this.marks = new MarkLayer(art.sheets, this.axes);
        this.scene.add(this.marks.group);
        if (this.field) this.setField(this.field, this.top);
    }

    /** The battlefield, and its tallest top in quarters: its ground and terrain built again, as they are only when cover is blasted. */
    setField(field: Battlefield, top: number): void {
        this.field = field;
        this.top = top;
        this.fx.setField(field);
        this.previews.lay(field, this.basis);
        if (!this.art) return;
        if (this.terrain) {
            this.scene.remove(this.terrain.group);
            this.terrain.dispose();
        }
        this.terrain = buildTerrain(field, this.art.sheets);
        this.scene.add(this.terrain.group);
        this.relight();
        this.layFigures();
        this.applyShading();
        this.applyOutlines();
        this.invalidate();
    }

    /** Everyone on the battlefield, and the stale sightings in the fog (§27), drawn faint. */
    setFigures(figures: FigureSpec[], ghosts: { ghost: FogGhost; facing: Facing; tint: Color | null }[]): void {
        this.figures = figures;
        this.ghosts = ghosts;
        this.layFigures();
        this.layStanding();
        // A figure arriving with a change to flash on its bar starts the flashing.
        this.animate();
        this.invalidate();
    }

    /** What the figures are marked with: the ring round each one's feet (chosen, a candidate, aimed at, a watcher) and the AP pips on its owner's turn. */
    setMarking(marking: Marking): void {
        this.marking = marking;
        this.layFigures();
        this.invalidate();
    }

    /** The viewer's sealed squad, drawn where each pick stands while the muster lasts, and the index of the one picked up to move, if any. */
    setSealed(sealed: SealedSpec[], pickedUp: number | null): void {
        this.sealed = sealed;
        this.pickedUp = pickedUp;
        this.layFigures();
        this.layStanding();
        this.invalidate();
    }

    /** The squares under a smoke pot's cloud, a puff over each, standing on the ground. */
    setSmoke(squares: ReadonlySet<Square>): void {
        this.fx.setSmoke(squares);
        this.invalidate();
    }

    /** What's shaded on each square of the ground, and the zones the wave will land in (§30.11) in each one's colour, if it's due. */
    setShading(shade: (square: Square) => Shading | null, wave: ReadonlyMap<Square, Color> | null): void {
        this.shading = { shade, wave };
        this.applyShading();
    }

    /**
     * The strokes round the areas shaded on the ground, drawn in the order given,
     * and those of the zones the wave will land in (§30.11), which breathe with
     * its shading. Their edges lie on the tops of the squares, so they are laid
     * again with the ground (`setField`).
     */
    setOutlines(outlines: readonly Outline[], wave: readonly Outline[]): void {
        this.outlined = { outlines, wave };
        this.applyOutlines();
    }

    private applyOutlines(): void {
        // With no ground yet there is nothing for them to lie on, and drawing them before it is a frame, and a program compiled, for strips floating in the dark.
        if (!this.field || !this.terrain || !this.outlined) return;
        this.outlines.set(this.field, this.outlined.outlines);
        this.waveOutlines.set(this.field, this.outlined.wave);
        this.invalidate();
    }

    /**
     * What the marks, the bars and the previews are drawn in: the colours and
     * typeface the isometric board's CSS gives them. The text in the previews
     * waits for the typeface to load, and is laid out when it has.
     */
    setLook(look: BoardLook): void {
        this.look = look;
        this.previews.setLook(look, () => this.layPreviews());
        this.layFigures();
        this.layPreviews();
    }

    /** What's drawn over the board of a lined-up action and of the map: the path, the odds, the cover and the centre's name. */
    setPreviews(spec: PreviewSpec = NO_PREVIEWS): void {
        this.previews.set(spec);
        this.layPreviews();
    }

    /** What an action lined up would do to the HP of each figure it touches, flashing at the end of its bar. */
    setHpChange(change: ReadonlyMap<number, number> | null): void {
        this.hpChange = change;
        this.layFigures();
        this.animate();
        this.invalidate();
    }

    /** Tells the previews where figures stand, for the centre's name to keep off them: when they are set, and not as one walks. */
    private layStanding(): void {
        if (this.previews.setFigures([...this.figures.map(({ fighter }) => fighter.square), ...this.sealed.map(({ pick }) => pick.square)])) this.layPreviews();
    }

    private layPreviews(): void {
        this.previews.lay(this.field, this.basis);
        this.invalidate();
    }

    private applyShading(): void {
        const terrain = this.terrain, field = this.field;
        if (!terrain || !field || !this.shading) return;
        const { shade, wave } = this.shading;
        const paint = (data: Uint8Array, at: (square: Square) => Shading | null) => {
            for (let square = 0; square < field.tiles.length; square++) {
                const shading = at(square);
                const i = square * 4;
                if (!shading) { data[i + 3] = 0; continue; }
                const [r, g, b] = shading.colour.toArray();
                data[i] = r * 255; data[i + 1] = g * 255; data[i + 2] = b * 255; data[i + 3] = shading.alpha * 255;
            }
        };
        paint(terrain.overlay.data, shade);
        terrain.overlay.texture.needsUpdate = true;
        paint(terrain.wave.data, square => {
            const colour = wave?.get(square);
            return colour ? { colour, alpha: 0.55 } : null;
        });
        terrain.wave.texture.needsUpdate = true;
        this.waveDue = !!wave && wave.size > 0;
        terrain.wave.material.opacity = this.waveDue ? 0.5 : 0;
        this.animate();
        this.invalidate();
    }

    /**
     * The frame the view is measured in (`BoardZoom`'s viewBox), laid out at the
     * turn the view is going to — `layout` is `boardFrame` at that turn's camera,
     * which the page works out once, for `BoardZoom` as well. Called after
     * `setRotation` for the same turn, and before `BoardZoom`'s `pivot` puts the
     * view where that turn leaves the middle of the pane: until it does, the
     * view is the turn's before, and the camera is kept on the ground it showed
     * (`setRotation` notes that ground, in the frame it is still laid out in).
     */
    setFrame({ basis, frame }: BoardLayout): void {
        this.frameBasis = basis;
        this.layout = frame;
        this.invalidate();
    }

    /**
     * Turns the view a quarter at a time (`IsoRotation`), gliding round unless
     * told to jump. Called before the `setFrame` that lays the frame out at the
     * turn it is going to, so it notes the ground the view shows in the frame it
     * is leaving.
     */
    setRotation(rotation: number, glide: boolean): void {
        const to = azimuthOf(rotation);
        const before = glide ? this.camera() : null;
        if (!before) {
            this.turn = null;
            this.turnTo(to);
            this.invalidate();
            return;
        }
        // The short way round.
        let from = this.azimuth;
        while (to - from > Math.PI) from += 2 * Math.PI;
        while (from - to > Math.PI) from -= 2 * Math.PI;
        this.turn = { from, to, start: performance.now(), ground: before.ground, progress: 0 };
        this.animate();
    }

    /**
     * Tells the camera what part of the frame is in the pane (`BoardZoom`'s
     * `useBoardView`), in the frame's own units (`boardFrame`): drawn at once,
     * since it arrives a frame at a time from a scroll, a pinch or a glide
     * and is meant to be seen in that frame.
     */
    setView(view: Rect): void {
        this.view = view;
        if (!this.framing) this.draw();
    }

    /**
     * What an action plays, or none. Ready to draw at a time with `frame`. With
     * `still` (reduced motion) nobody walks, nothing flies, bursts, slashes or
     * shakes the board, and hit text only appears and fades.
     *
     * The playback it is already playing — handed over again as a new object
     * on a render, or now with a walker to follow — carries on where it is:
     * started again, everything it moves would be laid at its start, and a
     * walker drawn back on the square it set off from until the next frame.
     */
    play(playback: { key: string; cues: readonly BattleCue[]; before: readonly Fighter[]; field: Battlefield } | null, tracked: boolean, still = false): void {
        const playing = this.playing;
        if (playback && playing?.key === playback.key && playing.still === still) {
            playing.tracked = followed(playing.walks, tracked);
            if (playing.tracked === null) this.stopFollowing();
            return;
        }
        this.stopFollowing();
        this.clearCovers();
        this.playing = null;
        this.still = still;
        this.fx.play(playback?.cues ?? null, still);
        if (playback) {
            const walks = new Map<number, WalkCue[]>();
            const falls = new Map<number, FallCue>();
            const covers: Playing["covers"] = [];
            for (const cue of playback.cues) {
                if (cue.kind === "scorch") covers.push({ cue, cover: null });
                if (cue.kind === "walk" && !still) walks.set(cue.fighter.id, [...walks.get(cue.fighter.id) ?? [], cue]);
                if (cue.kind === "fall") falls.set(cue.fighter.id, cue);
            }
            const before = new Map(playback.before.map(fighter => [fighter.id, fighter]));
            const told = new Map<number, Told>();
            for (const { fighter } of this.figures) {
                const one = toldOf(playback.cues, before.get(fighter.id), fighter, still);
                if (one) told.set(fighter.id, one);
            }
            const arrivals = new Map([...walks].map(([id, one]) => [id, endOf(one)]));
            this.playing = {
                key: playback.key, cues: playback.cues, walks, falls, told, covers, field: playback.field, shoves: new Map(), arrivals, still,
                tracked: followed(walks, tracked), end: endOf(playback.cues),
            };
        }
        this.frame(0);
        // Whether a lined-up change on a bar flashes depends on it.
        this.animate();
    }

    /**
     * Draws what's playing as it is `ms` in — if it is the playback with `key`,
     * when one is given. The frame loop of the next playback runs its first
     * frame before the board is told of it (`play`), and that frame laid over
     * the playback before, at its start, would draw its walker back where it
     * set off from.
     */
    frame(ms: number, key?: string): void {
        const playing = this.playing, field = this.field;
        if (!field || (key !== undefined && playing?.key !== key)) return;
        this.playedMs = ms;
        // A follow moves the view as this lays the frame out, and it is drawn once, at the end.
        this.framing = true;
        try {
            this.layFigures(playing ? ms : null);
            if (playing) {
                this.layCovers(playing, ms);
                this.fx.lay(ms, this.basis);
                // The shake is across the frame in board units, down positive.
                const { x, y } = playing.still ? { x: 0, y: 0 } : shakeAt(playing.cues, ms);
                const across = fromBoardUnits({ x, y });
                this.shake = this.basis.right.map((n, i) => n * across.x + this.basis.up[i] * across.y) as Vec3;
                if (playing.tracked !== null && ms < playing.end) {
                    const walker = this.placed.find(one => one.id === playing.tracked);
                    if (walker && this.layout && this.centre) {
                        this.following = true;
                        this.centre(toFrame(this.layout, onScreen(this.frameBasis, walker.feet)));
                    }
                } else {
                    this.stopFollowing();
                }
            } else {
                this.fx.lay(0, this.basis);
                this.shake = [0, 0, 0];
            }
        } finally {
            this.framing = false;
        }
        this.draw();
    }

    // ---- Laying things out ----

    /**
     * Every figure in its place — as it stands, or `ms` into what's playing
     * (where it last got to, unless told: mid-action, at rest, a walker would
     * be drawn at the end of its walk) —
     * with its HP bar and marks over it. A character the action downs stands as
     * it was until the blow lands, then fades out as its fallen figure fades in
     * (`fallingAt`), its bar fading with it and no marks on it. A figure knocked
     * by a blow, or lunging as it strikes, slides over the ground (`shoveOf`);
     * its bar, marks and ring stay put. A standing figure something in front
     * hides is drawn again faintly (`FigurePools`' `hidden`), so it is still
     * there to see. Each figure has its shadow on the ground (`GroundShadows`),
     * which stays on its square as the figure bobs or is knocked and goes with a
     * walker along the ground; a stale sighting in the fog and the faint figure
     * drawn through a wall have none, as on the isometric board.
     */
    private layFigures(ms: number | null = this.playing ? this.playedMs : null): void {
        const field = this.field;
        if (!field || !this.art) return;
        const { models } = this.art;
        this.pools.begin();
        this.shadows.begin();
        this.placed = [];
        const matrix = new Matrix4();
        const bars: BarSpec[] = [];
        const playing = ms === null ? null : this.playing;
        this.marks?.begin(this.look);
        /** One figure of `character`, fully there or, with an `opacity` under 1, fading. */
        const lay = (character: CharacterId, at: Vec3, facing: Facing, fallen: boolean, tint: Color | null, opacity = 1) => {
            matrix.fromArray(figureMatrix(at, facing, fallen));
            if (opacity < 1) this.pools.place(models, character, "faint", matrix, tint, opacity);
            else this.pools.place(models, character, "solid", matrix, tint);
        };

        for (const spec of this.figures) {
            const { fighter } = spec;
            let square = fighter.square, facing = spec.facing, lift = 0;
            let feet: Vec3 | null = null;
            let standing = isStanding(fighter);
            // What it wears: all its marks at rest, its item alone while it walks, and none once down. Shown as the action found them until the cue that changed them lands.
            let level: MarkLevel = standing ? "all" : "none";
            // The figure as its bar and marks show it, and the level its chip drains down to.
            let drawn = fighter, chip: number | undefined;
            let falling: Falling | null = null;
            let knock: Vec3 = [0, 0, 0];
            const fall = playing?.falls.get(fighter.id);
            if (playing) {
                const walks = playing.walks.get(fighter.id);
                const leg = walks ? walkerAt(walks, ms!, (from, to) => worldLeg(field, from, to)) : null;
                if (leg) {
                    const a = squareCentre(field, leg.from), b = squareCentre(field, leg.to);
                    feet = lerp3(a, b, leg.across);
                    lift = -walkLift(leg, one => field.tiles[one].elevation) * BOARD_RISE;
                    if (leg.from !== leg.to) facing = facingTowards(field, leg.from, leg.to);
                    standing = true;
                    level = "item";
                } else if (walks && ms! < walks[0].start) {
                    square = walks[0].path[0];
                    standing = true;
                }
                if (fall) {
                    // Its bar is as the action found it too, fading with it.
                    drawn = fall.fighter;
                    if (ms! < fall.start) {
                        standing = true;
                        level = "none";
                        if (!leg) square = fall.fighter.square;
                    } else if (!leg) {
                        falling = fallingAt(fall, playing.arrivals.get(fighter.id), ms!, playing.still);
                    }
                }
                const told = playing.told.get(fighter.id);
                if (told) ({ drawn, chip } = toldAt(told, fighter, ms!));
                if (!leg) knock = shoveOf(this.shovesOf(playing, fighter.id), ms!, field, this.basis);
            }
            feet ??= squareCentre(field, square);
            const at: Vec3 = [feet[0], feet[1] + lift, feet[2]];
            if (falling && fall) {
                const fell = squareCentre(field, fall.fighter.square);
                if (falling.standing > 0) {
                    lay(fighter.character, fell.map((n, i) => n + knock[i]) as Vec3, spec.facing, false, spec.tint, falling.standing);
                    bars.push({ feet: fell, ...barLevels(drawn, drawn, undefined, undefined), tint: spec.tint, fade: falling.standing });
                }
                if (falling.lying !== null && falling.lying > 0) lay(fighter.character, at, spec.facing, true, spec.tint, falling.lying);
                // One shadow under both, there while either is: it is on the ground where it fell, and stays put.
                this.shadows.add(feet, Math.max(falling.standing, falling.lying ?? 0));
                this.placed.push({ id: fighter.id, feet: at, standing: false });
                this.layMarks(at, fighter, fighter, "none");
                continue;
            }
            const body = at.map((n, i) => n + knock[i]) as Vec3;
            lay(fighter.character, body, facing, !standing, spec.tint);
            // On the ground the figure stands on, not where it bobs or is knocked to.
            this.shadows.add(feet);
            // Standing figures only: a body on the ground is never the faint figure a wall hides.
            if (standing && mayBeHidden(field, this.basis, body, this.top)) this.pools.place(models, fighter.character, "hidden", matrix, spec.tint);
            this.placed.push({ id: fighter.id, feet: at, standing });
            if (standing) bars.push({ feet: at, ...barLevels(drawn, fighter, chip, this.hpChange?.get(fighter.id)), tint: spec.tint });
            this.layMarks(at, fighter, drawn, level);
        }
        this.layMuster(models, matrix);
        for (const { ghost, facing, tint } of this.ghosts) lay(ghost.character, squareCentre(field, ghost.square), facing, false, tint, GHOST_OPACITY);
        this.pools.end();
        this.shadows.end();
        this.bars.lay(bars, this.look, this.still);
        this.marks?.end();
    }

    /** Every blow a figure takes and strike it makes that moves it, worked out once an action (`shovesOf`). */
    private shovesOf(playing: Playing, id: number): Shove[] {
        let shoves = playing.shoves.get(id);
        if (!shoves) playing.shoves.set(id, shoves = shovesOf(playing.cues, id, playing.still));
        return shoves;
    }

    /** What hangs round a figure whose feet are at `feet`: its ring, and its marks, pips and item as far as `level` allows. */
    private layMarks(feet: Vec3, fighter: Fighter, drawn: Fighter, level: MarkLevel): void {
        const { marks, marking } = this;
        if (!marks || !marking) return;
        const worn = marksOf(level, drawn, fighter.owner === marking.acting);
        marks.figure(feet, worn);
        const ring = marking.rings.get(fighter.id);
        if (ring) marks.ring(feet, ring);
        if (worn.watching) marks.ring(feet, "watch");
    }

    /** The viewer's sealed squad, standing faintly where each pick is to be: with its item, the dashed ring of a squad still sealed, and a ring on the one picked up. */
    private layMuster(models: CharacterModels, matrix: Matrix4): void {
        const field = this.field!;
        this.sealed.forEach(({ pick, facing }, index) => {
            const feet = squareCentre(field, pick.square);
            matrix.fromArray(figureMatrix(feet, facing, false));
            this.pools.place(models, pick.character, "faint", matrix, null, SEALED_OPACITY);
            // The isometric board dims the sealed figure and not its shadow.
            this.shadows.add(feet);
            this.placed.push({ id: -(index + 1), feet, standing: true });
            this.marks?.figure(feet, { effects: [], watching: false, item: pick.item });
            this.marks?.ring(feet, "sealed");
            if (index === this.pickedUp) this.marks?.ring(feet, "selected");
        });
    }

    /** The cover each blast takes away, built (once the art is here) as the action found it, and `ms` in: standing until the blast, then fading off the scorched ground. */
    private layCovers(playing: Playing, ms: number): void {
        let built = false;
        for (const entry of playing.covers) {
            if (!entry.cover && this.art) {
                entry.cover = buildCover(playing.field, this.art.sheets, entry.cue.squares);
                this.scene.add(entry.cover.group);
                built = true;
            }
            entry.cover?.fade(fadeOutAt(entry.cue, ms));
        }
        if (built) this.relight();
    }

    /** Takes down the cover an action blasts, built for it (`layCovers`). */
    private clearCovers(): void {
        for (const { cover } of this.playing?.covers ?? []) {
            if (!cover) continue;
            this.scene.remove(cover.group);
            cover.dispose();
        }
    }

    // ---- The view ----

    /**
     * What the camera shows: the ground at the middle of the frame and the
     * pixels a world unit takes up, from the part of the frame `BoardZoom` says
     * is in the pane (the whole frame until it says), and the point it looks at
     * at the camera's turn now. Mid-turn the ground eases from the one the turn
     * began on to the one the view shows, so the turn is about it. Null until
     * there is a battlefield and a frame to fit it to.
     */
    private camera(): { ground: Vec3; zoom: number; target: Vec3 } | null {
        const frame = this.layout;
        if (!frame || this.size.width <= 1) return null;
        const shown = cameraFor(this.frameBasis, frame, this.view ?? { x: 0, y: 0, ...frame.size }, this.size.width);
        const from = this.turn?.ground;
        const k = this.turn?.progress ?? 1;
        const ground = from ? lerp3(from, shown.ground, k) : shown.ground;
        return { ground, zoom: shown.zoom, target: lookAtGround(this.basis, ground) };
    }

    /** A point of the canvas, in pixels from its top left, across the frame in world units (`onScreen`). */
    private across({ x, y }: { x: number; y: number }): { x: number; y: number } | null {
        const camera = this.camera();
        if (!camera) return null;
        const at = onScreen(this.basis, camera.target);
        return { x: at.x + (x - this.size.width / 2) / camera.zoom, y: at.y + (this.size.height / 2 - y) / camera.zoom };
    }

    /** The line of sight through a point across the frame: where it passes the camera's plane, and which way it looks. */
    private sightThrough(across: { x: number; y: number }): { origin: Vec3; direction: Vec3 } {
        return { origin: lookAtFor(this.basis, across), direction: this.basis.back.map(n => -n) as Vec3 };
    }

    private measure(): void {
        const width = this.host.clientWidth, height = this.host.clientHeight;
        if (width === 0 || height === 0) return;
        this.size = { width, height };
        this.renderer.setSize(width, height, false);
        this.invalidate();
    }

    private relight(): void {
        this.basis = cameraBasis(this.azimuth);
        setAxes(this.axes, this.basis);
        const light = lightOf(this.basis);
        lightSolids(this.solids, light);
        this.pools.light(light);
        if (this.terrain) lightSolids(this.terrain.solids, light);
        for (const { cover } of this.playing?.covers ?? []) if (cover) lightSolids(cover.solids, light);
    }

    /** Runs the frames a turn, the wave's breathing or an HP change's flashing needs, until there are none. */
    private animate(): void {
        if (this.animating) return;
        const step = (now: number) => {
            this.animating = 0;
            let more = false;
            let moved = false;
            if (this.turn) {
                const t = Math.min(1, (now - this.turn.start) / TURN_MS);
                const k = easeInOut(t);
                this.turn.progress = k;
                this.turnTo(this.turn.from + (this.turn.to - this.turn.from) * k);
                if (t >= 1) this.turn = null; else more = true;
                moved = true;
            }
            if (this.waveDue && this.terrain) {
                more = true;
                if (moved || now - this.waveDrawn >= WAVE_FRAME_MS) {
                    const breath = 0.5 + 0.5 * Math.sin(now / 1600 * 2 * Math.PI);
                    this.terrain.wave.material.opacity = 0.15 + 0.4 * breath;
                    this.waveOutlines.opacity = breath;
                    this.waveDrawn = now;
                    moved = true;
                }
            }
            if (this.bars.pulsing) {
                more = true;
                if (moved || now - this.pulseDrawn >= PULSE_FRAME_MS) {
                    this.bars.pulse(now);
                    this.pulseDrawn = now;
                    moved = true;
                }
            }
            if (moved) this.draw();
            if (more) this.animating = requestAnimationFrame(step);
        };
        this.animating = requestAnimationFrame(step);
    }

    /**
     * Turns the camera to `azimuth`, the scene lit and its figures laid again as
     * it now faces. What the camera looks at is the ground at the middle of the
     * frame (`camera`), so it turns about that rather than swinging off.
     */
    private turnTo(azimuth: number): void {
        this.azimuth = azimuth;
        this.relight();
        this.layFigures();
        // A missile's arc is drawn across the frame, as the camera now faces.
        if (this.playing) this.fx.lay(this.playedMs, this.basis);
        // A path's runs and the centre's name lie along the frame the camera now sees.
        this.previews.lay(this.field, this.basis);
    }

    /** Draws on the next frame, once, however often it's asked. */
    invalidate(): void {
        if (this.drawPending) return;
        this.drawPending = requestAnimationFrame(() => {
            this.drawPending = 0;
            this.draw();
        });
    }

    private draw(): void {
        const view = this.camera();
        if (!view) return;
        const { width, height } = this.size;
        const halfW = width / 2 / view.zoom, halfH = height / 2 / view.zoom;
        Object.assign(this.lens, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
        this.lens.updateProjectionMatrix();
        const look = view.target.map((n, i) => n + this.shake[i]) as Vec3;
        this.lens.position.set(...look.map((n, i) => n + this.basis.back[i] * 150) as Vec3);
        this.lens.up.set(0, 1, 0);
        this.lens.lookAt(...look);
        this.renderer.render(this.scene, this.lens);
        drawn.frames++;
        drawn.calls += this.renderer.info.render.calls;
        drawn.triangles += this.renderer.info.render.triangles;
        // Drawn with its ground at last: what a page waiting on the board waits for.
        if (this.terrain && !this.host.dataset.ready) this.host.dataset.ready = "true";
    }

    // ---- Taps ----
    // The only press the canvas takes for itself. Dragging and pinching are
    // `BoardZoom`'s: the canvas sits in its pane, which the browser scrolls and
    // `BoardZoom` zooms, and `touch-action` hands a drag and a pinch there. A
    // press that becomes either never ends in a `click` — a drag takes the touch
    // (`pointercancel`), and a press that stopped a fling is the browser's — so
    // a tap is a `click` that stayed where it began, with one finger down.

    private handleTaps(): void {
        let down: { x: number; y: number } | null = null;
        const fingers = new Set<number>();
        let spoilt = false;
        const local = (event: PointerEvent | MouseEvent) => {
            const rect = this.canvas.getBoundingClientRect();
            return { x: event.clientX - rect.left, y: event.clientY - rect.top };
        };
        this.canvas.addEventListener("pointerdown", event => {
            // A mouse is one press at a time, however the last one was let go of out of reach.
            if (event.pointerType !== "touch") fingers.clear();
            fingers.add(event.pointerId);
            // A second finger makes the press a pinch, however it ends.
            spoilt = fingers.size > 1;
            if (!spoilt) down = local(event);
        });
        const lift = (event: PointerEvent) => { fingers.delete(event.pointerId); };
        this.canvas.addEventListener("pointerup", lift);
        this.canvas.addEventListener("pointercancel", lift);
        this.canvas.addEventListener("click", event => {
            const at = local(event);
            if (!spoilt && down && Math.hypot(at.x - down.x, at.y - down.y) <= TAP_SLOP) this.tap(at);
        });
    }

    /** A tap: the nearest figure along the view through it, or else the square under it. */
    private tap(point: { x: number; y: number }): void {
        const field = this.field;
        const across = field && this.across(point);
        if (!across) return;
        // A figure is taken as a disc round the middle of its body, across the frame.
        let best: { id: number; depth: number } | null = null;
        for (const one of this.placed) {
            const body = onScreen(this.basis, [one.feet[0], one.feet[1] + (one.standing ? 0.4 : 0.1), one.feet[2]]);
            if (Math.hypot(body.x - across.x, body.y - across.y) > 0.3) continue;
            const depth = one.feet[0] * this.basis.back[0] + one.feet[2] * this.basis.back[2];
            if (!best || depth > best.depth) best = { id: one.id, depth };
        }
        if (best) return this.handlers.onFigure(best.id);
        const ground = this.squareAt(across);
        if (ground !== undefined) this.handlers.onSquare(ground);
    }

    /** The front-most square drawn under a point across the frame: its top, at whatever height it stands. */
    private squareAt(across: { x: number; y: number }): Square | undefined {
        const field = this.field!;
        const { origin, direction } = this.sightThrough(across);
        // Walk down the view from the tallest top to the ground, a quarter at a time.
        for (let quarter = this.top; quarter >= 0; quarter--) {
            const y = quarter * QUARTER;
            const t = (y - origin[1]) / direction[1];
            const col = Math.floor(origin[0] + direction[0] * t), row = Math.floor(origin[2] + direction[2] * t);
            if (col < 0 || row < 0 || col >= field.width || row >= field.height) continue;
            const square = row * field.width + col;
            if (field.tiles[square].elevation >= quarter) return square;
        }
        return undefined;
    }
}

/** The walker whose walk the camera follows, if it follows one: the first to walk. */
function followed(walks: ReadonlyMap<number, WalkCue[]>, tracked: boolean): number | null {
    return tracked ? walks.keys().next().value ?? null : null;
}

/** A leg of a walk's length in the world: a square straight, √2 across a diagonal, and `CLIMB_LEG` of a square more for each quarter climbed, as `legWeight` prices it. */
function worldLeg(field: Battlefield, from: Square, to: Square): number {
    const a = squareCentre(field, from), b = squareCentre(field, to);
    return Math.hypot(b[0] - a[0], b[2] - a[2]) + CLIMB_LEG * Math.abs(field.tiles[to].elevation - field.tiles[from].elevation);
}
