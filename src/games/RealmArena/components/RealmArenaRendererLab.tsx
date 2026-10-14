'use client'
import React, { useEffect, useState } from 'react';
import CopyAction from '@/components/ui/CopyAction';
import OptionChoiceSection from '@/components/ui/OptionChoiceSection';
import Section from '@/components/ui/Section';
import type { Board, Fixture, GlStats } from '../../../../bench/realmarena/harness';
import { scenarioSummary } from '../../../../bench/realmarena/summary';

/** The two ways of drawing the battlefield the lab can put side by side. */
type Renderer = 'svg' | 'three';

const RENDERERS = [
    { id: 'svg', label: 'Isometric (SVG)', description: 'The board players see today.' },
    { id: 'three', label: '3D (three.js)', description: 'The experiment: real geometry, the characters as their models (docs/realm-arena-3d.md).' },
] as const;

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

/** The numbers each run shows, of all `scenarioSummary` gives. */
const SHOWN = ['fps', 'frame gap p95 (ms)', 'frames over 50ms', 'long tasks', 'longest task (ms)', 'part overrun mean (ms)', 'triangles per frame'] as const;
const HEAD = ['Board', 'Battle', 'Scenario', ...SHOWN];

interface Loaded {
    /** Which board and battle it is: a board is only drawn over the battle it was loaded for, and drawn afresh for each. */
    key: string;
    harness: typeof import('../../../../bench/realmarena/harness');
    Board: Board;
    fixture: Fixture;
    glStats?: GlStats;
}

interface Run {
    renderer: Renderer;
    battle: Battle;
    scenario: string;
    summary: Record<string, number>;
}

/** This device, as far as a page can tell: what the numbers were taken on. */
function deviceLine(): string {
    let gpu = 'no WebGL';
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    }
    return `${window.innerWidth}×${window.innerHeight} at ${window.devicePixelRatio}×, GPU ${gpu}, ${navigator.userAgent}`;
}

const format = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? '–' : Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);

const labelOf = (choices: readonly { id: string; label: string }[], id: string) => choices.find(choice => choice.id === id)?.label ?? id;

/** One run's row, under `HEAD`: the table on screen and the copied Markdown both read it. */
const cellsOf = (run: Run): string[] => [
    labelOf(RENDERERS, run.renderer), labelOf(BATTLES, run.battle), labelOf(SCENARIOS, run.scenario),
    ...SHOWN.map(name => format(run.summary[name])),
];

/** The runs as a Markdown table, with the device they were taken on, to paste wherever they're compared. */
function markdown(runs: readonly Run[], device: string): string {
    return [
        `Device: ${device}`, '',
        `| ${HEAD.join(' | ')} |`, `|${HEAD.map(() => '---').join('|')}|`,
        ...runs.map(run => `| ${cellsOf(run).join(' | ')} |`),
    ].join('\n');
}

/**
 * The renderer lab (docs/realm-arena-3d.md §4, docs/admin-tools.md): the
 * rendering bench's battles and scenarios — the harness `npm run ra-bench`
 * drives, bench/realmarena/harness.tsx — on whatever device opens it, so the
 * 3D board's GPU side is measured on a real phone rather than a container's
 * software one. Pick a board and a battle, play a scenario, and the page's own
 * measures of it (frames, long tasks, the enemy turn's timing) are added to the
 * table, which copies as Markdown with the device it ran on.
 *
 * Everything heavy — both boards, three.js, the fixtures — is fetched as the
 * lab opens, never with the admin screens. A scaled battle stands its bigger
 * Sacked Fort in for the real one only while it's on screen.
 */
export default function RealmArenaRendererLab() {
    const [renderer, setRenderer] = useState<Renderer>('three');
    const [battle, setBattle] = useState<Battle>('holdout');
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [running, setRunning] = useState<string | null>(null);
    const [runs, setRuns] = useState<Run[]>([]);
    const [device, setDevice] = useState('');

    useEffect(() => {
        let live = true;
        let restore = () => {};
        Promise.all([
            import('../../../../bench/realmarena/harness'),
            renderer === 'svg' ? import('./RealmArenaBoard').then(module => module.default) : import('./RealmArenaBoard3D').then(module => module.default),
            renderer === 'three' ? import('../three/board3d').then(module => module.renderStats) : Promise.resolve(undefined),
            BATTLES.find(one => one.id === battle)!.load(),
        ]).then(([harness, Board, glStats, fixture]) => {
            if (!live) return;
            restore = harness.applyFixtureMap(fixture as Fixture);
            setLoaded({ key: `${renderer}:${battle}`, harness, Board, fixture: fixture as Fixture, glStats });
        }).catch(error => { if (live) setFailed(String(error)); });
        return () => {
            live = false;
            restore();
        };
    }, [renderer, battle]);
    // What's loaded is for the board and battle picked, or still the last ones while the new ones arrive.
    const ready = loaded?.key === `${renderer}:${battle}` ? loaded : null;

    const play = async (scenario: string) => {
        if (!ready || running) return;
        setRunning(scenario);
        setDevice(deviceLine());
        try {
            const result = await ready.harness.runScenario(ready.fixture, scenario, { glStats: ready.glStats });
            setRuns(current => [...current, { renderer, battle, scenario, summary: scenarioSummary(result) }]);
        } catch (error) {
            setFailed(String(error));
        } finally {
            setRunning(null);
        }
    };

    return (
        <>
            <OptionChoiceSection
                label="Board" value={renderer} choices={RENDERERS} onChange={setRenderer} disabled={!!running}
                footer={
                    <p className="ag-hint">
                        The rendering bench&apos;s battles, played on this device. Pick a board and a battle, then play a scenario:
                        the board plays it as the game would, and its frames and timings join the table below. Run each scenario
                        on both boards to compare them; the enemy turn takes up to a minute.
                    </p>
                }
            />
            <OptionChoiceSection label="Battle" value={battle} choices={BATTLES} onChange={setBattle} disabled={!!running} />
            {failed && <p className="ag-hint">Couldn&apos;t play: {failed}</p>}
            {ready
                ? <ready.harness.BenchBoard key={ready.key} fixture={ready.fixture} Board={ready.Board} />
                : <p className="ag-hint ag-hint--center">Loading the board…</p>}
            <Section label="Play">
                <div className="ag-btn-row ag-btn-row--wrap">
                    {SCENARIOS.map(scenario => (
                        <button key={scenario.id} type="button" className="ag-btn ag-btn--light" disabled={!ready || !!running} onClick={() => play(scenario.id)}>
                            {running === scenario.id ? 'Playing…' : scenario.label}
                        </button>
                    ))}
                </div>
            </Section>
            {runs.length > 0 && (
                <Section label="Results" count={runs.length} action={<CopyAction label="Copy as Markdown" text={() => markdown(runs, device)} />}>
                    <p className="ag-hint">On {device}. Lower is better for all but fps.</p>
                    <div className="ag-chart-table-wrap">
                        <table className="ag-chart-table">
                            <thead>
                                <tr>{HEAD.map(name => <th key={name}>{name}</th>)}</tr>
                            </thead>
                            <tbody>
                                {runs.map((run, index) => (
                                    <tr key={index}>{cellsOf(run).map((cell, column) => <td key={column}>{cell}</td>)}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            )}
        </>
    );
}
