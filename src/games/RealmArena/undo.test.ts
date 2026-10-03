import { describe, expect, it, vi } from "vitest";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import { pathTo } from "@/utils/games/battlefield/pathfinding";
import { distance, isNeighbour } from "@/utils/games/battlefield/terrain";
import { buildAllEvents } from "@/utils/games/recap";
import { buildTimeline } from "@/utils/games/replay";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { undoableCommandsIn } from "@/utils/testing/undoableCommands";
import { CHARACTERS, REALM } from "./characters";
import { battlefieldById } from "./maps";
import { RealmArenaGameDataModel } from "./RealmArenaModels";
import { RealmArenaUndo, UNDO_STACK_DEPTH } from "./RealmArenaLogic";
import type { IRealmArenaGameDataResponse } from "./apiModels";
import { check, moveAp, reachOf, reactionsTo, readyMadeMuster, type Action, type Fighter } from "./rules";
import { actBy, battleOf, cmd, endTurnBy, makeGame, muster, play, PLAYERS, type RealmArenaTestGame } from "./testFixtures";

// docs/undo.md's eighth game, shaped like Fires Out's: a turn is a run of
// actions and only End turn hands it on, so every action that rolls nothing
// and hurts nobody — a move nobody reacts to, a sneak, a stance, a heal, a
// raise, a healing draught, a throw that lands on nobody — can be taken back,
// one at a time, until the player does something that can't. What never can:
// any attack, a flask that lands on someone, a move a watcher reacted to, and
// End turn.

vi.mock("@/utils/users/clerk", () => ({
    userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }),
}));

const NAMES: Record<string, string> = { a: "Alice", b: "Bob" };

const undoBy = (sender: string) => cmd(RealmArenaUndo, sender);
const own = (game: RealmArenaTestGame, player: string) => game.specificGameState.fighters.filter(one => one.owner === player);
const byId = (game: RealmArenaTestGame, id: number) => game.specificGameState.fighters.find(one => one.id === id)!;

/** A move (or a sneak) by `fighter` to the first square it can stop on for the fewest AP. */
function oneStep(game: RealmArenaTestGame, fighter: Fighter, kind: "move" | "sneak" = "move"): Action {
    const reach = reachOf(battleOf(game), fighter, kind === "sneak");
    let best: number | undefined;
    for (let square = 0; square < reach.costs.length; square++) {
        const cost = reach.costs[square];
        if (cost > 0 && cost !== Infinity && (best === undefined || cost < reach.costs[best])) best = square;
    }
    if (best === undefined || moveAp(fighter, reach.costs[best], kind === "sneak") > fighter.ap) {
        throw new Error(`${fighter.character} has nowhere to go`);
    }
    return { kind, fighter: fighter.id, path: pathTo(reach, best)!.squares };
}

/** What the server sends `viewer`: the game's own `CreateDataResponse`. */
async function responseFor(game: RealmArenaTestGame, viewer: string | null) {
    const { markModified: _, ...data } = game;
    return new RealmArenaGameDataModel(structuredClone(data)).CreateDataResponse(viewer) as Promise<IRealmArenaGameDataResponse>;
}

/** A battle on a's first turn, a's squad with a Scout in it to sneak with. */
async function battle(): Promise<RealmArenaTestGame> {
    const game = makeGame();
    const field = battlefieldById(game.specificGameState.map);
    for (const [seat, squad] of [REALM.readyMade[3], REALM.readyMade[2]].entries()) {
        const { outcome } = await play(game, muster(PLAYERS[seat], readyMadeMuster(field, seat, squad)));
        if (!outcome.validMove) throw new Error(`seat ${seat}'s muster was refused`);
    }
    return game;
}

/**
 * Puts b's Knight on guard beside where `action` ends, so the move sets it
 * off — a deterministic strike, which is still an attack on the mover.
 */
function guardAtTheEnd(game: RealmArenaTestGame, action: Action & { path: number[] }): void {
    const knight = own(game, "b").find(one => one.character === "knight")!;
    const end = action.path.at(-1)!;
    const taken = new Set(game.specificGameState.fighters.map(one => one.square));
    const mover = byId(game, action.fighter);
    const { field } = battleOf(game);
    for (let square = 0; square < field.width * field.height; square++) {
        if (!isNeighbour(field, square, end) || taken.has(square) || action.path.includes(square)) continue;
        Object.assign(knight, { square, banked: 4 });
        if (reactionsTo(battleOf(game), mover, action.path).length > 0) return;
    }
    throw new Error("nowhere to stand the Knight");
}

describe("Realm Arena — undoing an action", () => {
    it("takes a move back: the square, the AP and a log line saying so", async () => {
        const game = await battle();
        const mover = own(game, "a")[0];
        const action = oneStep(game, mover) as Action & { path: number[] };

        expect((await play(game, actBy("a", action))).outcome.validMove).toBe(true);
        expect(byId(game, mover.id).square).toBe(action.path.at(-1));

        const { outcome } = await play(game, undoBy("a"));
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(byId(game, mover.id)).toEqual(mover);
        expect(game.currentTurn).toBe("a");
        expect(game.gameState.history[0].text).toBe("{{a}} took back their last move");
    });

    it("takes back a sneak, a stance and going on watch, newest first, and no further", async () => {
        const game = await battle();
        const first = own(game, "a").find(one => CHARACTERS[one.character].abilities.includes("sneak"))!;
        const [second, third] = own(game, "a").filter(one => one.id !== first.id);
        const start = structuredClone(game.specificGameState.fighters);

        expect((await play(game, actBy("a", oneStep(game, first, "sneak")))).outcome.validMove).toBe(true);
        await play(game, actBy("a", { kind: "hunker", fighter: second.id }));
        await play(game, actBy("a", { kind: "watch", fighter: third.id }));
        expect(byId(game, third.id).banked).toBeGreaterThan(0);

        await play(game, undoBy("a"));
        expect(byId(game, third.id).banked).toBe(0);
        await play(game, undoBy("a"));
        expect(byId(game, second.id).effects).toEqual({});
        await play(game, undoBy("a"));
        expect(game.specificGameState.fighters).toEqual(start);
        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(false);
    });

    it(`reaches back ${UNDO_STACK_DEPTH} actions at most`, async () => {
        const game = await battle();
        const fighters = own(game, "a");
        for (let i = 0; i <= UNDO_STACK_DEPTH; i++) {
            const fighter = byId(game, fighters[i % fighters.length].id);
            expect((await play(game, actBy("a", oneStep(game, fighter)))).outcome.validMove).toBe(true);
        }
        expect(game.specificGameState.undoStack).toHaveLength(UNDO_STACK_DEPTH);
        for (let i = 0; i < UNDO_STACK_DEPTH; i++) expect((await play(game, undoBy("a"))).outcome.validMove).toBe(true);
        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(false);
    });

    it("refuses a player the snapshot doesn't belong to", async () => {
        const game = await battle();
        const mover = own(game, "a")[0];
        await play(game, actBy("a", oneStep(game, mover)));
        expect((await play(game, undoBy("b"))).outcome.validMove).toBe(false);
        expect(byId(game, mover.id).ap).toBeLessThan(mover.ap);
    });
});

describe("Realm Arena — what can't be taken back", () => {
    it("never pushes a snapshot for an attack, and an attack puts the move before it out of reach", async () => {
        const game = await battle();
        const archer = own(game, "a").find(one => one.character === "archer")!;
        const other = own(game, "a").find(one => one.id !== archer.id)!;

        await play(game, actBy("a", oneStep(game, other)));
        // Every action replaces the fighters, so the Knight is looked up after it.
        const knight = own(game, "b").find(one => one.character === "knight")!;
        knight.square = archer.square + 36 * 8;
        const attack = actBy("a", { kind: "attack", fighter: archer.id, target: knight.id });
        expect((await play(game, attack)).outcome.validMove).toBe(true);
        expect(game.specificGameState.undoAnchorId).not.toBe(attack.id);

        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(false);
        expect((await responseFor(game, "a")).specificGameState.canUndo).toBe(false);
    });

    it("forgets every snapshot behind an attack, so undoing what came after it can't reach past it", async () => {
        const game = await battle();
        const archer = own(game, "a").find(one => one.character === "archer")!;
        const [first, second] = own(game, "a").filter(one => one.id !== archer.id);

        await play(game, actBy("a", oneStep(game, first)));
        const knight = own(game, "b").find(one => one.character === "knight")!;
        knight.square = archer.square + 36 * 8;
        expect((await play(game, actBy("a", { kind: "attack", fighter: archer.id, target: knight.id }))).outcome.validMove).toBe(true);
        const afterAttack = structuredClone(game.specificGameState.fighters);

        await play(game, actBy("a", oneStep(game, byId(game, second.id))));
        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(true);
        expect(game.specificGameState.fighters).toEqual(afterAttack);
        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(false);
        expect((await responseFor(game, "a")).specificGameState.canUndo).toBe(false);
    });

    it("never pushes one for a move a watcher reacted to, even a guard's strike that rolled nothing", async () => {
        const game = await battle();
        const mover = own(game, "a").find(one => one.character !== "knight")!;
        const action = oneStep(game, mover) as Action & { path: number[] };
        guardAtTheEnd(game, action);

        const command = actBy("a", action);
        expect((await play(game, command)).outcome.validMove).toBe(true);
        expect(consumedRandomness(command)).toBe(false);
        expect(game.specificGameState.undoStack ?? []).toHaveLength(0);
        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(false);
    });

    it("refuses once the turn has ended, and the hand-off empties the stack", async () => {
        const game = await battle();
        await play(game, actBy("a", oneStep(game, own(game, "a")[0])));
        await play(game, endTurnBy("a"));
        expect(game.currentTurn).toBe("b");
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(game.specificGameState.undoAnchorId).toBeNull();
        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(false);
        expect((await play(game, undoBy("b"))).outcome.validMove).toBe(false);
    });

    it("empties it when the turn timer ends a turn, too", async () => {
        const game = await battle();
        await play(game, actBy("a", oneStep(game, own(game, "a")[0])));
        await resolveStalledTurn(game, "a", "a");
        expect(game.currentTurn).toBe("b");
        expect(game.specificGameState.undoStack).toEqual([]);
    });
});

describe("Realm Arena — taking back an item (§21)", () => {
    /** A square `thrower` can throw at with nobody standing in the 3×3 around it. */
    function emptyAim(game: RealmArenaTestGame, thrower: Fighter): number {
        const battle = battleOf(game);
        const aim = battle.field.tiles.findIndex((_, square) =>
            !("refused" in check(battle, thrower.owner, { kind: "throw", fighter: thrower.id, at: square }))
            && battle.fighters.every(one => distance(battle.field, one.square, square) >= 2));
        if (aim < 0) throw new Error("nowhere to throw");
        return aim;
    }

    it("takes back a healing draught, putting the draught back", async () => {
        const game = await battle();
        const knight = own(game, "a").find(one => one.character === "knight")!;
        Object.assign(knight, { hp: 5, item: "healingDraught" });
        const before = structuredClone(knight);
        expect((await play(game, actBy("a", { kind: "draught", fighter: knight.id, target: knight.id }))).outcome.validMove).toBe(true);
        expect(byId(game, knight.id)).toMatchObject({ hp: 8, item: null });

        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(true);
        expect(byId(game, knight.id)).toEqual(before);
    });

    it("takes back a smoke pot, and a flask that lands on nobody, putting each back", async () => {
        const game = await battle();
        const [first, second] = own(game, "a");
        Object.assign(first, { item: "smokePot" });
        Object.assign(second, { item: "thunderFlask" });
        const [smoker, thrower] = [structuredClone(first), structuredClone(second)];

        await play(game, actBy("a", { kind: "throw", fighter: smoker.id, at: smoker.square }));
        expect(byId(game, smoker.id)).toMatchObject({ item: null, smoke: smoker.square });
        await play(game, actBy("a", { kind: "throw", fighter: thrower.id, at: emptyAim(game, thrower) }));
        expect(byId(game, thrower.id).item).toBeNull();

        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(true);
        expect(byId(game, thrower.id)).toEqual(thrower);
        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(true);
        expect(byId(game, smoker.id)).toEqual(smoker);
    });

    it("never takes back a flask that landed on someone, even one that only stunned", async () => {
        const game = await battle();
        const thrower = own(game, "a")[0];
        Object.assign(thrower, { item: "thunderFlask" });
        const aim = emptyAim(game, thrower);
        own(game, "b")[0].square = aim;
        const command = actBy("a", { kind: "throw", fighter: thrower.id, at: aim });
        expect((await play(game, command)).outcome.validMove).toBe(true);
        expect(own(game, "b")[0].effects).toEqual({ stunned: 1 });
        expect(game.specificGameState.undoAnchorId).not.toBe(command.id);
        expect((await play(game, undoBy("a"))).outcome.validMove).toBe(false);
    });
});

describe("Realm Arena — canUndo on the wire", () => {
    it("is the mover's alone, only while their action is the last one, and never carries the stack", async () => {
        const game = await battle();
        await play(game, actBy("a", oneStep(game, own(game, "a")[0])));

        const mine = (await responseFor(game, "a")).specificGameState;
        expect(mine.canUndo).toBe(true);
        expect(mine).not.toHaveProperty("undoStack");
        expect(mine).not.toHaveProperty("undoAnchorId");
        expect((await responseFor(game, "b")).specificGameState.canUndo).toBe(false);
        expect((await responseFor(game, null)).specificGameState.canUndo).toBe(false);

        await play(game, undoBy("a"));
        expect((await responseFor(game, "a")).specificGameState.canUndo).toBe(false);
    });
});

describe("Realm Arena — replay and recap", () => {
    it("replays a turn with undos in it to the live table's state", async () => {
        const game = await battle();
        const [first, second] = own(game, "a");
        for (const command of [
            actBy("a", oneStep(game, first)),
            undoBy("a"),
            actBy("a", { kind: "hunker", fighter: second.id }),
        ]) {
            expect((await play(game, command)).outcome.validMove).toBe(true);
        }
        for (const viewer of ["a", "b", null]) {
            const { snapshots } = await buildTimeline(game, NAMES, [], undefined, viewer);
            expect(snapshots.at(-1)!.specificGameState).toEqual((await responseFor(game, viewer)).specificGameState);
        }
    });

    it("leaves no recap row for an action taken back, nor for the undo", async () => {
        const game = await battle();
        const move = actBy("a", oneStep(game, own(game, "a")[0]));
        await play(game, move);
        const undo = undoBy("a");
        await play(game, undo);

        const ids = (await buildAllEvents(game, NAMES)).map(event => event.commandId);
        expect(ids).not.toContain(move.id);
        expect(ids).not.toContain(undo.id);
    });
});

describe("Realm Arena — the undoable commands never consume randomness", () => {
    // docs/undo.md §6's guard: a command that pushes a snapshot must never
    // carry a `recorded…` field once it has run, or taking it back would let a
    // player re-roll whatever it recorded.
    it("leaves every action that pushed with no recorded field", async () => {
        const game = await battle();
        const [first, second, third] = own(game, "a");
        for (const action of [oneStep(game, first, "move"), { kind: "hunker", fighter: second.id } as Action, { kind: "watch", fighter: third.id } as Action]) {
            const command = actBy("a", action);
            expect((await play(game, command)).outcome.validMove).toBe(true);
            expect(game.specificGameState.undoAnchorId).toBe(command.id);
            expect(consumedRandomness(command)).toBe(false);
        }
    });

    it("declares undoable on exactly one command", () => {
        expect(undoableCommandsIn(import.meta.url, "RealmArenaLogic.ts")).toEqual(["RealmArenaAct"]);
    });
});
