import { describe, expect, it, vi } from "vitest";
import { replayTurnByTurn } from "@/utils/games/replay";
import { formatGameResultCharts, formatGameResultStats, RealmArenaGameResultModel } from "@/utils/mongodb/GameResultData";
import { battleRecorder, NO_RECORD, type BattleRecord } from "./battleRecord";
import {
    buildInitialRealmArenaState,
    computeRealmArenaResultStats,
    formatRealmArenaCharts,
    formatRealmArenaResultStats,
    type IRealmArenaGameResultStats,
    type IRealmArenaSpecificGameState,
} from "./RealmArenaModels";
import { CHARACTER_IDS } from "./roster";
import { battleRounds, isStanding, knockoutPoints, newFighter, type BattleEvent, type Fighter } from "./rules";
import { PLAYERS, playScriptedBattle, type RealmArenaTestGame } from "./testFixtures";

// docs/games/realm-arena.md §28: the battle's record, read off the events of
// every step of the game-end replay, and the result page's charts drawn from it.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));

const NAMES = new Map([["a", "Alice"], ["b", "Bob"]]);

/** The record the result keeps, read off a whole battle's replay as GameResultData.ts reads it. */
async function recordOf(game: RealmArenaTestGame): Promise<BattleRecord> {
    const recorder = battleRecorder(game.specificGameState.seats);
    const replayed = await replayTurnByTurn(game, (step, _turn, _first, gs) => recorder.observe(step, gs as IRealmArenaSpecificGameState), "test");
    if (!replayed) throw new Error("the replay failed");
    return recorder.result();
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe("the battle record, read off a whole battle (§28)", () => {
    it("adds up to the battle as it was fought", async () => {
        const game = await playScriptedBattle();
        const gs = game.specificGameState;
        const record = await recordOf(game);

        // A round apiece, the last ending on the scores the battle did.
        expect(record.pointsPerRound).toHaveLength(Math.min(gs.roundsPlayed + 1, battleRounds(PLAYERS.length)));
        expect(Object.fromEntries(record.pointsPerRound.at(-1)!)).toEqual(gs.scores);
        // …and on each squad's HP as it was left.
        for (const userId of PLAYERS) {
            expect(record.squadHpPerRound.at(-1)!.get(userId)).toBe(sum(gs.fighters.filter(one => one.owner === userId).map(one => one.hp)));
        }

        // Every point is the centre's or a knock-out's.
        for (const userId of PLAYERS) {
            const own = record.fighting.filter(row => row.userId === userId);
            expect(record.centrePoints.get(userId)! + sum(own.map(row => row.knockoutPoints))).toBe(gs.scores[userId]);
        }

        // Every HP lost was dealt by someone, and every downed character fell where its owner's line shows it.
        expect(sum(record.fighting.map(row => row.dealt + row.friendlyFire))).toBe(sum(record.fighting.map(row => row.taken)));
        const downed = gs.fighters.filter(one => !isStanding(one));
        expect(downed.length).toBeGreaterThan(0);
        expect(sum(record.fighting.map(row => row.downed))).toBe(downed.length);
        expect(record.losses).toHaveLength(downed.length);
        for (const loss of record.losses) {
            expect(loss.icon).toBe("knockout");
            expect(PLAYERS).toContain(loss.seriesKey);
            expect(loss.turnIndex).toBeLessThan(record.pointsPerRound.length);
        }

        // A row for every kind each player fought with, in seat order and then the muster's.
        expect(record.fighting.map(row => `${row.userId} ${row.character}`)).toEqual(PLAYERS.flatMap(userId => CHARACTER_IDS
            .filter(character => gs.fighters.some(one => one.owner === userId && one.character === character))
            .map(character => `${userId} ${character}`)));
        expect(sum(record.fighting.map(row => row.shots))).toBeGreaterThanOrEqual(sum(record.fighting.map(row => row.landed)));
    });

    it("is kept on the result, and drawn as the points race, each squad's health, the damage by character and the record table", async () => {
        const game = await playScriptedBattle();
        const stats = computeRealmArenaResultStats(game, await recordOf(game));
        const stored = RealmArenaGameResultModel.hydrate(
            new RealmArenaGameResultModel({ gameId: "g", gameType: "RealmArena", stats }).toObject(),
        ).stats as IRealmArenaGameResultStats;

        for (const read of [stats, stored]) {
            const charts = formatGameResultCharts("RealmArena", read, NAMES);
            expect(charts.map(chart => chart.title)).toEqual(["Points per round", "Squad health per round", "Damage by character", "Battle record"]);
            const [points, , damage, table] = charts;
            if (points.kind || damage.kind !== "bar" || table.kind !== "table") throw new Error("the wrong kinds of chart");
            expect(points.rounds.at(-1)).toEqual(game.specificGameState.scores);
            expect(points.events).toHaveLength(stats.losses!.length);
            expect(sum(damage.bars.map(bar => bar.value))).toBe(sum(stats.fighting!.map(row => row.dealt)));
            for (const bar of damage.bars) expect(sum(Object.values(bar.segments ?? {}))).toBe(bar.value);
            expect(table.rows.find(row => row.label === "Damage dealt")?.values).toEqual(Object.fromEntries(PLAYERS.map(userId =>
                [userId, sum(stats.fighting!.filter(row => row.userId === userId).map(row => row.dealt))])));
        }
        expect(formatGameResultStats("RealmArena", stored, NAMES)).toEqual(formatRealmArenaResultStats(stats, NAMES));
    });

    it("is left out when the replay didn't end where the battle did", async () => {
        const game = await playScriptedBattle();
        const record = await recordOf(game);
        record.pointsPerRound.at(-1)!.set("a", -1);
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const stats = computeRealmArenaResultStats(game, record);
        warn.mockRestore();
        expect(Object.keys(stats)).toEqual(["mastery"]);
        expect(formatRealmArenaCharts(stats)).toEqual([]);
    });
});

describe("the battle recorder (§28)", () => {
    /** The battle with these fighters on it, after a step. */
    function battle(fighters: Fighter[], fields: Partial<IRealmArenaSpecificGameState> = {}): IRealmArenaSpecificGameState {
        return { ...buildInitialRealmArenaState(PLAYERS, {}), phase: "battle", fighters, ...fields };
    }
    const act = (id: string, events: BattleEvent[]) => ({ command: { className: "RealmArenaAct", id } as never, outcome: { validMove: true, turnOver: false, events } });
    const cleric = newFighter(0, "a", "cleric", 0);
    const knight = newFighter(1, "a", "knight", 1);
    const archer = newFighter(2, "b", "archer", 2);
    const mage = newFighter(3, "b", "mage", 3);

    it("counts only the HP a hit took, and burning for whoever set it, and a blast on an ally as friendly fire", () => {
        const recorder = battleRecorder(PLAYERS);
        const hurt = { ...knight, hp: 2, burnedBy: mage.id };
        recorder.observe(act("0", []), battle([cleric, hurt, archer, mage]));
        recorder.observe(act("1", [
            { kind: "burned", fighter: knight.id, damage: 1 },
            { kind: "shot", fighter: archer.id, target: knight.id, chance: 50, roll: 1, result: "hit", damage: 4, reaction: false },
            { kind: "downed", fighter: knight.id, by: archer.id },
            { kind: "fireball", fighter: mage.id, at: 0, targets: [archer.id], damage: 3 },
        ]), battle([cleric, { ...knight, hp: 0 }, { ...archer, hp: archer.hp - 3 }, mage], { scores: { a: 0, b: knockoutPoints("knight") } }));

        const { fighting, losses, pointsPerRound } = recorder.result();
        const row = (userId: string, character: string) => fighting.find(one => one.userId === userId && one.character === character);
        expect(row("b", "mage")).toMatchObject({ dealt: 1, friendlyFire: 3 });
        expect(row("b", "archer")).toMatchObject({ dealt: 1, taken: 3, shots: 1, landed: 1, knockouts: 1, knockoutPoints: knockoutPoints("knight") });
        expect(row("a", "knight")).toMatchObject({ taken: 2, downed: 1 });
        expect(losses).toEqual([{ turnIndex: 0, icon: "knockout", title: "Knight downed by an enemy Archer", seriesKey: "a" }]);
        expect(Object.fromEntries(pointsPerRound[0])).toEqual({ a: 0, b: knockoutPoints("knight") });
    });

    it("takes back the healing of an action that was undone, and keeps it once the undo stack lets it go", () => {
        const hurt = { ...knight, hp: 3 };
        const heal: BattleEvent = { kind: "healed", fighter: cleric.id, target: knight.id, hp: 4 };
        const entry = { by: "a", state: battle([]) };
        const healedFor = (...steps: [ReturnType<typeof act> | { command: never; outcome: never }, IRealmArenaSpecificGameState][]) => {
            const recorder = battleRecorder(PLAYERS);
            recorder.observe(act("0", []), battle([cleric, hurt, archer]));
            for (const [step, gs] of steps) recorder.observe(step, gs);
            return recorder.result().fighting.find(row => row.character === "cleric")?.healed;
        };
        const healed = battle([cleric, { ...hurt, hp: 7 }, archer], { undoStack: [entry], undoAnchorId: "heal" });
        const undo = { command: { className: "RealmArenaUndo", id: "undo" } as never, outcome: { validMove: true, turnOver: false } as never };

        expect(healedFor([act("heal", [heal]), healed])).toBe(4);
        expect(healedFor([act("heal", [heal]), healed], [undo, battle([cleric, hurt, archer], { undoAnchorId: "undo" })])).toBe(0);
        // An attack after it empties the game's stack, so the heal can't be taken back any more.
        expect(healedFor(
            [act("heal", [heal]), healed],
            [act("attack", [{ kind: "struck", fighter: knight.id, target: archer.id, damage: 1, reaction: false }]), battle([cleric, { ...hurt, hp: 7 }, { ...archer, hp: archer.hp - 1 }])],
        )).toBe(4);
    });

    it("has a row of nothing for a character that did nothing, and nothing at all before the battle", () => {
        const recorder = battleRecorder(PLAYERS);
        recorder.observe(act("0", []), { ...battle([cleric]), phase: "muster" });
        expect(recorder.result().fighting).toEqual([]);
        recorder.observe(act("1", []), battle([cleric]));
        expect(recorder.result().fighting).toEqual([{ userId: "a", character: "cleric", ...NO_RECORD }]);
    });
});

describe("a result without the record (§28)", () => {
    it("shows the XP alone, and no charts", () => {
        const stats: IRealmArenaGameResultStats = { mastery: [{ userId: "a", character: "knight", attacks: 2, abilities: 1, items: 0 }] };
        expect(formatRealmArenaResultStats(stats, NAMES)).toEqual([{ username: "Alice", lines: ["Knight: 13 XP"] }]);
        expect(formatRealmArenaCharts(stats)).toEqual([]);
        const stored = new RealmArenaGameResultModel({ gameId: "g", gameType: "RealmArena", stats }).toObject().stats;
        expect(stored.fighting).toBeUndefined();
        expect(stored.centrePoints).toBeUndefined();
        expect(formatRealmArenaCharts(stored)).toEqual([]);
    });
});
