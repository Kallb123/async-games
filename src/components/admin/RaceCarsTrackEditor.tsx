'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Section from '@/components/ui/Section';
import { spaceKey, TRACK_LIST, type RaceCarsGear, type RaceCarsSpace } from '@/games/RaceCars/board';
import {
    allEffectiveExits,
    buildCorners,
    effectiveExits,
    emptyState,
    fromTrack,
    printTrackFile,
    sameExits,
    tileDefaultExits,
    tileHeading,
    validateTrack,
    type EditorState,
    type EditorTile,
} from '@/games/RaceCars/tracks/editorModel';
import { readStoredValue, writeStoredValue } from '@/utils/hooks/useStoredValue';

/**
 * The Race Cars track editor (docs/admin-tools.md): drop each tile onto a
 * circuit image to fix its centre point, draw the corner merges that break
 * §5.1's step rule, band the corners, and print a `tracks/` file. It is the
 * interactive answer to §23.6's "214 hand-placed coordinates is not a thing to
 * type" — and to the same problem the new spaces-graph gave the corners: an
 * inside line that takes fewer tiles round a corner than the outside has to
 * name where it merges back, and that merge is exactly an exit drawn here.
 *
 * All the geometry, graph and printing live in `editorModel.ts` as pure
 * functions; this component owns only the pointer handling and the panels. The
 * work in progress is kept in `localStorage` (the app's one storage hook) so a
 * reload doesn't lose an afternoon's placing.
 */

const STORAGE_KEY = 'ag-racecars-track-editor';

const TILE_RADIUS = 7;
/** How far a pointer may travel before a click counts as a drag, in screen px. */
const DRAG_SLOP = 4;

type Mode = 'place' | 'exits';

interface PointerState {
    kind: 'tile' | 'background';
    key?: string;
    startX: number;
    startY: number;
    moved: boolean;
    /** Where on the art the background press landed, for a click-to-place. */
    at?: { x: number; y: number };
}

/** The (x, y) on the art under a pointer event, mapped through the SVG's CTM. */
function artPoint(svg: SVGSVGElement, event: React.PointerEvent): { x: number; y: number } | null {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const mapped = point.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
}

/** The next lane to place after this one: 1 → 2 → 3 → wrap to the next row. */
function advance(row: number, lane: number): { row: number; lane: number } {
    return lane >= 3 ? { row: row + 1, lane: 1 } : { row, lane: lane + 1 };
}

export default function RaceCarsTrackEditor() {
    // This screen only mounts after the auth guard resolves, client-side, so a
    // draft can be read straight out of storage here rather than through the
    // hydration-safe hook — there is no server render of it to disagree with.
    const [state, setState] = useState<EditorState>(() => {
        const raw = readStoredValue(STORAGE_KEY);
        if (raw) {
            try {
                return { ...emptyState(), ...JSON.parse(raw) };
            } catch {
                // A corrupt draft is no reason to wedge the editor — start clean.
            }
        }
        return emptyState();
    });

    // Keep the browser's copy in step. Writing to storage is exactly what an
    // effect is for — an external system, not React state.
    useEffect(() => {
        writeStoredValue(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    const [mode, setMode] = useState<Mode>('place');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [nextRow, setNextRow] = useState(0);
    const [nextLane, setNextLane] = useState(1);
    const [zoom, setZoom] = useState(1);

    const svgRef = useRef<SVGSVGElement>(null);
    const pointerRef = useRef<PointerState | null>(null);

    const tilesByKey = useMemo(
        () => new Map(state.tiles.map(tile => [spaceKey(tile.row, tile.lane), tile])),
        [state.tiles],
    );
    const selected = selectedKey ? tilesByKey.get(selectedKey) ?? null : null;

    const validation = useMemo(() => validateTrack(state), [state]);
    const cornerBands = useMemo(() => buildCorners(state), [state]);
    const cornerRows = useMemo(() => cornerRowSet(cornerBands), [cornerBands]);

    const patchTile = useCallback((key: string, patch: Partial<EditorTile>) => {
        setState(prev => ({
            ...prev,
            tiles: prev.tiles.map(tile => (spaceKey(tile.row, tile.lane) === key ? { ...tile, ...patch } : tile)),
        }));
    }, []);

    const placeTile = useCallback((at: { x: number; y: number }) => {
        setState(prev => {
            const key = spaceKey(nextRow, nextLane);
            if (prev.tiles.some(tile => spaceKey(tile.row, tile.lane) === key)) return prev;
            return { ...prev, tiles: [...prev.tiles, { row: nextRow, lane: nextLane, x: at.x, y: at.y }] };
        });
        setSelectedKey(spaceKey(nextRow, nextLane));
        const { row, lane } = advance(nextRow, nextLane);
        setNextRow(row);
        setNextLane(lane);
    }, [nextRow, nextLane]);

    const toggleExit = useCallback((fromKey: string, target: RaceCarsSpace) => {
        setState(prev => {
            const tile = prev.tiles.find(t => spaceKey(t.row, t.lane) === fromKey);
            if (!tile) return prev;
            const current = tile.exits ?? tileDefaultExits(prev.tiles, tile);
            const targetKey = spaceKey(target.row, target.lane);
            const has = current.some(exit => spaceKey(exit.row, exit.lane) === targetKey);
            const nextExits = has
                ? current.filter(exit => spaceKey(exit.row, exit.lane) !== targetKey)
                : [...current, { row: target.row, lane: target.lane }];
            // If the edit lands back on §5.1's default, drop the override so the
            // printed track stays a plain straight rather than a hand-written one.
            const asDefault = sameExits(nextExits, tileDefaultExits(prev.tiles, tile));
            return {
                ...prev,
                tiles: prev.tiles.map(t => (spaceKey(t.row, t.lane) === fromKey
                    ? { ...t, exits: asDefault ? undefined : nextExits }
                    : t)),
            };
        });
    }, []);

    const onTilePointerDown = useCallback((event: React.PointerEvent, key: string) => {
        event.stopPropagation();
        svgRef.current?.setPointerCapture(event.pointerId);
        pointerRef.current = { kind: 'tile', key, startX: event.clientX, startY: event.clientY, moved: false };
    }, []);

    const onBackgroundPointerDown = useCallback((event: React.PointerEvent) => {
        const svg = svgRef.current;
        if (!svg) return;
        svg.setPointerCapture(event.pointerId);
        pointerRef.current = {
            kind: 'background',
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            at: artPoint(svg, event) ?? undefined,
        };
    }, []);

    const onPointerMove = useCallback((event: React.PointerEvent) => {
        const pointer = pointerRef.current;
        const svg = svgRef.current;
        if (!pointer || !svg) return;
        if (!pointer.moved) {
            const travelled = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
            if (travelled < DRAG_SLOP) return;
            pointer.moved = true;
        }
        // A moved press on a tile drags its centre; on the background it does
        // nothing (the container scrolls to pan).
        if (pointer.kind === 'tile' && pointer.key) {
            const at = artPoint(svg, event);
            if (at) patchTile(pointer.key, { x: Math.round(at.x), y: Math.round(at.y) });
        }
    }, [patchTile]);

    const onPointerUp = useCallback((event: React.PointerEvent) => {
        const pointer = pointerRef.current;
        pointerRef.current = null;
        if (!pointer || pointer.moved) return;
        // A press that didn't travel is a click.
        if (pointer.kind === 'tile' && pointer.key) {
            if (mode === 'exits' && selectedKey && pointer.key !== selectedKey) {
                const target = tilesByKey.get(pointer.key);
                if (target) toggleExit(selectedKey, { row: target.row, lane: target.lane });
            } else {
                setSelectedKey(pointer.key);
            }
        } else if (pointer.kind === 'background' && mode === 'place' && pointer.at) {
            placeTile(pointer.at);
        }
    }, [mode, selectedKey, tilesByKey, toggleExit, placeTile]);

    const loadTrack = useCallback((trackId: string) => {
        const track = TRACK_LIST.find(t => t.id === trackId);
        if (!track) return;
        setState(fromTrack(track));
        setSelectedKey(null);
        setMode('place');
    }, []);

    const clearAll = useCallback(() => {
        if (!window.confirm('Clear the whole editor and start a blank track?')) return;
        setState(emptyState());
        setSelectedKey(null);
        setNextRow(0);
        setNextLane(1);
    }, []);

    const onUploadArt = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const href = typeof reader.result === 'string' ? reader.result : '';
            const image = new Image();
            image.onload = () => setState(prev => ({
                ...prev,
                artHref: href,
                viewBox: { width: image.naturalWidth, height: image.naturalHeight },
            }));
            image.onerror = () => setState(prev => ({ ...prev, artHref: href }));
            image.src = href;
        };
        reader.readAsDataURL(file);
    }, []);

    return (
        <>
            <TrackPanel
                state={state}
                onPatch={patch => setState(prev => ({ ...prev, ...patch }))}
                onLoadTrack={loadTrack}
                onUploadArt={onUploadArt}
                onClear={clearAll}
            />

            <Section label="Canvas" count={state.tiles.length}>
                <div className="ag-btn-row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className={`ag-btn ${mode === 'place' ? 'ag-btn--dark' : 'ag-btn--light'}`}
                        onClick={() => setMode('place')}
                    >
                        Place tiles
                    </button>
                    <button
                        type="button"
                        className={`ag-btn ${mode === 'exits' ? 'ag-btn--dark' : 'ag-btn--light'}`}
                        onClick={() => setMode('exits')}
                        disabled={!selected}
                    >
                        Draw exits
                    </button>
                    <span style={{ flex: 1 }} />
                    <button type="button" className="ag-btn ag-btn--light" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>−</button>
                    <span className="ag-hint" style={{ alignSelf: 'center', minWidth: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                    <button type="button" className="ag-btn ag-btn--light" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
                </div>

                <p className="ag-hint" style={{ marginBottom: 8 }}>
                    {mode === 'place'
                        ? `Click the art to drop the next tile (row ${nextRow}, lane ${nextLane}). Drag a tile to nudge its centre; click one to select it.`
                        : selected
                            ? `Click a tile to add or remove a step from ${selected.row}:${selected.lane}. Faint lines are §5.1's default; solid lines are overrides.`
                            : 'Select a tile first.'}
                </p>

                <EditorCanvas
                    svgRef={svgRef}
                    state={state}
                    zoom={zoom}
                    mode={mode}
                    selectedKey={selectedKey}
                    cornerRows={cornerRows}
                    onTilePointerDown={onTilePointerDown}
                    onBackgroundPointerDown={onBackgroundPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                />
            </Section>

            {selected && (
                <SelectedTilePanel
                    state={state}
                    tile={selected}
                    onPatch={patch => patchTile(spaceKey(selected.row, selected.lane), patch)}
                    onResetExits={() => patchTile(spaceKey(selected.row, selected.lane), { exits: undefined })}
                    onDelete={() => {
                        setState(prev => ({ ...prev, tiles: prev.tiles.filter(t => spaceKey(t.row, t.lane) !== selectedKey) }));
                        setSelectedKey(null);
                    }}
                />
            )}

            <CornersPanel
                state={state}
                onSetCorners={corners => setState(prev => ({ ...prev, corners }))}
                onTagRows={(cornerId, from, to) => setState(prev => ({
                    ...prev,
                    tiles: prev.tiles.map(tile => (tile.row >= from && tile.row <= to ? { ...tile, cornerId } : tile)),
                }))}
            />

            <ExportPanel state={state} validation={validation} />
        </>
    );
}

/** The rows any corner covers, so the canvas can tint corner tiles like the board. */
function cornerRowSet(bands: ReturnType<typeof buildCorners>): Set<number> {
    const rows = new Set<number>();
    for (const corner of bands) {
        for (let row = corner.from; row <= corner.to; row++) rows.add(row);
    }
    return rows;
}

// ─── The canvas ──────────────────────────────────────────────────────────────

interface CanvasProps {
    svgRef: React.RefObject<SVGSVGElement | null>;
    state: EditorState;
    zoom: number;
    mode: Mode;
    selectedKey: string | null;
    cornerRows: Set<number>;
    onTilePointerDown: (event: React.PointerEvent, key: string) => void;
    onBackgroundPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
}

function EditorCanvas(props: CanvasProps) {
    const { svgRef, state, zoom, mode, selectedKey, cornerRows, onTilePointerDown, onBackgroundPointerDown, onPointerMove, onPointerUp } = props;
    const { width, height } = state.viewBox;

    // Both lookups built once per render rather than a `.find` per exit: at 214
    // tiles the edges alone are hundreds of lookups, and a drag re-renders them
    // every frame (§23.4).
    const byKey = useMemo(() => new Map(state.tiles.map(tile => [spaceKey(tile.row, tile.lane), tile])), [state.tiles]);
    const exitsByKey = useMemo(() => allEffectiveExits(state.tiles), [state.tiles]);

    return (
        <div className="ag-rcedit-canvas">
            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                width={width * zoom}
                height={height * zoom}
                onPointerDown={onBackgroundPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                style={{ touchAction: 'none', display: 'block', background: 'var(--ag-surface, #efe7db)' }}
            >
                {state.artHref && (
                    <image href={state.artHref} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
                )}

                {/* Exit edges under the tiles: faint dashed for §5.1's default,
                    solid for a hand-drawn override, so a corner's real merge
                    reads at a glance. */}
                {state.tiles.map(tile => {
                    const isOverride = tile.exits !== undefined;
                    const fromKey = spaceKey(tile.row, tile.lane);
                    return (exitsByKey.get(fromKey) ?? []).map(exit => {
                        const target = byKey.get(spaceKey(exit.row, exit.lane));
                        if (!target) return null;
                        return (
                            <line
                                key={`${fromKey}->${spaceKey(exit.row, exit.lane)}`}
                                className={`ag-rcedit-edge${isOverride ? ' ag-rcedit-edge--override' : ''}`}
                                x1={tile.x} y1={tile.y} x2={target.x} y2={target.y}
                            />
                        );
                    });
                })}

                {state.tiles.map(tile => {
                    const key = spaceKey(tile.row, tile.lane);
                    const isSelected = key === selectedKey;
                    const isCorner = cornerRows.has(tile.row);
                    const isTarget = mode === 'exits' && selectedKey !== null && !isSelected;
                    const className = [
                        'ag-rcedit-tile',
                        isCorner ? 'ag-rcedit-tile--corner' : '',
                        isSelected ? 'ag-rcedit-tile--selected' : '',
                        isTarget ? 'ag-rcedit-tile--target' : '',
                    ].filter(Boolean).join(' ');
                    return (
                        <g key={key} onPointerDown={event => onTilePointerDown(event, key)}>
                            <circle className={className} cx={tile.x} cy={tile.y} r={TILE_RADIUS} />
                            <text className="ag-rcedit-tile-label" x={tile.x} y={tile.y - TILE_RADIUS - 2} textAnchor="middle">
                                {tile.row}:{tile.lane}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ─── Panels ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="ag-rcedit-field">
            <span className="ag-field-label">{label}</span>
            {children}
        </label>
    );
}

function TrackPanel({ state, onPatch, onLoadTrack, onUploadArt, onClear }: {
    state: EditorState;
    onPatch: (patch: Partial<EditorState>) => void;
    onLoadTrack: (trackId: string) => void;
    onUploadArt: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onClear: () => void;
}) {
    return (
        <Section label="Track">
            <div className="ag-rcedit-grid">
                <Field label="Track id">
                    <input className="ag-input" value={state.id} onChange={e => onPatch({ id: e.target.value })} placeholder="ashcombe" autoComplete="off" />
                </Field>
                <Field label="Track name">
                    <input className="ag-input" value={state.name} onChange={e => onPatch({ name: e.target.value })} placeholder="Ashcombe Park" autoComplete="off" />
                </Field>
                <Field label="Art width">
                    <input className="ag-input" type="number" value={state.viewBox.width} onChange={e => onPatch({ viewBox: { ...state.viewBox, width: Number(e.target.value) || 0 } })} />
                </Field>
                <Field label="Art height">
                    <input className="ag-input" type="number" value={state.viewBox.height} onChange={e => onPatch({ viewBox: { ...state.viewBox, height: Number(e.target.value) || 0 } })} />
                </Field>
                <Field label="Max gear">
                    <select className="ag-select" value={state.maxGear} onChange={e => onPatch({ maxGear: Number(e.target.value) as Exclude<RaceCarsGear, 0> })}>
                        {[1, 2, 3, 4, 5, 6].map(gear => <option key={gear} value={gear}>{gear}</option>)}
                    </select>
                </Field>
                <Field label="Art path (served copy)">
                    <input className="ag-input" value={state.artHref} onChange={e => onPatch({ artHref: e.target.value })} placeholder="/art/racecars/ashcombe.png" autoComplete="off" />
                </Field>
            </div>

            <p className="ag-hint" style={{ marginTop: 10 }}>
                Set the art path to a file already under <code>public/</code>, or upload an image to trace against — an
                upload is held in this browser only and never printed into the track file, so still set the art path by hand.
            </p>

            <div className="ag-btn-row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                <label className="ag-btn ag-btn--light">
                    Upload backdrop
                    <input type="file" accept="image/*" onChange={onUploadArt} style={{ display: 'none' }} />
                </label>
                <select className="ag-select" defaultValue="" onChange={e => { if (e.target.value) onLoadTrack(e.target.value); e.target.value = ''; }}>
                    <option value="">Load a shipped track…</option>
                    {TRACK_LIST.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
                </select>
                <span style={{ flex: 1 }} />
                <button type="button" className="ag-btn ag-btn--danger" onClick={onClear}>Clear</button>
            </div>
        </Section>
    );
}

function SelectedTilePanel({ state, tile, onPatch, onResetExits, onDelete }: {
    state: EditorState;
    tile: EditorTile;
    onPatch: (patch: Partial<EditorTile>) => void;
    onResetExits: () => void;
    onDelete: () => void;
}) {
    const cornerIds = Object.keys(state.corners);
    const autoHeading = tileHeading(state.tiles, { ...tile, heading: undefined });
    return (
        <Section label={`Tile ${tile.row}:${tile.lane}`}>
            <div className="ag-rcedit-grid">
                <Field label="Row">
                    <input className="ag-input" type="number" value={tile.row} onChange={e => onPatch({ row: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Lane">
                    <input className="ag-input" type="number" value={tile.lane} onChange={e => onPatch({ lane: Number(e.target.value) || 0 })} />
                </Field>
                <Field label={`Heading (auto ${autoHeading}°)`}>
                    <input
                        className="ag-input"
                        type="number"
                        value={tile.heading ?? ''}
                        placeholder={`${autoHeading}`}
                        onChange={e => onPatch({ heading: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                </Field>
                <Field label="Part of corner">
                    <select className="ag-select" value={tile.cornerId ?? ''} onChange={e => onPatch({ cornerId: e.target.value || undefined })}>
                        <option value="">— none —</option>
                        {cornerIds.map(id => <option key={id} value={id}>{state.corners[id].name || id}</option>)}
                    </select>
                </Field>
            </div>

            <p className="ag-hint" style={{ marginTop: 10 }}>
                Steps out: {effectiveExits(state.tiles, tile).map(e => `${e.row}:${e.lane}`).join(', ') || 'none'}
                {tile.exits ? ' (overridden)' : ' (default §5.1 rule)'}.
            </p>

            <div className="ag-btn-row" style={{ marginTop: 10 }}>
                {tile.exits && <button type="button" className="ag-btn ag-btn--light" onClick={onResetExits}>Reset exits to default</button>}
                <span style={{ flex: 1 }} />
                <button type="button" className="ag-btn ag-btn--danger" onClick={onDelete}>Delete tile</button>
            </div>
        </Section>
    );
}

function CornersPanel({ state, onSetCorners, onTagRows }: {
    state: EditorState;
    onSetCorners: (corners: EditorState['corners']) => void;
    onTagRows: (cornerId: string, from: number, to: number) => void;
}) {
    const [newId, setNewId] = useState('');
    const ids = Object.keys(state.corners);

    const addCorner = () => {
        const id = newId.trim();
        if (!id || state.corners[id]) return;
        onSetCorners({ ...state.corners, [id]: { name: id, stops: 1 } });
        setNewId('');
    };
    const removeCorner = (id: string) => {
        const next = { ...state.corners };
        delete next[id];
        onSetCorners(next);
    };
    const patchCorner = (id: string, patch: Partial<EditorState['corners'][string]>) => {
        onSetCorners({ ...state.corners, [id]: { ...state.corners[id], ...patch } });
    };

    return (
        <Section label="Corners" count={ids.length}>
            <p className="ag-hint" style={{ marginBottom: 10 }}>
                A corner is a band of rows with a stop count (§10). Add one, then tag its rows — that is what marks the
                tiles on it. Lane re-alignment after the corner needs no separate step: draw the inside line&apos;s last
                tile straight onto the row it should merge back into, and the exit is the re-alignment.
            </p>

            {ids.map(id => (
                <div key={id} className="ag-rcedit-corner">
                    <div className="ag-rcedit-grid">
                        <Field label="Id"><input className="ag-input" value={id} disabled /></Field>
                        <Field label="Name"><input className="ag-input" value={state.corners[id].name} onChange={e => patchCorner(id, { name: e.target.value })} /></Field>
                        <Field label="Stops">
                            <select className="ag-select" value={state.corners[id].stops} onChange={e => patchCorner(id, { stops: Number(e.target.value) as 1 | 2 })}>
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                            </select>
                        </Field>
                    </div>
                    <RowTagger onTag={(from, to) => onTagRows(id, from, to)} />
                    <div className="ag-btn-row" style={{ marginTop: 6 }}>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="ag-btn ag-btn--light" onClick={() => removeCorner(id)}>Remove corner</button>
                    </div>
                </div>
            ))}

            <div className="ag-btn-row" style={{ marginTop: 10 }}>
                <input className="ag-input" value={newId} onChange={e => setNewId(e.target.value)} placeholder="new corner id, e.g. hairpin" autoComplete="off" />
                <button type="button" className="ag-btn ag-btn--dark" onClick={addCorner}>Add corner</button>
            </div>
        </Section>
    );
}

function RowTagger({ onTag }: { onTag: (from: number, to: number) => void }) {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    return (
        <div className="ag-btn-row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
            <input className="ag-input" style={{ maxWidth: 90 }} type="number" value={from} onChange={e => setFrom(e.target.value)} placeholder="from row" />
            <input className="ag-input" style={{ maxWidth: 90 }} type="number" value={to} onChange={e => setTo(e.target.value)} placeholder="to row" />
            <button
                type="button"
                className="ag-btn ag-btn--light"
                onClick={() => { if (from !== '' && to !== '') onTag(Number(from), Number(to)); }}
            >
                Tag rows
            </button>
        </div>
    );
}

function ExportPanel({ state, validation }: { state: EditorState; validation: ReturnType<typeof validateTrack> }) {
    const [copied, setCopied] = useState(false);
    const source = useMemo(() => printTrackFile(state), [state]);
    const clean = validation.errors.length === 0 && state.tiles.length > 0;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(source);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard blocked — the textarea below is still selectable by hand.
        }
    };

    return (
        <Section label="Validate & export">
            {validation.errors.length > 0 && (
                <div className="ag-callout" style={{ marginBottom: 10 }}>
                    <strong>Not driveable yet:</strong>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                        {validation.errors.map(error => <li key={error}>{error}</li>)}
                    </ul>
                </div>
            )}
            {validation.warnings.length > 0 && (
                <ul className="ag-hint" style={{ margin: '0 0 10px', paddingLeft: 18 }}>
                    {validation.warnings.map(warning => <li key={warning}>{warning}</li>)}
                </ul>
            )}
            {clean && <p className="ag-hint" style={{ marginBottom: 10 }}>Driveable. Save this as <code>src/games/RaceCars/tracks/{state.id || 'track'}.ts</code> and add it to <code>TRACK_LIST</code>.</p>}

            <div className="ag-btn-row" style={{ marginBottom: 10 }}>
                <button type="button" className="ag-btn ag-btn--dark" onClick={copy}>{copied ? 'Copied!' : 'Copy track file'}</button>
            </div>
            <textarea className="ag-input" readOnly value={source} rows={16} style={{ fontFamily: 'monospace', whiteSpace: 'pre', fontSize: 12 }} />
        </Section>
    );
}
