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
        blasted: [],
        mustered: ["a", "b"],
        myMuster: null,
        mastery: {},
        scores: { a: 0, b: 0 },
        canUndo: false,
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
        const after = state({ phase: "muster", mustered: ["a"], myMuster: [{ character: "mage", square: 3, item: "smokePot" }] });
        const rows = toEvents(snap(before), snap(after, [line("Alice mustered their squad", "a")]),
            cmd("RealmArenaMuster", { picks: [{ character: "mage", square: 3, item: "smokePot" }] }), valid());
        expect(rows.map(row => row.title)).toEqual(["Alice mustered their squad"]);
        expect(JSON.stringify(rows)).not.toMatch(/mage|Mage|square|smoke|💨/i);
    });

    it("starts the battle on the last muster", () => {
        const rows = toEvents(snap(state({ phase: "muster" })), snap(state({ fighters })), cmd("RealmArenaMuster", { senderId: "b", senderUsername: "Bob" }), valid());
        expect(rows.map(row => row.type)).toEqual(["ra_muster", "ra_battle"]);
    });

    it("tells a thrown item by its glyph, naming who it hurt, and a smoke pot as hurting nobody", () => {
        const act = (event: BattleEvent) => toEvents(snap(state({ fighters })), snap(state({ fighters }), [line("Alice threw an item", "a")]), cmd("RealmArenaAct"), valid([event]))[0];
        expect(act({ kind: "thrown", fighter: 0, item: "fireFlask", at: 20, targets: [1], damage: 2 })).toMatchObject({ type: "ra_thrown", glyph: "🔥", affectedIds: ["b"] });
        expect(act({ kind: "thrown", fighter: 0, item: "smokePot", at: 20, targets: [], damage: 0 })).toMatchObject({ type: "ra_thrown", glyph: "💨", affectedIds: [] });
        expect(act({ kind: "healed", fighter: 0, target: 0, hp: 3, via: "draught" })).toMatchObject({ type: "ra_healed", glyph: "🧪" });
    });

    it("tells a Demolish that struck someone as a hit, naming who, and one that struck nobody as a manoeuvre (§23.2)", () => {
        const act = (event: BattleEvent) => toEvents(snap(state({ fighters })), snap(state({ fighters }), [line("Alice used Demolish", "a")]), cmd("RealmArenaAct"), valid([event]))[0];
        expect(act({ kind: "demolished", fighter: 0, at: 20, targets: [1], damage: 2 })).toMatchObject({ type: "ra_hit", glyph: "💥", affectedIds: ["b"] });
        expect(act({ kind: "demolished", fighter: 0, at: 20, targets: [], damage: 2 })).toMatchObject({ type: "ra_manoeuvre", affectedIds: [] });
        expect(act({ kind: "healed", fighter: 0, target: 0, hp: 2, via: "purify" })).toMatchObject({ type: "ra_healed", glyph: "✚" });
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
        const centre: BattleEvent = { kind: "scored", player: "a", points: 5, reason: "centre" };
        const rows = toEvents(snap(state({ fighters })), snap(state({ fighters: watching, scores: { a: 5, b: 0 } })), cmd("RealmArenaEndTurn"), valid([centre]));
        expect(rows).toEqual([expect.objectContaining({ type: "ra_centre", title: "Alice ended their turn holding the centre, for 5 points", detail: "1 on watch" })]);
        // A knock-out by burning as the next turn begins scores too, and isn't the centre (§20.2).
        const burned: BattleEvent = { kind: "scored", player: "a", points: 6, reason: "knockout" };
        const burnedOut = toEvents(snap(state({ fighters })), snap(state({ fighters, scores: { a: 6, b: 0 } })), cmd("RealmArenaEndTurn"), valid([burned]));
        expect(burnedOut).toEqual([expect.objectContaining({ type: "ra_endturn" })]);
        const quiet = toEvents(snap(state({ fighters })), snap(state({ fighters })), cmd("RealmArenaEndTurn"), valid());
        // A bare end of turn isn't news: quiet, so the feed leaves it out.
        expect(quiet).toEqual([expect.objectContaining({ type: "ra_endturn", title: "Alice ended their turn", quiet: true })]);
    });

    it("tells what burning did as the next turn began, in the line the hand-off wrote", () => {
        const burn: BattleEvent[] = [{ kind: "burned", fighter: 1, damage: 1 }];
        const lines = [line("Bob's Knight burned for 1"), line("Alice ended their turn", "a")];
        const rows = toEvents(snap(state({ fighters })), snap(state({ fighters }), lines), cmd("RealmArenaEndTurn"), valid(burn));
        expect(rows.map(row => [row.type, row.title, row.quiet])).toEqual([
            ["ra_endturn", "Alice ended their turn", true],
            ["ra_burning", "Bob's Knight burned for 1", undefined],
        ]);
        expect(rows[1].affectedIds).toEqual(["b"]);
        expect(new Set(rows.map(row => row.id)).size).toBe(2);
    });

    it("tells a knock-out by burning that ends the battle, under the End turn and over the battle's end", () => {
        const burn: BattleEvent[] = [
            { kind: "burned", fighter: 1, damage: 1 },
            { kind: "downed", fighter: 1, by: 0 },
            { kind: "scored", player: "a", points: 6, reason: "knockout" },
        ];
        const lines = [
            line("Alice wins the battle", "a"),
            line("The battle is over: Alice 6 points, Bob 0 points"),
            line("Bob's Knight burned for 1; Bob's Knight is down; Alice scored 6 for the knock-out"),
            line("Alice ended their turn", "a"),
        ];
        const rows = toEvents(snap(state({ fighters })), snap(state({ fighters }), lines, true), cmd("RealmArenaEndTurn"), valid(burn));
        expect(rows.map(row => [row.type, row.title])).toEqual([
            ["ra_endturn", "Alice ended their turn"],
            ["ra_knockout", "Bob's Knight burned for 1; Bob's Knight is down; Alice scored 6 for the knock-out"],
            ["ra_won", "Alice wins the battle"],
        ]);
        expect(summarize(rows, "b").subline).toMatch(/the battle is over/);
    });

    it("tells every line of burning when it passed on past a squad burned out, oldest first", () => {
        const burn: BattleEvent[] = [
            { kind: "burned", fighter: 1, damage: 1 },
            { kind: "downed", fighter: 1, by: 0 },
            { kind: "burned", fighter: 0, damage: 1 },
        ];
        const lines = [line("Alice's Archer burned for 1"), line("Bob's Knight burned for 1; Bob's Knight is down"), line("Carol ended their turn", "c")];
        const rows = toEvents(snap(state({ fighters })), snap(state({ fighters }), lines), cmd("RealmArenaEndTurn", { senderId: "c", senderUsername: "Carol" }), valid(burn));
        expect(rows[1]).toMatchObject({ type: "ra_knockout", title: "Bob's Knight burned for 1; Bob's Knight is down; Alice's Archer burned for 1" });
        expect(rows[1].affectedIds).toEqual(["b", "a"]);
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
        expect(summarize([event("ra_manoeuvre")], "a").subline).toBe("1 thing happened while you were away.");
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
