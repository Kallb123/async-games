// The two ways a siege comes to blows (GDD §8, §11.3 PR 21): the besieger
// pushes the attack on the garrison, or the defender sallies out against the
// besiegers. Both resolve with `placeholderBattle` until §7's combat engine
// replaces it (PR 22).

import mongoose, { Types, type ClientSession } from "mongoose";

import { KingdomBuilderArmyModel } from "./KingdomBuilderArmyModel";
import { KingdomBuilderSettlementModel } from "./KingdomBuilderSettlementModel";
import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { unitCount } from "./armies";
import { KingdomBuilderPersistenceError } from "./persistence";
import { combinedUnits, placeholderBattle } from "./siege";
import { garrisonOf, type KingdomBuilderGarrison } from "./units";
import { worldView, type KingdomBuilderWorldView } from "./worldView";

/** How a battle went, told to the side that started it — who only ever learns what they fought. */
export interface KingdomBuilderBattleReport {
    kind: "push" | "sally";
    won: boolean;
    /** What went in on the player's side. */
    sent: KingdomBuilderGarrison;
    /** What it met. */
    faced: KingdomBuilderGarrison;
}

export type KingdomBuilderBattleView = KingdomBuilderWorldView & { battle: KingdomBuilderBattleReport };

function invalid(message: string): KingdomBuilderPersistenceError {
    return new KingdomBuilderPersistenceError("INVALID_INPUT", message);
}

/**
 * Every battle writes the world first, as a dispatch does: the tick writes it
 * too, so a battle and a tick (or a dispatch, or a second battle) at once
 * conflict and one is retried against what the other left — never a garrison
 * that has trained, marched or fought since it was read. It also refuses an
 * ended world.
 */
async function claimBattle(worldId: string, session: ClientSession) {
    const live = await KingdomBuilderWorldModel.updateOne({ _id: worldId, endedAt: null }, { $inc: { battlesFought: 1 } }, { session });
    if (live.modifiedCount !== 1) throw new KingdomBuilderPersistenceError("WORLD_NOT_FOUND", "Kingdom Builder world not found");
}

type Camp = { _id: Types.ObjectId; units: KingdomBuilderGarrison };

/**
 * The besieger pushes the attack (§8): every army of theirs besieging the
 * same settlement goes in together against its garrison. Won, the garrison is
 * destroyed and the siege goes on — taking a settlement is a later rule; lost,
 * the armies are.
 */
export async function pushAttack(worldId: string, userId: string, armyId: unknown): Promise<KingdomBuilderBattleView> {
    if (!Types.ObjectId.isValid(worldId)) throw invalid("A valid world is required");
    if (typeof armyId !== "string" || !Types.ObjectId.isValid(armyId)) throw invalid("Choose an army");
    // Whose it is comes first, so a stranger learns nothing about the world from what is refused.
    const army = await KingdomBuilderArmyModel.findOne({ _id: armyId, worldId, ownerId: userId }).select({ targetNodeId: 1, besiegingSince: 1 }).lean();
    if (!army) throw new KingdomBuilderPersistenceError("ARMY_NOT_FOUND", "Army not found");
    if (army.besiegingSince === undefined || army.besiegingSince === null) {
        throw new KingdomBuilderPersistenceError("NO_SIEGE", "This army isn't besieging anywhere");
    }

    let report: KingdomBuilderBattleReport | undefined;
    await mongoose.connection.transaction(async session => {
        await claimBattle(worldId, session);
        const target = await KingdomBuilderSettlementModel.findOne({ worldId, nodeId: army.targetNodeId, ownerId: { $ne: userId } })
            .select({ garrison: 1 }).session(session).lean();
        const attackers = await KingdomBuilderArmyModel.find({ worldId, ownerId: userId, targetNodeId: army.targetNodeId, besiegingSince: { $ne: null } })
            .select({ units: 1 }).session(session).lean<Camp[]>();
        if (!target || !attackers.some(attacker => attacker._id.toString() === armyId)) {
            throw new KingdomBuilderPersistenceError("NO_SIEGE", "The siege ended before the attack could go in");
        }
        const sent = combinedUnits(attackers.map(attacker => attacker.units));
        const faced = garrisonOf(target.garrison);
        const battle = placeholderBattle(sent, faced);
        if (battle.attackerWon) {
            await KingdomBuilderSettlementModel.updateOne({ _id: target._id, worldId }, { $set: { garrison: battle.defender } }, { session });
        } else {
            await KingdomBuilderArmyModel.deleteMany({ _id: { $in: attackers.map(attacker => attacker._id) }, worldId, ownerId: userId }, { session });
        }
        report = { kind: "push", won: battle.attackerWon, sent, faced };
    });
    return { ...(await worldView(worldId, userId)), battle: report! };
}

/**
 * The defender sallies out (§8): the settlement's whole garrison goes out
 * against every army besieging it, in the open. Won, the besiegers are
 * destroyed and the siege is lifted; lost, the garrison is.
 */
export async function sallyOut(worldId: string, userId: string, settlementId: unknown): Promise<KingdomBuilderBattleView> {
    if (!Types.ObjectId.isValid(worldId)) throw invalid("A valid world is required");
    if (typeof settlementId !== "string" || !Types.ObjectId.isValid(settlementId)) throw invalid("Choose a settlement");
    const exists = await KingdomBuilderSettlementModel.exists({ _id: settlementId, worldId, ownerId: userId });
    if (!exists) throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement not found");

    let report: KingdomBuilderBattleReport | undefined;
    await mongoose.connection.transaction(async session => {
        await claimBattle(worldId, session);
        const settlement = await KingdomBuilderSettlementModel.findOne({ _id: settlementId, worldId, ownerId: userId })
            .select({ nodeId: 1, garrison: 1 }).session(session).lean();
        if (!settlement) throw new KingdomBuilderPersistenceError("SITE_NOT_FOUND", "Settlement not found");
        const sent = garrisonOf(settlement.garrison);
        if (unitCount(sent) === 0) throw new KingdomBuilderPersistenceError("ARMY_BUSY", "There is no garrison to sally out with");
        const besiegers = await KingdomBuilderArmyModel.find({ worldId, targetNodeId: settlement.nodeId, ownerId: { $ne: userId }, besiegingSince: { $ne: null } })
            .select({ units: 1 }).session(session).lean<Camp[]>();
        if (besiegers.length === 0) throw new KingdomBuilderPersistenceError("NO_SIEGE", "This settlement isn't under siege");
        const faced = combinedUnits(besiegers.map(besieger => besieger.units));
        const battle = placeholderBattle(sent, faced);
        if (battle.attackerWon) {
            await KingdomBuilderArmyModel.deleteMany({ _id: { $in: besiegers.map(besieger => besieger._id) }, worldId }, { session });
        } else {
            await KingdomBuilderSettlementModel.updateOne({ _id: settlementId, worldId, ownerId: userId }, { $set: { garrison: battle.attacker } }, { session });
        }
        report = { kind: "sally", won: battle.attackerWon, sent, faced };
    });
    return { ...(await worldView(worldId, userId)), battle: report! };
}
