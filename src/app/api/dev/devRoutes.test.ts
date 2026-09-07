// Integration tests over the dev-only game duplication route, and over the
// deep copy underneath it.
//
// The copy is the part worth pinning down: "same game state" is only useful if
// the two games are then independent, and a copy that shared so much as one
// nested object with its original would look right in the response and go
// wrong on the first move played in either.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `isDevDeployment` is computed once, from the environment the module was
// loaded in — which under vitest is neither Vercel nor `npm run dev`. A getter
// rather than a value so a test can turn the deployment into a production one
// and check the route disappears.
const { deployment } = vi.hoisted(() => ({ deployment: { isDev: true } }));
vi.mock('@/utils/devEnvironment', () => ({
    get isDevDeployment() { return deployment.isDev; }
}));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());

import {
    ANN, BOB, jsonPost, rawPost, resetApiRouteStubs, seedSnakesAndLadders, signIn, storedGame
} from '@/utils/testing/apiRoute';
import { API_ROOT, apiRouteFiles } from '@/utils/testing/apiRoutes';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { duplicateGame } from '@/utils/games/duplicateGame';
import { POST as duplicate } from './duplicategame/route';

/** A move in the replay log, so a test has a Mixed value to copy. */
const ROLL = {
    id: '11111111-1111-1111-1111-111111111111',
    timestamp: '2026-01-01T00:00:00.000Z',
    gameId: 'game_1',
    senderId: ANN.id,
    className: 'SnakesAndLaddersRequestDiceRoll',
    recordedRoll: 4
};

/** A part-played game: a move in the log, a line in the history, a live timer. */
function seedPlayedGame() {
    seedSnakesAndLadders({
        gameState: {
            turnOrder: [ANN.id, BOB.id],
            history: [{ text: '{{' + ANN.id + '}} rolled a 4', actorId: ANN.id }],
            commandHistory: [ROLL]
        },
        missedTurnCounts: { [BOB.id]: 1 }
    });
}

beforeEach(async () => {
    await resetApiRouteStubs();
    deployment.isDev = true;
});

describe('POST /api/dev/duplicategame', () => {
    it('copies the game into a new one with the same players and state', async () => {
        signIn(ANN);
        seedPlayedGame();
        const original = storedGame('game_1')!;

        const response = await duplicate(jsonPost('/api/dev/duplicategame', { gameId: 'game_1' }));

        expect(response.status).toBe(200);
        const { success, gameId, path } = await response.json();
        expect(success).toBe(true);
        expect(gameId).not.toBe('game_1');
        expect(path).toBe(`/games/snakesandladders/${gameId}`);

        const copy = storedGame(gameId)!;
        expect(copy.userIdList).toEqual(original.userIdList);
        expect(copy.currentTurn).toBe(original.currentTurn);
        expect(copy.turnTimer).toBe(original.turnTimer);
        expect(copy.kind).toBe(original.kind);
        expect(copy.gameState).toEqual(original.gameState);
        // toMatchObject rather than toEqual: the schema stamps an `_id` on
        // each subdocument it rebuilds, which the seeded original (a plain
        // object, never saved through Mongoose) doesn't carry. Every value the
        // game plays on is still asserted.
        expect(copy.specificGameState).toMatchObject(original.specificGameState as object);
        // The turn clock and the abandon ladder both start again: a copy
        // inherits the position, not the deadline or the two missed turns that
        // would have the sweep abandon it on its first tick.
        expect(copy.missedTurnCounts).toEqual({});
        // Its own game, not the original's: a fresh id, no lobby behind it, and
        // a turn clock that starts now rather than one that may be nearly up.
        expect(copy._id).not.toBe(original._id);
        expect(copy.inviteId).toBeUndefined();
        expect(copy.timerWarningNotificationSent).toBe(false);
        expect(String(copy.lastTurnTimestamp) > String(original.lastTurnTimestamp)).toBe(true);
        // And the original is left exactly as it was.
        expect(storedGame('game_1')).toEqual(original);
    });

    it('leaves the lobby behind, so the copy is not a second game from one invite', async () => {
        signIn(ANN);
        seedSnakesAndLadders({ inviteId: 'invite_1' });

        const response = await duplicate(jsonPost('/api/dev/duplicategame', { gameId: 'game_1' }));

        const { gameId } = await response.json();
        expect(storedGame(gameId)!.inviteId).toBeUndefined();
    });

    it('refuses a finished game, which would copy to something unplayable', async () => {
        // A game's rules clear `currentTurn` as they end it, and no GameResult
        // is written for a copy — so a copy of a finished game is a board
        // nobody can play and neither dashboard list can show.
        signIn(ANN);
        seedSnakesAndLadders({ complete: true, winner: BOB.id, endReason: 'ended', currentTurn: '' });

        const response = await duplicate(jsonPost('/api/dev/duplicategame', { gameId: 'game_1' }));

        expect(response.status).toBe(409);
    });

    it('refuses somebody who is not in the game', async () => {
        signIn({ id: 'user_carol', username: 'carol' });
        seedSnakesAndLadders();

        const response = await duplicate(jsonPost('/api/dev/duplicategame', { gameId: 'game_1' }));

        expect(response.status).toBe(401);
    });

    it('answers 404 for a game that does not exist', async () => {
        signIn(ANN);

        const response = await duplicate(jsonPost('/api/dev/duplicategame', { gameId: 'nope' }));

        expect(response.status).toBe(404);
    });

    it('answers 400 for a body that is not JSON', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await duplicate(rawPost('/api/dev/duplicategame', 'not json at all'));

        expect(response.status).toBe(400);
    });

    it('is not there at all off a dev deployment', async () => {
        deployment.isDev = false;
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await duplicate(jsonPost('/api/dev/duplicategame', { gameId: 'game_1' }));

        expect(response.status).toBe(404);
        // Nothing was created.
        expect(storedGame('game_1')!.__v).toBe(0);
    });
});

describe('duplicateGame', () => {
    it('refuses a game whose type no longer has a model, rather than throwing', async () => {
        // A dev database outlives the registry: a game renamed or removed since
        // it was last wiped still has documents. The route words that as a 400;
        // what must not happen is an uncaught throw, which reaches the client
        // as a 500 with a stack trace.
        seedPlayedGame();
        const game = (await GameDataModel.findOne({ gameId: 'game_1' }).exec()) as IGameDataDocument;
        game.gameType.gameType = 'GameWeRenamed';

        await expect(duplicateGame(game)).resolves.toBeNull();
    });

    it('copies deeply, so a change to one game cannot reach the other', async () => {
        seedPlayedGame();
        const game = (await GameDataModel.findOne({ gameId: 'game_1' }).exec()) as IGameDataDocument;

        const copy = (await duplicateGame(game))!;

        // The replay log holds Mixed values — plain objects the schema doesn't
        // describe and so doesn't rebuild on the way in. If the copy held the
        // original's objects rather than clones of them, this would edit both.
        const copiedRoll = copy.gameState.commandHistory[0] as unknown as typeof ROLL;
        copiedRoll.recordedRoll = 6;
        copy.gameState.history.push({ text: 'a line only the copy has' });
        copy.gameState.turnOrder.reverse();

        const roll = game.gameState.commandHistory[0] as unknown as typeof ROLL;
        expect(roll.recordedRoll).toBe(4);
        expect(game.gameState.history).toHaveLength(1);
        expect(game.gameState.turnOrder).toEqual([ANN.id, BOB.id]);
    });
});

// The gate used to be unskippable: `devWipeRoute` was the only way to write a
// dev route and carried it in its own body. Now that it is a helper a route
// opts into, forgetting it compiles, ships, and leaves a route any signed-in
// account can reach on a shareable preview URL — and `gameRouteAccess.test.ts`
// wouldn't see it, since it only walks routes that fetch a game.
describe('every /api/dev route', () => {
    const devRoutes = apiRouteFiles()
        .filter(file => file.startsWith(path.join(API_ROOT, 'dev') + path.sep))
        .map(file => path.relative(API_ROOT, file));

    it('finds the routes to check', () => {
        expect(devRoutes.length).toBeGreaterThanOrEqual(3);
    });

    it.each(devRoutes)('%s is gated on being a dev deployment', (relativePath) => {
        const source = readFileSync(path.join(API_ROOT, relativePath), 'utf8');

        // Directly, or through `devWipeRoute`, which calls it for the wipes.
        const gated = /requireDevCaller\(|devWipeRoute\(/.test(source);
        expect(gated, `${relativePath} is reachable without the dev gate`).toBe(true);
    });
});
