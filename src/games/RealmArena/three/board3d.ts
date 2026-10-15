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

import {
    Color, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, OrthographicCamera, RingGeometry, Scene,
    SphereGeometry, Vector3, WebGLRenderer, type ShaderMaterial,
} from "three";
import type { BurstKind } from "@/games/RealmArena/art";
import type { CharacterId } from "@/games/RealmArena/characters";
import { isStanding, type Fighter, type FogGhost } from "@/games/RealmArena/rules";
import { CLIMB_LEG, endOf, shakeAt, toldAt, toldOf, walkerAt, walkLift, type BattleCue, type BurstCue, type FallCue, type FlightCue, type Told, type WalkCue } from "@/games/RealmArena/ui";
import { facingTowards, type Battlefield, type Facing, type Square } from "@/utils/games/battlefield/terrain";
import { easeInOut } from "@/utils/ui/boardZoom";
import type { Rect } from "@/utils/ui/mapLabels";
import { billboardAxes, setAxes } from "./billboards";
import { barLevels, HpBars, type BarSpec } from "./bars3d";
import type { PreviewLook } from "./canvasShapes";
import { characterGeometry, type CharacterModels } from "./characterModels";
import { azimuthOf, cameraBasis, cameraFor, figureMatrix, lightOf, lookAtFor, lookAtGround, onScreen, QUARTER, squareCentre, toFrame, type BoardFrame, type BoardLayout, type CameraBasis, type Vec3 } from "./iso3d";
import { NO_PREVIEWS, Previews3D, type PreviewSpec } from "./previews3d";
import type { Shading } from "./shading3d";
import { lightSolids, solidMaterial } from "./solidMaterial";
import { buildTerrain, type Sheets, type Terrain } from "./terrain3d";

/** How often the wave's breathing is drawn (§30.11): a slow glow needs no more, and every frame of it draws the whole board. */
const WAVE_FRAME_MS = 66;
/** How long a quarter turn of the view takes. */
const TURN_MS = 320;
/** How far a press may move and still be a tap, in pixels. */
const TAP_SLOP = 8;

/** Board units (the isometric board's) to world units, across the frame and up it: a square's diagonal is 20 board units, a full height 10. */
const BOARD_UNIT = Math.SQRT2 / 20;

/** A board unit up the frame, in the world's height: a full height is 10 of them. */
const BOARD_RISE = QUARTER * 4 / 10;
/** How often a lined-up HP change's flash is drawn: smooth enough for a flash of 0.8s, and every frame of it draws the whole board. */
const PULSE_FRAME_MS = 33;

/** Each burst's colour (§26.1), as its art has it. */
const BURST_COLOURS: Readonly<Record<BurstKind, number>> = { fire: 0xff8a3a, thunder: 0xe8e4ff, smoke: 0xbcb8b0, acid: 0xb6e04a, blast: 0xffc46a };

/** A figure the board can pick: where it stands, roughly, for a tap to find. */
interface Placed { id: number; feet: Vec3; standing: boolean }

export type { Shading };

/** What the board is told about a figure, as the React board works it out. */
export interface FigureSpec {
    fighter: Fighter;
    facing: Facing;
    /** Its owner's colour, its team parts tinted with; none for one nobody owns. */
    tint: Color | null;
}

/** What an action plays, ready to place a frame at a time. */
interface Playing {
    cues: readonly BattleCue[];
    walks: Map<number, WalkCue[]>;
    falls: Map<number, FallCue>;
    told: Map<number, Told>;
    flights: FlightCue[];
    bursts: { cue: BurstCue; mesh: Mesh }[];
    /** The walker whose walk the camera follows. */
    tracked: number | null;
    end: number;
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

/** One pool of instanced figures: every figure of one character, drawn alike. */
interface Pool { mesh: InstancedMesh; capacity: number; used: number }

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

    private readonly pools = new Map<string, Pool>();
    /** Where each figure is drawn: its pool and its place in it. */
    private readonly slots = new Map<number, { pool: Pool; index: number; spec: FigureSpec }>();
    private figures: FigureSpec[] = [];
    private ghosts: { ghost: FogGhost; facing: Facing; tint: Color | null }[] = [];
    private placed: Placed[] = [];

    /** The HP bars, and the lined-up action's previews and the centre's name: flat to the camera, one draw each. */
    private readonly bars: HpBars;
    private readonly previews: Previews3D;
    /** What the previews are drawn in, and the HP an action lined up would change, for the bars (`setLook`, `setHpChange`). */
    private look: PreviewLook | null = null;
    private hpChange: ReadonlyMap<number, number> | null = null;
    private readonly ring: Mesh;
    private readonly missiles: InstancedMesh;
    private selectedId: number | null = null;

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
    private shading: { shade: (square: Square) => Shading | null; wave: ReadonlySet<Square> | null } | null = null;
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
        this.scene.add(this.bars.billboards.mesh, this.previews.billboards.mesh);
        this.ring = new Mesh(new RingGeometry(0.34, 0.42, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }));
        this.ring.visible = false;
        this.ring.renderOrder = 1;
        this.scene.add(this.ring);
        this.missiles = new InstancedMesh(new SphereGeometry(0.06, 8, 6).scale(2.2, 0.7, 0.7), new MeshBasicMaterial({ color: 0xffe3a3 }), 16);
        this.missiles.count = 0;
        this.missiles.instanceMatrix.setUsage(DynamicDrawUsage);
        this.scene.add(this.missiles);

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
        this.bars.dispose();
        this.previews.dispose();
        for (const pool of this.pools.values()) (pool.mesh.material as ShaderMaterial).dispose();
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
        if (this.field) this.setField(this.field, this.top);
    }

    /** The battlefield, and its tallest top in quarters: its ground and terrain built again, as they are only when cover is blasted. */
    setField(field: Battlefield, top: number): void {
        this.field = field;
        this.top = top;
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
        this.invalidate();
    }

    /** Everyone on the battlefield, and the stale sightings in the fog (§27), drawn faint. */
    setFigures(figures: FigureSpec[], ghosts: { ghost: FogGhost; facing: Facing; tint: Color | null }[]): void {
        this.figures = figures;
        this.ghosts = ghosts;
        this.layFigures();
        // A figure arriving with a change to flash on its bar starts the flashing.
        this.animate();
        this.invalidate();
    }

    /** Who is selected, ringed in `colour` — the isometric board's ring's (`--ag-on-dark`). */
    setSelected(id: number | null, colour: Color): void {
        this.selectedId = id;
        (this.ring.material as MeshBasicMaterial).color.copy(colour).convertSRGBToLinear();
        this.layRing();
        this.invalidate();
    }

    /** What's shaded on each square of the ground, and the zones the wave will land in (§30.11), if it's due. */
    setShading(shade: (square: Square) => Shading | null, wave: ReadonlySet<Square> | null): void {
        this.shading = { shade, wave };
        this.applyShading();
    }

    /**
     * What the previews are drawn in: the colours and typeface the isometric
     * board's CSS gives them. The text in them waits for the typeface to load,
     * and is laid out when it has.
     */
    setLook(look: PreviewLook): void {
        this.look = look;
        this.previews.setLook(look, () => this.layPreviews());
        this.layFigures(this.playing ? this.playedMs : null);
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
        this.layFigures(this.playing ? this.playedMs : null);
        this.animate();
        this.invalidate();
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
        const warm = new Color(0.86, 0.36, 0.3);
        paint(terrain.wave.data, square => wave?.has(square) ? { colour: warm, alpha: 0.55 } : null);
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

    /** What an action plays, or none. Ready to draw at a time with `frame`. */
    play(playback: { cues: readonly BattleCue[]; before: readonly Fighter[] } | null, tracked: boolean): void {
        this.stopFollowing();
        for (const burst of this.playing?.bursts ?? []) {
            this.scene.remove(burst.mesh);
            burst.mesh.geometry.dispose();
            (burst.mesh.material as MeshBasicMaterial).dispose();
        }
        this.playing = null;
        if (playback) {
            const walks = new Map<number, WalkCue[]>();
            const falls = new Map<number, FallCue>();
            const flights: FlightCue[] = [];
            const bursts: Playing["bursts"] = [];
            for (const cue of playback.cues) {
                if (cue.kind === "walk") walks.set(cue.fighter.id, [...walks.get(cue.fighter.id) ?? [], cue]);
                if (cue.kind === "fall") falls.set(cue.fighter.id, cue);
                if (cue.kind === "flight") flights.push(cue);
                if (cue.kind === "burst") {
                    const mesh = new Mesh(new SphereGeometry(0.5, 16, 10), new MeshBasicMaterial({ color: BURST_COLOURS[cue.burst], transparent: true, depthWrite: false }));
                    mesh.visible = false;
                    this.scene.add(mesh);
                    bursts.push({ cue, mesh });
                }
            }
            const before = new Map(playback.before.map(fighter => [fighter.id, fighter]));
            const told = new Map<number, Told>();
            for (const { fighter } of this.figures) {
                const one = toldOf(playback.cues, before.get(fighter.id), fighter, false);
                if (one) told.set(fighter.id, one);
            }
            this.playing = { cues: playback.cues, walks, falls, told, flights, bursts, tracked: tracked ? walks.keys().next().value ?? null : null, end: endOf(playback.cues) };
        }
        this.frame(0);
    }

    /** Draws what's playing as it is `ms` in. */
    frame(ms: number): void {
        const playing = this.playing, field = this.field;
        if (!field) return;
        this.playedMs = ms;
        // A follow moves the view as this lays the frame out, and it is drawn once, at the end.
        this.framing = true;
        try {
            this.layFigures(playing ? ms : null);
            if (playing) {
                this.layFlights(playing, ms);
                this.layBursts(playing, ms);
                // The shake is across the frame in board units, down positive.
                const { x, y } = shakeAt(playing.cues, ms);
                this.shake = this.basis.right.map((n, i) => (n * x - this.basis.up[i] * y) * BOARD_UNIT) as Vec3;
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
                this.missiles.count = 0;
                this.shake = [0, 0, 0];
            }
        } finally {
            this.framing = false;
        }
        this.draw();
    }

    // ---- Laying things out ----

    /** Every figure in its place — as it stands, or `ms` into what's playing — with its HP bar over it. */
    private layFigures(ms: number | null = null): void {
        const field = this.field;
        if (!field || !this.art) return;
        const { models } = this.art;
        for (const pool of this.pools.values()) pool.used = 0;
        this.placed = [];
        const matrix = new Matrix4();
        const bars: BarSpec[] = [];
        const playing = ms === null ? null : this.playing;

        for (const spec of this.figures) {
            const { fighter } = spec;
            let square = fighter.square, facing = spec.facing, lift = 0;
            let feet: Vec3 | null = null;
            let standing = isStanding(fighter);
            // The figure as its bar shows it, and the level its chip drains down to.
            let drawn = fighter, chip: number | undefined;
            if (playing) {
                const walks = playing.walks.get(fighter.id);
                const fall = playing.falls.get(fighter.id);
                const leg = walks ? walkerAt(walks, ms!, (from, to) => worldLeg(field, from, to)) : null;
                if (leg) {
                    const a = squareCentre(field, leg.from), b = squareCentre(field, leg.to);
                    feet = a.map((n, i) => n + (b[i] - n) * leg.across) as Vec3;
                    lift = -walkLift(leg, one => field.tiles[one].elevation) * BOARD_RISE;
                    if (leg.from !== leg.to) facing = facingTowards(field, leg.from, leg.to);
                    standing = true;
                } else if (walks && ms! < walks[0].start) {
                    square = walks[0].path[0];
                    standing = true;
                }
                if (fall && ms! < fall.start) {
                    standing = true;
                    if (!leg) square = fall.fighter.square;
                }
                const told = playing.told.get(fighter.id);
                if (told) ({ drawn, chip } = toldAt(told, fighter, ms!));
            }
            feet ??= squareCentre(field, square);
            const at: Vec3 = [feet[0], feet[1] + lift, feet[2]];
            matrix.fromArray(figureMatrix(at, facing, !standing));
            this.place(models, fighter.character, false, matrix, spec.tint);
            this.placed.push({ id: fighter.id, feet: at, standing });
            if (standing) bars.push({ feet: at, ...barLevels(drawn, fighter, chip, this.hpChange?.get(fighter.id)), tint: spec.tint });
        }
        for (const { ghost, facing, tint } of this.ghosts) {
            matrix.fromArray(figureMatrix(squareCentre(field, ghost.square), facing, false));
            this.place(models, ghost.character, true, matrix, tint);
        }
        for (const pool of this.pools.values()) {
            pool.mesh.count = pool.used;
            pool.mesh.instanceMatrix.needsUpdate = true;
            if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
        }
        this.bars.lay(bars, this.look);
        this.layRing();
    }

    /** One figure into its character's pool, growing the pool if it's full. */
    private place(models: CharacterModels, character: CharacterId, ghost: boolean, matrix: Matrix4, tint: Color | null): void {
        const key = `${character}${ghost ? ":ghost" : ""}`;
        let pool = this.pools.get(key);
        if (!pool || pool.used >= pool.capacity) {
            const capacity = Math.max(8, (pool?.capacity ?? 0) * 2);
            const material = pool ? pool.mesh.material as ShaderMaterial : solidMaterial({ opacity: ghost ? 0.35 : 1 });
            if (!pool) this.solids.push(material);
            const mesh = new InstancedMesh(characterGeometry(models, character), material, capacity);
            mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.setColorAt(0, new Color(1, 1, 1));
            if (pool) {
                // Grown: what's placed so far carried over.
                mesh.instanceMatrix.array.set(pool.mesh.instanceMatrix.array.subarray(0, pool.used * 16));
                mesh.instanceColor!.array.set(pool.mesh.instanceColor!.array.subarray(0, pool.used * 3));
                this.scene.remove(pool.mesh);
                pool.mesh.dispose();
            }
            pool = { mesh, capacity, used: pool?.used ?? 0 };
            this.pools.set(key, pool);
            this.scene.add(mesh);
            this.relight();
        }
        pool.mesh.setMatrixAt(pool.used, matrix);
        pool.mesh.setColorAt(pool.used, tint ?? new Color(1, 1, 1));
        pool.used++;
    }

    private layRing(): void {
        const at = this.placed.find(one => one.id === this.selectedId);
        this.ring.visible = !!at;
        if (at) this.ring.position.set(at.feet[0], at.feet[1] + 0.01, at.feet[2]);
    }

    /** The shots and throws in flight: an arc from the shooter's body to the target's, or its ground for a throw. */
    private layFlights(playing: Playing, ms: number): void {
        const field = this.field!;
        const m = new Matrix4();
        let count = 0;
        for (const cue of playing.flights) {
            const into = ms - cue.start;
            if (into < 0 || into > cue.length || count >= 16) continue;
            const from = squareCentre(field, cue.from), to = squareCentre(field, cue.to);
            from[1] += 0.45;
            if (cue.result !== "landed") to[1] += cue.result === "miss" ? 0.9 : 0.45;
            const u = Math.min(1, into / Math.max(1, cue.land));
            const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
            const rise = cue.missile === "bolt" ? 0 : Math.min(distance * (cue.missile === "arrow" ? 0.12 : 0.35), 2.5);
            const point = new Vector3(...from.map((n, i) => n + (to[i] - n) * u) as Vec3);
            point.y += rise * 4 * u * (1 - u);
            const ahead = new Vector3(to[0] - from[0], (to[1] - from[1]) + rise * 4 * (1 - 2 * u), to[2] - from[2]).normalize();
            m.lookAt(new Vector3(), ahead, new Vector3(0, 1, 0)).multiply(new Matrix4().makeRotationY(Math.PI / 2)).setPosition(point);
            this.missiles.setMatrixAt(count++, m);
        }
        this.missiles.count = count;
        this.missiles.instanceMatrix.needsUpdate = true;
    }

    /** The bursts: a ball swelling from where it landed and fading. */
    private layBursts(playing: Playing, ms: number): void {
        const field = this.field!;
        for (const { cue, mesh } of playing.bursts) {
            const progress = (ms - cue.start) / Math.max(1, cue.length);
            mesh.visible = progress >= 0 && progress <= 1;
            if (!mesh.visible) continue;
            const at = squareCentre(field, cue.at);
            mesh.position.set(at[0], at[1] + 0.2, at[2]);
            mesh.scale.setScalar((0.4 + progress) * (cue.radius + 0.6));
            (mesh.material as MeshBasicMaterial).opacity = 0.75 * (1 - progress);
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
        const ground = from ? from.map((n, i) => n + (shown.ground[i] - n) * k) as Vec3 : shown.ground;
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
        if (this.terrain) lightSolids(this.terrain.solids, light);
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
                    this.terrain.wave.material.opacity = 0.15 + 0.4 * (0.5 + 0.5 * Math.sin(now / 1600 * 2 * Math.PI));
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
        this.layFigures(this.playing ? this.playedMs : null);
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

/** A leg of a walk's length in the world: a square straight, √2 across a diagonal, and `CLIMB_LEG` of a square more for each quarter climbed, as `legWeight` prices it. */
function worldLeg(field: Battlefield, from: Square, to: Square): number {
    const a = squareCentre(field, from), b = squareCentre(field, to);
    return Math.hypot(b[0] - a[0], b[2] - a[2]) + CLIMB_LEG * Math.abs(field.tiles[to].elevation - field.tiles[from].elevation);
}
