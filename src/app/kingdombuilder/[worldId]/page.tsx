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
import { paceOf, routeBetween, ticksToArrive } from "@/games/KingdomBuilder/armies";
import ArmiesSection, { type MarchDraft, type MarchPreview } from "@/games/KingdomBuilder/components/ArmiesSection";
import BattlesSection from "@/games/KingdomBuilder/components/BattlesSection";
import ArmyLayer from "@/games/KingdomBuilder/components/ArmyLayer";
import FogLayer from "@/games/KingdomBuilder/components/FogLayer";
import SiegesSection from "@/games/KingdomBuilder/components/SiegesSection";
import SightingsSection from "@/games/KingdomBuilder/components/SightingsSection";
import WorldExitSection from "@/games/KingdomBuilder/components/WorldExitSection";
import { useTerrainImage } from "@/games/KingdomBuilder/useTerrainImage";
import { AREAS, tileIndexCentre, travelGridFor, type SettlementNode, type TerrainNode } from "@/games/KingdomBuilder/worldgen";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useJsonMutation } from "@/utils/hooks/useJsonMutation";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { GAME_META } from "@/utils/ui/games";
import { playerColour } from "@/utils/ui/playerColours";
import { worldBuildsStorageKey } from "@/games/KingdomBuilder/worldSummaryTypes";
import { writeStoredValue } from "@/utils/hooks/useStoredValue";

import styles from "./page.module.css";

const TERRAIN = {
    forest: { mark: "♣", name: "Forest" },
    quarry: { mark: "◆", name: "Quarry" },
    ore: { mark: "●", name: "Ore" },
} as const;
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
    // An army being sent (§6.2): while one is drafted, a tap on the map picks where it goes.
    const [march, setMarch] = useState<MarchDraft | null>(null);

    useEffect(() => {
        if (data) writeStoredValue(worldBuildsStorageKey(worldId), String(data.completedBuildLevels));
    }, [data, worldId]);

    const map = useMemo(() => {
        if (!data) return null;
        const indexById = new Map(data.nodes.map((node, index) => [node.id, index]));
        const field = data.terrainField;
        const drawn = data.edges.flatMap(edge => {
            const from = indexById.get(edge.from);
            const to = indexById.get(edge.to);
            return from === undefined || to === undefined ? [] : [{ pair: [from, to] as [number, number], edge }];
        });
        return {
            path: landPath(data),
            edgeNodes: data.nodes.map(node => ({ name: node.id, x: node.x, y: node.y })),
            edges: drawn.map(({ pair }) => pair),
            // Each route drawn along the tiles it takes (§3.8) — its two ends are the nodes themselves.
            waypoints: drawn.map(({ edge }) => (field && edge.path ? edge.path.slice(1, -1).map(tile => tileIndexCentre(field, tile)) : undefined)),
        };
    }, [data]);

    // The same pathfinder and pace the server uses, so the ETA shown is the one the tick keeps.
    const grid = useMemo(() => (data?.terrainField ? travelGridFor(data.terrainField, data.overlays) : null), [data]);
    const marchRoute = useMemo(() => {
        if (!data || !grid || !march?.targetNodeId) return undefined;
        const tileOf = (nodeId: string) => data.nodes.find(node => node.id === nodeId)?.tile;
        const army = "armyId" in march ? data.armies.find(entry => entry.armyId === march.armyId) : undefined;
        const from = army ? army.tile : "settlementId" in march ? tileOf(data.settlements.find(settlement => settlement.settlementId === march.settlementId)?.nodeId ?? "") : undefined;
        const to = tileOf(march.targetNodeId);
        const units = "units" in march ? march.units : army?.units;
        if (from === undefined || to === undefined || !units) return undefined;
        const route = routeBetween(grid, from, to);
        return { route, ticks: route ? ticksToArrive({ ...route, travelled: 0 }, paceOf(units) ?? 1) : 0 };
    }, [data, grid, march]);
    const preview: MarchPreview = !marchRoute ? null : marchRoute.route ? { ticks: Math.max(1, marchRoute.ticks) } : "no-route";
    const startMarch = (draft: MarchDraft | null) => {
        setSelectedSite(null);
        setMarch(draft);
    };
    const marchTo = (nodeId: string) => march && setMarch({ ...march, targetNodeId: nodeId });

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
    const myColour = playerColour(players.find(player => player.isMe)?.seat ?? 0);
    const marchOrigin = march && "settlementId" in march ? data?.settlements.find(settlement => settlement.settlementId === march.settlementId)?.nodeId : undefined;
    const placeName = (nodeId: string) => {
        const node = data?.nodes.find(entry => entry.id === nodeId);
        if (!node) return "somewhere";
        return node.kind === "terrain" ? TERRAIN[node.terrain].name : settlementLabel(occupiedByNode.get(node.id), node, ownerName);
    };

    return (
        <main>
            <GameIdentityHeader backHref="/" backLabel="Back to my games" meta={GAME_META.kingdombuilder} title="Kingdom Builder" subtitle="World map" />
            {unavailable ? <Section><div className="ag-empty">This world is not available to you.</div></Section> : <>
                <Section label="World" isLoading={isLoading} action={data && <span className="ag-tag">Tick {data.currentTick}</span>}>
                    {isLoading ? <Skeleton width="100%" height={320} radius={14} /> : data && map && (
                        <>
                            <p className={styles.hint}>{march
                                ? "Tap anywhere on the map to send the army there."
                                : <>Tap one of your castles to open it, or an &quot;Open site&quot; to start your next settlement.</>}</p>
                            <div className="ag-board-frame">
                                <BoardZoom zoomWidth={zoomWidth} maxWidth={zoomWidth * 1.5}>
                                    <svg className={styles.map} viewBox={`0 0 ${data.landmass.width} ${data.landmass.height}`} role="img" aria-label="Kingdom Builder world map">
                                        {terrain.href
                                            ? <image href={terrain.href} x={0} y={0} width={data.landmass.width} height={data.landmass.height} className={styles.ground} />
                                            : <path className={styles.land} d={map.path} />}
                                        <MapEdges nodes={map.edgeNodes} edges={map.edges} waypoints={map.waypoints} width={data.landmass.width} strokeOpacity={0.28} />
                                        {data.terrainField && players.length > 1 && <FogLayer field={data.terrainField} width={data.landmass.width} height={data.landmass.height} sight={data.sight} />}
                                        {data.nodes.filter((node): node is TerrainNode => node.kind === "terrain").map(node => (
                                            <ClickableMapNode key={node.id} x={node.x} y={node.y} radius={TERRAIN_RADIUS} isValid={!!march} isSelected={march?.targetNodeId === node.id} showRing={false}
                                                onClick={() => marchTo(node.id)} title={TERRAIN[node.terrain].name}>
                                                <circle className={`${styles.terrain} ${styles[node.terrain]} ${march?.targetNodeId === node.id ? styles.selected : ""}`} cx={node.x} cy={node.y} r={TERRAIN_RADIUS} />
                                                <text className={styles.keep} x={node.x} y={node.y}>{TERRAIN[node.terrain].mark}</text>
                                            </ClickableMapNode>
                                        ))}
                                        {data.nodes.filter((node): node is SettlementNode => node.kind === "settlement").map(node => {
                                            const settlement = occupiedByNode.get(node.id);
                                            const isMine = settlement?.isMine ?? false;
                                            const isOpen = node.siteType === "expansion" && !settlement;
                                            const isTarget = !!march && node.id !== marchOrigin;
                                            const isSelected = march ? march.targetNodeId === node.id : selectedSite === node.id;
                                            // No ring: ClickableMapNode's default ring offset is sized for World
                                            // Domination's/Outbreak's much bigger nodes, and at this board's tight
                                            // scale it dwarfed the map on a site-dense world. What a site is —
                                            // "Open site", "Your town", "Claimed" — is already the label under it;
                                            // "selected" is the one state a label can't say, so it gets its own
                                            // fill on the site's own dot instead (see .selected).
                                            return <ClickableMapNode key={node.id} x={node.x} y={node.y} radius={SETTLEMENT_RADIUS} isValid={march ? isTarget : isOpen || isMine} isSelected={isSelected} showRing={false}
                                                onClick={march ? () => isTarget && marchTo(node.id)
                                                    : isMine ? () => router.push(`/kingdombuilder/${worldId}/${settlement?.settlementId}`) : isOpen ? () => setSelectedSite(node.id) : undefined}
                                                title={isMine ? "Your settlement" : settlement ? `${ownerName(settlement.seat)}'s settlement` : isOpen ? "Open settlement site" : "Free starting site"}>
                                                {/* Every settlement wears its owner's seat colour — the same one their row in "Players" is ringed in — so who holds what reads straight off the map. */}
                                                <circle className={`${styles.site} ${isSelected ? styles.selected : ""}`} cx={node.x} cy={node.y} r={SETTLEMENT_RADIUS}
                                                    style={settlement && !isSelected ? { fill: playerColour(settlement.seat) } : undefined} />
                                                {settlement && <text className={styles.keep} x={node.x} y={node.y}>♜</text>}
                                            </ClickableMapNode>;
                                        })}
                                        {data.terrainField && (
                                            <ArmyLayer field={data.terrainField} armies={data.armies} colour={myColour} sightings={data.sightings} ownerName={ownerName} preview={marchRoute?.route?.path}
                                                selectedArmyId={march && "armyId" in march ? march.armyId : undefined}
                                                onSelect={march ? undefined : armyId => startMarch({ armyId })} />
                                        )}
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
                                {players.length > 1 && <span className={styles.legendFog}>Shaded: out of sight</span>}
                                {players.map(player => (
                                    <span key={player.seat} style={{ "--legend-colour": playerColour(player.seat) } as CSSProperties}>{player.isMe ? "You" : player.name}</span>
                                ))}
                            </div>
                            {terrain.href && (
                                <div className={styles.legend} aria-label="Ground legend">
                                    {AREAS.map(area => (
                                        <span key={area.code} className={styles.legendGround} style={{ "--legend-colour": area.fallbackColour } as CSSProperties}>
                                            {/* What a settlement's land gains from it (§4.6) — wheat beside the rest. */}
                                            {[area.name, ...Object.keys(area.yields)].join(" · ")}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </Section>
                {data && <SiegesSection endpoint={endpoint} view={data} placeName={placeName} onFought={setData} />}
                {data && <BattlesSection view={data} placeName={placeName} />}
                {data && <ArmiesSection endpoint={endpoint} view={data} march={march} onMarchChange={startMarch} preview={preview} placeName={placeName} onMarched={setData} />}
                {data && players.length > 1 && <SightingsSection view={data} ownerName={ownerName} placeName={placeName} />}
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
                {data && <WorldExitSection endpoint={endpoint} players={players} />}
            </>}
        </main>
    );
}
