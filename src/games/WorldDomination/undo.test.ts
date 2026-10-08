import { describe, expect, it } from "vitest";
import { undoableCommandsIn } from "@/utils/testing/undoableCommands";
import {
    WorldDominationAttack,
    WorldDominationCashInCards,
    WorldDominationDeployArmies,
    WorldDominationEndAttackPhase,
    WorldDominationEndTurn,
    WorldDominationFortify,
    WorldDominationGameType,
    WorldDominationOccupyTerritory,
    WorldDominationSkipFortify,
    WorldDominationUndo,
    worldDominationUnrecordedHoldEnd,
} from "./WorldDominationLogic";
import { gameStateToResponse } from "./WorldDominationModels";
import type { IWorldDominationGameData, IWorldDominationSpecificGameState } from "./WorldDominationModels";
import {
    UNDO_STACK_DEPTH,
    cloneWorldDominationState,
    computeReinforcement,
    startingArmiesForPlayerCount,
    type IWorldDominationCard,
} from "./board";
import { makeState, makeTerritories, player } from "./testFixtures";
import { consumedRandomness } from "@/utils/apiModels/gameCommand";
import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import { getPlayerDropoutAdapter, nextActivePlayer } from "@/utils/games/playerDropout";
import { buildTimeline } from "@/utils/games/replay";
import { buildEventFeed } from "@/utils/games/recap";
import { undoEntryFor } from "@/utils/games/undo";

// docs/undo.md's ninth game. A World Domination player can take back a
// deployment, a card cash-in, the army count they move into a territory they
// just conquered, and the end of their attacks — never a battle, which is dice.
// A fortify, a skipped fortify and the last placement of setup each end the
// turn, so they hold it open for ten seconds (§5) and WorldDominationEndTurn
// closes the hold.

const PLAYERS = ["u1", "u2"];
const NAMES = { u1: "Alice", u2: "Bob" };
const TURN_STARTED = "2026-10-01T08:00:00.000Z";
const ALASKA = 0;
const NORTHWEST = 1;
const KAMCHATKA = 29;

function card(id: string, type: IWorldDominationCard["type"], territoryId: number | null = null): IWorldDominationCard {
    return { id, type, territoryId };
}

/** u1 owns the map but for Kamchatka (1 army) and territory 30 (3), which are u2's; Alaska holds 5. */
function makeGame(overrides: Partial<IWorldDominationSpecificGameState> = {}): IWorldDominationGameData {
    const gs = makeState({
        territories: makeTerritories("u1", {
            [ALASKA]: { owner: "u1", armies: 5 },
            [KAMCHATKA]: { owner: "u2", armies: 1 },
            30: { owner: "u2", armies: 3 },
        }),
        ...overrides,
    });
    return {
        gameId: "g",
        gameType: new WorldDominationGameType(),
        currentTurn: "u1",
        userIdList: PLAYERS,
        turnTimer: "1d",
        lastTurnTimestamp: TURN_STARTED,
        gameState: { turnOrder: [...PLAYERS], history: [], commandHistory: [] },
        specificGameState: gs,
        initialSpecificGameState: cloneWorldDominationState(gs, PLAYERS),
        complete: false,
        winner: "",
    } as unknown as IWorldDominationGameData;
}

function sent<T extends IGameCommand>(command: T, senderId = "u1"): T {
    command.senderId = senderId;
    command.senderUsername = NAMES[senderId as "u1" | "u2"];
    return command;
}

const deploy = (territoryId: number, count = 1, sender = "u1") => {
    const c = sent(new WorldDominationDeployArmies(), sender);
    c.territoryId = territoryId;
    c.count = count;
    return c;
};
const cashIn = (...cardIds: string[]) => {
    const c = sent(new WorldDominationCashInCards());
    c.cardIds = cardIds;
    return c;
};
/** An attack with its dice pre-recorded, so the battle is deterministic. */
const attack = (from: number, to: number, attackerDice: number[], defenderDice: number[]) => {
    const c = sent(new WorldDominationAttack());
    c.fromTerritoryId = from;
    c.toTerritoryId = to;
    c.attackerDiceCount = attackerDice.length;
    c.recordedAttackerDice = attackerDice;
    c.recordedDefenderDice = defenderDice;
    return c;
};
const occupy = (armies: number) => {
    const c = sent(new WorldDominationOccupyTerritory());
    c.armies = armies;
    return c;
};
const fortify = (from: number, to: number, armies: number) => {
    const c = sent(new WorldDominationFortify());
    c.fromTerritoryId = from;
    c.toTerritoryId = to;
    c.armies = armies;
    return c;
};
const endAttack = () => sent(new WorldDominationEndAttackPhase());
const skip = () => sent(new WorldDominationSkipFortify());
const endTurn = (sender = "u1") => sent(new WorldDominationEndTurn(), sender);
const undo = (sender = "u1") => sent(new WorldDominationUndo(), sender);

function run(game: IWorldDominationGameData, command: IGameCommand) {
    return runCommand(game, new WorldDominationGameType(), command);
}

async function play(game: IWorldDominationGameData, ...commands: IGameCommand[]) {
    for (const command of commands) {
        const { outcome } = await run(game, command);
        expect(outcome.validMove, `${command.className} should be accepted`).toBe(true);
    }
}

const refused = async (game: IWorldDominationGameData, command: IGameCommand) => !(await run(game, command)).outcome.validMove;

function armies(game: IWorldDominationGameData, territoryId: number): number {
    return game.specificGameState.territories[territoryId].armies;
}

function seat(game: IWorldDominationGameData, userId = "u1") {
    return game.specificGameState.playerStates.get(userId)!;
}

/** What CreateDataResponse sends `viewerId` — the same `undoEntryFor` test it runs. */
function wireFor(game: IWorldDominationGameData, viewerId: string | null) {
    return gameStateToResponse(game.specificGameState, NAMES, viewerId, undoEntryFor(game, viewerId) !== null);
}

describe("World Domination — taking a move back", () => {
    it("takes a deployment back: the armies, the pool and the running total", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 3 });
        await play(game, deploy(ALASKA, 2));
        expect(armies(game, ALASKA)).toBe(7);

        const { outcome } = await run(game, undo());
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(armies(game, ALASKA)).toBe(5);
        expect(game.specificGameState.reinforcementsRemaining).toBe(3);
        expect(seat(game).totalArmiesDeployed).toBe(0);
        expect(game.gameState.history[0].text).toBe("{{u1}} took back their last move");
        // Back where it was: the same placement can be made again.
        await play(game, deploy(ALASKA, 3));
    });

    it("takes the placement that moved Reinforce on into Attack back too", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 1 });
        await play(game, deploy(ALASKA));
        expect(game.specificGameState.phase).toBe("attack");

        await play(game, undo());
        expect(game.specificGameState.phase).toBe("reinforce");
        expect(game.specificGameState.reinforcementsRemaining).toBe(1);
    });

    it("takes a card cash-in back: the cards, the value of the next set and the bonus armies", async () => {
        const hand = [card("a", "infantry", 5), card("b", "infantry"), card("c", "infantry")];
        const game = makeGame({ phase: "reinforce", playerStates: new Map([["u1", player({ cards: hand })], ["u2", player()]]) });
        await play(game, cashIn("a", "b", "c"));
        expect(seat(game).cards).toHaveLength(0);
        expect(game.specificGameState.reinforcementsRemaining).toBe(4);
        expect(armies(game, 5)).toBe(5);

        await play(game, undo());
        expect(seat(game).cards.map(c => c.id)).toEqual(["a", "b", "c"]);
        expect(game.specificGameState.cardSetsCashedIn).toBe(0);
        expect(game.specificGameState.reinforcementsRemaining).toBe(0);
        expect(armies(game, 5)).toBe(3);
        // Taken back, so cashing in again pays the same first-set value, not the second.
        await play(game, cashIn("a", "b", "c"));
        expect(game.specificGameState.reinforcementsRemaining).toBe(4);
    });

    it("takes an occupation back to the choice, leaving the conquest — and the roll — made", async () => {
        const game = makeGame({ phase: "attack" });
        await play(game, attack(ALASKA, KAMCHATKA, [6], [1]), occupy(3));
        expect(armies(game, KAMCHATKA)).toBe(3);

        await play(game, undo());
        const gs = game.specificGameState;
        expect(gs.pendingOccupation).toEqual({ fromTerritoryId: ALASKA, toTerritoryId: KAMCHATKA, minArmies: 1 });
        expect(gs.territories[KAMCHATKA].owner).toBe("u1");
        expect(armies(game, KAMCHATKA)).toBe(0);
        expect(armies(game, ALASKA)).toBe(5);
        expect(gs.lastBattle).toMatchObject({ attackerDice: [6], defenderDice: [1], conquered: true });
        // A different choice can be made now.
        await play(game, occupy(1));
        expect(armies(game, KAMCHATKA)).toBe(1);
    });

    it("takes the end of the attacks back", async () => {
        const game = makeGame({ phase: "attack" });
        await play(game, endAttack());
        expect(game.specificGameState.phase).toBe("fortify");

        await play(game, undo());
        expect(game.specificGameState.phase).toBe("attack");
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
    });

    it("takes a fortify back, and the hold with it", async () => {
        const game = makeGame({ phase: "fortify" });
        await play(game, fortify(ALASKA, NORTHWEST, 2));
        expect(armies(game, NORTHWEST)).toBe(5);

        await play(game, undo());
        const gs = game.specificGameState;
        expect(armies(game, ALASKA)).toBe(5);
        expect(armies(game, NORTHWEST)).toBe(3);
        expect(gs.fortifyUsed).toBe(false);
        expect(gs.autoEndTurnAt).toBeNull();
        expect(game.currentTurn).toBe("u1");
        // And a different fortify can be made.
        await play(game, fortify(ALASKA, NORTHWEST, 1));
    });

    it("takes a skipped fortify back", async () => {
        const game = makeGame({ phase: "fortify" });
        await play(game, skip());
        await play(game, undo());
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
        expect(game.specificGameState.fortifyUsed).toBe(false);
        await play(game, fortify(ALASKA, NORTHWEST, 1));
    });

    it("unwinds a run of single-army placements one at a time, as deep as the stack goes", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: UNDO_STACK_DEPTH + 3 });
        for (let i = 0; i < UNDO_STACK_DEPTH + 2; i++) await play(game, deploy(ALASKA));
        expect(game.specificGameState.undoStack).toHaveLength(UNDO_STACK_DEPTH);

        for (let i = 0; i < UNDO_STACK_DEPTH; i++) await play(game, undo());
        // The oldest two fell off the end: only reach is lost, never correctness.
        expect(armies(game, ALASKA)).toBe(5 + 2);
        expect(await refused(game, undo())).toBe(true);
    });

    it("restores from a copy, not a view — a later change to the live state can't reach the snapshot", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 2 });
        await play(game, deploy(ALASKA));
        game.specificGameState.territories[NORTHWEST].armies = 99;
        seat(game, "u2").cards.push(card("late", "wild"));

        await play(game, undo());
        expect(armies(game, NORTHWEST)).toBe(3);
        expect(seat(game, "u2").cards).toHaveLength(0);
    });
});

describe("World Domination — combat can never be taken back", () => {
    it("empties the stack: a deployment before the roll can't be reached after it", async () => {
        const game = makeGame({ phase: "attack", reinforcementsRemaining: 2 });
        await play(game, deploy(ALASKA, 2));
        expect(game.specificGameState.undoStack).toHaveLength(1);

        await play(game, attack(ALASKA, KAMCHATKA, [6], [1]));
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(game.specificGameState.undoAnchorId).toBeNull();
        expect(wireFor(game, "u1").canUndo).toBe(false);
        expect(await refused(game, undo())).toBe(true);
        expect(armies(game, ALASKA)).toBe(7);
    });

    it("keeps a snapshot from before the roll out of reach of a chain of undos after it", async () => {
        // Deploy, battle (conquest), occupy: undoing the occupation is the one
        // thing that can be taken back — a second undo would reach the deploy,
        // and with it a second go at the dice.
        const game = makeGame({ phase: "attack", reinforcementsRemaining: 1 });
        await play(game, deploy(ALASKA), attack(ALASKA, KAMCHATKA, [6], [1]), occupy(2));
        await play(game, undo());
        expect(game.specificGameState.pendingOccupation).not.toBeNull();
        expect(await refused(game, undo())).toBe(true);
        expect(game.specificGameState.territories[KAMCHATKA].owner).toBe("u1");
        expect(game.specificGameState.lastBattle).not.toBeNull();
    });

    it("never pushes a snapshot for the roll, and a lost battle can't be taken back", async () => {
        const game = makeGame({ phase: "attack" });
        await play(game, attack(ALASKA, KAMCHATKA, [1], [6]));
        expect(armies(game, ALASKA)).toBe(4);
        expect(game.specificGameState.undoStack).toEqual([]);
        expect(await refused(game, undo())).toBe(true);
        expect(armies(game, ALASKA)).toBe(4);
    });

    it("never undoes the battle that wins the game, which is settled by CheckGameOver", async () => {
        const game = makeGame({
            phase: "attack",
            territories: makeTerritories("u1", { [ALASKA]: { owner: "u1", armies: 5 }, [KAMCHATKA]: { owner: "u2", armies: 1 } }),
        });
        game.specificGameState.territories.forEach((t, id) => { if (id !== KAMCHATKA) t.owner = "u1"; });
        const { gameOver } = await run(game, attack(ALASKA, KAMCHATKA, [6], [1]));
        expect(gameOver).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.winner).toBe("u1");
        expect(game.specificGameState.undoStack).toEqual([]);
    });
});

describe("World Domination — who can take what back, and when", () => {
    it("refuses a player whose move it wasn't", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 2 });
        await play(game, deploy(ALASKA));
        expect(await refused(game, undo("u2"))).toBe(true);
        expect(armies(game, ALASKA)).toBe(6);
    });

    it("refuses once anything else has been recorded since — the anchor", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 2 });
        await play(game, deploy(ALASKA));
        game.gameState.commandHistory.push(sent(new WorldDominationEndAttackPhase()));
        expect(await refused(game, undo())).toBe(true);
        expect(armies(game, ALASKA)).toBe(6);
    });

    it("refuses with nothing to take back", async () => {
        expect(await refused(makeGame(), undo())).toBe(true);
    });

    it("refuses after the hand-off, to the player it was and to the one it passed to", async () => {
        const game = makeGame({ phase: "fortify" });
        await play(game, fortify(ALASKA, NORTHWEST, 1), endTurn());
        expect(game.currentTurn).toBe("u2");
        expect(await refused(game, undo("u1"))).toBe(true);
        expect(await refused(game, undo("u2"))).toBe(true);
        expect(armies(game, NORTHWEST)).toBe(4);
    });

    it("lets a second move build on the stack only while the first is still live", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 2 });
        await play(game, deploy(ALASKA));
        // A stale entry — the anchor has moved on without it — is not built on.
        game.gameState.commandHistory.push(sent(new WorldDominationEndAttackPhase()));
        await play(game, deploy(ALASKA));
        expect(game.specificGameState.undoStack).toHaveLength(1);
    });
});

describe("World Domination — the ten-second hold", () => {
    it("holds the turn after a fortify instead of handing it off, and draws nothing yet", async () => {
        const conquered = player({ conqueredTerritoryThisTurn: true });
        const game = makeGame({ phase: "fortify", cardDeck: [card("d1", "infantry")], playerStates: new Map([["u1", conquered], ["u2", player()]]) });
        const { outcome } = await run(game, fortify(ALASKA, NORTHWEST, 1));

        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(game.currentTurn).toBe("u1");
        expect(game.specificGameState.phase).toBe("fortify");
        expect(new Date(game.specificGameState.autoEndTurnAt!).getTime()).toBeGreaterThan(Date.now());
        expect(game.specificGameState.cardDeck).toHaveLength(1);
        expect(seat(game).cards).toHaveLength(0);
        expect(seat(game).conqueredTerritoryThisTurn).toBe(true);
    });

    it("holds a skipped fortify the same way", async () => {
        const game = makeGame({ phase: "fortify" });
        const { outcome } = await run(game, skip());
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();
        expect(game.currentTurn).toBe("u1");
    });

    it("refuses every other command while a hold is open — the move was the turn", async () => {
        for (const held of [fortify(ALASKA, NORTHWEST, 1), skip()]) {
            const game = makeGame({
                phase: "fortify",
                playerStates: new Map([["u1", player({ cards: [card("a", "infantry"), card("b", "infantry"), card("c", "infantry")] })], ["u2", player()]]),
            });
            await play(game, held);
            const gs = game.specificGameState;
            const before = JSON.stringify(cloneWorldDominationState(gs, PLAYERS), (_k, v) => (v instanceof Map ? [...v] : v));

            for (const command of [fortify(ALASKA, NORTHWEST, 1), skip(), endAttack(), deploy(ALASKA), cashIn("a", "b", "c"), attack(ALASKA, KAMCHATKA, [6], [1]), occupy(1)]) {
                expect(await refused(game, command), command.className).toBe(true);
            }
            expect(JSON.stringify(cloneWorldDominationState(gs, PLAYERS), (_k, v) => (v instanceof Map ? [...v] : v))).toBe(before);
            expect(gs.autoEndTurnAt).not.toBeNull();
        }
    });

    it("hands off on WorldDominationEndTurn: the card draw and the next player's reinforcements happen then", async () => {
        const game = makeGame({
            phase: "fortify",
            cardDeck: [card("d1", "infantry")],
            playerStates: new Map([["u1", player({ conqueredTerritoryThisTurn: true })], ["u2", player()]]),
        });
        await play(game, fortify(ALASKA, NORTHWEST, 1));
        const { outcome } = await run(game, endTurn());

        expect(outcome).toEqual({ validMove: true, turnOver: true });
        const gs = game.specificGameState;
        expect(game.currentTurn).toBe("u2");
        expect(gs.phase).toBe("reinforce");
        expect(gs.reinforcementsRemaining).toBe(computeReinforcement("u2", gs.territories));
        expect(seat(game).cards.map(c => c.id)).toEqual(["d1"]);
        expect(gs.cardDeck).toHaveLength(0);
        expect(seat(game).conqueredTerritoryThisTurn).toBe(false);
        expect(gs.fortifyUsed).toBe(false);
        expect(gs.autoEndTurnAt).toBeNull();
        expect(gs.undoStack).toEqual([]);
        expect(gs.undoAnchorId).toBeNull();
        expect(game.gameState.history.some(line => line.text.includes("drew a World Domination card"))).toBe(true);
        // Nothing is left to take back, for either player.
        expect(await refused(game, undo("u1"))).toBe(true);
        expect(await refused(game, undo("u2"))).toBe(true);
    });

    it("draws nothing for a fortify that was taken back", async () => {
        const game = makeGame({
            phase: "fortify",
            cardDeck: [card("d1", "infantry")],
            playerStates: new Map([["u1", player({ conqueredTerritoryThisTurn: true })], ["u2", player()]]),
        });
        await play(game, fortify(ALASKA, NORTHWEST, 1), undo());
        expect(game.specificGameState.cardDeck).toHaveLength(1);
        expect(seat(game).cards).toHaveLength(0);
        // The hold is gone with it, so there is nothing for the countdown to end.
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
        expect(await refused(game, endTurn())).toBe(true);
        expect(game.currentTurn).toBe("u1");
    });

    it("refuses WorldDominationEndTurn with no hold open, so it can't skip a turn", async () => {
        for (const phase of ["reinforce", "attack", "fortify"] as const) {
            const game = makeGame({ phase });
            expect(await refused(game, endTurn()), phase).toBe(true);
            expect(game.currentTurn).toBe("u1");
        }
        const setup = makeGame({ phase: "setup", reinforcementsRemaining: 2 });
        await play(setup, deploy(ALASKA));
        expect(await refused(setup, endTurn())).toBe(true);
    });

    it("refuses a player the hold doesn't belong to", async () => {
        const game = makeGame({ phase: "fortify" });
        await play(game, skip());
        expect(await refused(game, endTurn("u2"))).toBe(true);
        expect(await refused(game, undo("u2"))).toBe(true);
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();
    });

    it("holds the last placement of a setup allotment, and WorldDominationEndTurn advances setup exactly once", async () => {
        const game = makeGame({ phase: "setup", reinforcementsRemaining: 2 });
        // Armies still to place: no hold, and nothing to hand off yet.
        await play(game, deploy(ALASKA));
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
        expect(game.currentTurn).toBe("u1");

        const { outcome } = await run(game, deploy(ALASKA));
        expect(outcome).toEqual({ validMove: true, turnOver: false });
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();
        expect(game.currentTurn).toBe("u1");

        await play(game, endTurn());
        const gs = game.specificGameState;
        expect(game.currentTurn).toBe("u2");
        expect(gs.phase).toBe("setup");
        expect(gs.reinforcementsRemaining).toBe(startingArmiesForPlayerCount(2) - 2);
        expect(gs.autoEndTurnAt).toBeNull();
        // A second one — the hold is closed — is refused rather than advancing again.
        expect(await refused(game, endTurn())).toBe(true);
        expect(await refused(game, endTurn("u2"))).toBe(true);
        expect(game.currentTurn).toBe("u2");
    });

    it("moves on from the last seat's setup into Turn 1's Reinforce phase", async () => {
        const game = makeGame({ phase: "setup", reinforcementsRemaining: 1 });
        game.currentTurn = "u2";
        await play(game, deploy(KAMCHATKA, 1, "u2"), endTurn("u2"));
        expect(game.currentTurn).toBe("u1");
        expect(game.specificGameState.phase).toBe("reinforce");
    });

    it("takes the last setup placement back, and the hold with it", async () => {
        const game = makeGame({ phase: "setup", reinforcementsRemaining: 1 });
        await play(game, deploy(ALASKA));
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();

        await play(game, undo());
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
        expect(game.specificGameState.reinforcementsRemaining).toBe(1);
        expect(armies(game, ALASKA)).toBe(5);
        expect(await refused(game, endTurn())).toBe(true);
        await play(game, deploy(NORTHWEST));
    });

    it("goes stale when the turn timer passes the turn on without a command", async () => {
        // An expired World Domination turn with no hold open is the cron's plain
        // step: currentTurn stepped on and the clock restarted, with no command. In a two-seat
        // game that timed out twice the turn comes straight back round with the
        // fortify still the last command — it must not be undoable then, nor
        // lock its player out of the fortify phase they inherit.
        const game = makeGame({ phase: "fortify" });
        await play(game, fortify(ALASKA, NORTHWEST, 1));

        game.currentTurn = nextActivePlayer(game, "u1");
        game.lastTurnTimestamp = "2026-10-02T08:00:00.000Z";
        game.currentTurn = nextActivePlayer(game, "u2");
        game.lastTurnTimestamp = "2026-10-03T08:00:00.000Z";
        expect(game.currentTurn).toBe("u1");

        expect(await refused(game, undo())).toBe(true);
        expect(await refused(game, endTurn())).toBe(true);
        expect(wireFor(game, "u1").canUndo).toBe(false);
        expect(wireFor(game, "u1").autoEndTurnAt).toBeNull();
        // Not held, so the phase's own commands run again.
        await play(game, skip());
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();
    });

    it("never lets a deadline a timed-out turn left behind pass for the next move's own", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 2, autoEndTurnAt: "2026-09-30T08:00:00.000Z" });
        await play(game, deploy(ALASKA));
        expect(game.specificGameState.autoEndTurnAt).toBeNull();
        expect(wireFor(game, "u1").autoEndTurnAt).toBeNull();
    });

    it("leaves another player's live hold and stack alone when a seat drops out", async () => {
        // A drop is recorded in gameState, not specificGameState, and changes
        // nothing on the board, so there is nothing for a snapshot to undo and
        // nothing to clear: closing the hold here would let the holder fortify twice.
        const game = makeGame({ phase: "fortify" });
        await play(game, fortify(ALASKA, NORTHWEST, 1));
        const before = JSON.stringify(game.specificGameState);

        getPlayerDropoutAdapter("WorldDominationGameType")!.dropPlayer(game, "u2");

        expect(JSON.stringify(game.specificGameState)).toBe(before);
        expect(game.specificGameState.undoStack).toHaveLength(1);
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();
        expect(undoEntryFor(game, "u1")).not.toBeNull();
        expect(await refused(game, fortify(ALASKA, NORTHWEST, 1))).toBe(true);
        await play(game, endTurn());
        expect(game.currentTurn).toBe("u2");
    });
});

describe("World Domination — undo on the wire", () => {
    const BOB_CARD = card("bob-secret-card", "cavalry", 7);
    const DECK_CARD = card("top-of-the-deck", "artillery", 9);

    async function heldGame() {
        const game = makeGame({
            phase: "fortify",
            cardDeck: [DECK_CARD],
            playerStates: new Map([["u1", player({ cards: [card("alice-card", "infantry")] })], ["u2", player({ cards: [BOB_CARD] })]]),
        });
        await play(game, fortify(ALASKA, NORTHWEST, 1));
        return game;
    }

    it("tells only the mover, and only while their move is the last", async () => {
        const game = await heldGame();
        const mine = wireFor(game, "u1");
        expect(mine.canUndo).toBe(true);
        expect(mine.autoEndTurnAt).toBe(game.specificGameState.autoEndTurnAt);
        for (const viewerId of ["u2", null]) {
            expect(wireFor(game, viewerId).canUndo).toBe(false);
            expect(wireFor(game, viewerId).autoEndTurnAt).toBeNull();
        }

        await play(game, endTurn());
        expect(wireFor(game, "u1").canUndo).toBe(false);
        expect(wireFor(game, "u1").autoEndTurnAt).toBeNull();
    });

    it("offers undo with no countdown for a move that holds nothing", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 2 });
        await play(game, deploy(ALASKA));
        expect(wireFor(game, "u1").canUndo).toBe(true);
        expect(wireFor(game, "u1").autoEndTurnAt).toBeNull();
    });

    it("never sends the stack or the anchor, nor a hand or the deck out of the snapshot", async () => {
        const game = await heldGame();
        expect(game.specificGameState.undoStack).toHaveLength(1);
        for (const viewerId of ["u1", "u2", null]) {
            const wire = wireFor(game, viewerId);
            expect(wire).not.toHaveProperty("undoStack");
            expect(wire).not.toHaveProperty("undoAnchorId");
            const text = JSON.stringify(wire);
            expect(text).not.toContain("undoStack");
            // The snapshot holds every hand and the deck; none of it is on the wire.
            expect(text).not.toContain("top-of-the-deck");
            if (viewerId !== "u2") expect(text).not.toContain("bob-secret-card");
        }
    });
});

describe("World Domination — replay", () => {
    /** The live game's recorded log, as the match review would be handed it. */
    function replayable(live: IWorldDominationGameData, without: ReadonlySet<string> = new Set()): IWorldDominationGameData {
        return {
            ...live,
            currentTurn: live.currentTurn,
            gameState: { ...live.gameState, history: [], commandHistory: live.gameState.commandHistory.filter(c => !without.has(c.id)) },
        } as IWorldDominationGameData;
    }

    async function lastStep(game: IWorldDominationGameData) {
        return (await buildTimeline(game, NAMES)).snapshots.at(-1)!.specificGameState;
    }

    it("replays a turn with a move taken back in it, and a held turn passed, to the live table's state", async () => {
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 3, cardDeck: [card("d1", "infantry")] });
        const log = [
            deploy(ALASKA), undo(), deploy(NORTHWEST, 2), deploy(ALASKA),
            attack(ALASKA, KAMCHATKA, [6], [1]), occupy(2), undo(), occupy(1),
            endAttack(), undo(), endAttack(),
            fortify(ALASKA, NORTHWEST, 1), undo(), skip(), endTurn(),
            deploy(30, 1, "u2"),
        ];
        for (const command of log) {
            game.currentTurn = command.senderId;
            const { outcome } = await run(game, command);
            expect(outcome.validMove, command.className).toBe(true);
        }

        expect(await lastStep(replayable(game))).toEqual(wireFor(game, null));
        // u1 conquered, so the hand-off drew them the card.
        expect(seat(game).cards.map(c => c.id)).toEqual(["d1"]);
    });

    it("replays a game recorded before the hold — Fortify and SkipFortify ended the turn themselves", async () => {
        // The old log has no WorldDominationEndTurn: the fortify (or the skip)
        // handed the turn on in the same command, and the next recorded move is
        // the next player's. Played live under today's rules, then with the
        // hand-offs cut out, which is exactly the log those rules wrote.
        const game = makeGame({
            phase: "fortify",
            cardDeck: [card("d1", "infantry")],
            playerStates: new Map([["u1", player({ conqueredTerritoryThisTurn: true })], ["u2", player()]]),
        });
        const close = endTurn();
        for (const command of [fortify(ALASKA, NORTHWEST, 1), close, deploy(KAMCHATKA, 1, "u2")]) {
            game.currentTurn = command.senderId;
            expect((await run(game, command)).outcome.validMove, command.className).toBe(true);
        }

        const old = replayable(game, new Set([close.id]));
        expect(old.gameState.commandHistory.map(c => c.className)).toEqual(["WorldDominationFortify", "WorldDominationDeployArmies"]);
        expect(await lastStep(old)).toEqual(await lastStep(replayable(game)));
        // One step per recorded command, and the hand-off left no row of its own.
        expect((await buildTimeline(old, NAMES)).snapshots).toHaveLength(old.gameState.commandHistory.length + 1);
    });

    it("closes the hold at the end of an old log whose last move was the fortify, once the live game has handed on", async () => {
        // Nothing follows the fortify in the old log to make the replay close
        // its hold, so the final state would still have Alice on turn and no
        // card drawn — what the recap, the match review and the "your move"
        // push body read.
        const game = makeGame({
            phase: "fortify",
            cardDeck: [card("d1", "infantry")],
            playerStates: new Map([["u1", player({ conqueredTerritoryThisTurn: true })], ["u2", player()]]),
        });
        const close = endTurn();
        for (const command of [fortify(ALASKA, NORTHWEST, 1), close]) {
            game.currentTurn = command.senderId;
            expect((await run(game, command)).outcome.validMove, command.className).toBe(true);
        }
        expect(game.currentTurn).toBe("u2");
        expect(seat(game).cards).toHaveLength(1);

        const old = replayable(game, new Set([close.id]));
        expect(old.gameState.commandHistory.map(c => c.className)).toEqual(["WorldDominationFortify"]);
        const timeline = await buildTimeline(old, NAMES);
        const last = timeline.snapshots.at(-1)!;
        expect(last.currentTurn).toBe("u2");
        expect(last.specificGameState).toEqual(wireFor(game, null));
        expect(last.specificGameState).toEqual(await lastStep(replayable(game)));
        // The hand-off left no step of its own, and the step it joined is the one shown last.
        expect(timeline.snapshots).toHaveLength(old.gameState.commandHistory.length + 1);
        expect(timeline.currentIndex).toBe(timeline.snapshots.length - 1);
        expect(last.history).toEqual((await buildTimeline(replayable(game), NAMES)).snapshots.at(-1)!.history);
    });

    it("leaves a log's hold open when the live game is still holding it", async () => {
        const game = makeGame({ phase: "fortify" });
        game.currentTurn = "u1";
        expect((await run(game, fortify(ALASKA, NORTHWEST, 1))).outcome.validMove).toBe(true);
        expect(game.specificGameState.autoEndTurnAt).not.toBeNull();

        const timeline = await buildTimeline(replayable(game), NAMES);
        const last = timeline.snapshots.at(-1)!;
        expect(last.currentTurn).toBe("u1");
        expect(last.specificGameState).toEqual(wireFor(game, null));
    });

    it("replays an old log's skipped fortify and last setup placement the same way", async () => {
        const game = makeGame({ phase: "setup", reinforcementsRemaining: 1 });
        const closeSetup = endTurn();
        const log: IGameCommand[] = [deploy(ALASKA), closeSetup, deploy(KAMCHATKA, startingArmiesForPlayerCount(2) - 2, "u2")];
        for (const command of log) {
            game.currentTurn = command.senderId;
            expect((await run(game, command)).outcome.validMove, command.className).toBe(true);
        }
        const oldSetup = replayable(game, new Set([closeSetup.id]));
        expect(await lastStep(oldSetup)).toEqual(await lastStep(replayable(game)));

        const skipGame = makeGame({ phase: "fortify" });
        const closeSkip = endTurn();
        for (const command of [skip(), closeSkip, deploy(KAMCHATKA, 1, "u2")]) {
            skipGame.currentTurn = command.senderId;
            expect((await run(skipGame, command)).outcome.validMove, command.className).toBe(true);
        }
        expect(await lastStep(replayable(skipGame, new Set([closeSkip.id])))).toEqual(await lastStep(replayable(skipGame)));
    });

    it("leaves a hold's close to the log when the log has one", () => {
        const held = makeState({ phase: "fortify", autoEndTurnAt: "2026-10-01T08:00:10.000Z", undoStack: [{ by: "u1", turnStartedAt: TURN_STARTED, state: makeState() }] });
        // Its holder's own end turn and undo are the close, or the way out of it.
        expect(worldDominationUnrecordedHoldEnd(held, "u1", endTurn())).toBeNull();
        expect(worldDominationUnrecordedHoldEnd(held, "u1", undo())).toBeNull();
        // Anyone else's move, or the holder going on to another, means the log never closed it.
        expect(worldDominationUnrecordedHoldEnd(held, "u1", deploy(KAMCHATKA, 1, "u2"))).toBeInstanceOf(WorldDominationEndTurn);
        expect(worldDominationUnrecordedHoldEnd(held, "u1", deploy(ALASKA))).toBeInstanceOf(WorldDominationEndTurn);
        // No hold open, or one that isn't the holder's own.
        expect(worldDominationUnrecordedHoldEnd(makeState({ phase: "fortify" }), "u1", deploy(KAMCHATKA, 1, "u2"))).toBeNull();
        expect(worldDominationUnrecordedHoldEnd(held, "u2", deploy(KAMCHATKA, 1, "u2"))).toBeNull();
    });

    it("leaves no recap row for a move taken back, and shows the card the hand-off drew", async () => {
        // Bob's turn to be shown Alice's whole turn, with a deployment she took
        // back in the middle of it.
        const game = makeGame({ phase: "reinforce", reinforcementsRemaining: 2, cardDeck: [card("d1", "infantry")] });
        const log = [
            deploy(ALASKA), undo(), deploy(NORTHWEST), deploy(NORTHWEST),
            attack(ALASKA, KAMCHATKA, [6], [1]), occupy(1),
            endAttack(), fortify(ALASKA, NORTHWEST, 1), undo(), skip(), endTurn(),
        ];
        for (const command of log) {
            game.currentTurn = command.senderId;
            expect((await run(game, command)).outcome.validMove, command.className).toBe(true);
        }
        expect(game.currentTurn).toBe("u2");

        const feed = await buildEventFeed(game, NAMES, "u2");
        const types = feed.events.map(e => e.type);
        expect(types.filter(t => t === "wd_deploy")).toHaveLength(2);
        expect(types).not.toContain("wd_fortify");
        expect(types.some(t => t.endsWith("undo"))).toBe(false);
        expect(types).toContain("wd_conquest");
        expect(types).toContain("wd_draw");
    });

});

describe("World Domination — the undoable commands never consume randomness", () => {
    it("leaves each undoable command with no recorded field", async () => {
        const hand = [card("a", "infantry"), card("b", "infantry"), card("c", "infantry")];
        const base = makeGame({ phase: "reinforce", reinforcementsRemaining: 2, playerStates: new Map([["u1", player({ cards: hand })], ["u2", player()]]) });
        const conquered = makeGame({ phase: "attack" });
        await play(conquered, attack(ALASKA, KAMCHATKA, [6], [1]));

        const cases: [IWorldDominationGameData, IGameCommand][] = [
            [base, deploy(ALASKA)],
            [base, cashIn("a", "b", "c")],
            [conquered, occupy(1)],
            [makeGame({ phase: "attack" }), endAttack()],
            [makeGame({ phase: "fortify" }), fortify(ALASKA, NORTHWEST, 1)],
            [makeGame({ phase: "fortify" }), skip()],
        ];
        for (const [game, command] of cases) {
            game.currentTurn = "u1";
            expect((await run(game, command)).outcome.validMove, command.className).toBe(true);
            expect(game.specificGameState.undoAnchorId, command.className).toBe(command.id);
            expect(consumedRandomness(command), command.className).toBe(false);
        }
        // …and the one that does consume randomness is not on the list.
        expect(consumedRandomness(attack(ALASKA, KAMCHATKA, [6], [1]))).toBe(true);
    });

    it("declares undoable on the six commands that spend what is already known, and on nothing else", () => {
        expect(undoableCommandsIn(import.meta.url, "WorldDominationLogic.ts").sort()).toEqual([
            "WorldDominationCashInCards",
            "WorldDominationDeployArmies",
            "WorldDominationEndAttackPhase",
            "WorldDominationFortify",
            "WorldDominationOccupyTerritory",
            "WorldDominationSkipFortify",
        ]);
    });
});
