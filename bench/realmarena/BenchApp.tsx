// The page the Realm Arena rendering bench drives (bench/realmarena/run.ts):
// `RealmArenaBoard` on its own, outside Next, Clerk and Mongo, drawing a frozen
// Hold Out battle (fixtures/, written by fixture.ts) the way the board screen
// draws it, and playing scripted scenarios over it. The runner bundles it
// with esbuild against whichever checkout's `src/` it is measuring, so the same
// harness measures the board before and after a change to how it's drawn.
//
// Wired as `src/app/games/realmarena/[gameid]/page.tsx` wires the board for a
// co-op battle: the owners, the colours, the fog sweep, and the viewer's own
// End turn played back one part per warband action (`play`), each part its own
// playback and focus, resting `STEP_BEAT_MS` between. Keep it in step with the
// page where the page changes what it hands the board — a harness that draws
// less than the page measures less than the player gets.
//
// It exposes `window.bench`: `ready` once the board is drawn and its art is
// decoded, and `run(scenario)`, which plays one scenario and resolves with what
// the page itself saw of it (frames, long tasks, React commits); the runner adds
// the browser's own trace.

import React, { Profiler, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.css";
import "@/app/globals.css";
import "@/app/ag-theme.css";
import RealmArenaBoard, { type Playback } from "@/games/RealmArena/components/RealmArenaBoard";
import type { IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome, RealmArenaPartState } from "@/games/RealmArena/apiModels";
import { ART_SHEETS } from "@/games/RealmArena/art";
import { battlefieldOf } from "@/games/RealmArena/maps";
import { battleFrom, isStanding, warbandsFor, type Fighter } from "@/games/RealmArena/rules";
import { registerScaledSackedFort } from "./scaledMap";
import { coopColourOf, endOf, friendlySquares, partFollow, reviewParts, STEP_BEAT_MS, unseenSquares } from "@/games/RealmArena/ui";

/** What fixture.ts writes. */
interface Fixture {
    name: string;
    /** How it was made: `across` for one played on a scaled Sacked Fort (scaledMap.ts). */
    recipe?: { across?: number };
    viewer: string;
    seats: string[];
    before: IRealmArenaSpecificGameStateResponse;
    after: IRealmArenaSpecificGameStateResponse;
    step: IRealmArenaStepOutcome;
}

/** The part of a state the board draws, which each part of an End turn replaces (`withPartState` on the page). */
type Shown = Pick<RealmArenaPartState, "fighters" | "ghosts" | "clouds" | "blasted">;

/** What the scenarios set on the board. */
interface View {
    shown: Shown;
    playback: Playback | null;
    follow: React.ComponentProps<typeof RealmArenaBoard>["follow"];
    selectedId: number | null;
    /** Whose turn it is: their characters show their AP. */
    acting: string | null;
    waveDue: boolean;
}

/** One React commit of the board, as the profiling build reports it. */
interface Commit { phase: string; actualMs: number; at: number }

/** One part of the enemy turn: how long it was meant to play, and how long it took from being handed to the board to the board saying it had played. */
interface PartTiming { part: number; cueMs: number; wallMs: number; timedOut: boolean }

/** What `run` resolves with. */
export interface ScenarioResult {
    scenario: string;
    wallMs: number;
    /** The gaps between animation frames over the scenario, in ms: none for a scenario timed by the trace alone (`UNTIMED`). */
    frameGaps: number[];
    longTasks: { start: number; duration: number }[];
    commits: Commit[];
    parts: PartTiming[];
    /** Elements under the board's frame at the end. */
    domNodes: number;
}

declare global {
    interface Window {
        bench?: { ready: Promise<LoadResult>; run: (scenario: string) => Promise<ScenarioResult> };
    }
}

/** What the page saw of its own load. */
export interface LoadResult {
    fixture: string;
    /** From the page's first script to the board's first commit, its first frame after, and every art sheet decoded. */
    commitMs: number;
    firstFrameMs: number;
    artMs: number;
    /** The mount's commit, as React measured it. */
    mountActualMs: number;
    domNodes: number;
    figures: number;
    tiles: number;
}

const params = new URLSearchParams(location.search);
const FIXTURE = params.get("fixture") ?? "holdout";
/** How many of the enemy turn's parts to play; all of them unless the runner says. */
const MAX_PARTS = Number(params.get("parts") ?? Infinity);
/** How long the scenarios that step through something wait on each step. */
const STEP_MS = 1500;
/** How long the board is left alone in `idle`. */
const IDLE_MS = 5000;
/** Past a part's own length, how long it may take to say it has played before it's given up on: the page's `OWN_STUCK_MS`. */
const STUCK_MS = 4000;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const boardNodes = () => document.querySelector(".ag-realmarena-frame")?.getElementsByTagName("*").length ?? 0;

/** The page's handles on the app, set once it has mounted. */
const control: {
    set?: React.Dispatch<React.SetStateAction<View>>;
    commits: Commit[];
    played: Map<string, () => void>;
    committed?: () => void;
} = { commits: [], played: new Map() };

function App({ fixture }: { fixture: Fixture }) {
    const { viewer, seats } = fixture;
    const [view, setView] = useState<View>(() => ({
        shown: fixture.before, playback: null, follow: null, selectedId: null, acting: viewer, waveDue: false,
    }));
    useEffect(() => {
        control.set = setView;
        control.committed?.();
    }, []);

    // As the board screen derives them for a co-op battle.
    const { fighters, ghosts, clouds, blasted } = view.shown;
    const blastedKey = blasted.join(",");
    const field = useMemo(() => battlefieldOf(fixture.after.map, blastedKey ? blastedKey.split(",").map(Number) : []), [fixture.after.map, blastedKey]);
    const fog = fixture.after.fog;
    const battle = battleFrom(field, { fighters, fog, clouds, seats, coop: true });
    const unseen = useMemo(
        () => fog ? unseenSquares(battleFrom(field, { fighters, fog: true, seats, coop: true }), viewer) : null,
        [fog, field, fighters, seats, viewer],
    );
    const selected = fighters.find(fighter => fighter.id === view.selectedId);
    const colourFor = (owner: string) => coopColourOf(viewer, owner);

    return (
        <main className="ag-app">
            <div className="ag-game ag-game--realmarena">
                <div className="ag-board-area">
                    <Profiler id="board" onRender={(_id, phase, actualMs) => control.commits.push({ phase, actualMs, at: performance.now() })}>
                        <RealmArenaBoard
                            field={field}
                            fighters={fighters}
                            fogGhosts={ghosts}
                            unseen={unseen}
                            clouds={clouds}
                            sides={battle.sides}
                            owners={[...seats, ...warbandsFor(seats)]}
                            waveDue={view.waveDue}
                            showCentre={false}
                            viewerId={viewer}
                            colourFor={colourFor}
                            nameFor={owner => owner}
                            selected={selected}
                            onSelect={id => setView(current => ({ ...current, selectedId: current.selectedId === id ? null : id }))}
                            acting={view.acting}
                            follow={view.follow}
                            home={{ squares: friendlySquares(fighters, viewer, true), key: "home" }}
                            playback={view.playback}
                            onPlayed={key => control.played.get(key)?.()}
                        />
                    </Profiler>
                </div>
            </div>
        </main>
    );
}

function setView(change: Partial<View>) {
    control.set?.(current => ({ ...current, ...change }));
}

/** The viewer's own End turn coming back, played as the page plays it: a part at a time, each with its own focus, a beat between. */
async function enemyTurn(fixture: Fixture): Promise<PartTiming[]> {
    const { viewer, before, after, step } = fixture;
    const parts = reviewParts(after.map, step, { fighters: before.fighters, blasted: before.blasted }, after.fighters)
        .filter(part => part.cues.length > 0)
        .slice(0, MAX_PARTS);
    const timings: PartTiming[] = [];
    // The turn has passed on, as it has once the End turn comes back.
    setView({ acting: fixture.seats[1] });
    for (const [index, part] of parts.entries()) {
        const key = `bench:${index}`;
        const left = part.state?.fighters ?? after.fighters;
        const cueMs = endOf(part.cues);
        const played = new Promise<boolean>(resolve => {
            control.played.set(key, () => resolve(false));
            setTimeout(() => resolve(true), cueMs + STUCK_MS);
        });
        const start = performance.now();
        setView({
            shown: part.state ?? after,
            playback: { key, cues: part.cues, events: part.events, field: part.field, before: part.before.fighters },
            follow: partFollow(part, left, friendlySquares(left, viewer, true), false, key),
        });
        const timedOut = await played;
        control.played.delete(key);
        timings.push({ part: index, cueMs, wallMs: performance.now() - start, timedOut });
        await sleep(STEP_BEAT_MS);
    }
    setView({ playback: null, follow: null });
    return timings;
}

/** The view sent round the battlefield: each corner and the middle, alternately just fitted and at the deepest step, so every glide zooms. */
async function pan(fixture: Fixture) {
    const field = battlefieldOf(fixture.after.map, fixture.after.blasted);
    const { width, height } = field;
    const at = (col: number, row: number) => row * width + col;
    const regions = [
        [at(4, 4), at(10, 10)],
        [at(width - 5, 4)],
        [at(width - 12, height - 12), at(width - 5, height - 5)],
        [at(4, height - 5)],
        [at(Math.floor(width / 2) - 6, Math.floor(height / 2) - 6), at(Math.floor(width / 2) + 6, Math.floor(height / 2) + 6)],
        [at(Math.floor(width / 2), Math.floor(height / 2))],
    ];
    for (const [index, squares] of regions.entries()) {
        setView({ follow: { squares, key: `pan:${index}`, exact: index % 2 === 0 } });
        await sleep(STEP_MS);
    }
    setView({ follow: null });
}

/** The view turned a quarter at a time, all the way round, by its own buttons. */
async function turn() {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Turn the view clockwise"]');
    if (!button) throw new Error("no button to turn the view by");
    for (let quarter = 0; quarter < 4; quarter++) {
        button.click();
        await sleep(STEP_MS);
    }
}

/** Each of the viewer's own characters selected in turn, as a tap selects it: its reach shaded and the view brought to it. */
async function select(fixture: Fixture) {
    const own = fixture.before.fighters.filter((fighter: Fighter) => fighter.owner === fixture.viewer && isStanding(fighter)).slice(0, 4);
    for (const fighter of own) {
        setView({ selectedId: fighter.id });
        await sleep(STEP_MS);
    }
    setView({ selectedId: null });
    await sleep(STEP_MS);
}

/** Nothing played and nothing due: whatever the board costs while nobody touches it. */
async function idle() {
    await sleep(IDLE_MS);
}

/** The same with the next wave due (§30.11), its warbands' zones lit and breathing. */
async function wave() {
    setView({ waveDue: true });
    await sleep(IDLE_MS);
    setView({ waveDue: false });
}

const SCENARIOS: Record<string, (fixture: Fixture) => Promise<PartTiming[] | void>> = {
    "enemy-turn": enemyTurn,
    pan,
    turn,
    select,
    idle,
    wave,
};

/**
 * The scenarios timed by the browser's trace alone: a frame counter of the
 * page's own would ask for a frame every vsync, and so measure itself.
 */
const UNTIMED = new Set(["idle", "wave"]);

async function run(fixture: Fixture, scenario: string): Promise<ScenarioResult> {
    const play = SCENARIOS[scenario];
    if (!play) throw new Error(`no scenario "${scenario}": ${Object.keys(SCENARIOS).join(", ")}`);
    const frameGaps: number[] = [];
    const longTasks: ScenarioResult["longTasks"] = [];
    const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: "longtask" });
    let recording = !UNTIMED.has(scenario);
    let last = await nextFrame();
    const frame = (time: number) => {
        frameGaps.push(time - last);
        last = time;
        if (recording) requestAnimationFrame(frame);
    };
    if (recording) requestAnimationFrame(frame);
    control.commits = [];
    const start = performance.now();
    const parts = (await play(fixture)) ?? [];
    // Let the last of it land: a final glide, a commit after the last timer.
    await sleep(500);
    const wallMs = performance.now() - start;
    recording = false;
    observer.disconnect();
    return { scenario, wallMs, frameGaps, longTasks, commits: control.commits, parts, domNodes: boardNodes() };
}

async function load(): Promise<LoadResult> {
    const response = await fetch(`fixtures/${FIXTURE}.json`);
    if (!response.ok) throw new Error(`no fixture "${FIXTURE}"`);
    const fixture = await response.json() as Fixture;
    // A scale fixture's battle was played on a bigger Sacked Fort, which everything here must read too.
    if (fixture.recipe?.across) registerScaledSackedFort(fixture.recipe.across);
    const committed = new Promise<void>(resolve => { control.committed = resolve; });
    // The sheets the board draws from, fetched as it fetches them, and decoded, so every scenario starts with the art in hand.
    const art = Promise.all(Object.values(ART_SHEETS).map(sheet => {
        const image = new Image();
        image.src = sheet.href;
        return image.decode();
    }));
    createRoot(document.getElementById("root")!).render(<App fixture={fixture} />);
    await committed;
    const commitMs = performance.now();
    const firstFrameMs = await nextFrame().then(() => performance.now());
    await art;
    const artMs = performance.now();
    // Two frames more, for whatever the art arriving drew.
    await nextFrame();
    await nextFrame();
    window.bench!.run = scenario => run(fixture, scenario);
    return {
        fixture: fixture.name,
        commitMs,
        firstFrameMs,
        artMs,
        mountActualMs: control.commits.find(commit => commit.phase === "mount")?.actualMs ?? Number.NaN,
        domNodes: boardNodes(),
        figures: fixture.before.fighters.length,
        tiles: battlefieldOf(fixture.after.map, fixture.after.blasted).tiles.length,
    };
}

window.bench = { ready: load(), run: () => Promise.reject(new Error("not ready")) };
