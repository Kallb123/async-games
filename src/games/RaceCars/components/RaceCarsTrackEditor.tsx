'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Section from '@/components/ui/Section';
import { spaceKey, TRACK_LIST, type RaceCarsGear, type RaceCarsSpace } from '@/games/RaceCars/board';
import {
    allEffectiveExits,
    connectByGeometry,
    effectiveExits,
    emptyState,
    fromTrack,
    parseDraft,
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
 * §5.1's step rule, paint the corners, and print a `tracks/` file. It is the
 * interactive answer to §23.6's "214 hand-placed coordinates is not a thing to
 * type" — and to the same problem the new spaces-graph gave the corners: an
 * inside line that takes fewer tiles round a corner than the outside has to
 * name where it merges back, and that merge is exactly an exit drawn here.
 *
 * All the geometry, graph and printing live in `editorModel.ts` as pure
 * functions; this component owns only the pointer handling and the panels. The
 * work in progress is kept in `localStorage` (the app's one storage hook) so a
 * reload doesn't lose an afternoon's placing, and can be downloaded to a file
 * for a longer-lived save/resume across browsers. The traced-over backdrop is
 * the one thing left out of storage, because a multi-megabyte data URI would
 * blow the quota and silently drop every later save with it.
 */

const STORAGE_KEY = 'ag-racecars-track-editor';

const TILE_RADIUS = 7;
/** How far a pointer may travel before a click counts as a drag, in screen px. */
const DRAG_SLOP = 4;
/** How near the pointer must be to a tile centre to paint it, in art units. */
const PAINT_HIT = TILE_RADIUS * 1.8;
/** File-size ceilings: a big track's draft JSON is far under the first, and a
 *  traced backdrop far under the second — enough to turn a wrong huge file into
 *  the same error message a parse failure gives rather than a frozen tab. */
const MAX_DRAFT_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

type Mode = 'place' | 'exits' | 'paint';

interface PointerState {
    /** 'tile'/'background' are the place & exits gestures; 'paint' drags the brush. */
    kind: 'tile' | 'background' | 'paint';
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

/** The pointer state a paint drag starts in — shared by the tile and background
 *  press so a fourth field wouldn't need adding in two places. */
function paintPointer(event: React.PointerEvent): PointerState {
    return { kind: 'paint', startX: event.clientX, startY: event.clientY, moved: false };
}

export default function RaceCarsTrackEditor() {
    // This screen only mounts after the auth guard resolves, client-side, so a
    // draft can be read straight out of storage here rather than through the
    // hydration-safe hook — there is no server render of it to disagree with.
    const [state, setState] = useState<EditorState>(() => parseDraft(readStoredValue(STORAGE_KEY)));

    // Keep the browser's copy in step. Writing to storage is exactly what an
    // effect is for — an external system, not React state.
    useEffect(() => {
        writeStoredValue(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    // The traced-over backdrop lives here, not in `state`: it is a multi-megabyte
    // data URI, and serialising it into every draft save would blow the storage
    // quota (see the file comment). It is browser-only and never printed, so a
    // reload starts it blank while the tiles and the typed art path persist.
    const [backdrop, setBackdrop] = useState<string | null>(null);

    const [mode, setMode] = useState<Mode>('place');
    const [activeCorner, setActiveCorner] = useState<string>('');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [nextRow, setNextRow] = useState(0);
    const [nextLane, setNextLane] = useState(1);
    const [zoom, setZoom] = useState(1);
    const [fileError, setFileError] = useState<string | null>(null);

    const svgRef = useRef<SVGSVGElement>(null);
    const pointerRef = useRef<PointerState | null>(null);

    const tilesByKey = useMemo(
        () => new Map(state.tiles.map(tile => [spaceKey(tile.row, tile.lane), tile])),
        [state.tiles],
    );
    const selected = selectedKey ? tilesByKey.get(selectedKey) ?? null : null;

    const validation = useMemo(() => validateTrack(state), [state]);

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

    // Paint the tile under a key into the active corner (or erase it, when the
    // brush is set to "none"). A no-op when the tile already carries that corner,
    // so dragging the brush back over painted ground doesn't stringify the whole
    // draft to localStorage on every pointermove frame (§23.4).
    const paint = useCallback((key: string) => {
        setState(prev => {
            const target = activeCorner || undefined;
            const tile = prev.tiles.find(t => spaceKey(t.row, t.lane) === key);
            if (!tile || tile.cornerId === target) return prev;
            return {
                ...prev,
                tiles: prev.tiles.map(t => (spaceKey(t.row, t.lane) === key ? { ...t, cornerId: target } : t)),
            };
        });
    }, [activeCorner]);

    const tileKeyAt = useCallback((at: { x: number; y: number }): string | null => {
        for (const tile of state.tiles) {
            if (Math.hypot(tile.x - at.x, tile.y - at.y) <= PAINT_HIT) return spaceKey(tile.row, tile.lane);
        }
        return null;
    }, [state.tiles]);

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

    const deleteTile = useCallback((key: string) => {
        setState(prev => {
            const survivors = prev.tiles.filter(t => spaceKey(t.row, t.lane) !== key);
            // Scrub any hand-drawn exit that pointed at the deleted tile, so its
            // removal can't leave a dangling reference — the very graph error
            // that would otherwise throw out of the export printer. An override
            // emptied by the scrub falls back to §5.1's default rule.
            return {
                ...prev,
                tiles: survivors.map(tile => {
                    if (!tile.exits) return tile;
                    const kept = tile.exits.filter(exit => spaceKey(exit.row, exit.lane) !== key);
                    if (kept.length === tile.exits.length) return tile;
                    return { ...tile, exits: kept.length > 0 ? kept : undefined };
                }),
            };
        });
        setSelectedKey(null);
    }, []);

    const onTilePointerDown = useCallback((event: React.PointerEvent, key: string) => {
        event.stopPropagation();
        svgRef.current?.setPointerCapture(event.pointerId);
        if (mode === 'paint') {
            paint(key);
            pointerRef.current = paintPointer(event);
            return;
        }
        pointerRef.current = { kind: 'tile', key, startX: event.clientX, startY: event.clientY, moved: false };
    }, [mode, paint]);

    const onBackgroundPointerDown = useCallback((event: React.PointerEvent) => {
        const svg = svgRef.current;
        if (!svg) return;
        svg.setPointerCapture(event.pointerId);
        if (mode === 'paint') {
            pointerRef.current = paintPointer(event);
            return;
        }
        if (mode === 'exits') { pointerRef.current = null; return; }
        pointerRef.current = {
            kind: 'background',
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            at: artPoint(svg, event) ?? undefined,
        };
    }, [mode]);

    const onPointerMove = useCallback((event: React.PointerEvent) => {
        const pointer = pointerRef.current;
        const svg = svgRef.current;
        if (!pointer || !svg) return;
        if (pointer.kind === 'paint') {
            // Gate on the live mode, not just the captured kind: switching off
            // Paint mid-drag (a keyboard press on a focused mode button while the
            // button is still held) must stop the brush, or it paints on under a
            // toolbar that says it isn't.
            if (mode !== 'paint') return;
            const at = artPoint(svg, event);
            const key = at && tileKeyAt(at);
            if (key) paint(key);
            return;
        }
        if (!pointer.moved) {
            const travelled = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
            if (travelled < DRAG_SLOP) return;
            pointer.moved = true;
        }
        // A moved press on a tile drags its centre; on the background it does
        // nothing (the container scrolls to pan).
        if (pointer.kind === 'tile' && pointer.key && mode === 'place') {
            const at = artPoint(svg, event);
            if (at) patchTile(pointer.key, { x: Math.round(at.x), y: Math.round(at.y) });
        }
    }, [mode, paint, tileKeyAt, patchTile]);

    const onPointerUp = useCallback(() => {
        const pointer = pointerRef.current;
        pointerRef.current = null;
        if (!pointer || pointer.kind === 'paint' || pointer.moved) return;
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

    const autoConnect = useCallback(() => {
        setState(prev => ({ ...prev, tiles: connectByGeometry(prev.tiles) }));
    }, []);

    const loadTrack = useCallback((trackId: string) => {
        const track = TRACK_LIST.find(t => t.id === trackId);
        if (!track) return;
        setState(fromTrack(track));
        setBackdrop(null);
        setSelectedKey(null);
        setMode('place');
    }, []);

    const clearAll = useCallback(() => {
        if (!window.confirm('Clear the whole editor and start a blank track?')) return;
        setState(emptyState());
        setBackdrop(null);
        setSelectedKey(null);
        setNextRow(0);
        setNextLane(1);
    }, []);

    const downloadDraft = useCallback(() => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${state.id || 'racecars-track'}.draft.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    }, [state]);

    const importDraft = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setFileError(null);
        if (file.size > MAX_DRAFT_BYTES) { setFileError("That draft file is too big to be one of ours."); event.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
            setState(parseDraft(typeof reader.result === 'string' ? reader.result : null));
            setBackdrop(null);
            setSelectedKey(null);
            setMode('place');
        };
        reader.onerror = () => setFileError("Couldn't read that draft file.");
        reader.readAsText(file);
        // Let the same file be chosen again after an edit-and-reimport.
        event.target.value = '';
    }, []);

    const onUploadArt = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setFileError(null);
        if (file.size > MAX_IMAGE_BYTES) { setFileError("That image is too big to trace against."); event.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
            const href = typeof reader.result === 'string' ? reader.result : '';
            if (!href) { setFileError("Couldn't read that image."); return; }
            const image = new Image();
            image.onload = () => {
                setBackdrop(href);
                setState(prev => ({ ...prev, viewBox: { width: image.naturalWidth, height: image.naturalHeight } }));
            };
            image.onerror = () => { setBackdrop(href); };
            image.src = href;
        };
        reader.onerror = () => setFileError("Couldn't read that image.");
        reader.readAsDataURL(file);
        event.target.value = '';
    }, []);

    return (
        <div className="ag-rcedit-page">
            <div className="ag-rcedit-canvas-col">
                <Section label="Canvas" count={state.tiles.length}>
                    <div className="ag-stack">
                        <div className="ag-rcedit-toolbar">
                            <button type="button" className={`ag-btn ${mode === 'place' ? 'ag-btn--dark' : 'ag-btn--light'}`} onClick={() => setMode('place')}>Place</button>
                            <button type="button" className={`ag-btn ${mode === 'exits' ? 'ag-btn--dark' : 'ag-btn--light'}`} onClick={() => setMode('exits')} disabled={!selected}>Draw exits</button>
                            <button type="button" className={`ag-btn ${mode === 'paint' ? 'ag-btn--dark' : 'ag-btn--light'}`} onClick={() => setMode('paint')}>Paint corners</button>
                            <div className="ag-rcedit-toolbar-zoom">
                                <button type="button" className="ag-btn ag-btn--light" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>−</button>
                                <span className="ag-hint">{Math.round(zoom * 100)}%</span>
                                <button type="button" className="ag-btn ag-btn--light" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
                            </div>
                        </div>

                        {mode === 'paint' && (
                            <div className="ag-rcedit-toolbar">
                                <label className="ag-field-label" htmlFor="rcedit-brush">Painting</label>
                                <select id="rcedit-brush" className="ag-select" value={activeCorner} onChange={e => setActiveCorner(e.target.value)}>
                                    <option value="">Erase (no corner)</option>
                                    {Object.keys(state.corners).map(id => <option key={id} value={id}>{state.corners[id].name || id}</option>)}
                                </select>
                            </div>
                        )}

                        <p className="ag-hint">
                            {mode === 'place'
                                ? `Click the art to drop the next tile (row ${nextRow}, lane ${nextLane}). Drag a tile to nudge its centre; click one to select it.`
                                : mode === 'exits'
                                    ? (selected
                                        ? `Click a tile to add or remove a step from ${selected.row}:${selected.lane}. Faint lines are §5.1's default; solid lines are overrides.`
                                        : 'Select a tile first.')
                                    : activeCorner
                                        ? `Click or drag over tiles to paint them into "${state.corners[activeCorner]?.name || activeCorner}".`
                                        : 'Click or drag over tiles to clear their corner. Pick a corner above to paint one on.'}
                        </p>

                        <EditorCanvas
                            svgRef={svgRef}
                            state={state}
                            backdropHref={backdrop ?? state.artHref}
                            zoom={zoom}
                            mode={mode}
                            activeCorner={activeCorner}
                            selectedKey={selectedKey}
                            onTilePointerDown={onTilePointerDown}
                            onBackgroundPointerDown={onBackgroundPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                        />

                        <div className="ag-btn-row ag-btn-row--wrap">
                            <button type="button" className="ag-btn ag-btn--light" onClick={autoConnect}>Auto-connect exits from geometry</button>
                        </div>
                        <p className="ag-hint">
                            Auto-connect rebuilds each tile&apos;s steps from where the tiles sit, not from row+1 — the way a
                            sharp corner&apos;s lanes fall back into step. It leaves your hand-drawn exits alone.
                        </p>
                    </div>
                </Section>
            </div>

            <div className="ag-rcedit-side-col">
                <TrackPanel
                    state={state}
                    fileError={fileError}
                    onPatch={patch => setState(prev => ({ ...prev, ...patch }))}
                    onLoadTrack={loadTrack}
                    onUploadArt={onUploadArt}
                    onImportDraft={importDraft}
                    onDownloadDraft={downloadDraft}
                    onClear={clearAll}
                />

                {selected && (
                    <SelectedTilePanel
                        state={state}
                        tile={selected}
                        onPatch={patch => patchTile(spaceKey(selected.row, selected.lane), patch)}
                        onResetExits={() => patchTile(spaceKey(selected.row, selected.lane), { exits: undefined })}
                        onDelete={() => deleteTile(spaceKey(selected.row, selected.lane))}
                    />
                )}

                <CornersPanel
                    state={state}
                    activeCorner={activeCorner}
                    onSetActiveCorner={setActiveCorner}
                    onSetCorners={corners => setState(prev => ({ ...prev, corners }))}
                />

                <ExportPanel state={state} validation={validation} />
            </div>
        </div>
    );
}

// ─── The canvas ──────────────────────────────────────────────────────────────

interface CanvasProps {
    svgRef: React.RefObject<SVGSVGElement | null>;
    state: EditorState;
    /** The image drawn under the tiles — the traced backdrop, else the art path. */
    backdropHref: string;
    zoom: number;
    mode: Mode;
    activeCorner: string;
    selectedKey: string | null;
    onTilePointerDown: (event: React.PointerEvent, key: string) => void;
    onBackgroundPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
}

// A plain scroll-and-zoom frame, deliberately not `BoardZoom`: that toggles
// between two zoom states on click, which would fight click-to-place. Here zoom
// is a continuous control and the container just scrolls to pan.
function EditorCanvas(props: CanvasProps) {
    const { svgRef, state, backdropHref, zoom, mode, activeCorner, selectedKey, onTilePointerDown, onBackgroundPointerDown, onPointerMove, onPointerUp } = props;
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
                className="ag-rcedit-svg"
            >
                {backdropHref && (
                    <image href={backdropHref} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
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
                    // Corner membership is per tile, not per row — a corner can
                    // take only some lanes of a row (§10 reads the row band, but
                    // the author paints exactly the tiles that belong).
                    const inCorner = tile.cornerId !== undefined;
                    const isBrush = mode === 'paint' && activeCorner !== '' && tile.cornerId === activeCorner;
                    const isTarget = mode === 'exits' && selectedKey !== null && !isSelected;
                    const className = [
                        'ag-rcedit-tile',
                        inCorner ? 'ag-rcedit-tile--corner' : '',
                        isBrush ? 'ag-rcedit-tile--brush' : '',
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

function TrackPanel({ state, fileError, onPatch, onLoadTrack, onUploadArt, onImportDraft, onDownloadDraft, onClear }: {
    state: EditorState;
    fileError: string | null;
    onPatch: (patch: Partial<EditorState>) => void;
    onLoadTrack: (trackId: string) => void;
    onUploadArt: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onImportDraft: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onDownloadDraft: () => void;
    onClear: () => void;
}) {
    return (
        <Section label="Track">
            <div className="ag-stack">
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

                <p className="ag-hint">
                    Set the art path to a file already under <code>public/</code>, or upload an image to trace against — an
                    upload is held in this browser only, never printed into the track file and not saved with the draft, so
                    still set the art path by hand.
                </p>

                {fileError && <p className="ag-hint">{fileError}</p>}

                <div className="ag-btn-row ag-btn-row--wrap">
                    <label className="ag-btn ag-btn--light">
                        Upload backdrop
                        <input type="file" accept="image/*" onChange={onUploadArt} hidden />
                    </label>
                    <select className="ag-select" defaultValue="" onChange={e => { if (e.target.value) onLoadTrack(e.target.value); e.target.value = ''; }}>
                        <option value="">Load a shipped track…</option>
                        {TRACK_LIST.map(track => <option key={track.id} value={track.id}>{track.name}</option>)}
                    </select>
                </div>

                <p className="ag-hint">
                    Save a draft to a file to resume later or on another machine — this is the working copy, separate from the
                    deployable track file the export panel prints.
                </p>
                <div className="ag-btn-row ag-btn-row--wrap">
                    <button type="button" className="ag-btn ag-btn--light" onClick={onDownloadDraft}>Save draft to file</button>
                    <label className="ag-btn ag-btn--light">
                        Open draft file
                        <input type="file" accept="application/json,.json" onChange={onImportDraft} hidden />
                    </label>
                    <button type="button" className="ag-btn ag-btn--danger" onClick={onClear}>Clear</button>
                </div>
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
            <div className="ag-stack">
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

                <p className="ag-hint">
                    Steps out: {effectiveExits(state.tiles, tile).map(e => `${e.row}:${e.lane}`).join(', ') || 'none'}
                    {tile.exits ? ' (overridden)' : ' (default §5.1 rule)'}.
                </p>

                <div className="ag-btn-row ag-btn-row--wrap">
                    {tile.exits && <button type="button" className="ag-btn ag-btn--light" onClick={onResetExits}>Reset exits to default</button>}
                    <button type="button" className="ag-btn ag-btn--danger" onClick={onDelete}>Delete tile</button>
                </div>
            </div>
        </Section>
    );
}

function CornersPanel({ state, activeCorner, onSetActiveCorner, onSetCorners }: {
    state: EditorState;
    activeCorner: string;
    onSetActiveCorner: (id: string) => void;
    onSetCorners: (corners: EditorState['corners']) => void;
}) {
    const [newId, setNewId] = useState('');
    const ids = Object.keys(state.corners);

    const addCorner = () => {
        const id = newId.trim();
        if (!id || state.corners[id]) return;
        onSetCorners({ ...state.corners, [id]: { name: id, stops: 1 } });
        onSetActiveCorner(id);
        setNewId('');
    };
    const removeCorner = (id: string) => {
        const next = { ...state.corners };
        delete next[id];
        onSetCorners(next);
        if (activeCorner === id) onSetActiveCorner('');
    };
    const patchCorner = (id: string, patch: Partial<EditorState['corners'][string]>) => {
        onSetCorners({ ...state.corners, [id]: { ...state.corners[id], ...patch } });
    };

    return (
        <Section label="Corners" count={ids.length}>
            <div className="ag-stack">
                <p className="ag-hint">
                    A corner is a band of rows with a stop count (§10). Add one, then switch to <strong>Paint corners</strong>
                    on the canvas and drag over the tiles that belong to it — a corner need not take every lane of a row.
                    Lane re-alignment after the corner needs no separate step: draw the inside line&apos;s last tile straight
                    onto the row it should merge back into, and the exit is the re-alignment.
                </p>

                {ids.map(id => (
                    <div key={id} className={`ag-rcedit-corner ag-stack${activeCorner === id ? ' ag-rcedit-corner--active' : ''}`}>
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
                        <div className="ag-btn-row ag-btn-row--wrap">
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => onSetActiveCorner(id)}>{activeCorner === id ? 'Painting this' : 'Paint this'}</button>
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => removeCorner(id)}>Remove corner</button>
                        </div>
                    </div>
                ))}

                <div className="ag-btn-row ag-btn-row--wrap">
                    <input className="ag-input" value={newId} onChange={e => setNewId(e.target.value)} placeholder="new corner id, e.g. hairpin" autoComplete="off" />
                    <button type="button" className="ag-btn ag-btn--dark" onClick={addCorner}>Add corner</button>
                </div>
            </div>
        </Section>
    );
}

function ExportPanel({ state, validation }: { state: EditorState; validation: ReturnType<typeof validateTrack> }) {
    const [copied, setCopied] = useState(false);
    const clean = validation.errors.length === 0 && state.tiles.length > 0;
    // Only print a driveable track: `printTrackFile` runs the tiles through
    // `assembleSpaces`, which throws on the very graph errors the banner above
    // is already reporting — so printing an unclean track would crash the panel.
    const source = useMemo(() => (clean ? printTrackFile(state) : ''), [clean, state]);

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
            <div className="ag-stack">
                {validation.errors.length > 0 && (
                    <div className="ag-callout">
                        <strong>Not driveable yet:</strong>
                        <ul className="ag-rcedit-issues">
                            {validation.errors.map(error => <li key={error}>{error}</li>)}
                        </ul>
                    </div>
                )}
                {validation.warnings.length > 0 && (
                    <ul className="ag-hint ag-rcedit-issues">
                        {validation.warnings.map(warning => <li key={warning}>{warning}</li>)}
                    </ul>
                )}

                {clean ? (
                    <>
                        <p className="ag-hint">Driveable. Save this as <code>src/games/RaceCars/tracks/{state.id || 'track'}.ts</code> and add it to <code>TRACK_LIST</code>.</p>
                        <div className="ag-btn-row ag-btn-row--wrap">
                            <button type="button" className="ag-btn ag-btn--dark" onClick={copy}>{copied ? 'Copied!' : 'Copy track file'}</button>
                        </div>
                        <textarea className="ag-input ag-rcedit-code" readOnly value={source} rows={16} />
                    </>
                ) : (
                    <p className="ag-hint">Fix the issues above to print the track file.</p>
                )}
            </div>
        </Section>
    );
}
