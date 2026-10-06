import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { buildAllEvents, buildEventFeed } from "@/utils/games/recap";
import { stripRecordedRandomness } from "@/utils/apiModels/gameCommand";
import { CHARACTERS, FACTION_IDS, FACTIONS, musterBudget, REALM, warbandBudget, type BattleSize, type Difficulty } from "./characters";
import { battlefieldById, mapFor } from "./maps";
import {
    computeRealmArenaResultStats, coopInviteOf, formatRealmArenaCharts, formatRealmArenaResultStats, gameStateToModel, RealmArenaInvitationModel, stepOutcomeToModel, type IRealmArenaGameData, type RealmArenaSettings,
} from "./RealmArenaModels";
import { recordBattle } from "./recordBattle";
import { nextWaveOf, RealmArenaGameType, waveOf, waveStrength, type IRealmArenaOutcome, type RealmArenaEndTurn } from "./RealmArenaLogic";
import {
    battleRounds, ENEMY_SIDE, isStanding, isWarband, lastWaveRound, nextWaveRound, readyMadeMuster, squadSight, standings, TEAM_SIDE, warbandOwner, waveArrives, wavesLanded, type BattleEvent,
} from "./rules";
import type { GameResultBarChart, GameResultChart, GameResultTable } from "@/utils/apiModels/GameDataApi";
import {
    battleOf, endTurnBy, makeGame, muster, musterAll, play, playScriptedBattle, playScriptedTurn, readyMadePicks, type RealmArenaTestGame,
} from "./testFixtures";

// docs/games/realm-arena.md §29, PR 4a: the enemy's turn. Co-op from the setup
// to the state, the warbands mustered, a warband's turn inside each player's
// End turn, recorded and replayed — and the whole-battle tests of §29.11: it
// never breaks, it plays well, and replay holds. PR 4b: the end of it — the
// team's ending, the enemy named in the log, the recap's rows for its turn,
// and the battle record by side. A random enemy kept hidden until it's seen
// is hiddenHands.test.ts's.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));

// The planner, as the turn loop calls it: the real one unless a test breaks
// it, and counted, so a replay can be shown never to ask it.
const planner = vi.hoisted(() => ({ broken: false, calls: 0 }));
vi.mock("./ai", async importOriginal => {
    const real = await importOriginal<typeof import("./ai")>();
    return {
        ...real,
        nextAction: (...args: Parameters<typeof real.nextAction>) => {
            planner.calls++;
            if (planner.broken) throw new Error("the planner ran");
            return real.nextAction(...args);
        },
    };
});

afterEach(() => {
    planner.broken = false;
    planner.calls = 0;
    vi.restoreAllMocks();
});

const TEAMS = [["a", "b"], ["a", "b", "c"]];

/** Every roll from here on drawn from a seed, so a battle plays the same each run (mulberry32). */
function seedRolls(seed: number): void {
    let state = seed >>> 0;
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        const values = array as unknown as Uint32Array;
        for (let i = 0; i < values.length; i++) {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            values[i] = (t ^ (t >>> 14)) >>> 0;
        }
        return array;
    });
}

/** The warbands of a co-op battle, by owner. */
const warbandsOf = (game: RealmArenaTestGame) => game.gameState.turnOrder.map((_, k) => warbandOwner(k));

/** Whether the enemy won: the sides ranked as §29.5 ranks them, with the warbands' seats last, so a battle level all the way goes to them. */
function enemyWon(game: RealmArenaTestGame): boolean {
    const ranked = standings(battleOf(game), [...game.gameState.turnOrder, ...warbandsOf(game)], game.specificGameState.scores);
    return isWarband(ranked[0]);
}

/**
 * A co-op battle fought to its end, the team played by the fixtures' script,
 * timing each player's turn — the warband's turn that follows is nearly all
 * of it.
 */
async function coopBattle(players: string[], settings: RealmArenaSettings): Promise<{ game: RealmArenaTestGame; times: number[] }> {
    const game = makeGame(players, {}, settings);
    await musterAll(game);
    const times: number[] = [];
    for (let turn = 0; !game.complete; turn++) {
        if (turn > 100) throw new Error("the battle outlasted its turn limit");
        const start = performance.now();
        await playScriptedTurn(game);
        times.push(performance.now() - start);
    }
    return { game, times };
}

describe("co-op's setting (§29.8)", () => {
    it("is an enemy that is a faction or Random, and nothing else a request could send", () => {
        expect(coopInviteOf({ enemy: "realm" })).toEqual({ enemy: "realm" });
        expect(coopInviteOf({ enemy: "random", extra: 1 })).toEqual({ enemy: "random" });
        for (const junk of [undefined, null, true, "realm", {}, { enemy: "orcs" }, { enemy: "constructor" }, { enemy: ["realm"] }]) {
            expect(coopInviteOf(junk)).toBeUndefined();
        }
    });

    it("accepts Hold Out and keeps Hold the Centre absent for old battles", () => {
        expect(coopInviteOf({ enemy: "realm", mission: "holdOut", extra: 1 })).toEqual({ enemy: "realm", mission: "holdOut" });
        expect(coopInviteOf({ enemy: "realm", mission: "siege" })).toBeUndefined();
        expect(coopInviteOf({ enemy: "realm" })).toEqual({ enemy: "realm" });
    });

    it("takes the Sacked Fort in Hold Out alone, and no other battlefield (§30.9)", () => {
        expect(coopInviteOf({ enemy: "realm", mission: "holdOut", map: "sackedFort" })).toEqual({ enemy: "realm", mission: "holdOut", map: "sackedFort" });
        expect(coopInviteOf({ enemy: "realm", map: "sackedFort" })).toBeUndefined();
        for (const junk of ["twinGateFort", "ruinedFort", "constructor", "", 1, ["sackedFort"]]) {
            expect(coopInviteOf({ enemy: "realm", mission: "holdOut", map: junk }), JSON.stringify(junk)).toBeUndefined();
        }
    });

    it("is kept on the invitation only as one, whatever a lobby's settings carried", () => {
        expect(new RealmArenaInvitationModel({ coop: { enemy: "realm", nextWarband: 9 } }).toObject().coop).toEqual({ enemy: "realm" });
        expect(new RealmArenaInvitationModel({ coop: { enemy: "orcs" } }).toObject().coop).toBeUndefined();
    });
});

describe("Hold Out (§30.3)", () => {
    it("refills a warband to its ready-made strength before any wave has landed, using fresh ids and free deployment squares", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        const owner = warbandOwner(0);
        const original = game.specificGameState.fighters.filter(fighter => fighter.owner === owner);
        original[0].hp = 0;
        const fresh = waveOf(game.specificGameState, owner, true);
        expect(fresh).toHaveLength(1);
        expect(fresh[0].character).toBe(original[0].character);
        expect(fresh[0].id).toBeGreaterThan(Math.max(...game.specificGameState.fighters.map(fighter => fighter.id)));
        const field = battlefieldById(game.specificGameState.map);
        expect(fresh[0].square).toBe(readyMadeMuster(field, 2, REALM.readyMade[80])[0].square);

        game.specificGameState.fighters.push(...field.deployments[2].map((square, index) => ({
            ...original[1], id: 10_000 + index, owner: "a", square,
        })));
        expect(waveOf(game.specificGameState, owner, true)).toHaveLength(0);
    });

    it("continues after the enemy is wiped out, lands round four's wave, and wins by surviving the last round", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        game.specificGameState.fighters.forEach(fighter => { if (isWarband(fighter.owner)) fighter.hp = 0; });
        game.specificGameState.roundsPlayed = 2;
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        expect(game.complete).toBe(false);
        expect(game.specificGameState.roundsPlayed).toBe(3);
        expect(game.specificGameState.fighters.some(fighter => isWarband(fighter.owner) && fighter.hp > 0)).toBe(true);
        expect(game.gameState.history.some(entry => entry.text.includes("fresh wave"))).toBe(true);

        game.specificGameState.roundsPlayed = battleRounds(2);
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(true);
        expect(game).toMatchObject({ endReason: "teamwin", endDetail: "held out for all 15 rounds" });
    });

    it("comes every third round from round four, and not after the last", () => {
        const rounds = (length: number) => Array.from({ length }, (_, k) => k + 1).filter(round => waveArrives(round, length));
        expect(rounds(15)).toEqual([4, 7, 10, 13]);
        expect(rounds(13)).toEqual([4, 7, 10, 13]);
        expect([lastWaveRound(15), lastWaveRound(13), lastWaveRound(12)]).toEqual([13, 13, 10]);
        expect([1, 3, 4, 12, 13, 15].map(round => nextWaveRound(round, 15))).toEqual([4, 4, 7, 13, undefined, undefined]);
    });

    it("lands no wave once the last round has been played", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        game.specificGameState.fighters.find(fighter => isWarband(fighter.owner))!.hp = 0;
        game.specificGameState.roundsPlayed = battleRounds(2) - 1;
        const fighters = game.specificGameState.fighters.length;
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        expect(game).toMatchObject({ complete: true, endReason: "teamwin", endDetail: "held out for all 15 rounds" });
        expect(game.specificGameState.fighters).toHaveLength(fighters);
        expect(game.gameState.history.some(entry => entry.text.includes("fresh wave"))).toBe(false);
    });

    it("is told with the enemy named once, even when no warband finds room", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        const gs = game.specificGameState;
        const field = battlefieldById(gs.map);
        const template = gs.fighters.find(fighter => fighter.owner === "a")!;
        gs.fighters.forEach(fighter => { if (isWarband(fighter.owner)) fighter.hp = 0; });
        gs.fighters.push(...warbandsOf(game).flatMap((_, k) => field.deployments[2 + k]).map((square, index) => ({
            ...template, id: 10_000 + index, square,
        })));
        gs.roundsPlayed = 2;
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        expect(game.complete).toBe(false);
        expect(gs.fighters.some(fighter => isWarband(fighter.owner) && fighter.hp > 0)).toBe(false);
        expect(game.gameState.history.filter(entry => entry.text.includes("fresh wave")).map(entry => entry.text))
            .toEqual([`A fresh wave of ${REALM.enemyName} arrives`]);
    });

    it("goes on through an enemy wiped out before the last wave, and ends when the last is beaten", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        game.specificGameState.fighters.forEach(fighter => { if (isWarband(fighter.owner)) fighter.hp = 0; });
        game.specificGameState.roundsPlayed = 11;
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(false);
        game.specificGameState.roundsPlayed = 12;
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(true);
        expect(game).toMatchObject({ endReason: "teamwin", endDetail: "beat the last wave in round 13" });
    });

    it("loses immediately when the whole team is down", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        game.specificGameState.fighters.forEach(fighter => { if (!isWarband(fighter.owner)) fighter.hp = 0; });
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(true);
        expect(game).toMatchObject({ endReason: "teamloss", endDetail: "overrun in round 1" });
    });
});

describe("Hold Out's growing waves (§30.10)", () => {
    const holdOut = () => makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
    const standingOf = (game: RealmArenaTestGame, owner: string) => game.specificGameState.fighters.filter(fighter => fighter.owner === owner && isStanding(fighter));

    it("brings a warband to its squad and one character more for every wave landed, the squad's own in its order", () => {
        const squad = REALM.readyMade[80];
        expect([1, 3, 4, 6, 7, 10, 13].map(wavesLanded)).toEqual([0, 0, 1, 1, 2, 3, 4]);
        expect(waveStrength(squad, 1)).toEqual([...squad]);
        expect(waveStrength(squad, 4)).toEqual([...squad, squad[0]]);
        expect(waveStrength(squad, 13)).toEqual([...squad, ...squad]);
        expect(waveStrength(["archer"], 10)).toEqual(["archer", "archer", "archer", "archer"]);
        // Before growing waves, a wave only ever refilled the squad.
        expect(waveStrength(squad, 13, false)).toEqual([...squad]);
    });

    it("has room for its last wave's strength in every warband's zone, for every faction, size and difficulty", () => {
        for (const players of TEAMS) {
            for (const map of [undefined, "sackedFort"] as const) {
                const field = battlefieldById(mapFor(players.length, true, map));
                for (const faction of FACTION_IDS) {
                    for (const size of ["small", "normal", "large"] as const) {
                        for (const difficulty of ["easy", "normal", "hard"] as const) {
                            const squad = FACTIONS[faction].readyMade[warbandBudget(players.length, size, difficulty)];
                            const strongest = waveStrength(squad, lastWaveRound(battleRounds(players.length)));
                            for (let k = 0; k < players.length; k++) {
                                expect(() => readyMadeMuster(field, players.length + k, strongest), `${field.name}, ${faction}, ${size}, ${difficulty}`).not.toThrow();
                            }
                        }
                    }
                }
            }
        }
    });

    it("always has someone to bring, even with nobody of the warband downed", async () => {
        const game = holdOut();
        await musterAll(game);
        const owner = warbandOwner(0);
        game.specificGameState.roundsPlayed = 3;
        const fresh = waveOf(game.specificGameState, owner, true);
        expect(fresh.map(fighter => fighter.character)).toEqual([REALM.readyMade[80][0]]);
        const occupied = new Set(game.specificGameState.fighters.map(fighter => fighter.square));
        expect(fresh.every(fighter => !occupied.has(fighter.square))).toBe(true);
        expect(waveOf(game.specificGameState, owner, false)).toEqual([]);
    });

    it("lands a character more each wave in a whole battle's End turns, and only refills under an older version", async () => {
        for (const version of [undefined, 4]) {
            const game = holdOut();
            await musterAll(game);
            const squad = REALM.readyMade[80].length;
            for (const [round, grown] of [[3, 1], [6, 2]] as const) {
                game.specificGameState.roundsPlayed = round - 1;
                const before = game.specificGameState.roundsPlayed;
                // Clear the field, so the warbands' own turns can't change who stands.
                game.specificGameState.fighters.forEach(fighter => { if (isWarband(fighter.owner)) fighter.hp = 0; });
                const a = endTurnBy("a"), b = endTurnBy("b");
                if (version !== undefined) Object.assign(a, { version }), Object.assign(b, { version });
                await play(game, a);
                await play(game, b);
                expect(game.specificGameState.roundsPlayed).toBe(before + 1);
                for (const owner of warbandsOf(game)) {
                    expect(standingOf(game, owner), `round ${round + 1}, version ${version}`).toHaveLength(version === undefined ? squad + grown : squad);
                }
            }
        }
    });
});

describe("Hold Out's rally and the next wave told (§30.11)", () => {
    const holdOut = (fog = false) => makeGame(["a", "b"], {}, { fog, coop: { enemy: "realm", mission: "holdOut" } });
    const team = (game: RealmArenaTestGame) => game.specificGameState.fighters.filter(fighter => !isWarband(fighter.owner));

    /** Ends round three with the team hurt and the enemy off the field, so the warbands' own turns can't touch anyone, and lands round four's wave. */
    async function landRoundFour(game: RealmArenaTestGame, version?: number): Promise<void> {
        const gs = game.specificGameState;
        gs.roundsPlayed = 2;
        gs.fighters.forEach(fighter => { if (isWarband(fighter.owner)) fighter.hp = 0; });
        const [hurt, wounded, down] = team(game);
        hurt.hp = 1;
        wounded.hp = CHARACTERS[wounded.character].hp - 1;
        down.hp = 0;
        const a = endTurnBy("a"), b = endTurnBy("b");
        if (version !== undefined) Object.assign(a, { version }), Object.assign(b, { version });
        await play(game, a);
        await play(game, b);
        expect(gs.roundsPlayed).toBe(3);
    }

    it("heals everyone of the team standing by half their HP, rounded down and never past full, as a wave lands", async () => {
        const game = holdOut();
        await musterAll(game);
        await landRoundFour(game);
        const [hurt, wounded, down, ...rest] = team(game);
        expect(hurt.hp).toBe(1 + Math.floor(CHARACTERS[hurt.character].hp / 2));
        expect(wounded.hp).toBe(CHARACTERS[wounded.character].hp);
        expect(down.hp).toBe(0);
        for (const fighter of rest) expect(fighter.hp).toBe(CHARACTERS[fighter.character].hp);
        expect(game.gameState.history.map(entry => entry.text)).toContain("The team rallies: everyone standing regains half their HP");
    });

    it("heals nobody under an End turn from before the rally, on a replay too", async () => {
        const game = holdOut();
        await musterAll(game);
        await landRoundFour(game, 5);
        expect(team(game)[0].hp).toBe(1);
        expect(game.gameState.history.some(entry => entry.text.includes("rallies"))).toBe(false);
    });

    it("tells the team the next wave's round and how many it would bring now", async () => {
        const game = holdOut();
        await musterAll(game);
        const gs = game.specificGameState;
        // Nobody down: each warband's wave brings only the one character more.
        expect(nextWaveOf(gs)).toEqual({ round: 4, arriving: 2 });
        gs.fighters.find(fighter => isWarband(fighter.owner))!.hp = 0;
        expect(nextWaveOf(gs)).toEqual({ round: 4, arriving: 3 });
        expect(gameStateToModel(gs, "a", null).nextWave).toEqual({ round: 4, arriving: 3 });
        expect(gameStateToModel(gs, "a", null, true)).not.toHaveProperty("nextWave");
        gs.roundsPlayed = 12;
        expect(nextWaveOf(gs)).toBeUndefined();
    });

    it("tells a team in fog only the most the wave could bring", async () => {
        const game = holdOut(true);
        await musterAll(game);
        const gs = game.specificGameState;
        gs.fighters.find(fighter => isWarband(fighter.owner))!.hp = 0;
        expect(nextWaveOf(gs)).toEqual({ round: 4, arriving: 2 * (REALM.readyMade[80].length + 1), upTo: true });
    });

    it("counts a random enemy's wave without fog, where it's seen from the start", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", random: true, mission: "holdOut" } });
        await musterAll(game);
        expect(nextWaveOf(game.specificGameState)).toEqual({ round: 4, arriving: 2 });
    });

    it("tells nothing outside Hold Out", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(game);
        expect(nextWaveOf(game.specificGameState)).toBeUndefined();
    });
});

describe("Hold Out's result (§30.10)", () => {
    it("tells the waves, who stood each round, and how the battle ended", async () => {
        seedRolls(11);
        const { game } = await coopBattle(["a", "b"], { coop: { enemy: "realm", mission: "holdOut" } });
        const record = await recordBattle(game);
        expect(record?.waves).toBeDefined();
        const waves = record!.waves!;
        expect(record!.battleRounds).toBe(15);
        expect(waves[0]).toMatchObject({ round: 0, arrived: 2 * REALM.readyMade[80].length });
        expect(waves.slice(1).map(wave => wave.round + 1).every(round => waveArrives(round, 15))).toBe(true);
        // Every knock-out of the enemy is in a wave, by the player who scored it.
        const knockouts = record!.fighting.filter(row => row.userId !== ENEMY_SIDE).reduce((sum, row) => sum + row.knockouts, 0);
        expect(waves.reduce((sum, wave) => sum + [...wave.downed.values()].reduce((a, b) => a + b, 0), 0)).toBe(knockouts);
        expect(waves.every(wave => [...wave.downed.keys()].every(owner => ["a", "b"].includes(owner)))).toBe(true);
        // Whoever stands at the end is whoever's standing on the battlefield.
        const last = record!.standingPerRound!.at(-1)!;
        const fighters = game.specificGameState.fighters.filter(isStanding);
        expect([last.get(TEAM_SIDE), last.get(ENEMY_SIDE)]).toEqual([fighters.filter(f => !isWarband(f.owner)).length, fighters.filter(f => isWarband(f.owner)).length]);

        const stats = computeRealmArenaResultStats(game, record);
        const [group] = formatRealmArenaResultStats(stats, new Map(Object.entries(NAMES)));
        expect(group.username).toBe("Hold Out");
        expect(group.lines[0]).toMatch(game.endReason === "teamwin" ? /^(Held out for all 15 rounds|Beat the last wave in round \d+ of 15)$/ : /^Overrun in round \d+ of 15$/);
        expect(group.lines[1]).toMatch(new RegExp(`^Faced ${waves.length} waves?: \\d+ of the enemy took the field, and the team downed ${knockouts}$`));
        expect(group.lines).toHaveLength(2 + waves.length);

        const charts = formatRealmArenaCharts(stats);
        const standing = charts.find(chart => chart.title === "Characters standing per round") as GameResultChart;
        expect(standing.series?.map(series => series.key)).toEqual([TEAM_SIDE, ENEMY_SIDE]);
        expect(standing.events?.map(event => [event.icon, event.seriesKey])).toEqual(waves.slice(1).map(() => ["wave", ENEMY_SIDE]));
        const byWave = charts.find(chart => chart.title === "Enemies downed by wave") as GameResultBarChart;
        expect(byWave.bars.map(bar => bar.label)).toEqual(waves.map((_, index) => `Wave ${index + 1}`));
    }, 60_000);

    it("is never recorded while the battle is still being fought, through the fog", async () => {
        const game = makeGame(["a", "b"], {}, { fog: true, coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        expect(await recordBattle(game)).toBeUndefined();
    });

    it("has nothing of Hold Out's in a battle of Hold the Centre", async () => {
        seedRolls(11);
        const { game } = await coopBattle(["a", "b"], { coop: { enemy: "realm" } });
        const record = await recordBattle(game);
        expect(record).toBeDefined();
        expect(record!.waves).toBeUndefined();
        const stats = computeRealmArenaResultStats(game, record);
        expect(formatRealmArenaResultStats(stats, new Map()).some(group => group.username === "Hold Out")).toBe(false);
        expect(formatRealmArenaCharts(stats).some(chart => chart.title === "Enemies downed by wave")).toBe(false);
    }, 60_000);
});

describe("difficulty (§30.5)", () => {
    const createGame = RealmArenaInvitationModel.schema.methods.CreateGame as
        (this: unknown, invite: unknown, userIdList: string[]) => Promise<IRealmArenaGameData>;
    const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];
    const SIZES: BattleSize[] = ["small", "normal", "large"];
    const stored = <T extends string>(value: T) => value === "normal" ? undefined : value as Exclude<T, "normal">;

    it("is Easy or Hard as sent, absent for Normal, and refused as anything else", () => {
        expect(coopInviteOf({ enemy: "realm", difficulty: "hard" })).toEqual({ enemy: "realm", difficulty: "hard" });
        expect(coopInviteOf({ enemy: "random", mission: "holdOut", difficulty: "easy" })).toEqual({ enemy: "random", mission: "holdOut", difficulty: "easy" });
        for (const junk of ["normal", "brutal", 3, {}]) expect(coopInviteOf({ enemy: "realm", difficulty: junk })).toBeUndefined();
        expect(new RealmArenaInvitationModel({ coop: { enemy: "realm", difficulty: "hard" } }).toObject().coop).toEqual({ enemy: "realm", difficulty: "hard" });
    });

    it("is stored with the battle, named in the setup log, and on the wire for every viewer", async () => {
        const invite = { turnTimer: 0, coop: { enemy: "realm", difficulty: "hard" } };
        const game = await createGame.call(invite, invite, ["a", "b"]);
        expect(game.specificGameState.coop).toEqual({ enemy: "realm", nextWarband: 0, difficulty: "hard" });
        expect(game.gameState.history.map(entry => entry.text)).toContain("Setup: on Hard, each warband musters 100 points' worth");
        for (const viewer of [null, "a", "b"]) expect(gameStateToModel(game.specificGameState, viewer, null).difficulty).toBe("hard");
    });

    it("is Normal for a battle that never stored one, as every battle before it", async () => {
        const invite = { turnTimer: 0, coop: { enemy: "realm" } };
        const game = await createGame.call(invite, invite, ["a", "b"]);
        expect(game.specificGameState.coop).not.toHaveProperty("difficulty");
        expect(game.gameState.history.map(entry => entry.text)).toContain("Setup: on Normal, each warband musters 80 points' worth");
        expect(gameStateToModel(game.specificGameState, "a", null)).not.toHaveProperty("difficulty");
    });

    it("musters every warband its squad for each size and difficulty, and holds the players to theirs", async () => {
        for (const size of SIZES) {
            for (const difficulty of DIFFICULTIES) {
                for (const players of TEAMS) {
                    const game = makeGame(players, {}, { size: stored(size), coop: { enemy: "realm", difficulty: stored(difficulty) } });
                    expect(gameStateToModel(game.specificGameState, "a", null).budget).toBe(musterBudget(players.length, true, size));
                    await musterAll(game);
                    const squad = REALM.readyMade[warbandBudget(players.length, size, difficulty)];
                    for (const owner of warbandsOf(game)) {
                        expect(game.specificGameState.fighters.filter(fighter => fighter.owner === owner).map(fighter => fighter.character), `${size}, ${difficulty}`)
                            .toEqual([...squad]);
                    }
                }
            }
        }
    });

    it("refills each warband to its difficulty's squad in Hold Out before any wave has landed", async () => {
        for (const difficulty of ["easy", "hard"] as const) {
            const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut", difficulty } });
            await musterAll(game);
            const owner = warbandOwner(0);
            expect(waveOf(game.specificGameState, owner, true)).toEqual([]);
            const band = game.specificGameState.fighters.filter(fighter => fighter.owner === owner);
            band.forEach(fighter => { fighter.hp = 0; });
            expect(waveOf(game.specificGameState, owner, true).map(fighter => fighter.character)).toEqual([...REALM.readyMade[warbandBudget(2, "normal", difficulty)]]);
        }
    });

    it("names the difficulty in a co-op ending, but not Normal's", async () => {
        const hard = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut", difficulty: "hard" } });
        await musterAll(hard);
        hard.specificGameState.fighters.forEach(fighter => { if (!isWarband(fighter.owner)) fighter.hp = 0; });
        expect(new RealmArenaGameType().CheckGameOver(hard)).toBe(true);
        expect(hard).toMatchObject({ endReason: "teamloss", endDetail: "overrun in round 1, on Hard" });

        const easy = makeGame(["a", "b"], {}, { coop: { enemy: "realm", difficulty: "easy" } });
        await musterAll(easy);
        easy.specificGameState.roundsPlayed = battleRounds(2);
        expect(new RealmArenaGameType().CheckGameOver(easy)).toBe(true);
        expect(easy.endDetail).toMatch(/, on Easy$/);
    });
});

describe("a co-op battle's creation (§29.2, §29.3)", () => {
    const createGame = RealmArenaInvitationModel.schema.methods.CreateGame as
        (this: unknown, invite: unknown, userIdList: string[]) => Promise<IRealmArenaGameData>;

    it("puts a team of two on the Twin-Gate Fort and three on the Three-Gate Fort, against the faction the host picked", async () => {
        for (const [players, map] of [[["a", "b"], "twinGateFort"], [["a", "b", "c"], "threeGateFort"]] as const) {
            const invite = { turnTimer: 0, coop: { enemy: "realm" } };
            const game = await createGame.call(invite, invite, [...players]);
            expect(game.specificGameState.map).toBe(map);
            expect(game.specificGameState.coop).toEqual({ enemy: "realm", nextWarband: 0 });
            const setup = game.gameState.history.map(entry => entry.text).join("\n");
            expect(setup).toContain(`against ${REALM.enemyName}`);
            expect(setup).toContain(`each player musters ${musterBudget(2, true)} points' worth`);
        }
    });

    it("puts a team on the Sacked Fort when the host picked it for Hold Out, the warbands round the edges (§30.9)", async () => {
        for (const [players, map] of [[["a", "b"], "sackedFortTwo"], [["a", "b", "c"], "sackedFortThree"]] as const) {
            const invite = { turnTimer: 0, coop: { enemy: "realm", mission: "holdOut", map: "sackedFort" } };
            const game = await createGame.call(invite, invite, [...players]);
            expect(game.specificGameState.map).toBe(map);
            expect(game.specificGameState.coop).toEqual({ enemy: "realm", nextWarband: 0, mission: "holdOut", map: "sackedFort" });
            const setup = game.gameState.history.map(entry => entry.text).join("\n");
            expect(setup).toContain("Setup: Hold Out on the Sacked Fort");
            expect(setup).toContain("a warband for each of them closing in from the edges");
            expect(setup).toContain("deploys in the west of the keep");
        }
    });

    it("draws Random as the battle is created, stores what it drew, and doesn't name it", async () => {
        const invite = { turnTimer: 0, coop: { enemy: "random" } };
        const game = await createGame.call(invite, invite, ["a", "b"]);
        expect(FACTION_IDS).toContain(game.specificGameState.coop?.enemy);
        const setup = game.gameState.history.map(entry => entry.text).join("\n");
        expect(setup).toContain("an enemy drawn at random");
        expect(setup).not.toContain(REALM.enemyName);
    });

    it("plays a free-for-all for a party its battlefields aren't built for", async () => {
        const invite = { turnTimer: 0, coop: { enemy: "realm" } };
        const game = await createGame.call(invite, invite, ["a", "b", "c", "d"]);
        expect(game.specificGameState.coop).toBeUndefined();
        expect(game.specificGameState.map).toBe("fourGateFort");
        // …and says so, since the host asked for co-op.
        expect(game.gameState.history.map(entry => entry.text)).toContain("Setup: co-op is for up to 3 players, so this is a free-for-all");
    });
});

describe("the muster in co-op (§29.1, §29.7)", () => {
    it("holds every squad to 80 points, whatever the size of the team", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        const field = battlefieldById(game.specificGameState.map);
        // The two-player squad spends 100.
        const { outcome } = await play(game, muster("a", readyMadeMuster(field, 0, REALM.readyMade[100])));
        expect(outcome.validMove).toBe(false);
        expect((await play(game, muster("a", readyMadePicks(game, 0)))).outcome.validMove).toBe(true);
        expect(gameStateToModel(game.specificGameState, "a", null).budget).toBe(80);
    });

    it("musters a warband opposite each player as the last player does, its ids after theirs", async () => {
        for (const players of TEAMS) {
            const game = makeGame(players, {}, { coop: { enemy: "realm" } });
            await musterAll(game);
            const gs = game.specificGameState;
            const field = battlefieldById(gs.map);
            const squad = REALM.readyMade[80];
            const owners = gs.fighters.map(fighter => fighter.owner);
            expect(owners).toEqual([...players, ...warbandsOf(game)].flatMap(owner => squad.map(() => owner)));
            for (const [k, owner] of warbandsOf(game).entries()) {
                const band = gs.fighters.filter(fighter => fighter.owner === owner);
                expect(band.map(fighter => fighter.character)).toEqual([...squad]);
                expect(band.every(fighter => field.deployments[players.length + k].includes(fighter.square))).toBe(true);
            }
            // The players are one side and the warbands the other (§29.6).
            const { sides } = battleOf(game);
            expect(new Set(players.map(player => sides?.[player])).size).toBe(1);
            expect(new Set(warbandsOf(game).map(owner => sides?.[owner])).size).toBe(1);
            expect(sides?.[players[0]]).not.toBe(sides?.[warbandOwner(0)]);
            // The warbands aren't seated: the turn goes from one player to the next.
            expect(game.currentTurn).toBe(players[0]);
            expect(game.gameState.turnOrder).toEqual(players);
        }
    });
});

describe("the enemy's turn (§29.4)", () => {
    it("follows each player's, one warband after each in turn, recorded on the End turn", async () => {
        const [first, second] = [warbandOwner(0), warbandOwner(1)];
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(game);
        const ended = endTurnBy("a");
        const { outcome } = await play(game, ended);
        expect(outcome.validMove).toBe(true);
        expect(game.currentTurn).toBe("b");
        const actions = (ended as RealmArenaEndTurn).recordedEnemyActions ?? [];
        expect(actions.length).toBeGreaterThan(0);
        expect(actions.every(action => battleOf(game).fighters.find(fighter => fighter.id === action.fighter)?.owner === first)).toBe(true);
        // It acted, and ended its turn as a player does: AP spent, on watch.
        const events = (outcome as IRealmArenaOutcome).events;
        expect(events.some(event => event.kind === "moved" && battleOf(game).fighters[event.fighter].owner === first)).toBe(true);
        const band = (owner: string) => battleOf(game).fighters.filter(fighter => fighter.owner === owner);
        expect(band(first).every(fighter => fighter.ap === 0)).toBe(true);
        expect(band(second).every(fighter => fighter.ap === 0 && fighter.banked === 0)).toBe(true);
        expect(game.specificGameState.coop?.nextWarband).toBe(1);

        const deployed = band(second).map(fighter => fighter.square);
        await play(game, endTurnBy("b"));
        expect(band(second).map(fighter => fighter.square)).not.toEqual(deployed);
        expect(game.specificGameState.coop?.nextWarband).toBe(0);
        // A round is still the players' seats: the warbands add no hand-offs.
        expect(game.specificGameState.roundsPlayed).toBe(1);
        expect(game.currentTurn).toBe("a");
    });

    it("steps past a warband with nobody standing", async () => {
        const [first, second] = [warbandOwner(0), warbandOwner(1)];
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(game);
        game.specificGameState.fighters = game.specificGameState.fighters.map(fighter => fighter.owner === first ? { ...fighter, hp: 0 } : fighter);
        const ended = endTurnBy("a");
        await play(game, ended);
        expect((ended as RealmArenaEndTurn).recordedEnemyActions?.every(action => battleOf(game).fighters[action.fighter].owner === second)).toBe(true);
        expect(game.specificGameState.coop?.nextWarband).toBe(0);
    });

    it("records that no warband took a turn when the battle is over first, so a replay never plans one", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(game);
        game.specificGameState.fighters = game.specificGameState.fighters.map(fighter => isWarband(fighter.owner) ? { ...fighter, hp: 0 } : fighter);
        const ended = endTurnBy("a");
        await play(game, ended);
        expect((ended as RealmArenaEndTurn).recordedEnemyActions).toEqual([]);
        expect(game.complete).toBe(true);
    });

    it("ends there when the planner throws, and the player's End turn still stands", async () => {
        const first = warbandOwner(0);
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(game);
        planner.broken = true;
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const ended = endTurnBy("a");
        expect((await play(game, ended)).outcome.validMove).toBe(true);
        expect(error).toHaveBeenCalledOnce();
        expect((ended as RealmArenaEndTurn).recordedEnemyActions).toEqual([]);
        // It did nothing, so it went on watch where it stood.
        expect(battleOf(game).fighters.filter(fighter => fighter.owner === first).every(fighter => fighter.banked > 0)).toBe(true);
        expect(game.currentTurn).toBe("b");
    });

    it("never takes its moves from a request: the recorded ones are stripped, as every recorded roll is", () => {
        const sent = Object.assign(endTurnBy("a"), { recordedEnemyActions: [{ kind: "hunker", fighter: 8 }], recordedRolls: [1] });
        stripRecordedRandomness(sent);
        expect(sent).not.toHaveProperty("recordedEnemyActions");
        expect(sent).not.toHaveProperty("recordedRolls");
    });

    it("isn't there in a free-for-all", async () => {
        const game = makeGame();
        await musterAll(game);
        const ended = endTurnBy("a");
        await play(game, ended);
        expect(ended).not.toHaveProperty("recordedEnemyActions");
        expect(battleOf(game).sides).toBeUndefined();
    });
});

describe("what a player is told of the enemy's turn in fog of war (§29.8)", () => {
    it("is only what their side saw, in the End turn's own response as in a review", async () => {
        const game = makeGame(["a", "b"], {}, { fog: true, coop: { enemy: "realm" } });
        await musterAll(game);
        const { outcome } = await play(game, endTurnBy("a"));
        const all = (outcome as IRealmArenaOutcome).events;
        const told = (new RealmArenaGameType().outcomeFor(game, outcome, "a") as IRealmArenaOutcome).events;
        const battle = battleOf(game);
        const seen = squadSight(battle, "a");
        const enemyMoves = (events: BattleEvent[]) => events.filter(event => event.kind === "moved" && battle.fighters[event.fighter].owner === warbandOwner(0));
        // The warbands deploy too far off to be seen, so it moved out of sight.
        expect(enemyMoves(all).some(event => event.kind === "moved" && event.path.length > 0)).toBe(true);
        for (const event of enemyMoves(told)) {
            if (event.kind === "moved") expect(event.path.every(seen)).toBe(true);
        }
        expect(told).not.toEqual(all);
        // A teammate is told it the same, and so is a review of the step,
        // which leaves out the rolls; nobody seated is told the warband's moves.
        expect((new RealmArenaGameType().outcomeFor(game, outcome, "b") as IRealmArenaOutcome).events).toEqual(told);
        const reviewed = stepOutcomeToModel(outcome, "a", game.specificGameState)?.events ?? [];
        expect(reviewed).toEqual(told.map(event => event.kind === "shot" ? (({ roll: _roll, ...rest }) => rest)(event) : event));
        const nobody = stepOutcomeToModel(outcome, null, game.specificGameState)?.events ?? [];
        expect(enemyMoves(nobody as BattleEvent[]).every(event => event.kind === "moved" && event.path.length === 0)).toBe(true);
    });

    it("never carries whom the team fights while a random enemy is unseen: only that it's co-op", async () => {
        const game = makeGame(["a", "b"], {}, { fog: true, coop: { enemy: "realm", random: true } });
        await musterAll(game);
        for (const viewer of ["a", "b", null]) {
            const wire = gameStateToModel(game.specificGameState, viewer, null);
            expect(wire.coop).toBe(true);
            expect(JSON.stringify(wire)).not.toMatch(/enemy|nextWarband|"realm"/);
        }
    });

    it("is everything once the fog has lifted, and everything without it", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(game);
        const { outcome } = await play(game, endTurnBy("a"));
        // All but the End turn's parts, which are the recap's (§29.9).
        const { recap, ...told } = outcome as IRealmArenaOutcome;
        expect(recap?.enemy?.steps.length).toBeGreaterThan(0);
        expect(recap?.started).toEqual([]);
        expect(new RealmArenaGameType().outcomeFor(game, outcome, "a")).toEqual(told);
    });
});

describe("the computer in whole battles (§29.11)", () => {
    it("never breaks: every co-op battlefield, every faction, with and without fog, to the end within its time", async () => {
        const warn = vi.spyOn(console, "warn");
        const error = vi.spyOn(console, "error");
        const times: number[] = [];
        let seed = 1;
        for (const players of TEAMS) {
            for (const enemy of FACTION_IDS) {
                for (const fog of [false, true]) {
                    seedRolls(seed++);
                    const battle = await coopBattle(players, { fog, coop: { enemy } });
                    times.push(...battle.times);
                    expect(battle.game.complete).toBe(true);
                    // One ending for the whole team (§29.5).
                    expect(["teamwin", "teamloss"]).toContain(battle.game.endReason);
                    expect(battle.game.winner).toBe("");
                    // Every warband fought: each took turns, and the rotation came round.
                    const recorded = battle.game.gameState.commandHistory.flatMap(command => (command as RealmArenaEndTurn).recordedEnemyActions ?? []);
                    const owners = new Set(recorded.map(action => battleOf(battle.game).fighters[action.fighter].owner));
                    expect(owners).toEqual(new Set(warbandsOf(battle.game)));
                }
            }
        }
        // Nothing it chose was refused, and the planner never threw.
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        // On average, with room for a slow turn on a busy test runner (§29.7).
        expect(times.reduce((total, ms) => total + ms, 0) / times.length).toBeLessThan(250);
        expect(Math.max(...times)).toBeLessThan(1_000);
    }, 120_000);

    it("plays well: it beats the scripted team in at least 19 battles of 20", async () => {
        let won = 0;
        for (let seed = 0; seed < 20; seed++) {
            seedRolls(100 + seed);
            const { game } = await coopBattle(TEAMS[seed % 2], { coop: { enemy: "realm" } });
            // The ending says what the standings do.
            expect(game.endReason).toBe(enemyWon(game) ? "teamloss" : "teamwin");
            if (enemyWon(game)) won++;
        }
        expect(won).toBeGreaterThanOrEqual(19);
    }, 120_000);

    it("never breaks in Hold Out: every co-op battlefield and the Sacked Fort, with and without fog, to an ending it words", async () => {
        const warn = vi.spyOn(console, "warn");
        const error = vi.spyOn(console, "error");
        let seed = 500;
        for (const players of TEAMS) {
            for (const [fog, map] of [[false, undefined], [true, undefined], [false, "sackedFort"], [true, "sackedFort"]] as const) {
                seedRolls(seed++);
                const { game } = await coopBattle(players, { fog, coop: { enemy: "realm", mission: "holdOut", map } });
                expect(game.complete).toBe(true);
                expect(["teamwin", "teamloss"]).toContain(game.endReason);
                expect(game.endDetail).toMatch(game.endReason === "teamwin"
                    ? /^(held out for all \d+ rounds|beat the last wave in round \d+)$/
                    : /^overrun in round \d+$/);
            }
        }
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    }, 120_000);

    it("never breaks at any difficulty or battle size, in either mission", async () => {
        const warn = vi.spyOn(console, "warn");
        const error = vi.spyOn(console, "error");
        const times: number[] = [];
        let seed = 900;
        for (const size of ["small", undefined, "large"] as const) {
            for (const difficulty of ["easy", undefined, "hard"] as const) {
                seedRolls(seed);
                const mission = seed % 2 === 0 ? "holdOut" as const : undefined;
                const battle = await coopBattle(TEAMS[seed % 2], { fog: seed % 3 === 0, size, coop: { enemy: "realm", mission, difficulty } });
                seed++;
                times.push(...battle.times);
                expect(battle.game.complete).toBe(true);
                expect(["teamwin", "teamloss"]).toContain(battle.game.endReason);
            }
        }
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        // Within the budget on average (§29.7). A large battle on Hard fields
        // the most characters on both sides, and its slowest turns take about
        // three-quarters of a second, so the slowest is held to more (§30.5).
        expect(times.reduce((total, ms) => total + ms, 0) / times.length).toBeLessThan(250);
        expect(Math.max(...times)).toBeLessThan(1_500);
    }, 180_000);

    it("replays a large battle on Hard to the same end without asking the planner", async () => {
        seedRolls(13);
        const { game } = await coopBattle(["a", "b"], { fog: true, size: "large", coop: { enemy: "realm", mission: "holdOut", difficulty: "hard" } });
        vi.restoreAllMocks();
        planner.broken = true;
        const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
        for (const viewer of [null, "a"]) {
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, viewer);
            expect(timeline.snapshots[timeline.currentIndex].specificGameState).toEqual(gameStateToModel(game.specificGameState, viewer, lastId, true));
        }
    }, 60_000);

    it("replays a battle of Hold Out, waves and all, to the same end without asking the planner", async () => {
        seedRolls(11);
        const { game } = await coopBattle(["a", "b"], { fog: true, coop: { enemy: "realm", mission: "holdOut" } });
        vi.restoreAllMocks();
        planner.broken = true;
        planner.calls = 0;
        const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
        for (const viewer of [null, "a", "b"]) {
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, viewer);
            const last = timeline.snapshots[timeline.currentIndex];
            expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, viewer, lastId, true));
            expect(last.complete).toBe(true);
        }
        expect(planner.calls).toBe(0);
        // The battle it replayed lasted long enough for a wave to land.
        expect(game.gameState.history.some(entry => entry.text.includes("fresh wave"))).toBe(true);
    }, 60_000);

    it("replays a battle on the Sacked Fort to the same end, on the same battlefield, without asking the planner (§30.9)", async () => {
        seedRolls(17);
        const { game } = await coopBattle(["a", "b", "c"], { fog: true, coop: { enemy: "realm", mission: "holdOut", map: "sackedFort" } });
        vi.restoreAllMocks();
        planner.broken = true;
        const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
        const timeline = await buildTimeline(game, { a: "Alice", b: "Bob", c: "Cat" }, [], undefined, "a");
        expect((timeline.snapshots[0].specificGameState as { map: string }).map).toBe("sackedFortThree");
        expect(timeline.snapshots[timeline.currentIndex].specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", lastId, true));
    }, 60_000);

    it("replays a recorded battle to the same end without asking the planner", async () => {
        seedRolls(7);
        const { game } = await coopBattle(["a", "b"], { fog: true, coop: { enemy: "realm" } });
        vi.restoreAllMocks();
        planner.broken = true;
        planner.calls = 0;
        const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
        for (const viewer of [null, "a", "b"]) {
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, viewer);
            const last = timeline.snapshots[timeline.currentIndex];
            expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, viewer, lastId, true));
            expect(last.complete).toBe(true);
        }
        expect(planner.calls).toBe(0);
        // The battle it replayed was a real one: the enemy fought in it.
        expect(game.gameState.commandHistory.some(command => (command as RealmArenaEndTurn).recordedEnemyActions?.length)).toBe(true);
    }, 60_000);
});

const NAMES: Record<string, string> = { a: "Alice", b: "Bob" };
const ENEMY = REALM.enemyName;

/** A co-op battle mustered and given these scores, with every warband downed unless the enemy is to be left standing. */
async function scored(scores: Record<string, number>, enemyStanding = false): Promise<RealmArenaTestGame> {
    const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
    await musterAll(game);
    const gs = game.specificGameState;
    gs.scores = { ...gs.scores, ...scores };
    if (!enemyStanding) gs.fighters = gs.fighters.map(fighter => isWarband(fighter.owner) ? { ...fighter, hp: 0 } : fighter);
    return game;
}

describe("the co-op ending (§29.5)", () => {
    it("is the team's win when its score beats the enemy's, one ending for everybody", async () => {
        const game = await scored({ a: 3, b: 4, [warbandOwner(0)]: 2, [warbandOwner(1)]: 3 });
        await play(game, endTurnBy("a"));
        expect(game).toMatchObject({ complete: true, winner: "", endReason: "teamwin", endDetail: "7 points to 5", currentTurn: "" });
        const [won, final] = game.gameState.history.map(entry => entry.text);
        expect(won).toBe("The team wins the battle");
        expect(final).toBe(`The battle is over: the team 7 points ({{a}} 3, {{b}} 4), ${ENEMY} 5`);
        // The detail is read back where no token is resolved.
        expect(game.endDetail).not.toMatch(/\{\{/);
    });

    it("is the team's loss when the enemy's beats it, even with nobody of the enemy's left", async () => {
        const game = await scored({ a: 1, [warbandOwner(1)]: 6 });
        await play(game, endTurnBy("a"));
        expect(game).toMatchObject({ complete: true, winner: "", endReason: "teamloss", endDetail: "1 point to 6" });
        expect(game.gameState.history[0].text).toBe("The team loses the battle");
    });

    it("goes to the side with more left standing on level scores, and to the enemy, holding the field, if that's level too", async () => {
        const ahead = await scored({ a: 5, [warbandOwner(0)]: 5 });
        await play(ahead, endTurnBy("a"));
        expect(ahead).toMatchObject({ endReason: "teamwin", endDetail: "5 points each, with more of the team left standing" });

        // The turn limit, with every squad whole: the same points' worth a side.
        const level = await scored({}, true);
        level.specificGameState.roundsPlayed = battleRounds(2);
        expect(new RealmArenaGameType().CheckGameOver(level)).toBe(true);
        expect(level).toMatchObject({ endReason: "teamloss", endDetail: "0 points each, and the enemy held the field" });
    });
});

describe("the enemy in the log (§29.6)", () => {
    it("is named by its faction, its characters by its name, and never as a player", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(game);
        await play(game, endTurnBy("a"));
        const lines = game.gameState.history.map(entry => entry.text);
        const enemy = game.gameState.history.filter(entry => entry.actorId === undefined && entry.text.startsWith(`${ENEMY.charAt(0).toUpperCase()}${ENEMY.slice(1)} `));
        expect(enemy.length).toBeGreaterThan(0);
        expect(enemy.some(entry => /their (Knight|Archer|Scout|Mage|Cleric|Warrior)/.test(entry.text))).toBe(true);
        expect(lines.join("\n")).not.toContain("{{ai:");
    });
});

describe("the recap of the enemy's turn (§29.9)", () => {
    it("gives each of its actions a row, built as a player's is, and folds none of them in with burning", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(game);
        const ended = endTurnBy("a");
        await play(game, ended);
        const actions = (ended as RealmArenaEndTurn).recordedEnemyActions ?? [];
        const rows = await buildAllEvents(game, NAMES, "a");
        const enemy = rows.filter(row => /:enemy:\d+$/.test(row.id));
        expect(enemy).toHaveLength(actions.length);
        const capitalised = `${ENEMY.charAt(0).toUpperCase()}${ENEMY.slice(1)} `;
        expect(enemy.every(row => row.actorId === warbandOwner(0) && row.title.startsWith(capitalised))).toBe(true);
        expect(rows.some(row => row.type === "ra_burning")).toBe(false);
        // Alice's own row is still hers, and still a bare End turn.
        expect(rows.find(row => row.id === ended.id)).toMatchObject({ actorId: "a", title: "Alice ended their turn" });

        // The feed folds what each of its characters did into one row, as it does a player's.
        const feed = await buildEventFeed(game, NAMES, "b");
        const folded = feed.events.filter(row => row.actorId === warbandOwner(0));
        const characters = new Set(actions.map(action => action.fighter));
        expect(folded.length).toBe(characters.size);
        // The team's score against the enemy's, not Bob's against his teammate's.
        expect(feed.tip?.text).toMatch(/^(The team is \d+ points? (ahead|behind)|The scores are level)/);
    });
});

describe("the battle record in co-op (§29.6)", () => {
    it("keeps the enemy as one column, its warbands added together", async () => {
        seedRolls(11);
        const { game } = await coopBattle(["a", "b"], { coop: { enemy: "realm" } });
        const record = await recordBattle(game);
        expect(record).toBeDefined();
        const columns = new Set(record!.fighting.map(row => row.userId));
        expect(columns).toEqual(new Set(["a", "b", ENEMY_SIDE]));
        const gs = game.specificGameState;
        const enemyScore = warbandsOf(game).reduce((sum, owner) => sum + (gs.scores[owner] ?? 0), 0);
        expect(record!.pointsPerRound.at(-1)?.get(ENEMY_SIDE)).toBe(enemyScore);
        expect([...record!.squadHpPerRound.at(-1)!.keys()]).toEqual(["a", "b", ENEMY_SIDE]);
        // It reaches the result whole, and the result names it.
        const stats = computeRealmArenaResultStats(game, record);
        expect(stats.fighting).toBe(record!.fighting);
        const groups = formatRealmArenaResultStats(stats, new Map(Object.entries(NAMES)));
        expect(groups.map(group => group.username)).toEqual(["Alice", "Bob", "The enemy"]);

        // The races are the team's line against the enemy's (§29.9), every
        // character downed marked on its side's line.
        const charts = formatRealmArenaCharts(stats);
        const points = charts.find(chart => chart.title === "Points per round") as GameResultChart;
        expect(points.series?.map(series => series.key)).toEqual([TEAM_SIDE, ENEMY_SIDE]);
        const final = record!.pointsPerRound.at(-1)!;
        expect(points.rounds.at(-1)).toEqual({ [TEAM_SIDE]: (final.get("a") ?? 0) + (final.get("b") ?? 0), [ENEMY_SIDE]: enemyScore });
        expect(new Set(points.events?.map(event => event.seriesKey))).toEqual(new Set(record!.losses.map(loss => loss.seriesKey === ENEMY_SIDE ? ENEMY_SIDE : TEAM_SIDE)));
        const health = charts.find(chart => chart.title === "Squad health per round") as GameResultChart;
        expect(Object.keys(health.rounds[0])).toEqual([TEAM_SIDE, ENEMY_SIDE]);
        // The damage and the table draw the enemy beside the players.
        const damage = charts.find(chart => chart.kind === "bar") as GameResultBarChart;
        expect(damage.extraSeries?.map(series => series.key)).toEqual([ENEMY_SIDE]);
        const table = charts.find(chart => chart.kind === "table") as GameResultTable;
        expect(table.extraSeries?.map(series => [series.key, series.name])).toEqual([[ENEMY_SIDE, "The enemy"]]);
        expect(table.rows.every(row => ENEMY_SIDE in row.values)).toBe(true);
    }, 60_000);

    it("leaves a free-for-all's charts a line and a column a player", async () => {
        seedRolls(11);
        const game = await playScriptedBattle({}, ["a", "b"]);
        const record = await recordBattle(game);
        const charts = formatRealmArenaCharts(computeRealmArenaResultStats(game, record));
        expect(charts).toHaveLength(4);
        expect(charts.some(chart => ("series" in chart && chart.series) || ("extraSeries" in chart && chart.extraSeries))).toBe(false);
    }, 60_000);
});
