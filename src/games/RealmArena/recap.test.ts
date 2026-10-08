import { describe, expect, it } from "vitest";
import { realmArenaRecapAdapter } from "./recap";
import type { IGameEvent } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IHistoryEntry } from "@/utils/games/history";
import type { IRealmArenaSpecificGameStateResponse } from "./apiModels";
import { battlefieldById } from "./maps";
import { CENTRE, newFighter, warbandOwner, type BattleEvent, type Fighter } from "./rules";

// docs/games/realm-arena.md §17.3 PR 8. Snapshot pairs and a command/outcome
// handed to the adapter directly, the DiceCities/RaceCars style;
// replay.test.ts covers the same adapter against real, replayed battles.

const { toEvents, postProcess, summarize, tip } = realmArenaRecapAdapter;
const forFeed = (events: IGameEvent[]) => postProcess!(events, { forFeed: true });

function state(overrides: Partial<IRealmArenaSpecificGameStateResponse> = {}): IRealmArenaSpecificGameStateResponse {
    return {
        map: "ruinedFort",
        phase: "battle",
        round: 4,
        battleRounds: 15,
        budget: 100,
        fog: false,
        coop: false,
        fighters: [],
        ghosts: [],
        clouds: [],
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

    it("tells dynamite by its glyph, naming who it hurt (§33.2)", () => {
        const act = (event: BattleEvent) => toEvents(snap(state({ fighters })), snap(state({ fighters }), [line("Alice threw dynamite", "a")]), cmd("RealmArenaAct"), valid([event]))[0];
        expect(act({ kind: "dynamite", fighter: 0, at: 20, targets: [1], damage: 4 })).toMatchObject({ type: "ra_dynamite", glyph: "🧨", affectedIds: ["b"] });
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
        // Nobody's: as Alice's, it would close her recap's window after
        // anything told between the two — the enemy's turn, in co-op (§29.9).
        expect(rows[1].actorId).toBe("");
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

describe("Realm Arena recap rows in fog of war (§27.2)", () => {
    const fogged = (extra: Partial<IRealmArenaSpecificGameStateResponse> = {}) => state({ fog: true, fighters, ...extra });
    const miss: BattleEvent = { kind: "shot", fighter: 0, target: 1, chance: 80, roll: 90, result: "miss", damage: 0, reaction: false };
    const knockout: BattleEvent = { kind: "downed", fighter: 3, by: 0 };

    it("gives a player no row for an action their side saw none of, and tells one it saw some of by what it saw", () => {
        const outcome = { ...valid([miss, knockout]), recap: { told: { a: [miss, knockout], b: [miss], c: [] } } } as ICommandOutcome;
        const shown = (viewer: string | null, text: string) => toEvents(snap(fogged()), snap(fogged(), text ? [line(text, "a")] : []), cmd("RealmArenaAct"), outcome, viewer);
        expect(shown("a", "Alice shot Bob's Knight with their Archer (80%): a miss; Carol's Scout is down")).toMatchObject([{ type: "ra_knockout" }]);
        expect(shown("b", "Alice shot Bob's Knight with their Archer (80%): a miss")).toMatchObject([{ type: "ra_miss" }]);
        expect(shown("c", "")).toEqual([]);
        expect(shown(null, "")).toEqual([]);
        // The fog lifts as the battle ends.
        expect(toEvents(snap(fogged()), snap(fogged(), [line("x", "a")], true), cmd("RealmArenaAct"), outcome, "c")).toMatchObject([{ type: "ra_knockout" }]);
    });

    it("gives the enemy's turn a row for each action the player was told of, against the line it wrote them", () => {
        const owner = warbandOwner(0);
        const seen: BattleEvent = { kind: "struck", fighter: 2, target: 0, damage: 2, reaction: false };
        const enemy = {
            owner,
            started: [],
            steps: [
                { action: { kind: "hunker", fighter: 2 }, events: [{ kind: "hunkered", fighter: 2 }], told: { a: [] } },
                { action: { kind: "attack", fighter: 2, target: 0 }, events: [seen], told: { a: [seen] } },
            ],
            ended: [],
        };
        const outcome = { ...valid([seen]), turnOver: true, recap: { enemy, started: [] } } as unknown as ICommandOutcome;
        const lines = [line("The enemy ended their turn"), line("The enemy struck Alice's Archer with an enemy character for 2"), line("Alice ended their turn", "a")];
        const coop = fogged({ coop: true, fighters: [...fighters, newFighter(2, owner, "knight", 30)] });
        const rows = toEvents(snap(coop), snap(coop, lines), cmd("RealmArenaEndTurn"), outcome, "a");
        expect(rows.map(row => [row.id, row.title])).toEqual([
            ["c1", "Alice ended their turn"],
            ["c1:enemy:1", "The enemy struck Alice's Archer with an enemy character for 2"],
        ]);
    });
});

describe("Realm Arena feed, a row per character per turn", () => {
    const shot = (damage: number): BattleEvent => ({ kind: "shot", fighter: 0, target: 1, chance: 80, roll: 12, result: damage > 0 ? "hit" : "miss", damage, reaction: false });
    const moved: BattleEvent = { kind: "moved", fighter: 0, path: [1, 2], sneaking: false };
    /** One action's row, as `toEvents` writes it for command `id`. */
    const act = (id: string, fighter: number, text: string, events: BattleEvent[], sender = "a") => toEvents(
        snap(state({ fighters })),
        snap(state({ fighters }), [{ ...line(text, sender), commandId: id }]),
        cmd("RealmArenaAct", { id, senderId: sender, senderUsername: sender === "a" ? "Alice" : "Bob", action: { kind: "move", fighter } }),
        valid(events),
    );
    const endTurn = (id: string, sender = "a") => toEvents(snap(state({ fighters })), snap(state({ fighters })), cmd("RealmArenaEndTurn", { id, senderId: sender }), valid());

    it("tells a move, a shot and a move as one line, by the most telling of them", () => {
        const rows = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [moved]),
            ...act("c2", 0, "Alice shot Bob's Knight with their Archer (80%): a hit for 3", [shot(3)]),
            ...act("c3", 0, "Alice moved their Archer", [moved]),
        ]);
        expect(rows).toEqual([expect.objectContaining({
            id: "c1",
            commandId: "c1",
            type: "ra_hit",
            title: "Alice moved their Archer; then shot Bob's Knight with their Archer (80%): a hit for 3; then moved their Archer",
            affectedIds: ["b"],
        })]);
        // What the grouping reads off a row stays on the server.
        expect(JSON.stringify(rows)).not.toMatch(/"fighter"|"battle"|"clause"|"deed"|"roll"/);
    });

    it("tells a run of the same move once, and two of the same shot twice", () => {
        const rows = forFeed([...act("c1", 0, "Alice moved their Archer", [moved]), ...act("c2", 0, "Alice moved their Archer", [moved])]);
        expect(rows.map(row => [row.type, row.title])).toEqual([["ra_manoeuvre", "Alice moved their Archer"]]);
        const miss = "Alice shot Bob's Knight with their Archer (80%): a miss";
        const shots = forFeed([...act("c1", 0, miss, [shot(0)]), ...act("c2", 0, miss, [shot(0)])]);
        expect(shots.map(row => row.title)).toEqual([`${miss}; then shot Bob's Knight with their Archer (80%): a miss`]);
    });

    it("keeps each character's row where it first acted, and starts afresh each turn", () => {
        const rows = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [moved]),
            ...act("c2", 1, "Alice moved their Knight", [moved]),
            ...act("c3", 0, "Alice shot Bob's Knight with their Archer (80%): a miss", [shot(0)]),
            ...endTurn("c4"),
            ...act("c5", 0, "Alice moved their Archer", [moved]),
        ]);
        expect(rows.map(row => [row.id, row.type, row.title])).toEqual([
            ["c1", "ra_miss", "Alice moved their Archer; then shot Bob's Knight with their Archer (80%): a miss"],
            ["c2", "ra_manoeuvre", "Alice moved their Knight"],
            ["c4", "ra_endturn", "Alice ended their turn"],
            ["c5", "ra_manoeuvre", "Alice moved their Archer"],
        ]);
    });

    it("folds nothing outside the feed, where a reaction to each line finds its own row, and strips every row there too", () => {
        const rows = postProcess!([...act("c1", 0, "Alice moved their Archer", [moved]), ...act("c2", 0, "Alice shot Bob's Knight with their Archer (80%): a miss", [shot(0)])], { forFeed: false });
        expect(rows.map(row => row.id)).toEqual(["c1", "c2"]);
        for (const row of rows) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["fighter"]));
        expect(JSON.stringify(rows)).not.toMatch(/"battle"|"clause"|"roll"/);
    });

    it("never folds one player's character into another's", () => {
        const rows = forFeed([...act("c1", 0, "Alice moved their Archer", [moved]), ...act("c2", 0, "Bob moved their Archer", [moved], "b")]);
        expect(rows.map(row => row.id)).toEqual(["c1", "c2"]);
    });
});

describe("Realm Arena feed, one row for a run of quiet deeds by different characters", () => {
    const squad: Fighter[] = [newFighter(0, "a", "archer", 10), newFighter(1, "a", "knight", 11), newFighter(2, "a", "mage", 12), newFighter(3, "b", "knight", 20), newFighter(4, "a", "archer", 13)];
    const move = (fighter: number, sneaking = false): BattleEvent => ({ kind: "moved", fighter, path: [1, 2], sneaking });
    const shot: BattleEvent = { kind: "shot", fighter: 0, target: 3, chance: 80, roll: 12, result: "miss", damage: 0, reaction: false };
    const act = (id: string, fighter: number, text: string, events: BattleEvent[], sender = "a") => toEvents(
        snap(state({ fighters: squad })),
        snap(state({ fighters: squad }), [{ ...line(text, sender), commandId: id }]),
        cmd("RealmArenaAct", { id, senderId: sender, senderUsername: sender === "a" ? "Alice" : "Bob", action: { kind: "move", fighter } }),
        valid(events),
    );
    const titles = (rows: IGameEvent[]) => rows.map(row => row.title);

    it("tells two or three different characters moved as one row, named in turn", () => {
        const two = forFeed([...act("c1", 0, "Alice moved their Archer", [move(0)]), ...act("c2", 1, "Alice moved their Knight", [move(1)])]);
        expect(two).toEqual([expect.objectContaining({ id: "c1", type: "ra_manoeuvre", glyph: "👣", title: "Alice moved their Archer and their Knight" })]);
        const three = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [move(0)]),
            ...act("c2", 1, "Alice moved their Knight", [move(1)]),
            ...act("c3", 2, "Alice moved their Mage", [move(2)]),
        ]);
        expect(titles(three)).toEqual(["Alice moved their Archer, their Knight and their Mage"]);
        expect(JSON.stringify(three)).not.toMatch(/"fighter"|"battle"|"clause"|"deed"/);
    });

    it("tells a character that moved twice among them once", () => {
        const rows = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [move(0)]),
            ...act("c2", 1, "Alice moved their Knight", [move(1)]),
            ...act("c3", 0, "Alice moved their Archer", [move(0)]),
        ]);
        expect(titles(rows)).toEqual(["Alice moved their Archer and their Knight"]);
    });

    it("does not fold across a shot, or swallow a character that moved and then shot", () => {
        const rows = forFeed([
            ...act("c1", 1, "Alice moved their Knight", [move(1)]),
            ...act("c2", 0, "Alice shot Bob's Knight with their Archer (80%): a miss", [shot]),
            ...act("c3", 2, "Alice moved their Mage", [move(2)]),
            ...act("c4", 0, "Alice moved their Archer", [move(0)]),
        ]);
        // The Archer's later move is told on its first row, as ever; the Mage is alone after the shot.
        expect(titles(rows)).toEqual([
            "Alice moved their Knight",
            "Alice shot Bob's Knight with their Archer (80%): a miss; then moved their Archer",
            "Alice moved their Mage",
        ]);
        const after = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [move(0)]),
            ...act("c2", 0, "Alice shot Bob's Knight with their Archer (80%): a miss", [shot]),
            ...act("c3", 1, "Alice moved their Knight", [move(1)]),
        ]);
        expect(titles(after)).toEqual(["Alice moved their Archer; then shot Bob's Knight with their Archer (80%): a miss", "Alice moved their Knight"]);
    });

    it("keeps a move a watcher reacted to, a sneak among moves, and each player's turn to itself", () => {
        const reacted: BattleEvent = { kind: "shot", fighter: 3, target: 1, chance: 60, roll: 90, result: "miss", damage: 0, reaction: true };
        const rows = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [move(0)]),
            ...act("c2", 1, "Alice moved their Knight; Bob's Knight fired on overwatch: a miss", [move(1), reacted]),
            ...act("c3", 2, "Alice sneaked their Mage", [move(2, true)]),
            ...act("c4", 0, "Bob moved their Archer", [move(0)], "b"),
            ...act("c5", 1, "Bob moved their Knight", [move(1)], "b"),
        ]);
        expect(titles(rows)).toEqual([
            "Alice moved their Archer",
            "Alice moved their Knight; Bob's Knight fired on overwatch: a miss",
            "Alice sneaked their Mage",
            "Bob moved their Archer and their Knight",
        ]);
        const turns = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [move(0)]),
            ...toEvents(snap(state({ fighters: squad })), snap(state({ fighters: squad })), cmd("RealmArenaEndTurn", { id: "c2" }), valid()),
            ...act("c3", 1, "Alice moved their Knight", [move(1)]),
        ]);
        expect(turns.map(row => row.id)).toEqual(["c1", "c2", "c3"]);
    });

    it("tells going on watch and hunkering down the same way, and never one for the other", () => {
        const watch = (fighter: number): BattleEvent => ({ kind: "watching", fighter, banked: 2 });
        const rows = forFeed([
            ...act("c1", 0, "Alice put their Archer on watch", [watch(0)]),
            ...act("c2", 1, "Alice put their Knight on watch", [watch(1)]),
            ...act("c3", 2, "Alice hunkered their Mage down", [{ kind: "hunkered", fighter: 2 }]),
        ]);
        expect(titles(rows)).toEqual(["Alice put their Archer and their Knight on watch", "Alice hunkered their Mage down"]);
        // A character that moved and then went on watch is one row, and no part of a run.
        const both = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [move(0)]),
            ...act("c2", 0, "Alice put their Archer on watch", [watch(0)]),
            ...act("c3", 1, "Alice moved their Knight", [move(1)]),
        ]);
        expect(titles(both)).toEqual(["Alice moved their Archer; then put their Archer on watch", "Alice moved their Knight"]);
    });

    it("counts the characters of a kind a run names, in the order the kinds first appear", () => {
        const rows = forFeed([
            ...act("c1", 0, "Alice moved their Archer", [move(0)]),
            ...act("c2", 1, "Alice moved their Knight", [move(1)]),
            ...act("c3", 4, "Alice moved their Archer", [move(4)]),
        ]);
        expect(titles(rows)).toEqual(["Alice moved two Archers and their Knight"]);
        // Several of a kind, whatever the plural of it is, and a deed told after the first still says "them".
        const mustered = [...squad, newFighter(5, "a", "manAtArms", 14), newFighter(6, "a", "manAtArms", 15), newFighter(7, "a", "manAtArms", 16)];
        const actAs = (id: string, fighter: number, events: BattleEvent[], text: string) => toEvents(
            snap(state({ fighters: mustered })), snap(state({ fighters: mustered }), [{ ...line(text, "a"), commandId: id }]),
            cmd("RealmArenaAct", { id, senderId: "a", senderUsername: "Alice", action: { kind: "move", fighter } }), valid(events));
        const turns = (fighters: [number, string][]) => forFeed(fighters.flatMap(([fighter, name], index) => [
            ...actAs(`m${index}`, fighter, [move(fighter)], `Alice moved their ${name}`),
            ...actAs(`h${index}`, fighter, [{ kind: "hunkered", fighter }], `Alice hunkered their ${name} down`),
        ]));
        expect(titles(turns([[1, "Knight"], [2, "Mage"], [5, "Man-at-arms"], [6, "Man-at-arms"], [7, "Man-at-arms"]])))
            .toEqual(["Alice moved their Knight, their Mage and three Men-at-arms, then hunkered them down"]);
    });

    it("counts the characters a viewer was told of without their kind, in fog of war and out of it (§27.2)", () => {
        const moves = (told: [number, string][]) => forFeed(told.flatMap(([fighter, text], index) => act(`c${index}`, fighter, `Alice moved ${text}`, [move(fighter)])));
        const unseen = "a character out of sight";
        expect(titles(moves([[1, "their Knight"], [0, unseen], [2, "their Mage"], [3, unseen]])))
            .toEqual(["Alice moved their Knight, their Mage and two characters out of sight"]);
        expect(titles(moves([[1, "their Knight"], [2, "their Mage"], [0, unseen]]))).toEqual(["Alice moved their Knight, their Mage and a character out of sight"]);
        expect(titles(moves([[0, "an enemy character"], [1, "an enemy character"], [2, "an enemy character"]]))).toEqual(["Alice moved three enemy characters"]);
        // Told differently, they are counted apart.
        expect(titles(moves([[0, "a character"], [1, unseen], [2, "a character"]]))).toEqual(["Alice moved two characters and a character out of sight"]);
    });

    it("tells the co-op enemy's run of moves as one row, counting a hidden enemy's characters", () => {
        const owner = warbandOwner(0);
        const enemyMove = (fighter: number) => ({ action: { kind: "move", fighter }, events: [move(fighter)] });
        const coop = (enemy?: "realm") => state({ coop: true, enemy, fighters: [...squad, newFighter(5, owner, "knight", 30), newFighter(6, owner, "archer", 31), newFighter(7, owner, "mage", 32)] });
        const enemy = (steps: number[]) => ({ owner, started: [], steps: steps.map(enemyMove), ended: [] });
        const turn = (steps: number[], lines: string[], faction?: "realm") => toEvents(snap(coop()), snap(coop(faction), [...lines.map(text => line(text)).reverse(), line("Alice ended their turn", "a")]),
            cmd("RealmArenaEndTurn"), { ...valid(), turnOver: true, recap: { enemy: enemy(steps), started: [] } } as unknown as ICommandOutcome);
        const known = forFeed(turn([5, 6, 7], ["The Renegades moved their Knight", "The Renegades moved their Archer", "The Renegades moved their Mage", "The Renegades ended their turn"], "realm"));
        expect(titles(known)).toEqual(["Alice ended their turn", "The Renegades moved their Knight, their Archer and their Mage"]);
        expect(known[1]).toMatchObject({ id: "c1:enemy:0", actorId: owner, type: "ra_manoeuvre" });
        const hidden = forFeed(turn([5, 6, 7], [...Array(3).fill("The enemy moved one of its characters"), "The enemy ended their turn"]));
        expect(titles(hidden)).toEqual(["Alice ended their turn", "The enemy moved three of its characters"]);
    });

    it("folds an enemy character that moved out of sight, which the viewer's snapshot no longer holds (§27.2)", () => {
        const owner = warbandOwner(0);
        const enemyMove = (fighter: number) => ({ action: { kind: "move", fighter }, events: [move(fighter)] });
        const all = [...squad, newFighter(5, owner, "knight", 30), newFighter(6, owner, "cleric", 31), newFighter(7, owner, "manAtArms", 32), newFighter(8, owner, "manAtArms", 33)];
        // The Knight and the Cleric ended their moves out of the team's sight.
        const seen = all.filter(fighter => fighter.id !== 5 && fighter.id !== 6);
        const lines = ["The Renegades moved their Knight", "The Renegades moved their Cleric", "The Renegades moved their Man-at-arms", "The Renegades moved their Man-at-arms", "The Renegades ended their turn"];
        const rows = forFeed(toEvents(snap(state({ coop: true, enemy: "realm", fog: true, fighters: all })),
            snap(state({ coop: true, enemy: "realm", fog: true, fighters: seen }), [...lines.map(text => line(text)).reverse(), line("Alice ended their turn", "a")]),
            cmd("RealmArenaEndTurn"), { ...valid(), turnOver: true, recap: { enemy: { owner, started: [], steps: [5, 6, 7, 8].map(enemyMove), ended: [] }, started: [] } } as unknown as ICommandOutcome));
        expect(titles(rows)).toEqual(["Alice ended their turn", "The Renegades moved their Knight, their Cleric and two Men-at-arms"]);
    });

    describe("a character's quiet deeds in a row, the same ones by each of several", () => {
        const hunker = (fighter: number): BattleEvent => ({ kind: "hunkered", fighter });
        const watch = (fighter: number): BattleEvent => ({ kind: "watching", fighter, banked: 2 });
        const moveThen = (id: string, fighter: number, name: string, then: "hunker" | "watch") => [
            ...act(`${id}a`, fighter, `Alice moved their ${name}`, [move(fighter)]),
            ...act(`${id}b`, fighter, then === "hunker" ? `Alice hunkered their ${name} down` : `Alice put their ${name} on watch`, [then === "hunker" ? hunker(fighter) : watch(fighter)]),
        ];

        it("tells move-and-hunker by three characters as one row, the first deed naming them and the rest not", () => {
            const rows = forFeed([...moveThen("c1", 0, "Archer", "hunker"), ...moveThen("c2", 1, "Knight", "hunker"), ...moveThen("c3", 2, "Mage", "hunker")]);
            expect(rows).toEqual([expect.objectContaining({ id: "c1a", type: "ra_manoeuvre", title: "Alice moved their Archer, their Knight and their Mage, then hunkered them down" })]);
            expect(JSON.stringify(rows)).not.toMatch(/"deed"|"steps"/);
            // Alone, a character's row keeps its own wording.
            expect(titles(forFeed(moveThen("c1", 0, "Archer", "hunker")))).toEqual(["Alice moved their Archer; then hunkered their Archer down"]);
        });

        it("tells a run of one kind of deed after another the same way, in the order they happened", () => {
            const rows = forFeed([...moveThen("c1", 0, "Archer", "watch"), ...moveThen("c2", 1, "Knight", "watch")]);
            expect(titles(rows)).toEqual(["Alice moved their Archer and their Knight, then put them on watch"]);
        });

        it("keeps a character that moved, hunkered and moved again to its own sequence", () => {
            const again = (id: string, fighter: number, name: string) => [...moveThen(id, fighter, name, "hunker"), ...act(`${id}c`, fighter, `Alice moved their ${name}`, [move(fighter)])];
            expect(titles(forFeed([...again("c1", 0, "Archer"), ...again("c2", 1, "Knight")]))).toEqual(["Alice moved their Archer and their Knight, then hunkered them down, then moved them"]);
            // A move told once, as the same move broken up is: the sequence matches the title.
            const twice = [...act("c1a", 0, "Alice moved their Archer", [move(0)]), ...act("c1b", 0, "Alice moved their Archer", [move(0)]), ...act("c1c", 0, "Alice hunkered their Archer down", [hunker(0)])];
            expect(titles(forFeed([...twice, ...moveThen("c2", 1, "Knight", "hunker")]))).toEqual(["Alice moved their Archer and their Knight, then hunkered them down"]);
        });

        it("does not fold rows with different sequences, or a sequence into a plain move", () => {
            const mixed = forFeed([...moveThen("c1", 0, "Archer", "hunker"), ...moveThen("c2", 1, "Knight", "watch")]);
            expect(titles(mixed)).toEqual(["Alice moved their Archer; then hunkered their Archer down", "Alice moved their Knight; then put their Knight on watch"]);
            const plain = forFeed([...moveThen("c1", 0, "Archer", "hunker"), ...act("c2", 1, "Alice moved their Knight", [move(1)])]);
            expect(titles(plain)).toEqual(["Alice moved their Archer; then hunkered their Archer down", "Alice moved their Knight"]);
            // Nor the same two deeds the other way round.
            const reversed = forFeed([
                ...moveThen("c1", 0, "Archer", "hunker"),
                ...act("c2a", 1, "Alice hunkered their Knight down", [hunker(1)]),
                ...act("c2b", 1, "Alice moved their Knight", [move(1)]),
            ]);
            expect(reversed).toHaveLength(2);
        });

        it("does not fold a character a reaction fired on, or one that did anything more", () => {
            const reacted: BattleEvent = { kind: "shot", fighter: 3, target: 0, chance: 60, roll: 90, result: "miss", damage: 0, reaction: true };
            const shotAt = [
                ...act("c1a", 0, "Alice moved their Archer; Bob's Knight fired on overwatch: a miss", [move(0), reacted]),
                ...act("c1b", 0, "Alice hunkered their Archer down", [hunker(0)]),
            ];
            expect(titles(forFeed([...shotAt, ...moveThen("c2", 1, "Knight", "hunker")]))).toEqual([
                "Alice moved their Archer; Bob's Knight fired on overwatch: a miss; then hunkered their Archer down",
                "Alice moved their Knight; then hunkered their Knight down",
            ]);
            const shoots = [...moveThen("c1", 0, "Archer", "hunker"), ...act("c1c", 0, "Alice shot Bob's Knight with their Archer (80%): a miss", [shot])];
            expect(titles(forFeed([...shoots, ...moveThen("c2", 1, "Knight", "hunker")]))).toHaveLength(2);
        });

        it("tells the co-op enemy's the same, named or hidden", () => {
            const owner = warbandOwner(0);
            const coop = (enemy?: "realm") => state({ coop: true, enemy, fighters: [...squad, newFighter(5, owner, "knight", 30), newFighter(6, owner, "archer", 31)] });
            // Each of the enemy's two characters moves and then goes on watch, as the log tells it, oldest first.
            const turn = (enemy: string, whom: string[], faction?: "realm") => {
                const steps = [5, 6].flatMap(fighter => [
                    { action: { kind: "move", fighter }, events: [move(fighter)] },
                    { action: { kind: "watch", fighter }, events: [watch(fighter)] },
                ]);
                const told = [5, 6].flatMap((_, index) => [`${enemy} moved ${whom[index]}`, `${enemy} put ${whom[index]} on watch`]);
                const history = [...told, `${enemy} ended their turn`].reverse().map(text => line(text));
                return forFeed(toEvents(snap(coop()), snap(coop(faction), [...history, line("Alice ended their turn", "a")]), cmd("RealmArenaEndTurn"),
                    { ...valid(), turnOver: true, recap: { enemy: { owner, started: [], steps, ended: [] }, started: [] } } as unknown as ICommandOutcome));
            };
            expect(titles(turn("The Renegades", ["their Knight", "their Archer"], "realm")))
                .toEqual(["Alice ended their turn", "The Renegades moved their Knight and their Archer, then put them on watch"]);
            expect(titles(turn("The enemy", Array(2).fill("one of its characters"))))
                .toEqual(["Alice ended their turn", "The enemy moved two of its characters, then put them on watch"]);
        });
    });

    it("folds nothing outside the feed", () => {
        const rows = postProcess!([...act("c1", 0, "Alice moved their Archer", [move(0)]), ...act("c2", 1, "Alice moved their Knight", [move(1)])], { forFeed: false });
        expect(titles(rows)).toEqual(["Alice moved their Archer", "Alice moved their Knight"]);
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
