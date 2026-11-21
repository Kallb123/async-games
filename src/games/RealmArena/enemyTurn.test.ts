import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { buildAllEvents } from "@/utils/games/recap";
import { isCommandForGameType } from "@/utils/games/gameCommands";
import { isComputerTurn } from "@/utils/games/computerTurns";
import { gameStateToModel, stepOutcomeToModel } from "./RealmArenaModels";
import { ENEMY_TURN_COMMAND_VERSION, RealmArenaEndTurn, RealmArenaGameType, RealmArenaWarbandTurn, enemyTurnsOf, type IRealmArenaOutcome } from "./RealmArenaLogic";
import { squadSight, warbandOwner, type BattleEvent } from "./rules";
import {
    actBy, battleOf, endTurnBy, makeGame, musterAll, play, playOne, recordedWarbandActions, scriptedAction, warbandTurnBy, type RealmArenaTestGame,
} from "./testFixtures";
import { seedRolls } from "./seedRolls";

// docs/games/realm-arena-hold-out.md §3: the enemy's turn is a command of its
// own. An End turn (command version 13) hands the turn to the warband that is
// due, and a server-only `RealmArenaWarbandTurn` plays it and hands on; an End
// turn stamped 12 or older still plays the warbands inline, as it was recorded.

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));

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

const HOLD_OUT = { enemy: "realm", mission: "holdOut" } as const;
const NAMES: Record<string, string> = { a: "Alice", b: "Bob", c: "Cat" };
const OLD_VERSION = ENEMY_TURN_COMMAND_VERSION - 1;
/** An End turn stamped as a client of `version` sends it. */
const endTurnAt = (sender: string, version: number) => Object.assign(endTurnBy(sender), { version });

async function battle(settings: { fog?: boolean; teamBlocks?: boolean } = {}, players = ["a", "b"]): Promise<RealmArenaTestGame> {
    const { teamBlocks, ...rest } = settings;
    const game = makeGame(players, {}, { ...rest, coop: { ...HOLD_OUT, ...teamBlocks ? { teamBlocks: true as const } : {} } });
    await musterAll(game);
    return game;
}

const classes = (game: RealmArenaTestGame) => game.gameState.commandHistory.map(command => command.className);
const warbandCommands = (game: RealmArenaTestGame) => game.gameState.commandHistory.filter((command): command is RealmArenaWarbandTurn => command.className === "RealmArenaWarbandTurn");
/** The warband characters' state, as nothing but its own turn could change it. */
const warbandsNow = (game: RealmArenaTestGame) => JSON.stringify(battleOf(game).fighters.filter(fighter => fighter.owner.startsWith("ai:")));

describe("an End turn that hands to the warband (§3.2)", () => {
    it("plays nothing of the enemy's: the turn goes to the warband's seat, with its turn due", async () => {
        const game = await battle();
        const before = warbandsNow(game);
        const ended = endTurnBy("a");
        const { outcome } = await playOne(game, ended);
        expect(outcome).toMatchObject({ validMove: true, turnOver: true });
        expect(game.currentTurn).toBe(warbandOwner(0));
        expect(game.specificGameState.warbandDue).toEqual({ warband: 0, from: "a" });
        expect(isComputerTurn(game)).toBe(true);
        // No warband character moved, spent AP or went on watch.
        expect(warbandsNow(game)).toBe(before);
        expect(game.specificGameState.coop?.nextWarband).toBe(0);
        expect(game.specificGameState.roundsPlayed).toBe(0);
        // Nothing of the enemy is in its outcome, and nothing is recorded for it on it.
        const told = outcome as IRealmArenaOutcome;
        expect(told.recap?.enemy).toBeUndefined();
        expect(enemyTurnsOf(told.recap)).toEqual([]);
        expect(told.events.every(event => !("fighter" in event) || !battleOf(game).fighters[(event as { fighter: number }).fighter]?.owner.startsWith("ai:"))).toBe(true);
        for (const field of ["recordedEnemyActions", "recordedMoreEnemyActions", "recordedRolls"]) expect(ended).not.toHaveProperty(field);
        expect(game.gameState.commandHistory.at(-1)).toBe(ended);
    });

    it("hands the same way in a block: only after the last player, and to the first warband standing", async () => {
        const game = await battle({ teamBlocks: true });
        expect((await playOne(game, endTurnBy("a"))).outcome.validMove).toBe(true);
        expect(game.currentTurn).toBe("b");
        expect(game.specificGameState.warbandDue).toBeUndefined();
        expect((await playOne(game, endTurnBy("b"))).outcome.validMove).toBe(true);
        expect(game.currentTurn).toBe(warbandOwner(0));
        expect(game.specificGameState.warbandDue).toEqual({ warband: 0, from: "b" });
        // The round hasn't turned: the block is still to play.
        expect(game.specificGameState.roundsPlayed).toBe(0);
    });

    it("hands to no warband when the battle is over first (Hold the Centre, the enemy wiped out)", async () => {
        const over = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        await musterAll(over);
        over.specificGameState.fighters = over.specificGameState.fighters.map(fighter => fighter.owner.startsWith("ai:") ? { ...fighter, hp: 0 } : fighter);
        const { computer } = await play(over, endTurnBy("a"));
        expect(computer).toEqual([]);
        expect(over.complete).toBe(true);
        expect(over.specificGameState.warbandDue).toBeUndefined();
    });
});

describe("the warbands' commands one after another (§3.5)", () => {
    it("alternates: a warband's command after each player's End turn, each recorded with its actions, and the round turns after the last", async () => {
        const game = await battle();
        const first = await play(game, endTurnBy("a"));
        expect(first.computer).toHaveLength(1);
        expect(game.currentTurn).toBe("b");
        expect(game.specificGameState.warbandDue).toBeUndefined();
        const second = await play(game, endTurnBy("b"));
        expect(second.computer).toHaveLength(1);
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.roundsPlayed).toBe(1);
        expect(classes(game).slice(-4)).toEqual(["RealmArenaEndTurn", "RealmArenaWarbandTurn", "RealmArenaEndTurn", "RealmArenaWarbandTurn"]);
        const [one, two] = warbandCommands(game);
        expect([one.senderId, two.senderId]).toEqual([warbandOwner(0), warbandOwner(1)]);
        expect(one.recordedActions!.length).toBeGreaterThan(0);
        expect(two.recordedActions!.length).toBeGreaterThan(0);
        // Each command is outcome-shaped as an End turn's was, a turn over that hands on.
        for (const { outcome } of [...first.computer, ...second.computer]) expect(outcome).toMatchObject({ validMove: true, turnOver: true, timerRestarts: true });
        expect(enemyTurnsOf((first.computer[0].outcome as IRealmArenaOutcome).recap).map(turn => turn.owner)).toEqual([warbandOwner(0)]);
        expect(enemyTurnsOf((second.computer[0].outcome as IRealmArenaOutcome).recap).map(turn => turn.owner)).toEqual([warbandOwner(1)]);
    });

    it("plays a block as one command a warband, after the last player, and skips a warband wiped out", async () => {
        const game = await battle({ teamBlocks: true });
        game.specificGameState.fighters = game.specificGameState.fighters.map(fighter => fighter.owner === warbandOwner(0) ? { ...fighter, hp: 0 } : fighter);
        expect((await play(game, endTurnBy("a"))).computer).toEqual([]);
        const { computer } = await play(game, endTurnBy("b"));
        expect(computer).toHaveLength(1);
        expect(warbandCommands(game).map(command => command.senderId)).toEqual([warbandOwner(1)]);
        expect(game.currentTurn).toBe("a");
        expect(game.specificGameState.roundsPlayed).toBe(1);

        const both = await battle({ teamBlocks: true });
        await play(both, endTurnBy("a"));
        const played = await play(both, endTurnBy("b"));
        expect(played.computer).toHaveLength(2);
        expect(warbandCommands(both).map(command => command.senderId)).toEqual([warbandOwner(0), warbandOwner(1)]);
        expect(classes(both).slice(-4)).toEqual(["RealmArenaEndTurn", "RealmArenaEndTurn", "RealmArenaWarbandTurn", "RealmArenaWarbandTurn"]);
        expect(both.currentTurn).toBe("a");
        expect(both.specificGameState.roundsPlayed).toBe(1);
        // The first of the block hands to the next, and only the last hands to the player.
        expect(played.computer.map(({ outcome }) => outcome.turnOver)).toEqual([true, true]);
    });

    it.each([
        ["alternating", false, ["a", "b"]],
        ["a block of turns", true, ["a", "b"]],
        ["a block of three", true, ["a", "b", "c"]],
    ] as const)("lands the turn on the same player and the same round as an End turn that played them inline did: %s", async (_name, teamBlocks, players) => {
        const play13 = async (version: number) => {
            seedRolls(21);
            const game = await battle({ teamBlocks }, [...players]);
            const seen: string[] = [];
            for (let turn = 0; turn < players.length * 3 && !game.complete; turn++) {
                const player = game.currentTurn;
                const mover = game.specificGameState.fighters.find(fighter => fighter.owner === player && fighter.ap > 0 && scriptedAction(game, fighter));
                if (mover) await play(game, actBy(player, scriptedAction(game, mover)!));
                await play(game, endTurnAt(player, version));
                seen.push(`${game.currentTurn}:${game.specificGameState.roundsPlayed}`);
            }
            return { game, seen };
        };
        const now = await play13(ENEMY_TURN_COMMAND_VERSION);
        const before = await play13(OLD_VERSION);
        expect(now.seen).toEqual(before.seen);
        expect(now.game.specificGameState.roundsPlayed).toBe(before.game.specificGameState.roundsPlayed);
        // And the battle itself: the same warbands moved the same way.
        expect(battleOf(now.game).fighters).toEqual(battleOf(before.game).fighters);
        expect(now.game.specificGameState.scores).toEqual(before.game.specificGameState.scores);
        // Played inline, the old End turns hold what the warbands did; the new have commands of their own.
        expect(recordedWarbandActions(now.game)).toEqual(recordedWarbandActions(before.game));
        expect(warbandCommands(now.game).length).toBeGreaterThan(0);
        expect(warbandCommands(before.game)).toEqual([]);
    }, 60_000);
});

describe("a warband's command is the server's alone (§3.5)", () => {
    it("is refused when it isn't that warband's turn, when nothing is due, and when sent for the wrong seat", async () => {
        const game = await battle();
        // Nothing is due, and it is a player's turn.
        for (const sender of [warbandOwner(0), warbandOwner(1), "a"]) {
            expect((await playOne(game, warbandTurnBy(sender))).outcome.validMove, `nothing due, sent as ${sender}`).toBe(false);
        }
        expect(game.currentTurn).toBe("a");

        await playOne(game, endTurnBy("a"));
        expect(game.currentTurn).toBe(warbandOwner(0));
        const before = warbandsNow(game);
        // Due, but from the other warband, a player or a stranger.
        for (const sender of [warbandOwner(1), "a", "b", "nobody"]) {
            expect((await playOne(game, warbandTurnBy(sender))).outcome.validMove, `due ${warbandOwner(0)}, sent as ${sender}`).toBe(false);
        }
        expect(game.currentTurn).toBe(warbandOwner(0));
        expect(game.specificGameState.warbandDue).toEqual({ warband: 0, from: "a" });
        expect(warbandsNow(game)).toBe(before);
        expect(warbandCommands(game)).toEqual([]);
        // The right seat plays it.
        expect((await playOne(game, warbandTurnBy(warbandOwner(0)))).outcome.validMove).toBe(true);
    });

    it("is refused once the turn is a player's again, however it is sent", async () => {
        const game = await battle();
        await play(game, endTurnBy("a"));
        expect(game.currentTurn).toBe("b");
        expect((await playOne(game, warbandTurnBy(warbandOwner(0)))).outcome.validMove).toBe(false);
        expect((await playOne(game, warbandTurnBy(warbandOwner(1)))).outcome.validMove).toBe(false);
    });

    it("is refused in a free-for-all and after the battle", async () => {
        const free = makeGame();
        await musterAll(free);
        expect((await playOne(free, warbandTurnBy(warbandOwner(0)))).outcome.validMove).toBe(false);
        const done = await battle();
        await playOne(done, endTurnBy("a"));
        done.complete = true;
        expect((await playOne(done, warbandTurnBy(warbandOwner(0)))).outcome.validMove).toBe(false);
    });

    it("is no command a client may send", () => {
        expect(isCommandForGameType("RealmArenaGameType", "RealmArenaWarbandTurn")).toBe(false);
        expect(isCommandForGameType("RealmArenaGameType", "RealmArenaEndTurn")).toBe(true);
    });
});

describe("a replay of the warbands' commands (§3.4, §3.5)", () => {
    /** A timeline of the battle for `viewer`, replayed with the planner broken and no randomness to ask for. */
    async function replayed(game: RealmArenaTestGame, viewer: string | null) {
        planner.broken = true;
        planner.calls = 0;
        const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("replay consumed randomness"); });
        try {
            const timeline = await buildTimeline(game, NAMES, [], undefined, viewer);
            expect(planner.calls).toBe(0);
            return timeline.snapshots[timeline.currentIndex];
        } finally {
            random.mockRestore();
            planner.broken = false;
        }
    }

    /** A few rounds played live as the server plays them, the End turns stamped `version`. */
    async function played(settings: { fog?: boolean; teamBlocks?: boolean }, version: number, players = ["a", "b"]) {
        seedRolls(33);
        const game = await battle(settings, players);
        for (let turn = 0; turn < players.length * 4 && !game.complete; turn++) {
            const player = game.currentTurn;
            const mover = game.specificGameState.fighters.find(fighter => fighter.owner === player && fighter.ap > 0 && scriptedAction(game, fighter));
            if (mover) await play(game, actBy(player, scriptedAction(game, mover)!));
            await play(game, endTurnAt(player, version));
        }
        return game;
    }

    it.each([
        ["alternating", { fog: false }],
        ["alternating, in fog", { fog: true }],
        ["a block, in fog", { fog: true, teamBlocks: true }],
    ])("lands a version-13 battle on exactly the live state without asking the planner: %s", async (_name, settings) => {
        const game = await played(settings, ENEMY_TURN_COMMAND_VERSION);
        expect(warbandCommands(game).length).toBeGreaterThan(3);
        // The End turns carry nothing of the enemy: the commands after them do.
        expect(recordedWarbandActions(game).length).toBeGreaterThan(0);
        expect(game.gameState.commandHistory.filter(command => command.className === "RealmArenaEndTurn").every(command => !("recordedEnemyActions" in command))).toBe(true);
        const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
        for (const viewer of [null, "a", "b"]) {
            const last = await replayed(game, viewer);
            expect(last.specificGameState, `for ${viewer}`).toEqual(gameStateToModel(game.specificGameState, viewer, lastId, game.complete));
        }
    }, 60_000);

    it.each([
        ["alternating", { fog: true }],
        ["a block", { fog: false, teamBlocks: true }],
    ])("still replays a version-12 battle as it was recorded, its End turns holding the warbands' turns: %s", async (_name, settings) => {
        const game = await played(settings, OLD_VERSION);
        // Played inline: no command of the warbands', and what they did on the End turns.
        expect(warbandCommands(game)).toEqual([]);
        expect(game.gameState.commandHistory.filter(command => command.className === "RealmArenaEndTurn").some(command => ((command as RealmArenaEndTurn).recordedEnemyActions ?? []).length > 0)).toBe(true);
        expect(game.currentTurn).not.toMatch(/^ai:/);
        const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
        for (const viewer of [null, "a"]) {
            const last = await replayed(game, viewer);
            expect(last.specificGameState, `for ${viewer}`).toEqual(gameStateToModel(game.specificGameState, viewer, lastId, game.complete));
        }
    }, 60_000);

    it("replays a battle that changed command version mid-way: the old End turns inline, the new ones with commands of their own", async () => {
        seedRolls(35);
        const game = await battle();
        for (let turn = 0; turn < 6; turn++) await play(game, endTurnAt(game.currentTurn, turn < 3 ? OLD_VERSION : ENEMY_TURN_COMMAND_VERSION));
        expect(warbandCommands(game)).toHaveLength(3);
        const lastId = game.gameState.commandHistory.at(-1)?.id ?? null;
        const last = await replayed(game, "a");
        expect(last.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", lastId, false));
    }, 60_000);
});

describe("what each viewer is told of a warband's command in fog of war (§3.3, §3.5)", () => {
    it("is only what their side saw: the End turn tells nothing of the enemy, and the command's step is cut to their sight", async () => {
        const game = await battle({ fog: true });
        const ended = await play(game, endTurnBy("a"));
        const battleNow = battleOf(game);
        const enemyMoves = (events: readonly BattleEvent[]) => events.filter(event => event.kind === "moved" && battleNow.fighters[event.fighter].owner === warbandOwner(0));
        // The End turn's own step tells no move of the warband's, to anyone.
        for (const viewer of ["a", "b", null]) {
            expect(enemyMoves((stepOutcomeToModel(ended.outcome, viewer, game.specificGameState)?.events ?? []) as BattleEvent[])).toEqual([]);
        }
        const { outcome } = ended.computer[0];
        const all = (outcome as IRealmArenaOutcome).events;
        expect(enemyMoves(all).some(event => event.kind === "moved" && event.path.length > 0)).toBe(true);
        for (const viewer of ["a", "b"]) {
            const seen = squadSight(battleNow, viewer);
            const told = stepOutcomeToModel(outcome, viewer, game.specificGameState)?.events ?? [];
            for (const event of enemyMoves(told as BattleEvent[])) if (event.kind === "moved") expect(event.path.every(seen)).toBe(true);
            // The response a player is sent for it is the same, less a shot's roll.
            const sent = (new RealmArenaGameType().outcomeFor(game, outcome, viewer) as IRealmArenaOutcome).events;
            expect(told).toEqual(sent.map(event => event.kind === "shot" || event.kind === "struck" ? (({ roll: _roll, ...rest }) => rest)(event) : event));
            expect(sent).not.toEqual(all);
        }
        const nobody = stepOutcomeToModel(outcome, null, game.specificGameState)?.events ?? [];
        expect(enemyMoves(nobody as BattleEvent[]).every(event => event.kind === "moved" && event.path.length === 0)).toBe(true);
    });

    it("is everything without fog, and the fog lifts from it once the battle is over", async () => {
        const open = await battle();
        const { computer } = await play(open, endTurnBy("a"));
        const raw = computer[0].outcome as IRealmArenaOutcome;
        for (const viewer of ["a", "b"]) {
            const { recap: _recap, ...told } = raw;
            expect(new RealmArenaGameType().outcomeFor(open, computer[0].outcome, viewer)).toEqual(told);
        }

        const fogged = await battle({ fog: true });
        const step = await play(fogged, endTurnBy("a"));
        const lifted = stepOutcomeToModel(step.computer[0].outcome, "a", fogged.specificGameState, true)!;
        expect(lifted.events.length).toBe((step.computer[0].outcome as IRealmArenaOutcome).events.length);
    });
});

describe("the recap of a warband's command (§3.3, §3.5)", () => {
    it("gives its actions their rows, keyed to the command, and no 'ended their turn' row of a player's above them", async () => {
        const game = await battle();
        const ended = endTurnBy("a");
        await play(game, ended);
        const warband = warbandCommands(game)[0];
        const rows = await buildAllEvents(game, NAMES, "a");
        const own = rows.filter(row => row.id.startsWith(warband.id));
        const actions = rows.filter(row => new RegExp(`^${warband.id}:enemy:\\d+$`).test(row.id));
        expect(actions).toHaveLength(warband.recordedActions!.length);
        expect(own.every(row => row.actorId === warbandOwner(0))).toBe(true);
        // The only "ended their turn" in the log is Alice's own, from her own command.
        expect(rows.filter(row => /ended their turn/.test(row.title)).map(row => row.id)).toEqual([ended.id]);
        // And a row of hers sits above the warband's, never inside it.
        expect(rows.findIndex(row => row.id === ended.id)).toBeLessThan(rows.findIndex(row => row.id === own[0].id));
    });

    it("gives each warband of a block its own rows", async () => {
        const game = await battle({ teamBlocks: true });
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        const rows = await buildAllEvents(game, NAMES, "a");
        for (const [index, command] of warbandCommands(game).entries()) {
            const actions = rows.filter(row => row.id.startsWith(`${command.id}:enemy`));
            expect(actions, `warband ${index}`).toHaveLength(command.recordedActions!.length);
            expect(actions.every(row => row.actorId === warbandOwner(index))).toBe(true);
        }
        expect(rows.filter(row => /ended their turn/.test(row.title))).toHaveLength(2);
    });
});
