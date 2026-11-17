import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { isNeighbour, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { EFFECT_IDS, FACTION_IDS, type CharacterId } from "./characters";
import { nextAction } from "./ai";
import { achievements } from "./achievements";
import { battlefieldById, REALM_ARENA_MAPS } from "./maps";
import { gameStateToModel } from "./RealmArenaModels";
import { recordBattle } from "./recordBattle";
import { nextWaveOf, RealmArenaGameType, warbandBudgetOf, waveBudgetOf, waveOf } from "./RealmArenaLogic";
import {
    act, actionPointsOf, areaAround, afflicted, alliesWithin, canAct, centreHolders, centrePoints, check, endTurn, fixedRolls, isBattleOver, isCombatant, isStanding, isStructure, isWarband,
    knockoutPoints, maxHpOf, musterRefusal, newFighter, nextFighterId, purified, shovePath, sidesStanding, squadHp, squadsStanding, squadSight, startTurn, temporaryCover,
    viewOf, warbandOwner, warbandsFor, watchedSquares, wavePurchase, TEAM_SIDE, type Fighter,
} from "./rules";
import { ruleValuesOf, rulesetFor } from "./rulesets";
import { actBy, battleOf, endTurnBy, makeGame, musterAll, play, playScriptedBattle, readyMadePicks, seedRolls, warbandsOf, type RealmArenaTestGame } from "./testFixtures";
import type { RealmArenaEndTurn } from "./RealmArenaLogic";

// docs/games/realm-arena.md §39.7: nests. The Swarm's warbands stand two nests each
// from the first muster, which the team destroys to thin the next wave. They are
// rules version 12's, so every battle here is built at it.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

afterEach(() => vi.restoreAllMocks());

const V12 = rulesetFor(12);
const SWARM = V12.FACTIONS.swarm;
const CONTEXT = { rulesVersion: 12 };
const holdOut = (settings: Parameters<typeof makeGame>[2] = {}, players = ["a", "b"]) =>
    makeGame(players, {}, { rulesVersion: 12, coop: { enemy: "swarm", mission: "holdOut" }, ...settings });
const fighters = (game: RealmArenaTestGame) => game.specificGameState.fighters;
const nestsOf = (game: RealmArenaTestGame, owner?: string) => fighters(game).filter(fighter => fighter.character === "nest" && (owner === undefined || fighter.owner === owner));
const combatantsOf = (game: RealmArenaTestGame, owner: string) => fighters(game).filter(fighter => fighter.owner === owner && isCombatant(fighter, CONTEXT));
const text = (game: RealmArenaTestGame) => game.gameState.history.map(entry => entry.text);

/** A battle mustered and ready, and its first nest. */
async function mustered(settings: Parameters<typeof makeGame>[2] = {}) {
    const game = holdOut(settings);
    await musterAll(game);
    return { game, gs: game.specificGameState, nest: nestsOf(game, warbandOwner(0))[0] };
}

/** Adds a fighter of any character to the battle, at full AP, and returns it (the state is shared, so a later `battleOf` sees it). */
function add(game: RealmArenaTestGame, owner: string, character: CharacterId, square: Square): Fighter {
    const gs = game.specificGameState;
    const fighter = { ...newFighter(nextFighterId(gs.fighters), owner, character, square, null, undefined, false, gs), ap: 4 };
    gs.fighters.push(fighter);
    return fighter;
}

/** A free square next to `square`, which someone could stand on. */
function neighbour(game: RealmArenaTestGame, square: Square, not: readonly Square[] = []): Square {
    const { field } = battleOf(game);
    const taken = new Set(fighters(game).filter(isStanding).map(fighter => fighter.square));
    const found = areaAround(field, square).find(at => at !== square && isNeighbour(field, at, square) && field.tiles[at].terrain.standable && !taken.has(at) && !not.includes(at));
    if (found === undefined) throw new Error("no room beside the square");
    return found;
}

/** Downs every character of the warbands but leaves their nests as they stand. */
const downWarbandCharacters = (game: RealmArenaTestGame) => fighters(game).forEach(fighter => { if (isWarband(fighter.owner) && !isStructure(fighter, CONTEXT)) fighter.hp = 0; });

/** Ends the round whose wave lands next as `round` begins, the warbands' characters having been downed first. */
async function landWave(game: RealmArenaTestGame, round: number): Promise<void> {
    const gs = game.specificGameState;
    gs.roundsPlayed = round - 2;
    gs.rallyOwed = undefined;
    downWarbandCharacters(game);
    await play(game, endTurnBy("a"));
    await play(game, endTurnBy("b"));
    expect(gs.roundsPlayed).toBe(round - 1);
}

describe("the nests a warband stands (§39.7)", () => {
    it("stands two for each Swarm warband on the map's nest squares, from the first muster, with the ids after everyone else's", async () => {
        const { game, gs } = await mustered();
        const field = battlefieldById(gs.map);
        const others = fighters(game).filter(fighter => fighter.character !== "nest");
        expect(nestsOf(game)).toHaveLength(4);
        for (const [k, owner] of warbandsOf(game).entries()) {
            expect(nestsOf(game, owner).map(nest => nest.square)).toEqual(field.nests![k]);
        }
        expect(Math.min(...nestsOf(game).map(nest => nest.id))).toBeGreaterThan(Math.max(...others.map(fighter => fighter.id)));
        for (const nest of nestsOf(game)) {
            expect(nest).toMatchObject({ hp: 10, ap: 0, banked: 0, item: null });
            expect(maxHpOf(nest, CONTEXT)).toBe(10);
            expect(isStanding(nest) && isStructure(nest, CONTEXT) && !isCombatant(nest, CONTEXT)).toBe(true);
            expect(actionPointsOf(nest, CONTEXT)).toBe(0);
        }
    });

    it("stands them on every Hold Out battlefield, for every team it seats", async () => {
        for (const [players, map] of [
            [["a", "b"], undefined], [["a", "b", "c"], undefined], [["a", "b"], "sackedFort"], [["a", "b", "c"], "sackedFort"], [["a", "b", "c", "d"], "sackedFort"],
            [["a", "b", "c"], "sunkenVillage"], [["a", "b", "c", "d"], "sunkenVillage"],
        ] as const) {
            const game = holdOut({ coop: { enemy: "swarm", mission: "holdOut", ...(map ? { map } : {}) } }, [...players]);
            await musterAll(game);
            expect(nestsOf(game), `${players.length} players on ${game.specificGameState.map}`).toHaveLength(2 * players.length);
            expect(new Set(nestsOf(game).map(nest => nest.square)).size).toBe(2 * players.length);
        }
    });

    it("stands none for the Renegades or the Miners, before version 12, or outside Hold Out", async () => {
        for (const settings of [
            { coop: { enemy: "realm", mission: "holdOut" } }, { coop: { enemy: "miners", mission: "holdOut" } },
            { rulesVersion: 11 }, { coop: { enemy: "swarm" } },
        ] as const) {
            const game = holdOut(settings as Parameters<typeof makeGame>[2]);
            await musterAll(game);
            expect(nestsOf(game), JSON.stringify(settings)).toEqual([]);
            expect(fighters(game).every(fighter => fighter.character !== "nest")).toBe(true);
        }
    });

    it("is in no roster or elite list, so no muster accepts one", () => {
        const field = battlefieldById("twinGateFort");
        for (const id of FACTION_IDS) {
            expect(V12.FACTIONS[id].characters).not.toContain("nest");
            expect(V12.FACTIONS[id].elites ?? []).not.toContain("nest");
            expect(musterRefusal(field, 0, [{ character: "nest", square: field.deployments[0][0] }], 100, {}, V12.FACTIONS[id], CONTEXT)).toBe("That character isn't in your faction");
        }
    });

    it("is hidden by fog until it's in sight, and names no random enemy while it's unseen", async () => {
        const { game, gs } = await mustered({ fog: true, coop: { enemy: "swarm", mission: "holdOut", random: true } });
        expect(gs.coop?.enemySeen).not.toBe(true);
        for (const viewer of ["a", "b", null]) {
            const response = gameStateToModel(gs, viewer, null);
            expect(response.fighters.some(fighter => isWarband(fighter.owner)), `${viewer}`).toBe(false);
            expect(response.enemy).toBeUndefined();
        }
        // Standing in the open, a nest is seen as any warband's character is: the faction is named with it.
        const nest = nestsOf(game)[0];
        const eye = add(game, "a", "scout", neighbour(game, nest.square));
        const seen = gameStateToModel(gs, "a", null);
        expect(seen.fighters.some(fighter => fighter.id === nest.id)).toBe(true);
        expect(seen.enemy).toBe("swarm");
        expect(eye.owner).toBe("a");
    });
});

describe("a nest is attacked like a character, and little else touches it (§39.7)", () => {
    it("takes a blow's damage with no armour, and a knock-out scores like a 20-point character's", async () => {
        const { game, gs, nest } = await mustered();
        const fighter = add(game, "a", "manAtArms", neighbour(game, nest.square));
        const outcome = act(battleOf(game), "a", { kind: "attack", fighter: fighter.id, target: nest.id }, fixedRolls([1]));
        const struck = outcome.events.find(event => event.kind === "struck");
        expect(struck).toMatchObject({ target: nest.id });
        expect((struck as { missed?: true }).missed).toBeUndefined();
        expect(outcome.fighters.find(one => one.id === nest.id)!.hp).toBe(10 - (struck as { damage: number }).damage);
        expect((struck as { damage: number }).damage).toBe(V12.CHARACTERS.manAtArms.weapon.damage);

        // Down it: the team scores what a knock-out of a 20-point character does.
        nest.hp = 1;
        const downed = act(battleOf(game), "a", { kind: "attack", fighter: fighter.id, target: nest.id }, fixedRolls([1]));
        expect(downed.events).toContainEqual({ kind: "downed", fighter: nest.id, by: fighter.id });
        expect(downed.events).toContainEqual({ kind: "scored", player: "a", points: knockoutPoints("nest", CONTEXT), reason: "knockout" });
        expect(knockoutPoints("nest", CONTEXT)).toBe(knockoutPoints("broodmother", CONTEXT));
        expect(knockoutPoints("nest", CONTEXT)).toBe(20 / ruleValuesOf(CONTEXT).KNOCKOUT_DIVISOR);
        expect(gs.fighters.length).toBeGreaterThan(0);
    });

    it("takes no effect but burning and poison", async () => {
        const { nest } = await mustered();
        for (const effect of EFFECT_IDS) {
            if (effect === "hunkered" || effect === "shieldWall") continue;
            const result = afflicted(nest, effect, 0, CONTEXT);
            expect(result !== undefined, effect).toBe(effect === "burning" || effect === "poisoned");
        }
    });

    it("burns and is poisoned, at the start of its warband's turn, and can be burned down", async () => {
        const { game, gs, nest } = await mustered();
        nest.hp = 1;
        gs.fighters = gs.fighters.map(fighter => fighter.id === nest.id ? afflicted(fighter, "burning", 0, CONTEXT)!.fighter : fighter);
        const { fighters: after, events } = startTurn(battleOf(game), nest.owner);
        expect(events.some(event => event.kind === "burned" && event.fighter === nest.id)).toBe(true);
        expect(after.find(one => one.id === nest.id)).toMatchObject({ hp: 0, ap: 0 });
        expect(events).toContainEqual({ kind: "downed", fighter: nest.id, by: 0 });
    });

    it("is struck by a Shove and not pushed", async () => {
        const { game, nest } = await mustered();
        const knight = add(game, "a", "knight", neighbour(game, nest.square));
        const battle = battleOf(game);
        expect(shovePath(battle, knight, nest)).toEqual({ path: [nest.square], collision: false });
        const outcome = act(battle, "a", { kind: "shove", fighter: knight.id, target: nest.id }, fixedRolls([1]));
        expect(outcome.events.some(event => event.kind === "moved")).toBe(false);
        expect(outcome.events.some(event => event.kind === "struck" && event.target === nest.id)).toBe(true);
        const after = outcome.fighters.find(one => one.id === nest.id)!;
        expect(after.square).toBe(nest.square);
        expect(after.hp).toBe(10 - V12.ABILITIES.shove!.damage!);
    });

    it("is healed by a Regrowth", async () => {
        const { game, nest } = await mustered();
        nest.hp = 4;
        const mother = add(game, nest.owner, "broodmother", neighbour(game, nest.square));
        const outcome = act(battleOf(game), nest.owner, { kind: "regrowth", fighter: mother.id, target: nest.id }, fixedRolls([]));
        expect(outcome.fighters.find(one => one.id === nest.id)!.hp).toBe(4 + V12.ABILITIES.regrowth.hp!);
    });

    it("takes no shelter from a Knight's Bulwark beside it, as a character does", async () => {
        const { game, nest } = await mustered();
        const skitterling = add(game, nest.owner, "skitterling", neighbour(game, nest.square));
        const knight = add(game, "a", "knight", neighbour(game, skitterling.square, [nest.square]));
        // Bulwark covers anyone next to the Knight, friend or foe — a character, not a nest.
        expect(temporaryCover(battleOf(game), skitterling)).toBe("half");
        knight.square = neighbour(game, nest.square, [skitterling.square]);
        expect(temporaryCover(battleOf(game), nest)).toBe("none");
    });
});

describe("a nest can't move, act or react (§39.7)", () => {
    it("has no AP, can't be given an action, and keeps none through its warband's turn", async () => {
        const { game, nest } = await mustered();
        const battle = battleOf(game);
        expect(canAct({ ...nest, ap: 4 }, battle)).toBe(false);
        for (const action of [{ kind: "hunker", fighter: nest.id }, { kind: "watch", fighter: nest.id }, { kind: "move", fighter: nest.id, path: [nest.square, neighbour(game, nest.square)] }] as const) {
            expect(check(battle, nest.owner, action), action.kind).toEqual({ refused: "A nest can't act" });
        }
        const started = startTurn(battle, nest.owner).fighters;
        expect(started.find(one => one.id === nest.id)!.ap).toBe(0);
        const ended = endTurn({ ...battle, fighters: started.map(one => one.id === nest.id ? { ...one, ap: 4 } : one) }, nest.owner, 1);
        expect(ended.events.some(event => event.kind === "watching" && event.fighter === nest.id)).toBe(false);
    });

    it("sets off no reaction on a move through its sight, though it has AP banked", async () => {
        const { game, gs, nest } = await mustered();
        gs.fighters = gs.fighters.map(fighter => fighter.id === nest.id ? { ...fighter, banked: 6 } : fighter);
        expect(watchedSquares(battleOf(game), "a").size).toBe(0);
        // A warband's character watching in its place does.
        const watcher = add(game, nest.owner, "spitter", neighbour(game, nest.square));
        watcher.banked = 4;
        expect(watchedSquares(battleOf(game), "a").size).toBeGreaterThan(0);
    });

    it("is never planned: the warband's planner picks no action for it, and a warband with only a nest left takes no turn", async () => {
        const { game, gs, nest } = await mustered();
        downWarbandCharacters(game);
        gs.fighters = gs.fighters.map(fighter => fighter.id === nest.id ? { ...fighter, ap: 4 } : fighter);
        const view = viewOf(battleOf(game), nest.owner);
        expect(nextAction(view, nest.owner, 1, [])).toBeUndefined();
        expect(squadsStanding(battleOf(game), warbandsFor(gs.seats))).toEqual([]);
        // The end of the turn doesn't wait on it: a round passes with both warbands only nests.
        const before = text(game).length;
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        expect(gs.roundsPlayed).toBe(1);
        expect(text(game).slice(0, text(game).length - before).some(line => /nest/i.test(line) && /moves|attacks|shoots/.test(line))).toBe(false);
    });

    it("sees nothing: a warband with only nests left has no eyes", async () => {
        const { game, nest } = await mustered({ fog: true });
        downWarbandCharacters(game);
        const sees = squadSight(battleOf(game), nest.owner);
        expect(sees(nest.square)).toBe(false);
        const eye = add(game, nest.owner, "skitterling", neighbour(game, nest.square));
        expect(squadSight(battleOf(game), nest.owner)(eye.square)).toBe(true);
    });

    it("is left out of whoever a Taunt or a Blessing reaches, and of a Purify", async () => {
        const { game, nest } = await mustered();
        const skitterling = add(game, nest.owner, "skitterling", neighbour(game, nest.square));
        const battle = battleOf(game);
        expect(alliesWithin(battle, battle.fighters, skitterling, 3).map(one => one.id)).toContain(skitterling.id);
        expect(alliesWithin(battle, battle.fighters, skitterling, 3).map(one => one.id)).not.toContain(nest.id);
        expect(alliesWithin(battle, battle.fighters, skitterling, undefined).some(one => one.character === "nest")).toBe(false);
        nest.hp = 5;
        const cleric = add(game, nest.owner, "cleric", neighbour(game, nest.square, [skitterling.square]));
        expect(purified(battleOf(game), cleric).map(one => one.id)).not.toContain(nest.id);
    });
});

describe("a nest is nobody standing (§39.7)", () => {
    it("is not someone left in a side, or a squad's HP, but still stands where it is", async () => {
        const { game, gs } = await mustered();
        const owner = warbandOwner(0);
        const squad = fighters(game).filter(fighter => fighter.owner === owner);
        const characters = squad.filter(fighter => fighter.character !== "nest");
        expect(squadHp(squad, CONTEXT).total).toBe(characters.reduce((sum, fighter) => sum + maxHpOf(fighter, CONTEXT), 0));
        downWarbandCharacters(game);
        const battle = battleOf(game);
        expect(nestsOf(game).every(isStanding)).toBe(true);
        expect(squadsStanding(battle, warbandsFor(gs.seats))).toEqual([]);
        expect(sidesStanding(battle)).toEqual([TEAM_SIDE]);
        expect(isBattleOver(battle, gs.seats, 0)).toBe(true);
        expect(squadHp(squad, CONTEXT).remaining).toBe(0);
    });

    it("doesn't hold up a win: the last wave beaten with nests still standing", async () => {
        const { game } = await mustered();
        downWarbandCharacters(game);
        game.specificGameState.roundsPlayed = 11;
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(false);
        game.specificGameState.roundsPlayed = 12;
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(true);
        expect(game).toMatchObject({ endReason: "teamwin", endDetail: "beat the last wave in round 13" });
        expect(nestsOf(game).every(isStanding)).toBe(true);
    });

    it("doesn't save the enemy from a loss: a team wiped out is overrun with every nest standing", async () => {
        const { game } = await mustered();
        fighters(game).forEach(fighter => { if (!isWarband(fighter.owner)) fighter.hp = 0; });
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(true);
        expect(game).toMatchObject({ endReason: "teamloss" });
    });

    it("leaves Broken Tide to the Swarm's characters: won with every one downed and the nests standing", async () => {
        const { game } = await mustered();
        const brokenTide = achievements.find(achievement => achievement.id === "realmarena.broken-tide")!;
        const check = (brokenTide.criteria as unknown as { check: (view: unknown, finished: { outcome: string }) => boolean }).check;
        downWarbandCharacters(game);
        const view = gameStateToModel(game.specificGameState, "a", null, true);
        expect(view.fighters.filter(fighter => fighter.character === "nest" && fighter.hp > 0)).toHaveLength(4);
        expect(check(view, { outcome: "win" })).toBe(true);
        // One character standing says otherwise.
        const standing = fighters(game).find(fighter => isWarband(fighter.owner) && fighter.character !== "nest")!;
        standing.hp = 3;
        expect(check(gameStateToModel(game.specificGameState, "a", null, true), { outcome: "win" })).toBe(false);
    });

    it("isn't counted by the refill or the cap, nor by the next wave's count", async () => {
        const { game, gs } = await mustered();
        const [owner] = warbandsOf(game);
        const purchase = (round: number) => wavePurchase(SWARM, waveBudgetOf(gs, round, owner), round, CONTEXT);
        downWarbandCharacters(game);
        // Nobody of the warband stands but its two nests: the wave brings the whole purchase.
        expect(waveOf(gs, owner, true, 4).map(one => one.character).sort()).toEqual([...purchase(4)].sort());
        gs.roundsPlayed = 2;
        const next = nextWaveOf(gs);
        expect(next).toMatchObject({ round: 4 });
        expect(next!.arriving).toBe(2 * purchase(4).length);
        // The cap counts characters: 11 of them and 2 nests leave room for one.
        const field = battlefieldById(gs.map);
        const free = field.tiles.map((_, square) => square).filter(square => field.tiles[square].terrain.standable && !gs.fighters.some(one => one.square === square));
        while (combatantsOf(game, owner).length < 11) add(game, owner, "bloater", free.pop()!);
        expect(waveOf(gs, owner, true, 13)).toHaveLength(1);
        add(game, owner, "bloater", free.pop()!);
        expect(waveOf(gs, owner, true, 13)).toEqual([]);
    });

    it("doesn't count as an enemy downed, standing or arrived in the result, or on the wire", async () => {
        seedRolls(5);
        const { game, gs } = await mustered();
        nestsOf(game, warbandOwner(0)).forEach(nest => { nest.hp = 0; });
        expect(gameStateToModel(gs, "a", null).enemiesDefeated).toBe(0);
        nestsOf(game, warbandOwner(0)).forEach(nest => { nest.hp = 10; });
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        // The record is of a finished battle: call this one over, as its replay reads it.
        game.complete = true;
        const record = await recordBattle(game);
        const squad = SWARM.readyMade[warbandBudgetOf(gs)].length;
        expect(record!.waves![0].arrived).toBe(2 * squad);
        for (const standing of record!.standingPerRound!) expect(standing.get("enemy")).toBeLessThanOrEqual(2 * squad + 0);
        expect(record!.standingPerRound![0].get("enemy")).toBe(combatantsOf(game, warbandOwner(0)).length + combatantsOf(game, warbandOwner(1)).length);
        expect(record!.fighting.some(row => row.character === "nest")).toBe(false);
    });

    it("doesn't take the centre from the team, or hold it itself", async () => {
        const { game, gs, nest } = await mustered();
        const field = battlefieldById(gs.map);
        const centre = field.objectives.centre.filter(square => field.tiles[square].terrain.standable);
        downWarbandCharacters(game);
        fighters(game).forEach(fighter => { if (!isWarband(fighter.owner)) fighter.hp = 0; });
        const mine = add(game, "a", "manAtArms", centre[0]);
        nest.square = centre[1];
        const battle = battleOf(game);
        expect(mine.ap).toBeGreaterThan(0);
        expect(centreHolders(battle)).toEqual([TEAM_SIDE]);
        expect(centrePoints(battle, "a", ruleValuesOf(CONTEXT).CENTRE_SCORES_FROM_ROUND)).toBe(ruleValuesOf(CONTEXT).CENTRE_POINTS);
        // And with nothing of the team there, a nest standing in the centre holds nothing.
        mine.hp = 0;
        expect(centreHolders(battleOf(game))).toEqual([]);
    });
});

describe("destroying a nest thins the next wave (§39.7)", () => {
    const base = (gs: RealmArenaTestGame["specificGameState"], round: number) => warbandBudgetOf(gs) + 15 * Math.floor((round - 1) / 3);

    it("takes 15 points off a warband's next wave for each nest, never below half of the budget", async () => {
        const { gs } = await mustered();
        const [one, two] = warbandsFor(gs.seats);
        expect(waveBudgetOf(gs, 4, one)).toBe(base(gs, 4));
        gs.nestsDestroyed = { [one]: 1 };
        expect(waveBudgetOf(gs, 4, one)).toBe(base(gs, 4) - 15);
        expect(waveBudgetOf(gs, 4, two)).toBe(base(gs, 4));
        // Without a warband in mind, a count is a ceiling: the full budget.
        expect(waveBudgetOf(gs, 4)).toBe(base(gs, 4));
        gs.nestsDestroyed = { [one]: 2 };
        expect(waveBudgetOf(gs, 7, one)).toBe(base(gs, 7) - 30);
        gs.nestsDestroyed = { [one]: 100 };
        expect(waveBudgetOf(gs, 13, one)).toBe(Math.ceil(base(gs, 13) / 2));
        // A catalogue without the number takes nothing off.
        const old = makeGame(["a", "b"], {}, { rulesVersion: 11, coop: { enemy: "swarm", mission: "holdOut" } });
        old.specificGameState.nestsDestroyed = { [warbandOwner(0)]: 2 };
        expect(waveBudgetOf(old.specificGameState, 13, warbandOwner(0))).toBe(warbandBudgetOf(old.specificGameState));
    });

    it("thins the escort and not the elite: the wave still buys it first", async () => {
        const { game, gs } = await mustered();
        const [owner] = warbandsOf(game);
        downWarbandCharacters(game);
        const full = waveOf(gs, owner, true, 7).map(one => one.character);
        gs.nestsDestroyed = { [owner]: 2 };
        const thinned = waveOf(gs, owner, true, 7).map(one => one.character);
        expect(thinned).toContain("bileLobber");
        expect(wavePurchase(SWARM, waveBudgetOf(gs, 7, owner), 7, CONTEXT)[0]).toBe("bileLobber");
        expect(thinned.length).toBeLessThan(full.length);
        // The floor still buys the elite: half the budget covers the Lobber.
        gs.nestsDestroyed = { [owner]: 100 };
        expect(waveOf(gs, owner, true, 7).map(one => one.character)).toContain("bileLobber");
    });

    it("counts a nest destroyed by a command, scores it, and regrows it at full HP as that warband's wave lands", async () => {
        const { game, gs, nest } = await mustered();
        const [owner, other] = warbandsOf(game);
        const mage = add(game, "a", "mage", neighbour(game, nest.square));
        // Back up to somewhere the fireball is allowed from.
        const battle = battleOf(game);
        const spot = battle.field.tiles.map((_, square) => square).find(square => {
            if (!battle.field.tiles[square].terrain.standable || square === nest.square) return false;
            mage.square = square;
            return !("refused" in check(battleOf(game), "a", { kind: "fireball", fighter: mage.id, at: nest.square }));
        });
        expect(spot).toBeDefined();
        nest.hp = 1;
        const before = gs.scores.a ?? 0;
        const { outcome } = await play(game, actBy("a", { kind: "fireball", fighter: mage.id, at: nest.square }));
        expect(outcome.validMove).toBe(true);
        expect(fighters(game).find(one => one.id === nest.id)!.hp).toBe(0);
        expect(gs.nestsDestroyed).toEqual({ [owner]: 1 });
        expect(gs.scores.a).toBe(before + knockoutPoints("nest", CONTEXT));

        // The wave lands smaller for it, and the other warband's isn't.
        const expected = [wavePurchase(SWARM, waveBudgetOf(gs, 4, owner), 4, CONTEXT), wavePurchase(SWARM, waveBudgetOf(gs, 4, other), 4, CONTEXT)].map(list => [...list].sort());
        expect(expected[0].length).toBeLessThanOrEqual(expected[1].length);
        expect(waveBudgetOf(gs, 4, owner)).toBe(waveBudgetOf(gs, 4, other) - 15);
        await landWave(game, 4);
        expect(combatantsOf(game, owner).map(one => one.character).sort()).toEqual(expected[0]);
        expect(combatantsOf(game, other).map(one => one.character).sort()).toEqual(expected[1]);
        // It grew back, at full HP on its own square, and what it cost is spent.
        const grown = fighters(game).find(one => one.id === nest.id)!;
        expect(grown).toMatchObject({ hp: 10, square: nest.square });
        expect(gs.nestsDestroyed).toBeUndefined();
        expect(waveBudgetOf(gs, 7, owner)).toBe(base(gs, 7));
        expect(nestsOf(game)).toHaveLength(4);
    });

    it("regrows a nest on the free square nearest its own when someone stands there, each on a square of its own", async () => {
        const { game, gs } = await mustered();
        const owner = warbandOwner(0);
        const [firstNest, secondNest] = nestsOf(game, owner);
        const first = { id: firstNest.id, square: firstNest.square }, second = { id: secondNest.id, square: secondNest.square };
        for (const nest of [firstNest, secondNest]) nest.hp = 0;
        gs.nestsDestroyed = { [owner]: 2 };
        // The team stands on one, a downed character of its own on the other (which blocks nothing).
        const onFirst = add(game, "b", "manAtArms", first.square);
        add(game, "b", "archer", second.square).hp = 0;
        await landWave(game, 4);
        const grown = nestsOf(game, owner);
        expect(grown.every(isStanding)).toBe(true);
        expect(grown.find(one => one.id === second.id)!.square).toBe(second.square);
        const moved = grown.find(one => one.id === first.id)!;
        expect(moved.square).not.toBe(first.square);
        expect(isNeighbour(battleOf(game).field, moved.square, first.square)).toBe(true);
        expect(moved.hp).toBe(10);
        expect(new Set(grown.map(one => one.square)).size).toBe(2);
        expect(onFirst.square).toBe(first.square);
        expect(gs.nestsDestroyed).toBeUndefined();
    });

    it("leaves a nest that is only hurt as hurt, and its count at nothing", async () => {
        const { game, gs, nest } = await mustered();
        nest.hp = 4;
        await landWave(game, 4);
        expect(fighters(game).find(one => one.id === nest.id)!.hp).toBe(4);
        expect(gs.nestsDestroyed).toBeUndefined();
    });

    it("stays down while the nests are all there is to be done: a count of nothing changes no wave", async () => {
        const { game, gs } = await mustered();
        const [owner] = warbandsOf(game);
        downWarbandCharacters(game);
        const full = waveOf(gs, owner, true, 4).map(one => one.character);
        gs.nestsDestroyed = { [owner]: 0 };
        expect(waveOf(gs, owner, true, 4).map(one => one.character)).toEqual(full);
    });
});

describe("the team's planner and the nest (§39.7)", () => {
    it("hits a nest it reaches", async () => {
        const { game, nest } = await mustered();
        downWarbandCharacters(game);
        fighters(game).forEach(fighter => { if (!isWarband(fighter.owner)) fighter.hp = 0; });
        const fighter = add(game, "a", "manAtArms", neighbour(game, nest.square));
        const action = nextAction(viewOf(battleOf(game), "a"), "a", 1);
        expect(action).toBeDefined();
        expect(action!.fighter).toBe(fighter.id);
        const aimed = "target" in action! ? [action.target] : "targets" in action! ? action.targets : [];
        expect(aimed).toContain(nest.id);
    });
});

describe("a replay of a Hold Out with nests destroyed (§39.7)", () => {
    it("lands on exactly the live state, with the nests destroyed and regrown as they were, rolling nothing again", async () => {
        seedRolls(7);
        // Nests where the team's first squads can reach them, in front of their ready-made squads' first characters, so the battle destroys some.
        const field = REALM_ARENA_MAPS.twinGateFort as Battlefield & { nests?: readonly (readonly Square[])[] };
        const original = field.nests;
        const probe = holdOut();
        const inFront = (seat: number) => [0, 2].map(index => readyMadePicks(probe, seat)[index].square + field.width);
        field.nests = [inFront(0), inFront(1)];
        try {
            const game = await playScriptedBattle({ rulesVersion: 12, coop: { enemy: "swarm", mission: "holdOut" } });
            expect(nestsOf(game)).toHaveLength(4);
            expect(text(game).some(line => /\bNest\b/.test(line) && /down/i.test(line))).toBe(true);
            const history = game.gameState.commandHistory;
            const timeline = await (async () => {
                const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("replay consumed randomness"); });
                try {
                    return await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
                } finally {
                    random.mockRestore();
                }
            })();
            const last = timeline.snapshots[timeline.currentIndex];
            expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", history.at(-1)?.id ?? null, true));
            expect(history.some(command => ((command as RealmArenaEndTurn).recordedEnemyActions ?? []).length > 0)).toBe(true);

            const record = await recordBattle(game);
            expect(record!.fighting.some(row => row.character === "nest")).toBe(false);
        } finally {
            field.nests = original;
        }
    }, 120_000);
});
