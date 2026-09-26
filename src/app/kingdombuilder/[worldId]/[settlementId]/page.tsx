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
    KINGDOM_BUILDER_UPGRADABLE_BUILDINGS,
    tavernLevelCapFor,
    buildTicksFor,
    buildingCostFor,
    buildingOutputFor,
    type KingdomBuilderPrototypeBuilding,
    type KingdomBuilderUpgradableBuilding,
} from "@/games/KingdomBuilder/buildings";
import { KINGDOM_BUILDER_RESOURCE_TYPES, canAfford, formatResources, shortfallFor, type KingdomBuilderResourceType } from "@/games/KingdomBuilder/resources";
import type { KingdomBuilderCatchment } from "@/games/KingdomBuilder/worldgen/catchment";
import MarketSection from "@/games/KingdomBuilder/components/MarketSection";
import TrainingQueue from "@/games/KingdomBuilder/components/TrainingQueue";
import {
    KINGDOM_BUILDER_MILITARY_UNIT_TYPES,
    KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT,
    KINGDOM_BUILDER_UNIT_TYPES,
    KINGDOM_BUILDER_UNITS,
    trainingTicksFor,
    type KingdomBuilderTrainingOrder,
    type KingdomBuilderUnitType,
} from "@/games/KingdomBuilder/units";
import { KINGDOM_BUILDER_COMBAT_STATS } from "@/games/KingdomBuilder/combat";
import { KINGDOM_BUILDER_WALL_DELAY_TICKS_PER_LEVEL, describeSiege } from "@/games/KingdomBuilder/siege";
import { formatTicks } from "@/games/KingdomBuilder/tick";
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
    market: { name: "Market", icon: "⚖️", role: "exchanges resources and sells caravans" },
    tavern: { name: "Tavern", icon: "🍺", role: "recruits commanders to lead armies" },
    walls: { name: "Walls", icon: "🧱", role: "delay a besieger's full attack" },
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

/** Where the training queue has got to — the one queue soldiers and settlers wait in. */
function trainingStatus(queue: readonly KingdomBuilderTrainingOrder[]): string {
    if (queue.length === 0) return "Nothing in training. Units are paid for when queued and join the garrison as each one finishes.";
    return `Training ${KINGDOM_BUILDER_UNITS[queue[0].unitType].name.toLowerCase()} — ${formatTicks(queue[0].ticksRemaining)} left`
        + (queue.length > 1 ? `, then ${queue.length - 1} more (${queue.length}/${KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT}).` : ".")
        + " Tap ✕ on a unit to cancel it for a full refund.";
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
    const removeBuilding = (tilePosition: number, buildingType: KingdomBuilderBuildingType) => {
        const name = BUILDING_DETAILS[buildingType]?.name.toLowerCase() ?? "building";
        if (!window.confirm(`Remove this ${name}? The resources used to build it won't be returned.`)) return;
        void send(`remove-${tilePosition}`, { action: "remove-building", tilePosition });
    };

    const unavailable = status === 403 || status === 404;
    const constructionTile = data?.tiles.find(tile => tile.construction);
    const construction = constructionTile?.construction;
    const emptyTiles = data?.tiles.filter(tile => !tile.building && !tile.construction) ?? [];
    const removableBuildings = data?.tiles.flatMap(tile => tile.building && tile.building.type !== "town-centre"
        ? [{ position: tile.position, building: tile.building }]
        : []) ?? [];
    const tileOf = (type: KingdomBuilderUpgradableBuilding) => data?.tiles.find(tile => tile.building?.type === type);
    const barracks = tileOf("barracks");
    const barracksLevel = barracks?.building?.level ?? 0;
    const market = tileOf("market");
    const tavern = tileOf("tavern");
    const walls = tileOf("walls");
    const tavernLevel = tavern?.building?.level ?? 0;
    const commanders = data?.commanders;
    const townCentre = tileOf("town-centre");
    // A barracks or a market is built once and levelled after (§4.2).
    const buildableTypes = KINGDOM_BUILDER_PROTOTYPE_BUILDINGS.filter(type => KINGDOM_BUILDER_UPGRADABLE_BUILDINGS[type] === undefined || (!tileOf(type) && !construction));
    const trainingQueue = data?.trainingQueue ?? [];
    const queueFull = trainingQueue.length >= KINGDOM_BUILDER_TRAINING_QUEUE_LIMIT;
    const upgradeRow = (type: KingdomBuilderUpgradableBuilding, tile: typeof barracks, effect: string, locked?: string) => data && tile?.building && (
        <UpgradeRow type={type} tilePosition={tile.position} level={tile.building.level} effect={effect} resources={data.resources}
            busy={!!construction} locked={locked} pending={pending === `upgrade-${type}`} disabled={isPending} onUpgrade={send} />
    );
    const trainingQueueChips = <TrainingQueue className={styles.queue} queue={trainingQueue} pending={pending} disabled={isPending} onCancel={send} />;
    const unitRow = (unitType: KingdomBuilderUnitType, level: number, locked?: string) => data && (
        <UnitRow key={unitType} unitType={unitType} level={level} resources={data.resources} queueFull={queueFull} locked={locked}
            pending={pending === unitType} disabled={isPending} onTrain={() => send(unitType, { unitType })} />
    );
    // A tavern never stands above its town centre (§6.5), and a player's commanders never outnumber their taverns' levels.
    const tavernCap = data ? tavernLevelCapFor(data.tiles) : 0;

    return (
        <main>
            <GameIdentityHeader backHref={`/kingdombuilder/${worldId}`} backLabel="Back to world map" title="Kingdom Builder" subtitle="Your settlement" />

            {unavailable ? (
                <Section>
                    <div className="ag-empty">This settlement is not available to you.</div>
                </Section>
            ) : (
                <>
                    {data?.siege && (
                        <Section label="Under siege">
                            <div className="ag-callout" role="status">{describeSiege(data.siege, data.currentTick)} Sally out from the world map to fight the besiegers.</div>
                        </Section>
                    )}
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
                            <>
                                <p className={styles.status}>
                                    {BUILDING_DETAILS[construction.buildingType]?.name}
                                    {construction.targetLevel > 1 ? ` (level ${construction.targetLevel})` : ""} is under construction. This screen checks each tick for completion.
                                </p>
                                <div className="ag-build-list">
                                    <BuildRow
                                        icon="✕"
                                        name="Cancel build"
                                        cost={`Return ${formatResources(buildingCostFor(construction.buildingType as KingdomBuilderUpgradableBuilding, construction.targetLevel))} to your stores`}
                                        tag={pending === "cancel-building" ? "Cancelling…" : "Cancel"}
                                        pending={pending === "cancel-building"}
                                        disabled={isPending}
                                        onClick={() => void send("cancel-building", { action: "cancel-building" })}
                                    />
                                </div>
                            </>
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
                                                    : `${price.label} · ${formatTicks(buildTicksFor(1))} · ${role}`}
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

                    {removableBuildings.length > 0 && (
                        <Section label="Remove a building">
                            <p className={styles.status}>Clear a tile for something else. Removed buildings do not return resources.</p>
                            <div className="ag-build-list">
                                {removableBuildings.map(tile => (
                                    <BuildRow
                                        key={tile.position}
                                        icon={BUILDING_DETAILS[tile.building.type].icon}
                                        name={BUILDING_DETAILS[tile.building.type].name}
                                        cost={`Level ${tile.building.level} · tile ${tile.position + 1}`}
                                        tag={pending === `remove-${tile.position}` ? "Removing…" : constructionTile?.position === tile.position ? "Cancel upgrade first" : "Remove"}
                                        tagMuted={constructionTile?.position === tile.position}
                                        pending={pending === `remove-${tile.position}`}
                                        disabled={isPending || constructionTile?.position === tile.position}
                                        onClick={() => removeBuilding(tile.position, tile.building.type)}
                                    />
                                ))}
                            </div>
                        </Section>
                    )}

                    {data && barracks && (
                        <Section label="Barracks" action={<span className="ag-tag">Level {barracksLevel}</span>}>
                            <p className={styles.status}>{trainingStatus(trainingQueue)}</p>
                            {trainingQueueChips}
                            <div className="ag-build-list">
                                {upgradeRow("barracks", barracks, "unlocks stronger units, trains faster and watches farther")}
                                {KINGDOM_BUILDER_MILITARY_UNIT_TYPES.map(unitType => unitRow(unitType, barracksLevel))}
                            </div>
                        </Section>
                    )}

                    {data && walls && (
                        <Section label="Walls" action={<span className="ag-tag">Level {walls.building!.level}</span>}>
                            <div className="ag-build-list">
                                {upgradeRow("walls", walls, `holds off a full attack for another ${KINGDOM_BUILDER_WALL_DELAY_TICKS_PER_LEVEL} ticks`)}
                            </div>
                        </Section>
                    )}

                    {data && commanders && tavern?.building && (
                        <Section label="Tavern" action={<span className="ag-tag">Level {tavernLevel}</span>}>
                            <p className={styles.status}>
                                Commanders: {commanders.held} of {commanders.capacity} across your realm. Soldiers march out only behind one;
                                scouts, caravans and settlers go without. {barracks ? "Commanders share the barracks' training queue." : "Commanders share the town centre's training queue."}
                            </p>
                            <div className="ag-build-list">
                                {upgradeRow("tavern", tavern, "recruits one more commander",
                                    tavernLevel >= tavernCap ? `Needs town centre level ${tavernLevel + 1}` : undefined)}
                                {unitRow("commander", tavernLevel,
                                    commanders.held >= commanders.capacity ? `All ${commanders.capacity} commanders recruited — raise a tavern` : undefined)}
                            </div>
                        </Section>
                    )}

                    {data && townCentre?.building && (
                        <Section label="Town centre" action={<span className="ag-tag">Level {townCentre.building.level}</span>}>
                            <p className={styles.status}>
                                {barracks ? "Settlers share the barracks' training queue. " : `${trainingStatus(trainingQueue)} `}
                                March a settler to an open site on the world map to found a new town there.
                            </p>
                            {!barracks && trainingQueueChips}
                            <div className="ag-build-list">
                                {upgradeRow("town-centre", townCentre, "trains settlers")}
                                {unitRow("settler", townCentre.building.level)}
                            </div>
                        </Section>
                    )}

                    {data && market?.building && (
                        <MarketSection view={data} marketLevel={market.building.level} pending={pending} isPending={isPending} onSend={send}
                            upgrade={upgradeRow("market", market, "a better rate")} />
                    )}

                    {data && (
                        <Section label="Garrison">
                            <p className={styles.status}>Send units out as an army from the world map. An army that marches back here rejoins the garrison.</p>
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

function UnitRow({ unitType, level, resources, queueFull, locked, pending, disabled, onTrain }: {
    unitType: KingdomBuilderUnitType;
    /** The level of the building it trains at — the barracks, the town centre for a settler, the tavern for a commander. */
    level: number;
    resources: KingdomBuilderSettlementView["resources"];
    queueFull: boolean;
    /** Why it can't be trained now whatever the stores hold — a commander at the realm's cap. */
    locked?: string;
    pending: boolean;
    disabled: boolean;
    onTrain: () => void;
}) {
    const unit = KINGDOM_BUILDER_UNITS[unitType];
    const stats = KINGDOM_BUILDER_COMBAT_STATS[unitType];
    const trainTicks = trainingTicksFor(unitType, level);
    const price = priceFor(unit.cost, resources);
    const blocker = trainTicks === null ? `Level ${unit.trainedAt.level}` : locked ? "Locked" : queueFull ? "Queue full" : !price.affordable ? "Can't afford" : null;
    return (
        <BuildRow
            icon={unit.icon}
            name={unit.name}
            cost={trainTicks === null
                ? `${unit.role} · needs a level ${unit.trainedAt.level} ${BUILDING_DETAILS[unit.trainedAt.building].name.toLowerCase()}`
                : locked ?? `${price.label} · ${formatTicks(trainTicks)} · ${stats.health} HP · ${stats.attack} attack · ${stats.defence} defence · ${unit.speed} move`}
            tag={pending ? "Queuing…" : blocker ?? "Train"}
            tagMuted={!!blocker}
            disabled={!!blocker || disabled}
            pending={pending}
            onClick={onTrain}
        />
    );
}

/** Raises a barracks, a market, a tavern or the town centre a level (§4.2) — gone once it is at its highest. */
function UpgradeRow({ type, tilePosition, level, effect, resources, busy, locked, pending, disabled, onUpgrade }: {
    type: KingdomBuilderUpgradableBuilding;
    tilePosition: number;
    level: number;
    /** What the next level brings. */
    effect: string;
    resources: KingdomBuilderSettlementView["resources"];
    /** Something else is being built. */
    busy: boolean;
    /** Why the next level can't be built yet — a tavern waiting on its town centre (§6.5). */
    locked?: string;
    pending: boolean;
    disabled: boolean;
    onUpgrade: (key: string, request: object) => void;
}) {
    if (level >= (KINGDOM_BUILDER_UPGRADABLE_BUILDINGS[type] ?? 1)) return null;
    const price = priceFor(buildingCostFor(type, level + 1), resources);
    return (
        <BuildRow
            icon={BUILDING_DETAILS[type].icon}
            name={`Upgrade to level ${level + 1}`}
            cost={locked ?? `${price.label} · ${formatTicks(buildTicksFor(level + 1))} · ${effect}`}
            tag={locked ? "Locked" : busy ? "Busy" : pending ? "Queuing…" : price.affordable ? "Upgrade" : "Can't afford"}
            tagMuted={!!locked || busy || !price.affordable}
            disabled={!!locked || busy || !price.affordable || disabled}
            pending={pending}
            onClick={() => onUpgrade(`upgrade-${type}`, { tilePosition, buildingType: type })}
        />
    );
}
