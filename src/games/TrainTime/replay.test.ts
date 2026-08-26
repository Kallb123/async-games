import { describe, expect, it, vi } from "vitest";
import { buildTimeline, computePerTurnStat } from "@/utils/games/replay";
import { UNKNOWN_PLAYER_NAME } from "@/utils/users/clerk";
import { buildEventFeed } from "@/utils/games/recap";
import { deserializeJSON } from "@/utils/apiModels/Serialisable";
import {
    TrainTimeClaimRoute,
    TrainTimeDrawCarriageCard,
    TrainTimeDrawTickets,
    TrainTimeGameType,
    TrainTimeKeepTickets,
    TrainTimePassTurn,
} from "./TrainTimeLogic";
import { cloneTrainTimeState, gameStateToModel, ITrainTimeGameData } from "./TrainTimeModels";
import {
    ITrainTimeSpecificGameState,
    MARKET_SIZE,
    ROUTES,
    SETUP_TICKETS_KEPT_MIN,
    TrainTimeCardColour,
    buildInitialTrainTimeState,
    buildPayment,
    canClaimRoute,
    drawsTakenBy,
    payableColours,
    ticketsToKeep,
} from "./board";
import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import type { ITrainTimeSpecificGameStateResponse } from "./apiModels";
import { playerByUserId } from "@/utils/apiModels/GameDataApi";

// Train Time deals two shuffled decks and reshuffles the discards back in when
// the deck runs dry, so recap can only replay it if the starting snapshot is
// stored and every recycle is recorded on the command that caused it. These
// tests hold that line: they replay real command logs with Math.random ripped
// out, so anything that reaches for fresh randomness fails loudly instead of
// quietly dealing a different game.

const PLAYERS = ["u1", "u2", "u3"];
const NAMES = { u1: "Alice", u2: "Bob", u3: "Cara" };

function noRandomness<T>(run: () => T): T {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("replay consumed randomness");
    });
    try {
        return run();
    } finally {
        random.mockRestore();
    }
}

function makeGame(state: ITrainTimeSpecificGameState, userIds: string[] = PLAYERS): ITrainTimeGameData {
    return {
        gameId: "g",
        gameType: new TrainTimeGameType(),
        currentTurn: userIds[0],
        userIdList: userIds,
        turnTimer: 0,
        gameState: { turnOrder: [...userIds], history: [], commandHistory: [] },
        specificGameState: state,
        initialSpecificGameState: cloneTrainTimeState(state, userIds),
        complete: false,
        winner: "",
    } as unknown as ITrainTimeGameData;
}

/** The command route's pipeline, minus persistence: what buildTimeline mirrors. */
async function play(game: ITrainTimeGameData, command: IGameCommand, senderId: string): Promise<void> {
    command.gameId = game.gameId;
    command.senderId = senderId;
    command.senderUsername = NAMES[senderId as keyof typeof NAMES] ?? senderId;
    game.currentTurn = senderId;
    const outcome = await command.Execute(game);
    if (!outcome.validMove) return;
    game.gameState.commandHistory.push(command);
    const gameType = new TrainTimeGameType();
    if (gameType.CheckGameOver(game)) return;
    gameType.CheckEndTurn(game, outcome);
}

function deckDraw() { return new TrainTimeDrawCarriageCard(); }

function marketDraw(index = 0) {
    const command = new TrainTimeDrawCarriageCard();
    command.source = "market";
    command.marketIndex = index;
    return command;
}

/** Everybody keeps the first of their dealt tickets, as if they'd chosen. */
function settleOpeningTickets(state: ITrainTimeSpecificGameState): void {
    for (const ps of state.playerStates.values()) {
        ps.tickets = ps.pendingTickets.slice(0, SETUP_TICKETS_KEPT_MIN);
        state.ticketDeck.push(...ps.pendingTickets.slice(SETUP_TICKETS_KEPT_MIN));
        ps.pendingTickets = [];
    }
}

/**
 * Plays a game out: claim when the hand pays for something (which feeds the
 * discard pile), draw tickets now and then, otherwise take cards. `maxTurns`
 * stops it part-way, for the cases that need a game still in progress — always
 * between turns, never with the player to move half-way through an action.
 */
async function playWholeGame(maxTurns = 5000): Promise<ITrainTimeGameData> {
    const state = buildInitialTrainTimeState(PLAYERS);
    settleOpeningTickets(state);
    const game = makeGame(state);
    const gs = game.specificGameState;

    const midTurn = () => drawsTakenBy(gs, game.currentTurn) > 0
        || (gs.playerStates.get(game.currentTurn)?.pendingTickets.length ?? 0) > 0;

    for (let turns = 0; !game.complete && turns < 5000; turns++) {
        if (turns >= maxTurns && !midTurn()) break;
        const sender = game.currentTurn;
        const me = gs.playerStates.get(sender)!;
        if (me.pendingTickets.length > 0) {
            const keep = new TrainTimeKeepTickets();
            keep.keep = me.pendingTickets.slice(0, ticketsToKeep(me));
            await play(game, keep, sender);
            continue;
        }

        const midDraw = drawsTakenBy(gs, sender) > 0;
        const ctx = {
            routeOwners: gs.routeOwners,
            playerCount: PLAYERS.length,
            hand: me.hand,
            trains: me.trains,
            playerId: sender,
        };
        const claimable = midDraw ? undefined : ROUTES.find(route => canClaimRoute(route, ctx));
        if (claimable) {
            const claim = new TrainTimeClaimRoute();
            claim.routeId = claimable.id;
            claim.cards = buildPayment(claimable, payableColours(claimable, me.hand)[0], me.hand);
            await play(game, claim, sender);
        } else if (!midDraw && gs.ticketDeck.length > 0 && turns % 7 === 0) {
            await play(game, new TrainTimeDrawTickets(), sender);
        } else if (gs.deck.length + gs.discard.length > 0) {
            await play(game, deckDraw(), sender);
        } else if (gs.market.length > 0) {
            await play(game, marketDraw(), sender);
        } else {
            await play(game, new TrainTimePassTurn(), sender);
        }
    }
    return game;
}

/** Re-runs one command against a copy of the state it originally ran on. */
async function replayOneCommand(
    before: ITrainTimeSpecificGameState,
    command: IGameCommand,
): Promise<ITrainTimeSpecificGameState> {
    const game = makeGame(cloneTrainTimeState(before, PLAYERS));
    // Through JSON and back, exactly as Mongo stores and returns it — a recorded
    // shuffle that didn't survive persistence is no use.
    const rehydrated: IGameCommand = deserializeJSON(JSON.stringify(command));
    await noRandomness(() => play(game, rehydrated, command.senderId));
    return game.specificGameState;
}

/** A near-empty deck with a stocked discard pile: the next draw has to recycle. */
function stateNeedingRecycle(discard: TrainTimeCardColour[], deck: TrainTimeCardColour[] = []): ITrainTimeSpecificGameState {
    const state = buildInitialTrainTimeState(PLAYERS);
    settleOpeningTickets(state);
    state.deck = [...deck];
    state.discard = [...discard];
    return state;
}

const DISCARD_PILE: TrainTimeCardColour[] = [
    "red", "red", "green", "blue", "blue", "yellow", "black", "white", "purple", "orange", "engine", "green",
];

describe("Train Time replay", () => {
    it("replays a whole game to exactly the live state without consuming randomness", async () => {
        const game = await playWholeGame();
        expect(game.gameState.commandHistory.length).toBeGreaterThan(10);

        const userIdNameMap = { ...NAMES };
        const timeline = await noRandomness(() => buildTimeline(game, userIdNameMap, [], undefined, "u1"));

        // One snapshot for the opening position, then one per accepted command.
        expect(timeline.snapshots.length).toBe(game.gameState.commandHistory.length + 1);
        expect(timeline.snapshots[timeline.currentIndex].specificGameState)
            .toEqual(gameStateToModel(game.specificGameState, userIdNameMap, "u1"));
    });

    it("names the mover from today's resolved names, not the name frozen on the command", async () => {
        const game = await playWholeGame(6);
        // What a guest's client used to stamp on every command it sent: their
        // random Clerk account username, not the name they typed at the join
        // screen. It is in the database of every game they have already played.
        game.gameState.commandHistory.forEach((command) => {
            (command as IGameCommand).senderUsername = "guest_3f2ab9c14d";
        });

        const timeline = await buildTimeline(game, { ...NAMES }, [], undefined, "u1");
        const played = timeline.snapshots.map((snapshot) => snapshot.command).filter((c) => c !== null);

        expect(played.length).toBeGreaterThan(0);
        expect(played.every((c) => c!.senderUsername === NAMES[c!.senderId as keyof typeof NAMES])).toBe(true);
        // And the prose replay regenerates says the same, since it is written
        // from the command as Execute sees it.
        const history = timeline.snapshots[timeline.currentIndex].history.join("\n");
        expect(history).not.toContain("guest_3f2ab9c14d");
        expect(history).toContain("Alice");
    });

    it("keeps a swept player's recorded name rather than calling them Unknown", async () => {
        const game = await playWholeGame(6);
        // A guest's Clerk account is deleted a week after their last game
        // (GUEST_SWEEP_DAYS), so the directory has no name left for them —
        // userIdListToUserIdNameMap fills that entry with the placeholder. The
        // name their own moves carry is then the only one anybody has.
        const swept = { ...NAMES, u1: UNKNOWN_PLAYER_NAME };

        const timeline = await buildTimeline(game, swept, [], undefined, "u2");
        const theirs = timeline.snapshots
            .map((snapshot) => snapshot.command)
            .filter((command) => command?.senderId === "u1");

        expect(theirs.length).toBeGreaterThan(0);
        expect(theirs.every((command) => command!.senderUsername === "Alice")).toBe(true);
        expect(timeline.snapshots[timeline.currentIndex].history.join("\n")).not.toContain(UNKNOWN_PLAYER_NAME);
    });

    it("shapes in the viewer's own hand and nobody else's", async () => {
        const game = await playWholeGame();
        const userIdNameMap = { ...NAMES };

        const mine = await buildTimeline(game, userIdNameMap, [], undefined, "u2");
        const live = mine.snapshots[mine.currentIndex].specificGameState as ReturnType<typeof gameStateToModel>;
        expect(live.myHand).toEqual(game.specificGameState.playerStates.get("u2")!.hand);
        // Everybody else is a count, never a list of cards.
        expect(Object.values(live.playerStates).every(ps => !("hand" in ps))).toBe(true);

        // Nobody in particular asking gets nobody's cards.
        const anonymous = await buildTimeline(game, userIdNameMap, [], undefined, null);
        expect((anonymous.snapshots[anonymous.currentIndex].specificGameState as { myHand: string[] }).myHand).toEqual([]);
    });

    it("deals the same card back when a blind draw empties the deck", async () => {
        const before = stateNeedingRecycle(DISCARD_PILE);
        const game = makeGame(cloneTrainTimeState(before, PLAYERS));
        const command = deckDraw();
        await play(game, command, "u1");

        expect(command.recordedShuffles).toHaveLength(1);
        expect(game.specificGameState.discard).toHaveLength(0);
        expect(await replayOneCommand(before, command)).toEqual(game.specificGameState);
    });

    it("deals the same cards back when refilling the market empties the deck", async () => {
        // One card left in the deck and a short market, so topping the face-up
        // row back up to five runs the deck dry part-way through and has to
        // recycle the discards mid-refill.
        const before = stateNeedingRecycle(DISCARD_PILE, ["red"]);
        before.market = before.market.slice(0, 3);
        const game = makeGame(cloneTrainTimeState(before, PLAYERS));
        const command = marketDraw(0);
        await play(game, command, "u1");

        expect(command.recordedShuffles?.length).toBeGreaterThanOrEqual(1);
        expect(game.specificGameState.market).toHaveLength(MARKET_SIZE);
        expect(await replayOneCommand(before, command)).toEqual(game.specificGameState);
    });

    it("records nothing on the ordinary draws that never empty the deck", async () => {
        const game = makeGame(buildInitialTrainTimeState(PLAYERS));
        settleOpeningTickets(game.specificGameState);
        const command = deckDraw();
        await play(game, command, "u1");
        expect(command.recordedShuffles).toBeUndefined();
    });

    it("builds a since-you-were-last-here feed off a real command log", async () => {
        const game = await playWholeGame(24);
        expect(game.complete).toBe(false);
        // Whoever is to move sees what happened since their own last turn.
        const feed = await buildEventFeed(game, { ...NAMES }, game.currentTurn);

        expect(feed.hasRecap).toBe(true);
        expect(feed.events.length).toBeGreaterThan(0);
        expect(feed.events.every(event => event.actorId !== game.currentTurn)).toBe(true);
        expect(feed.summary?.subline).toContain("while you were away");
        // The tip reads the viewer's own hand, which only reaches it because the
        // feed replays the game as that player.
        expect(feed.tip?.text).toBeTruthy();
    });

    it("tracks the points race turn by turn, ending on the final scores", async () => {
        const game = await playWholeGame();
        const pointsPerTurn = await computePerTurnStat<ITrainTimeSpecificGameStateResponse>(
            game,
            (state, userId) => playerByUserId(state, userId)?.score,
        );

        expect(pointsPerTurn.length).toBeGreaterThan(0);
        for (const userId of PLAYERS) {
            const series = pointsPerTurn.map(turn => turn.get(userId) ?? 0);
            // Route points are laid down and never come back off the board.
            expect(series).toEqual([...series].sort((a, b) => a - b));
            // The chart's last point is the score the result screen shows —
            // route points, before the tickets and the Long Haul are settled.
            expect(series[series.length - 1])
                .toBe(game.specificGameState.playerStates.get(userId)!.score);
        }
    });

    it("plots nothing rather than throwing when a game can't be replayed", async () => {
        // This runs inside recordGameResult on the final move, so a game with
        // no starting snapshot has to cost its chart, never its last turn.
        const game = await playWholeGame(6);
        delete (game as { initialSpecificGameState?: unknown }).initialSpecificGameState;

        await expect(computePerTurnStat(game, () => 1)).resolves.toEqual([]);
    });

    it("has no recap for a game dealt before the starting snapshot existed", async () => {
        const game = makeGame(buildInitialTrainTimeState(PLAYERS));
        delete (game as { initialSpecificGameState?: unknown }).initialSpecificGameState;
        await expect(buildTimeline(game, { ...NAMES })).rejects.toThrow(/recap is unavailable/i);
    });
});
