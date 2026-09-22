'use client'

import { use, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import BoardZoom from "@/components/ui/BoardZoom";
import ClickableMapNode from "@/components/ui/ClickableMapNode";
import Avatar from "@/components/ui/Avatar";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";
import JoinCodeCard from "@/components/ui/JoinCodeCard";
import ListRow from "@/components/ui/ListRow";
import ListSection from "@/components/ui/ListSection";
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
import { playerColour } from "@/utils/ui/playerColours";
import { worldBuildsStorageKey } from "@/games/KingdomBuilder/worldSummaryTypes";
import { writeStoredValue } from "@/utils/hooks/useStoredValue";

import styles from "./page.module.css";

const TERRAIN_MARKS = { forest: "♣", quarry: "◆", ore: "●" } as const;
// Smaller than World Domination or Outbreak's own node radii because Kingdom
// Builder's world packs many more nodes into its viewBox (200×140 for a new
// world, 100×70 for one generated before it grew) — the original sizes
// overlapped each other and read as an oversized graph.
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

/** The name under a settlement site: whose town it is, or what is still free there. */
function settlementLabel(settlement: KingdomBuilderWorldView["settlements"][number] | undefined, node: SettlementNode, ownerName: (seat: number) => string): string {
    if (settlement) return settlement.isMine ? "Your town" : ownerName(settlement.seat);
    return node.siteType === "expansion" ? "Open site" : "Start";
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
    // The zoom steps were tuned on a 100-unit-wide world; a wider one needs
    // proportionally deeper steps to put its pieces at the same size on screen.
    const zoomWidth = 240 * Math.max(1, (data?.landmass.width ?? 100) / 100);
    const occupiedByNode = new Map(data?.settlements.map(settlement => [settlement.nodeId, settlement]) ?? []);
    const openSites = data?.nodes.filter((node): node is SettlementNode => node.kind === "settlement" && node.siteType === "expansion" && !occupiedByNode.has(node.id)) ?? [];
    const mySettlements = data?.settlements.filter(settlement => settlement.isMine) ?? [];
    const players = data?.players ?? [];
    const ownerName = (seat: number) => players[seat]?.name ?? "Another player";

    return (
        <main>
            <GameIdentityHeader backHref="/" backLabel="Back to my games" meta={GAME_META.kingdombuilder} title="Kingdom Builder" subtitle="World map" />
            {unavailable ? <Section><div className="ag-empty">This world is not available to you.</div></Section> : <>
                <Section label="World" isLoading={isLoading} action={data && <span className="ag-tag">Tick {data.currentTick}</span>}>
                    {isLoading ? <Skeleton width="100%" height={320} radius={14} /> : data && map && (
                        <>
                            <p className={styles.hint}>Tap one of your castles to open it, or an &quot;Open site&quot; to start your next settlement.</p>
                            <div className="ag-board-frame">
                                <BoardZoom zoomWidth={zoomWidth} maxWidth={zoomWidth * 1.5}>
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
                                            const isSelected = selectedSite === node.id;
                                            // No ring: ClickableMapNode's default ring offset is sized for World
                                            // Domination's/Outbreak's much bigger nodes, and at this board's tight
                                            // scale it dwarfed the map on a site-dense world. What a site is —
                                            // "Open site", "Your town", "Claimed" — is already the label under it;
                                            // "selected" is the one state a label can't say, so it gets its own
                                            // fill on the site's own dot instead (see .selected).
                                            return <ClickableMapNode key={node.id} x={node.x} y={node.y} radius={SETTLEMENT_RADIUS} isValid={isOpen || isMine} isSelected={isSelected} showRing={false}
                                                onClick={isMine ? () => router.push(`/kingdombuilder/${worldId}/${settlement?.settlementId}`) : isOpen ? () => setSelectedSite(node.id) : undefined}
                                                title={isMine ? "Your settlement" : settlement ? `${ownerName(settlement.seat)}'s settlement` : isOpen ? "Open settlement site" : "Free starting site"}>
                                                {/* Every settlement wears its owner's seat colour — the same one their row in "Players" is ringed in — so who holds what reads straight off the map. */}
                                                <circle className={`${styles.site} ${isSelected ? styles.selected : ""}`} cx={node.x} cy={node.y} r={SETTLEMENT_RADIUS}
                                                    style={settlement && !isSelected ? { fill: playerColour(settlement.seat) } : undefined} />
                                                {settlement && <text className={styles.keep} x={node.x} y={node.y}>♜</text>}
                                            </ClickableMapNode>;
                                        })}
                                        {/* MapLabel's own default strokeWidth (3) is tuned for boards that
                                            draw at fontSize 9+ (Outbreak, Train Time) — at this board's fontSize
                                            of 1.8 it outweighed the glyphs themselves, so every label's outline
                                            merged into one dark blob with stray points poking out of it wherever
                                            a letter's own shape ran furthest (an unmistakable "t" or "y" read as
                                            a tail pointing nowhere in particular). Scaled down to match. */}
                                        <MapLabelLayer width={data.landmass.width} height={data.landmass.height} offset={3} fontSize={1.8} strokeWidth={0.4}
                                            labels={data.nodes.filter((node): node is SettlementNode => node.kind === "settlement").map(node => ({
                                                key: node.id, x: node.x, y: node.y, radius: SETTLEMENT_RADIUS,
                                                text: settlementLabel(occupiedByNode.get(node.id), node, ownerName),
                                            }))} />
                                    </svg>
                                </BoardZoom>
                            </div>
                            <div className={styles.legend} aria-label="Map legend">
                                <span className={styles.legendOpen}>Open site</span><span className={styles.legendTerrain}>Resource terrain</span>
                                {players.map(player => (
                                    <span key={player.seat} style={{ "--legend-colour": playerColour(player.seat) } as CSSProperties}>{player.isMe ? "You" : player.name}</span>
                                ))}
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
                {data?.invite && (
                    <JoinCodeCard joinCode={data.invite.joinCode} gameFriendlyName={GAME_META.kingdombuilder.name} expiresAt={data.invite.expiresAt}
                        expiryConsequence="the open seats close" />
                )}
                <ListSection label={data ? `Players · ${players.length}/${data.seatCount}` : "Players"} isLoading={isLoading} skeletonRows={2}>
                    {players.map(player => (
                        <ListRow key={player.seat}
                            icon={<Avatar name={player.name} imageUrl={player.imageUrl} size={34} ring={playerColour(player.seat)} />}
                            title={player.isMe ? `${player.name} (you)` : player.name}
                            sub={player.isHost ? "Opened this world" : "Joined"} />
                    ))}
                </ListSection>
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
                    {!selectedSite && openSites.length > 0 && <p className={styles.hint}>Choose an &quot;Open site&quot; on the map to expand your kingdom.</p>}
                    {openSites.length === 0 && data && <div className="ag-empty">Every expansion site has been claimed.</div>}
                    {message && <div className="ag-callout" role="alert">{message}</div>}
                </Section>
            </>}
        </main>
    );
}
