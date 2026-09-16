'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Section from '@/components/ui/Section';
import { TRACK_LIST, type RaceCarsGear } from '@/games/RaceCars/board';
import {
    allEffectiveExits,
    connectByGeometry,
    derivedRows,
    effectiveExits,
    emptyState,
    fromTrack,
    mustNameSteps,
    nextTileId,
    NO_EXITS,
    parseDraft,
    pinnedExits,
    printTrackFile,
    sameExits,
    sectionLabel,
    tileDefaultExits,
    tileHeading,
    tilesIn,
    toSections,
    validateTrack,
    withSectionStepsNamed,
    type EditorSection,
    type EditorState,
    type EditorTile,
} from '@/games/RaceCars/tracks/editorModel';
import { lapRuns } from '@/games/RaceCars/tracks/sections';
import { readStoredValue, writeStoredValue } from '@/utils/hooks/useStoredValue';

/**
 * The Race Cars track editor (docs/admin-tools.md): cut the lap into sections,
 * drop each tile onto a circuit image to fix its centre point, draw the steps
 * that break §5.1's own rule, and print a `tracks/` file. It is the interactive
 * answer to §23.6's "214 hand-placed coordinates is not a thing to type".
 *
 * **Nothing here numbers a row.** An author draws sections and the steps
 * between tiles; `deriveTrack` works the rows out from those steps and the
 * canvas prints them back onto the tiles (`tracks/sections.ts`). That is the
 * whole reason the editor grew sections: a row typed by hand drifts one tile at
 * a time through every corner whose inside line is shorter than its outside,
 * and by the second corner two tiles drawn side by side carry numbers a lap
 * apart. A section boundary is a **sync line** — draw one wherever the lanes
 * are genuinely level across the road, a tile or two clear of a corner, and the
 * rows inside each section are worked out from there.
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

/**
 * Bumped whenever a fix to the editor itself (not a track) ships, so an admin
 * mid-track can tell which of them are live without digging through commits —
 * shown as a small footer, its tooltip naming what changed.
 */
const TOOL_VERSION = 9;
const TOOL_CHANGES = [
    'v9 — a tile can be made to name its own steps even where they match §5.1\'s default: click the tile you are drawing from, or name a whole out-of-step section\'s at once from its row, which is what "runs its lanes out of step" was asking for and had no way to answer.',
    'v8 — hot keys for the toolbar: Q/W/E pick the mode, 1–3 the lane, and A/S step back and on through the sections, so placing a lap no longer means a round trip to the buttons between tiles.',
    'v7 — a step auto-connect drew from the geometry is purple on the canvas, telling it apart from both §5.1\'s faint grey default and a terracotta hand-drawn override — so what a re-run will redraw reads at a glance.',
    'v6 — sections and sync lines: the lap is cut into stretches of road whose ends are level across every lane, corners are sections rather than a paint colour, and rows are derived from the steps rather than typed (so they cannot drift after a corner).',
    'v5 — auto-connect never reasons from its own previous run: heading and "already connected" are worked out fresh from where the tiles sit and in road order each time, so a second run settles rather than drifting to a different tile.',
    'v4 — auto-connect never reverses an existing exit (generated or hand-drawn); it falls through to the next-nearest tile in that lane instead of connecting two tiles both ways.',
    'v3 — auto-connect picks the nearest tile per lane rather than one distance cutoff shared across lanes, so a wide road\'s lane change is no longer dropped for sitting farther off than staying in lane.',
    'v2 — auto-connect never skips a lane (no lane 1 straight to lane 3), and tags what it writes so a later pass can redraw it instead of freezing on the first run.',
    'v1 — corner painting, save/resume to a file, and connecting exits from the drawn geometry.',
].join('\n');

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
    id?: string;
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

/** The pointer state a paint drag starts in — shared by the tile and background
 *  press so a fourth field wouldn't need adding in two places. */
function paintPointer(event: React.PointerEvent): PointerState {
    return { kind: 'paint', startX: event.clientX, startY: event.clientY, moved: false };
}

/** The sections a tile can be drawn into, for the two pickers that offer them. */
function SectionOptions({ sections }: { sections: EditorSection[] }) {
    return sections.map(section => (
        <option key={section.id} value={section.id}>
            {sectionLabel(section)}{section.stops > 0 ? ` — corner, ${section.stops} stop${section.stops === 1 ? '' : 's'}` : ''}
        </option>
    ));
}

/** The lanes a road this wide has, for the two pickers that offer them. */
function LaneOptions({ lanes }: { lanes: number }) {
    return Array.from({ length: lanes }, (_unused, index) => index + 1)
        .map(lane => <option key={lane} value={lane}>{lane}</option>);
}

/** A section id nothing else is using, for the "add section" button. */
function freeSectionId(sections: EditorSection[]): string {
    const taken = new Set(sections.map(section => section.id));
    let index = sections.length + 1;
    while (taken.has(`section${index}`)) index++;
    return `section${index}`;
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
    const [activeSectionId, setActiveSectionId] = useState<string>('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [nextLane, setNextLane] = useState(1);
    const [zoom, setZoom] = useState(1);
    const [fileError, setFileError] = useState<string | null>(null);

    const svgRef = useRef<SVGSVGElement>(null);
    const pointerRef = useRef<PointerState | null>(null);

    const tilesById = useMemo(() => new Map(state.tiles.map(tile => [tile.id, tile])), [state.tiles]);
    const selected = selectedId ? tilesById.get(selectedId) ?? null : null;

    // The section tiles are drawn into, and the brush's target. Resolved rather
    // than stored, so deleting the active section can't leave the canvas
    // dropping tiles into one that no longer exists.
    const activeSection = state.sections.find(section => section.id === activeSectionId) ?? state.sections[0];
    // How wide the road is where tiles are landing — derived once, because the
    // lane picker, the place hint and the lane hot keys must agree on it.
    const activeLanes = activeSection?.lanes ?? 3;

    const validation = useMemo(() => validateTrack(state), [state]);
    // Rows as the derivation sees them, printed on the tiles: the one reading
    // that tells an author their sync lines are where they think they are.
    const rows = useMemo(() => derivedRows(validation.derived), [validation]);

    // Hot keys for the toolbar: an author places a couple of hundred tiles a
    // track, and the slow part is the round trip to the buttons between every
    // one of them. Q/W/E sit under the hand that isn't on the mouse, 1–3 name
    // the lane they pick, and A/S walk the lap the way it is driven.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            // Never take a key off a field — this screen is mostly text inputs —
            // and leave anything chorded to the browser's own shortcuts.
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target?.isContentEditable) return;
            if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

            // Clamped rather than wrapped, like the picker's own arrow keys: the
            // ends of the list should feel like ends while an author holds a key.
            const stepSection = (by: number) => {
                const index = state.sections.findIndex(section => section.id === activeSection?.id);
                const next = state.sections[Math.min(Math.max(index + by, 0), state.sections.length - 1)];
                if (next) setActiveSectionId(next.id);
            };

            switch (event.key.toLowerCase()) {
                case 'q': setMode('place'); break;
                // Mirrors the toolbar, which can't draw exits from no tile.
                case 'w': if (!selected) return; setMode('exits'); break;
                case 'e': setMode('paint'); break;
                case 'a': stepSection(-1); break;
                case 's': stepSection(1); break;
                case '1':
                case '2':
                case '3': {
                    // Only a lane this section actually has, so a key can never
                    // set what the picker wouldn't have offered.
                    const lane = Number(event.key);
                    if (lane > activeLanes) return;
                    setNextLane(lane);
                    break;
                }
                default: return;
            }
            // Only once a key has actually done something — one this screen
            // ignores stays the browser's (and the page's own scrolling).
            event.preventDefault();
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [state.sections, activeSection, activeLanes, selected]);

    const patchTile = useCallback((id: string, patch: Partial<EditorTile>) => {
        setState(prev => ({
            ...prev,
            tiles: prev.tiles.map(tile => (tile.id === id ? { ...tile, ...patch } : tile)),
        }));
    }, []);

    const placeTile = useCallback((at: { x: number; y: number }) => {
        if (!activeSection) return;
        const lanes = activeSection.lanes;
        const lane = Math.min(nextLane, lanes);
        let placedId = '';
        setState(prev => {
            placedId = nextTileId(prev, activeSection.id, lane);
            return {
                ...prev,
                tiles: [...prev.tiles, { id: placedId, section: activeSection.id, lane, x: at.x, y: at.y }],
            };
        });
        setSelectedId(placedId);
        setNextLane(lane >= lanes ? 1 : lane + 1);
    }, [activeSection, nextLane]);

    // Paint one tile into the active section — which is also how a corner is
    // drawn, since a corner *is* a section (§10). A no-op when the tile is
    // already in it, so dragging the brush back over painted ground doesn't
    // stringify the whole draft to localStorage on every frame (§23.4).
    const paint = useCallback((id: string) => {
        if (!activeSection) return;
        setState(prev => {
            const tile = prev.tiles.find(candidate => candidate.id === id);
            if (!tile || tile.section === activeSection.id) return prev;
            return {
                ...prev,
                tiles: prev.tiles.map(candidate => (candidate.id === id
                    ? { ...candidate, section: activeSection.id }
                    : candidate)),
            };
        });
    }, [activeSection]);

    const tileIdAt = useCallback((at: { x: number; y: number }): string | null => {
        for (const tile of state.tiles) {
            if (Math.hypot(tile.x - at.x, tile.y - at.y) <= PAINT_HIT) return tile.id;
        }
        return null;
    }, [state.tiles]);

    const toggleExit = useCallback((fromId: string, targetId: string) => {
        setState(prev => {
            const tile = prev.tiles.find(candidate => candidate.id === fromId);
            if (!tile) return prev;
            const fallback = tileDefaultExits(lapRuns(toSections(prev)), prev, tile);
            const current = tile.exits ?? fallback;
            const nextExits = current.includes(targetId)
                ? current.filter(exit => exit !== targetId)
                : [...current, targetId];
            // If the edit lands back on §5.1's default, drop the override so the
            // printed track stays a plain straight rather than a hand-written one
            // — but never where that rule is one `deriveTrack` refuses, or an
            // author editing a tile in an out-of-step section would silently
            // undo the very thing making its section driveable.
            const asDefault = sameExits(nextExits, fallback) && !mustNameSteps(prev, tile);
            return {
                ...prev,
                // A hand edit is authored, even one starting from an auto-connect
                // — so it clears autoExits and, from here on, auto-connect leaves
                // it alone like any other hand-drawn override.
                tiles: prev.tiles.map(candidate => (candidate.id === fromId
                    ? { ...candidate, exits: asDefault ? undefined : nextExits, autoExits: undefined }
                    : candidate)),
            };
        });
    }, []);

    /**
     * Freeze a tile's current steps as its own, or hand them back to §5.1's
     * rule — the click on the tile itself while drawing its exits.
     *
     * A tile whose default steps are already the right ones has no other way to
     * say so: every toggle that lands on the default drops the override again.
     * That is the state a section running its lanes out of step needs, because
     * the rule its tiles would otherwise fall back to is one `deriveTrack`
     * refuses whether or not it happens to point the right way.
     */
    const togglePinnedExits = useCallback((id: string) => {
        setState(prev => {
            const tile = prev.tiles.find(candidate => candidate.id === id);
            if (!tile) return prev;
            const patch = tile.exits ? NO_EXITS : pinnedExits(prev, tile);
            return {
                ...prev,
                tiles: prev.tiles.map(candidate => (candidate.id === id ? { ...candidate, ...patch } : candidate)),
            };
        });
    }, []);

    const deleteTile = useCallback((id: string) => {
        setState(prev => {
            const survivors = prev.tiles.filter(tile => tile.id !== id);
            // Scrub any hand-drawn exit that pointed at the deleted tile, so its
            // removal can't leave a dangling reference — the very graph error
            // that would otherwise throw out of the export printer. An override
            // emptied by the scrub falls back to §5.1's default rule.
            return {
                ...prev,
                tiles: survivors.map(tile => {
                    if (!tile.exits) return tile;
                    const kept = tile.exits.filter(exit => exit !== id);
                    if (kept.length === tile.exits.length) return tile;
                    return kept.length > 0 ? { ...tile, exits: kept } : { ...tile, ...NO_EXITS };
                }),
            };
        });
        setSelectedId(null);
    }, []);

    const onTilePointerDown = useCallback((event: React.PointerEvent, id: string) => {
        event.stopPropagation();
        svgRef.current?.setPointerCapture(event.pointerId);
        if (mode === 'paint') {
            paint(id);
            pointerRef.current = paintPointer(event);
            return;
        }
        pointerRef.current = { kind: 'tile', id, startX: event.clientX, startY: event.clientY, moved: false };
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
            const id = at && tileIdAt(at);
            if (id) paint(id);
            return;
        }
        if (!pointer.moved) {
            const travelled = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
            if (travelled < DRAG_SLOP) return;
            pointer.moved = true;
        }
        // A moved press on a tile drags its centre; on the background it does
        // nothing (the container scrolls to pan).
        if (pointer.kind === 'tile' && pointer.id && mode === 'place') {
            const at = artPoint(svg, event);
            if (at) patchTile(pointer.id, { x: Math.round(at.x), y: Math.round(at.y) });
        }
    }, [mode, paint, tileIdAt, patchTile]);

    const onPointerUp = useCallback(() => {
        const pointer = pointerRef.current;
        pointerRef.current = null;
        if (!pointer || pointer.kind === 'paint' || pointer.moved) return;
        // A press that didn't travel is a click.
        if (pointer.kind === 'tile' && pointer.id) {
            if (mode === 'exits' && selectedId && pointer.id !== selectedId) {
                toggleExit(selectedId, pointer.id);
            } else if (mode === 'exits' && pointer.id === selectedId) {
                // Clicking the tile you are drawing from is the one gesture
                // spare here, and it is the one that makes its steps its own.
                togglePinnedExits(pointer.id);
            } else {
                setSelectedId(pointer.id);
            }
        } else if (pointer.kind === 'background' && mode === 'place' && pointer.at) {
            placeTile(pointer.at);
        }
    }, [mode, selectedId, toggleExit, togglePinnedExits, placeTile]);

    const autoConnect = useCallback(() => {
        setState(prev => ({ ...prev, tiles: connectByGeometry(prev) }));
    }, []);

    const loadTrack = useCallback((trackId: string) => {
        const track = TRACK_LIST.find(candidate => candidate.id === trackId);
        if (!track) return;
        setState(fromTrack(track));
        setBackdrop(null);
        setSelectedId(null);
        setActiveSectionId('');
        setMode('place');
    }, []);

    const clearAll = useCallback(() => {
        if (!window.confirm('Clear the whole editor and start a blank track?')) return;
        setState(emptyState());
        setBackdrop(null);
        setSelectedId(null);
        setActiveSectionId('');
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
            setSelectedId(null);
            setActiveSectionId('');
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

    const sectionName = activeSection ? sectionLabel(activeSection) : 'no section';

    return (
        <div className="ag-rcedit-page">
            <div className="ag-rcedit-canvas-col">
                <Section label="Canvas" count={state.tiles.length}>
                    <div className="ag-stack">
                        <div className="ag-rcedit-toolbar">
                            <button type="button" className={`ag-btn ${mode === 'place' ? 'ag-btn--dark' : 'ag-btn--light'}`} onClick={() => setMode('place')}>Place</button>
                            <button type="button" className={`ag-btn ${mode === 'exits' ? 'ag-btn--dark' : 'ag-btn--light'}`} onClick={() => setMode('exits')} disabled={!selected}>Draw exits</button>
                            <button type="button" className={`ag-btn ${mode === 'paint' ? 'ag-btn--dark' : 'ag-btn--light'}`} onClick={() => setMode('paint')}>Paint into section</button>
                            <div className="ag-rcedit-toolbar-zoom">
                                <button type="button" className="ag-btn ag-btn--light" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>−</button>
                                <span className="ag-hint">{Math.round(zoom * 100)}%</span>
                                <button type="button" className="ag-btn ag-btn--light" onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
                            </div>
                        </div>

                        <div className="ag-rcedit-toolbar">
                            <label className="ag-field-label" htmlFor="rcedit-section">Drawing into</label>
                            <select id="rcedit-section" className="ag-select" value={activeSection?.id ?? ''} onChange={e => setActiveSectionId(e.target.value)}>
                                <SectionOptions sections={state.sections} />
                            </select>
                            <label className="ag-field-label" htmlFor="rcedit-lane">Lane</label>
                            <select id="rcedit-lane" className="ag-select" value={nextLane} onChange={e => setNextLane(Number(e.target.value))}>
                                <LaneOptions lanes={activeLanes} />
                            </select>
                        </div>

                        {/* The one place the hot keys are named, rather than a
                            `title` on each control that only a hover finds. */}
                        <p className="ag-hint">
                            Keys: <strong>Q</strong> place, <strong>W</strong> draw exits, <strong>E</strong> paint —{' '}
                            <strong>1</strong>/<strong>2</strong>/<strong>3</strong> pick the lane, and{' '}
                            <strong>A</strong>/<strong>S</strong> step back and on through the sections.
                        </p>

                        <p className="ag-hint">
                            {mode === 'place'
                                ? `Click the art to drop the next tile into "${sectionName}", lane ${Math.min(nextLane, activeLanes)} — place each lane's tiles in the order the road runs. Drag a tile to nudge its centre; click one to select it.`
                                : mode === 'exits'
                                    ? (selected
                                        ? `Click a tile to add or remove a step from ${selected.id}; click ${selected.id} itself to make its steps its own, so they are written down rather than left to §5.1's rule.`
                                        : 'Select a tile first.')
                                    : `Click or drag over tiles to move them into "${sectionName}". A corner is a section, so this is how one is drawn.`}
                        </p>

                        <EditorCanvas
                            svgRef={svgRef}
                            state={state}
                            rows={rows}
                            backdropHref={backdrop ?? state.artHref}
                            zoom={zoom}
                            mode={mode}
                            activeSectionId={activeSection?.id ?? ''}
                            selectedId={selectedId}
                            onTilePointerDown={onTilePointerDown}
                            onBackgroundPointerDown={onBackgroundPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                        />

                        {/* The one place the edge colours are named. It sits
                            under the canvas rather than inside a mode's hint so
                            it reads while placing and painting too, and so a
                            fourth colour has a single line to change. */}
                        <p className="ag-hint">
                            A step&apos;s edge is coloured by where it came from: <strong>grey</strong> is §5.1&apos;s
                            default, <strong>purple</strong> was auto-connected from the geometry, and{' '}
                            <strong>terracotta</strong> is a hand-drawn override. A re-run of auto-connect redraws the
                            purple ones and leaves the terracotta ones alone.
                        </p>

                        <div className="ag-btn-row ag-btn-row--wrap">
                            <button type="button" className="ag-btn ag-btn--light" onClick={autoConnect}>Auto-connect exits from geometry</button>
                        </div>
                        <p className="ag-hint">
                            Auto-connect is for straights and gentle bends: it finds the closest tile physically ahead in
                            each of this lane and the two either side of it — so a wide road&apos;s lane change still gets
                            drawn even when it sits much farther off than staying in lane — and never skips a lane. Draw a
                            sharp corner&apos;s lane realignment by hand instead; auto-connect leaves any hand-drawn exit
                            alone. It never trusts what it drew on an earlier run either — every run reasons only from where
                            the tiles sit now, so moving tiles and running it again redraws cleanly rather than drifting
                            from a stale guess.
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
                        row={rows.get(selected.id)}
                        onPatch={patch => patchTile(selected.id, patch)}
                        onTogglePinned={() => togglePinnedExits(selected.id)}
                        onDelete={() => deleteTile(selected.id)}
                    />
                )}

                <SectionsPanel
                    state={state}
                    rows={rows}
                    activeSectionId={activeSection?.id ?? ''}
                    onSetActiveSection={setActiveSectionId}
                    onSetSections={sections => setState(prev => ({ ...prev, sections }))}
                    onSetTiles={tiles => setState(prev => ({ ...prev, tiles }))}
                />

                <ExportPanel state={state} validation={validation} />

                <p className="ag-hint ag-hint--center" title={TOOL_CHANGES}>Track editor v{TOOL_VERSION}</p>
            </div>
        </div>
    );
}

// ─── The canvas ──────────────────────────────────────────────────────────────

interface CanvasProps {
    svgRef: React.RefObject<SVGSVGElement | null>;
    state: EditorState;
    /** The derived row per tile id — empty while the drawing isn't a circuit. */
    rows: Map<string, number>;
    /** The image drawn under the tiles — the traced backdrop, else the art path. */
    backdropHref: string;
    zoom: number;
    mode: Mode;
    activeSectionId: string;
    selectedId: string | null;
    onTilePointerDown: (event: React.PointerEvent, id: string) => void;
    onBackgroundPointerDown: (event: React.PointerEvent) => void;
    onPointerMove: (event: React.PointerEvent) => void;
    onPointerUp: (event: React.PointerEvent) => void;
}

/**
 * The modifier naming where a tile's steps came from, so the canvas can colour
 * the three apart: nothing for §5.1's default, `--auto` for a set
 * auto-connect wrote from the geometry, `--override` for one an author drew.
 * The two kinds of drawn exit have to read differently because only the
 * generated ones are disposable — a re-run redraws them.
 */
function edgeOriginClass(tile: EditorTile): string {
    if (!tile.exits) return '';
    return tile.autoExits ? ' ag-rcedit-edge--auto' : ' ag-rcedit-edge--override';
}

// A plain scroll-and-zoom frame, deliberately not `BoardZoom`: that toggles
// between two zoom states on click, which would fight click-to-place. Here zoom
// is a continuous control and the container just scrolls to pan.
function EditorCanvas(props: CanvasProps) {
    const { svgRef, state, rows, backdropHref, zoom, mode, activeSectionId, selectedId, onTilePointerDown, onBackgroundPointerDown, onPointerMove, onPointerUp } = props;
    const { width, height } = state.viewBox;

    // Both lookups built once per render rather than a `.find` per exit: at 214
    // tiles the edges alone are hundreds of lookups, and a drag re-renders them
    // every frame (§23.4).
    const byId = useMemo(() => new Map(state.tiles.map(tile => [tile.id, tile])), [state.tiles]);
    const exitsById = useMemo(() => allEffectiveExits(state), [state]);
    const corners = useMemo(
        () => new Set(state.sections.filter(section => section.stops > 0).map(section => section.id)),
        [state.sections],
    );

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

                {/* Exit edges under the tiles, one colour per where the step
                    came from: faint grey dashed for §5.1's default, purple for
                    one auto-connect drew from the geometry, terracotta for a
                    hand-drawn override. An author needs to tell the last two
                    apart at a glance — a re-run redraws the purple ones and
                    leaves the terracotta ones alone. */}
                {state.tiles.map(tile => (exitsById.get(tile.id) ?? []).map(exit => {
                    const target = byId.get(exit);
                    if (!target) return null;
                    return (
                        <line
                            key={`${tile.id}->${exit}`}
                            className={`ag-rcedit-edge${edgeOriginClass(tile)}`}
                            x1={tile.x} y1={tile.y} x2={target.x} y2={target.y}
                        />
                    );
                }))}

                {state.tiles.map(tile => {
                    const isSelected = tile.id === selectedId;
                    const inCorner = corners.has(tile.section);
                    const isBrush = mode === 'paint' && tile.section === activeSectionId;
                    const isTarget = mode === 'exits' && selectedId !== null && !isSelected;
                    const className = [
                        'ag-rcedit-tile',
                        inCorner ? 'ag-rcedit-tile--corner' : '',
                        isBrush ? 'ag-rcedit-tile--brush' : '',
                        isSelected ? 'ag-rcedit-tile--selected' : '',
                        isTarget ? 'ag-rcedit-tile--target' : '',
                    ].filter(Boolean).join(' ');
                    const row = rows.get(tile.id);
                    return (
                        <g key={tile.id} onPointerDown={event => onTilePointerDown(event, tile.id)}>
                            <circle className={className} cx={tile.x} cy={tile.y} r={TILE_RADIUS} />
                            {/* The derived row, not an authored one — this is
                                where a skewed sync line shows itself. */}
                            <text className="ag-rcedit-tile-label" x={tile.x} y={tile.y - TILE_RADIUS - 2} textAnchor="middle">
                                {row === undefined ? `·:${tile.lane}` : `${row}:${tile.lane}`}
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

function SelectedTilePanel({ state, tile, row, onPatch, onTogglePinned, onDelete }: {
    state: EditorState;
    tile: EditorTile;
    row: number | undefined;
    onPatch: (patch: Partial<EditorTile>) => void;
    onTogglePinned: () => void;
    onDelete: () => void;
}) {
    const autoHeading = tileHeading(state, { ...tile, heading: undefined });
    const section = state.sections.find(candidate => candidate.id === tile.section);
    const needsOwnSteps = mustNameSteps(state, tile);
    return (
        <Section label={`Tile ${tile.id}`}>
            <div className="ag-stack">
                <div className="ag-rcedit-grid">
                    <Field label="Section">
                        <select className="ag-select" value={tile.section} onChange={e => onPatch({ section: e.target.value })}>
                            <SectionOptions sections={state.sections} />
                        </select>
                    </Field>
                    <Field label="Lane">
                        <select className="ag-select" value={tile.lane} onChange={e => onPatch({ lane: Number(e.target.value) })}>
                            <LaneOptions lanes={section?.lanes ?? 3} />
                        </select>
                    </Field>
                    <Field label="Derived row">
                        <input className="ag-input" value={row === undefined ? '—' : row} disabled />
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
                </div>

                <p className="ag-hint">
                    Steps out: {effectiveExits(state, tile).join(', ') || 'none'}
                    {tile.exits ? (tile.autoExits ? ' (auto-connected — a re-run may redraw this)' : ' (hand-drawn override)') : ' (default §5.1 rule)'}.
                    {needsOwnSteps && !tile.exits && (
                        <> This section&apos;s lanes run out of step, so §5.1&apos;s rule is refused here and this tile
                        has to name its own steps — even these ones. Make them its own to say so.</>
                    )}
                </p>

                <div className="ag-btn-row ag-btn-row--wrap">
                    <button type="button" className="ag-btn ag-btn--light" onClick={onTogglePinned}>
                        {tile.exits ? 'Hand steps back to the default rule' : 'Make these steps its own'}
                    </button>
                    <button type="button" className="ag-btn ag-btn--danger" onClick={onDelete}>Delete tile</button>
                </div>
            </div>
        </Section>
    );
}

function SectionsPanel({ state, rows, activeSectionId, onSetActiveSection, onSetSections, onSetTiles }: {
    state: EditorState;
    rows: Map<string, number>;
    activeSectionId: string;
    onSetActiveSection: (id: string) => void;
    onSetSections: (sections: EditorSection[]) => void;
    onSetTiles: (tiles: EditorTile[]) => void;
}) {
    const patch = (id: string, change: Partial<EditorSection>) => {
        onSetSections(state.sections.map(section => (section.id === id ? { ...section, ...change } : section)));
    };
    const move = (index: number, by: number) => {
        const to = index + by;
        if (to < 0 || to >= state.sections.length) return;
        const sections = [...state.sections];
        const [moved] = sections.splice(index, 1);
        sections.splice(to, 0, moved);
        onSetSections(sections);
    };
    const add = () => {
        const id = freeSectionId(state.sections);
        onSetSections([...state.sections, { id, name: '', lanes: 3, stops: 0 }]);
        onSetActiveSection(id);
    };
    const remove = (id: string) => {
        if (state.sections.length <= 1) return;
        onSetSections(state.sections.filter(section => section.id !== id));
        if (activeSectionId === id) onSetActiveSection('');
    };

    /**
     * How many of a section's tiles still fall back to §5.1's rule where that
     * rule is refused — the ones `deriveTrack` would throw on, one at a time.
     * Zero for a section whose lanes run in step, which is nearly all of them.
     */
    const unnamed = (id: string): number =>
        tilesIn(state, id).filter(tile => !tile.exits && mustNameSteps(state, tile)).length;

    /** The rows a section's tiles landed on, for the author to read its extent off. */
    const band = (id: string): string => {
        const placed = tilesIn(state, id).map(tile => rows.get(tile.id)).filter((row): row is number => row !== undefined);
        if (placed.length === 0) return 'no rows yet';
        const from = Math.min(...placed);
        const to = Math.max(...placed);
        return from === to ? `row ${from}` : `rows ${from}–${to}`;
    };

    return (
        <Section label="Sections" count={state.sections.length}>
            <div className="ag-stack">
                <p className="ag-hint">
                    The lap in the order it is driven, starting at the start/finish line. Each boundary between two sections
                    is a <strong>sync line</strong>: put one wherever the road is genuinely square across every lane, a tile
                    or two clear of a corner where the ends are skewed. Rows are derived inside each section from the steps
                    you draw, so an inside line that takes fewer tiles round a corner simply skips the rows it saved instead
                    of throwing every lane after it out of step. A <strong>corner is a section</strong> with a stop count
                    (§10) — no separate painting of bands.
                </p>

                {state.sections.map((section, index) => (
                    <div key={section.id} className={`ag-rcedit-section ag-stack${activeSectionId === section.id ? ' ag-rcedit-section--active' : ''}`}>
                        <div className="ag-rcedit-grid">
                            <Field label="Id"><input className="ag-input" value={section.id} disabled /></Field>
                            <Field label="Name">
                                <input className="ag-input" value={section.name} placeholder={section.id} onChange={e => patch(section.id, { name: e.target.value })} />
                            </Field>
                            <Field label="Lanes">
                                <select className="ag-select" value={section.lanes} onChange={e => patch(section.id, { lanes: Number(e.target.value) === 2 ? 2 : 3 })}>
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                </select>
                            </Field>
                            <Field label="Corner stops">
                                <select className="ag-select" value={section.stops} onChange={e => patch(section.id, { stops: Number(e.target.value) as 0 | 1 | 2 })}>
                                    <option value={0}>straight</option>
                                    <option value={1}>1 stop</option>
                                    <option value={2}>2 stops</option>
                                </select>
                            </Field>
                        </div>
                        <p className="ag-hint">
                            {tilesIn(state, section.id).length} tiles · {band(section.id)}
                            {unnamed(section.id) > 0 && (
                                <> · lanes out of step, so §5.1&apos;s rule is refused here and {unnamed(section.id)} tile
                                {unnamed(section.id) === 1 ? '' : 's'} still leaning on it must name their own steps.</>
                            )}
                        </p>
                        <div className="ag-btn-row ag-btn-row--wrap">
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => onSetActiveSection(section.id)}>
                                {activeSectionId === section.id ? 'Drawing into this' : 'Draw into this'}
                            </button>
                            {unnamed(section.id) > 0 && (
                                <button type="button" className="ag-btn ag-btn--dark" onClick={() => onSetTiles(withSectionStepsNamed(state, section.id))}>
                                    Name this section&apos;s steps
                                </button>
                            )}
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => move(index, -1)} disabled={index === 0}>Earlier</button>
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => move(index, 1)} disabled={index === state.sections.length - 1}>Later</button>
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => remove(section.id)} disabled={state.sections.length <= 1}>Remove</button>
                        </div>
                    </div>
                ))}

                <div className="ag-btn-row ag-btn-row--wrap">
                    <button type="button" className="ag-btn ag-btn--dark" onClick={add}>Add section</button>
                </div>
            </div>
        </Section>
    );
}

function ExportPanel({ state, validation }: { state: EditorState; validation: ReturnType<typeof validateTrack> }) {
    const [copied, setCopied] = useState(false);
    const clean = validation.errors.length === 0 && state.tiles.length > 0;
    // Only print a driveable track: `printTrackFile` runs the drawing through
    // `deriveTrack`, which throws on the very graph errors the banner above is
    // already reporting — so printing an unclean track would crash the panel.
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
