'use client'

import { use, useEffect, useState } from "react";

import BuildRow from "@/components/ui/BuildRow";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";
import Section from "@/components/ui/Section";
import Skeleton from "@/components/ui/Skeleton";
import Stat from "@/components/ui/Stat";
import type { KingdomBuilderSettlementView } from "@/games/KingdomBuilder";
import { KINGDOM_BUILDER_PROTOTYPE_BUILDINGS, buildTicksFor, type KingdomBuilderPrototypeBuilding } from "@/games/KingdomBuilder/buildings";
import {
    KINGDOM_BUILDER_BARRACKS_MAX_LEVEL,
    KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT,
    KINGDOM_BUILDER_UNIT_TYPES,
    KINGDOM_BUILDER_UNITS,
    trainingTicksFor,
    type KingdomBuilderUnitType,
} from "@/games/KingdomBuilder/units";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useJsonMutation } from "@/utils/hooks/useJsonMutation";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { worldBuildsStorageKey } from "@/games/KingdomBuilder/worldSummaryTypes";
import { writeStoredValue } from "@/utils/hooks/useStoredValue";

import styles from "./page.module.css";

const BUILDING_DETAILS: Record<string, { name: string; icon: string; resource?: string }> = {
    "town-centre": { name: "Town centre", icon: "🏰" },
    "lumber-camp": { name: "Lumber camp", icon: "🪵", resource: "Produces wood every tick" },
    quarry: { name: "Quarry", icon: "🪨", resource: "Produces stone every tick" },
    mine: { name: "Mine", icon: "⛏️", resource: "Produces iron every tick" },
    barracks: { name: "Barracks", icon: "🏯", resource: "Trains army units" },
};

function formatCost(cost: { wood: number; stone: number; iron: number }): string {
    return (["wood", "stone", "iron"] as const).filter(resource => cost[resource] > 0).map(resource => `${cost[resource]} ${resource}`).join(" · ");
}

function ticks(count: number): string {
    return `${count} tick${count === 1 ? "" : "s"}`;
}

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
    // Which row's command is in flight: a building type, "upgrade", or a unit type.
    const [pending, setPending] = useState<string | null>(null);
    const { submit, isPending, message } = useJsonMutation<KingdomBuilderSettlementView>(endpoint, "That could not be queued. Try again.");

    useEffect(() => {
        if (data) writeStoredValue(worldBuildsStorageKey(worldId), String(data.completedBuildLevels));
    }, [data, worldId]);

    const send = async (key: string, request: object) => {
        setPending(key);
        const body = await submit(request);
        if (body) {
            setData(body);
            setSelectedTile(null);
        }
        setPending(null);
    };
    const queueBuilding = (buildingType: KingdomBuilderPrototypeBuilding) => {
        if (selectedTile !== null) void send(buildingType, { tilePosition: selectedTile, buildingType });
    };

    const unavailable = status === 403 || status === 404;
    const construction = data?.tiles.find(tile => tile.construction)?.construction;
    const emptyTiles = data?.tiles.filter(tile => !tile.building && !tile.construction) ?? [];
    const barracks = data?.tiles.find(tile => tile.building?.type === "barracks");
    const barracksLevel = barracks?.building?.level ?? 0;
    const buildableTypes = KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.filter(type => type !== "barracks" || (!barracks && !construction));
    const trainingQueue = data?.trainingQueue ?? [];
    const queueFull = trainingQueue.length >= KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT;

    return (
        <main>
            <GameIdentityHeader backHref={`/kingdombuilder/${worldId}`} backLabel="Back to world map" title="Kingdom Builder" subtitle="Your settlement" />

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
                                {BUILDING_DETAILS[construction.buildingType]?.name}
                                {construction.targetLevel > 1 ? ` (level ${construction.targetLevel})` : ""} is under construction. This screen checks each tick for completion.
                            </p>
                        ) : emptyTiles.length === 0 && data ? (
                            <div className="ag-empty">Every building tile is occupied.</div>
                        ) : (
                            <>
                                <p className={styles.status}>{selectedTile === null ? "Choose an empty tile, then pick a building." : `Building on tile ${selectedTile + 1}.`}</p>
                                <div className="ag-build-list">
                                    {buildableTypes.map(buildingType => (
                                        <BuildRow
                                            key={buildingType}
                                            icon={BUILDING_DETAILS[buildingType].icon}
                                            name={BUILDING_DETAILS[buildingType].name}
                                            cost={BUILDING_DETAILS[buildingType].resource}
                                            tag={pending === buildingType ? "Queuing…" : "Build"}
                                            disabled={selectedTile === null || isPending}
                                            pending={pending === buildingType}
                                            onClick={() => queueBuilding(buildingType)}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                        {isRefreshing && <span className="visually-hidden">Refreshing settlement</span>}
                    </Section>

                    {data && barracks && (
                        <Section label="Barracks" action={<span className="ag-tag">Level {barracksLevel}</span>}>
                            <p className={styles.status}>
                                {trainingQueue.length === 0
                                    ? "Nothing in training. Units are paid for when queued and join the garrison as each one finishes."
                                    : `Training ${KINGDOM_BUILDER_UNITS[trainingQueue[0].unitType].name.toLowerCase()} — ${ticks(trainingQueue[0].ticksRemaining)} left`
                                        + (trainingQueue.length > 1 ? `, then ${trainingQueue.length - 1} more (${trainingQueue.length}/${KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT}).` : ".")}
                            </p>
                            <div className="ag-build-list">
                                {barracksLevel < KINGDOM_BUILDER_BARRACKS_MAX_LEVEL && (
                                    <BuildRow
                                        icon={BUILDING_DETAILS.barracks.icon}
                                        name={`Upgrade to level ${barracksLevel + 1}`}
                                        cost={`Unlocks stronger units and trains faster · ${ticks(buildTicksFor(barracksLevel + 1))}`}
                                        tag={construction ? "Busy" : pending === "upgrade" ? "Queuing…" : "Upgrade"}
                                        tagMuted={!!construction}
                                        disabled={!!construction || isPending}
                                        pending={pending === "upgrade"}
                                        onClick={() => send("upgrade", { tilePosition: barracks.position, buildingType: "barracks" })}
                                    />
                                )}
                                {KINGDOM_BUILDER_UNIT_TYPES.map(unitType => (
                                    <UnitRow
                                        key={unitType}
                                        unitType={unitType}
                                        barracksLevel={barracksLevel}
                                        resources={data.resources}
                                        queueFull={queueFull}
                                        pending={pending === unitType}
                                        disabled={isPending}
                                        onTrain={() => send(unitType, { unitType })}
                                    />
                                ))}
                            </div>
                        </Section>
                    )}

                    {data && (
                        <Section label="Garrison">
                            <div className={`ag-stat-row ${styles.garrison}`}>
                                {KINGDOM_BUILDER_UNIT_TYPES.map(unitType => (
                                    <Stat key={unitType} value={data.garrison[unitType]} label={KINGDOM_BUILDER_UNITS[unitType].name} />
                                ))}
                            </div>
                        </Section>
                    )}

                    {message && <div className="ag-callout" role="alert">{message}</div>}
                </>
            )}
        </main>
    );
}

function UnitRow({ unitType, barracksLevel, resources, queueFull, pending, disabled, onTrain }: {
    unitType: KingdomBuilderUnitType;
    barracksLevel: number;
    resources: KingdomBuilderSettlementView["resources"];
    queueFull: boolean;
    pending: boolean;
    disabled: boolean;
    onTrain: () => void;
}) {
    const unit = KINGDOM_BUILDER_UNITS[unitType];
    const trainTicks = trainingTicksFor(unitType, barracksLevel);
    const affordable = (["wood", "stone", "iron"] as const).every(resource => resources[resource] >= unit.cost[resource]);
    const blocker = trainTicks === null ? `Level ${unit.barracksLevel}` : queueFull ? "Queue full" : !affordable ? "Can't afford" : null;
    return (
        <BuildRow
            icon={unit.icon}
            name={unit.name}
            cost={trainTicks === null
                ? `${unit.role} · needs a level ${unit.barracksLevel} barracks`
                : `${formatCost(unit.cost)} · ${ticks(trainTicks)} · ${unit.speed}`}
            tag={pending ? "Queuing…" : blocker ?? "Train"}
            tagMuted={!!blocker}
            disabled={!!blocker || disabled}
            pending={pending}
            onClick={onTrain}
        />
    );
}
