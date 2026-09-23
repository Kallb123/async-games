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
    _id: battleId, kind: "push" as const, tick: 9, nodeId: "town", attackerIds: ["attacker"],
    attacker: garrisonOf({ militia: 4 }), defender: garrisonOf({ infantry: 2 }),
    rounds: [
        { attacker: garrisonOf({ militia: 2 }), defender: garrisonOf({ infantry: 1 }) },
        { attacker: garrisonOf({ militia: 1 }), defender: garrisonOf({ infantry: 1 }) },
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
        expect(reportFor({ ...battle, rounds: battle.rounds.slice(0, 1) }, "defender").outcome).toBe("held");
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
