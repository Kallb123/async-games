'use client'

import { use, useEffect, useState } from "react";

import BuildRow from "@/components/ui/BuildRow";
import GameIdentityHeader from "@/components/ui/GameIdentityHeader";
import Section from "@/components/ui/Section";
import Skeleton from "@/components/ui/Skeleton";
import Stat from "@/components/ui/Stat";
import type { KingdomBuilderBuildingType, KingdomBuilderResources, KingdomBuilderSettlementView } from "@/games/KingdomBuilder";
import {
    KINGDOM_BUILDER_BUILDING_PRODUCES,
    KINGDOM_BUILDER_PROTOTYPE_BUILDINGS,
    buildTicksFor,
    buildingCostFor,
    buildingOutputFor,
    type KingdomBuilderPrototypeBuilding,
} from "@/games/KingdomBuilder/buildings";
import { KINGDOM_BUILDER_RESOURCE_TYPES, canAfford, formatResources, shortfallFor, type KingdomBuilderResourceType } from "@/games/KingdomBuilder/resources";
import type { KingdomBuilderCatchment } from "@/games/KingdomBuilder/worldgen/catchment";
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

const BUILDING_DETAILS: Record<string, { name: string; icon: string; role?: string }> = {
    "town-centre": { name: "Town centre", icon: "🏰" },
    "lumber-camp": { name: "Lumber camp", icon: "🪵" },
    quarry: { name: "Quarry", icon: "🪨" },
    farm: { name: "Farm", icon: "🌾" },
    mine: { name: "Mine", icon: "⛏️" },
    barracks: { name: "Barracks", icon: "🏯", role: "trains army units" },
};

/** What the land is called when it yields each resource — "Rich woodland" (§4.6). */
const LAND_NAMES: Record<KingdomBuilderResourceType, string> = { wood: "woodland", stone: "stone", iron: "iron", wheat: "farmland" };

function landLabel(resource: KingdomBuilderResourceType, catchment: KingdomBuilderCatchment): string {
    const tier = catchment[resource];
    return tier === "none" ? `No ${LAND_NAMES[resource]}` : `${tier[0].toUpperCase()}${tier.slice(1)} ${LAND_NAMES[resource]}`;
}

/** "+2 wood" a tick for a production building at this level on this land, or nothing for one that isn't one. */
function outputOf(type: KingdomBuilderBuildingType, level: number, catchment: KingdomBuilderCatchment): string | null {
    const output = buildingOutputFor(type, level, catchment);
    return output ? `+${output.amount} ${output.resource}` : null;
}

/**
 * What a row costs against the stores, for every priced row — buildings and
 * units alike. An unaffordable row stays on screen with its shortfall, so a
 * player can see what they are saving for (§4.5).
 */
function priceFor(cost: KingdomBuilderResources, stores: KingdomBuilderResources) {
    const affordable = canAfford(stores, cost);
    return {
        affordable,
        label: affordable ? formatResources(cost) : `${formatResources(cost)} (short ${formatResources(shortfallFor(stores, cost))})`,
    };
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
    const upgradePrice = data && barracks && barracksLevel < KINGDOM_BUILDER_BARRACKS_MAX_LEVEL
        ? priceFor(buildingCostFor("barracks", barracksLevel + 1), data.resources)
        : null;

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
                            {KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => (
                                <Stat
                                    key={resource}
                                    value={data?.resources[resource] ?? "—"}
                                    label={data ? <>{resource}<span className={styles.land}>{landLabel(resource, data.catchment)}</span></> : resource}
                                />
                            ))}
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
                                            {tile.building && (
                                                <span className={styles.note}>
                                                    {[`Level ${tile.building.level}`, outputOf(tile.building.type, tile.building.level, data.catchment)].filter(Boolean).join(" · ")}
                                                </span>
                                            )}
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
                                    {data && buildableTypes.map(buildingType => {
                                        const price = priceFor(buildingCostFor(buildingType, 1), data.resources);
                                        const produces = KINGDOM_BUILDER_BUILDING_PRODUCES[buildingType];
                                        // Land with none of its resource can't hold it (§4.6); the row stays, saying why.
                                        const barren = produces !== undefined && data.catchment[produces] === "none";
                                        const role = produces ? `${outputOf(buildingType, 1, data.catchment)} a tick` : BUILDING_DETAILS[buildingType].role;
                                        return (
                                            <BuildRow
                                                key={buildingType}
                                                icon={BUILDING_DETAILS[buildingType].icon}
                                                name={BUILDING_DETAILS[buildingType].name}
                                                cost={barren
                                                    ? `This settlement's land has no ${produces}`
                                                    : `${price.label} · ${ticks(buildTicksFor(1))} · ${role}`}
                                                tag={pending === buildingType ? "Queuing…" : barren ? `No ${produces}` : price.affordable ? "Build" : "Can't afford"}
                                                tagMuted={barren || !price.affordable}
                                                disabled={selectedTile === null || barren || !price.affordable || isPending}
                                                pending={pending === buildingType}
                                                onClick={() => queueBuilding(buildingType)}
                                            />
                                        );
                                    })}
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
                                {upgradePrice && (
                                    <BuildRow
                                        icon={BUILDING_DETAILS.barracks.icon}
                                        name={`Upgrade to level ${barracksLevel + 1}`}
                                        cost={`${upgradePrice.label} · ${ticks(buildTicksFor(barracksLevel + 1))} · unlocks stronger units and trains faster`}
                                        tag={construction ? "Busy" : pending === "upgrade" ? "Queuing…" : upgradePrice.affordable ? "Upgrade" : "Can't afford"}
                                        tagMuted={!!construction || !upgradePrice.affordable}
                                        disabled={!!construction || !upgradePrice.affordable || isPending}
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
    const price = priceFor(unit.cost, resources);
    const blocker = trainTicks === null ? `Level ${unit.barracksLevel}` : queueFull ? "Queue full" : !price.affordable ? "Can't afford" : null;
    return (
        <BuildRow
            icon={unit.icon}
            name={unit.name}
            cost={trainTicks === null
                ? `${unit.role} · needs a level ${unit.barracksLevel} barracks`
                : `${price.label} · ${ticks(trainTicks)} · ${unit.speed}`}
            tag={pending ? "Queuing…" : blocker ?? "Train"}
            tagMuted={!!blocker}
            disabled={!!blocker || disabled}
            pending={pending}
            onClick={onTrain}
        />
    );
}
