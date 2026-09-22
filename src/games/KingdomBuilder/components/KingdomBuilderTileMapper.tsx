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
import { useStoredValue } from "@/utils/hooks/useStoredValue";
import {
    cellToIndex,
    gridFit,
    indexToCell,
    mask16Remaining,
    maskFromSides,
    printTilesetDeclarations,
    suggestedTileSizes,
    type DraftTileArt,
} from "../tileMapperModel";
import type { SheetDefinition, TileRef } from "../tileset";

const STORAGE_KEY = "ag-kingdombuilder-tile-mapper";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const DISPLAY_WIDTH = 640;

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

function parseDraft(stored: string | null): Draft {
    if (!stored) return DEFAULT_DRAFT;
    try {
        return { ...DEFAULT_DRAFT, ...JSON.parse(stored) };
    } catch {
        return DEFAULT_DRAFT;
    }
}

/** An entry's own currently-declared layout, if it has any tiles assigned yet — so switching entries doesn't forget which layout it was using. */
function layoutOf(art: DraftTileArt | undefined): Layout | null {
    return art?.layout ?? null;
}

/** A mask16 entry's slots stay real holes (`undefined`) until each one is actually clicked — `mask16Remaining`'s "N left" count, and the guard the export panel warns about, both depend on an unclicked mask never quietly reading as done. */
function withTileAssigned(art: DraftTileArt | undefined, layout: Layout, ref: TileRef, role: string): DraftTileArt {
    if (layout === "mask16") {
        const mask = Number(role);
        const tiles = art?.layout === "mask16" ? [...art.tiles] : new Array<TileRef | undefined>(16).fill(undefined);
        tiles[mask] = ref;
        return { layout: "mask16", tiles };
    }
    if (layout === "orientation") {
        const tiles = art?.layout === "orientation" ? { ...art.tiles } : {};
        return { layout: "orientation", tiles: { ...tiles, [role]: ref } };
    }
    if (layout === "single") return { layout: "single", tile: ref };
    const tiles = art?.layout === "variants" ? [...art.tiles] : [];
    return { layout: "variants", tiles: [...tiles, ref] };
}

const SIDES = [
    { key: "north" as const, bit: 1, label: "North" },
    { key: "east" as const, bit: 2, label: "East" },
    { key: "south" as const, bit: 4, label: "South" },
    { key: "west" as const, bit: 8, label: "West" },
];

export default function KingdomBuilderTileMapper() {
    const [stored, setStored] = useStoredValue(STORAGE_KEY);
    const draft = useMemo(() => parseDraft(stored), [stored]);
    const setDraft = (next: Draft | ((current: Draft) => Draft)) => {
        setStored(JSON.stringify(typeof next === "function" ? next(draft) : next));
    };

    const [imageError, setImageError] = useState<string | null>(null);
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
    const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
    const imageUrl = uploadedUrl ?? draft.artPath;

    const [entryKind, setEntryKind] = useState<EntryKind>("area");
    const [entryCode, setEntryCode] = useState<string>("");
    const [layout, setLayout] = useState<Layout>("mask16");
    const [maskSideState, setMaskSideState] = useState({ north: true, east: true, south: true, west: true });
    const [orientationKey, setOrientationKey] = useState("ns");
    const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

    const fileRef = useRef<HTMLInputElement>(null);

    const fit = naturalSize ? gridFit(naturalSize.width, naturalSize.height, draft) : null;
    const suggestions = naturalSize ? suggestedTileSizes(naturalSize.width, naturalSize.height, draft.margin, draft.spacing) : [];

    const artByKind = entryKind === "area" ? draft.areaArt : draft.overlayArt;
    const currentArt = entryCode ? artByKind[entryCode] : undefined;
    const activeLayout = layoutOf(currentArt) ?? layout;

    const onFileChosen = (file: File | undefined) => {
        if (!file) return;
        if (file.size > MAX_IMAGE_BYTES) {
            setImageError("That file is bigger than this screen will load — save it under public/art first.");
            return;
        }
        setUploadedUrl(URL.createObjectURL(file));
        setImageError(null);
    };

    const assignTile = (index: number) => {
        if (!entryCode) return;
        const ref: TileRef = { sheet: draft.sheetName, index };
        const role = activeLayout === "mask16" ? String(maskFromSides(maskSideState)) : activeLayout === "orientation" ? orientationKey.trim() : "";
        if (activeLayout === "orientation" && !role) return;
        setDraft(current => {
            const art = entryKind === "area" ? current.areaArt[entryCode] : current.overlayArt[entryCode];
            const nextArt = withTileAssigned(art, activeLayout, ref, role);
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

    // Every tile index already assigned to *any* entry on this sheet, for the
    // grid overlay's own "already used" mark — a role can be reassigned, but
    // it should never look like a blank square once something has claimed it.
    const assignedIndices = useMemo(() => {
        const map = new Map<number, string>();
        const record = (byCode: Record<string, DraftTileArt>) => {
            for (const [code, art] of Object.entries(byCode)) {
                const refs = art.layout === "single" ? [art.tile] : art.layout === "orientation" ? Object.values(art.tiles) : art.tiles;
                for (const ref of refs) if (ref && ref.sheet === draft.sheetName) map.set(ref.index, code);
            }
        };
        record(draft.areaArt);
        record(draft.overlayArt);
        return map;
    }, [draft.areaArt, draft.overlayArt, draft.sheetName]);

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

    // A big sheet shrinks to fit the column; a small one (a first sheet is
    // often a handful of 16px tiles) is scaled *up* instead, capped well
    // short of turning individual pixels into unclickable postage stamps —
    // clicking a precise square matters more here than a 1:1 preview.
    const scale = naturalSize ? Math.min(4, DISPLAY_WIDTH / naturalSize.width) : 1;

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
                        <select className="ag-select" value={entryKind} onChange={event => { setEntryKind(event.target.value as EntryKind); setEntryCode(""); }}>
                            <option value="area">Area</option>
                            <option value="overlay">Overlay</option>
                        </select>
                    </label>
                    <label className="ag-editor-field">
                        <span className="ag-field-label">Registry entry</span>
                        <select className="ag-select" value={entryCode} onChange={event => setEntryCode(event.target.value)}>
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
                            <option value="orientation">orientation — by direction</option>
                            <option value="variants">variants — a handful, seeded</option>
                            <option value="single">single — one tile</option>
                        </select>
                    </label>
                </div>

                {activeLayout === "mask16" && (
                    <div className="ag-btn-row ag-btn-row--wrap">
                        {SIDES.map(side => (
                            <label key={side.key} className="ag-editor-field ag-editor-field--inline">
                                <input type="checkbox" checked={maskSideState[side.key]} onChange={event => setMaskSideState({ ...maskSideState, [side.key]: event.target.checked })} />
                                <span className="ag-field-label">{side.label} matches</span>
                            </label>
                        ))}
                        <span className="ag-tag">mask {maskFromSides(maskSideState)}</span>
                        {currentArt?.layout === "mask16" && <span className="ag-tag">{mask16Remaining(currentArt.tiles)} of 16 left</span>}
                    </div>
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

                {entryCode && (
                    <p className="ag-hint">Click a square below to assign it to <strong>{entryCode}</strong>{activeLayout === "mask16" ? ` — mask ${maskFromSides(maskSideState)}` : ""}.</p>
                )}
                {!entryCode && <p className="ag-hint">Choose a registry entry above before clicking the sheet.</p>}
            </Section>

            <Section label="Sheet preview">
                {naturalSize && fit ? (
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
                                assignTile(cellToIndex(col, row, fit.columns));
                            }}
                        >
                            {Array.from({ length: fit.columns * fit.rows }, (_, index) => {
                                const { col, row } = indexToCell(index, fit.columns);
                                const x = draft.margin + col * (draft.tileWidth + draft.spacing);
                                const y = draft.margin + row * (draft.tileHeight + draft.spacing);
                                const owner = assignedIndices.get(index);
                                return (
                                    <g key={index}>
                                        <rect x={x} y={y} width={draft.tileWidth} height={draft.tileHeight} fill={owner ? "rgba(90,180,110,0.35)" : "transparent"} stroke="rgba(0,0,0,0.35)" strokeWidth={0.5} />
                                        {owner && <text x={x + draft.tileWidth / 2} y={y + draft.tileHeight / 2} fontSize={Math.max(6, draft.tileWidth / 4)} textAnchor="middle" dominantBaseline="central" fill="#1a1a1a">{owner}</text>}
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="" onLoad={event => { setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setImageError(null); }} onError={() => setImageError("Couldn't load that path — check it's under public/, or upload the file directly.")} style={{ display: "none" }} />
                )}
            </Section>

            <Section label="Export">
                <p className="ag-hint">Paste this over the <code>TILESET</code>, <code>AREA_ART</code> and <code>OVERLAY_ART</code> declarations in <code>src/games/KingdomBuilder/tileset.ts</code>, then run <code>npm test</code> — the guard checks every sheet exists, every index is in bounds, and every mask16 entry declares all sixteen.</p>
                <pre className="ag-editor-section ag-editor-code">{printed}</pre>
                <div className="ag-btn-row ag-btn-row--wrap">
                    <button type="button" className="ag-btn ag-btn--primary" onClick={copyToClipboard}>{copyState === "copied" ? "Copied!" : "Copy to clipboard"}</button>
                    <button type="button" className="ag-btn ag-btn--ghost" onClick={() => setDraft(DEFAULT_DRAFT)}>Clear draft</button>
                </div>
            </Section>
        </>
    );
}
