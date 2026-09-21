'use client'

import { use, useRef, useState } from "react";

import BuildRow from "@/components/ui/BuildRow";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";
import Section from "@/components/ui/Section";
import Skeleton from "@/components/ui/Skeleton";
import Stat from "@/components/ui/Stat";
import type { KingdomBuilderPrototypeBuilding, KingdomBuilderSettlementView } from "@/games/KingdomBuilder";
import { REQUEST_TIMEOUT_MS } from "@/utils/hooks/fetchWithSessionRetry";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";

import styles from "./page.module.css";

const BUILDING_DETAILS: Record<string, { name: string; icon: string; resource?: string }> = {
    "town-centre": { name: "Town centre", icon: "🏰" },
    "lumber-camp": { name: "Lumber camp", icon: "🪵", resource: "Produces wood every tick" },
    quarry: { name: "Quarry", icon: "🪨", resource: "Produces stone every tick" },
    mine: { name: "Mine", icon: "⛏️", resource: "Produces iron every tick" },
};
const BUILDABLE_TYPES: KingdomBuilderPrototypeBuilding[] = ["lumber-camp", "quarry", "mine"];

export default function KingdomBuilderSettlementPage({
    params,
}: {
    params: Promise<{ worldId: string; settlementId: string }>;
}) {
    const { worldId, settlementId } = use(params);
    useAuthGuard();
    const endpoint = `/api/kingdombuilder/${worldId}/${settlementId}`;
    const { data, setData, isLoading, isRefreshing, status } = useRefreshableData<KingdomBuilderSettlementView>(
        endpoint,
        [],
        { pollWhileWatching: true },
    );
    const [selectedTile, setSelectedTile] = useState<number | null>(null);
    const [pending, setPending] = useState<KingdomBuilderPrototypeBuilding | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const submittingRef = useRef(false);

    const queueBuilding = async (buildingType: KingdomBuilderPrototypeBuilding) => {
        if (selectedTile === null || submittingRef.current) return;
        submittingRef.current = true;
        setPending(buildingType);
        setMessage(null);
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ tilePosition: selectedTile, buildingType }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (response.ok) {
                setData(await response.json() as KingdomBuilderSettlementView);
                setSelectedTile(null);
            } else {
                const body = await response.json().catch(() => ({})) as { error?: string };
                setMessage(body.error ?? "That building could not be queued. Try again.");
            }
        } catch (error) {
            console.error("Failed to queue a Kingdom Builder building", error);
            setMessage("That building could not be queued. Check your connection and try again.");
        } finally {
            submittingRef.current = false;
            setPending(null);
        }
    };

    const unavailable = status === 403 || status === 404;
    const construction = data?.tiles.find(tile => tile.construction)?.construction;
    const emptyTiles = data?.tiles.filter(tile => !tile.building && !tile.construction) ?? [];

    return (
        <main>
            <GameIdentityHeader backHref="/" backLabel="Back to my games" title="Kingdom Builder" subtitle="Your settlement" />

            {unavailable ? (
                <Section>
                    <div className="ag-empty">This settlement is not available to you.</div>
                </Section>
            ) : (
                <>
                    <Section label="Resources" isLoading={isLoading}>
                        <div className="ag-stat-row">
                            <Stat value={data?.resources.wood ?? "—"} label="wood" />
                            <Stat value={data?.resources.stone ?? "—"} label="stone" />
                            <Stat value={data?.resources.iron ?? "—"} label="iron" />
                        </div>
                    </Section>

                    <Section label="Settlement" isLoading={isLoading} action={data && <span className="ag-tag">Tick {data.currentTick}</span>}>
                        {isLoading ? <Skeleton width="100%" height={320} radius={14} /> : data && (
                            <div className={styles.grid} aria-label="Settlement building grid">
                                {data.tiles.toSorted((a, b) => a.position - b.position).map(tile => {
                                    const item = tile.building ?? tile.construction;
                                    const buildingType = tile.building?.type ?? tile.construction?.buildingType;
                                    const selectable = !item && !construction;
                                    return selectable ? (
                                        <button
                                            type="button"
                                            className={`${styles.tile}${selectedTile === tile.position ? ` ${styles.selected}` : ""}`}
                                            aria-pressed={selectedTile === tile.position}
                                            onClick={() => setSelectedTile(tile.position)}
                                            key={tile.position}
                                        >
                                            <span className={styles.mark}>＋</span>
                                            <span className={styles.name}>Empty tile</span>
                                        </button>
                                    ) : (
                                        <div className={`${styles.tile}${tile.construction ? ` ${styles.constructing}` : ""}`} key={tile.position}>
                                            <span className={styles.mark}>{BUILDING_DETAILS[buildingType ?? ""]?.icon ?? "◇"}</span>
                                            <span className={styles.name}>{BUILDING_DETAILS[buildingType ?? ""]?.name ?? "Empty tile"}</span>
                                            {tile.building && <span className={styles.note}>Level {tile.building.level}</span>}
                                            {tile.construction && <span className={styles.note}>{tile.construction.ticksRemaining} ticks left</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Section>

                    <Section label="Build" isLoading={isLoading}>
                        {construction ? (
                            <p className={styles.status}>
                                {BUILDING_DETAILS[construction.buildingType]?.name} is under construction. This screen checks each tick for completion.
                            </p>
                        ) : emptyTiles.length === 0 && data ? (
                            <div className="ag-empty">Every building tile is occupied.</div>
                        ) : (
                            <>
                                <p className={styles.status}>{selectedTile === null ? "Choose an empty tile, then pick a building." : `Building on tile ${selectedTile + 1}.`}</p>
                                <div className="ag-build-list">
                                    {BUILDABLE_TYPES.map(buildingType => (
                                        <BuildRow
                                            key={buildingType}
                                            icon={BUILDING_DETAILS[buildingType].icon}
                                            name={BUILDING_DETAILS[buildingType].name}
                                            cost={BUILDING_DETAILS[buildingType].resource}
                                            tag={pending === buildingType ? "Queuing…" : "Build"}
                                            disabled={selectedTile === null || pending !== null}
                                            pending={pending === buildingType}
                                            onClick={() => queueBuilding(buildingType)}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                        {message && <div className="ag-callout" role="alert">{message}</div>}
                        {isRefreshing && <span className="visually-hidden">Refreshing settlement</span>}
                    </Section>
                </>
            )}
        </main>
    );
}
