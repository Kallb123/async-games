// The 3D battlefield, imperatively (docs/realm-arena-3d.md): a three.js scene
// the React board (`RealmArenaBoard3D`) owns one of and feeds — the battlefield,
// the figures on it, what's shaded on the ground, where the view should go, and
// what an action is playing — and that draws itself only when something has
// changed, or a frame at a time while something moves.
//
// It keeps no clock of its own for what an action plays: the board's
// `PlaybackProvider` hands it the playback's time (`frame`), and where
// everything is at that time comes from the same pure functions the isometric
// board draws from (`walkerAt`, `toldAt`, `shakeAt`, the cues' own timings),
// placed in the world rather than on the isometric board.

import {
    Color, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Quaternion, RingGeometry, Scene,
    SphereGeometry, Vector3, WebGLRenderer, type ShaderMaterial,
} from "three";
import type { BurstKind } from "@/games/RealmArena/art";
import type { CharacterId } from "@/games/RealmArena/characters";
import { isStanding, type Fighter, type FogGhost } from "@/games/RealmArena/rules";
import { endOf, hpFraction, shakeAt, toldAt, toldOf, walkerAt, walkLift, type BattleCue, type BurstCue, type FallCue, type FlightCue, type Told, type WalkCue } from "@/games/RealmArena/ui";
import { facingTowards, type Battlefield, type Facing, type Square } from "@/utils/games/battlefield/terrain";
import type { Rect } from "@/utils/ui/mapLabels";
import { characterGeometry } from "./characterModels";
import { azimuthOf, cameraBasis, fitZoom, figureMatrix, lightOf, lookAtFor, onScreen, QUARTER, regionOnScreen, squareCentre, type CameraBasis, type Vec3 } from "./iso3d";
import { lightSolids, solidMaterial } from "./solidMaterial";
import { buildTerrain, type Sheets, type Terrain } from "./terrain3d";

/** How long a glide to a focus takes, and how far through it the focus is told it has landed: `BoardZoom`'s own. */
const GLIDE_MS = 380;
const GLIDE_LEAD = 0.75;
/** How often the wave's breathing is drawn (§30.11): a slow glow needs no more, and every frame of it draws the whole board. */
const WAVE_FRAME_MS = 66;
/** How long a quarter turn of the view takes. */
const TURN_MS = 320;
/** The room a focused region keeps from the edge of the frame, in pixels: `BoardZoom`'s. */
const FOCUS_MARGIN_PX = 28;
/** The zoom steps, as multiples of the fitted board: `BoardZoom`'s for this board (`zoomWidth` 250, `maxWidth` 600). */
const STEPS = [1, 2.5, 6];
/** How far a press may move and still be a tap, in pixels. */
const TAP_SLOP = 8;

/** Board units (the isometric board's) to world units, across the frame and up it: a square's diagonal is 20 board units, a full height 10. */
const BOARD_UNIT = Math.SQRT2 / 20;

/** A board unit up the frame, in the world's height: a full height is 10 of them. */
const BOARD_RISE = QUARTER * 4 / 10;
/** The HP bar: its size and how high its middle is over its figure's feet, in world units, as the isometric board's (`HP_BAR_*`). */
const HP_BAR = { width: 9 * BOARD_UNIT, height: 2 * BOARD_RISE, rise: 13 * BOARD_RISE };
/** How many HP bars the board has room for before it grows. */
const BAR_ROOM = 256;

/** Each burst's colour (§26.1), as its art has it. */
const BURST_COLOURS: Readonly<Record<BurstKind, number>> = { fire: 0xff8a3a, thunder: 0xe8e4ff, smoke: 0xbcb8b0, acid: 0xb6e04a, blast: 0xffc46a };

/** A figure the board can pick: where it stands, roughly, for a tap to find. */
interface Placed { id: number; feet: Vec3; standing: boolean }

/** What's shaded on the ground, a texel a square: the colour, and how strongly (0–1). */
export interface Shading { colour: Color; alpha: number }

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
    onFocused: (key: string) => void;
    onFigure: (id: number) => void;
    onSquare: (square: Square) => void;
}

/** One pool of instanced figures: every figure of one character, drawn alike. */
interface Pool { mesh: InstancedMesh; capacity: number; used: number }

export class Board3D {
    readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private readonly scene = new Scene();
    private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    private terrain: Terrain | null = null;
    private field: Battlefield | null = null;
    private sheets: Sheets | null = null;
    private readonly solids: ShaderMaterial[] = [];

    private readonly pools = new Map<string, Pool>();
    /** Where each figure is drawn: its pool and its place in it. */
    private readonly slots = new Map<number, { pool: Pool; index: number; spec: FigureSpec }>();
    private figures: FigureSpec[] = [];
    private ghosts: { ghost: FogGhost; facing: Facing; tint: Color | null }[] = [];
    private placed: Placed[] = [];

    private readonly bars: { back: InstancedMesh; fill: InstancedMesh };
    private readonly ring: Mesh;
    private readonly missiles: InstancedMesh;
    private selectedId: number | null = null;

    // The view: what it looks at, how close, and turned how far.
    private target: Vec3 = [0, 0, 0];
    private zoom = 1;
    private azimuth = azimuthOf(0);
    private basis: CameraBasis = cameraBasis(azimuthOf(0));
    private shake: Vec3 = [0, 0, 0];
    private size = { width: 1, height: 1 };
    private fitted = false;
    private glide: { from: { target: Vec3; zoom: number }; to: { target: Vec3; zoom: number }; start: number; key: string; told: boolean } | null = null;
    private turn: { from: number; to: number; start: number } | null = null;
    /** The focus last asked for, and the key of the one last glided to. */
    private wanted: { area: Rect; key: string; exact: boolean | undefined } | null = null;
    private applied: string | null = null;
    /** What's shaded on the ground, kept to lay again over ground built afresh. */
    private shading: { shade: (square: Square) => Shading | null; wave: ReadonlySet<Square> | null } | null = null;
    private animating = 0;
    private waveDue = false;
    private waveDrawn = 0;

    private playing: Playing | null = null;
    private drawPending = 0;
    private readonly resize: ResizeObserver;

    /** Who hears of a focus all but landed (as `BoardZoom`'s `onFocused`), and of a tap on a figure or on a square where none stands. */
    private handlers: Handlers = { onFocused: () => {}, onFigure: () => {}, onSquare: () => {} };

    constructor(private readonly host: HTMLElement) {
        this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x000000, 0);
        this.canvas = this.renderer.domElement;
        host.appendChild(this.canvas);

        // Both drawn after everything solid, the fill over the back.
        const plane = new PlaneGeometry(1, 1);
        this.bars = {
            back: new InstancedMesh(plane, new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false }), BAR_ROOM),
            fill: new InstancedMesh(plane, new MeshBasicMaterial({ transparent: true, depthWrite: false }), BAR_ROOM),
        };
        this.bars.back.renderOrder = 2;
        this.bars.fill.renderOrder = 3;
        for (const mesh of [this.bars.back, this.bars.fill]) {
            mesh.count = 0;
            mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            this.scene.add(mesh);
        }
        this.ring = new Mesh(new RingGeometry(0.34, 0.42, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: 0xf6efe2, transparent: true, opacity: 0.9, depthWrite: false }));
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
        this.handleGestures();
    }

    dispose(): void {
        cancelAnimationFrame(this.drawPending);
        cancelAnimationFrame(this.animating);
        this.resize.disconnect();
        this.terrain?.dispose();
        for (const pool of this.pools.values()) (pool.mesh.material as ShaderMaterial).dispose();
        this.renderer.dispose();
        this.canvas.remove();
    }

    listen(handlers: Handlers): void {
        this.handlers = handlers;
    }

    // ---- What it draws ----

    setSheets(sheets: Sheets): void {
        this.sheets = sheets;
        if (this.field) this.setField(this.field);
    }

    /** The battlefield: its ground and terrain built again, as they are only when cover is blasted. */
    setField(field: Battlefield): void {
        const first = !this.field;
        this.field = field;
        if (!this.sheets) return;
        if (this.terrain) {
            this.scene.remove(this.terrain.group);
            this.terrain.dispose();
        }
        this.terrain = buildTerrain(field, this.sheets);
        this.scene.add(this.terrain.group);
        if (first || !this.fitted) this.fit();
        this.relight();
        this.layFigures();
        this.applyShading();
        this.applyFocus();
        this.invalidate();
    }

    /** Everyone on the battlefield, and the stale sightings in the fog (§27), drawn faint. */
    setFigures(figures: FigureSpec[], ghosts: { ghost: FogGhost; facing: Facing; tint: Color | null }[]): void {
        this.figures = figures;
        this.ghosts = ghosts;
        this.layFigures();
        this.invalidate();
    }

    setSelected(id: number | null): void {
        this.selectedId = id;
        this.layRing();
        this.invalidate();
    }

    /** What's shaded on each square of the ground, and the zones the wave will land in (§30.11), if it's due. */
    setShading(shade: (square: Square) => Shading | null, wave: ReadonlySet<Square> | null): void {
        this.shading = { shade, wave };
        this.applyShading();
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

    /** Turns the view a quarter at a time (`IsoRotation`), gliding round unless told to jump. */
    setRotation(rotation: number, glide: boolean): void {
        const to = azimuthOf(rotation);
        if (!glide) {
            this.azimuth = to;
            this.relight();
            this.invalidate();
            return;
        }
        // The short way round.
        let from = this.azimuth;
        while (to - from > Math.PI) from += 2 * Math.PI;
        while (from - to > Math.PI) from -= 2 * Math.PI;
        // What was in the middle of the frame stays there as it turns.
        this.turn = { from, to, start: performance.now() };
        this.animate();
    }

    /**
     * Brings a region of squares into view, as `BoardZoom` brings a focus: the
     * deepest step it fits at, or with `exact` just fitting it — once a key, so
     * the same focus asked for again leaves the view where the player has since
     * put it; and held until there is a battlefield and a frame to fit it to.
     */
    focus(area: Rect, key: string, exact: boolean | undefined): void {
        this.wanted = { area, key, exact };
        this.applyFocus();
    }

    private applyFocus(): void {
        const field = this.field, wanted = this.wanted;
        if (!field || !this.terrain || !wanted || wanted.key === this.applied || this.size.width <= 1) return;
        this.applied = wanted.key;
        const { area, key, exact } = wanted;
        const basis = this.turn ? cameraBasis(this.turn.to) : this.basis;
        const top = Math.max(0, ...field.tiles.map(tile => tile.elevation));
        const region = regionOnScreen(basis, area, top);
        const fits = fitZoom(region, this.size, FOCUS_MARGIN_PX);
        const fit = this.fitZoom();
        const zoom = exact
            ? Math.min(Math.max(fits, fit), fit * STEPS[STEPS.length - 1])
            : fit * ([...STEPS].reverse().find(step => fit * step <= fits) ?? 1);
        const centre = { x: region.x + region.width / 2, y: region.y + region.height / 2 };
        this.glide = { from: { target: this.target, zoom: this.zoom }, to: { target: lookAtFor(basis, centre), zoom }, start: performance.now(), key, told: false };
        this.animate();
    }

    /** What an action plays, or none. Ready to draw at a time with `frame`. */
    play(playback: { cues: readonly BattleCue[]; before: readonly Fighter[] } | null, tracked: boolean): void {
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
        this.layFigures(playing ? ms : null);
        if (playing) {
            this.layFlights(playing, ms);
            this.layBursts(playing, ms);
            // The shake is across the frame in board units, down positive.
            const { x, y } = shakeAt(playing.cues, ms);
            this.shake = this.basis.right.map((n, i) => (n * x - this.basis.up[i] * y) * BOARD_UNIT) as Vec3;
            if (playing.tracked !== null && ms < playing.end) {
                const walker = this.placed.find(one => one.id === playing.tracked);
                if (walker && !this.glide) this.target = lookAtFor(this.basis, onScreen(this.basis, walker.feet));
            }
        } else {
            this.missiles.count = 0;
            this.shake = [0, 0, 0];
        }
        this.draw();
    }

    // ---- Laying things out ----

    /** Every figure in its place — as it stands, or `ms` into what's playing — with its HP bar over it. */
    private layFigures(ms: number | null = null): void {
        const field = this.field;
        if (!field) return;
        for (const pool of this.pools.values()) pool.used = 0;
        this.placed = [];
        const matrix = new Matrix4();
        const bars: { feet: Vec3; fraction: number; tint: Color | null }[] = [];
        const playing = ms === null ? null : this.playing;

        for (const spec of this.figures) {
            const { fighter } = spec;
            let square = fighter.square, facing = spec.facing, lift = 0;
            let feet: Vec3 | null = null;
            let standing = isStanding(fighter);
            let fraction = hpFraction(fighter);
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
                if (told) fraction = hpFraction(toldAt(told, fighter, ms!).drawn);
            }
            feet ??= squareCentre(field, square);
            const at: Vec3 = [feet[0], feet[1] + lift, feet[2]];
            matrix.fromArray(figureMatrix(at, facing, !standing));
            this.place(fighter.character, false, matrix, spec.tint);
            this.placed.push({ id: fighter.id, feet: at, standing });
            if (standing) bars.push({ feet: at, fraction, tint: spec.tint });
        }
        for (const { ghost, facing, tint } of this.ghosts) {
            matrix.fromArray(figureMatrix(squareCentre(field, ghost.square), facing, false));
            this.place(ghost.character, true, matrix, tint);
        }
        for (const pool of this.pools.values()) {
            pool.mesh.count = pool.used;
            pool.mesh.instanceMatrix.needsUpdate = true;
            if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
        }
        this.layBars(bars);
        this.layRing();
    }

    /** One figure into its character's pool, growing the pool if it's full. */
    private place(character: CharacterId, ghost: boolean, matrix: Matrix4, tint: Color | null): void {
        const key = `${character}${ghost ? ":ghost" : ""}`;
        let pool = this.pools.get(key);
        if (!pool || pool.used >= pool.capacity) {
            const capacity = Math.max(8, (pool?.capacity ?? 0) * 2);
            const material = pool ? pool.mesh.material as ShaderMaterial : solidMaterial({ opacity: ghost ? 0.35 : 1 });
            if (!pool) this.solids.push(material);
            const mesh = new InstancedMesh(characterGeometry(character), material, capacity);
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

    /** The HP bars, over each standing figure, turned to face the camera. */
    private layBars(bars: { feet: Vec3; fraction: number; tint: Color | null }[]): void {
        const { back, fill } = this.bars;
        bars = bars.slice(0, BAR_ROOM);
        const facing = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(...this.basis.back), new Vector3(), new Vector3(0, 1, 0)));
        const right = new Vector3(...this.basis.right), toward = new Vector3(...this.basis.back).multiplyScalar(0.01);
        const m = new Matrix4();
        bars.forEach(({ feet, fraction, tint }, index) => {
            const middle = new Vector3(feet[0], feet[1] + HP_BAR.rise, feet[2]);
            back.setMatrixAt(index, m.compose(middle, facing, new Vector3(HP_BAR.width, HP_BAR.height, 1)));
            const width = Math.max(0.0001, HP_BAR.width * fraction);
            const shifted = middle.clone().addScaledVector(right, (width - HP_BAR.width) / 2).add(toward);
            fill.setMatrixAt(index, m.compose(shifted, facing, new Vector3(width, HP_BAR.height, 1)));
            // A plain material takes its colour as linear, and the tint is as written.
            fill.setColorAt(index, (tint ?? new Color(0.85, 0.85, 0.85)).clone().convertSRGBToLinear());
        });
        back.count = fill.count = bars.length;
        back.instanceMatrix.needsUpdate = fill.instanceMatrix.needsUpdate = true;
        if (fill.instanceColor) fill.instanceColor.needsUpdate = true;
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

    /** The zoom the whole battlefield fits the frame's width at: the fitted board. */
    private fitZoom(): number {
        const field = this.field;
        if (!field) return 1;
        const region = regionOnScreen(this.basis, { x: 0, y: 0, width: field.width, height: field.height }, 0);
        return this.size.width / region.width;
    }

    private fit(): void {
        const field = this.field;
        if (!field || this.size.width <= 1) return;
        this.zoom = this.fitZoom();
        const region = regionOnScreen(this.basis, { x: 0, y: 0, width: field.width, height: field.height }, 0);
        this.target = lookAtFor(this.basis, { x: region.x + region.width / 2, y: region.y + region.height / 2 });
        this.fitted = true;
    }

    private measure(): void {
        const width = this.host.clientWidth, height = this.host.clientHeight;
        if (width === 0 || height === 0) return;
        this.size = { width, height };
        this.renderer.setSize(width, height, false);
        if (!this.fitted) this.fit();
        this.applyFocus();
        this.invalidate();
    }

    private relight(): void {
        this.basis = cameraBasis(this.azimuth);
        const light = lightOf(this.basis);
        lightSolids(this.solids, light);
        if (this.terrain) lightSolids(this.terrain.solids, light);
    }

    /** Runs the frames a glide, a turn or the wave's breathing needs, until there are none. */
    private animate(): void {
        if (this.animating) return;
        const step = (now: number) => {
            this.animating = 0;
            let more = false;
            let moved = false;
            if (this.turn) {
                const t = Math.min(1, (now - this.turn.start) / TURN_MS);
                const centre = onScreen(this.basis, this.target);
                const pivot = this.screenToGround(centre);
                this.azimuth = this.turn.from + (this.turn.to - this.turn.from) * ease(t);
                this.relight();
                if (pivot) this.target = lookAtFor(this.basis, onScreen(this.basis, pivot));
                if (t >= 1) this.turn = null; else more = true;
                this.layFigures(null);
                moved = true;
            }
            if (this.glide) {
                const t = Math.min(1, (now - this.glide.start) / GLIDE_MS);
                const k = ease(t);
                const { from, to } = this.glide;
                this.target = from.target.map((n, i) => n + (to.target[i] - n) * k) as Vec3;
                this.zoom = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * k);
                if (!this.glide.told && t >= GLIDE_LEAD) {
                    this.glide.told = true;
                    this.handlers.onFocused(this.glide.key);
                }
                if (t >= 1) this.glide = null; else more = true;
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
            if (moved) this.draw();
            if (more) this.animating = requestAnimationFrame(step);
        };
        this.animating = requestAnimationFrame(step);
    }

    /** The ground under a point across the frame (y = 0), where the view through it meets it. */
    private screenToGround({ x, y }: { x: number; y: number }): Vec3 | null {
        const origin = lookAtFor(this.basis, { x, y });
        const direction = this.basis.back.map(n => -n) as Vec3;
        if (Math.abs(direction[1]) < 1e-6) return null;
        const t = -origin[1] / direction[1];
        return [origin[0] + direction[0] * t, 0, origin[2] + direction[2] * t];
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
        const { width, height } = this.size;
        const halfW = width / 2 / this.zoom, halfH = height / 2 / this.zoom;
        Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
        this.camera.updateProjectionMatrix();
        const look = this.target.map((n, i) => n + this.shake[i]) as Vec3;
        this.camera.position.set(...look.map((n, i) => n + this.basis.back[i] * 150) as Vec3);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(...look);
        this.renderer.render(this.scene, this.camera);
        drawn.frames++;
        drawn.calls += this.renderer.info.render.calls;
        drawn.triangles += this.renderer.info.render.triangles;
        // Drawn with its ground at last: what a page waiting on the board waits for.
        if (this.terrain && !this.host.dataset.ready) this.host.dataset.ready = "true";
    }

    // ---- Taps and gestures ----

    private handleGestures(): void {
        const pointers = new Map<number, { x: number; y: number }>();
        let start: { x: number; y: number } | null = null;
        let moved = false;
        let pinch: number | null = null;
        const local = (event: PointerEvent | WheelEvent) => {
            const rect = this.canvas.getBoundingClientRect();
            return { x: event.clientX - rect.left, y: event.clientY - rect.top };
        };
        this.canvas.addEventListener("pointerdown", event => {
            this.canvas.setPointerCapture(event.pointerId);
            pointers.set(event.pointerId, local(event));
            start = local(event);
            moved = false;
            this.glide = null;
        });
        this.canvas.addEventListener("pointermove", event => {
            const last = pointers.get(event.pointerId);
            if (!last) return;
            const now = local(event);
            pointers.set(event.pointerId, now);
            if (start && Math.hypot(now.x - start.x, now.y - start.y) > TAP_SLOP) moved = true;
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                const spread = Math.hypot(a.x - b.x, a.y - b.y);
                if (pinch) this.zoomAbout({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, spread / pinch);
                pinch = spread;
                return;
            }
            this.pan(now.x - last.x, now.y - last.y);
        });
        const up = (event: PointerEvent) => {
            pointers.delete(event.pointerId);
            if (pointers.size < 2) pinch = null;
            if (!moved && start && pointers.size === 0) this.tap(local(event));
            if (pointers.size === 0) start = null;
        };
        this.canvas.addEventListener("pointerup", up);
        this.canvas.addEventListener("pointercancel", event => { pointers.delete(event.pointerId); start = null; });
        this.canvas.addEventListener("wheel", event => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            this.zoomAbout(local(event), Math.exp(-event.deltaY / 300));
        }, { passive: false });
    }

    private pan(dx: number, dy: number): void {
        const at = onScreen(this.basis, this.target);
        this.target = lookAtFor(this.basis, { x: at.x - dx / this.zoom, y: at.y + dy / this.zoom });
        this.invalidate();
    }

    private zoomAbout(point: { x: number; y: number }, factor: number): void {
        const fit = this.fitZoom();
        const zoom = Math.min(Math.max(this.zoom * factor, fit), fit * STEPS[STEPS.length - 1]);
        const at = onScreen(this.basis, this.target);
        const offset = { x: point.x - this.size.width / 2, y: this.size.height / 2 - point.y };
        const under = { x: at.x + offset.x / this.zoom, y: at.y + offset.y / this.zoom };
        this.zoom = zoom;
        this.target = lookAtFor(this.basis, { x: under.x - offset.x / zoom, y: under.y - offset.y / zoom });
        this.invalidate();
    }

    /** A tap: the nearest figure along the view through it, or else the square under it. */
    private tap(point: { x: number; y: number }): void {
        const field = this.field;
        if (!field) return;
        const at = onScreen(this.basis, this.target);
        const across = { x: at.x + (point.x - this.size.width / 2) / this.zoom, y: at.y + (this.size.height / 2 - point.y) / this.zoom };
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
        const origin = lookAtFor(this.basis, across);
        const direction = this.basis.back.map(n => -n) as Vec3;
        const top = Math.max(0, ...field.tiles.map(tile => tile.elevation));
        // Walk down the view from the tallest top to the ground, a quarter at a time.
        for (let quarter = top; quarter >= 0; quarter--) {
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

/** A leg of a walk's length in the world: a square straight, √2 across a diagonal, and a little more for a change of height. */
function worldLeg(field: Battlefield, from: Square, to: Square): number {
    const a = squareCentre(field, from), b = squareCentre(field, to);
    return Math.hypot(b[0] - a[0], b[2] - a[2]) + Math.abs(b[1] - a[1]) * 0.25;
}

const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
