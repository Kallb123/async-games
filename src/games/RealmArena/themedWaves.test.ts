import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { BUDGETS, REALM, type CharacterId } from "./characters";
import { battlefieldById } from "./maps";
import { computeRealmArenaResultStats, formatRealmArenaCharts, formatRealmArenaResultStats, gameStateToModel } from "./RealmArenaModels";
import { recordBattle } from "./recordBattle";
import { nextWaveOf, warbandBudgetOf, waveBudgetOf, waveOf } from "./RealmArenaLogic";
import { isCombatant, isWarband, newFighter, nextFighterId, wavePurchase, wavesLanded, waveThemeOf } from "./rules";
import { ruleValuesOf, rulesetFor } from "./rulesets";
import { addFighter, endTurnBy, makeGame, musterAll, play, playScriptedBattle, seedRolls, warbandsOf, type RealmArenaTestGame } from "./testFixtures";
import type { GameResultBarChart } from "@/utils/apiModels/GameDataApi";

// docs/games/realm-arena.md §39.6: waves that differ, bought with points. The
// Swarm's themes are rules version 12's, so every battle here is built at it.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

afterEach(() => vi.restoreAllMocks());

const V12 = rulesetFor(12);
const SWARM = V12.FACTIONS.swarm;
const CONTEXT = { rulesVersion: 12 };
/** The rounds the four waves land in, for every team size (§30.3). */
const WAVE_ROUNDS = [4, 7, 10, 13];
const points = (squad: readonly CharacterId[]) => squad.reduce((sum, id) => sum + V12.CHARACTERS[id].points, 0);

describe("what a wave buys (§39.6)", () => {
    it("names the four themes by the waves landed, and clamps outside them", () => {
        expect(WAVE_ROUNDS.map(round => waveThemeOf(SWARM, round)?.name)).toEqual(["The Rush", "The Bile", "The Brutes", "The Queen"]);
        expect([1, 4, 6].map(round => waveThemeOf(SWARM, round)?.name)).toEqual(["The Rush", "The Rush", "The Rush"]);
        expect(waveThemeOf(SWARM, 16)?.name).toBe("The Queen");
        expect(waveThemeOf(V12.FACTIONS.realm, 4)).toBeUndefined();
        expect(wavePurchase(V12.FACTIONS.realm, 100, 4, CONTEXT)).toEqual([]);
    });

    it("buys the elite first, then the list round and round, skipping what it can't pay for", () => {
        // 40 + 40, then the Rush's two Skitterlings; the Ravager no longer fits.
        expect(wavePurchase(SWARM, 100, 4, CONTEXT)).toEqual(["skitterling", "skitterling", "ravager", "skitterling", "skitterling", "ravager", "skitterling", "skitterling"]);
        // The Lobber's 40, a round of the list (40), and a second round cut short: Spitter, Bloater, then only Bloaters fit.
        expect(wavePurchase(SWARM, 115, 7, CONTEXT)).toEqual(["bileLobber", "spitter", "bloater", "spitter", "spitter", "bloater", "bloater"]);
        expect(wavePurchase(SWARM, 130, 10, CONTEXT)).toEqual(["carapaceBrute", "ravager", "skitterling", "bloater", "ravager", "skitterling", "bloater"]);
        expect(wavePurchase(SWARM, 145, 13, CONTEXT)).toEqual(["broodQueen", "ravager", "spitter", "skitterling", "bloater", "ravager", "skitterling"]);
    });

    it("drops an elite the budget can't cover, and buys the rest", () => {
        expect(wavePurchase(SWARM, 35, 7, CONTEXT)).toEqual(["spitter", "bloater", "bloater"]);
        expect(wavePurchase(SWARM, 59, 13, CONTEXT)).not.toContain("broodQueen");
        expect(wavePurchase(SWARM, 60, 13, CONTEXT)[0]).toBe("broodQueen");
        expect(wavePurchase(SWARM, 5, 4, CONTEXT)).toEqual([]);
    });

    it("never spends more than the budget, buys until nothing on the list is affordable, and stops at the cap, for every theme at every budget on the ladder", () => {
        const cap = ruleValuesOf(CONTEXT).WAVE_CAP!;
        expect(cap).toBe(12);
        for (const round of WAVE_ROUNDS) {
            const theme = waveThemeOf(SWARM, round)!;
            for (const base of BUDGETS) {
                const budget = base + 15 * wavesLanded(round);
                const bought = wavePurchase(SWARM, budget, round, CONTEXT);
                const label = `${theme.name} at ${budget}`;
                expect(points(bought), label).toBeLessThanOrEqual(budget);
                expect(bought.length, label).toBeLessThanOrEqual(cap);
                expect(bought.length, label).toBeGreaterThan(0);
                // The elite leads when the budget covers it, and is bought once.
                const elite = theme.elite;
                if (elite) {
                    expect(bought[0] === elite, label).toBe(V12.CHARACTERS[elite].points <= budget);
                    expect(bought.filter(id => id === elite).length, label).toBeLessThanOrEqual(1);
                }
                // Everything else is on the list.
                for (const id of bought.filter(id => id !== elite)) expect(theme.buys, label).toContain(id);
                // Nothing left to spend on anything the list holds, unless the cap stopped it.
                if (bought.length < cap) for (const id of theme.buys) expect(budget - points(bought), label).toBeLessThan(V12.CHARACTERS[id].points);
                // No draw: asking again gives the same.
                expect(wavePurchase(SWARM, budget, round, CONTEXT), label).toEqual(bought);
            }
        }
    });

    it("stops at 12 characters however many points are left", () => {
        const bought = wavePurchase(SWARM, 400, 4, CONTEXT);
        expect(bought).toHaveLength(12);
        expect(bought.slice(0, 3)).toEqual(["skitterling", "skitterling", "ravager"]);
        expect(wavePurchase(SWARM, 400, 13, CONTEXT)).toHaveLength(12);
    });
});

describe("a themed wave in a battle (§39.6)", () => {
    const holdOut = (settings: Parameters<typeof makeGame>[2] = {}) => makeGame(["a", "b"], {}, { rulesVersion: 12, coop: { enemy: "swarm", mission: "holdOut" }, ...settings });
    const standingOf = (game: RealmArenaTestGame, owner: string) => game.specificGameState.fighters.filter(fighter => fighter.owner === owner && isCombatant(fighter, CONTEXT));
    const text = (game: RealmArenaTestGame) => game.gameState.history.map(entry => entry.text);

    /** Clears the enemy off the field, so the warbands' turns can't change who stands, then ends the round whose wave lands next. */
    async function landWave(game: RealmArenaTestGame, round: number): Promise<void> {
        const gs = game.specificGameState;
        gs.roundsPlayed = round - 2;
        // The rally the last wave left owed (§39.4) isn't this test's business.
        gs.rallyOwed = undefined;
        gs.fighters.forEach(fighter => { if (isWarband(fighter.owner)) fighter.hp = 0; });
        const a = endTurnBy("a"), b = endTurnBy("b");
        await play(game, a);
        await play(game, b);
        expect(gs.roundsPlayed).toBe(round - 1);
    }

    it("has a wave's budget grow by 15 for every wave landed, the warbands' own muster counting as the first", async () => {
        const game = holdOut();
        const gs = game.specificGameState;
        const base = warbandBudgetOf(gs);
        expect(WAVE_ROUNDS.map(round => waveBudgetOf(gs, round))).toEqual([base + 15, base + 30, base + 45, base + 60]);
        // A catalogue without the number grows nothing.
        const old = makeGame(["a", "b"], {}, { rulesVersion: 11, coop: { enemy: "swarm", mission: "holdOut" } });
        expect(waveBudgetOf(old.specificGameState, 13)).toBe(warbandBudgetOf(old.specificGameState));
    });

    it("lands each wave as its theme's purchase, told by name, with the first muster still the ready-made squad", async () => {
        const game = holdOut();
        await musterAll(game);
        const gs = game.specificGameState;
        for (const owner of warbandsOf(game)) expect(standingOf(game, owner).map(one => one.character).sort()).toEqual([...SWARM.readyMade[warbandBudgetOf(gs)]].sort());
        for (const round of WAVE_ROUNDS) {
            await landWave(game, round);
            const expected = [...wavePurchase(SWARM, waveBudgetOf(gs, round), round, CONTEXT)].sort();
            for (const owner of warbandsOf(game)) expect(standingOf(game, owner).map(one => one.character).sort(), `round ${round}`).toEqual(expected);
            expect(text(game), `round ${round}`).toContain(`${waveThemeOf(SWARM, round)!.name} arrives`);
        }
        expect(text(game).some(line => line.startsWith("A fresh wave"))).toBe(false);
    });

    it("refills: it brings what its purchase lists that the warband doesn't have standing, and not past the cap", async () => {
        const game = holdOut();
        await musterAll(game);
        const gs = game.specificGameState;
        const [owner] = warbandsOf(game);
        gs.roundsPlayed = 2;
        const purchase = wavePurchase(SWARM, waveBudgetOf(gs, 4), 4, CONTEXT);
        const stands = standingOf(game, owner).map(one => one.character);
        const missing = [...purchase];
        for (const character of stands) { const at = missing.indexOf(character); if (at >= 0) missing.splice(at, 1); }
        expect(waveOf(gs, owner, true, 4).map(one => one.character).sort()).toEqual(missing.sort());

        // A warband already standing at 11 is brought to 12 and no further.
        const field = battlefieldById(gs.map);
        const free = field.tiles.map((_, square) => square).filter(square => field.tiles[square].terrain.standable && !gs.fighters.some(one => one.square === square));
        while (standingOf(game, owner).length < 11) addFighter(game, owner, "bloater", free.pop()!);
        expect(waveOf(gs, owner, true, 13).length).toBeLessThanOrEqual(1);
        addFighter(game, owner, "bloater", free.pop()!);
        expect(waveOf(gs, owner, true, 13)).toEqual([]);
    });

    it("lands waveStrength's wave against the Renegades, as it has always", async () => {
        const game = holdOut({ coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        const gs = game.specificGameState;
        const squad = REALM.readyMade[warbandBudgetOf(gs)];
        await landWave(game, 4);
        for (const owner of warbandsOf(game)) expect(standingOf(game, owner).map(one => one.character).sort()).toEqual([...squad, squad[0]].sort());
        expect(text(game)).toContain("A fresh wave of the Renegades arrives");
        expect(nextWaveOf(gs)).not.toHaveProperty("name");
    });

    it("tells the next wave by name and count, and in fog the most it could bring", async () => {
        const game = holdOut();
        await musterAll(game);
        const gs = game.specificGameState;
        const missing = (round: number) => warbandsOf(game).reduce((sum, owner) => sum + waveOf(gs, owner, true, round).length, 0);
        expect(nextWaveOf(gs)).toEqual({ round: 4, name: "The Rush", arriving: missing(4) });
        expect(gameStateToModel(gs, "a", null).nextWave).toEqual({ round: 4, name: "The Rush", arriving: missing(4) });
        gs.roundsPlayed = 5;
        expect(nextWaveOf(gs)).toMatchObject({ round: 7, name: "The Bile" });
        gs.roundsPlayed = 12;
        expect(nextWaveOf(gs)).toBeUndefined();

        const fogged = holdOut({ fog: true });
        await musterAll(fogged);
        const ceiling = 2 * wavePurchase(SWARM, waveBudgetOf(fogged.specificGameState, 4), 4, CONTEXT).length;
        expect(nextWaveOf(fogged.specificGameState)).toEqual({ round: 4, name: "The Rush", arriving: ceiling, upTo: true });
        for (const viewer of ["a", "b", null]) expect(gameStateToModel(fogged.specificGameState, viewer, null).nextWave).toEqual({ round: 4, name: "The Rush", arriving: ceiling, upTo: true });
    });

    it("tells neither the name nor the count while a random enemy is unseen", async () => {
        const game = holdOut({ fog: true, coop: { enemy: "swarm", random: true, mission: "holdOut" } });
        await musterAll(game);
        const gs = game.specificGameState;
        expect(gs.coop?.enemySeen).not.toBe(true);
        expect(nextWaveOf(gs)).toEqual({ round: 4 });
        for (const viewer of ["a", "b", null]) expect(gameStateToModel(gs, viewer, null).nextWave).toEqual({ round: 4 });
    });

    it("keeps the log line generic as a wave lands while a random enemy is unseen", async () => {
        const game = holdOut({ fog: true, coop: { enemy: "swarm", random: true, mission: "holdOut" } });
        await musterAll(game);
        expect(game.specificGameState.coop?.enemySeen).not.toBe(true);
        await landWave(game, 4);
        expect(text(game)).toContain("A fresh wave of the enemy arrives");
        expect(text(game).some(line => /The (Rush|Bile|Brutes|Queen)/.test(line))).toBe(false);
    });

    it("is replayed to the same battle, and its result names every wave", async () => {
        seedRolls(3);
        const game = await playScriptedBattle({ rulesVersion: 12, coop: { enemy: "swarm", mission: "holdOut" } });
        const named = text(game).filter(line => /^The (Rush|Bile|Brutes|Queen) arrives$/.test(line));
        expect(named.length).toBeGreaterThan(0);

        const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("replay consumed randomness"); });
        try {
            const history = game.gameState.commandHistory;
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
            const last = timeline.snapshots[timeline.currentIndex];
            expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", history.at(-1)?.id ?? null, true));
        } finally {
            random.mockRestore();
        }

        const record = await recordBattle(game);
        const waves = record!.waves!;
        expect(waves[0].name).toBeUndefined();
        expect(waves.slice(1).map(wave => wave.name)).toEqual(["The Rush", "The Bile", "The Brutes", "The Queen"].slice(0, waves.length - 1));
        const stats = computeRealmArenaResultStats(game, record);
        const [group] = formatRealmArenaResultStats(stats, new Map());
        expect(group.lines.slice(-waves.length)).toEqual(waves.map((wave, index) => `Wave ${index + 1}${wave.name ? ` · ${wave.name}` : ""}, round ${wave.round + 1}: ${wave.arrived} arrived, ${[...wave.downed.values()].reduce((a, b) => a + b, 0)} downed`));
        const byWave = formatRealmArenaCharts(stats).find(chart => chart.title === "Enemies downed by wave") as GameResultBarChart;
        expect(byWave.bars.map(bar => bar.label)).toEqual(waves.map((wave, index) => `Wave ${index + 1}${wave.name ? ` · ${wave.name}` : ""}`));
    }, 60_000);
});
