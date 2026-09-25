// The command route's out-of-turn path (docs/out-of-turn-actions.md §5.2): a
// command whose class declares `playableOutOfTurn` may be sent by a seated
// player who isn't `currentTurn`, and goes down the ordinary pipeline with the
// out-of-turn invariants enforced by the route and runCommand rather than by
// the command.
//
// No real game declares the flag yet, so these run against a test-only command
// registered here and admitted to Snakes and Ladders by this file's own stub of
// the command registry — keeping every real game's command list out of it.
// Everything else is the real route, pipeline and game type, as in
// gameRoutes.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordGameResult } = vi.hoisted(() => ({ recordGameResult: vi.fn() }));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/mongodb/GameResultData', () => ({ recordGameResult }));
vi.mock('@/utils/games/DiceRoll', () => ({ DiceRoll: () => 3 }));
vi.mock('@/utils/games/gameCommands', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/utils/games/gameCommands')>();
    return {
        ...actual,
        isCommandForGameType: (gameTypeClassName: string, commandClassName: string) =>
            commandClassName === 'TestInterrupt'
                ? gameTypeClassName === 'SnakesAndLaddersGameType'
                : actual.isCommandForGameType(gameTypeClassName, commandClassName),
    };
});

import { runAfterCallbacks } from '@/utils/testing/afterStub';
import { ANN, BOB, jsonPost, resetApiRouteStubs, seedSnakesAndLadders, sentPushes, signIn, storedGame, stubClerkUsers } from '@/utils/testing/apiRoute';
import { serializable } from '@/utils/apiModels/Serialisable';
import { playerHistory } from '@/utils/games/history';
import type { ICommandOutcome, IGameCommand } from '@/utils/apiModels/GameLogic';
import type { uuidString } from '@/utils/apiModels/GameDataApi';
import type { IGameData } from '@/utils/mongodb/GameData';
import type { ISnakesAndLaddersGameData } from '@/games/SnakesAndLadders/SnakesAndLaddersModels';
import { POST as command } from './route';

const CAROL = { id: 'user_carol', username: 'carol' };
const STALE = '2026-01-01T00:00:00.000Z';

/**
 * A card any seat may play on any turn. It moves its sender's own piece to
 * `jumpTo` (if set), and answers with whatever outcome the test asks for — so
 * each invariant can be tried with a command that breaks it.
 */
@serializable
class TestInterrupt implements IGameCommand {
    id = '00000000-0000-0000-0000-000000000000' as uuidString;
    timestamp = STALE;
    gameId = 'game_1' as uuidString;
    senderId = 'Unknown';
    senderUsername = 'Unknown';
    readonly className = 'TestInterrupt';
    readonly playableOutOfTurn = true;

    jumpTo?: number;
    reportTurnOver = false;
    restartTimer = false;
    askFollowUp = false;
    /** What Execute saw, by the test §5.3 gives it: recorded, so a test can read it back. */
    executedOutOfTurn?: boolean;

    myString() {
        return 'TestInterrupt';
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        this.executedOutOfTurn = gameData.currentTurn !== this.senderId;
        const piece = (gameData as ISnakesAndLaddersGameData).specificGameState.playerPositions.get(this.senderId);
        if (piece && this.jumpTo !== undefined) {
            piece.position = this.jumpTo;
        }
        gameData.gameState.history.unshift(playerHistory(this.senderId, `{{${this.senderId}}} interrupted`));
        const followUp = new TestInterrupt();
        followUp.senderId = this.senderId;
        return {
            validMove: true,
            turnOver: this.reportTurnOver,
            timerRestarts: this.restartTimer,
            followUpCommand: this.askFollowUp ? followUp : undefined,
        };
    }
}

/** The interrupt as a client posts it. */
function interrupt(sender: { id: string, username: string }, extra: Record<string, unknown> = {}) {
    return jsonPost('/api/game/command', {
        id: '11111111-1111-1111-1111-111111111111',
        timestamp: STALE,
        gameId: 'game_1',
        senderId: sender.id,
        senderUsername: sender.username,
        className: 'TestInterrupt',
        ...extra,
    });
}

/** The moves the stored game has recorded. */
function commandHistory(): Record<string, unknown>[] {
    return (storedGame('game_1')!.gameState as { commandHistory: Record<string, unknown>[] }).commandHistory;
}

function positions(): Record<string, { position: number }> {
    return (storedGame('game_1')!.specificGameState as { playerPositions: Record<string, { position: number }> }).playerPositions;
}

beforeEach(async () => {
    await resetApiRouteStubs();
    recordGameResult.mockReset();
    stubClerkUsers(ANN, BOB);
    // Ann holds the turn, and both seats have a run of expiries banked, so
    // a test can see whose the route clears.
    seedSnakesAndLadders({ missedTurnCounts: { [ANN.id]: 1, [BOB.id]: 2 } });
});

describe('POST /api/game/command, off the sender\'s turn', () => {
    it('plays a declared command on a teammate\'s turn, stamped with whose turn it was', async () => {
        signIn(BOB);

        const response = await command(interrupt(BOB, { jumpTo: 30 }));

        expect(response.status).toBe(200);
        const [played] = commandHistory();
        expect(commandHistory()).toHaveLength(1);
        expect(played.recordedOnTurnOf).toBe(ANN.id);
        // Execute can tell, by the same test the route used.
        expect(played.executedOutOfTurn).toBe(true);
        expect(positions()[BOB.id].position).toBe(30);
    });

    it('leaves the turn, the clock and the abandon ladder alone', async () => {
        signIn(BOB);

        await command(interrupt(BOB, { restartTimer: true }));

        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(ANN.id);
        expect(saved.lastTurnTimestamp).toBe(STALE);
        expect(saved.timerWarningNotificationSent).toBe(true);
        // Playing a card on somebody else's turn isn't taking your own.
        expect(saved.missedTurnCounts).toEqual({ [ANN.id]: 1, [BOB.id]: 2 });

        await runAfterCallbacks();
        expect(sentPushes).toEqual([]);
    });

    it('refuses one that tries to end the turn, and saves nothing', async () => {
        signIn(BOB);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        const response = await command(interrupt(BOB, { reportTurnOver: true, jumpTo: 30 }));
        error.mockRestore();

        expect(response.status).toBe(401);
        const saved = storedGame('game_1')!;
        expect(saved.__v).toBe(0);
        expect(commandHistory()).toEqual([]);
        expect(saved.currentTurn).toBe(ANN.id);
        expect(positions()[BOB.id].position).toBe(20);
        await runAfterCallbacks();
        expect(sentPushes).toEqual([]);
    });

    it('runs no follow-up', async () => {
        signIn(BOB);

        const response = await command(interrupt(BOB, { askFollowUp: true }));

        expect(response.status).toBe(200);
        expect(commandHistory()).toHaveLength(1);
    });

    it('ends the game through the ordinary game-over branch', async () => {
        signIn(BOB);

        // turnOver alongside a game over is the game saying so, not a hand-off.
        const response = await command(interrupt(BOB, { jumpTo: 100, reportTurnOver: true }));

        expect(response.status).toBe(200);
        const saved = storedGame('game_1')!;
        expect(saved.complete).toBe(true);
        expect(saved.winner).toBe(BOB.id);
        expect(commandHistory()[0].recordedOnTurnOf).toBe(ANN.id);
        await runAfterCallbacks();
        expect(recordGameResult).toHaveBeenCalled();
    });

    it('stamps whose turn it really was, whatever stamp the request brought with it', async () => {
        signIn(BOB);

        await command(interrupt(BOB, { recordedOnTurnOf: CAROL.id }));

        expect(commandHistory()[0].recordedOnTurnOf).toBe(ANN.id);
    });

    it('refuses a command whose class doesn\'t declare it, whatever the request claims', async () => {
        signIn(BOB);

        const response = await command(jsonPost('/api/game/command', {
            gameId: 'game_1', senderId: BOB.id, senderUsername: 'bob',
            className: 'SnakesAndLaddersRequestDiceRoll', playableOutOfTurn: true,
        }));

        expect(response.status).toBe(400);
        expect(response.statusText).toBe('Not your turn in this game');
        expect(commandHistory()).toEqual([]);
    });

    it('refuses somebody who isn\'t seated in the game', async () => {
        signIn(CAROL);

        const response = await command(interrupt(CAROL));

        expect(response.status).toBe(403);
        expect(response.statusText).toBe('Not a player in this game');
        expect(commandHistory()).toEqual([]);
    });

    it('refuses a player who has been dropped from the game', async () => {
        seedSnakesAndLadders({
            gameState: { turnOrder: [ANN.id, BOB.id], history: [], commandHistory: [], droppedPlayers: [BOB.id] },
        });
        signIn(BOB);

        const response = await command(interrupt(BOB));

        expect(response.status).toBe(400);
        expect(response.statusText).toBe('You have left this game');
        expect(commandHistory()).toEqual([]);
    });

    it('refuses a request on somebody else\'s behalf', async () => {
        signIn(BOB);

        const response = await command(interrupt(ANN));

        expect(response.status).toBe(400);
        expect(response.statusText).toBe("Can't request for someone else");
        expect(commandHistory()).toEqual([]);
    });
});

describe('POST /api/game/command, a declared command on the sender\'s own turn', () => {
    it('takes the ordinary path: unstamped, and free to hand the turn on', async () => {
        signIn(ANN);

        const response = await command(interrupt(ANN, { reportTurnOver: true, recordedOnTurnOf: BOB.id }));

        expect(response.status).toBe(200);
        const [played] = commandHistory();
        expect(played.recordedOnTurnOf).toBeUndefined();
        expect(played.executedOutOfTurn).toBe(false);
        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(BOB.id);
        expect(saved.lastTurnTimestamp).not.toBe(STALE);
        expect(saved.missedTurnCounts).toEqual({ [ANN.id]: 0, [BOB.id]: 2 });

        await runAfterCallbacks();
        expect(sentPushes.map(push => push.userIds)).toEqual([[BOB.id]]);
    });
});
