// The two ways a siege comes to blows (GDD §8, §11.3 PR 21): the besieger
// pushes the attack on the garrison, or the defender sallies out against the
// besiegers. Both are fought out by §7's combat engine (PR 22) and kept as a
// battle both sides can read.

import mongoose, { Types, type AnyBulkWriteOperation, type ClientSession } from "mongoose";

import { KingdomBuilderArmyModel, type IKingdomBuilderArmyDocument } from "./KingdomBuilderArmyModel";
import { KingdomBuilderBattleModel, type KingdomBuilderBattleShare } from "./KingdomBuilderBattleModel";
import { KingdomBuilderSettlementModel, type KingdomBuilderResources } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { addUnits, combineCaravans, unitCount } from "./armies";
import { resolveBattle, shareSurvivors, type KingdomBuilderBattle } from "./combat";
import { KingdomBuilderPersistenceError } from "./persistence";
import { KINGDOM_BUILDER_RESOURCE_TYPES } from "./resources";
import { combinedUnits } from "./siege";
import { garrisonOf, type KingdomBuilderGarrison } from "./units";
import { worldView, type KingdomBuilderWorldView } from "./worldView";

function invalid(message: string): KingdomBuilderPersistenceError {
    return new KingdomBuilderPersistenceError("INVALID_INPUT", message);
}

/**
 * Every battle writes the world first, as a dispatch does: the tick writes it
 * too, so a battle and a tick (or a dispatch, or a second battle) at once
 * conflict and one is retried against what the other left — never a garrison
 * that has trained, marched or fought since it was read. It also refuses an
 * ended world. Returns the tick the battle is fought on.
 */
async function claimBattle(worldId: string, session: ClientSession): Promise<number> {
    const live = await KingdomBuilderWorldModel.findOneAndUpdate(
        { _id: worldId, endedAt: null }, { $inc: { battlesFought: 1 } }, { session, projection: { currentTick: 1 } },
    ).lean();
    if (!live) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
    return live.currentTick;
}

/** What a fight hands back to be kept: where, who was on each side with what, and how it went. */
interface Fought {
    nodeId: string;
    attackerIds: string[];
    defenderIds: string[];
    attacker: KingdomBuilderGarrison;
    defender: KingdomBuilderGarrison;
    shares: KingdomBuilderBattleShare[];
    battle: KingdomBuilderBattle;
}

/**
 * One battle: claimed, fought and saved in one transaction, and kept for both
 * sides to read. The reply is the caller's view, whose `battles` begin with it.
 */
async function runBattle(worldId: string, userId: string, kind: "push" | "sally", fight: (session: ClientSession) => Promise<Fought>): Promise<KingdomBuilderWorldView> {
    await mongoose.connection.transaction(async session => {
        const tick = await claimBattle(worldId, session);
        const { battle, ...fought } = await fight(session);
        await KingdomBuilderBattleModel.create([{ worldId, tick, kind, ...fought, rounds: battle.rounds }], { session });
    });
    return worldView(worldId, userId);
}

type Camp = { _id: Types.ObjectId; ownerId: string; units: KingdomBuilderGarrison; caravans?: number; cargo?: Partial<KingdomBuilderResources> };

/** The armies camped at a settlement that fought as one side, oldest first so their survivors are shared the same way every time. */
function campsAt(filter: Record<string, unknown>, session: ClientSession) {
    return KingdomBuilderArmyModel.find({ ...filter, besiegingSince: { $ne: null } })
        .sort({ createdAt: 1, _id: 1 }).select({ ownerId: 1, units: 1, caravans: 1, cargo: 1 }).session(session).lean<Camp[]>();
}

/** Caravans and their load, left behind by an escort that fell (§4.7). */
type Spoils = ReturnType<typeof combineCaravans>;

/**
 * Leaves each army that fought with its share of what survived — and disbands
 * it if that is nothing, leaving its caravans to the other side. Returns what
 * each owner brought and kept, so each can be told their own and nobody
 * else's, and the caravans left behind.
 */
async function returnSurvivors(worldId: string, camps: readonly Camp[], survivors: KingdomBuilderGarrison, session: ClientSession): Promise<{ shares: KingdomBuilderBattleShare[]; spoils: Spoils }> {
    const kept = shareSurvivors(camps.map(camp => camp.units), survivors);
    const writes: AnyBulkWriteOperation<IKingdomBuilderArmyDocument>[] = camps.map((camp, index) => unitCount(kept[index]) === 0
        ? { deleteOne: { filter: { _id: camp._id, worldId } } }
        : { updateOne: { filter: { _id: camp._id, worldId }, update: { $set: { units: kept[index] } } } });
    await KingdomBuilderArmyModel.bulkWrite(writes, { session });
    const byOwner = new Map<string, KingdomBuilderBattleShare>();
    camps.forEach((camp, index) => {
        const share = byOwner.get(camp.ownerId);
        const lost = unitCount(kept[index]) === 0 ? camp.caravans ?? 0 : 0;
        const caravansLost = (share?.caravansLost ?? 0) + lost;
        byOwner.set(camp.ownerId, {
            ownerId: camp.ownerId,
            sent: addUnits(share?.sent, camp.units),
            left: addUnits(share?.left, kept[index]),
            ...(caravansLost ? { caravansLost } : {}),
        });
    });
    // The fallen armies' caravans are the other side's now.
    const spoils = combineCaravans(camps.filter((camp, index) => unitCount(kept[index]) === 0));
    return { shares: [...byOwner.values()], spoils };
}

/** What a town takes off the besiegers it beat: their caravans into its yard, their load into its stores. */
function plundered(spoils: Spoils): Record<string, number> {
    return {
        caravans: spoils.caravans,
        ...Object.fromEntries(KINGDOM_BUILDER_RESOURCE_TYPES.filter(resource => spoils.cargo[resource] > 0).map(resource => [`resources.${resource}`, spoils.cargo[resource]])),
    };
}

/**
 * The besieger pushes the attack (§8): every army of theirs besieging the
 * same settlement goes in together against its garrison, which fights from
 * behind its town's defences. Won, the garrison is destroyed and the siege
 * goes on — taking a settlement is a later rule. Otherwise whatever is left
 * of the armies keeps up the siege, and whatever is left of the garrison
 * stays home — with the caravans of any army that fell, and their load.
 */
export async function pushAttack(worldId: string, userId: string, armyId: unknown): Promise<KingdomBuilderWorldView> {
    if (!Types.ObjectId.isValid(worldId)) throw invalid("A valid world is required");
    if (typeof armyId !== "string" || !Types.ObjectId.isValid(armyId)) throw invalid("Choose an army");
    // Whose it is comes first, so a stranger learns nothing about the world from what is refused.
    const army = await KingdomBuilderArmyModel.findOne({ _id: armyId, worldId, ownerId: userId }).select({ targetNodeId: 1, besiegingSince: 1 }).lean();
    if (!army) throw new KingdomBuilderPersistenceError("ARMY_NOT_FOUND", "Army not found");
    if (army.besiegingSince === undefined || army.besiegingSince === null) {
        throw new KingdomBuilderPersistenceError("NO_SIEGE", "This army isn't besieging anywhere");
    }

    return runBattle(worldId, userId, "push", async session => {
        const target = await KingdomBuilderSettlementModel.findOne({ worldId, nodeId: army.targetNodeId, ownerId: { $ne: userId } })
            .select({ ownerId: 1, garrison: 1 }).session(session).lean();
        const attackers = await campsAt({ worldId, ownerId: userId, targetNodeId: army.targetNodeId }, session);
        if (!target || !attackers.some(attacker => attacker._id.toString() === armyId)) {
            throw new KingdomBuilderPersistenceError("NO_SIEGE", "The siege ended before the attack could go in");
        }
        const sent = combinedUnits(attackers.map(attacker => attacker.units));
        const faced = garrisonOf(target.garrison);
        const battle = resolveBattle(sent, faced, { fortified: true });
        const { shares, spoils } = await returnSurvivors(worldId, attackers, battle.attacker, session);
        await KingdomBuilderSettlementModel.updateOne({ _id: target._id, worldId }, {
            $set: { garrison: battle.defender },
            ...(spoils.caravans ? { $inc: plundered(spoils) } : {}),
        }, { session });
        shares.push({ ownerId: target.ownerId, sent: faced, left: battle.defender, ...(spoils.caravans ? { caravansTaken: spoils.caravans } : {}) });
        return { nodeId: army.targetNodeId, attackerIds: [userId], defenderIds: [target.ownerId], attacker: sent, defender: faced, shares, battle };
    });
}

/**
 * The defender sallies out (§8): the settlement's whole garrison goes out
 * against every army besieging it, in the open, without its town's defences.
 * Won, the besiegers are destroyed and the siege is lifted, and their
 * caravans and load are brought in. Otherwise
 * whatever is left of the garrison comes home, and whatever is left of the
 * besiegers keeps up the siege.
 */
export async function sallyOut(worldId: string, userId: string, settlementId: unknown): Promise<KingdomBuilderWorldView> {
    if (!Types.ObjectId.isValid(worldId)) throw invalid("A valid world is required");
    if (typeof settlementId !== "string" || !Types.ObjectId.isValid(settlementId)) throw invalid("Choose a settlement");
    const exists = await KingdomBuilderSettlementModel.exists({ _id: settlementId, worldId, ownerId: userId });
    if (!exists) throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement not found");

    return runBattle(worldId, userId, "sally", async session => {
        const settlement = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId, ownerId: userId })
            .select({ nodeId: 1, garrison: 1 }).session(session).lean();
        if (!settlement) throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement not found");
        const sent = garrisonOf(settlement.garrison);
        if (unitCount(sent) === 0) throw new KingdomBuilderPersistenceError("ARMY_BUSY", "There is no garrison to sally out with");
        const besiegers = await campsAt({ worldId, targetNodeId: settlement.nodeId, ownerId: { $ne: userId } }, session);
        if (besiegers.length === 0) throw new KingdomBuilderPersistenceError("NO_SIEGE", "This settlement isn't under siege");
        const faced = combinedUnits(besiegers.map(besieger => besieger.units));
        const battle = resolveBattle(sent, faced, { fortified: false });
        const { shares: besiegerShares, spoils } = await returnSurvivors(worldId, besiegers, battle.defender, session);
        await KingdomBuilderSettlementModel.updateOne({ _id: settlementId, worldId, ownerId: userId }, {
            $set: { garrison: battle.attacker },
            ...(spoils.caravans ? { $inc: plundered(spoils) } : {}),
        }, { session });
        return {
            nodeId: settlement.nodeId, attackerIds: [userId], defenderIds: besiegerShares.map(share => share.ownerId), attacker: sent, defender: faced,
            shares: [{ ownerId: userId, sent, left: battle.attacker, ...(spoils.caravans ? { caravansTaken: spoils.caravans } : {}) }, ...besiegerShares], battle,
        };
    });
}
