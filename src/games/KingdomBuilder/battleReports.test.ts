import { Types } from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KingdomBuilderBattleModel } from "./KingdomBuilderBattleModel";
import { KINGDOM_BUILDER_BATTLE_REPORTS, recentBattles, reportFor } from "./battleReports";
import { garrisonOf } from "./units";

afterEach(() => vi.restoreAllMocks());

// Attacker 4 militia against 2 infantry: two militia fall in round one, one
// infantryman in each of two rounds, and the other two militia in round two.
const battleId = new Types.ObjectId();
const battle = {
    _id: battleId, kind: "push" as const, tick: 9, nodeId: "town", attackerIds: ["attacker"], defenderIds: ["defender"],
    attacker: garrisonOf({ militia: 4 }), defender: garrisonOf({ infantry: 2 }),
    rounds: [
        { attacker: garrisonOf({ militia: 2 }), defender: garrisonOf({ infantry: 1 }) },
        { attacker: garrisonOf({ militia: 1 }), defender: garrisonOf({ infantry: 1 }) },
    ],
    shares: [
        { ownerId: "attacker", sent: garrisonOf({ militia: 4 }), left: garrisonOf({ militia: 1 }) },
        { ownerId: "defender", sent: garrisonOf({ infantry: 2 }), left: garrisonOf() },
    ],
};

describe("reportFor", () => {
    it("tells the side that started it their own units first", () => {
        expect(reportFor(battle, "attacker")).toEqual({
            battleId: battleId.toString(), kind: "push", tick: 9, nodeId: "town", started: true, outcome: "won",
            sent: garrisonOf({ militia: 4 }), faced: garrisonOf({ infantry: 2 }),
            left: garrisonOf({ militia: 1 }), faceLeft: garrisonOf(),
            rounds: [
                { lost: garrisonOf({ militia: 2 }), killed: garrisonOf({ infantry: 1 }) },
                { lost: garrisonOf({ militia: 1 }), killed: garrisonOf({ infantry: 1 }) },
            ],
        });
    });

    it("tells the other side the same battle turned round", () => {
        const report = reportFor(battle, "defender");
        expect(report).toMatchObject({ started: false, outcome: "lost", sent: garrisonOf({ infantry: 2 }), left: garrisonOf(), faceLeft: garrisonOf({ militia: 1 }) });
        expect(report.rounds[0]).toEqual({ lost: garrisonOf({ infantry: 1 }), killed: garrisonOf({ militia: 2 }) });
    });

    it("calls it held while both sides still stand", () => {
        const held = { ...battle, rounds: battle.rounds.slice(0, 1), shares: [
            { ownerId: "attacker", sent: garrisonOf({ militia: 4 }), left: garrisonOf({ militia: 2 }) },
            { ownerId: "defender", sent: garrisonOf({ infantry: 2 }), left: garrisonOf({ infantry: 1 }) },
        ] };
        expect(reportFor(held, "defender").outcome).toBe("held");
    });

    it("tells a besieger sharing a side only their own units, and not the side's losses round by round", () => {
        // A sally against two players' armies: "one" brought 2 militia, "two" 3 cavalry.
        const sally = {
            _id: battleId, kind: "sally" as const, tick: 9, nodeId: "town", attackerIds: ["defender"], defenderIds: ["one", "two"],
            attacker: garrisonOf({ infantry: 6 }), defender: garrisonOf({ militia: 2, cavalry: 3 }),
            rounds: [{ attacker: garrisonOf({ infantry: 2 }), defender: garrisonOf({ militia: 2, cavalry: 1 }) }],
            shares: [
                { ownerId: "defender", sent: garrisonOf({ infantry: 6 }), left: garrisonOf({ infantry: 4 }) },
                { ownerId: "one", sent: garrisonOf({ militia: 2 }), left: garrisonOf() },
                { ownerId: "two", sent: garrisonOf({ cavalry: 3 }), left: garrisonOf({ cavalry: 2 }) },
            ],
        };
        const one = reportFor(sally, "one");
        expect(one).toMatchObject({ outcome: "lost", sent: garrisonOf({ militia: 2 }), left: garrisonOf(), faced: garrisonOf({ infantry: 6 }) });
        expect(one.rounds).toEqual([{ killed: garrisonOf({ infantry: 2 }) }]);
        expect(JSON.stringify(one)).not.toContain('"cavalry":3');
        expect(reportFor(sally, "two")).toMatchObject({ outcome: "held", sent: garrisonOf({ cavalry: 3 }), left: garrisonOf({ cavalry: 2 }) });
        // The garrison's owner fought them all at their gate, and reads the whole of it.
        expect(reportFor(sally, "defender").rounds[0].lost).toEqual(garrisonOf({ infantry: 2 }));
    });
});

describe("reportFor a raid (§4.7)", () => {
    const raid = {
        _id: battleId, kind: "raid" as const, tick: 9, nodeId: "town", attackerIds: ["raider"], defenderIds: ["trader"],
        attacker: garrisonOf(), defender: garrisonOf(), rounds: [],
        shares: [
            { ownerId: "raider", sent: garrisonOf({ cavalry: 2 }), left: garrisonOf({ cavalry: 2 }), caravansTaken: 3 },
            { ownerId: "trader", sent: garrisonOf(), left: garrisonOf(), caravansLost: 3 },
        ],
    };

    it("tells the taker they won the caravans", () => {
        expect(reportFor(raid, "raider")).toMatchObject({ kind: "raid", started: true, outcome: "won", caravansTaken: 3 });
    });

    it("tells the loser their caravans are gone, and nothing of the army that took them", () => {
        const report = reportFor(raid, "trader");
        expect(report).toMatchObject({ started: false, outcome: "lost", caravansLost: 3, faced: garrisonOf() });
        expect(report).not.toHaveProperty("caravansTaken");
        expect(JSON.stringify(report)).not.toContain('"cavalry":2');
    });

    it("tells each side of settlers taken only their own half, and the loser nothing of the taker (PR 24)", () => {
        const settlers = {
            ...raid,
            shares: [
                { ownerId: "raider", sent: garrisonOf({ cavalry: 2 }), left: garrisonOf({ cavalry: 2 }), settlersTaken: 1 },
                { ownerId: "trader", sent: garrisonOf(), left: garrisonOf(), settlersLost: 1 },
            ],
        };
        expect(reportFor(settlers, "raider")).toMatchObject({ settlersTaken: 1 });
        expect(reportFor(settlers, "raider")).not.toHaveProperty("settlersLost");
        const lost = reportFor(settlers, "trader");
        expect(lost).toMatchObject({ outcome: "lost", settlersLost: 1 });
        expect(lost).not.toHaveProperty("settlersTaken");
        expect(JSON.stringify(lost)).not.toContain('"cavalry":2');
    });

    it("tells only the loser of the commanders killed with no escort, and the taker nothing of them (PR 26)", () => {
        const commanders = {
            ...raid,
            shares: [
                { ownerId: "raider", sent: garrisonOf({ cavalry: 2 }), left: garrisonOf({ cavalry: 2 }), caravansTaken: 1 },
                { ownerId: "trader", sent: garrisonOf(), left: garrisonOf(), caravansLost: 1, commandersLost: 1 },
            ],
        };
        const taker = reportFor(commanders, "raider");
        expect(taker).not.toHaveProperty("commandersLost");
        expect(JSON.stringify(taker)).not.toContain("commander\":1");
        expect(reportFor(commanders, "trader")).toMatchObject({ outcome: "lost", commandersLost: 1 });
    });

    it("names no place for a raid on the road", () => {
        const { nodeId: _, ...onTheRoad } = raid;
        expect(reportFor(onTheRoad, "raider")).not.toHaveProperty("nodeId");
    });
});

describe("recentBattles", () => {
    it("reads only the viewer's own battles, from either side, newest first and a handful at most", async () => {
        const limit = vi.fn(() => ({ select: () => ({ lean: async () => [battle] }) }));
        const find = vi.spyOn(KingdomBuilderBattleModel, "find").mockReturnValue({ sort: () => ({ limit }) } as never);

        const reports = await recentBattles("world", "defender");

        expect(find).toHaveBeenCalledWith({ worldId: "world", $or: [{ attackerIds: "defender" }, { defenderIds: "defender" }] });
        expect(limit).toHaveBeenCalledWith(KINGDOM_BUILDER_BATTLE_REPORTS);
        expect(reports.map(report => report.started)).toEqual([false]);
    });
});

describe("reportFor a skirmish with a scout escort (§6.5)", () => {
    const skirmish = {
        _id: battleId, kind: "skirmish" as const, tick: 9, attackerIds: ["raider"], defenderIds: ["scout"],
        attacker: garrisonOf({ militia: 2 }), defender: garrisonOf({ scout: 1 }),
        rounds: [{ attacker: garrisonOf(), defender: garrisonOf({ scout: 1 }) }],
        shares: [
            { ownerId: "raider", sent: garrisonOf({ militia: 2 }), left: garrisonOf({ militia: 2 }), settlersTaken: 2 },
            { ownerId: "scout", sent: garrisonOf({ scout: 1 }), left: garrisonOf(), settlersLost: 2, commandersLost: 3 },
        ],
    };

    it("shows the taker only the scouts it fought and what it took", () => {
        const report = reportFor(skirmish, "raider");
        expect(report).toMatchObject({ kind: "skirmish", outcome: "won", faced: garrisonOf({ scout: 1 }), settlersTaken: 2 });
        expect(report).not.toHaveProperty("commandersLost");
        expect(report).not.toHaveProperty("nodeId");
    });

    it("shows the loser the army that beat their scouts, as any battle does", () => {
        expect(reportFor(skirmish, "scout")).toMatchObject({ outcome: "lost", faced: garrisonOf({ militia: 2 }), settlersLost: 2, commandersLost: 3 });
    });
});
