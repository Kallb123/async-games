import { describe, expect, it, vi } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { PlayerDropped } from "@/utils/games/playerDropout";
import { getReplayAdapter } from "@/utils/games/replay";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { formatGameResultCharts, RealmArenaGameResultModel } from "@/utils/mongodb/GameResultData";
import type { CharacterId } from "./characters";
import { battleRecorder } from "./battleRecord";
import { recordBattle } from "./recordBattle";
import { battleOf as battleOfState } from "./RealmArenaLogic";
import { buildInitialRealmArenaState, computeRealmArenaResultStats, formatRealmArenaResultStats, gameStateToModel, type IRealmArenaGameResultStats, type IRealmArenaSpecificGameState } from "./RealmArenaModels";
import {
    ACTION_POINTS, act, assistPoints, battleFrom, fixedRolls, knockoutPoints, newFighter, startTurn, viewOf,
    type BattleEvent, type BattleState, type Fighter,
} from "./rules";
import { cmd, makeGame, musterAll, play, playScriptedBattle, type RealmArenaTestGame } from "./testFixtures";

// docs/games/realm-arena.md §13.7: a knock-out scores its downer the fallen
// character's points cost ÷ 5, and every other enemy who hurt it since it last
// stood up an assist, half that rounded up — so in a free-for-all hurting
// somebody's character is worth doing even when somebody else finishes it.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));

const OPEN = buildBattlefield({
    name: "Open",
    rows: ["..........", "..........", "..........", "..........", ".........."],
    deployments: [],
    objectives: { centre: { col: 4, row: 1, width: 2, height: 2 } },
});

function ready(id: number, owner: string, character: CharacterId, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square), ap: ACTION_POINTS, ...extra };
}

/** A Knight in the middle with a Man-at-arms of `a`'s, `b`'s and `c`'s on three sides of it: three strikes of 4 down its 12 HP. */
function ringed(assists = true, sides?: BattleState["sides"]): BattleState {
    const fighters = [
        ready(0, "x", "knight", at(OPEN, 4, 2)),
        ready(1, "a", "manAtArms", at(OPEN, 3, 2)),
        ready(2, "b", "manAtArms", at(OPEN, 5, 2)),
        ready(3, "c", "manAtArms", at(OPEN, 4, 1)),
    ];
    return { field: OPEN, fighters, ...(assists ? { assists: true } : {}), ...(sides ? { sides } : {}) };
}

/** Each strike in turn, by the fighter with that id, on the Knight: the battle after them all, and every event. */
function strikes(battle: BattleState, ...by: number[]): { battle: BattleState; events: BattleEvent[] } {
    const events: BattleEvent[] = [];
    for (const fighter of by) {
        const owner = battle.fighters.find(one => one.id === fighter)!.owner;
        const outcome = act(battle, owner, { kind: "attack", fighter, target: 0 }, fixedRolls([]));
        battle = { ...battle, fighters: outcome.fighters };
        events.push(...outcome.events);
    }
    return { battle, events };
}

const scored = (events: readonly BattleEvent[]) => events.filter(event => event.kind === "scored");

describe("assists on a knock-out (§13.7)", () => {
    it("are half the knock-out, rounded up", () => {
        expect(assistPoints("knight")).toBe(3);
        expect(assistPoints("manAtArms")).toBe(2);
        expect(assistPoints("mage")).toBe(3);
        expect(knockoutPoints("knight")).toBe(5);
    });

    it("score every other enemy who hurt the fallen, after the knock-out, in the order they first hurt it", () => {
        const { battle, events } = strikes(ringed(), 2, 1, 3);
        expect(scored(events)).toEqual([
            { kind: "scored", player: "c", points: 5, reason: "knockout" },
            { kind: "scored", player: "b", points: 3, reason: "assist" },
            { kind: "scored", player: "a", points: 3, reason: "assist" },
        ]);
        // Down, it forgets who hurt it: a Raise stands it up with nobody owed.
        expect(battle.fighters[0]).toMatchObject({ hp: 0 });
        expect(battle.fighters[0].woundedBy).toBeUndefined();
    });

    it("remember who has hurt a character, once each, until it's down", () => {
        const { battle, events } = strikes(ringed(), 1, 2);
        expect(scored(events)).toEqual([]);
        expect(battle.fighters[0].woundedBy).toEqual(["a", "b"]);
        // a's second strike takes the Knight to 0: the knock-out, and b's assist.
        const finish = strikes({ ...battle, fighters: battle.fighters.map(one => one.id === 1 ? { ...one, ap: ACTION_POINTS } : one) }, 1);
        expect(scored(finish.events)).toEqual([
            { kind: "scored", player: "a", points: 5, reason: "knockout" },
            { kind: "scored", player: "b", points: 3, reason: "assist" },
        ]);
    });

    it("score nobody but the downer when nobody else hurt it", () => {
        const battle = ringed();
        const hurt = { ...battle, fighters: battle.fighters.map(one => one.id === 0 ? { ...one, hp: 4 } : one) };
        expect(scored(strikes(hurt, 1).events)).toEqual([{ kind: "scored", player: "a", points: 5, reason: "knockout" }]);
    });

    it("score nobody on the downer's side, which the knock-out already scores for (§29.6)", () => {
        // a and b fight as one: c's strike earns c an assist, b's earns nothing more than a's knock-out.
        const { events } = strikes(ringed(true, { a: "team", b: "team" }), 2, 3, 1);
        expect(scored(events)).toEqual([
            { kind: "scored", player: "a", points: 5, reason: "knockout" },
            { kind: "scored", player: "c", points: 3, reason: "assist" },
        ]);
    });

    it("come from burning too, to whoever set it alight (§20.2)", () => {
        const battle = ringed();
        const burning = {
            ...battle,
            fighters: battle.fighters.map(one => one.id === 0 ? { ...one, hp: 1, effects: { burning: 2 }, burnedBy: 3, woundedBy: ["a", "c"] } : one),
        };
        // The burning is c's, so c downs it, and a, who hurt it before, assists.
        expect(scored(startTurn(burning, "x").events)).toEqual([
            { kind: "scored", player: "c", points: 5, reason: "knockout" },
            { kind: "scored", player: "a", points: 3, reason: "assist" },
        ]);
    });

    it("only ever come beside a knock-out: a fire whose setter has left scores nobody (§20.2)", () => {
        const battle = ringed();
        // Fighter 9 isn't on the battlefield: its squad has left it.
        const burning = {
            ...battle,
            fighters: battle.fighters.map(one => one.id === 0 ? { ...one, hp: 1, effects: { burning: 2 }, burnedBy: 9, woundedBy: ["a", "c"] } : one),
        };
        expect(scored(startTurn(burning, "x").events)).toEqual([]);
    });

    it("aren't scored, or remembered, in a battle created before them", () => {
        const { battle, events } = strikes(ringed(false), 2, 1, 3);
        expect(scored(events)).toEqual([{ kind: "scored", player: "c", points: 5, reason: "knockout" }]);
        expect(battle.fighters.some(one => one.woundedBy)).toBe(false);
    });

    it("are kept through every way a battle is built and viewed", () => {
        expect(battleFrom(OPEN, { fighters: [], assists: true }).assists).toBe(true);
        expect(battleFrom(OPEN, { fighters: [] })).toEqual({ field: OPEN, fighters: [] });
        expect(viewOf({ ...ringed(), fog: true }, "a").assists).toBe(true);
        expect(battleOfState(buildInitialRealmArenaState(["a", "b", "c"], {})).assists).toBe(true);
        expect(battleOfState(buildInitialRealmArenaState(["a", "b", "c"], {}, false, undefined, false, false)).assists).toBeUndefined();
    });

    it("are replayed as the battle was created: on since them, and off in a battle from before", () => {
        const adapter = getReplayAdapter("RealmArenaGameType")!;
        const game = makeGame(["a", "b", "c"]);
        expect((adapter.buildInitialSpecificGameState(game) as IRealmArenaSpecificGameState).assists).toBe(true);
        delete game.specificGameState.assists;
        expect((adapter.buildInitialSpecificGameState(game) as IRealmArenaSpecificGameState).assists).toBeUndefined();
    });
});

describe("assists in a battle", () => {
    const own = (game: RealmArenaTestGame, player: string) => game.specificGameState.fighters.filter(one => one.owner === player);

    it("are worked out on the server: who hurt a character is never sent, in fog or out of it, during the battle or after", async () => {
        for (const fog of [false, true]) {
            const game = makeGame(["a", "b", "c"], {}, fog);
            await musterAll(game);
            for (const fighter of game.specificGameState.fighters) fighter.woundedBy = ["a", "b", "c"].filter(owner => owner !== fighter.owner);
            for (const viewer of ["a", "b", null]) {
                for (const complete of [false, true]) {
                    const wire = gameStateToModel(game.specificGameState, viewer, null, complete);
                    // A null viewer sees nobody in fog until the battle is over (§27).
                    if (viewer !== null || !fog || complete) expect(wire.fighters.length).toBeGreaterThan(0);
                    expect(JSON.stringify(wire)).not.toMatch(/woundedBy|assists/);
                }
            }
        }
    });

    it("go to nobody whose squad has left the battlefield (§17.4 B2)", async () => {
        const game = makeGame(["a", "b", "c", "d"]);
        await musterAll(game);
        const [target] = own(game, "d");
        target.woundedBy = ["c", "a"];
        const [other] = own(game, "b");
        other.woundedBy = ["c"];
        for (const player of ["a", "b"]) expect(await resolveStalledTurn(game, player, player)).toBe("advanced");
        expect(await resolveStalledTurn(game, "c", "c")).toBe("advanced");
        expect((await play(game, cmd(PlayerDropped, "c", { resumesWith: game.currentTurn }))).outcome.validMove).toBe(true);
        expect(game.specificGameState.fighters.find(one => one.id === target.id)?.woundedBy).toEqual(["a"]);
        expect(game.specificGameState.fighters.find(one => one.id === other.id)).not.toHaveProperty("woundedBy");
    });

    it("are told by the battle record, and add up with the centre and the knock-outs to every score (§28)", async () => {
        const game = await playScriptedBattle(false, ["a", "b", "c"]);
        const gs = game.specificGameState;
        const record = await recordBattle(game);
        if (!record) throw new Error("the replay failed");
        expect(Object.fromEntries(record.pointsPerRound.at(-1)!)).toEqual(gs.scores);
        for (const userId of gs.seats) {
            const knockouts = record.fighting.filter(row => row.userId === userId).reduce((sum, row) => sum + row.knockoutPoints, 0);
            expect(record.centrePoints.get(userId)! + knockouts + record.assistPoints.get(userId)!).toBe(gs.scores[userId]);
        }
    });
});

describe("assists on the result (§28)", () => {
    const seats = ["a", "b", "c"];
    const battle = (fighters: Fighter[]): IRealmArenaSpecificGameState => ({ ...buildInitialRealmArenaState(seats, {}), phase: "battle", fighters });
    const step = (id: string, events: BattleEvent[]) => ({ command: { className: "RealmArenaAct", id } as never, outcome: { validMove: true, turnOver: false, events } });
    const NAMES = new Map([["a", "Alice"], ["b", "Bob"], ["c", "Carol"]]);

    it("are counted for each player, shown in their lines and as a row of the record table when anybody scored one", () => {
        const archer = newFighter(0, "a", "archer", 0);
        const knight = newFighter(1, "b", "knight", 1);
        const mage = newFighter(2, "c", "mage", 2);
        const recorder = battleRecorder(seats);
        recorder.observe(step("0", []), battle([archer, { ...knight, hp: 3 }, mage]));
        recorder.observe(step("1", [
            { kind: "shot", fighter: archer.id, target: knight.id, chance: 80, roll: 1, result: "hit", damage: 3, reaction: false },
            { kind: "downed", fighter: knight.id, by: archer.id },
            { kind: "scored", player: "a", points: 5, reason: "knockout" },
            { kind: "scored", player: "c", points: 3, reason: "assist" },
        ]), { ...battle([archer, { ...knight, hp: 0 }, mage]), scores: { a: 5, b: 0, c: 3 } });
        const record = recorder.result();
        expect(Object.fromEntries(record.assistPoints)).toEqual({ a: 0, b: 0, c: 3 });

        const stats: IRealmArenaGameResultStats = { mastery: [], ...record };
        const stored = RealmArenaGameResultModel.hydrate(
            new RealmArenaGameResultModel({ gameId: "g", gameType: "RealmArena", stats }).toObject(),
        ).stats as IRealmArenaGameResultStats;
        for (const read of [stats, stored]) {
            const lines = formatRealmArenaResultStats(read, NAMES);
            expect(lines.find(group => group.username === "Carol")?.lines[0]).toBe("3 points: 0 for the centre, 0 for knock-outs, 3 for assists");
            expect(lines.find(group => group.username === "Alice")?.lines[0]).toBe("5 points: 0 for the centre, 5 for knock-outs");
            const table = formatGameResultCharts("RealmArena", read, NAMES).find(chart => chart.kind === "table");
            expect(table?.kind === "table" && table.rows.find(row => row.label === "Points for assists")?.values).toEqual({ a: 0, b: 0, c: 3 });
        }
    });

    it("leave the record table without the row when nobody scored one, as a result recorded before them has none", async () => {
        const game = await playScriptedBattle();
        const record = (await recordBattle(game))!;
        const stats = computeRealmArenaResultStats(game, record);
        const table = formatGameResultCharts("RealmArena", stats, NAMES).find(chart => chart.kind === "table");
        expect(table?.kind === "table" && table.rows.map(row => row.label)).not.toContain("Points for assists");
        const { assistPoints: _assistPoints, ...before } = stats;
        expect(formatGameResultCharts("RealmArena", before, NAMES)).toHaveLength(4);
    });
});
