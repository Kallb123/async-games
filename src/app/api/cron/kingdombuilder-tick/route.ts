import { NextRequest, NextResponse } from "next/server";
import type { ClientSession } from "mongoose";

import {
    KingdomBuilderArmyModel, KingdomBuilderBattleModel, KingdomBuilderSettlementModel, KingdomBuilderWorldModel,
    applyTick, assaultVillages, catchmentForSettlement, garrisonOf, prepareMultipleSettlementsIndex, removeEndedWorlds, sameUnits, startingTiles,
    type KingdomBuilderSeizure,
} from "@/games/KingdomBuilder";
import { isAuthorisedCron } from "@/utils/cronAuth";
import { dbConnect } from "@/utils/mongodb/mongodb";

export const maxDuration = 60;
// A world ticks every 15 minutes (GDD §5.5/§12): short enough that a queued
// building visibly moves within one sitting, still coarse enough that a sweep
// across every world stays cheap.
export const KINGDOM_BUILDER_TICK_INTERVAL_MS = 15 * 60 * 1000;
const SWEEP_BUDGET_MS = (maxDuration - 10) * 1000;
const SWEEP_CANDIDATE_LIMIT = 100;
// Ended worlds removed per run (GDD §9.1) — a backlog drains over a few runs
// rather than eating the tick sweep's budget in one.
const REMOVAL_LIMIT = 20;
// At most a year of missed ticks is caught up in one sweep.
const MAX_CATCH_UP_TICKS = 365 * 24 * (60 * 60 * 1000 / KINGDOM_BUILDER_TICK_INTERVAL_MS);

async function tickWorld(worldId: string, now: Date, session: ClientSession): Promise<boolean> {
    const world = await KingdomBuilderWorldModel.findById(worldId).select({ currentTick: 1, nextTickAt: 1, endedAt: 1, barbarians: 1 }).session(session).lean();
    if (!world || world.endedAt) return false;
    if (world.nextTickAt > now) return false;

    let settlements = await KingdomBuilderSettlementModel.find({ worldId }).session(session).lean();
    // The ground is only loaded for a world that needs it.
    let ground: Parameters<typeof catchmentForSettlement>[0] | undefined;
    const groundOf = async () => ground ??= (await KingdomBuilderWorldModel.findById(worldId).select({ terrainField: 1, nodes: 1 }).session(session).lean()) ?? { nodes: [] };
    if (settlements.some(settlement => !settlement.catchment)) {
        // Once per world from before PR 18 (§4.6): its settlements' land,
        // read off the stored field and saved with the tick below.
        const land = await groundOf();
        settlements = settlements.map(settlement => settlement.catchment
            ? settlement
            : { ...settlement, catchment: catchmentForSettlement(land, settlement) });
    }
    const scheduledTick = world.nextTickAt;
    const elapsedTicks = Math.min(
        MAX_CATCH_UP_TICKS,
        Math.floor((now.getTime() - scheduledTick.getTime()) / KINGDOM_BUILDER_TICK_INTERVAL_MS) + 1,
    );
    // Every army, camped ones included: a camp at someone else's settlement is a siege on it (PR 21).
    // Oldest first, which is the order two players' armies at one barbarian village fight it in.
    const armies = await KingdomBuilderArmyModel.find({ worldId }).sort({ createdAt: 1, _id: 1 }).session(session).lean();
    let ticked: { currentTick: number; settlements: typeof settlements; armies: typeof armies; seized?: readonly KingdomBuilderSeizure[] } = { currentTick: world.currentTick, settlements, armies };
    const seized: KingdomBuilderSeizure[] = [];
    for (let tick = 0; tick < elapsedTicks; tick++) {
        ticked = applyTick(ticked);
        seized.push(...ticked.seized ?? []);
    }
    // Then every army camped at a barbarian village fights it (§3.4, PR 23) —
    // once a sweep, on its last tick, however many ticks it caught up.
    const assault = assaultVillages(world.barbarians ?? [], ticked.settlements, ticked.armies);

    const nextTickAt = new Date(scheduledTick.getTime() + elapsedTicks * KINGDOM_BUILDER_TICK_INTERVAL_MS);
    const claimed = await KingdomBuilderWorldModel.updateOne(
        { _id: worldId, currentTick: world.currentTick, nextTickAt: scheduledTick, endedAt: null },
        { $set: { currentTick: ticked.currentTick, nextTickAt, ...(assault.battles.length ? { barbarians: assault.villages } : {}) } },
        { session },
    );
    if (claimed.modifiedCount !== 1) return false;

    if (ticked.settlements.length) {
        await KingdomBuilderSettlementModel.bulkWrite(ticked.settlements.map(settlement => {
            const fields = {
                tiles: settlement.tiles,
                resources: settlement.resources,
                trainingQueue: settlement.trainingQueue,
                garrison: settlement.garrison,
                caravans: settlement.caravans,
                catchment: settlement.catchment,
            };
            return {
                updateOne: {
                    filter: { _id: settlement._id, worldId },
                    update: settlement.construction
                        ? { $set: { ...fields, construction: settlement.construction } }
                        : { $set: fields, $unset: { construction: 1 } },
                },
            };
        }), { session });
    }
    if (assault.captures.length) {
        const land = await groundOf();
        await KingdomBuilderSettlementModel.create(assault.captures.map(capture => ({
            worldId, ...capture, tiles: startingTiles(),
            catchment: catchmentForSettlement(land, { nodeId: capture.nodeId }),
        })), { session, ordered: true });
    }
    if (assault.battles.length) {
        await KingdomBuilderBattleModel.create(assault.battles.map(battle => ({
            worldId, tick: ticked.currentTick, kind: "barbarian", nodeId: battle.nodeId,
            attackerIds: [battle.ownerId], defenderIds: [], attacker: battle.attacker, defender: battle.defender, rounds: battle.rounds,
            shares: [{ ownerId: battle.ownerId, sent: battle.attacker, left: battle.left }],
        })), { session, ordered: true });
    }
    // Caravans and settlers taken on the road (§4.7), and commanders killed there
    // (§6.5), are told to both sides as a raid: the taker learns what they took,
    // the loser only that it is gone — and only the loser how many commanders.
    // One that scouts guarded is fought first (§6.5), and told as a skirmish:
    // both sides then see what the other fought with, as in any battle.
    if (seized.length) {
        await KingdomBuilderBattleModel.create(seized.map(raid => {
            const scouts = raid.skirmish && garrisonOf({ scout: raid.skirmish.scouts });
            return {
                worldId, tick: raid.tick, kind: raid.skirmish ? "skirmish" : "raid", ...(raid.nodeId === undefined ? {} : { nodeId: raid.nodeId }),
                attackerIds: [raid.captorId], defenderIds: [raid.ownerId],
                attacker: raid.skirmish ? raid.captor : garrisonOf(), defender: scouts ?? garrisonOf(), rounds: raid.skirmish?.rounds ?? [],
                shares: [
                    {
                        ownerId: raid.captorId, sent: raid.captor, left: raid.skirmish?.captorLeft ?? raid.captor,
                        ...(raid.caravans ? { caravansTaken: raid.caravans } : {}), ...(raid.settlers ? { settlersTaken: raid.settlers } : {}),
                    },
                    {
                        ownerId: raid.ownerId, sent: scouts ?? garrisonOf(), left: raid.skirmish ? garrisonOf({ scout: raid.skirmish.scoutsLeft }) : garrisonOf(),
                        ...(raid.caravans ? { caravansLost: raid.caravans } : {}), ...(raid.settlers ? { settlersLost: raid.settlers } : {}),
                        ...(raid.commandersLost ? { commandersLost: raid.commandersLost } : {}),
                    },
                ],
            };
        }), { session, ordered: true });
    }
    // An army missing from the list marched home and rejoined its garrison,
    // saved above, fell at (or took) a barbarian village — its caravans and
    // their load with it, unloaded at home or into the town it took — or was
    // caravans taken by a rival's army, which now carries them; one that
    // neither moved, fought, took caravans, nor began or ended a siege is left alone.
    const marched = new Map(assault.armies.map(army => [army._id.toString(), army]));
    const armyWrites = armies.flatMap<Parameters<typeof KingdomBuilderArmyModel.bulkWrite>[0][number]>(army => {
        const next = marched.get(army._id.toString());
        if (!next) return [{ deleteOne: { filter: { _id: army._id, worldId } } }];
        const besiegingSince = next.besiegingSince ?? undefined;
        const fought = !sameUnits(next.units, army.units);
        const raided = (next.caravans ?? 0) !== (army.caravans ?? 0);
        if (next.travelled === army.travelled && next.arrivedAtTick === army.arrivedAtTick && besiegingSince === (army.besiegingSince ?? undefined) && !fought && !raided) return [];
        return [{
            updateOne: {
                filter: { _id: army._id, worldId },
                update: {
                    $set: {
                        travelled: next.travelled,
                        ...(fought ? { units: next.units } : {}),
                        ...(raided ? { caravans: next.caravans, cargo: next.cargo } : {}),
                        ...(next.arrivedAtTick === undefined ? {} : { arrivedAtTick: next.arrivedAtTick }),
                        ...(besiegingSince === undefined ? {} : { besiegingSince }),
                    },
                    ...(besiegingSince === undefined && army.besiegingSince != null ? { $unset: { besiegingSince: 1 } } : {}),
                },
            },
        }];
    });
    if (armyWrites.length) await KingdomBuilderArmyModel.bulkWrite(armyWrites, { session });
    return true;
}

async function runTick(request: NextRequest) {
    console.log(`${request.method} ${request.nextUrl.pathname}`);
    if (!isAuthorisedCron(request)) {
        return NextResponse.json({}, { status: 401, statusText: "Unauthorized" });
    }

    const database = await dbConnect();
    // A barbarian village taken in the sweep can be a player's second
    // settlement (§3.4), so Milestone A's one-per-owner index has to be gone
    // first — dropped here, outside any world's transaction, whose own locks
    // the drop would otherwise wait on. A failure is only logged: the index is
    // long gone on any database that has seen an expansion, and a capture it
    // still refuses fails that world's tick alone, to be retried next run.
    await prepareMultipleSettlementsIndex().catch(error => console.error("Kingdom Builder: could not drop the one-settlement index", error));
    const now = new Date();
    const deadline = Date.now() + SWEEP_BUDGET_MS;
    const candidates = await KingdomBuilderWorldModel.find({ nextTickAt: { $lte: now }, endedAt: null })
        .sort({ nextTickAt: 1, currentTick: 1 })
        .limit(SWEEP_CANDIDATE_LIMIT + 1)
        .select({ _id: 1 })
        .lean();
    const capped = candidates.length > SWEEP_CANDIDATE_LIMIT;
    const worlds = candidates.slice(0, SWEEP_CANDIDATE_LIMIT);
    let ticked = 0;
    let skipped = 0;
    let failed = 0;

    let unswept = capped ? 1 : 0;
    for (const [index, world] of worlds.entries()) {
        if (Date.now() >= deadline) {
            unswept += worlds.length - index;
            break;
        }
        try {
            const didTick = await database.connection.transaction(
                (session: ClientSession) => tickWorld(world._id.toString(), now, session),
            );
            if (didTick) ticked++;
            else skipped++;
        } catch (error) {
            failed++;
            console.error(`Kingdom Builder tick failed for world ${world._id}`, error);
        }
    }

    // Last, and only with budget to spare: a world waiting to be removed is
    // already inert, so it can always wait for the next run.
    let removal = { removed: 0, failed: 0 };
    try {
        removal = await removeEndedWorlds(now, REMOVAL_LIMIT, deadline);
    } catch (error) {
        console.error("Kingdom Builder: listing ended worlds to remove failed", error);
    }

    return NextResponse.json({
        scanned: worlds.length - Math.max(0, unswept - (capped ? 1 : 0)), ticked, skipped, failed, unswept, capped,
        removed: removal.removed, removalFailed: removal.failed,
    });
}

// Vercel invokes configured crons with GET; POST remains available for the
// manual exercising used while the prototype route was dormant.
export const GET = runTick;
export const POST = runTick;
