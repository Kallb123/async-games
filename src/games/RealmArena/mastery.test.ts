import { describe, expect, it, vi } from "vitest";
import { getReplayAdapter } from "@/utils/games/replay";
import { RealmArenaGameResultModel } from "@/utils/mongodb/GameResultData";
import { RANK_XP, rankOf, xpOf, type MasterySnapshot } from "./mastery";
import { masterySnapshotOf } from "./masteryRecord";
import {
    computeRealmArenaResultStats,
    formatRealmArenaResultStats,
    RealmArenaGameDataModel,
    RealmArenaInvitationModel,
    type IRealmArenaGameData,
} from "./RealmArenaModels";
import { RealmArenaUndo, tallied } from "./RealmArenaLogic";
import { newFighter, type Action, type BattleEvent, type Fighter } from "./rules";
import { actBy, cmd, makeGame, musterAll, play, PLAYERS } from "./testFixtures";

// Character mastery (docs/games/realm-arena.md §23), PR 1: the tally each
// fighter keeps, the result stats that keep it once the battle is over, the
// XP and ranks read from them, and the ranks a battle is created with.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));

describe("XP and ranks (§23.1)", () => {
    it("pays a little for being there, and more for each attack, ability and item", () => {
        expect(xpOf({ battles: 1, attacks: 0, abilities: 0, items: 0 })).toBe(2);
        expect(xpOf({ battles: 2, attacks: 4, abilities: 1, items: 1 })).toBe(4 + 12 + 5 + 3);
    });

    it("reaches each rank at its threshold, and not a point before", () => {
        expect(rankOf(0)).toBe(0);
        for (const [index, threshold] of RANK_XP.entries()) {
            expect(rankOf(threshold - 1)).toBe(index);
            expect(rankOf(threshold)).toBe(index + 1);
        }
        expect(rankOf(10_000)).toBe(3);
    });
});

describe("the tally (§23.3)", () => {
    const fighters: Fighter[] = [
        newFighter(0, "a", "manAtArms", 0),
        newFighter(1, "a", "cleric", 1),
        newFighter(2, "b", "archer", 2),
        newFighter(3, "b", "knight", 3),
    ];
    const tallyOf = (after: Fighter[], id: number) => after.find(one => one.id === id)!.tally;

    it("counts an attack, an ability and an item for whoever took it, whatever it rolled", () => {
        const miss: BattleEvent = { kind: "shot", fighter: 2, target: 0, chance: 50, roll: 99, result: "miss", damage: 0, reaction: false };
        expect(tallyOf(tallied(fighters, { kind: "attack", fighter: 2, target: 0 }, [miss]), 2)).toEqual({ attacks: 1, abilities: 0, items: 0 });
        expect(tallyOf(tallied(fighters, { kind: "heal", fighter: 1, target: 0 }, []), 1)).toEqual({ attacks: 0, abilities: 1, items: 0 });
        expect(tallyOf(tallied(fighters, { kind: "draught", fighter: 1, target: 1 }, []), 1)).toEqual({ attacks: 0, abilities: 0, items: 1 });
    });

    it("counts a cleave as one ability, however many it strikes", () => {
        const strikes: BattleEvent[] = [2, 3].map(target => ({ kind: "struck", fighter: 0, target, damage: 2, reaction: false }));
        expect(tallyOf(tallied(fighters, { kind: "cleave", fighter: 0, targets: [2, 3] }, strikes), 0)).toEqual({ attacks: 0, abilities: 1, items: 0 });
    });

    it("counts nothing for moving, sneaking, hunkering down or going on watch", () => {
        const actions: Action[] = [
            { kind: "move", fighter: 0, path: [0, 4] },
            { kind: "sneak", fighter: 0, path: [0, 4] },
            { kind: "hunker", fighter: 0 },
            { kind: "watch", fighter: 0 },
        ];
        for (const action of actions) expect(tallied(fighters, action, [])).toEqual(fighters);
    });

    it("counts a reaction as an attack for the watcher, during the mover's command", () => {
        const events: BattleEvent[] = [
            { kind: "moved", fighter: 0, path: [0, 4], sneaking: false },
            { kind: "shot", fighter: 2, target: 0, chance: 40, roll: 10, result: "hit", damage: 3, reaction: true },
            { kind: "struck", fighter: 3, target: 0, damage: 2, reaction: true },
        ];
        const after = tallied(fighters, { kind: "move", fighter: 0, path: [0, 4, 8] }, events);
        expect(tallyOf(after, 0)).toBeUndefined();
        expect(tallyOf(after, 2)).toEqual({ attacks: 1, abilities: 0, items: 0 });
        expect(tallyOf(after, 3)).toEqual({ attacks: 1, abilities: 0, items: 0 });
    });

    it("adds to what a fighter has already done, and leaves the fighters it was given alone", () => {
        const veteran = [{ ...fighters[0], tally: { attacks: 2, abilities: 1, items: 0 } }];
        const after = tallied(veteran, { kind: "attack", fighter: 0, target: 2 }, []);
        expect(after[0].tally).toEqual({ attacks: 3, abilities: 1, items: 0 });
        expect(veteran[0].tally).toEqual({ attacks: 2, abilities: 1, items: 0 });
    });

    it("is kept by the command that acts, and undo takes it back with the action", async () => {
        const game = makeGame();
        await musterAll(game);
        const knight = game.specificGameState.fighters.find(one => one.owner === "a" && one.character === "knight")!;

        expect((await play(game, actBy("a", { kind: "shieldWall", fighter: knight.id }))).outcome.validMove).toBe(true);
        expect(game.specificGameState.fighters.find(one => one.id === knight.id)!.tally).toEqual({ attacks: 0, abilities: 1, items: 0 });

        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
        expect(game.specificGameState.fighters.find(one => one.id === knight.id)!.tally).toBeUndefined();
    });
});

describe("the result stats (§23.3)", () => {
    function finished(fighters: Fighter[], seats = PLAYERS): IRealmArenaGameData {
        const game = makeGame(seats);
        game.specificGameState.phase = "battle";
        game.specificGameState.fighters = fighters;
        return game;
    }

    it("keeps a row for each kind each player fought with, pooling two of a kind, downed or not", () => {
        const stats = computeRealmArenaResultStats(finished([
            { ...newFighter(0, "a", "manAtArms", 0), tally: { attacks: 2, abilities: 1, items: 0 } },
            { ...newFighter(1, "a", "manAtArms", 1), hp: 0, tally: { attacks: 1, abilities: 0, items: 1 } },
            newFighter(2, "a", "cleric", 2),
            { ...newFighter(3, "b", "archer", 3), tally: { attacks: 4, abilities: 0, items: 0 } },
        ]));
        expect(stats.mastery).toEqual([
            { userId: "a", character: "manAtArms", attacks: 3, abilities: 1, items: 1 },
            { userId: "a", character: "cleric", attacks: 0, abilities: 0, items: 0 },
            { userId: "b", character: "archer", attacks: 4, abilities: 0, items: 0 },
        ]);
    });

    it("has no rows for a battle given up during the muster", () => {
        expect(computeRealmArenaResultStats(makeGame()).mastery).toEqual([]);
    });

    it("are kept by the result's schema, as rows with no ids of their own", () => {
        const row = { userId: "a", character: "knight", attacks: 1, abilities: 2, items: 0 };
        const result = new RealmArenaGameResultModel({ gameId: "g", gameType: "RealmArena", stats: { mastery: [row] } });
        expect(result.toObject().stats.mastery).toEqual([row]);
    });

    it("show each player the XP each of their characters earned", () => {
        const groups = formatRealmArenaResultStats({
            mastery: [
                { userId: "a", character: "knight", attacks: 2, abilities: 1, items: 0 },
                { userId: "b", character: "archer", attacks: 0, abilities: 0, items: 0 },
            ],
        }, new Map([["a", "Alice"], ["b", "Bob"]]));
        expect(groups).toEqual([
            { username: "Alice", lines: ["Knight: 13 XP"] },
            { username: "Bob", lines: ["Archer: 2 XP"] },
        ]);
    });
});

describe("the ranks a battle is created with (§23.3)", () => {
    const RANKS: MasterySnapshot = { a: { knight: 2, archer: 1 } };

    it("are looked up for the whole party as the battle is created, and kept", async () => {
        vi.mocked(masterySnapshotOf).mockResolvedValueOnce(RANKS);
        const createGame = RealmArenaInvitationModel.schema.methods.CreateGame as
            (this: unknown, invite: unknown, userIdList: string[]) => Promise<IRealmArenaGameData>;
        const invite = { turnTimer: 0 };
        const gameData = await createGame.call(invite, invite, ["a", "b"]);

        expect(vi.mocked(masterySnapshotOf)).toHaveBeenCalledWith(gameData.gameState.turnOrder);
        expect(gameData.specificGameState.mastery).toEqual(RANKS);
    });

    it("are kept by the game's schema", () => {
        const game = makeGame(PLAYERS, RANKS);
        const { markModified: _, ...data } = game;
        expect(new RealmArenaGameDataModel(data).toObject().specificGameState.mastery).toEqual(RANKS);
    });

    it("are read back by a replay from the live game, which never changes them", async () => {
        const game = makeGame(PLAYERS, RANKS);
        await musterAll(game);
        expect(game.specificGameState.mastery).toEqual(RANKS);

        const adapter = getReplayAdapter("RealmArenaGameType")!;
        expect(adapter.buildInitialSpecificGameState(game)).toMatchObject({ mastery: RANKS });
        // A game created before mastery has none, which is nobody ranked.
        const older = makeGame();
        delete (older.specificGameState as Partial<IRealmArenaGameData["specificGameState"]>).mastery;
        expect(adapter.buildInitialSpecificGameState(older)).toMatchObject({ mastery: {} });
    });

    it("keep only the seats' own ranks, copied rather than shared", () => {
        const game = makeGame(PLAYERS, { ...RANKS, stranger: { mage: 3 } });
        expect(game.specificGameState.mastery).toEqual(RANKS);
        expect(game.specificGameState.mastery.a).not.toBe(RANKS.a);
    });
});
