import { afterEach, describe, expect, it, vi } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield, distance, isNeighbour, type Square } from "@/utils/games/battlefield/terrain";
import { buildTimeline } from "@/utils/games/replay";
import type { CharacterId } from "./characters";
import { battlefieldById } from "./maps";
import { gameStateToModel, type RealmArenaSettings } from "./RealmArenaModels";
import { nextRallyOf, nextWaveOf, RealmArenaAct, waveOf } from "./RealmArenaLogic";
import { act, ACTION_POINTS, afflicted, areaAround, check, fixedRolls, hordeSpawn, isCombatant, isMinion, isStanding, isStructure, isWarband, knockoutPoints, newFighter, shrineOf, spawnThemeOf, spawnThreatOf, viewOf, warbandOwner, type Action, type BattleState, type Fighter } from "./rules";
import { rallyOptionsOf } from "./rally";
import { ruleValuesOf, rulesetFor } from "./rulesets";
import { swarmAction, swarmMemo } from "./swarm";
import { actBy, cmd, endTurnBy, makeGame, musterAll, play, playOne, playScriptedBattle, recordedWarbandActions, responseFor, warbandTurnBy, type RealmArenaTestGame } from "./testFixtures";
import { seedRolls } from "./seedRolls";

// docs/games/realm-arena-hold-out.md §5: from rules version 13, Hold Out is
// against the Brood alone. Its nests produce the enemy every round, the team
// defends a Shrine, a rally is earned on a schedule and by breaking a warband,
// and the battle ends the moment the last nest falls (or the Shrine does).

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

afterEach(() => vi.restoreAllMocks());

const V13 = { rulesVersion: 13 };
const RULES = ruleValuesOf(V13);
const BROOD = rulesetFor(13).FACTIONS.brood;
const { CHARACTERS } = rulesetFor(13);
const TEAM = ["a", "b"];

/** A Hold Out battle under rules 13. The enemy asked for is `realm`, which the rules overrule, unless `settings` say otherwise. */
const holdOut = (players: string[] = TEAM, settings: RealmArenaSettings = {}): RealmArenaTestGame =>
    makeGame(players, {}, { rulesVersion: 13, coop: { enemy: "realm", mission: "holdOut" }, ...settings });
const mustered = async (players: string[] = TEAM, settings: RealmArenaSettings = {}) => {
    const game = holdOut(players, settings);
    await musterAll(game);
    return game;
};

const fightersOf = (game: RealmArenaTestGame) => game.specificGameState.fighters;
const nestsOf = (game: RealmArenaTestGame, owner?: string) => fightersOf(game).filter(one => one.character === "nest" && (owner === undefined || one.owner === owner));
const standingNests = (game: RealmArenaTestGame, owner?: string) => nestsOf(game, owner).filter(isStanding);
/** What a warband has on the field that fights, standing or not. */
const horde = (game: RealmArenaTestGame, owner: string) => fightersOf(game).filter(one => one.owner === owner && isCombatant(one, V13));
const text = (game: RealmArenaTestGame) => game.gameState.history.map(entry => entry.text);
const shrineIn = (game: RealmArenaTestGame) => shrineOf(game.specificGameState)!;
/** A fighter as the game holds it now: a command replaces the fighters it changes, so one fetched before it is stale. */
const now = (game: RealmArenaTestGame, fighter: Fighter) => fightersOf(game).find(one => one.id === fighter.id)!;
/** The count the horde's caps are read against, as the engine takes it: the warband's standing fighters. */
const countOf = (game: RealmArenaTestGame, owner: string) => {
    const standing = horde(game, owner).filter(isStanding);
    return { minions: standing.filter(one => isMinion(one, V13)).length, others: standing.filter(one => !isMinion(one, V13)).length };
};
const threatOf = (bought: readonly CharacterId[]) => bought.reduce((sum, id) => sum + CHARACTERS[id].threat!, 0);

/** Downs everything the warbands field that fights: their nests, and the Shrine, are left alone. */
const downHorde = (game: RealmArenaTestGame) => fightersOf(game).forEach(one => { if (isWarband(one.owner) && isCombatant(one, V13)) one.hp = 0; });
/** A rally choice that does the least. */
const rally = (seat: string) => actBy(seat, { kind: "rally", choice: "rally" });

/**
 * The round's players' turns, from the first seat on, each a rally taken if
 * owed and then End turn, with the warbands' turns the server plays between.
 * The horde is downed first so nothing of the team's is in danger: the Brood's
 * nests produce, and what they make acts only from their next turn.
 */
async function playRound(game: RealmArenaTestGame, players: string[] = TEAM): Promise<void> {
    downHorde(game);
    for (const player of players) {
        if (game.complete) return;
        if (game.specificGameState.rallyOwed?.includes(player)) expect((await play(game, rally(player))).outcome.validMove).toBe(true);
        expect((await play(game, endTurnBy(player))).outcome.validMove, `${player}'s End turn`).toBe(true);
    }
}

/** Starts a battle so the round `round` is the next to begin: its rounds before it played in the state only. */
const atRound = async (round: number, players: string[] = TEAM, settings: RealmArenaSettings = {}) => {
    const game = await mustered(players, settings);
    game.specificGameState.roundsPlayed = round - 1;
    return game;
};

/** A blow by `attacker` on `target` that lands: the roll scripted, as a replay carries it. */
const strike = (game: RealmArenaTestGame, attacker: Fighter, target: Fighter) =>
    play(game, cmd(RealmArenaAct, attacker.owner, { action: { kind: "attack", fighter: attacker.id, target: target.id }, recordedRolls: [1] }));

/** A free standable square next to `square`. */
function beside(game: RealmArenaTestGame, square: Square): Square {
    const field = battlefieldById(game.specificGameState.map);
    const taken = new Set(fightersOf(game).filter(isStanding).map(one => one.square));
    const found = areaAround(field, square).find(at => at !== square && isNeighbour(field, at, square) && field.tiles[at].terrain.standable && !taken.has(at));
    if (found === undefined) throw new Error("no room beside the square");
    return found;
}

/** Stands a fresh team character next to `nest`, with AP to strike it, and downs everything else of the nest's that would stop a blow reaching it. */
function stoodBeside(game: RealmArenaTestGame, nest: Fighter, owner = "a"): Fighter {
    const gs = game.specificGameState;
    const square = beside(game, nest.square);
    const fighter = { ...newFighter(Math.max(...gs.fighters.map(one => one.id)) + 1, owner, "manAtArms", square, null, undefined, undefined, false, gs), ap: 4 };
    gs.fighters.push(fighter);
    return fighter;
}

describe("Hold Out is the Brood's alone (§5)", () => {
    it.each([
        ["Realm", { enemy: "realm" as const }],
        ["Miners", { enemy: "miners" as const }],
        ["Swarm", { enemy: "swarm" as const }],
        ["Random", { enemy: "realm" as const, random: true as const }],
        ["the Brood itself", { enemy: "brood" as const }],
    ])("is fought against the Brood whatever was chosen (%s), and never a random enemy", (_, choice) => {
        const { coop } = holdOut(TEAM, { coop: { ...choice, mission: "holdOut" } }).specificGameState;
        expect(coop).toMatchObject({ enemy: "brood", mission: "holdOut" });
        expect(coop).not.toHaveProperty("random");
    });

    it("leaves Hold the Centre its host's choice, and a version-12 Hold Out too", () => {
        for (const enemy of ["realm", "miners", "swarm"] as const) {
            expect(makeGame(TEAM, {}, { rulesVersion: 13, coop: { enemy } }).specificGameState.coop?.enemy, `Hold the Centre vs ${enemy}`).toBe(enemy);
            expect(makeGame(TEAM, {}, { rulesVersion: 12, coop: { enemy, mission: "holdOut" } }).specificGameState.coop?.enemy, `v12 Hold Out vs ${enemy}`).toBe(enemy);
        }
        const centre = makeGame(TEAM, {}, { rulesVersion: 13, coop: { enemy: "realm", random: true } }).specificGameState.coop;
        expect(centre).toMatchObject({ enemy: "realm", random: true });
        const old = makeGame(TEAM, {}, { rulesVersion: 12, coop: { enemy: "swarm", random: true, mission: "holdOut" } }).specificGameState.coop;
        expect(old).toMatchObject({ enemy: "swarm", random: true });
    });
});

describe("the muster: nests, a Shrine and a starting horde (§5.1, §5.2)", () => {
    it.each([[["a"]], [["a", "b"]], [["a", "b", "c"]]])("stands two 15-HP nests a warband on the ruleset's sites, for %j", async players => {
        const game = await mustered(players);
        const gs = game.specificGameState;
        const sites = RULES.HOLD_OUT_SITES![gs.map];
        expect(sites, `sites for ${gs.map}`).toBeDefined();
        expect(sites.nests).toHaveLength(players.length);
        for (const [k, owner] of players.map((_, k) => [k, warbandOwner(k)] as const)) {
            const nests = nestsOf(game, owner);
            expect(nests.map(nest => nest.square)).toEqual(sites.nests[k].map(site => at(battlefieldById(gs.map), site.col, site.row)));
            for (const nest of nests) expect(nest).toMatchObject({ hp: 15, ap: 0 });
        }
        expect(nestsOf(game)).toHaveLength(2 * players.length);
    });

    it("stands the Shrine on its site with 20 HP and 10 for each player, on the team's side", async () => {
        for (const players of [["a"], TEAM, ["a", "b", "c"]]) {
            const game = await mustered(players);
            const shrine = shrineIn(game);
            const site = RULES.HOLD_OUT_SITES![game.specificGameState.map].shrine;
            expect(shrine.square).toBe(at(battlefieldById(game.specificGameState.map), site.col, site.row));
            expect(shrine).toMatchObject({ character: "shrine", hp: 20 + 10 * players.length, maxHp: 20 + 10 * players.length });
            expect(isStructure(shrine, V13) && !isCombatant(shrine, V13)).toBe(true);
            expect(fightersOf(game).filter(one => one.owner === shrine.owner)).toHaveLength(1);
            expect(game.specificGameState.coop).toBeDefined();
        }
    });

    it("gives each warband a starting horde bought with 10 threat on its first theme, and no Shrine or nests outside a nests-produce Hold Out", async () => {
        const game = await mustered();
        const theme = spawnThemeOf(BROOD, 1, V13)!;
        expect(theme.name).toBe("The Rush");
        for (const owner of [warbandOwner(0), warbandOwner(1)]) {
            const characters = horde(game, owner).map(one => one.character);
            // What `hordeSpawn` buys with it: it stops at the first it can't afford, so 1 of the 10 goes unspent.
            expect(characters, owner).toEqual(hordeSpawn(theme, RULES.STARTING_HORDE!, { minions: 0, others: 0 }, V13).bought);
            expect(threatOf(characters), owner).toBe(9);
            for (const character of characters) expect(theme.buys).toContain(character);
            expect(horde(game, owner).every(one => one.ap === 0)).toBe(true);
        }
        // Not under version 12, nor in Hold the Centre.
        for (const settings of [{ rulesVersion: 12, coop: { enemy: "swarm" as const, mission: "holdOut" as const } }, { coop: { enemy: "realm" as const } }]) {
            const other = makeGame(TEAM, {}, settings);
            await musterAll(other);
            expect(shrineOf(other.specificGameState), JSON.stringify(settings)).toBeUndefined();
        }
    });
});

describe("a warband turn spawns what its nests buy (§5.1)", () => {
    /** a's End turn, then warband 0's turn scripted to do nothing but begin: what its nests produce, and nothing else moves. */
    async function warbandBegins(game: RealmArenaTestGame) {
        expect((await playOne(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect((await playOne(game, warbandTurnBy(game.currentTurn, []))).outcome.validMove).toBe(true);
    }

    it("adds each standing nest's threat to the warband's bank and buys what hordeSpawn says, at 0 AP, next to a nest", async () => {
        const game = await mustered();
        const gs = game.specificGameState;
        const owner = warbandOwner(0);
        const before = new Set(fightersOf(game).map(one => one.id));
        const counted = countOf(game, owner);
        const expected = hordeSpawn(spawnThemeOf(BROOD, 1, V13)!, 2 * spawnThreatOf(1, V13), counted, V13);
        expect(spawnThreatOf(1, V13)).toBe(3);
        await warbandBegins(game);
        const made = fightersOf(game).filter(one => !before.has(one.id));
        expect(made.map(one => one.character)).toEqual(expected.bought);
        expect(expected.bought.length).toBeGreaterThan(0);
        expect(gs.threat?.[owner]).toBe(expected.left);
        const nests = nestsOf(game, owner);
        const field = battlefieldById(gs.map);
        for (const one of made) {
            expect(one.owner).toBe(owner);
            expect(one.ap).toBe(0);
            expect(nests.some(nest => areaAround(field, nest.square).includes(one.square)), `${one.character} stands by a nest`).toBe(true);
        }
        // The other warband's nests haven't had their turn.
        expect(made.every(one => one.owner === owner)).toBe(true);
        expect(gs.threat?.[warbandOwner(1)]).toBeUndefined();
    });

    it("carries what it couldn't afford into the next round: the Ravager comes once threat has banked", async () => {
        const game = await mustered();
        const gs = game.specificGameState;
        const owner = warbandOwner(0);
        // Round 1: 6 threat buys two Skitterlings (1 each) and stops at the Ravager (5), banking 4.
        await warbandBegins(game);
        expect(gs.threat?.[owner]).toBe(4);
        expect(horde(game, owner).slice(-2).map(one => one.character)).toEqual(["broodSkitterling", "broodSkitterling"]);
        // Round 2: the 4 carried and 6 more is 10, which pays for the Ravager.
        await play(game, endTurnBy("b"));
        expect(gs.roundsPlayed).toBe(1);
        const counted = countOf(game, owner);
        const before = new Set(fightersOf(game).map(one => one.id));
        const expected = hordeSpawn(spawnThemeOf(BROOD, 2, V13)!, 4 + 6, counted, V13);
        expect(expected.bought).toContain("broodRavager");
        await warbandBegins(game);
        const made = fightersOf(game).filter(one => !before.has(one.id) && one.owner === owner);
        expect(made.map(one => one.character)).toEqual(expected.bought);
        expect(gs.threat?.[owner]).toBe(expected.left);
    });

    it("keeps the horde's caps: no more than 16 minions and 4 others standing", async () => {
        const game = await mustered();
        const gs = game.specificGameState;
        const owner = warbandOwner(0);
        const nests = standingNests(game, owner);
        // Fill the horde to the minion cap with Skitterlings stood out of the way, and bank plenty.
        const field = battlefieldById(gs.map);
        let id = Math.max(...gs.fighters.map(one => one.id)) + 1;
        const free = field.tiles.map((_, square) => square).filter(square => field.tiles[square].terrain.standable && distance(field, square, nests[0].square) > 5 && !gs.fighters.some(one => one.square === square));
        gs.fighters = gs.fighters.filter(one => one.owner !== owner || isStructure(one, V13));
        for (let k = 0; k < RULES.HORDE_CAP!; k++) gs.fighters.push(newFighter(id++, owner, "broodSkitterling", free[k], null, undefined, undefined, false, gs));
        gs.threat = { [owner]: 40 };
        const before = fightersOf(game).length;
        await warbandBegins(game);
        const made = fightersOf(game).slice(before);
        expect(made.every(one => !isMinion(one, V13)), "no minion is bought over the cap").toBe(true);
        expect(made.length).toBeLessThanOrEqual(RULES.HORDE_REAL_CAP!);
        expect(countOf(game, owner).minions).toBe(RULES.HORDE_CAP);
        expect(countOf(game, owner).others).toBeLessThanOrEqual(RULES.HORDE_REAL_CAP!);
    });

    it("takes a warband's turn even with only its nests standing, and spawns", async () => {
        const game = await mustered();
        const owner = warbandOwner(0);
        game.specificGameState.fighters = game.specificGameState.fighters.filter(one => one.owner !== owner || isStructure(one, V13));
        expect(horde(game, owner)).toEqual([]);
        // The full flow, as the server plays it: a ends, the nest-only warband takes its turn and hands on to b.
        const { outcome } = await play(game, endTurnBy("a"));
        expect(outcome.validMove).toBe(true);
        expect(game.currentTurn).toBe("b");
        expect(horde(game, owner).length).toBeGreaterThan(0);
    });

    it("spawns nothing from a destroyed nest, and nothing at all from a warband with none standing", async () => {
        const game = await mustered();
        const gs = game.specificGameState;
        const owner = warbandOwner(0);
        const [first, second] = nestsOf(game, owner);
        first.hp = 0;
        const half = hordeSpawn(spawnThemeOf(BROOD, 1, V13)!, spawnThreatOf(1, V13), countOf(game, owner), V13);
        await warbandBegins(game);
        // One nest standing: its 3 threat alone is what bought.
        expect(gs.threat?.[owner]).toBe(half.left);
        expect(now(game, second).hp).toBe(15);

        const none = await mustered();
        const bare = warbandOwner(0);
        nestsOf(none, bare).forEach(nest => { nest.hp = 0; });
        const stood = fightersOf(none).length;
        none.specificGameState.threat = { [bare]: 3 };
        await warbandBegins(none);
        expect(fightersOf(none).length).toBe(stood);
        expect(none.specificGameState.threat?.[bare]).toBe(3);
    });

    it("lands no wave: the next wave is undefined, the wave empty, and a round's log never says one arrives", async () => {
        const game = await atRound(4);
        expect(nextWaveOf(game.specificGameState)).toBeUndefined();
        expect(waveOf(game.specificGameState, warbandOwner(0), true)).toEqual([]);
        await playRound(game);
        expect(text(game).some(line => /arrives/.test(line))).toBe(false);
    });

    it("still lands version 12's waves, as rounds 4, 7, 10 and 13 begin", async () => {
        for (const round of [4, 7, 10, 13]) {
            const game = makeGame(TEAM, {}, { rulesVersion: 12, coop: { enemy: "swarm", mission: "holdOut" } });
            await musterAll(game);
            const gs = game.specificGameState;
            expect(nextWaveOf(gs)?.round, "the first wave").toBe(4);
            gs.roundsPlayed = round - 2;
            gs.rallyOwed = undefined;
            fightersOf(game).forEach(one => { if (isWarband(one.owner) && one.character !== "nest") one.hp = 0; });
            await play(game, endTurnBy("a"));
            await play(game, endTurnBy("b"));
            expect(gs.roundsPlayed, `round ${round}`).toBe(round - 1);
            expect(text(game).some(line => /arrives/.test(line)), `a wave lands as round ${round} begins`).toBe(true);
            expect(fightersOf(game).some(one => isWarband(one.owner) && isStanding(one) && one.character !== "nest")).toBe(true);
        }
    });
});

describe("the elites arrive on schedule (§5.1)", () => {
    /** Plays the round before `round`, so the round begins with its elites, and returns what each warband fields of `elite`. */
    async function arrivals(players: string[], round: number, elite: CharacterId, tweak: (game: RealmArenaTestGame) => void = () => {}) {
        const game = await atRound(round - 1, players);
        game.specificGameState.rallyOwed = undefined;
        tweak(game);
        await playRound(game, players);
        expect(game.specificGameState.roundsPlayed).toBe(round - 1);
        return players.map((_, k) => horde(game, warbandOwner(k)).filter(one => one.character === elite).length);
    }
    const kill = (game: RealmArenaTestGame, owner: string, count: number) => nestsOf(game, owner).slice(0, count).forEach(nest => { nest.hp = 0; });

    it("brings a Bile Lobber to every warband with a nest standing as round 5 begins, with one, two and three warbands", async () => {
        expect(await arrivals(["a"], 5, "bileLobber")).toEqual([1]);
        expect(await arrivals(TEAM, 5, "bileLobber")).toEqual([1, 1]);
        expect(await arrivals(["a", "b", "c"], 5, "bileLobber")).toEqual([1, 1, 1]);
    });

    it("brings none to a warband whose nests are all down, and none before round 5", async () => {
        expect(await arrivals(TEAM, 5, "bileLobber", game => kill(game, warbandOwner(0), 2))).toEqual([0, 1]);
        expect(await arrivals(TEAM, 4, "bileLobber")).toEqual([0, 0]);
    });

    it("brings a Carapace Brute for every two warbands with a nest standing, as round 9 begins, the most nests first", async () => {
        expect(await arrivals(["a"], 9, "carapaceBrute")).toEqual([1]);
        // Two warbands: one Brute, to the warband with most nests, ties to the lowest seat.
        expect(await arrivals(TEAM, 9, "carapaceBrute")).toEqual([1, 0]);
        expect(await arrivals(TEAM, 9, "carapaceBrute", game => kill(game, warbandOwner(0), 1))).toEqual([0, 1]);
        // Three warbands: two Brutes.
        expect(await arrivals(["a", "b", "c"], 9, "carapaceBrute")).toEqual([1, 1, 0]);
        // Seat 2 has the most nests (two to one), then seat 0 by the lowest seat.
        expect(await arrivals(["a", "b", "c"], 9, "carapaceBrute", game => { kill(game, warbandOwner(0), 1); kill(game, warbandOwner(1), 1); })).toEqual([1, 0, 1]);
    });

    it("brings one Brood Queen, as round 13 begins, to the warband with the most nests standing, ties to the lowest seat", async () => {
        expect(await arrivals(["a"], 13, "broodQueen")).toEqual([1]);
        expect(await arrivals(TEAM, 13, "broodQueen")).toEqual([1, 0]);
        expect(await arrivals(TEAM, 13, "broodQueen", game => kill(game, warbandOwner(0), 1))).toEqual([0, 1]);
        expect(await arrivals(["a", "b", "c"], 13, "broodQueen", game => kill(game, warbandOwner(0), 1))).toEqual([0, 1, 0]);
        expect(await arrivals(["a", "b", "c"], 13, "broodQueen", game => { kill(game, warbandOwner(0), 1); kill(game, warbandOwner(1), 1); })).toEqual([0, 0, 1]);
        // None with every nest down but one warband's, whose it then is.
        expect(await arrivals(TEAM, 13, "broodQueen", game => kill(game, warbandOwner(0), 2))).toEqual([0, 1]);
    });

    it("stands an elite next to a nest of its warband, at 0 AP", async () => {
        const game = await atRound(4);
        game.specificGameState.rallyOwed = undefined;
        await playRound(game);
        const lobber = horde(game, warbandOwner(0)).find(one => one.character === "bileLobber")!;
        const field = battlefieldById(game.specificGameState.map);
        expect(nestsOf(game, warbandOwner(0)).some(nest => distance(field, nest.square, lobber.square) <= 1)).toBe(true);
        expect(lobber.ap).toBe(0);
    });
});

describe("the rally is earned and spaced (§5.3)", () => {
    const BANKED = (game: RealmArenaTestGame) => game.specificGameState.ralliesBanked ?? 0;

    it("is earned as rounds 5, 9 and 13 begin, taken at once, and owed by every player", async () => {
        for (const round of [5, 9, 13]) {
            const game = await atRound(round - 1);
            const gs = game.specificGameState;
            downHorde(game);
            await play(game, endTurnBy("a"));
            await play(game, endTurnBy("b"));
            expect(gs.roundsPlayed).toBe(round - 1);
            expect(gs.rallyOwed, `round ${round}`).toEqual(["a", "b"]);
            expect(gs.lastRally).toBe(round);
            expect(BANKED(game)).toBe(0);
            expect(game.currentTurn).toBe("a");
            expect(text(game).some(line => /earns a rally/.test(line))).toBe(true);
            expect(text(game).some(line => /must each choose how to rally.*mend the Shrine/.test(line))).toBe(true);
        }
    });

    it("is earned in no other round without a warband breaking", async () => {
        const game = await mustered();
        for (let round = 1; round < 4; round++) await playRound(game);
        expect(game.specificGameState.roundsPlayed).toBe(3);
        expect(game.specificGameState.rallyOwed).toBeUndefined();
        expect(BANKED(game)).toBe(0);
        expect(game.specificGameState.lastRally).toBeUndefined();
    });

    it("is earned when a warband's last nest falls, banked, and not taken until a round begins", async () => {
        const game = await atRound(2);
        const gs = game.specificGameState;
        const [near, far] = nestsOf(game, warbandOwner(0));
        far.hp = 0;
        near.hp = 1;
        downHorde(game);
        const attacker = stoodBeside(game, near);
        gs.rallyOwed = undefined;
        expect((await strike(game, attacker, near)).outcome.validMove).toBe(true);
        expect(now(game, near).hp).toBe(0);
        expect(BANKED(game)).toBe(1);
        expect(gs.rallyOwed).toBeUndefined();
        expect(text(game).some(line => /last nest falls, and the team earns a rally/.test(line))).toBe(true);
        // The next round to begin takes it.
        await playRound(game);
        expect(gs.roundsPlayed).toBe(2);
        expect(BANKED(game)).toBe(0);
        expect(gs.lastRally).toBe(3);
        expect(gs.rallyOwed).toEqual(["a", "b"]);
    });

    it("earns nothing for a nest that isn't the warband's last", async () => {
        const game = await atRound(2);
        const [near] = nestsOf(game, warbandOwner(0));
        near.hp = 1;
        downHorde(game);
        const attacker = stoodBeside(game, near);
        await strike(game, attacker, near);
        expect(now(game, near).hp).toBe(0);
        expect(BANKED(game)).toBe(0);
    });

    it("is never taken in two rounds running: a warband broken in round 4 gives a rally in round 5, and the other in round 7", async () => {
        const game = await atRound(4);
        const gs = game.specificGameState;
        const [near, far] = nestsOf(game, warbandOwner(0));
        far.hp = 0;
        near.hp = 1;
        downHorde(game);
        const attacker = stoodBeside(game, near);
        await strike(game, attacker, near);
        expect(BANKED(game)).toBe(1);
        // Round 4 ends: round 5's scheduled rally is earned too, and one is taken.
        await playRound(game);
        expect(gs.roundsPlayed).toBe(4);
        expect(gs.rallyOwed).toEqual(["a", "b"]);
        expect([gs.lastRally, BANKED(game)]).toEqual([5, 1]);
        // Round 5 played, round 6 begins: one is banked and one was taken last round, so none now.
        await playRound(game);
        expect(gs.roundsPlayed).toBe(5);
        expect(gs.rallyOwed).toBeUndefined();
        expect([gs.lastRally, BANKED(game)]).toEqual([5, 1]);
        // Round 7 takes the banked one.
        await playRound(game);
        expect(gs.roundsPlayed).toBe(6);
        expect(gs.rallyOwed).toEqual(["a", "b"]);
        expect([gs.lastRally, BANKED(game)]).toEqual([7, 0]);
    });

    it("says in the response when the next rally comes: next round, or a later one", async () => {
        const game = await mustered();
        const gs = game.specificGameState;
        const rallyOf = async (viewer: string) => (await responseFor(game, viewer)).specificGameState.rally;
        // Round 1: the first is round 5's.
        expect(await rallyOf("a")).toEqual({ banked: 0, next: 5 });
        gs.roundsPlayed = 3;
        expect(await rallyOf("a")).toEqual({ banked: 0, next: 5 });
        // A rally banked in round 4 is taken as round 5 begins ("next round")...
        gs.ralliesBanked = 1;
        expect(await rallyOf("b")).toEqual({ banked: 1, next: 5 });
        expect(nextRallyOf(gs)).toBe(gs.roundsPlayed + 2);
        // ...but one taken as this round began puts it back a round.
        gs.roundsPlayed = 4;
        gs.lastRally = 5;
        expect(await rallyOf("a")).toEqual({ banked: 1, next: 7 });
        // Nothing banked in round 6: the scheduled round 9.
        gs.roundsPlayed = 5;
        gs.ralliesBanked = 0;
        expect(await rallyOf("a")).toEqual({ banked: 0, next: 9 });
        // And none to come once past the last scheduled, or beyond the cap.
        gs.roundsPlayed = 13;
        expect(await rallyOf("a")).toEqual({ banked: 0 });
        gs.roundsPlayed = 14;
        gs.ralliesBanked = 1;
        gs.lastRally = undefined;
        expect(await rallyOf("a")).toEqual({ banked: 1 });
    });

    it("sends no rally field outside a Hold Out whose nests produce the enemy", async () => {
        const centre = makeGame(TEAM, {}, { rulesVersion: 13, coop: { enemy: "realm" } });
        await musterAll(centre);
        expect((await responseFor(centre, "a")).specificGameState).not.toHaveProperty("rally");
        const old = makeGame(TEAM, {}, { rulesVersion: 12, coop: { enemy: "swarm", mission: "holdOut" } });
        await musterAll(old);
        expect((await responseFor(old, "a")).specificGameState).not.toHaveProperty("rally");
    });
});

describe("Mend, taken at a rally (§5.3)", () => {
    it("heals the Shrine by half its max HP, for each player who chooses it", async () => {
        const game = await atRound(4);
        const gs = game.specificGameState;
        shrineIn(game).hp = 5;
        downHorde(game);
        // Round 4's end takes the rally as round 5 begins (a Mend for each of a and b: 40 max, so 20 apiece).
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        expect(gs.rallyOwed).toEqual(["a", "b"]);
        expect((await play(game, actBy("a", { kind: "rally", choice: "mend" }))).outcome.validMove).toBe(true);
        expect(shrineIn(game).hp).toBe(25);
        // b's choice comes as b's turn does, and heals to the cap, not past it.
        expect((await play(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect((await play(game, actBy("b", { kind: "rally", choice: "mend" }))).outcome.validMove).toBe(true);
        expect(shrineIn(game).hp).toBe(40);
    });
});

describe("the ending (§5.4)", () => {
    it("is lost when the Shrine falls, naming the round", async () => {
        const game = await atRound(6);
        game.specificGameState.rallyOwed = undefined;
        shrineIn(game).hp = 0;
        const { outcome } = await play(game, endTurnBy("a"));
        expect(outcome.validMove).toBe(true);
        expect(game.complete).toBe(true);
        expect(text(game).join("\n")).toMatch(/The team loses the battle/);
        expect(game).toMatchObject({ endReason: "teamloss", endDetail: "the Shrine fell in round 6" });
    });

    it("is lost when nobody of the team is left standing", async () => {
        const game = await atRound(3);
        fightersOf(game).forEach(one => { if (!isWarband(one.owner) && one.character !== "shrine") one.hp = 0; });
        await play(game, endTurnBy("a"));
        expect(game.complete).toBe(true);
        expect(game.endDetail).toMatch(/overrun in round 4/);
        expect(text(game).join("\n")).toMatch(/The team loses the battle/);
    });

    it("is won the moment every nest is down: the Brood scatters, and the bonus is shared evenly", async () => {
        const players = ["a", "b", "c"];
        const game = await atRound(7, players);
        const gs = game.specificGameState;
        gs.rallyOwed = undefined;
        const nests = nestsOf(game);
        const last = nests[0];
        nests.slice(1).forEach(nest => { nest.hp = 0; });
        last.hp = 1;
        const before = { ...gs.scores };
        const attacker = stoodBeside(game, last);
        const alive = fightersOf(game).filter(one => isWarband(one.owner) && isCombatant(one, V13) && isStanding(one)).length;
        expect(alive).toBeGreaterThan(0);
        expect((await strike(game, attacker, last)).outcome.validMove).toBe(true);
        expect(game.complete).toBe(true);
        // Everything of the Brood that still stood has left the board.
        expect(fightersOf(game).filter(one => isWarband(one.owner) && isCombatant(one, V13))).toEqual([]);
        // 8 rounds were left of 15: 8 x 60 points, 160 to each of three.
        const bonus = (RULES.ROUND_BONUS! * 8) / 3;
        expect(bonus).toBe(160);
        const knockout = knockoutPoints("nest", V13);
        expect(gs.scores.a - (before.a ?? 0)).toBe(bonus + knockout);
        expect(gs.scores.b - (before.b ?? 0)).toBe(bonus);
        expect(gs.scores.c - (before.c ?? 0)).toBe(bonus);
        const log = text(game).join("\n");
        expect(log).toMatch(/The team wins the battle/);
        expect(log).toMatch(/The last nest falls: the Brood breaks/);
        expect(log).toMatch(/still standing scatter/);
        expect(log).toMatch(/The team scores 480 points for breaking it with 8 rounds to spare/);
        expect(game.endDetail).toMatch(/broke the Brood in round 7/);
    });

    it("is won at the cap, with the Shrine standing, at every team size including solo", async () => {
        for (const players of [["a"], TEAM, ["a", "b", "c"]]) {
            const game = await atRound(15, players);
            game.specificGameState.rallyOwed = undefined;
            downHorde(game);
            for (const player of players) await play(game, endTurnBy(player));
            expect(game.complete, `${players.length} players`).toBe(true);
            expect(game.specificGameState.roundsPlayed).toBe(15);
            expect(text(game).join("\n")).toMatch(/The team wins the battle/);
            expect(game.endDetail).toMatch(/held the Shrine for all 15 rounds/);
            expect(shrineIn(game).hp).toBeGreaterThan(0);
        }
    });

    it("goes on through round 14 and any round before the cap", async () => {
        const game = await atRound(14);
        game.specificGameState.rallyOwed = undefined;
        await playRound(game);
        expect(game.complete).toBe(false);
        expect(game.specificGameState.roundsPlayed).toBe(14);
    });

    it("scores nothing for downing the Shrine, and burns it as a round begins", async () => {
        const game = await mustered();
        const gs = game.specificGameState;
        const shrine = shrineIn(game);
        // A blast of the team's own that downs it: it's a structure, so it takes friendly fire, and no player scores for it.
        const mage = { ...newFighter(99, "a", "mage", beside(game, shrine.square), null, undefined, undefined, false, gs), ap: 4 };
        const field = battlefieldById(gs.map);
        const battle: BattleState = { field, fighters: [mage, { ...shrine, hp: 1 }], sides: { a: "team", shrine: "team" }, ...V13 };
        const blast = act(battle, "a", { kind: "fireball", fighter: 99, at: shrine.square }, fixedRolls([1]));
        expect(blast.fighters.find(one => one.id === shrine.id)!.hp).toBe(0);
        expect(blast.events.filter(event => event.kind === "scored")).toEqual([]);
        // Burning ticks as the round begins.
        gs.fighters = gs.fighters.map(one => one.id === shrine.id ? afflicted(one, "burning", 0, V13)!.fighter : one);
        const hp = shrineIn(game).hp;
        await playRound(game);
        expect(shrineIn(game).hp).toBeLessThan(hp);
    });
});

describe("a whole Hold Out replays identically from its command history (§5)", () => {
    it.each([false, true])("lands on exactly the live state without rolling anything again (fog of war: %s)", async fog => {
        seedRolls(7);
        const game = await playScriptedBattle({ rulesVersion: 13, fog, coop: { enemy: "realm", mission: "holdOut" } });
        const history = game.gameState.commandHistory;
        expect(recordedWarbandActions(game).length).toBeGreaterThan(0);
        expect(game.specificGameState.roundsPlayed).toBeGreaterThan(0);
        const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("replay consumed randomness"); });
        try {
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
            const last = timeline.snapshots[timeline.currentIndex];
            expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", history.at(-1)?.id ?? null, true));
        } finally {
            random.mockRestore();
        }
    }, 120_000);
});

describe("what the server sends about a Hold Out's nests (§5.2, §5.3)", () => {
    /** A fogged battle one round in: the nests have spawned and every viewer is far from them. */
    async function fogged() {
        const game = await mustered(TEAM, { fog: true });
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        return game;
    }

    it("never carries the warbands' banked threat or the rally's source fields, only `rally`", async () => {
        const game = await fogged();
        expect(game.specificGameState.threat).toBeDefined();
        for (const viewer of ["a", "b", null]) {
            const wire = (await responseFor(game, viewer)).specificGameState as unknown as Record<string, unknown>;
            for (const key of ["threat", "ralliesBanked", "lastRally", "rallyOwed", "nestsSeenDestroyed", "sightings"]) expect(wire, `${viewer}: ${key}`).not.toHaveProperty(key);
            expect(JSON.stringify(wire), String(viewer)).not.toContain("ralliesBanked");
            if (viewer !== null) expect(wire.rally).toEqual({ banked: 0, next: 5 });
        }
    });

    it("carries the Shrine to every viewer, in fog too, and no Brood fighter the viewer can't see", async () => {
        const game = await fogged();
        const shrine = shrineIn(game);
        for (const viewer of ["a", "b", null]) {
            const fighters = (await responseFor(game, viewer)).specificGameState.fighters;
            expect(fighters.some(one => one.id === shrine.id), `${viewer} sees the Shrine`).toBe(true);
            const view = viewOf({ field: battlefieldById(game.specificGameState.map), fighters: fightersOf(game), ...V13, fog: true, sides: { a: "team", b: "team", shrine: "team", "ai:0": "enemy", "ai:1": "enemy" } } as BattleState, viewer);
            // What the wire carries of the Brood is exactly what the viewer's own sight shows.
            expect(fighters.filter(one => isWarband(one.owner)).map(one => one.id).sort(), String(viewer)).toEqual(view.fighters.filter(one => isWarband(one.owner)).map(one => one.id).sort());
        }
        const seen = (await responseFor(game, "a")).specificGameState.fighters.filter(one => isWarband(one.owner));
        const everything = fightersOf(game).filter(one => isWarband(one.owner));
        expect(seen.length).toBeLessThan(everything.length);
    });
});

describe("the Brood's swarm step goes for the Shrine (§4.5, §5.2)", () => {
    const AI = "ai:0";
    const field = buildBattlefield({ name: "Keep", rows: Array(9).fill(".".repeat(30)), deployments: [], objectives: {} });
    const piece = (id: number, owner: string, character: CharacterId, square: Square): Fighter =>
        ({ ...newFighter(id, owner, character, square, null, undefined, undefined, false, V13), ap: ACTION_POINTS });
    const state = (fighters: Fighter[]): BattleState => ({ field, fighters, sides: { a: "team", [AI]: "enemy", shrine: "team" }, ...V13 });
    const stepOf = (battle: BattleState): Action[] => {
        const memo = swarmMemo();
        const actions: Action[] = [];
        let now = battle;
        for (let guard = 0; guard < 50; guard++) {
            const action = swarmAction(viewOf(now, AI), AI, undefined, memo);
            if (!action) break;
            expect(check(now, AI, action)).not.toHaveProperty("refused");
            actions.push(action);
            now = { ...now, fighters: act(now, AI, action, fixedRolls(Array(10).fill(1))).fighters };
        }
        return actions;
    };

    it("walks toward the Shrine when it sees no team character", () => {
        const shrineAt = at(field, 2, 4);
        const start = at(field, 28, 4);
        const battle = state([piece(0, AI, "broodSkitterling", start), piece(1, "shrine", "shrine", shrineAt)]);
        const actions = stepOf(battle);
        expect(actions.length).toBeGreaterThan(0);
        expect(actions[0].kind).toBe("move");
        const end = (actions[0] as { path: Square[] }).path.at(-1)!;
        expect(distance(field, end, shrineAt)).toBeLessThan(distance(field, start, shrineAt));
    });

    it("strikes the Shrine next to it when no team character is in reach", () => {
        const battle = state([piece(0, AI, "broodSkitterling", at(field, 5, 4)), piece(1, "shrine", "shrine", at(field, 4, 4))]);
        const actions = stepOf(battle);
        expect(actions).toContainEqual({ kind: "attack", fighter: 0, target: 1 });
    });

    it("prefers a team character in reach to the Shrine beside it", () => {
        const battle = state([piece(0, AI, "broodSkitterling", at(field, 5, 4)), piece(1, "shrine", "shrine", at(field, 4, 4)), piece(2, "a", "knight", at(field, 6, 4))]);
        const attack = stepOf(battle).find(action => action.kind === "attack");
        expect(attack).toMatchObject({ fighter: 0, target: 2 });
    });
});

describe("rally options (§5.3)", () => {
    it("offers Mend only where there is a Shrine, and only while it's hurt", async () => {
        const game = await mustered();
        const battle = { field: battlefieldById(game.specificGameState.map), fighters: fightersOf(game), sides: undefined, ...V13 } as BattleState;
        const mend = () => rallyOptionsOf(battle, TEAM, "a").find(option => option.choice === "mend");
        expect(mend()).toMatchObject({ available: false });
        shrineIn(game).hp = 3;
        expect(mend()).toEqual({ choice: "mend", available: true });
        const without = { ...battle, fighters: battle.fighters.filter(one => one.character !== "shrine") };
        expect(rallyOptionsOf(without, TEAM, "a").map(option => option.choice)).not.toContain("mend");
    });
});
