// The page the Realm Arena rendering bench drives (bench/realmarena/run.ts): a
// battle from fixtures/ drawn and played by the harness (harness.tsx) on its
// own, outside Next, Clerk and Mongo. The runner bundles it with esbuild
// against whichever checkout's `src/` it is measuring, so the same harness
// measures the board before and after a change to how it's drawn.
//
// It draws whichever board its entry hands `startBench` — the isometric one
// (entry-svg.tsx) or the 3D one (entry-three.tsx) — with the same props, so the
// runner can measure one beside the other (`--renderers`).
//
// It exposes `window.bench`: `ready` once the board is drawn and its art is
// decoded, and `run(scenario)`, which plays one scenario and resolves with what
// the page itself saw of it (frames, long tasks, React commits); the runner adds
// the browser's own trace.

import React from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.css";
import "@/app/globals.css";
import "@/app/ag-theme.css";
import { ART_SHEETS } from "@/games/RealmArena/art";
import { battlefieldOf } from "@/games/RealmArena/maps";
import { BenchBoard, boardDrawn, boardMounted, boardNodes, mountRenderMs, nextFrame, runScenario, applyFixtureMap, type Board, type Fixture, type GlStats, type ScenarioResult } from "./harness";

export type { ScenarioResult } from "./harness";

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
    /** And the board drawn with its ground: no later than the art for one that draws as it mounts. */
    drawnMs: number;
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

async function load(Board: Board, glStats: GlStats | undefined): Promise<LoadResult> {
    const response = await fetch(`fixtures/${FIXTURE}.json`);
    if (!response.ok) throw new Error(`no fixture "${FIXTURE}"`);
    const fixture = await response.json() as Fixture;
    // A scale fixture's battle was played on a bigger Sacked Fort, which everything here must read too — for as long as the page lasts.
    applyFixtureMap(fixture);
    const mounted = boardMounted();
    // The sheets the board draws from, fetched as it fetches them, and decoded, so every scenario starts with the art in hand.
    const art = Promise.all(Object.values(ART_SHEETS).map(sheet => {
        const image = new Image();
        image.src = sheet.href;
        return image.decode();
    }));
    createRoot(document.getElementById("root")!).render(<main className="ag-app"><BenchBoard fixture={fixture} Board={Board} /></main>);
    await mounted;
    const commitMs = performance.now();
    const firstFrameMs = await nextFrame().then(() => performance.now());
    await art;
    const artMs = performance.now();
    await boardDrawn();
    const drawnMs = performance.now();
    // Two frames more, for whatever the art arriving drew.
    await nextFrame();
    await nextFrame();
    window.bench!.run = scenario => runScenario(fixture, scenario, { maxParts: MAX_PARTS, glStats });
    return {
        fixture: fixture.name,
        commitMs,
        firstFrameMs,
        artMs,
        drawnMs,
        mountActualMs: mountRenderMs(),
        domNodes: boardNodes(),
        figures: fixture.before.fighters.length,
        tiles: battlefieldOf(fixture.after.map, fixture.after.blasted).tiles.length,
    };
}

/** Draws `Board` over the fixture the page was asked for, and hands the runner `window.bench`. */
export function startBench(Board: Board, glStats?: GlStats): void {
    window.bench = { ready: load(Board, glStats), run: () => Promise.reject(new Error("not ready")) };
}
