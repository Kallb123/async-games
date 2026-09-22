'use client'

import { use, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import BoardZoom from "@/components/ui/BoardZoom";
import ClickableMapNode from "@/components/ui/ClickableMapNode";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";
import MapEdges from "@/components/ui/MapEdges";
import MapLabelLayer from "@/components/ui/MapLabelLayer";
import Section from "@/components/ui/Section";
import Skeleton from "@/components/ui/Skeleton";
import type { KingdomBuilderWorldView } from "@/games/KingdomBuilder";
import { useTerrainImage } from "@/games/KingdomBuilder/useTerrainImage";
import { AREAS, type SettlementNode, type TerrainNode } from "@/games/KingdomBuilder/worldgen";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useJsonMutation } from "@/utils/hooks/useJsonMutation";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { GAME_META } from "@/utils/ui/games";
import { worldBuildsStorageKey } from "@/games/KingdomBuilder/worldSummaryTypes";
import { writeStoredValue } from "@/utils/hooks/useStoredValue";

import styles from "./page.module.css";

const TERRAIN_MARKS = { forest: "♣", quarry: "◆", ore: "●" } as const;
// Smaller than World Domination or Outbreak's own node radii because Kingdom
// Builder's world is a much tighter 100×70 viewBox for many more nodes — the
// original sizes overlapped each other and read as an oversized graph.
const TERRAIN_RADIUS = 1.15;
// A settlement's own filled circle sits on top of the composited ground
// (PR 11's tileset art), not a flat silhouette, so it has to stay small
// enough that its own tile's art still reads underneath the marker — a
// square of the field is TERRAIN_FIELD_TILE_SIZE (2 world units) across, and
// this is deliberately smaller than that rather than the 1.6 that used to
// spill a filled disc a tile and a half wide over every neighbour's art.
const SETTLEMENT_RADIUS = 0.85;

function landPath(view: KingdomBuilderWorldView): string {
    const { resolution, width, height, values, landThreshold } = view.landmass;
    const cellWidth = width / resolution;
    const cellHeight = height / resolution;
    return values.map((value, index) => {
        if (value < landThreshold) return "";
        const x = index % resolution * cellWidth;
        const y = Math.floor(index / resolution) * cellHeight;
        return `M${x} ${y}h${cellWidth}v${cellHeight}h-${cellWidth}z`;
    }).join("");
}

export default function KingdomBuilderWorldPage({ params }: { params: Promise<{ worldId: string }> }) {
    const { worldId } = use(params);
    useAuthGuard();
    const router = useRouter();
    const endpoint = `/api/kingdombuilder/${worldId}`;
    const { data, setData, isLoading, status } = useRefreshableData<KingdomBuilderWorldView>(endpoint, []);
    const terrain = useTerrainImage(data ?? {});
    const [selectedSite, setSelectedSite] = useState<string | null>(null);
    const { submit, isPending: founding, message } = useJsonMutation<KingdomBuilderWorldView>(endpoint, "That site could not be claimed.");

    useEffect(() => {
        if (data) writeStoredValue(worldBuildsStorageKey(worldId), String(data.completedBuildLevels));
    }, [data, worldId]);

    const map = useMemo(() => {
        if (!data) return null;
        const indexById = new Map(data.nodes.map((node, index) => [node.id, index]));
        return {
            path: landPath(data),
            edgeNodes: data.nodes.map(node => ({ name: node.id, x: node.x, y: node.y })),
            edges: data.edges.flatMap(edge => {
                const from = indexById.get(edge.from);
                const to = indexById.get(edge.to);
                return from === undefined || to === undefined ? [] : [[from, to] as [number, number]];
            }),
        };
    }, [data]);

    const found = async () => {
        if (!selectedSite) return;
        const body = await submit({ siteId: selectedSite });
        if (body) {
            setData(body);
            setSelectedSite(null);
        }
    };

    const unavailable = status === 404;
    const occupiedByNode = new Map(data?.settlements.map(settlement => [settlement.nodeId, settlement]) ?? []);
    const openSites = data?.nodes.filter((node): node is SettlementNode => node.kind === "settlement" && node.siteType === "expansion" && !occupiedByNode.has(node.id)) ?? [];
    const mySettlements = data?.settlements.filter(settlement => settlement.isMine) ?? [];

    return (
        <main>
            <GameIdentityHeader backHref="/" backLabel="Back to my games" meta={GAME_META.kingdombuilder} title="Kingdom Builder" subtitle="World map" />
            {unavailable ? <Section><div className="ag-empty">This world is not available to you.</div></Section> : <>
                <Section label="World" isLoading={isLoading} action={data && <span className="ag-tag">Tick {data.currentTick}</span>}>
                    {isLoading ? <Skeleton width="100%" height={320} radius={14} /> : data && map && (
                        <>
                            <p className={styles.hint}>Tap one of your castles to open it, or choose a ringed site for your next settlement.</p>
                            <div className="ag-board-frame">
                                <BoardZoom zoomWidth={240} maxWidth={360}>
                                    <svg className={styles.map} viewBox={`0 0 ${data.landmass.width} ${data.landmass.height}`} role="img" aria-label="Kingdom Builder world map">
                                        {terrain.href
                                            ? <image href={terrain.href} x={0} y={0} width={data.landmass.width} height={data.landmass.height} className={styles.ground} />
                                            : <path className={styles.land} d={map.path} />}
                                        <MapEdges nodes={map.edgeNodes} edges={map.edges} width={data.landmass.width} strokeOpacity={0.28} />
                                        {data.nodes.filter((node): node is TerrainNode => node.kind === "terrain").map(node => (
                                            <g key={node.id}>
                                                <circle className={`${styles.terrain} ${styles[node.terrain]}`} cx={node.x} cy={node.y} r={TERRAIN_RADIUS} />
                                                <text className={styles.keep} x={node.x} y={node.y}>{TERRAIN_MARKS[node.terrain]}</text>
                                            </g>
                                        ))}
                                        {data.nodes.filter((node): node is SettlementNode => node.kind === "settlement").map(node => {
                                            const settlement = occupiedByNode.get(node.id);
                                            const isMine = settlement?.isMine ?? false;
                                            const isOpen = node.siteType === "expansion" && !settlement;
                                            return <ClickableMapNode key={node.id} x={node.x} y={node.y} radius={SETTLEMENT_RADIUS} isValid={isOpen || isMine} isSelected={selectedSite === node.id}
                                                onClick={isMine ? () => router.push(`/kingdombuilder/${worldId}/${settlement?.settlementId}`) : isOpen ? () => setSelectedSite(node.id) : undefined}
                                                title={isMine ? "Your settlement" : settlement ? "Claimed settlement" : isOpen ? "Open settlement site" : "Starting site"}>
                                                <circle className={`${styles.site} ${isMine ? styles.mine : settlement ? styles.occupied : ""}`} cx={node.x} cy={node.y} r={SETTLEMENT_RADIUS} />
                                                {settlement && <text className={styles.keep} x={node.x} y={node.y}>♜</text>}
                                            </ClickableMapNode>;
                                        })}
                                        <MapLabelLayer width={data.landmass.width} height={data.landmass.height} offset={3} fontSize={1.8}
                                            labels={data.nodes.filter((node): node is SettlementNode => node.kind === "settlement").map(node => ({
                                                key: node.id, x: node.x, y: node.y, radius: SETTLEMENT_RADIUS,
                                                text: occupiedByNode.get(node.id)?.isMine ? "Your town" : occupiedByNode.has(node.id) ? "Claimed" : node.siteType === "expansion" ? "Open site" : "Start",
                                            }))} />
                                    </svg>
                                </BoardZoom>
                            </div>
                            <div className={styles.legend} aria-label="Map legend">
                                <span className={styles.legendMine}>Your settlement</span><span className={styles.legendOpen}>Open site</span>
                                <span className={styles.legendTaken}>Claimed</span><span className={styles.legendTerrain}>Resource terrain</span>
                            </div>
                            {terrain.href && (
                                <div className={styles.legend} aria-label="Ground legend">
                                    {AREAS.map(area => (
                                        <span key={area.code} className={styles.legendGround} style={{ "--legend-colour": area.fallbackColour } as CSSProperties}>{area.name}</span>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </Section>
                <Section label="Your settlements" isLoading={isLoading}>
                    <div className="ag-build-list">
                        {mySettlements.map((settlement, index) => (
                            <button className="ag-btn ag-btn--light ag-btn--block" type="button" key={settlement.settlementId}
                                onClick={() => router.push(`/kingdombuilder/${worldId}/${settlement.settlementId}`)}>
                                Open settlement {index + 1}
                            </button>
                        ))}
                    </div>
                    {selectedSite && <div className="ag-btn-row">
                        <button type="button" className="ag-btn ag-btn--ghost" onClick={() => setSelectedSite(null)}>Cancel</button>
                        <button type="button" className="ag-btn ag-btn--primary" disabled={founding} onClick={found}>{founding ? "Founding…" : "Found here"}</button>
                    </div>}
                    {!selectedSite && openSites.length > 0 && <p className={styles.hint}>Choose a ringed open site on the map to expand your kingdom.</p>}
                    {openSites.length === 0 && data && <div className="ag-empty">Every expansion site has been claimed.</div>}
                    {message && <div className="ag-callout" role="alert">{message}</div>}
                </Section>
            </>}
        </main>
    );
}
