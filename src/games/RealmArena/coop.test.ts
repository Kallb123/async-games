import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { buildAllEvents, buildEventFeed } from "@/utils/games/recap";
import { stripRecordedRandomness } from "@/utils/apiModels/gameCommand";
import { FACTION_IDS, POINTS_BUDGET, REALM, type FactionId } from "./characters";
import { battlefieldById } from "./maps";
import {
    computeRealmArenaResultStats, coopInviteOf, formatRealmArenaResultStats, gameStateToModel, RealmArenaInvitationModel, stepOutcomeToModel, type IRealmArenaGameData,
} from "./RealmArenaModels";
import { recordBattle } from "./recordBattle";
import { RealmArenaGameType, type IRealmArenaOutcome, type RealmArenaEndTurn } from "./RealmArenaLogic";
import { battleRounds, ENEMY_SIDE, isWarband, readyMadeMuster, squadSight, standings, warbandOwner, type BattleEvent } from "./rules";
import {
    battleOf, endTurnBy, makeGame, muster, musterAll, play, playScriptedTurn, readyMadePicks, type RealmArenaTestGame,
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
async function coopBattle(players: string[], enemy: FactionId, fog = false): Promise<{ game: RealmArenaTestGame; times: number[] }> {
    const game = makeGame(players, {}, fog, enemy);
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

    it("is kept on the invitation only as one, whatever a lobby's settings carried", () => {
        expect(new RealmArenaInvitationModel({ coop: { enemy: "realm", nextWarband: 9 } }).toObject().coop).toEqual({ enemy: "realm" });
        expect(new RealmArenaInvitationModel({ coop: { enemy: "orcs" } }).toObject().coop).toBeUndefined();
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
            expect(setup).toContain(`each player musters ${POINTS_BUDGET[3]} points' worth`);
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
        expect(game.gameState.history.map(entry => entry.text)).toContain("Setup: co-op is for 2–3 players, so this is a free-for-all");
    });
});

describe("the muster in co-op (§29.1, §29.7)", () => {
    it("holds every squad to 80 points, whatever the size of the team", async () => {
        const game = makeGame(["a", "b"], {}, false, "realm");
        const field = battlefieldById(game.specificGameState.map);
        // The two-player squad spends 100.
        const { outcome } = await play(game, muster("a", readyMadeMuster(field, 0, REALM.readyMade[2])));
        expect(outcome.validMove).toBe(false);
        expect((await play(game, muster("a", readyMadePicks(game, 0)))).outcome.validMove).toBe(true);
        expect(gameStateToModel(game.specificGameState, "a", null).budget).toBe(80);
    });

    it("musters a warband opposite each player as the last player does, its ids after theirs", async () => {
        for (const players of TEAMS) {
            const game = makeGame(players, {}, false, "realm");
            await musterAll(game);
            const gs = game.specificGameState;
            const field = battlefieldById(gs.map);
            const squad = REALM.readyMade[3];
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
        const game = makeGame(["a", "b"], {}, false, "realm");
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
        const game = makeGame(["a", "b"], {}, false, "realm");
        await musterAll(game);
        game.specificGameState.fighters = game.specificGameState.fighters.map(fighter => fighter.owner === first ? { ...fighter, hp: 0 } : fighter);
        const ended = endTurnBy("a");
        await play(game, ended);
        expect((ended as RealmArenaEndTurn).recordedEnemyActions?.every(action => battleOf(game).fighters[action.fighter].owner === second)).toBe(true);
        expect(game.specificGameState.coop?.nextWarband).toBe(0);
    });

    it("records that no warband took a turn when the battle is over first, so a replay never plans one", async () => {
        const game = makeGame(["a", "b"], {}, false, "realm");
        await musterAll(game);
        game.specificGameState.fighters = game.specificGameState.fighters.map(fighter => isWarband(fighter.owner) ? { ...fighter, hp: 0 } : fighter);
        const ended = endTurnBy("a");
        await play(game, ended);
        expect((ended as RealmArenaEndTurn).recordedEnemyActions).toEqual([]);
        expect(game.complete).toBe(true);
    });

    it("ends there when the planner throws, and the player's End turn still stands", async () => {
        const first = warbandOwner(0);
        const game = makeGame(["a", "b"], {}, false, "realm");
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
        const game = makeGame(["a", "b"], {}, true, "realm");
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
        const game = makeGame(["a", "b"], {}, true, "realm", true);
        await musterAll(game);
        for (const viewer of ["a", "b", null]) {
            const wire = gameStateToModel(game.specificGameState, viewer, null);
            expect(wire.coop).toBe(true);
            expect(JSON.stringify(wire)).not.toMatch(/enemy|nextWarband|"realm"/);
        }
    });

    it("is everything once the fog has lifted, and everything without it", async () => {
        const game = makeGame(["a", "b"], {}, false, "realm");
        await musterAll(game);
        const { outcome } = await play(game, endTurnBy("a"));
        // All but the End turn's parts, which are the recap's (§29.9).
        const { enemy, started, ...told } = outcome as IRealmArenaOutcome;
        expect(enemy?.steps.length).toBeGreaterThan(0);
        expect(started).toEqual([]);
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
                    const battle = await coopBattle(players, enemy, fog);
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
            const { game } = await coopBattle(TEAMS[seed % 2], "realm");
            // The ending says what the standings do.
            expect(game.endReason).toBe(enemyWon(game) ? "teamloss" : "teamwin");
            if (enemyWon(game)) won++;
        }
        expect(won).toBeGreaterThanOrEqual(19);
    }, 120_000);

    it("replays a recorded battle to the same end without asking the planner", async () => {
        seedRolls(7);
        const { game } = await coopBattle(["a", "b"], "realm", true);
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
    const game = makeGame(["a", "b"], {}, false, "realm");
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
        const game = makeGame(["a", "b"], {}, false, "realm");
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
        const game = makeGame(["a", "b"], {}, false, "realm");
        await musterAll(game);
        const ended = endTurnBy("a");
        await play(game, ended);
        const actions = (ended as RealmArenaEndTurn).recordedEnemyActions ?? [];
        const rows = await buildAllEvents(game, NAMES);
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
        const { game } = await coopBattle(["a", "b"], "realm");
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
    }, 60_000);
});
