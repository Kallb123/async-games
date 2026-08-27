// Integration tests over the three routes that change a game: taking a turn,
// playing a command, and ending a game by hand.
//
// Everything above the database is the real thing here — the handler, the
// request and response objects, the turn rules, the command registry and the
// Mongoose documents. Only Clerk, the connection, the push transport and the
// result read-model are stubbed (see utils/testing/apiRoute.ts).
//
// What they're guarding is docs/robustness-review.md's findings 2, 4, 5 and
// 21: a finished game that could still be played, a missing null check that
// made a bogus id a 500, a command executed against a game it didn't belong
// to, and a request body nobody had checked was JSON.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordGameResult } = vi.hoisted(() => ({ recordGameResult: vi.fn() }));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
// From afterStub rather than apiRoute — see the note in afterStub.ts.
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/mongodb/GameResultData', () => ({ recordGameResult }));
// A fixed die, so a rolled position is something a test can assert.
vi.mock('@/utils/games/DiceRoll', () => ({ DiceRoll: () => 3, DiceRollRequest: async () => 3 }));

import { runAfterCallbacks } from '@/utils/testing/afterStub';
import {
    ANN, BOB, jsonPost, rawPost, resetApiRouteStubs, seedGame, sentPushes, signIn, signInUnresolvable,
    storedGame, stubClerkUsers
} from '@/utils/testing/apiRoute';
import { POST as command } from './command/route';
import { POST as end } from './end/route';
import { POST as takeTurn } from './taketurn/route';

/** Where the two players start, unless a test cares. */
const SQUARES = { [ANN.id]: 10, [BOB.id]: 20 };

/** A Snakes & Ladders game part-way through, with Ann to play. */
function seedSnakesAndLadders(overrides: Record<string, unknown> = {}, squares: Record<string, number> = SQUARES) {
    seedGame({
        gameId: 'game_1',
        gameType: {
            gameId: 'gametype_1', gameType: 'SnakesAndLadders', friendlyName: 'Snakes and Ladders',
            icon: '', url: 'snakesandladders', className: 'SnakesAndLaddersGameType'
        },
        kind: 'SnakesAndLaddersGameData',
        userIdList: [ANN.id, BOB.id],
        turnTimer: '1 day',
        currentTurn: ANN.id,
        lastTurnTimestamp: '2026-01-01T00:00:00.000Z',
        timerWarningNotificationSent: true,
        gameState: { turnOrder: [ANN.id, BOB.id], history: [], commandHistory: [] },
        complete: false,
        winner: '',
        specificGameState: {
            playerPositions: Object.fromEntries(Object.entries(squares)
                .map(([userId, position]) => [userId, { position, laddersClimbed: 0, snakesHit: 0 }])),
            hasRolled: false,
            reRollOnSix: false
        },
        ...overrides
    });
}

/** Where each player stands, as the stored game holds it. */
function positions(saved: Record<string, unknown>): Record<string, { position: number }> {
    return (saved.specificGameState as { playerPositions: Record<string, { position: number }> }).playerPositions;
}

/** The moves the stored game has recorded — its private replay log. */
function commandHistory(saved: Record<string, unknown>): unknown[] {
    return (saved.gameState as { commandHistory: unknown[] }).commandHistory;
}

/** A dice roll as the client sends one: JSON, with the class to rehydrate. */
function diceRoll(extra: Record<string, unknown> = {}) {
    return {
        id: '11111111-1111-1111-1111-111111111111',
        timestamp: '2026-01-01T00:00:00.000Z',
        gameId: 'game_1',
        senderId: ANN.id,
        senderUsername: 'ann',
        className: 'SnakesAndLaddersRequestDiceRoll',
        ...extra
    };
}

beforeEach(async () => {
    await resetApiRouteStubs();
    recordGameResult.mockReset();
    stubClerkUsers(BOB);
});

describe('POST /api/game/taketurn', () => {
    it('passes the turn on, and tells the next player', async () => {
        signIn(ANN);
        seedSnakesAndLadders({ missedTurnCounts: { [ANN.id]: 2 } });

        const response = await takeTurn(jsonPost('/api/game/taketurn', { gameId: 'game_1' }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });

        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(BOB.id);
        expect(saved.lastTurnTimestamp).not.toBe('2026-01-01T00:00:00.000Z');
        expect(saved.timerWarningNotificationSent).toBe(false);
        // Acting inside their window clears the run of expiries the timer cron
        // had counted against them.
        expect(saved.missedTurnCounts).toEqual({ [ANN.id]: 0 });

        await runAfterCallbacks();
        expect(sentPushes).toHaveLength(1);
        expect(sentPushes[0].userIds).toEqual([BOB.id]);
        expect(sentPushes[0].options?.channel).toBe('yourTurn');
    });

    it('refuses a game that has finished', async () => {
        signIn(ANN);
        seedSnakesAndLadders({ complete: true, endReason: 'ended', currentTurn: ANN.id });

        const response = await takeTurn(jsonPost('/api/game/taketurn', { gameId: 'game_1' }));

        expect(response.status).toBe(409);
        expect(storedGame('game_1')!.currentTurn).toBe(ANN.id);
    });

    it('answers 404 for a game that does not exist', async () => {
        signIn(ANN);

        const response = await takeTurn(jsonPost('/api/game/taketurn', { gameId: 'no_such_game' }));

        expect(response.status).toBe(404);
    });

    it('answers 400 for a body that is not JSON', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await takeTurn(rawPost('/api/game/taketurn', 'not json at all'));

        expect(response.status).toBe(400);
        expect(storedGame('game_1')!.__v).toBe(0);
    });

    it('answers 400 for a gameId that is not a string', async () => {
        signIn(ANN);

        const response = await takeTurn(jsonPost('/api/game/taketurn', { gameId: 7 }));

        expect(response.status).toBe(400);
    });

    it("refuses somebody else's turn", async () => {
        signIn(BOB);
        seedSnakesAndLadders();

        const response = await takeTurn(jsonPost('/api/game/taketurn', { gameId: 'game_1' }));

        expect(response.status).toBe(401);
        expect(storedGame('game_1')!.currentTurn).toBe(ANN.id);
    });

    it('refuses a request from nobody', async () => {
        seedSnakesAndLadders();

        const response = await takeTurn(jsonPost('/api/game/taketurn', { gameId: 'game_1' }));

        expect(response.status).toBe(400);
    });

    it('lets one of two racing requests through, not both', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        const request = () => takeTurn(jsonPost('/api/game/taketurn', { gameId: 'game_1' }));

        const [first, second] = await Promise.all([request(), request()]);

        expect([first.status, second.status].sort()).toEqual([200, 409]);
        expect(storedGame('game_1')!.__v).toBe(1);
    });
});

describe('POST /api/game/command', () => {
    it('plays the move, records it and passes the turn on', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(jsonPost('/api/game/command', diceRoll()));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.outcome).toMatchObject({ validMove: true, turnOver: true, roll: 3, newPosition: 13 });
        // The response carries the shared state and never the private replay
        // log — see publicGameState.
        expect(body.gameData.gameState.commandHistory).toBeUndefined();

        const saved = storedGame('game_1')!;
        expect(positions(saved)[ANN.id].position).toBe(13);
        expect(commandHistory(saved)).toHaveLength(1);
        expect(saved.currentTurn).toBe(BOB.id);
    });

    it('rolls its own dice, whatever roll the request brought with it', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(jsonPost('/api/game/command', diceRoll({ recordedRoll: 6 })));

        expect((await response.json()).outcome.roll).toBe(3);
    });

    it('names the mover itself, whatever name the request brought with it', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        // The history line every opponent reads is written from this field, so
        // a client that got to fill it in could put any text it liked in front
        // of another player.
        await command(jsonPost('/api/game/command', diceRoll({
            senderUsername: 'Async Games security — verify at evil.example'
        })));

        const saved = storedGame('game_1')!;
        const history = (saved.gameState as { history: string[] }).history;
        expect(history.join('\n')).not.toContain('evil.example');
        expect(history[0]).toContain('ann');
        expect((commandHistory(saved)[0] as { senderUsername: string }).senderUsername).toBe('ann');
    });

    it('names a guest by the name they typed, not their account username', async () => {
        // A guest's Clerk username is the random account id createGuest()
        // minted; the name they chose at the join screen is their firstName.
        const guest = { id: 'user_guest', username: 'guest_3f2ab9c14d', firstName: 'Dave', publicMetadata: { guest: true } };
        signIn(guest);
        stubClerkUsers(BOB);
        seedSnakesAndLadders({ userIdList: [guest.id, BOB.id], currentTurn: guest.id, gameState: { turnOrder: [guest.id, BOB.id], history: [], commandHistory: [] } },
            { [guest.id]: 10, [BOB.id]: 20 });

        await command(jsonPost('/api/game/command', diceRoll({ senderId: guest.id })));

        const history = (storedGame('game_1')!.gameState as { history: string[] }).history;
        expect(history[0]).toContain('Dave');
        expect(history.join('\n')).not.toContain('guest_3f2ab9c14d');
    });

    it('plays the turn even when Clerk cannot name the player', async () => {
        signIn(ANN);
        seedSnakesAndLadders({
            gameState: {
                turnOrder: [ANN.id, BOB.id],
                history: ['ann rolled a 4'],
                // Their own last move carries the name this game knows them by.
                commandHistory: [{ ...diceRoll(), id: '00000000-0000-0000-0000-000000000000' }]
            }
        });
        // Same player, but Clerk is now unreachable for them.
        signInUnresolvable(ANN.id);

        const response = await command(jsonPost('/api/game/command', diceRoll()));

        // The move is what the request was for; the name is not worth losing it.
        expect(response.status).toBe(200);
        const saved = storedGame('game_1')!;
        expect(positions(saved)[ANN.id].position).toBe(13);
        const history = (saved.gameState as { history: string[] }).history;
        expect(history[0]).toContain('ann');
        expect(history[0]).not.toContain('Unknown player');
    });

    it('refuses a game that has finished', async () => {
        signIn(ANN);
        seedSnakesAndLadders({ complete: true, endReason: 'ended' });

        const response = await command(jsonPost('/api/game/command', diceRoll()));

        expect(response.status).toBe(409);
        expect(commandHistory(storedGame('game_1')!)).toHaveLength(0);
    });

    it("refuses a command belonging to another game's rules", async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        // A real Solitaire command, aimed at a Snakes & Ladders game: it would
        // reach Solitaire's rules holding state they were never written for.
        const response = await command(jsonPost('/api/game/command', diceRoll({ className: 'SolitaireAutoSolve' })));

        expect(response.status).toBe(400);
        expect(commandHistory(storedGame('game_1')!)).toHaveLength(0);
    });

    it('answers 400 for a body that is not a command', async () => {
        signIn(ANN);

        for (const body of ['not json at all', '{}', '[]', '{"className":"NotARegisteredThing"}']) {
            const response = await command(rawPost('/api/game/command', body));
            expect(response.status).toBe(400);
        }
    });

    it('checks who is asking before it reads the body', async () => {
        // Deserialising ran ahead of auth() before, so an unauthenticated POST
        // of {} threw a TypeError — a 500 — before anyone had proved who they
        // were.
        const response = await command(rawPost('/api/game/command', '{}'));

        expect(response.status).toBe(400);
        expect(response.statusText).toBe('Not signed in');
    });

    it('answers 404 for a game that does not exist', async () => {
        signIn(ANN);

        const response = await command(jsonPost('/api/game/command', diceRoll({ gameId: 'no_such_game' })));

        expect(response.status).toBe(404);
    });

    it("refuses a command sent in somebody else's name", async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(jsonPost('/api/game/command', diceRoll({ senderId: BOB.id })));

        expect(response.status).toBe(400);
    });

    it('ends the game when the move wins it, once', async () => {
        signIn(ANN);
        // Three squares short of home, and the die always rolls a 3.
        seedSnakesAndLadders({}, { ...SQUARES, [ANN.id]: 97 });

        const response = await command(jsonPost('/api/game/command', diceRoll()));

        expect(response.status).toBe(200);
        const saved = storedGame('game_1')!;
        expect(saved.complete).toBe(true);
        expect(saved.winner).toBe(ANN.id);
        expect(saved.endReason).toBe('win');
        expect(saved.currentTurn).toBe('');

        await runAfterCallbacks();
        expect(recordGameResult).toHaveBeenCalledTimes(1);
        expect(sentPushes.map(push => push.userIds)).toEqual([[ANN.id], [BOB.id]]);
    });
});

describe('POST /api/game/end', () => {
    it('ends the game, records the result and leaves nobody to play', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await end(jsonPost('/api/game/end', { gameId: 'game_1' }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });

        const saved = storedGame('game_1')!;
        expect(saved.complete).toBe(true);
        expect(saved.endReason).toBe('ended');
        expect(saved.winner).toBe('');
        expect(saved.currentTurn).toBe('');

        await runAfterCallbacks();
        expect(recordGameResult).toHaveBeenCalledTimes(1);
        // Ending a game by hand goes out to the table now, like every other
        // ending: it used to be silent, leaving everyone else waiting on a game
        // that was already over.
        expect(sentPushes).toHaveLength(1);
        expect([...sentPushes[0].userIds].sort()).toEqual([ANN.id, BOB.id].sort());
        expect(sentPushes[0].options?.channel).toBe('gameOver');
    });

    it('records one result however many times it is asked', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        const request = () => end(jsonPost('/api/game/end', { gameId: 'game_1' }));

        await request();
        await runAfterCallbacks();
        const second = await request();
        await runAfterCallbacks();

        expect(second.status).toBe(200);
        expect(await second.json()).toEqual({ success: true, message: 'Game already ended' });
        expect(recordGameResult).toHaveBeenCalledTimes(1);
    });

    it('stops the player who was mid-turn from playing on', async () => {
        // The bug this pair of requests is here for: /api/game/end marks a game
        // complete, and whoever was mid-turn used to be able to keep playing it
        // — their moves landing on a game that had already written its result.
        signIn(ANN);
        seedSnakesAndLadders();

        await end(jsonPost('/api/game/end', { gameId: 'game_1' }));
        const move = await command(jsonPost('/api/game/command', diceRoll()));
        const turn = await takeTurn(jsonPost('/api/game/taketurn', { gameId: 'game_1' }));

        expect(move.status).toBe(409);
        expect(turn.status).toBe(409);
        expect(commandHistory(storedGame('game_1')!)).toHaveLength(0);
    });

    it('refuses somebody who is not in the game', async () => {
        signIn({ id: 'user_carol', username: 'carol' });
        seedSnakesAndLadders();

        const response = await end(jsonPost('/api/game/end', { gameId: 'game_1' }));

        expect(response.status).toBe(401);
        expect(storedGame('game_1')!.complete).toBe(false);
    });

    it('answers 400 for a body that is not JSON', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await end(rawPost('/api/game/end', 'not json at all'));

        expect(response.status).toBe(400);
        expect(storedGame('game_1')!.complete).toBe(false);
    });
});
