import { describe, expect, it } from "vitest";
import { realmArenaRecapAdapter } from "./recap";
import type { IGameEvent } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IHistoryEntry } from "@/utils/games/history";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { battlefieldById } from "./maps";
import { CENTRE, newFighter, type BattleEvent, type Fighter } from "./rules";

// docs/games/realm-arena.md §17.3 PR 8. Snapshot pairs and a command/outcome
// handed to the adapter directly, the DiceCities/RaceCars style;
// replay.test.ts covers the same adapter against real, replayed battles.

const { toEvents, summarize, tip } = realmArenaRecapAdapter;

function state(overrides: Partial<IRealmArenaSpecificGameStateResponse> = {}): IRealmArenaSpecificGameStateResponse {
    return {
        map: "ruinedFort",
        phase: "battle",
        round: 4,
        battleRounds: 15,
        budget: 100,
        fighters: [],
        mustered: ["a", "b"],
        myMuster: null,
        scores: { a: 0, b: 0 },
        ...overrides,
    };
}

function snap(gs: IRealmArenaSpecificGameStateResponse, history: IHistoryEntry[] = [], complete = false): ITurnSnapshot {
    return { index: 0, specificGameState: gs, currentTurn: "", complete, winner: "", history, command: null, planned: false };
}

function cmd(className: string, fields: Record<string, unknown> = {}): IGameCommand {
    return {
        id: "c1",
        timestamp: "2026-10-01T09:00:00.000Z",
        senderId: "a",
        senderUsername: "Alice",
        className,
        myString: () => "acted",
        ...fields,
    } as unknown as IGameCommand;
}

const valid = (events: BattleEvent[] = []): ICommandOutcome => ({ validMove: true, turnOver: false, events } as ICommandOutcome);

const fighters: Fighter[] = [newFighter(0, "a", "archer", 10), newFighter(1, "b", "knight", 20)];
const line = (text: string, actorId?: string): IHistoryEntry => ({ text, actorId, commandId: "c1" });

describe("Realm Arena recap rows", () => {
    it("says a squad was mustered, and nothing of what's in it", () => {
        const before = state({ phase: "muster", mustered: [], fighters: [] });
        const after = state({ phase: "muster", mustered: ["a"], myMuster: [{ character: "mage", square: 3 }] });
        const rows = toEvents(snap(before), snap(after, [line("Alice mustered their squad", "a")]),
            cmd("RealmArenaMuster", { picks: [{ character: "mage", square: 3 }] }), valid());
        expect(rows.map(row => row.title)).toEqual(["Alice mustered their squad"]);
        expect(JSON.stringify(rows)).not.toMatch(/mage|Mage|square/);
    });

    it("starts the battle on the last muster", () => {
        const rows = toEvents(snap(state({ phase: "muster" })), snap(state({ fighters })), cmd("RealmArenaMuster", { senderId: "b", senderUsername: "Bob" }), valid());
        expect(rows.map(row => row.type)).toEqual(["ra_muster", "ra_battle"]);
    });

    it("titles an action with the line the log wrote for it, and names who it hurt", () => {
        const hit: BattleEvent = { kind: "shot", fighter: 0, target: 1, chance: 80, roll: 12, result: "hit", damage: 3, reaction: false };
        const rows = toEvents(
            snap(state({ fighters })),
            snap(state({ fighters }), [line("Alice shot Bob's Knight with their Archer (80%): a hit for 3", "a")]),
            cmd("RealmArenaAct"),
            valid([hit]),
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ type: "ra_hit", title: "Alice shot Bob's Knight with their Archer (80%): a hit for 3", affectedIds: ["b"] });
    });

    it("tells a knock-out over the shot that made it, and the battle's end after it", () => {
        const events: BattleEvent[] = [
            { kind: "shot", fighter: 0, target: 1, chance: 80, roll: 12, result: "hit", damage: 9, reaction: false },
            { kind: "downed", fighter: 1, by: 0 },
            { kind: "scored", player: "a", points: 5, reason: "knockout" },
        ];
        const lines = [line("Alice wins the battle", "a"), line("The battle is over: Alice 5 points, Bob 0 points"), line("Alice shot Bob's Knight: a hit for 9; Bob's Knight is down", "a")];
        const rows = toEvents(snap(state({ fighters })), snap(state({ fighters }), lines, true), cmd("RealmArenaAct"), valid(events));
        expect(rows.map(row => [row.type, row.title])).toEqual([
            ["ra_knockout", "Alice shot Bob's Knight: a hit for 9; Bob's Knight is down"],
            ["ra_won", "Alice wins the battle"],
        ]);
        expect(rows[1].detail).toBe("The battle is over: Alice 5 points, Bob 0 points");
        expect(new Set(rows.map(row => row.id)).size).toBe(2);
    });

    it("ends a turn with what the centre scored and who went on watch", () => {
        const watching = [{ ...fighters[0], banked: 2 }, fighters[1]];
        const rows = toEvents(snap(state({ fighters })), snap(state({ fighters: watching, scores: { a: 5, b: 0 } })), cmd("RealmArenaEndTurn"), valid());
        expect(rows).toEqual([expect.objectContaining({ type: "ra_centre", title: "Alice ended their turn holding the centre, for 5 points", detail: "1 on watch" })]);
        const quiet = toEvents(snap(state({ fighters })), snap(state({ fighters })), cmd("RealmArenaEndTurn"), valid());
        expect(quiet).toEqual([expect.objectContaining({ type: "ra_endturn", title: "Alice ended their turn", detail: undefined })]);
    });

    it("has nothing to say about a refused command", () => {
        expect(toEvents(snap(state()), snap(state()), cmd("RealmArenaAct"), { validMove: false, turnOver: false })).toEqual([]);
    });
});

describe("the summary and the tip", () => {
    const event = (type: string, actorId = "b", affectedIds?: string[]): IGameEvent => ({
        id: type, commandId: type, timestamp: "", actorId, actorUsername: "Bob", type, title: "", affectedIds,
    });

    it("asks a player to muster while the other squad is sealed", () => {
        expect(summarize([event("ra_muster")], "a").headline).toBe("Your turn to muster 👋");
        expect(summarize([event("ra_muster"), event("ra_battle")], "a").headline).toBe("Your move 👋");
    });

    it("leads with the biggest news", () => {
        expect(summarize([event("ra_hit", "b", ["a"]), event("ra_knockout")], "a").subline).toBe("2 things happened while you were away — someone was knocked out.");
        expect(summarize([event("ra_hit", "b", ["a"])], "a").subline).toBe("1 thing happened while you were away — your squad took hits.");
        expect(summarize([event("ra_endturn")], "a").subline).toBe("1 thing happened while you were away.");
    });

    it("says where the battle stands, from the viewer's side", () => {
        const centre = battlefieldById("ruinedFort").objectives[CENTRE][0];
        const gs = state({
            fighters: [newFighter(0, "a", "archer", centre), { ...newFighter(1, "a", "knight", 20), hp: 0 }, newFighter(2, "b", "mage", 30)],
            scores: { a: 2, b: 7 },
        });
        expect(tip!(gs, "a")).toEqual({ glyph: "🏰", text: "You're 5 points behind, with 1 of 2 standing, and the centre is yours." });
        expect(tip!(state({ phase: "muster" }), "a")).toBeNull();
    });
});
