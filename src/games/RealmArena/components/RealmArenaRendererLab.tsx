'use client'
import React, { useEffect, useRef, useState } from 'react';
import CopyAction from '@/components/ui/CopyAction';
import DisclosureSection from '@/components/ui/DisclosureSection';
import OptionChoiceSection from '@/components/ui/OptionChoiceSection';
import Section from '@/components/ui/Section';
import type { Board, Fixture, GlStats } from '../../../../bench/realmarena/harness';
import { formatMetric, scenarioSummary } from '../../../../bench/realmarena/summary';

/** The ways of drawing the battlefield the lab puts side by side. */
type Renderer = 'svg' | 'three' | 'outlined';

const RENDERERS = [
    { id: 'svg', short: 'SVG', label: 'Isometric (SVG)', description: 'The board players see today.' },
    { id: 'three', short: '3D', label: '3D (three.js)', description: 'The experiment: real geometry, the characters as their models (docs/realm-arena-3d.md).' },
    { id: 'outlined', short: '3D + outline', label: '3D, outlined', description: 'The 3D board with a dark outline round every figure, which the live board leaves off until this has shown what it costs (§3).' },
] as const;

/** What the Board choice offers: every board, one after the other, or any on its own. */
const BOARDS = [
    { id: 'all', label: 'All three, to compare', description: 'Each scenario plays on the isometric board, then the 3D one, then the 3D one outlined, and their numbers sit side by side.' },
    ...RENDERERS,
] as const;
type BoardChoice = typeof BOARDS[number]['id'];

/** A 3D board's code, `pick`ed from the 3D board's module, with its count of what it has drawn. */
const threeCode = (pick: (module: typeof import('./RealmArenaBoard3D')) => Board) => Promise.all([import('./RealmArenaBoard3D'), import('../three/board3d')])
    .then(([board, scene]) => ({ Board: pick(board), glStats: scene.renderStats }));

/** Each board's code, fetched the first time it's drawn: with a WebGL board, its count of what it has drawn. */
const BOARD_CODE: Record<Renderer, () => Promise<{ Board: Board; glStats?: GlStats }>> = {
    svg: () => import('./RealmArenaBoard').then(module => ({ Board: module.default })),
    three: () => threeCode(module => module.default),
    outlined: () => threeCode(module => module.RealmArenaBoard3DOutlined),
};

/** The rendering bench's battles (bench/realmarena/fixtures), each loaded only when picked. */
const BATTLES = [
    { id: 'holdout', label: 'Hold Out', description: '42 figures, 27 of them warband, on the Sacked Fort: 2,916 tiles.', load: () => import('../../../../bench/realmarena/fixtures/holdout.json').then(module => module.default) },
    { id: 'holdout-fog', label: 'Hold Out in fog', description: 'The same battle in fog of war: 31 figures in sight.', load: () => import('../../../../bench/realmarena/fixtures/holdout-fog.json').then(module => module.default) },
    { id: 'holdout-8k', label: 'Hold Out, 8k tiles', description: 'The same battle on a Sacked Fort grown to 8,464 tiles.', load: () => import('../../../../bench/realmarena/fixtures/holdout-8k.json').then(module => module.default) },
    { id: 'holdout-16k', label: 'Hold Out, 16k tiles', description: 'The same battle on a Sacked Fort grown to 16,384 tiles: a bigger game\'s scale.', load: () => import('../../../../bench/realmarena/fixtures/holdout-16k.json').then(module => module.default) },
] as const;
type Battle = typeof BATTLES[number]['id'];

/** What a button plays, in the bench's names (harness.tsx). */
const SCENARIOS = [
    { id: 'enemy-turn', label: 'Enemy turn' },
    { id: 'turn', label: 'Turn the view' },
    { id: 'pan', label: 'Pan round' },
    { id: 'select', label: 'Select' },
    { id: 'wave', label: 'Wave due' },
    { id: 'idle', label: 'Idle' },
] as const;

/** The numbers the list of every run shows, of all `scenarioSummary` gives: a comparison shows them all. */
const SHOWN = ['fps', 'frame gap p95 (ms)', 'frames over 50ms', 'long tasks', 'longest task (ms)', 'part overrun mean (ms)', 'triangles per frame'] as const;
const RUN_HEAD = ['Board', 'Battle', 'Scenario', ...SHOWN];
const COMPARED_HEAD = ['', ...RENDERERS.map(renderer => renderer.short)];
/** What the app's build can't measure: React reports its commits only to a profiling build, which the runner uses and the app doesn't. */
const UNMEASURED = new Set(['react commits', 'react render (ms)']);

/** The battle the lab has loaded, with the harness that draws and plays it. */
interface Stage {
    battle: Battle;
    harness: typeof import('../../../../bench/realmarena/harness');
    fixture: Fixture;
}

/** The board on screen. `mount` counts, so every run draws its board afresh. */
interface OnScreen {
    renderer: Renderer;
    Board: Board;
    glStats?: GlStats;
    mount: number;
}

interface Run {
    renderer: Renderer;
    battle: Battle;
    scenario: string;
    summary: Record<string, number>;
}

/** A table row, the cells at `best` (if any) marked as the better of a comparison. */
interface Row { cells: string[]; best?: readonly number[] }

/** This device, as far as a page can tell: what the numbers were taken on. */
function deviceLine(): string {
    let gpu = 'no WebGL';
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        // Hand the context straight back: a page allows only so many at once.
        gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    return `${window.innerWidth}×${window.innerHeight} at ${window.devicePixelRatio}×, GPU ${gpu}, ${navigator.userAgent}`;
}

const labelOf = (choices: readonly { id: string; label: string }[], id: string) => choices.find(choice => choice.id === id)?.label ?? id;
const shortOf = (renderer: Renderer) => RENDERERS.find(one => one.id === renderer)!.short;

/** One run's row under `RUN_HEAD`. */
const runRow = (run: Run): Row => ({
    cells: [shortOf(run.renderer), labelOf(BATTLES, run.battle), labelOf(SCENARIOS, run.scenario), ...SHOWN.map(name => formatMetric(run.summary[name]))],
});

/**
 * Which of `values` (a board's number each, none for a board that didn't report
 * it) are the better, if any are: the higher fps, the lower anything else, and
 * every board within 5% of the best of them, since that close is noise. None
 * where they are all that close, or fewer than two reported.
 */
function bestOf(name: string, values: readonly (number | undefined)[]): number[] {
    const reported = values.flatMap((value, index) => value === undefined ? [] : [{ value, index }]);
    if (reported.length < 2) return [];
    const top = (name === 'fps' ? Math.max : Math.min)(...reported.map(one => one.value));
    const level = reported.filter(({ value }) => Math.abs(value - top) <= 0.05 * Math.max(Math.abs(value), Math.abs(top)));
    return level.length === reported.length ? [] : level.map(({ index }) => index + 1);
}

/**
 * Each scenario played in each battle, its latest run on each board side by
 * side under `COMPARED_HEAD`: every number any board reported, the better
 * one marked — the higher fps, the lower anything else — where they differ by
 * more than 5%.
 */
function comparisons(runs: readonly Run[]): { title: string; rows: Row[] }[] {
    const groups = new Map<string, { title: string; latest: Partial<Record<Renderer, Run>> }>();
    for (const run of runs) {
        const key = `${run.battle}:${run.scenario}`;
        const group = groups.get(key) ?? { title: `${labelOf(SCENARIOS, run.scenario)} · ${labelOf(BATTLES, run.battle)}`, latest: {} };
        group.latest[run.renderer] = run;
        groups.set(key, group);
    }
    return [...groups.values()].map(({ title, latest }) => {
        const names = [...new Set(RENDERERS.flatMap(renderer => Object.keys(latest[renderer.id]?.summary ?? {})))].filter(name => !UNMEASURED.has(name));
        return {
            title,
            rows: names.map(name => {
                const values = RENDERERS.map(renderer => latest[renderer.id]?.summary[name]);
                return { cells: [name, ...values.map(formatMetric)], best: bestOf(name, values) };
            }),
        };
    });
}

function markdownTable(head: readonly string[], rows: readonly Row[]): string[] {
    return [
        `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`,
        ...rows.map(row => `| ${row.cells.map((cell, index) => row.best?.includes(index) ? `**${cell}**` : cell).join(' | ')} |`),
    ];
}

/** The comparisons and every run as Markdown, with the device they were taken on, to paste wherever they're compared. */
function markdown(runs: readonly Run[], device: string): string {
    return [
        `Device: ${device}`,
        ...comparisons(runs).flatMap(({ title, rows }) => ['', `### ${title}`, '', ...markdownTable(COMPARED_HEAD, rows)]),
        '', '### Every run', '', ...markdownTable(RUN_HEAD, runs.map(runRow)),
    ].join('\n');
}

function LabTable({ head, rows }: { head: readonly string[]; rows: readonly Row[] }) {
    return (
        <div className="ag-chart-table-wrap">
            <table className="ag-chart-table">
                <thead>
                    <tr>{head.map((name, index) => <th key={index}>{name}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={index}>{row.cells.map((cell, column) => <td key={column} className={row.best?.includes(column) ? 'ag-chart-table-best' : undefined}>{cell}</td>)}</tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * The renderer lab (docs/realm-arena-3d.md §4, docs/admin-tools.md): the
 * rendering bench's battles and scenarios — the harness `npm run ra-bench`
 * drives, bench/realmarena/harness.tsx — on whatever device opens it, so the
 * 3D board's GPU side is measured on a real phone rather than a container's
 * software one. Pick a battle and play a scenario: on every board, one after
 * the other, with their numbers side by side, or on any alone. Each run
 * draws its board afresh, so every one starts from the same battle. The
 * results copy as Markdown with the device they ran on.
 *
 * Everything heavy — the boards, three.js, the fixtures — is fetched as the
 * lab opens, never with the admin screens. A scaled battle stands its bigger
 * Sacked Fort in for the real one only while it's on screen.
 */
export default function RealmArenaRendererLab() {
    const [choice, setChoice] = useState<BoardChoice>('all');
    const [battle, setBattle] = useState<Battle>('holdout');
    const [stage, setStage] = useState<Stage | null>(null);
    const [onScreen, setOnScreen] = useState<OnScreen | null>(null);
    const mounts = useRef(0);
    const [failed, setFailed] = useState<string | null>(null);
    const [running, setRunning] = useState<{ scenario: string; renderer: Renderer } | null>(null);
    const [runs, setRuns] = useState<Run[]>([]);
    const [device, setDevice] = useState('');

    // The battle picked, its map standing in while it's loaded.
    useEffect(() => {
        let live = true;
        let restore = () => {};
        Promise.all([
            import('../../../../bench/realmarena/harness'),
            BATTLES.find(one => one.id === battle)!.load(),
        ]).then(([harness, fixture]) => {
            if (!live) return;
            restore = harness.applyFixtureMap(fixture as Fixture);
            setStage({ battle, harness, fixture: fixture as Fixture });
        }).catch(error => { if (live) setFailed(String(error)); });
        return () => {
            live = false;
            restore();
        };
    }, [battle]);

    // The board picked — the isometric one first, when it's all of them — until a run puts up another.
    useEffect(() => {
        let live = true;
        const renderer = choice === 'all' ? 'svg' : choice;
        BOARD_CODE[renderer]().then(code => {
            if (live) setOnScreen({ renderer, ...code, mount: ++mounts.current });
        }).catch(error => { if (live) setFailed(String(error)); });
        return () => { live = false; };
    }, [choice]);

    // What's loaded is for the battle picked, or still the last one while the new one arrives.
    const shown = stage?.battle === battle ? stage : null;

    const play = async (scenario: string) => {
        if (!shown || !onScreen || running) return;
        const { harness, fixture } = shown;
        setFailed(null);
        setDevice(deviceLine());
        try {
            for (const renderer of choice === 'all' ? RENDERERS.map(one => one.id) : [choice]) {
                setRunning({ scenario, renderer });
                const code = await BOARD_CODE[renderer]();
                // Drawn afresh, so each board starts from the battle as it was frozen rather than where the last scenario left it.
                const mounted = harness.boardMounted();
                const art = harness.artDecoded();
                setOnScreen({ renderer, ...code, mount: ++mounts.current });
                await harness.boardSettled(mounted, art);
                const result = await harness.runScenario(fixture, scenario, { glStats: code.glStats });
                setRuns(current => [...current, { renderer, battle: shown.battle, scenario, summary: scenarioSummary(result) }]);
            }
        } catch (error) {
            setFailed(String(error));
        } finally {
            setRunning(null);
        }
    };

    return (
        <>
            <OptionChoiceSection
                label="Board" value={choice} choices={BOARDS} onChange={setChoice} disabled={!!running}
                footer={
                    <p className="ag-hint">
                        The rendering bench&apos;s battles, played on this device. Pick a battle and play a scenario: on all three
                        boards it plays on the isometric one, the 3D one and then the 3D one with its figures outlined, each drawn
                        afresh, and their numbers sit side by side below. The enemy turn takes up to a minute on each.
                    </p>
                }
            />
            <OptionChoiceSection label="Battle" value={battle} choices={BATTLES} onChange={setBattle} disabled={!!running} />
            {failed && <p className="ag-hint">Couldn&apos;t play: {failed}</p>}
            {shown && onScreen
                ? (
                    <>
                        <p className="ag-hint ag-hint--center">On screen: {labelOf(RENDERERS, onScreen.renderer)}</p>
                        <shown.harness.BenchBoard key={`${shown.battle}:${onScreen.mount}`} fixture={shown.fixture} Board={onScreen.Board} />
                    </>
                )
                : <p className="ag-hint ag-hint--center">Loading the board…</p>}
            <Section label="Play">
                <div className="ag-btn-row ag-btn-row--wrap">
                    {SCENARIOS.map(scenario => (
                        <button key={scenario.id} type="button" className="ag-btn ag-btn--light" disabled={!shown || !onScreen || !!running} onClick={() => play(scenario.id)}>
                            {running?.scenario === scenario.id ? `Playing on ${shortOf(running.renderer)}…` : scenario.label}
                        </button>
                    ))}
                </div>
            </Section>
            {runs.length > 0 && (
                <>
                    <Section label="Results" count={runs.length} action={<CopyAction label="Copy as Markdown" text={() => markdown(runs, device)} />}>
                        <p className="ag-hint">
                            On {device}. Each scenario shows its latest run on each board, the better boards in bold where they
                            differ by more than 5%: higher fps, lower everything else.
                        </p>
                    </Section>
                    {comparisons(runs).map(({ title, rows }) => (
                        <Section key={title} label={title}>
                            <LabTable head={COMPARED_HEAD} rows={rows} />
                        </Section>
                    ))}
                    <DisclosureSection title="Every run" level="section">
                        <LabTable head={RUN_HEAD} rows={runs.map(runRow)} />
                    </DisclosureSection>
                </>
            )}
        </>
    );
}
