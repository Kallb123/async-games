'use client'

// The tileset mapper (GDD §3.5.5, docs/admin-tools.md): authors `tileset.ts`
// by clicking squares on a loaded sheet rather than counting pixels in an
// image viewer. Modelled on the Race Cars track editor
// (RaceCarsTrackEditor.tsx) — a build-time authoring aid behind `AdminPage`'s
// client-only gate, persisting nothing server-side. Its own work in progress
// autosaves to this browser's storage the same way the track editor's does,
// so a reload doesn't lose an afternoon of clicking; the loaded sheet image
// itself is not part of that save (a multi-megabyte data URI would blow the
// quota), so a page reload keeps every assignment but re-loads the picture
// from its path or asks for the file again.
//
// All the grid maths and the printed file live in tileMapperModel.ts as pure
// functions; this component owns the pointer handling and the panels.

import { useMemo, useRef, useState } from "react";

import Section from "@/components/ui/Section";
import { AREAS } from "@/games/KingdomBuilder/worldgen/areas";
import { OVERLAYS } from "@/games/KingdomBuilder/worldgen/overlays";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useStoredValue } from "@/utils/hooks/useStoredValue";
import { MAX_LOCAL_IMAGE_BYTES } from "@/utils/ui/editorLimits";
import {
    diagonalApplies,
    draftTileRefsOf,
    entriesUsingSheet,
    gridFit,
    interiorMaskSlot,
    isDraftMaskArt,
    mask16FromNineSlice,
    mask8FromSides,
    maskFromSides,
    maskPreviewFill,
    maskRemaining,
    maskSlotVariantCount,
    normalizeDraftArt,
    previewRefOf,
    previewScale,
    printTilesetDeclarations,
    suggestedTileSizes,
    withMaskSlotAssigned,
    type DiagonalName,
    type DraftTileArt,
    type MaskPreviewFill,
    type NeighbourSides,
} from "../tileMapperModel";
import { AREA_ART, blobIndexOf, cellToIndex, indexToCell, isMaskLayout, MASK_LAYOUT_SIZES, OVERLAY_ART, sheetColumns, sheetSourceRect, singleSquareReason, TILESET, tilePieceParts, tileRefSize, type MaskLayout, type SheetDefinition, type TileRef } from "../tileset";

const STORAGE_KEY = "ag-kingdombuilder-tile-mapper";
const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

type EntryKind = "area" | "overlay";
type Layout = DraftTileArt["layout"];

interface Draft {
    sheetName: string;
    artPath: string;
    tileWidth: number;
    tileHeight: number;
    margin: number;
    spacing: number;
    sheets: Record<string, SheetDefinition>;
    areaArt: Record<string, DraftTileArt>;
    overlayArt: Record<string, DraftTileArt>;
}

const DEFAULT_DRAFT: Draft = {
    sheetName: "ground",
    artPath: "/art/kingdombuilder/ground-basic.png",
    tileWidth: 32,
    tileHeight: 32,
    margin: 0,
    spacing: 0,
    sheets: {},
    areaArt: {},
    overlayArt: {},
};

/** A registry's worth of draft art, `normalizeDraftArt`'d one entry at a time — `parseDraft`'s own fix for what the JSON round trip does to a mask entry's holes. */
function normalizeDraftArtMap(art: Record<string, DraftTileArt>): Record<string, DraftTileArt> {
    return Object.fromEntries(Object.entries(art).map(([code, entry]) => [code, normalizeDraftArt(entry)]));
}

function parseDraft(stored: string | null): Draft {
    if (!stored) return DEFAULT_DRAFT;
    try {
        const parsed: Draft = { ...DEFAULT_DRAFT, ...JSON.parse(stored) };
        return { ...parsed, areaArt: normalizeDraftArtMap(parsed.areaArt), overlayArt: normalizeDraftArtMap(parsed.overlayArt) };
    } catch {
        return DEFAULT_DRAFT;
    }
}

/** An entry's own currently-declared layout, if it has any tiles assigned yet — so switching entries doesn't forget which layout it was using. */
function layoutOf(art: DraftTileArt | undefined): Layout | null {
    return art?.layout ?? null;
}

/**
 * A mask entry's slots stay real holes (`undefined`) until each one is
 * actually clicked — `maskRemaining`'s "N left" count, and the guard the
 * export panel warns about, both depend on an unclicked slot never quietly
 * reading as done. `appendVariant` folds the click into whatever the slot
 * already holds instead of overwriting it — see `withMaskSlotAssigned`.
 */
function withTileAssigned(art: DraftTileArt | undefined, layout: Layout, ref: TileRef, role: string, appendVariant: boolean): DraftTileArt {
    if (isMaskLayout(layout)) {
        const slot = Number(role);
        const tiles = art && isDraftMaskArt(art) && art.layout === layout ? art.tiles : new Array(MASK_LAYOUT_SIZES[layout]).fill(undefined);
        return { layout, tiles: withMaskSlotAssigned(tiles, slot, ref, appendVariant) };
    }
    if (layout === "orientation") {
        const tiles = art?.layout === "orientation" ? { ...art.tiles } : {};
        return { layout: "orientation", tiles: { ...tiles, [role]: ref } };
    }
    if (layout === "single") return { layout: "single", tile: ref };
    const tiles = art?.layout === "variants" ? [...art.tiles] : [];
    return { layout: "variants", tiles: [...tiles, ref] };
}

/** The neighbours a mask role is entered from: the four sides every mask layout asks about, then the four diagonals only `mask47` does. One list, so a row of checkboxes is written once. */
const NEIGHBOURS: readonly { key: keyof NeighbourSides; label: string; diagonal: boolean }[] = [
    { key: "north", label: "North", diagonal: false },
    { key: "east", label: "East", diagonal: false },
    { key: "south", label: "South", diagonal: false },
    { key: "west", label: "West", diagonal: false },
    { key: "northEast", label: "NE", diagonal: true },
    { key: "southEast", label: "SE", diagonal: true },
    { key: "southWest", label: "SW", diagonal: true },
    { key: "northWest", label: "NW", diagonal: true },
];

/** Every neighbour matching: the fully-interior tile, which is where a mask entry is most naturally started. */
const ALL_NEIGHBOURS_MATCH: NeighbourSides = { north: true, northEast: true, east: true, southEast: true, south: true, southWest: true, west: true, northWest: true };

/** The "3×3 preview"'s nine cells in row-major reading order, the centre a sentinel rather than a ninth `NeighbourSides` key. */
const MASK_PREVIEW_CELLS: readonly (keyof NeighbourSides | "centre")[] = ["northWest", "north", "northEast", "west", "centre", "east", "southWest", "south", "southEast"];

/** A piece bigger than one square, as the panel holds it while it's being typed. One square is the default, and the anchor defaults to the bottom-left the same way a printed ref's does. */
interface PieceDraft {
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
}

const ONE_SQUARE: PieceDraft = { width: 1, height: 1, anchorX: 0, anchorY: 0 };

function clampToPiece(value: number, extent: number): number {
    return Math.min(extent - 1, Math.max(0, Math.floor(value) || 0));
}

/** Resizing a piece drags its anchor back inside it, so narrowing a 3-wide piece to 1 can't leave the anchor pointing at a column that no longer exists. */
function resizedPiece(piece: PieceDraft, width: number, height: number): PieceDraft {
    return { width, height, anchorX: clampToPiece(piece.anchorX, width), anchorY: clampToPiece(piece.anchorY, height) };
}

/** Folds the piece panel's numbers into a ref, leaving a one-square piece as the bare `{ sheet, index }` every existing entry already is. */
function withPiece(ref: TileRef, piece: PieceDraft, allowed: boolean): TileRef {
    if (!allowed || (piece.width <= 1 && piece.height <= 1)) return ref;
    return { ...ref, width: piece.width, height: piece.height, anchorX: piece.anchorX, anchorY: piece.anchorY };
}

export default function KingdomBuilderTileMapper() {
    const [stored, setStored] = useStoredValue(STORAGE_KEY);
    const draft = useMemo(() => parseDraft(stored), [stored]);
    const setDraft = (next: Draft | ((current: Draft) => Draft)) => {
        setStored(JSON.stringify(typeof next === "function" ? next(draft) : next));
    };

    const [imageError, setImageError] = useState<string | null>(null);
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
    const imageUrl = uploadedUrl ?? draft.artPath;
    // Keyed on the image it was taken from. The measuring `<img>` below only
    // renders while this is null, so holding it in plain `useState` meant it
    // was measured once — from whatever sheet happened to load first — and
    // never again: load a 192×336 sheet after the default 128×128 one and the
    // frame stayed 128×128, stretching the new sheet into a square and drawing
    // a 4×4 grid over it. `useResettingState` drops it the moment the source
    // changes, which puts the measuring `<img>` back on screen for the new one.
    const [naturalSize, setNaturalSize] = useResettingState<{ width: number; height: number } | null>(null, imageUrl);

    const [entryKind, setEntryKind] = useState<EntryKind>("area");
    const [entryCode, setEntryCode] = useState<string>("");
    const [layout, setLayout] = useState<Layout>("mask16");
    const [maskSideState, setMaskSideState] = useState<NeighbourSides>(ALL_NEIGHBOURS_MATCH);
    const [orientationKey, setOrientationKey] = useState("ns");
    const [piece, setPiece] = useState<PieceDraft>(ONE_SQUARE);
    // A nine-slice import claims sixteen slots from one click rather than one,
    // so it is a mode you turn on deliberately and which turns itself off
    // again after the click that used it.
    const [nineSliceArmed, setNineSliceArmed] = useState(false);
    // A mask slot's second (and third, …) tile — folding a click into what
    // the slot already holds instead of replacing it, the same way ticking
    // this on and clicking several squares builds up a `variants` area's list.
    const [addVariant, setAddVariant] = useState(false);
    const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
    const [zoom, setZoom] = useState(1);
    const [loadSheetChoice, setLoadSheetChoice] = useState("");

    const fileRef = useRef<HTMLInputElement>(null);

    const fit = naturalSize ? gridFit(naturalSize.width, naturalSize.height, draft) : null;
    const suggestions = naturalSize ? suggestedTileSizes(naturalSize.width, naturalSize.height, draft.margin, draft.spacing) : [];

    const artByKind = entryKind === "area" ? draft.areaArt : draft.overlayArt;
    const currentArt = entryCode ? artByKind[entryCode] : undefined;
    const activeLayout = layoutOf(currentArt) ?? layout;

    const onFileChosen = (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_LOCAL_IMAGE_BYTES) {
            setImageError("That file is bigger than this screen will load — save it under public/art first.");
            return;
        }
        setUploadedUrl(current => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(file);
        });
        setImageError(null);
    };

    // Committed sheets, for "pick up where tileset.ts left off" rather than
    // clicking an already-shipped entry back in from scratch.
    const committedSheetNames = Object.keys(TILESET.sheets);

    const loadExistingSheet = (name: string) => {
        const sheetDef = TILESET.sheets[name];
        if (!sheetDef) return;
        setUploadedUrl(current => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
        setDraft(current => ({
            ...current,
            sheetName: name,
            artPath: sheetDef.path,
            tileWidth: sheetDef.tileWidth,
            tileHeight: sheetDef.tileHeight,
            margin: sheetDef.margin,
            spacing: sheetDef.spacing,
            sheets: { ...current.sheets, [name]: sheetDef },
            // Replaces whatever the draft already held for these codes with
            // tileset.ts's own — "load" means "match the file", not "merge
            // with whatever I'd half-clicked before".
            areaArt: { ...current.areaArt, ...entriesUsingSheet(AREA_ART, name) },
            overlayArt: { ...current.overlayArt, ...entriesUsingSheet(OVERLAY_ART, name) },
        }));
        setImageError(null);
        setLoadSheetChoice("");
    };

    // Asked of the same function the guard rejects a piece with, so the panel
    // can't come to offer something the test would refuse.
    const piecesAllowed = singleSquareReason(entryKind, activeLayout) === null;
    // One 47-slot derivation, read by the role tag, the hint and `assignTile`.
    const maskSlot = blobIndexOf(mask8FromSides(maskSideState));
    // Whichever of the two the active layout actually is — read by `assignTile` and the variant toggle alike, so they can't drift onto different slots from the same checkboxes.
    const activeMaskSlot = activeLayout === "mask16" ? maskFromSides(maskSideState) : maskSlot;
    const activeMaskSlotTiles = currentArt && isDraftMaskArt(currentArt) && currentArt.layout === activeLayout ? currentArt.tiles : undefined;
    const activeMaskSlotVariantCount = maskSlotVariantCount(activeMaskSlotTiles?.[activeMaskSlot]);

    // The sheet this tile's own fields describe, for the preview below — the
    // same shape `updateArt` folds into `draft.sheets` on the next click, read
    // here straight off the form so the preview doesn't wait for a click to
    // catch up with a size the author just changed.
    const currentSheetDef: SheetDefinition = { path: draft.artPath, tileWidth: draft.tileWidth, tileHeight: draft.tileHeight, margin: draft.margin, spacing: draft.spacing };
    // The preview only ever has one sheet's image loaded (`imageUrl`), so a ref
    // an earlier session assigned against a sheet since swapped out can't be
    // cropped from it — shown the same as "nothing clicked here yet" rather
    // than a broken image.
    const resolvePreviewTile = (tile: TileRef | undefined): TileRef | undefined => (tile && tile.sheet === draft.sheetName ? tile : undefined);

    /**
     * Writes the picked entry's art back into the draft, given whatever it was
     * before — the one path both a single click and a nine-slice import take,
     * so the "which of the two art maps, and refresh this sheet's definition"
     * bookkeeping is written once.
     */
    const updateArt = (nextArtFrom: (previous: DraftTileArt | undefined) => DraftTileArt) => {
        setDraft(current => {
            const nextArt = nextArtFrom(entryKind === "area" ? current.areaArt[entryCode] : current.overlayArt[entryCode]);
            return {
                ...current,
                areaArt: entryKind === "area" ? { ...current.areaArt, [entryCode]: nextArt } : current.areaArt,
                overlayArt: entryKind === "overlay" ? { ...current.overlayArt, [entryCode]: nextArt } : current.overlayArt,
                // Keeps this sheet's own definition current in the printed
                // manifest, so "copy tileset.ts" reflects whatever size,
                // margin and spacing this tile was actually cut with.
                sheets: { ...current.sheets, [current.sheetName]: { path: current.artPath, tileWidth: current.tileWidth, tileHeight: current.tileHeight, margin: current.margin, spacing: current.spacing } },
            };
        });
    };

    const assignTile = (index: number) => {
        if (!entryCode) return;
        const ref = withPiece({ sheet: draft.sheetName, index }, piece, piecesAllowed);
        const role =
            isMaskLayout(activeLayout) ? String(activeMaskSlot) :
            activeLayout === "orientation" ? orientationKey.trim() : "";
        if (activeLayout === "orientation" && !role) return;
        updateArt(previous => withTileAssigned(previous, activeLayout, ref, role, isMaskLayout(activeLayout) && addVariant));
    };

    /**
     * Fills all sixteen masks from the 3×3 block whose top-left square was
     * clicked — the shape most hand-drawn tilesheets actually come in, where
     * clicking sixteen times would mean entering the same nine squares over
     * and over and hand-aliasing the seven a nine-slice never drew.
     */
    const importNineSlice = (index: number) => {
        if (!entryCode || !fit) return;
        const tiles = mask16FromNineSlice(draft.sheetName, index, fit.columns, fit.rows);
        if (!tiles) {
            setImageError("A 3×3 block starting there would run off the sheet — click the block's top-left square, at least three squares in from the right and bottom edges.");
            return;
        }
        setImageError(null);
        setNineSliceArmed(false);
        updateArt(() => ({ layout: "mask16", tiles }));
    };

    // Every tile index already assigned to *any* entry on this sheet, for the
    // grid overlay's own "already used" mark — a role can be reassigned, but
    // it should never look like a blank square once something has claimed it.
    const assignedIndices = useMemo(() => {
        const map = new Map<number, string>();
        const record = (byCode: Record<string, DraftTileArt>) => {
            for (const [code, art] of Object.entries(byCode)) {
                for (const ref of draftTileRefsOf(art)) {
                    if (ref.sheet !== draft.sheetName) continue;
                    // A piece claims every square it covers, so the preview
                    // marks the whole rectangle rather than only its corner.
                    for (const part of tilePieceParts(ref, Math.max(1, fit?.columns ?? 1))) map.set(part.index, code);
                }
            }
        };
        record(draft.areaArt);
        record(draft.overlayArt);
        return map;
    }, [draft.areaArt, draft.overlayArt, draft.sheetName, fit?.columns]);

    const printed = useMemo(() => printTilesetDeclarations(draft.sheets, draft.areaArt, draft.overlayArt), [draft.sheets, draft.areaArt, draft.overlayArt]);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(printed);
            setCopyState("copied");
            setTimeout(() => setCopyState("idle"), 1500);
        } catch {
            // Clipboard access can be refused (no permission, insecure context);
            // the code block underneath is still there to select and copy by hand.
        }
    };

    // A small sheet (a first sheet is often a handful of 16px tiles) is scaled
    // *up* to fill the column; a big one is left at 1:1 and scrolls inside its
    // frame rather than being shrunk until its squares can't be clicked
    // accurately. `previewScale` has the reasoning and the test.
    const scale = naturalSize ? previewScale(naturalSize.width, zoom) : 1;

    return (
        <>
            <Section label="Sheet">
                <div className="ag-editor-grid">
                    <label className="ag-editor-field">
                        <span className="ag-field-label">Sheet name</span>
                        <input className="ag-input" value={draft.sheetName} onChange={event => setDraft({ ...draft, sheetName: event.target.value })} />
                    </label>
                    <label className="ag-editor-field">
                        <span className="ag-field-label">Art path (under public/)</span>
                        <input className="ag-input" value={draft.artPath} onChange={event => { setDraft({ ...draft, artPath: event.target.value }); setUploadedUrl(null); }} placeholder="/art/kingdombuilder/ground-basic.png" autoComplete="off" />
                    </label>
                </div>
                <div className="ag-btn-row ag-btn-row--wrap">
                    <label className="ag-btn ag-btn--light">
                        Upload sheet from disk
                        <input ref={fileRef} type="file" accept="image/png" hidden onChange={event => onFileChosen(event.target.files?.[0])} />
                    </label>
                    {uploadedUrl && <span className="ag-tag">Previewing an uploaded file — save it under public/art before committing</span>}
                </div>
                {imageError && <div className="ag-callout" role="alert">{imageError}</div>}
                {committedSheetNames.length > 0 && (
                    <>
                        <div className="ag-btn-row ag-btn-row--wrap">
                            <label className="ag-editor-field">
                                <span className="ag-field-label">Or load a sheet already in tileset.ts</span>
                                <select className="ag-select" value={loadSheetChoice} onChange={event => setLoadSheetChoice(event.target.value)}>
                                    <option value="">Choose one…</option>
                                    {committedSheetNames.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </label>
                            <button type="button" className="ag-btn ag-btn--light" disabled={!loadSheetChoice} onClick={() => loadExistingSheet(loadSheetChoice)}>Load sheet &amp; its mappings</button>
                        </div>
                        <p className="ag-hint">Pulls in that sheet&apos;s own size, margin and spacing, and every area or overlay whose art already points at it — replacing whatever the draft currently holds for those, so you pick up where <code>tileset.ts</code> left off rather than re-clicking it in.</p>
                    </>
                )}
            </Section>

            <Section label="Tile size">
                <div className="ag-editor-grid">
                    <label className="ag-editor-field"><span className="ag-field-label">Width (px)</span><input className="ag-input" type="number" min={1} value={draft.tileWidth} onChange={event => setDraft({ ...draft, tileWidth: Number(event.target.value) || 1 })} /></label>
                    <label className="ag-editor-field"><span className="ag-field-label">Height (px)</span><input className="ag-input" type="number" min={1} value={draft.tileHeight} onChange={event => setDraft({ ...draft, tileHeight: Number(event.target.value) || 1 })} /></label>
                    <label className="ag-editor-field"><span className="ag-field-label">Margin (px)</span><input className="ag-input" type="number" min={0} value={draft.margin} onChange={event => setDraft({ ...draft, margin: Number(event.target.value) || 0 })} /></label>
                    <label className="ag-editor-field"><span className="ag-field-label">Spacing (px)</span><input className="ag-input" type="number" min={0} value={draft.spacing} onChange={event => setDraft({ ...draft, spacing: Number(event.target.value) || 0 })} /></label>
                </div>
                {suggestions.length > 0 && (
                    <div className="ag-btn-row ag-btn-row--wrap">
                        {suggestions.map(size => (
                            <button key={size} type="button" className="ag-pill-action" onClick={() => setDraft({ ...draft, tileWidth: size, tileHeight: size })}>{size}px</button>
                        ))}
                    </div>
                )}
                {fit && (fit.leftoverX > 0 || fit.leftoverY > 0) && (
                    <div className="ag-callout" role="alert">
                        This size leaves {fit.leftoverX}px unaccounted for across and {fit.leftoverY}px down — the classic sign of a margin or spacing this sheet has that isn&apos;t declared yet.
                    </div>
                )}
                {fit && <p className="ag-hint">{fit.columns} × {fit.rows} tiles.</p>}
            </Section>

            <Section label="Assign squares">
                <div className="ag-editor-grid">
                    <label className="ag-editor-field">
                        <span className="ag-field-label">Kind</span>
                        <select className="ag-select" value={entryKind} onChange={event => { setEntryKind(event.target.value as EntryKind); setEntryCode(""); setAddVariant(false); }}>
                            <option value="area">Area</option>
                            <option value="overlay">Overlay</option>
                        </select>
                    </label>
                    <label className="ag-editor-field">
                        <span className="ag-field-label">Registry entry</span>
                        <select className="ag-select" value={entryCode} onChange={event => { setEntryCode(event.target.value); setAddVariant(false); }}>
                            <option value="">Choose one…</option>
                            {(entryKind === "area" ? AREAS : OVERLAYS).map(entry => (
                                <option key={entry.code} value={entry.code}>{entry.name} ({entry.code})</option>
                            ))}
                        </select>
                    </label>
                    <label className="ag-editor-field">
                        <span className="ag-field-label">Layout</span>
                        <select className="ag-select" value={activeLayout} onChange={event => setLayout(event.target.value as Layout)} disabled={layoutOf(currentArt) !== null}>
                            <option value="mask16">mask16 — sixteen, by neighbour</option>
                            <option value="mask47">mask47 — forty-seven, with inner corners</option>
                            <option value="orientation">orientation — by direction</option>
                            <option value="variants">variants — a handful, seeded</option>
                            <option value="single">single — one tile</option>
                        </select>
                    </label>
                </div>

                {isMaskLayout(activeLayout) && (
                    <>
                        <div className="ag-btn-row ag-btn-row--wrap">
                            {NEIGHBOURS.filter(neighbour => !neighbour.diagonal || activeLayout === "mask47").map(neighbour => {
                                // A diagonal only changes the picture where both the sides beside it match, so the ones that can't are disabled rather than silently ignored — otherwise two different tickings would enter the same slot.
                                const applies = !neighbour.diagonal || diagonalApplies(maskSideState, neighbour.key as DiagonalName);
                                return (
                                    <label key={neighbour.key} className="ag-editor-field ag-editor-field--inline">
                                        <input type="checkbox" disabled={!applies} checked={applies && maskSideState[neighbour.key]} onChange={event => setMaskSideState({ ...maskSideState, [neighbour.key]: event.target.checked })} />
                                        <span className="ag-field-label">{neighbour.label} matches</span>
                                    </label>
                                );
                            })}
                            <span className="ag-tag">
                                {activeLayout === "mask16" ? `mask ${maskFromSides(maskSideState)}` : `slot ${maskSlot} of 47`}
                            </span>
                            {currentArt && isDraftMaskArt(currentArt) && <span className="ag-tag">{maskRemaining(currentArt.layout, currentArt.tiles)} of {MASK_LAYOUT_SIZES[currentArt.layout]} left</span>}
                        </div>
                        {activeMaskSlotVariantCount > 0 && (
                            <div className="ag-btn-row ag-btn-row--wrap">
                                <label className="ag-editor-field ag-editor-field--inline">
                                    <input type="checkbox" checked={addVariant} onChange={event => setAddVariant(event.target.checked)} />
                                    <span className="ag-field-label">Add as another variant for this slot instead of replacing it</span>
                                </label>
                                <span className="ag-hint">
                                    {activeMaskSlotVariantCount} tile{activeMaskSlotVariantCount === 1 ? "" : "s"} for this slot so far{activeMaskSlotVariantCount > 1 ? " — one is picked per square of map, stably" : ""}.
                                    {" "}Handy for the fully-interior slot of a big filled area (mask 15), where one tile repeating reads as an obvious tile rather than a texture.
                                </span>
                            </div>
                        )}
                        {activeLayout === "mask16" && (
                            <div className="ag-btn-row ag-btn-row--wrap">
                                <button type="button" className={nineSliceArmed ? "ag-btn ag-btn--primary" : "ag-btn ag-btn--light"} onClick={() => setNineSliceArmed(!nineSliceArmed)} disabled={!entryCode}>
                                    {nineSliceArmed ? "Click the block's top-left square…" : "Import a 3×3 nine-slice"}
                                </button>
                                <span className="ag-hint">Fills all sixteen from one 3×3 block: nine come from the block, the seven a nine-slice never draws are aliased onto the closest it has.</span>
                            </div>
                        )}
                    </>
                )}
                {activeLayout === "orientation" && (
                    <label className="ag-editor-field">
                        <span className="ag-field-label">Orientation key — whatever the placement&apos;s own `orientation` string will be, e.g. &quot;ns&quot;</span>
                        <input className="ag-input" value={orientationKey} onChange={event => setOrientationKey(event.target.value)} />
                    </label>
                )}
                {activeLayout === "variants" && currentArt?.layout === "variants" && (
                    <p className="ag-hint">{currentArt.tiles.length} variant(s) so far — click another square to add one.</p>
                )}

                {piecesAllowed && (
                    <>
                        <div className="ag-editor-grid">
                            <label className="ag-editor-field"><span className="ag-field-label">Piece width (squares)</span><input className="ag-input" type="number" min={1} value={piece.width} onChange={event => setPiece(resizedPiece(piece, Math.max(1, Number(event.target.value) || 1), piece.height))} /></label>
                            <label className="ag-editor-field"><span className="ag-field-label">Piece height (squares)</span><input className="ag-input" type="number" min={1} value={piece.height} onChange={event => setPiece(resizedPiece(piece, piece.width, Math.max(1, Number(event.target.value) || 1)))} /></label>
                            {/* Clamped as it's typed rather than on the way out: an anchor outside its own piece is something the guard rejects, and the mapper shouldn't be able to print one in the first place. */}
                            <label className="ag-editor-field"><span className="ag-field-label">Anchor across</span><input className="ag-input" type="number" min={0} max={piece.width - 1} value={piece.anchorX} onChange={event => setPiece({ ...piece, anchorX: clampToPiece(Number(event.target.value), piece.width) })} /></label>
                            <label className="ag-editor-field"><span className="ag-field-label">Anchor down</span><input className="ag-input" type="number" min={0} max={piece.height - 1} value={piece.anchorY} onChange={event => setPiece({ ...piece, anchorY: clampToPiece(Number(event.target.value), piece.height) })} /></label>
                        </div>
                        <p className="ag-hint">
                            A piece taller or wider than one square is anchored on the square it&apos;s placed on — a church stands on its doorstep and rises over the ground behind it. Leave the anchor at the bottom-left (0, {Math.max(0, piece.height - 1)}) unless the art wants otherwise, and click the piece&apos;s <strong>top-left</strong> square on the sheet.
                        </p>
                    </>
                )}

                {entryCode && (
                    <p className="ag-hint">
                        {nineSliceArmed
                            ? <>Click the <strong>top-left</strong> square of a 3×3 block to fill all sixteen of <strong>{entryCode}</strong>&apos;s masks from it.</>
                            : <>Click a square below to {isMaskLayout(activeLayout) && addVariant ? "add another variant to" : "assign it to"} <strong>{entryCode}</strong>{isMaskLayout(activeLayout) ? ` — ${activeLayout === "mask16" ? "mask" : "slot"} ${activeMaskSlot}` : ""}.</>}
                    </p>
                )}
                {!entryCode && <p className="ag-hint">Choose a registry entry above before clicking the sheet.</p>}
            </Section>

            <Section label="Sheet preview">
                {naturalSize && (
                    <div className="ag-editor-toolbar">
                        <span className="ag-hint">{naturalSize.width} × {naturalSize.height}px{fit ? ` — ${fit.columns} × ${fit.rows} squares` : ""}</span>
                        <div className="ag-editor-zoom">
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => setZoom(current => Math.max(MIN_ZOOM, current - ZOOM_STEP))} aria-label="Zoom out">−</button>
                            <span className="ag-hint">{Math.round(scale * 100)}%</span>
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => setZoom(current => Math.min(MAX_ZOOM, current + ZOOM_STEP))} aria-label="Zoom in">+</button>
                        </div>
                    </div>
                )}
                {naturalSize && fit ? (
                    // The sheet and its overlay scroll inside a fixed frame:
                    // a dozen squares across and twenty down is an ordinary
                    // sheet, and at a size its squares can actually be clicked
                    // that is taller than the screen.
                    <div className="ag-editor-canvas">
                    <div style={{ position: "relative", width: naturalSize.width * scale, height: naturalSize.height * scale }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a build-time authoring aid loading an arbitrary local path or uploaded file, not the app's own served art */}
                        <img src={imageUrl} alt="Tile sheet" style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block" }} />
                        <svg
                            viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: entryCode ? "pointer" : "default" }}
                            onClick={event => {
                                if (!entryCode) return;
                                const rect = event.currentTarget.getBoundingClientRect();
                                const x = ((event.clientX - rect.left) / rect.width) * naturalSize.width;
                                const y = ((event.clientY - rect.top) / rect.height) * naturalSize.height;
                                const col = Math.floor((x - draft.margin) / (draft.tileWidth + draft.spacing));
                                const row = Math.floor((y - draft.margin) / (draft.tileHeight + draft.spacing));
                                if (col < 0 || row < 0 || col >= fit.columns || row >= fit.rows) return;
                                const index = cellToIndex(col, row, fit.columns);
                                if (nineSliceArmed) importNineSlice(index); else assignTile(index);
                            }}
                        >
                            {Array.from({ length: fit.columns * fit.rows }, (_, index) => {
                                const { col, row } = indexToCell(index, fit.columns);
                                const x = draft.margin + col * (draft.tileWidth + draft.spacing);
                                const y = draft.margin + row * (draft.tileHeight + draft.spacing);
                                const owner = assignedIndices.get(index);
                                return (
                                    <g key={index}>
                                        <rect className={`ag-tilemap-cell ${owner ? "ag-tilemap-cell--assigned" : ""}`} x={x} y={y} width={draft.tileWidth} height={draft.tileHeight} />
                                        {owner && <text className="ag-tilemap-cell-label" x={x + draft.tileWidth / 2} y={y + draft.tileHeight / 2} fontSize={Math.max(6, draft.tileWidth / 4)} textAnchor="middle" dominantBaseline="central">{owner}</text>}
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                    </div>
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="" onLoad={event => { setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setImageError(null); }} onError={() => setImageError("Couldn't load that path — check it's under public/, or upload the file directly.")} style={{ display: "none" }} />
                )}
            </Section>

            <Section label="Preview">
                {!entryCode ? (
                    <p className="ag-hint">Choose a registry entry above to preview it.</p>
                ) : !naturalSize || !fit ? (
                    <p className="ag-hint">Load a sheet above to preview this entry.</p>
                ) : isMaskLayout(activeLayout) ? (
                    <>
                        <MaskNeighbourhoodPreview
                            layout={activeLayout}
                            sides={maskSideState}
                            centreTile={resolvePreviewTile(previewRefOf(activeMaskSlotTiles?.[activeMaskSlot]))}
                            interiorTile={resolvePreviewTile(previewRefOf(activeMaskSlotTiles?.[interiorMaskSlot(activeLayout)]))}
                            sheet={currentSheetDef}
                            imageUrl={imageUrl}
                            naturalSize={naturalSize}
                        />
                        <p className="ag-hint">
                            The centre square is whatever {activeLayout === "mask16" ? "mask" : "slot"} {activeMaskSlot} holds so far. The sides mirror the checkboxes above — hatched wherever that neighbour differs from this entry
                            {activeLayout === "mask47" ? ", and blank on a corner a diagonal can't change" : ""}; {activeLayout === "mask16" ? "the four corners are always left blank, since a mask16 tile is never picked by them. " : ""}
                            A dashed square is a slot nothing&apos;s been clicked onto yet.
                        </p>
                    </>
                ) : (
                    <NonMaskArtPreview art={currentArt} sheet={currentSheetDef} sheetName={draft.sheetName} imageUrl={imageUrl} naturalSize={naturalSize} />
                )}
            </Section>

            <Section label="Export">
                <p className="ag-hint">Paste this over the <code>TILESET</code>, <code>AREA_ART</code> and <code>OVERLAY_ART</code> declarations in <code>src/games/KingdomBuilder/tileset.ts</code>, then run <code>npm test</code> — the guard checks every sheet exists, every piece lands wholly inside its sheet, every mask entry declares all its slots (sixteen, or forty-seven), no area or mask entry declares a piece, and no anchor sits outside its own piece.</p>
                <pre className="ag-editor-section ag-editor-code">{printed}</pre>
                <div className="ag-btn-row ag-btn-row--wrap">
                    <button type="button" className="ag-btn ag-btn--primary" onClick={copyToClipboard}>{copyState === "copied" ? "Copied!" : "Copy to clipboard"}</button>
                    <button type="button" className="ag-btn ag-btn--ghost" onClick={() => setDraft(DEFAULT_DRAFT)}>Clear draft</button>
                </div>
            </Section>
        </>
    );
}

// ─── The preview ─────────────────────────────────────────────────────────────
//
// docs/admin-tools.md's "check your work" step: real cropped squares of the
// loaded sheet, not a description of them, so a mismatched border reads as a
// mismatch before it's ever pasted into tileset.ts. `SpriteSquare` crops one
// sheet square the same way the click handler above turns a click into an
// index — a nested `<svg>` whose own `viewBox` is the crop rectangle, with the
// full sheet image placed at the negative of its corner, is the same trick as
// `MapEdges`' off-board stubs: the parent element clips to its viewBox, so
// only the square inside it ever draws. `MaskNeighbourhoodPreview` is the
// mask16/mask47 "3×3 preview"; `NonMaskArtPreview` is the plainer one for
// orientation/variants/single, a strip of one tile per declared role.

const PREVIEW_TILE_PX = 48;

function SpriteSquare({ imageUrl, naturalSize, sheet, index, size }: { imageUrl: string; naturalSize: { width: number; height: number }; sheet: SheetDefinition; index: number; size: number }) {
    const { sx, sy, sw, sh } = sheetSourceRect(sheet, naturalSize.width, index);
    return (
        <svg width={size} height={size} viewBox={`0 0 ${sw} ${sh}`} style={{ display: "block" }}>
            <image href={imageUrl} x={-sx} y={-sy} width={naturalSize.width} height={naturalSize.height} style={{ imageRendering: "pixelated" }} />
        </svg>
    );
}

/** A (possibly multi-square) piece, laid out from its own top-left corner — the art it shows, not where a placement's anchor would stand it on the map. */
function PreviewPiece({ tile, sheet, imageUrl, naturalSize }: { tile: TileRef; sheet: SheetDefinition; imageUrl: string; naturalSize: { width: number; height: number } }) {
    const { width, height } = tileRefSize(tile);
    const columns = Math.max(1, sheetColumns(sheet, naturalSize.width));
    const origin = indexToCell(tile.index, columns);
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${width}, ${PREVIEW_TILE_PX}px)` }}>
            {Array.from({ length: width * height }, (_, i) => {
                const index = cellToIndex(origin.col + (i % width), origin.row + Math.floor(i / width), columns);
                return <SpriteSquare key={i} imageUrl={imageUrl} naturalSize={naturalSize} sheet={sheet} index={index} size={PREVIEW_TILE_PX} />;
            })}
        </div>
    );
}

/** One cell of the 3×3 preview: a real sprite where there's a tile to crop, a hatch or a blank where the checkboxes say there isn't one to show, and a dashed "?" for a slot nothing's been clicked onto yet. */
function PreviewCell({ kind, tile, sheet, imageUrl, naturalSize }: { kind: MaskPreviewFill | "centre"; tile: TileRef | undefined; sheet: SheetDefinition; imageUrl: string; naturalSize: { width: number; height: number } }) {
    const empty = !tile && (kind === "match" || kind === "centre");
    const className = ["ag-tile-preview-cell", kind === "centre" && "ag-tile-preview-cell--centre", kind === "differ" && "ag-tile-preview-cell--differ", kind === "irrelevant" && "ag-tile-preview-cell--irrelevant", empty && "ag-tile-preview-cell--empty"]
        .filter(Boolean)
        .join(" ");
    return <div className={className}>{tile ? <SpriteSquare imageUrl={imageUrl} naturalSize={naturalSize} sheet={sheet} index={tile.index} size={PREVIEW_TILE_PX} /> : empty ? "?" : null}</div>;
}

/** The mask16/mask47 preview: the entry's own neighbourhood, from the same checkboxes `assignTile` reads the active slot from. */
function MaskNeighbourhoodPreview({ layout, sides, centreTile, interiorTile, sheet, imageUrl, naturalSize }: {
    layout: MaskLayout;
    sides: NeighbourSides;
    centreTile: TileRef | undefined;
    interiorTile: TileRef | undefined;
    sheet: SheetDefinition;
    imageUrl: string;
    naturalSize: { width: number; height: number };
}) {
    const fill = maskPreviewFill(layout, sides);
    return (
        <div className="ag-tile-preview-grid">
            {MASK_PREVIEW_CELLS.map(cell => {
                if (cell === "centre") return <PreviewCell key="centre" kind="centre" tile={centreTile} sheet={sheet} imageUrl={imageUrl} naturalSize={naturalSize} />;
                const kind = fill[cell];
                return <PreviewCell key={cell} kind={kind} tile={kind === "match" ? interiorTile : undefined} sheet={sheet} imageUrl={imageUrl} naturalSize={naturalSize} />;
            })}
        </div>
    );
}

/** One labelled tile of an orientation/variants/single preview strip. A tile on a sheet this screen doesn't currently have loaded can't be cropped — shown the same as "nothing assigned" rather than a broken image. */
function PreviewStripItem({ label, tile, sheet, sheetName, imageUrl, naturalSize }: {
    label: string;
    tile: TileRef;
    sheet: SheetDefinition;
    sheetName: string;
    imageUrl: string;
    naturalSize: { width: number; height: number };
}) {
    return (
        <div className="ag-tile-preview-strip-item">
            {tile.sheet === sheetName ? <PreviewPiece tile={tile} sheet={sheet} imageUrl={imageUrl} naturalSize={naturalSize} /> : <div className="ag-tile-preview-cell ag-tile-preview-cell--empty">?</div>}
            <span className="ag-hint">{label}</span>
        </div>
    );
}

function NonMaskArtPreview({ art, sheet, sheetName, imageUrl, naturalSize }: {
    art: DraftTileArt | undefined;
    sheet: SheetDefinition;
    sheetName: string;
    imageUrl: string;
    naturalSize: { width: number; height: number };
}) {
    if (!art) return <p className="ag-hint">Nothing assigned to this entry yet.</p>;
    if (art.layout === "single") return <div className="ag-tile-preview-strip"><PreviewStripItem label="tile" tile={art.tile} sheet={sheet} sheetName={sheetName} imageUrl={imageUrl} naturalSize={naturalSize} /></div>;
    if (art.layout === "variants") {
        return (
            <div className="ag-tile-preview-strip">
                {art.tiles.map((tile, index) => <PreviewStripItem key={index} label={`#${index + 1}`} tile={tile} sheet={sheet} sheetName={sheetName} imageUrl={imageUrl} naturalSize={naturalSize} />)}
            </div>
        );
    }
    if (art.layout === "orientation") {
        return (
            <div className="ag-tile-preview-strip">
                {Object.entries(art.tiles).map(([key, tile]) => <PreviewStripItem key={key} label={key} tile={tile} sheet={sheet} sheetName={sheetName} imageUrl={imageUrl} naturalSize={naturalSize} />)}
            </div>
        );
    }
    return null; // mask layouts are MaskNeighbourhoodPreview's, not this one's.
}
