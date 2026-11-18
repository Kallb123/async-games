import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { resolveStalledTurn } from "@/utils/games/turnTimeout";
import { rallyChoiceFor } from "../../../scripts/lib/realmArenaBalance";
import { recordBattle } from "./recordBattle";
import { gameStateToModel } from "./RealmArenaModels";
import type { IGameData } from "@/utils/mongodb/GameData";
import { runCommand } from "@/utils/games/commandPipeline";
import { nextSeat, RealmArenaGameType, RealmArenaUndo } from "./RealmArenaLogic";
import { RealmArenaGameDataModel } from "./RealmArenaModels";
import { rallyOptionsOf, rallyRefusal, rallyTally, rallyTotal, resupplyItems, type RallyAction } from "./rally";
import { battlefieldById } from "./maps";
import { distance } from "@/utils/games/battlefield/terrain";
import { isStanding, isWarband, maxHpOf, newFighter, viewOf, warbandOwner, type Fighter } from "./rules";
import { actBy, addFighter, battleOf, cmd, endTurnBy, makeGame, muster, musterAll, play, readyMadePicks, playScriptedBattle, responseFor, type RealmArenaTestGame } from "./testFixtures";
import { seedRolls } from "./seedRolls";

// docs/games/realm-arena.md §39.4: from rules version 12 a Hold Out wave heals
// nobody as it lands, and each player of the team owes a rally choice instead:
// Rally, Reinforce or Resupply, made as their next turn begins.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

afterEach(() => vi.restoreAllMocks());

const V12 = { rulesVersion: 12, coop: { enemy: "realm" as const, mission: "holdOut" as const } };
const V11 = { rulesVersion: 11, coop: { enemy: "realm" as const, mission: "holdOut" as const } };
const rally: RallyAction = { kind: "rally", choice: "rally" };
const reinforce = (fighter: number): RallyAction => ({ kind: "rally", choice: "reinforce", fighter });
const resupply: RallyAction = { kind: "rally", choice: "resupply" };

const mine = (game: RealmArenaTestGame, owner: string) => game.specificGameState.fighters.filter(fighter => fighter.owner === owner);
/** A fighter as the game holds it now: a choice replaces the fighters it changes, so one fetched before it is stale. */
const now = (game: RealmArenaTestGame, id: number) => game.specificGameState.fighters.find(fighter => fighter.id === id)!;
const down = (fighter: Fighter) => { fighter.hp = 0; fighter.ap = 0; };
const hurt = (fighter: Fighter) => { fighter.hp = 1; };

/**
 * A two-player Hold Out, mustered, with its enemy knocked out so the battle
 * goes on, and round three played but for the last End turn: `tweak` sets the
 * team up, then a and b end their turns and the wave lands, leaving a's turn
 * begun with a choice to make (rules 12) or not (11).
 */
async function waveLanded(settings: typeof V12 & { fog?: boolean }, tweak: (game: RealmArenaTestGame) => void = () => {}): Promise<RealmArenaTestGame> {
    const game = makeGame(["a", "b"], {}, settings);
    await musterAll(game);
    game.specificGameState.fighters.forEach(fighter => { if (isWarband(fighter.owner)) down(fighter); });
    game.specificGameState.roundsPlayed = 2;
    tweak(game);
    expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
    expect((await play(game, endTurnBy("b"))).outcome.validMove).toBe(true);
    return game;
}

describe("what a fighter keeps of the item it mustered with (§39.4)", () => {
    /** Both players muster one character fewer than the ready-made squad, the first carrying a fire flask. */
    const musteredWith = async (settings: Parameters<typeof makeGame>[2]) => {
        const game = makeGame(["a", "b"], {}, settings);
        for (const [seat, player] of ["a", "b"].entries()) {
            const picks = readyMadePicks(game, seat).slice(0, -1);
            picks[0] = { ...picks[0], item: "fireFlask" };
            expect((await play(game, muster(player, picks))).outcome.validMove).toBe(true);
        }
        return game.specificGameState.fighters;
    };

    it("is remembered by a Hold Out player's character under rules 12, and by nobody else or under 11", async () => {
        const holdOut = await musteredWith(V12);
        const carrying = holdOut.filter(fighter => !isWarband(fighter.owner) && fighter.item);
        expect(carrying.length).toBeGreaterThan(0);
        expect(carrying.every(fighter => fighter.musteredItem === fighter.item)).toBe(true);
        expect(holdOut.filter(fighter => isWarband(fighter.owner)).some(fighter => "musteredItem" in fighter)).toBe(false);
        expect(holdOut.filter(fighter => !fighter.item).some(fighter => "musteredItem" in fighter)).toBe(false);
        expect((await musteredWith(V11)).some(fighter => "musteredItem" in fighter)).toBe(false);
        // A battle that isn't Hold Out has no rally, so nothing of what was bought is kept, or sent.
        expect((await musteredWith({ rulesVersion: 12 })).some(fighter => "musteredItem" in fighter)).toBe(false);
        expect((await musteredWith({ rulesVersion: 12, coop: { enemy: "realm" } })).some(fighter => "musteredItem" in fighter)).toBe(false);
    });
});

describe("a wave landing under rules 12 (§39.4)", () => {
    it("heals nobody, and leaves every seat of the team a choice to make, told to everyone", async () => {
        const game = await waveLanded(V12, g => mine(g, "a").concat(mine(g, "b")).forEach(hurt));
        expect(mine(game, "a").concat(mine(game, "b")).every(fighter => fighter.hp === 1)).toBe(true);
        expect(game.specificGameState.rallyOwed).toEqual(["a", "b"]);
        expect(game.currentTurn).toBe("a");
        expect(game.gameState.history.some(entry => entry.text.startsWith("The team must each choose how to rally"))).toBe(true);
        expect(game.gameState.history.some(entry => entry.text.includes("The team rallies"))).toBe(false);
    });

    it("tells the viewer whether they owe a choice, never who else does", async () => {
        const game = await waveLanded(V12);
        for (const viewer of ["a", "b"]) expect((await responseFor(game, viewer)).specificGameState.rallyOwed).toBe(true);
        const none = await responseFor(game, null);
        expect(none.specificGameState).not.toHaveProperty("rallyOwed");
        expect(JSON.stringify(none)).not.toContain("musteredItem");
        await play(game, actBy("a", rally));
        expect((await responseFor(game, "a")).specificGameState).not.toHaveProperty("rallyOwed");
        expect((await responseFor(game, "b")).specificGameState.rallyOwed).toBe(true);
    });

    it("still rallies everyone as it lands under rules 11", async () => {
        const game = await waveLanded(V11, g => mine(g, "a").concat(mine(g, "b")).forEach(hurt));
        expect(game.specificGameState).not.toHaveProperty("rallyOwed");
        expect(mine(game, "a").every(fighter => fighter.hp === 1 + Math.floor(maxHpOf(fighter, game.specificGameState) / 2))).toBe(true);
        expect(game.gameState.history.some(entry => entry.text.includes("The team rallies"))).toBe(true);
        expect(rallyRefusal(battleOf(game), game.specificGameState.seats, "a", rally)).toBeUndefined();
        const { outcome } = await play(game, actBy("a", rally));
        expect(outcome.validMove).toBe(false);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
    });
});

describe("Rally (§39.4)", () => {
    it("heals every standing character of the sender by half, and nobody else's", async () => {
        const game = await waveLanded(V12, g => mine(g, "a").concat(mine(g, "b")).forEach(hurt));
        const [first, ...others] = mine(game, "a");
        down(first);
        const before = new Map(mine(game, "b").map(fighter => [fighter.id, fighter.hp]));
        const { outcome } = await play(game, actBy("a", { ...rally, fighter: 3, extra: true } as RallyAction));
        expect(outcome).toMatchObject({ validMove: true, turnOver: false });
        for (const { id } of others) expect(now(game, id).hp).toBe(Math.min(maxHpOf(now(game, id), game.specificGameState), 1 + Math.floor(maxHpOf(now(game, id), game.specificGameState) / 2)));
        expect(now(game, first.id).hp).toBe(0);
        for (const fighter of mine(game, "b")) expect(fighter.hp).toBe(before.get(fighter.id));
        expect(game.specificGameState.rallyOwed).toEqual(["b"]);
        expect(game.gameState.history[0]).toMatchObject({ text: "{{a}}'s squad rallies", actorId: "a" });
        // Only what it is allowed to carry is recorded.
        expect(game.gameState.commandHistory.at(-1)).toMatchObject({ action: { kind: "rally", choice: "rally" } });
        expect((game.gameState.commandHistory.at(-1) as unknown as { action: object }).action).toEqual(rally);
    });

    it("never heals past full", async () => {
        const game = await waveLanded(V12, g => { mine(g, "a")[0].hp = maxHpOf(mine(g, "a")[0], g.specificGameState) - 1; });
        const { id } = mine(game, "a")[0];
        await play(game, actBy("a", rally));
        expect(now(game, id).hp).toBe(maxHpOf(now(game, id), game.specificGameState));
    });
});

describe("Reinforce (§39.4)", () => {
    it("returns the chosen downed character at half HP, on the first free square of the zone, with a turn's AP", async () => {
        const game = await waveLanded(V12, g => down(mine(g, "a")[1]));
        const fallen = mine(game, "a")[1];
        const zone = battlefieldById(game.specificGameState.map).deployments[0];
        const occupied = new Set(game.specificGameState.fighters.filter(isStanding).map(fighter => fighter.square));
        const first = zone.find(square => !occupied.has(square))!;
        const { outcome } = await play(game, actBy("a", reinforce(fallen.id)));
        expect(outcome.validMove).toBe(true);
        expect(now(game, fallen.id)).toMatchObject({ hp: Math.max(1, Math.floor(maxHpOf(fallen, game.specificGameState) / 2)), square: first });
        expect(now(game, fallen.id).ap).toBeGreaterThan(0);
        expect(game.gameState.history[0].text).toMatch(/^\{\{a\}\}'s \w[\w -]* rejoins the fight$/);
        expect(game.specificGameState.rallyOwed).toEqual(["b"]);
    });

    it("refuses one that isn't down, isn't the sender's or isn't named, and offers it only with someone down", async () => {
        const game = await waveLanded(V12, g => down(mine(g, "a")[1]));
        const seats = game.specificGameState.seats;
        const options = rallyOptionsOf(battleOf(game), seats, "a");
        expect(options.map(option => [option.choice, option.available])).toEqual([["rally", true], ["reinforce", true], ["resupply", false]]);
        expect(options[1].downed?.map(fighter => fighter.id)).toEqual([mine(game, "a")[1].id]);
        for (const bad of [mine(game, "a")[0].id, mine(game, "b")[0].id, 999, undefined, "1", -1]) {
            expect((await play(game, actBy("a", { kind: "rally", choice: "reinforce", fighter: bad } as RallyAction))).outcome.validMove, String(bad)).toBe(false);
        }
        expect(game.specificGameState.rallyOwed).toEqual(["a", "b"]);
        const nobody = await waveLanded(V12);
        const refused = rallyOptionsOf(battleOf(nobody), nobody.specificGameState.seats, "a")[1];
        expect(refused).toMatchObject({ available: false, reason: "No one of yours is down" });
        expect((await play(nobody, actBy("a", reinforce(mine(nobody, "a")[0].id)))).outcome.validMove).toBe(false);
    });

    it("is unavailable when the zone has no free square", async () => {
        const game = await waveLanded(V12, g => {
            down(mine(g, "a")[1]);
            const zone = battlefieldById(g.specificGameState.map).deployments[0];
            const standing = new Set(g.specificGameState.fighters.filter(isStanding).map(fighter => fighter.square));
            for (const square of zone) if (!standing.has(square)) addFighter(g, "b", "knight", square);
        });
        const option = rallyOptionsOf(battleOf(game), game.specificGameState.seats, "a")[1];
        expect(option).toMatchObject({ available: false, reason: "No free square in your deployment zone" });
        expect((await play(game, actBy("a", reinforce(mine(game, "a")[1].id)))).outcome.validMove).toBe(false);
    });
});

describe("Resupply (§39.4)", () => {
    const used = (game: RealmArenaTestGame) => {
        const [first, second] = mine(game, "a");
        first.item = null;
        first.musteredItem = "fireFlask";
        second.item = "smokePot";
        second.musteredItem = "smokePot";
    };

    it("hands every standing character that used its item the one it mustered with", async () => {
        const game = await waveLanded(V12, g => { used(g); const third = mine(g, "a")[2]; third.item = null; third.musteredItem = "healingDraught"; down(third); });
        expect(rallyOptionsOf(battleOf(game), game.specificGameState.seats, "a")[2]).toEqual({ choice: "resupply", available: true });
        const [first, second, third] = mine(game, "a").map(fighter => fighter.id);
        expect((await play(game, actBy("a", resupply))).outcome.validMove).toBe(true);
        expect(now(game, first).item).toBe("fireFlask");
        expect(now(game, second).item).toBe("smokePot");
        // Someone downed isn't handed anything: Reinforce brings them back, not their kit.
        expect(now(game, third).item).toBeNull();
        expect(game.gameState.history[0].text).toBe("{{a}}'s squad is resupplied");
    });

    it("is refused where nothing was used", async () => {
        const game = await waveLanded(V12);
        expect(rallyOptionsOf(battleOf(game), game.specificGameState.seats, "a")[2]).toMatchObject({ available: false, reason: expect.stringContaining("item") });
        expect((await play(game, actBy("a", resupply))).outcome.validMove).toBe(false);
        // Nor does the item a character still carries count.
        mine(game, "a")[0].musteredItem = "fireFlask";
        mine(game, "a")[0].item = "fireFlask";
        expect((await play(game, actBy("a", resupply))).outcome.validMove).toBe(false);
    });
});

describe("making the choice (§39.4)", () => {
    it("is refused for a choice nobody sent, from a player who owes none, or out of turn", async () => {
        const game = await waveLanded(V12);
        for (const action of [{ kind: "rally", choice: "bogus" }, { kind: "rally" }, { kind: "rally", choice: 4 }, null] as unknown as RallyAction[]) {
            expect((await play(game, actBy("a", action))).outcome.validMove).toBe(false);
        }
        // b owes one, but it isn't b's turn.
        expect((await play(game, actBy("b", rally))).outcome.validMove).toBe(false);
        expect((await play(game, actBy("a", rally))).outcome.validMove).toBe(true);
        // Once made, it isn't owed any more.
        expect((await play(game, actBy("a", rally))).outcome.validMove).toBe(false);
    });

    it("keeps every other action and the End turn out of reach until it's made", async () => {
        const game = await waveLanded(V12);
        const [fighter] = mine(game, "a");
        fighter.ap = 4;
        expect((await play(game, actBy("a", { kind: "hunker", fighter: fighter.id }))).outcome.validMove).toBe(false);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(false);
        expect(game.currentTurn).toBe("a");
        await play(game, actBy("a", rally));
        expect((await play(game, actBy("a", { kind: "hunker", fighter: fighter.id }))).outcome.validMove).toBe(true);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        // b's choice waits for b's turn, and is then asked for first.
        expect(game.currentTurn).toBe("b");
        expect((await play(game, endTurnBy("b"))).outcome.validMove).toBe(false);
    });

    it("can't be undone, and empties the stack", async () => {
        const game = await waveLanded(V12);
        await play(game, actBy("a", rally));
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(game.specificGameState.undoAnchorId).toBeNull();
        expect((await responseFor(game, "a")).specificGameState.canUndo).toBe(false);
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(false);
        // A move after it can be undone, and no further back than that.
        const [fighter] = mine(game, "a");
        now(game, fighter.id).ap = 4;
        await play(game, actBy("a", { kind: "hunker", fighter: fighter.id }));
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
        expect(game.specificGameState.rallyOwed).toEqual(["b"]);
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(false);
    });

    it("is never owed by a warband", async () => {
        const game = await waveLanded(V12);
        expect(game.specificGameState.rallyOwed!.some(isWarband)).toBe(false);
    });
});

describe("a wiped-out player still chooses (§39.4)", () => {
    it("is given their turn when the wave lands, can only Reinforce or Rally, and plays on with who returns", async () => {
        const game = makeGame(["a", "b"], {}, V12);
        await musterAll(game);
        game.specificGameState.fighters.forEach(fighter => { if (isWarband(fighter.owner)) down(fighter); });
        game.specificGameState.roundsPlayed = 2;
        mine(game, "a").forEach(down);
        await play(game, endTurnBy("a"));
        // Stepped past while nothing is owed: b's turn, which closes the round and lands the wave.
        expect(game.currentTurn).toBe("b");
        await play(game, endTurnBy("b"));
        expect(game.specificGameState.rallyOwed).toEqual(["a", "b"]);
        expect(game.currentTurn).toBe("a");
        const seats = game.specificGameState.seats;
        expect(rallyOptionsOf(battleOf(game), seats, "a").map(option => option.available)).toEqual([true, true, false]);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(false);
        const { id } = mine(game, "a")[0];
        expect((await play(game, actBy("a", reinforce(id)))).outcome.validMove).toBe(true);
        expect(isStanding(now(game, id))).toBe(true);
        expect(now(game, id).ap).toBeGreaterThan(0);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect(game.currentTurn).toBe("b");
    });

    it("is stepped past again once it has chosen and still has nobody standing", async () => {
        const game = makeGame(["a", "b"], {}, V12);
        await musterAll(game);
        game.specificGameState.fighters.forEach(fighter => { if (isWarband(fighter.owner)) down(fighter); });
        game.specificGameState.roundsPlayed = 2;
        mine(game, "a").forEach(down);
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        // Rally does nothing for a squad nobody of which stands; the turn is still theirs to end.
        expect((await play(game, actBy("a", rally))).outcome.validMove).toBe(true);
        expect(mine(game, "a").every(fighter => fighter.hp === 0)).toBe(true);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect(game.currentTurn).toBe("b");
        await play(game, actBy("b", rally));
        await play(game, endTurnBy("b"));
        // b alone, a round on.
        expect(game.currentTurn).toBe("b");
        expect(game.specificGameState.roundsPlayed).toBe(4);
    });

    it("gets their turn when it's the last seat that is wiped out, since the wave lands after the hand-off picked a seat", async () => {
        const game = makeGame(["a", "b"], {}, V12);
        await musterAll(game);
        game.specificGameState.fighters.forEach(fighter => { if (isWarband(fighter.owner)) down(fighter); });
        game.specificGameState.roundsPlayed = 2;
        mine(game, "b").forEach(down);
        await play(game, endTurnBy("a"));
        // b was stepped past: a's End turn closed the round, landed the wave, and b owes a choice.
        expect(game.specificGameState.roundsPlayed).toBe(3);
        expect(game.specificGameState.rallyOwed).toEqual(["a", "b"]);
        expect(game.currentTurn).toBe("a");
        await play(game, actBy("a", rally));
        await play(game, endTurnBy("a"));
        expect(game.currentTurn).toBe("b");
        expect((await play(game, actBy("b", reinforce(mine(game, "b")[0].id)))).outcome.validMove).toBe(true);
    });

    it("ends the battle, with nothing to choose, once the whole team is down", async () => {
        const game = makeGame(["a", "b"], {}, V12);
        await musterAll(game);
        game.specificGameState.roundsPlayed = 2;
        game.specificGameState.fighters.forEach(fighter => { if (!isWarband(fighter.owner)) down(fighter); });
        await play(game, endTurnBy("a"));
        expect(game).toMatchObject({ complete: true, endReason: "teamloss" });
    });
});

describe("a timed-out turn that owes a rally (§39.4)", () => {
    it("takes Rally, then ends the turn on the next call", async () => {
        const game = await waveLanded(V12, g => mine(g, "a").forEach(hurt));
        expect(await resolveStalledTurn(game, "a", "a")).toBe("advanced");
        expect(game.specificGameState.rallyOwed).toEqual(["b"]);
        expect(mine(game, "a").every(fighter => fighter.hp > 1)).toBe(true);
        expect(game.currentTurn).toBe("b");
        expect(game.gameState.history.some(entry => entry.text === "{{a}}'s squad rallies")).toBe(true);
    });

    it("takes Reinforce with the dearest downed character when nobody of theirs stands", async () => {
        const game = makeGame(["a", "b"], {}, V12);
        await musterAll(game);
        game.specificGameState.fighters.forEach(fighter => { if (isWarband(fighter.owner)) down(fighter); });
        game.specificGameState.roundsPlayed = 2;
        mine(game, "a").forEach(down);
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        const { CHARACTERS } = await import("./characters");
        const points = (fighter: Fighter) => CHARACTERS[fighter.character].points;
        const dearest = [...mine(game, "a")].sort((x, y) => points(y) - points(x) || x.id - y.id)[0];
        expect(await resolveStalledTurn(game, "a", "a")).toBe("advanced");
        expect(mine(game, "a").filter(isStanding).map(fighter => fighter.id)).toEqual([dearest.id]);
    });
});

describe("the last choice, on a real document (§39.4)", () => {
    it("is saved: nothing is owed in what the document would write, and the player can end their turn", async () => {
        const game = await waveLanded(V12);
        const { markModified: _, ...data } = game;
        // A hydrated document, as the command route holds one: `delete` on its nested path would leave the old list cached.
        const doc = RealmArenaGameDataModel.hydrate(structuredClone(data));
        const run = (command: Parameters<typeof play>[1]) => runCommand(doc as unknown as IGameData, new RealmArenaGameType(), command);
        const saved = () => JSON.stringify([doc.toObject().specificGameState.rallyOwed ?? null, doc.$getChanges()]);

        expect((await run(actBy("a", rally))).outcome.validMove).toBe(true);
        expect(doc.toObject().specificGameState.rallyOwed).toEqual(["b"]);
        expect((await run(endTurnBy("a"))).outcome.validMove).toBe(true);
        expect(doc.currentTurn).toBe("b");
        expect((await run(actBy("b", rally))).outcome.validMove).toBe(true);
        expect(doc.toObject().specificGameState.rallyOwed ?? undefined).toBeUndefined();
        expect(saved()).not.toContain('"rallyOwed":[');
        // Cleared for good: b can't choose again, and can end the turn.
        expect((await run(actBy("b", rally))).outcome.validMove).toBe(false);
        expect((await run(endTurnBy("b"))).outcome.validMove).toBe(true);
    });
});

describe("Reinforce in fog of war (§39.4)", () => {
    const FOG = { ...V12, fog: true };
    /** A fogged wave landed on a wiped-out a, with a warband character out of a's sight standing on each of the first `count` squares of a's zone. */
    async function ambushed(count: number): Promise<RealmArenaTestGame> {
        const game = await waveLanded(FOG, g => mine(g, "a").forEach(down));
        const field = battleOf(game).field;
        const zone = field.deployments[0];
        // b's characters go as far from a's zone as the ground allows, so nobody on a's side can see into it.
        const taken = new Set(game.specificGameState.fighters.filter(isStanding).map(fighter => fighter.square));
        const far = field.tiles.map((tile, square) => ({ tile, square })).filter(({ tile, square }) => tile.terrain.standable && !taken.has(square) && !zone.includes(square))
            .sort((x, y) => Math.min(...zone.map(near => distance(field, y.square, near))) - Math.min(...zone.map(near => distance(field, x.square, near))));
        mine(game, "b").filter(isStanding).forEach((fighter, index) => { fighter.square = far[index].square; });
        let id = 100;
        for (const square of zone.slice(0, count)) game.specificGameState.fighters.push(newFighter(id++, warbandOwner(0), "knight", square, null, undefined, false, game.specificGameState));
        const seen = new Set(viewOf(battleOf(game), "a").fighters.map(fighter => fighter.id));
        expect([...seen].some(one => one >= 100), "the blockers are out of sight").toBe(false);
        return game;
    }
    const zoneOf = (game: RealmArenaTestGame) => battlefieldById(game.specificGameState.map).deployments[0];

    it("places the character on the first square nobody standing holds, skipping one hidden in the way", async () => {
        const game = await ambushed(1);
        const seats = game.specificGameState.seats;
        expect(rallyOptionsOf(battleOf(game), seats, "a")[1].available).toBe(true);
        const { id } = mine(game, "a")[0];
        expect((await play(game, actBy("a", reinforce(id)))).outcome.validMove).toBe(true);
        expect(isStanding(now(game, id))).toBe(true);
        expect(now(game, id).square).toBe(zoneOf(game)[1]);
    });

    it("takes a Reinforce as a Rally when every square it thought free is held in truth, and says so", async () => {
        const game = await ambushed(zoneOf(await waveLanded(FOG)).length);
        const seats = game.specificGameState.seats;
        // Judged from a's own sight, nothing is in the way: the sheet offers it and a refusal would tell a what is there.
        expect(rallyOptionsOf(viewOf(battleOf(game), "a"), seats, "a")[1].available).toBe(true);
        expect(rallyOptionsOf(battleOf(game), seats, "a")[1].available).toBe(true);
        const { id } = mine(game, "a")[0];
        expect((await play(game, actBy("a", reinforce(id)))).outcome.validMove).toBe(true);
        expect(isStanding(now(game, id))).toBe(false);
        expect(game.specificGameState.rallyOwed).toEqual(["b"]);
        expect(game.gameState.history[0].text).toBe("{{a}}'s squad rallies: there was no room to bring anyone back");
        // Recorded as the Rally it became, so a replay agrees.
        expect((game.gameState.commandHistory.at(-1) as unknown as { action: RallyAction }).action).toEqual(rally);
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
    });

    it("does the same when the turn times out", async () => {
        const game = await ambushed(zoneOf(await waveLanded(FOG)).length);
        const { id } = mine(game, "a")[0];
        expect(await resolveStalledTurn(game, "a", "a")).toBe("advanced");
        expect(isStanding(now(game, id))).toBe(false);
        expect(game.gameState.history.some(entry => entry.text.includes("no room to bring anyone back"))).toBe(true);
        expect(game.specificGameState.rallyOwed).toEqual(["b"]);
    });
});

describe("a wiped-out player whose zone is full has no turn to take (§39.4)", () => {
    it("is stepped past, where one with room is given theirs", async () => {
        const open = await waveLanded(V12, g => mine(g, "a").forEach(down));
        expect(nextSeat(open, "b")).toBe("a");
        const full = await waveLanded(V12, g => mine(g, "a").forEach(down));
        const zone = battlefieldById(full.specificGameState.map).deployments[0];
        let id = 100;
        for (const square of zone) full.specificGameState.fighters.push(newFighter(id++, "b", "knight", square, null, undefined, false, full.specificGameState));
        expect(rallyOptionsOf(battleOf(full), full.specificGameState.seats, "a")[1].available).toBe(false);
        expect(nextSeat(full, "b")).toBe("b");
    });
});

describe("a battle played under rules 12, from the muster to its end (§39.4)", () => {
    it("replays to exactly the live state, never asks for a roll, and records each wave's choices", async () => {
        seedRolls(5);
        const game = await playScriptedBattle(V12);
        const choices = game.gameState.commandHistory.filter(command => (command as { action?: { kind?: string } }).action?.kind === "rally");
        expect(choices.length).toBeGreaterThan(0);

        const consumed = () => { throw new Error("replay consumed randomness"); };
        vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(consumed);
        vi.spyOn(Math, "random").mockImplementation(consumed);
        const timeline = await buildTimeline(game, { a: "a", b: "b" }, [], undefined, null);
        const last = timeline.snapshots[timeline.currentIndex];
        expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, null, game.gameState.commandHistory.at(-1)?.id ?? null, true));
        vi.restoreAllMocks();

        const record = await recordBattle(game);
        const recorded = record!.waves!.flatMap(wave => wave.rallies ?? []);
        expect(recorded).toHaveLength(choices.length);
        expect(recorded.every(entry => ["a", "b"].includes(entry.seat))).toBe(true);
        expect(recorded.map(entry => entry.choice)).toEqual(choices.map(command => (command as unknown as { action: RallyAction }).action.choice));
        // The wave that landed is the one a choice is filed under: never the first, the muster's.
        expect(record!.waves![0].rallies).toBeUndefined();
    }, 60_000);

    it("leaves a battle's record as it was where the rally was no choice", async () => {
        seedRolls(5);
        const game = await playScriptedBattle(V11);
        const record = await recordBattle(game);
        expect(record!.waves!.every(wave => !("rallies" in wave))).toBe(true);
    }, 60_000);
});

describe("the harness's team makes the choice (§39.4)", () => {
    it("Reinforces when the downed character returns with more than half what a Rally would heal, and otherwise Rallies", async () => {
        // An Archer, who would return at 4 HP, beside three hurt characters whom a Rally would give 9, 6 and 4.
        const game = await waveLanded(V12, g => { down(mine(g, "a")[3]); mine(g, "a").slice(0, 3).forEach(hurt); });
        const battle = battleOf(game), seats = game.specificGameState.seats;
        expect(rallyChoiceFor(battle, seats, "a").choice).toBe("rally");
        expect(rallyChoiceFor(battle, seats, "a", "always").choice).toBe("rally");
        const healthy = await waveLanded(V12, g => { down(mine(g, "a")[0]); });
        const choice = rallyChoiceFor(battleOf(healthy), seats, "a");
        // Nearly full characters gain little, so the returning one is worth more.
        expect(choice).toMatchObject({ choice: "reinforce", fighter: mine(healthy, "a")[0].id });
        expect(rallyChoiceFor(battleOf(healthy), seats, "a", "always").choice).toBe("rally");
        // Resupply is never the policy's choice.
        const spent = await waveLanded(V12, g => { mine(g, "a")[0].item = null; mine(g, "a")[0].musteredItem = "fireFlask"; });
        expect(rallyChoiceFor(battleOf(spent), seats, "a").choice).toBe("rally");
    });
});

describe("what the sheet and the result say about a choice (§39.4)", () => {
    it("tells the choices made across a battle, leaving out any kind nobody made", () => {
        const choices = (...names: RallyAction["choice"][]) => names.map(choice => ({ choice }));
        expect(rallyTally(choices("rally", "reinforce", "rally", "resupply", "rally", "reinforce"))).toBe("Rallies: 3 rallies, 2 reinforcements, 1 resupply");
        expect(rallyTally(choices("resupply"))).toBe("Rallies: 1 resupply");
        expect(rallyTally([])).toBeUndefined();
    });

    it("totals what a Rally would give back, and lists the items a Resupply would", async () => {
        const game = await waveLanded(V12, g => {
            const [first, second, third] = mine(g, "a");
            first.hp = 1; second.hp = maxHpOf(second, g.specificGameState); down(third);
            first.item = null; first.musteredItem = "fireFlask";
        });
        const battle = battleOf(game);
        const [first] = mine(game, "a");
        // Only the hurt one gains: the full one has nothing to regain and the downed one stays down.
        const full = maxHpOf(first, battle);
        expect(rallyTotal(battle, "a")).toBe(Math.min(full - 1, Math.floor(full / 2)));
        expect(resupplyItems(battle, "a")).toEqual(["fireFlask"]);
        expect(resupplyItems(battle, "b")).toEqual([]);
    });
});
