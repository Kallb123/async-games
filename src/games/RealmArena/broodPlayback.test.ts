import { describe, expect, it, vi } from "vitest";
import { distance } from "@/utils/games/battlefield/terrain";
import { pathTo } from "@/utils/games/battlefield/pathfinding";
import { reachOf, warbandOwner, type Action } from "./rules";
import { stepOutcomeToModel } from "./RealmArenaModels";
import type { IRealmArenaOutcome } from "./RealmArenaLogic";
import { addFighter, battleOf, endTurnBy, makeGame, musterAll, playOne, warbandTurnBy, type RealmArenaTestGame } from "./testFixtures";

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

// docs/games/realm-arena-hold-out.md §4.5: a warband's minions move together
// and strike one after another, so a review plays each run as one part.

/** A Hold Out against the Brood, where the warband's own fighters are stood as the test wants and the team's first character is the one struck. */
async function broodBattle(fog = false) {
    const game = makeGame(["a", "b"], {}, { rulesVersion: 13, fog, coop: { mission: "holdOut", enemy: "brood" } });
    await musterAll(game);
    const gs = game.specificGameState;
    const victim = gs.fighters.find(one => one.owner === "a")!;
    const far = gs.fighters.find(one => one.owner === "b")!;
    gs.fighters = gs.fighters.map(one => one.id === victim.id || one.id === far.id ? one : { ...one, hp: 0 });
    const { field } = battleOf(game);
    const taken = new Set(gs.fighters.map(one => one.square));
    const free = (square: number) => field.tiles[square].terrain.standable && !taken.has(square);
    const claim = (ok: (square: number) => boolean) => {
        const square = field.tiles.findIndex((_, index) => free(index) && ok(index));
        if (square < 0) throw new Error("no square to stand on");
        taken.add(square);
        return square;
    };
    const warband = warbandOwner(0);
    const walkers = [1, 2, 3].map(() => addFighter(game, warband, "broodSkitterling", claim(square => distance(field, square, victim.square) > 8 && [...taken].every(other => distance(field, square, other) > 3))));
    const strikers = [1, 2].map(() => addFighter(game, warband, "broodSkitterling", claim(square => distance(field, square, victim.square) === 1)));
    const brute = addFighter(game, warband, "broodRavager", claim(square => distance(field, square, victim.square) > 8 && [...taken].every(other => distance(field, square, other) > 3)));
    return { game, victim, walkers, strikers, brute };
}

/** A move to the nearest square `fighter` can step to (the fixtures' `oneStep` reads the current rules, not this battle's). */
function oneStep(game: RealmArenaTestGame, fighter: { id: number }): Action {
    const battle = battleOf(game);
    const mover = battle.fighters.find(one => one.id === fighter.id)!;
    const reach = reachOf(battle, mover, false);
    let best = -1;
    for (let square = 0; square < reach.costs.length; square++) {
        if (reach.costs[square] > 0 && reach.costs[square] !== Infinity && (best < 0 || reach.costs[square] < reach.costs[best])) best = square;
    }
    return { kind: "move", fighter: fighter.id, path: pathTo(reach, best)!.squares };
}

/** The warband's turn played from the End turn that hands it over, as the review of that command sees it. */
async function warbandTurn(game: RealmArenaTestGame, actions: Action[], rolls: number[], viewer: string | null = "a") {
    const { outcome } = await playOne(game, warbandTurnBy(game.currentTurn, actions, rolls));
    expect(outcome.validMove).toBe(true);
    return { outcome: outcome as IRealmArenaOutcome, step: stepOutcomeToModel(outcome, viewer, game.specificGameState) };
}

describe("playing a warband's minions (§4.5)", () => {
    it("plays a run of minion moves as one part and a run of minion strikes as another", async () => {
        const { game, victim, walkers, strikers, brute } = await broodBattle();
        expect((await playOne(game, endTurnBy(game.currentTurn))).outcome.validMove).toBe(true);
        const actions: Action[] = [
            ...walkers.map(walker => oneStep(game, walker)),
            ...strikers.map((striker): Action => ({ kind: "attack", fighter: striker.id, target: victim.id })),
            oneStep(game, brute),
        ];
        const { outcome, step } = await warbandTurn(game, actions, [1, 1]);
        const steps = outcome.recap!.enemy!.steps;
        expect(steps).toHaveLength(6);

        const parts = step!.parts!;
        const kinds = (part: { events: readonly { kind: string }[] }) => [...new Set(part.events.map(event => event.kind))].join();
        const inTurn = parts.filter(part => part.kind === "enemy");
        const moves = inTurn.filter(part => kinds(part) === "moved");
        expect(moves).toHaveLength(2);
        expect(moves[0].events.map(event => "fighter" in event ? event.fighter : -1)).toEqual(walkers.map(walker => walker.id));
        expect(moves[1].events.map(event => "fighter" in event ? event.fighter : -1)).toEqual([brute.id]);
        const strikes = inTurn.filter(part => part.events.some(event => event.kind === "struck"));
        expect(strikes).toHaveLength(1);
        expect(strikes[0].events.filter(event => event.kind === "struck")).toHaveLength(2);
        // The walking minions come first, then the strikes, then the real character's own move, whole.
        expect(inTurn.indexOf(moves[0])).toBeLessThan(inTurn.indexOf(strikes[0]));
        expect(inTurn.indexOf(strikes[0])).toBeLessThan(inTurn.indexOf(moves[1]));
        // Played in turn, the parts are still every event, and a merged part's board is the last action's.
        expect(parts.flatMap(part => part.events)).toEqual(step!.events);
        const squareOf = (state: { fighters: readonly { id: number; square: number }[] } | undefined, id: number) => state?.fighters.find(one => one.id === id)?.square;
        for (const [index, walker] of walkers.entries()) {
            const end = (steps[index].events[0] as { path: number[] }).path.at(-1);
            expect(squareOf(moves[0].state, walker.id)).toBe(end);
        }
    });

    it("keeps a minion's move and a real character's move apart, and a lone minion move as it was", async () => {
        const { game, walkers, brute } = await broodBattle();
        expect((await playOne(game, endTurnBy(game.currentTurn))).outcome.validMove).toBe(true);
        const { step } = await warbandTurn(game, [oneStep(game, brute), oneStep(game, walkers[0]), oneStep(game, walkers[1])], []);
        const moves = step!.parts!.filter(part => part.events.some(event => event.kind === "moved"));
        expect(moves.map(part => part.events.length)).toEqual([1, 2]);
    });

    it("tells a fogged viewer a merged run only of the moves it saw, and nothing of a minion it never did", async () => {
        const { game, walkers } = await broodBattle(true);
        expect((await playOne(game, endTurnBy(game.currentTurn))).outcome.validMove).toBe(true);
        const { outcome } = await warbandTurn(game, walkers.map(walker => oneStep(game, walker)), []);
        let hidden = 0;
        for (const viewer of ["a", "b", null]) {
            const step = stepOutcomeToModel(outcome, viewer, game.specificGameState);
            const told = new Set((step?.events ?? []).flatMap(event => "fighter" in event ? [event.fighter] : []));
            const unseen = walkers.filter(walker => !told.has(walker.id) && !game.specificGameState.sightings?.[viewer ?? ""]?.some(ghost => ghost.id === walker.id));
            hidden += unseen.length;
            const wire = JSON.stringify(step ?? {});
            for (const walker of unseen) expect(wire, `${viewer} and ${walker.id}`).not.toMatch(new RegExp(`"(id|fighter)":${walker.id}[,}]`));
            // Whatever it was told is still all in the parts, in order.
            if (step?.parts) expect(step.parts.flatMap(part => part.events)).toEqual(step.events);
        }
        // The walkers start far from the team, so some viewer was told nothing of one.
        expect(hidden).toBeGreaterThan(0);
    });
});
