// Integration tests over the three routes that change a game: taking a turn,
// playing a command, and ending a game by hand.
//
// Everything above the database is the real thing here — the handler, the
// request and response objects, the turn rules, the command registry, the
// Mongoose documents and the achievements judge. Only Clerk, the connection,
// the push transport, the result read-model and the achievement catalogue are
// stubbed (see utils/testing/apiRoute.ts).
//
// What they're guarding is docs/robustness-review.md's findings 2, 4, 5 and
// 21: a finished game that could still be played, a missing null check that
// made a bogus id a 500, a command executed against a game it didn't belong
// to, and a request body nobody had checked was JSON.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { AchievementCatalogue, GameAchievement, Seat } from '@/utils/games/achievements';

// The real catalogue is empty until the first achievements ship, so the judge is
// given one the tests fill: `ACHIEVEMENT_CATALOGUE` is mocked to this object,
// which the judge reads as the default of its catalogue parameter. Emptied in
// `beforeEach`, so a test that adds an achievement can't leak it into the next.
const { recordGameResult, getGameStatsByPlayer, testCatalogue } = vi.hoisted(() => ({
    recordGameResult: vi.fn(),
    getGameStatsByPlayer: vi.fn(),
    testCatalogue: { games: {}, platform: [] } as AchievementCatalogue,
}));

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
// From afterStub rather than apiRoute — see the note in afterStub.ts.
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
// The judge reads more of GameResultData than the route ever did (countsAsPlayed,
// resultCounts, outcomeFor), so the rest of the module stays real. Only the
// write and the aggregation, which need a database, are stubbed.
vi.mock('@/utils/mongodb/GameResultData', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/mongodb/GameResultData')>()),
    recordGameResult,
    getGameStatsByPlayer,
}));
vi.mock('@/utils/games/achievements', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/games/achievements')>()),
    ACHIEVEMENT_CATALOGUE: testCatalogue,
}));
// A fixed die, so a rolled position is something a test can assert.
vi.mock('@/utils/games/DiceRoll', () => ({ DiceRoll: vi.fn(() => 3) }));

import { runAfterCallbacks } from '@/utils/testing/afterStub';
import { turnEnd } from '@/utils/testing/achievementFixtures';
import {
    ANN, BOB, commandPost, failNextAchievementUnlockWrite, jsonPost, rawPost, resetApiRouteStubs, seedGame, seedReaction,
    seedSnakesAndLadders, sentPushes, signIn, signInUnresolvable, SQUARES, storedAchievementUnlocks, storedGame, stubClerkUsers
} from '@/utils/testing/apiRoute';
import { baseState } from '@/games/FiresOut/testFixtures';
import { race } from '@/games/RaceCars/testFixtures';
import { makeState, player } from '@/games/SettlementsAndCities/testFixtures';
import { BOARD_TOPOLOGY, HEX_POSITIONS } from '@/games/SettlementsAndCities/board';
import type { ISnakesAndLaddersGameStateResponse } from '@/games/SnakesAndLadders/apiModels';
import { DiceRoll } from '@/utils/games/DiceRoll';
import { mongoMap } from '@/utils/games/mongoMaps';
import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import * as clerkUsers from '@/utils/users/clerk';
import { FIRST_COMMAND_VERSION } from '@/utils/ui/games';
import { POST as command } from './command/route';
import { POST as end } from './end/route';
import { POST as takeTurn } from './taketurn/route';

/** Where each player stands, as the stored game holds it. */
function positions(saved: Record<string, unknown>): Record<string, { position: number }> {
    return (saved.specificGameState as { playerPositions: Record<string, { position: number }> }).playerPositions;
}

/** The match-history log as the stored game holds it: tokens, not names. */
function storedHistory(saved: Record<string, unknown>): { text: string, actorId?: string, commandId?: string }[] {
    return (saved.gameState as { history: { text: string, actorId?: string, commandId?: string }[] }).history;
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
    getGameStatsByPlayer.mockReset();
    getGameStatsByPlayer.mockResolvedValue([]);
    testCatalogue.games = {};
    testCatalogue.platform = [];
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

    it("refuses a game whose own turn order differs from turnOrder, rather than desyncing currentTurn", async () => {
        // Race Cars' real turn order is roundOrder/roundIndex, not
        // gameState.turnOrder — the join order. A blind advance along
        // turnOrder here would leave currentTurn naming a driver who isn't
        // roundOrder[roundIndex], stalling the race until the abandon ladder
        // ends it for an innocent player (docs/games/race-cars.md §23.2). A
        // registered turn-timeout adapter is the signal that a game has this
        // shape, so this route refuses outright rather than guessing.
        signIn(ANN);
        seedGame({
            gameId: 'game_1',
            gameType: {
                gameId: 'gametype_1', gameType: 'RaceCars', friendlyName: 'Race Cars',
                icon: '', url: 'racecars', className: 'RaceCarsGameType'
            },
            kind: 'RaceCarsGameData',
            userIdList: [ANN.id, BOB.id],
            turnTimer: '1 day',
            currentTurn: ANN.id,
            lastTurnTimestamp: '2026-01-01T00:00:00.000Z',
            timerWarningNotificationSent: true,
            gameState: { turnOrder: [ANN.id, BOB.id], history: [], commandHistory: [] },
            complete: false,
            winner: '',
            specificGameState: race({ [ANN.id]: {}, [BOB.id]: {} }),
        });

        const response = await takeTurn(jsonPost('/api/game/taketurn', { gameId: 'game_1' }));

        expect(response.status).toBe(400);
        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(ANN.id);
        expect(saved.lastTurnTimestamp).toBe('2026-01-01T00:00:00.000Z');
    });
});

/**
 * A Fires Out solitaire board with a stale clock: Ann holds both figures, so
 * ending one's turn never hands the turn to anybody else (`timerRestarts`
 * without `turnOver`). Answers the stale timestamp, for a test that asserts the
 * clock moved.
 */
function seedSolitaireFiresOut(): string {
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    seedGame({
        gameId: 'game_1',
        gameType: {
            gameId: 'gametype_1', gameType: 'FiresOut', friendlyName: 'Fires Out!',
            icon: '', url: 'firesout', className: 'FiresOutGameType'
        },
        kind: 'FiresOutGameData',
        userIdList: [ANN.id],
        turnTimer: '10m',
        currentTurn: ANN.id,
        lastTurnTimestamp: stale,
        timerWarningNotificationSent: true,
        gameState: { turnOrder: [ANN.id], history: [], commandHistory: [] },
        complete: false,
        winner: '',
        specificGameState: baseState([ANN.id, ANN.id]),
    });
    return stale;
}

/** Ann ending one figure's turn on that board. */
function solitaireEndTurn() {
    return commandPost({
        id: '00000000-0000-0000-0000-00000000000f',
        timestamp: '2026-01-01T00:00:00.000Z',
        gameId: 'game_1',
        senderId: ANN.id,
        senderUsername: 'ann',
        className: 'FiresOutAction',
        kind: 'endTurn',
    });
}

describe('POST /api/game/command', () => {
    it('plays the move, records it and passes the turn on', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(commandPost(diceRoll()));

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

    it("restarts the turn timer when a figure's turn ends inside one player's own turn", async () => {
        // docs/games/fires-out-gdd.md §17.6 step 12: a Fires Out solitaire
        // board is one player holding every figure, so `turnOver` is false for
        // every hand-off between them. The clock used to move only on
        // `turnOver`, which left a game being played every day permanently
        // expired: the sweep reached it twice a timer period forever, banked
        // missed turns against a player who was right there, and pushed them a
        // "take your turn now or it passes to the next player" warning that
        // was false in both halves. `timerRestarts` is the boundary that isn't
        // a hand-off.
        signIn(ANN);
        const stale = seedSolitaireFiresOut();

        const response = await command(solitaireEndTurn());

        expect(response.status).toBe(200);
        const outcome = (await response.json()).outcome;
        // The turn did *not* pass — there is nobody to pass it to.
        expect(outcome).toMatchObject({ validMove: true, turnOver: false, timerRestarts: true });

        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(ANN.id);
        expect(saved.lastTurnTimestamp).not.toBe(stale);
        expect(saved.timerWarningNotificationSent).toBe(false);

        // ...and nobody is told it's their move, least of all the player who
        // just moved.
        await runAfterCallbacks();
        expect(sentPushes).toEqual([]);
    });

    it('shows a reaction already dropped on an earlier move, not just at game end', async () => {
        // The regression this guards: the response for a move that keeps the
        // game going is built at a different call site than the one for a move
        // that ends it, and only the latter was wired up to attach reactions —
        // so every reaction would silently vanish from the match-history log
        // for exactly the response players see far more often.
        signIn(ANN);
        seedSnakesAndLadders({
            gameState: {
                turnOrder: [ANN.id, BOB.id],
                history: [{ text: `{{${ANN.id}}} rolled a 4`, actorId: ANN.id, commandId: 'earlier-command' }],
                commandHistory: [{ ...diceRoll(), id: '00000000-0000-0000-0000-000000000000' }]
            }
        });
        seedReaction({ gameId: 'game_1', commandId: 'earlier-command', reaction: '😱' });

        const response = await command(commandPost(diceRoll()));

        expect(response.status).toBe(200);
        const history: { commandId?: string, reactions?: { reaction: string, actorId: string, actorUsername: string }[] }[] = (await response.json()).gameData.gameState.history;
        expect(history.find(entry => entry.commandId === 'earlier-command')?.reactions).toEqual([{ reaction: '😱', actorId: 'user_reactor', actorUsername: 'Reactor' }]);
    });

    it('mints its own command id, whatever id the request brought with it', async () => {
        // Undo trusts the id at the tail of commandHistory to say nothing has
        // run since its snapshot was pushed, so a client that reused an id
        // could undo past a move it had already seen the outcome of.
        signIn(ANN);
        seedSnakesAndLadders();
        await command(commandPost(diceRoll()));
        signIn(BOB);
        await command(commandPost(diceRoll({ senderId: BOB.id, senderUsername: 'bob' })));

        const saved = storedGame('game_1')!;
        const ids = (commandHistory(saved) as { id: string }[]).map(stored => stored.id);
        expect(ids).toHaveLength(2);
        expect(ids).not.toContain(diceRoll().id);
        expect(new Set(ids).size).toBe(2);
        // The id the history line carries — what a reaction joins on — is the
        // one the server minted.
        expect(storedHistory(saved).map(entry => entry.commandId).sort()).toEqual([...ids].sort());
    });

    it("won't let a reused id undo past a move made after the undoable one", async () => {
        // The attack the server-minted id closes: build a road (undoable, so it
        // anchors the undo), then play Monopoly (not undoable) under the road's
        // id so the anchor still matches the tail of commandHistory, then undo —
        // taking back the Monopoly along with the road, having seen what every
        // other hand held. With a card bought in its place, that was seeing the
        // card and putting it back.
        signIn(ANN);
        const gs = makeState({
            hexes: HEX_POSITIONS.map(() => ({ terrain: 'desert', numberToken: null })),
            vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
            edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
        });
        const vertexId = BOARD_TOPOLOGY.hexVertices[0][0];
        const edgeId = BOARD_TOPOLOGY.vertexEdges[vertexId][0];
        gs.vertices[vertexId] = { building: 'settlement', owner: ANN.id };
        // Ore to spare for a bank trade, so neither the road nor the Monopoly
        // leaves her with nothing to do and holds the turn (docs/undo.md §5).
        gs.playerStates.set(ANN.id, player({ resources: { brick: 1, lumber: 1, ore: 8 }, devCards: { monopoly: 1 } }));
        gs.playerStates.set(BOB.id, player());
        seedGame({
            gameId: 'game_1',
            gameType: {
                gameId: 'gametype_1', gameType: 'SettlementsAndCities', friendlyName: 'Settlements & Cities',
                icon: '', url: 'settlementsandcities', className: 'SettlementsAndCitiesGameType'
            },
            kind: 'SettlementsAndCitiesGameData',
            userIdList: [ANN.id, BOB.id],
            turnTimer: '1 day',
            currentTurn: ANN.id,
            lastTurnTimestamp: '2026-01-01T00:00:00.000Z',
            timerWarningNotificationSent: false,
            gameState: { turnOrder: [ANN.id, BOB.id], history: [], commandHistory: [] },
            complete: false,
            winner: '',
            specificGameState: { ...gs, playerStates: Object.fromEntries(gs.playerStates) },
        });
        const sameId = '55555555-5555-5555-5555-555555555555';
        const as = (className: string, extra: Record<string, unknown> = {}) => commandPost({
            id: sameId, timestamp: '2026-01-01T00:00:01.000Z', gameId: 'game_1',
            senderId: ANN.id, senderUsername: 'ann', className, ...extra,
        });

        expect((await command(as('SACBuildRoad', { edgeId }))).status).toBe(200);
        expect((await command(as('SACPlayMonopoly', { resource: 'wool' }))).status).toBe(200);
        const undo = await command(as('SACUndo'));

        expect(undo.status).toBe(401);
        const saved = storedGame('game_1')!.specificGameState as { playerStates: Record<string, { devCards: Record<string, number> }>, edges: { hasRoad: boolean }[] };
        expect(saved.edges[edgeId].hasRoad).toBe(true);
        expect(saved.playerStates[ANN.id].devCards).toMatchObject({ monopoly: 0 });
    });

    it("refuses a move off the player's turn, whatever turn-gate exemption the request claims", async () => {
        // The route used to skip its turn gate for a command carrying
        // `ignoresTurnGate`, read off the rehydrated request body — which the
        // reviver copies every posted property onto — so a body claiming it got
        // any command past the gate: here, rolling on BOB's turn. The gate has
        // no exemptions now; this keeps a claimed one from coming back.
        signIn(ANN);
        seedSnakesAndLadders({ currentTurn: BOB.id });

        const response = await command(commandPost(diceRoll({ ignoresTurnGate: true })));

        expect(response.status).toBe(400);
        expect(response.statusText).toBe('Not your turn in this game');
        const saved = storedGame('game_1')!;
        expect(commandHistory(saved)).toHaveLength(0);
        expect(saved.currentTurn).toBe(BOB.id);
    });

    it('rolls its own dice, whatever roll the request brought with it', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(commandPost(diceRoll({ recordedRoll: 6 })));

        expect((await response.json()).outcome.roll).toBe(3);
    });

    it('records the rules version the move was built for', async () => {
        // docs/command-versions.md: the recorded version is what a replay
        // branches on, so it is kept on the move rather than dropped.
        signIn(ANN);
        seedSnakesAndLadders();

        await command(commandPost(diceRoll()));

        expect(commandHistory(storedGame('game_1')!)[0]).toMatchObject({ version: FIRST_COMMAND_VERSION });
    });

    it.each([
        ['one built for older rules', { version: FIRST_COMMAND_VERSION - 1 }],
        ['one whose version isn\'t a number', { version: '1' }],
    ])('refuses %s as out of date, and saves nothing', async (_, version) => {
        // A tab still running the bundle from before a game's rules changed
        // builds its moves for the old rules; it is told to reload.
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(commandPost(diceRoll(version)));

        expect(response.status).toBe(426);
        const saved = storedGame('game_1')!;
        expect(commandHistory(saved)).toHaveLength(0);
        expect(positions(saved)[ANN.id].position).toBe(10);
        expect(saved.currentTurn).toBe(ANN.id);
    });

    it('takes a move from a client too old to say as built for the first rules version', async () => {
        // A bundle from before commands carried a version was built for the
        // first version's rules, and doesn't know to reload on a 426.
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(commandPost(diceRoll({ version: undefined })));

        expect(response.status).toBe(200);
        expect(commandHistory(storedGame('game_1')!)[0]).toMatchObject({ version: FIRST_COMMAND_VERSION });
    });

    it('refuses one built for rules the server doesn\'t have yet, without asking for a reload', async () => {
        // A client ahead of a deploy that hasn't reached this instance: a
        // reload would fetch the same bundle, so it is only told to try again.
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(commandPost(diceRoll({ version: FIRST_COMMAND_VERSION + 1 })));

        expect(response.status).toBe(409);
        expect(commandHistory(storedGame('game_1')!)).toHaveLength(0);
    });

    it('names the mover itself, whatever name the request brought with it', async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        // The history line every opponent reads is written from this field, so
        // a client that got to fill it in could put any text it liked in front
        // of another player.
        await command(commandPost(diceRoll({
            senderUsername: 'Async Games security — verify at evil.example'
        })));

        const saved = storedGame('game_1')!;
        const history = storedHistory(saved);
        expect(history.map(entry => entry.text).join('\n')).not.toContain('evil.example');
        // The stored line names her by id; the board resolves it to her name.
        expect(history[0].actorId).toBe(ANN.id);
        expect(history[0].text).toContain(ANN.id);
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

        const response = await command(commandPost(diceRoll({ senderId: guest.id })));

        // The name is resolved on the way out, so it is the response — what the
        // board actually reads — that has to say Dave.
        const history: { text: string }[] = (await response.json()).gameData.gameState.history;
        expect(history[0].text).toContain('Dave');
        expect(history.map(entry => entry.text).join('\n')).not.toContain('guest_3f2ab9c14d');
    });

    it('plays the turn even when Clerk cannot name the player', async () => {
        signIn(ANN);
        seedSnakesAndLadders({
            gameState: {
                turnOrder: [ANN.id, BOB.id],
                history: [{ text: `{{${ANN.id}}} rolled a 4`, actorId: ANN.id }],
                // Their own last move carries the name this game knows them by.
                commandHistory: [{ ...diceRoll(), id: '00000000-0000-0000-0000-000000000000' }]
            }
        });
        // Same player, but Clerk is now unreachable for them.
        signInUnresolvable(ANN.id);

        const response = await command(commandPost(diceRoll()));

        // The move is what the request was for; the name is not worth losing it.
        expect(response.status).toBe(200);
        const saved = storedGame('game_1')!;
        expect(positions(saved)[ANN.id].position).toBe(13);
        // And nothing is frozen into the line while Clerk is down: it records
        // her id, so it reads correctly again the moment Clerk answers.
        const history = storedHistory(saved);
        expect(history[0].actorId).toBe(ANN.id);
        expect(history[0].text).not.toContain('Unknown player');
        // Her last move still carries a name for the recap engine to fall back on.
        expect((commandHistory(saved).at(-1) as { senderUsername: string }).senderUsername).toBe('ann');
    });

    it('refuses a game that has finished', async () => {
        signIn(ANN);
        seedSnakesAndLadders({ complete: true, endReason: 'ended' });

        const response = await command(commandPost(diceRoll()));

        expect(response.status).toBe(409);
        expect(commandHistory(storedGame('game_1')!)).toHaveLength(0);
    });

    it("refuses a command belonging to another game's rules", async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        // A real Solitaire command, aimed at a Snakes & Ladders game: it would
        // reach Solitaire's rules holding state they were never written for.
        const response = await command(commandPost(diceRoll({ className: 'SolitaireAutoSolve' })));

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

        const response = await command(commandPost(diceRoll({ gameId: 'no_such_game' })));

        expect(response.status).toBe(404);
    });

    it("refuses a command sent in somebody else's name", async () => {
        signIn(ANN);
        seedSnakesAndLadders();

        const response = await command(commandPost(diceRoll({ senderId: BOB.id })));

        expect(response.status).toBe(400);
    });

    it('ends the game when the move wins it, once', async () => {
        signIn(ANN);
        // Three squares short of home, and the die always rolls a 3.
        seedSnakesAndLadders({}, { ...SQUARES, [ANN.id]: 97 });

        const response = await command(commandPost(diceRoll()));

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

    /**
     * BOB far enough down the road that ANN's move offers no tow — so it is
     * the ordinary ending, and holds rather than handing off outright
     * (docs/undo.md §5): `currentTurn` stays ANN's, with the ten-second
     * window open. `players` is stored flattened to a plain object, same as
     * `asStored` (this file's own stand-in for a real Mongoose save) does to
     * every Map — seeding the live Map straight from `race()` would round-trip
     * through this store's own JSON.stringify as `{}`, an empty grid.
     */
    function raceCarsGridWithAMoveOffered() {
        const grid = race({
            [ANN.id]: { phase: 'move', roll: 7, row: 20, lane: 2 },
            [BOB.id]: { row: 70, lane: 1 },
        });
        seedGame({
            gameId: 'game_1',
            gameType: {
                gameId: 'gametype_1', gameType: 'RaceCars', friendlyName: 'Race Cars',
                icon: '', url: 'racecars', className: 'RaceCarsGameType'
            },
            kind: 'RaceCarsGameData',
            userIdList: [ANN.id, BOB.id],
            turnTimer: '1 day',
            currentTurn: ANN.id,
            lastTurnTimestamp: '2026-01-01T00:00:00.000Z',
            timerWarningNotificationSent: false,
            gameState: { turnOrder: [ANN.id, BOB.id], history: [], commandHistory: [] },
            complete: false,
            winner: '',
            specificGameState: { ...grid, players: Object.fromEntries(mongoMap(grid.players)) },
        });
    }

    it("undoes a move that is holding the turn open for its own undo window", async () => {
        signIn(ANN);
        raceCarsGridWithAMoveOffered();

        const moveResponse = await command(commandPost({
            id: '22222222-2222-2222-2222-222222222222',
            timestamp: '2026-01-01T00:00:01.000Z',
            gameId: 'game_1',
            senderId: ANN.id,
            senderUsername: 'ann',
            className: 'RaceCarsMove',
            row: 27,
            lane: 1,
            brake: 0,
        }));
        expect(moveResponse.status).toBe(200);
        expect((await moveResponse.json()).outcome.turnOver).toBe(false);
        expect(storedGame('game_1')!.currentTurn).toBe(ANN.id);
        expect((storedGame('game_1')!.specificGameState as { autoEndTurnAt: string | null }).autoEndTurnAt).not.toBeNull();

        const undoResponse = await command(commandPost({
            id: '33333333-3333-3333-3333-333333333333',
            timestamp: '2026-01-01T00:00:02.000Z',
            gameId: 'game_1',
            senderId: ANN.id,
            senderUsername: 'ann',
            className: 'RaceCarsUndo',
        }));

        expect(undoResponse.status).toBe(200);
        expect((await undoResponse.json()).outcome.validMove).toBe(true);
        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(ANN.id);
        expect((saved.specificGameState as { autoEndTurnAt: string | null }).autoEndTurnAt).toBeNull();
        expect(commandHistory(saved)).toHaveLength(2);
    });

    it("still refuses an undo from anyone other than the driver whose move it would take back", async () => {
        signIn(ANN);
        raceCarsGridWithAMoveOffered();

        await command(commandPost({
            id: '22222222-2222-2222-2222-222222222222',
            timestamp: '2026-01-01T00:00:01.000Z',
            gameId: 'game_1',
            senderId: ANN.id,
            senderUsername: 'ann',
            className: 'RaceCarsMove',
            row: 27,
            lane: 1,
            brake: 0,
        }));
        // Held open, not handed off — still ANN's turn (docs/undo.md §5).
        expect(storedGame('game_1')!.currentTurn).toBe(ANN.id);

        // BOB isn't on turn, so the route's own gate refuses him before
        // `Execute`'s ownership check is ever asked — an undo is played on the
        // turn it takes back, like every other command.
        signIn(BOB);
        const undoResponse = await command(commandPost({
            id: '44444444-4444-4444-4444-444444444444',
            timestamp: '2026-01-01T00:00:02.000Z',
            gameId: 'game_1',
            senderId: BOB.id,
            senderUsername: 'bob',
            className: 'RaceCarsUndo',
        }));

        expect(undoResponse.status).toBe(400);
        expect(undoResponse.statusText).toBe('Not your turn in this game');
        const saved = storedGame('game_1')!;
        expect(saved.currentTurn).toBe(ANN.id);
        expect(commandHistory(saved)).toHaveLength(1);
    });
});

// Judging achievements at the end of a turn (docs/achievements.md §4.2): the
// `YourTurn` push's own slot in `after()`, shared with a judge that writes what
// the turn just ended earned. Snakes & Ladders is the stand-in game, as it is
// for the rest of the file: Ann is on 10 and Bob on 20, the die always rolls a
// 3, so Ann's move lands her on 13 and hands the turn to Bob.
describe('POST /api/game/command judging achievements', () => {
    const squareOf = (view: ISnakesAndLaddersGameStateResponse, userId: string) => view.playerStates[userId].position;

    /** Gives Snakes & Ladders these achievements for the test. */
    const offer = (...achievements: GameAchievement<any>[]) => {
        testCatalogue.games.snakesandladders = achievements;
    };

    /** A check that can be asked again, saying how it was called. */
    const checking = (passes: (view: ISnakesAndLaddersGameStateResponse, userId: string) => boolean) =>
        vi.fn<(view: ISnakesAndLaddersGameStateResponse, seat: Seat) => boolean>((view, { userId }) => passes(view, userId));

    /** What the judge stored, as a row carries it. */
    const row = (userId: string, achievementId: string, url = 'snakesandladders') =>
        ({ userId, achievementId, unlockedAt: expect.any(String), gameId: 'game_1', url });

    // A judge that fails logs it, and so does a push that can't be sent.
    let errors: MockInstance<typeof console.error>;
    beforeEach(() => {
        errors = vi.spyOn(console, 'error').mockImplementation(() => { });
    });
    afterEach(() => {
        errors.mockRestore();
    });

    it('writes a row, after the response, when a check passes at the end of a turn', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        offer(turnEnd('snakesandladders.thirteen', (view: ISnakesAndLaddersGameStateResponse, { userId }) => squareOf(view, userId) === 13));

        const response = await command(commandPost(diceRoll()));

        expect(response.status).toBe(200);
        // Nobody waits on it: it is the response's own `after()` that judges.
        expect(storedAchievementUnlocks()).toEqual([]);

        await runAfterCallbacks();

        expect(storedAchievementUnlocks()).toEqual([row(ANN.id, 'snakesandladders.thirteen')]);
        // Nothing is pushed or shown for it yet: the next player's "your move"
        // is the only push this turn sent.
        expect(sentPushes.map(push => push.options?.channel)).toEqual(['yourTurn']);
    });

    it('judges every seat, not only the one who moved', async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        // Bob didn't move: he is still on 20, and a move can hand somebody else
        // their achievement (Dice Cities' Business Center swap).
        offer(turnEnd('snakesandladders.twenty', (view: ISnakesAndLaddersGameStateResponse, { userId }) => squareOf(view, userId) === 20));

        await command(commandPost(diceRoll()));
        await runAfterCallbacks();

        expect(storedAchievementUnlocks()).toEqual([row(BOB.id, 'snakesandladders.twenty')]);
    });

    it('writes nothing for a move that leaves the turn open, however true the state it leaves', async () => {
        signIn(ANN);
        // A 6 hands the die straight back to the same player, so the turn isn't over.
        seedSnakesAndLadders({
            specificGameState: {
                playerPositions: {
                    [ANN.id]: { position: 10, laddersClimbed: 0, snakesHit: 0 },
                    [BOB.id]: { position: 20, laddersClimbed: 0, snakesHit: 0 },
                },
                hasRolled: false,
                reRollOnSix: true,
            }
        });
        const pastFifteen = checking((view, userId) => userId === ANN.id && squareOf(view, userId) > 15);
        offer(turnEnd('snakesandladders.past-fifteen', pastFifteen));
        vi.mocked(DiceRoll).mockReturnValueOnce(6);

        const sixed = await command(commandPost(diceRoll()));

        expect((await sixed.json()).outcome).toMatchObject({ turnOver: false, extraRoll: true, newPosition: 16 });
        expect(storedGame('game_1')!.currentTurn).toBe(ANN.id);
        // The state passes, and is never looked at: no turn ended, so there is no
        // post-response work to run at all.
        expect(await runAfterCallbacks()).toBe(0);
        expect(pastFifteen).not.toHaveBeenCalled();
        expect(storedAchievementUnlocks()).toEqual([]);

        // The roll that does end the turn (Ann is now on 19) is judged.
        await command(commandPost(diceRoll()));
        await runAfterCallbacks();

        expect(storedAchievementUnlocks()).toEqual([row(ANN.id, 'snakesandladders.past-fifteen')]);
    });

    it("judges a Fires Out solitaire hand-off, which restarts the timer without handing over the turn", async () => {
        signIn(ANN);
        seedSolitaireFiresOut();
        testCatalogue.games.firesout = [turnEnd('firesout.any', () => true)];

        const response = await command(solitaireEndTurn());

        expect((await response.json()).outcome).toMatchObject({ turnOver: false, timerRestarts: true });
        await runAfterCallbacks();

        expect(storedAchievementUnlocks()).toEqual([row(ANN.id, 'firesout.any', 'firesout')]);
        // ...and still nobody is told it's their move.
        expect(sentPushes).toEqual([]);
    });

    it("judges even when there is nobody to tell it's their turn", async () => {
        signIn(ANN);
        // The turn order names a seat the roster doesn't hold, so the turn passes
        // to somebody Clerk can't resolve. (A roster seat Clerk doesn't return
        // would instead fail the whole table closed, and judge nothing: §4.2
        // step 1.) The push has nobody to go to; the judge doesn't need them.
        seedSnakesAndLadders({ gameState: { turnOrder: [ANN.id, 'user_ghost'], history: [], commandHistory: [] } });
        offer(turnEnd('snakesandladders.thirteen', (view: ISnakesAndLaddersGameStateResponse, { userId }) => squareOf(view, userId) === 13));

        const response = await command(commandPost(diceRoll()));
        await runAfterCallbacks();

        expect(response.status).toBe(200);
        expect(storedGame('game_1')!.currentTurn).toBe('user_ghost');
        expect(errors).toHaveBeenCalledWith('Next user not found for game game_1');
        expect(sentPushes).toEqual([]);
        expect(storedAchievementUnlocks()).toEqual([row(ANN.id, 'snakesandladders.thirteen')]);
    });

    it("judges even when the next player's push can't be sent", async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        offer(turnEnd('snakesandladders.thirteen', (view: ISnakesAndLaddersGameStateResponse, { userId }) => squareOf(view, userId) === 13));
        vi.mocked(sendPushToUsers).mockRejectedValueOnce(new Error('FCM is down'));

        const response = await command(commandPost(diceRoll()));
        await runAfterCallbacks();

        expect(response.status).toBe(200);
        expect(errors).toHaveBeenCalledWith('Post-response turn-notification work failed for game game_1', expect.any(Error));
        expect(storedAchievementUnlocks()).toEqual([row(ANN.id, 'snakesandladders.thirteen')]);
    });

    it('judges nothing at an exhibition table, and still tells the next player', async () => {
        // A guest who hasn't claimed an account: nobody at the table earns
        // anything from a game that counts toward nobody's stats (§8).
        const dave = { id: 'user_dave', username: 'guest_3f2ab9c14d', publicMetadata: { guest: true } };
        signIn(ANN);
        stubClerkUsers(dave);
        seedSnakesAndLadders(
            { userIdList: [ANN.id, dave.id], gameState: { turnOrder: [ANN.id, dave.id], history: [], commandHistory: [] } },
            { [ANN.id]: 10, [dave.id]: 20 });
        const always = checking(() => true);
        offer(turnEnd('snakesandladders.always', always));

        const response = await command(commandPost(diceRoll()));
        await runAfterCallbacks();

        expect(response.status).toBe(200);
        expect(always).not.toHaveBeenCalled();
        expect(storedAchievementUnlocks()).toEqual([]);
        expect(sentPushes.map(push => push.userIds)).toEqual([[dave.id]]);
    });

    it("has nothing to judge or to tell when the roster can't be resolved, and the response is unaffected", async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        offer(turnEnd('snakesandladders.thirteen', (view: ISnakesAndLaddersGameStateResponse, { userId }) => squareOf(view, userId) === 13));
        // Only the post-response lookup fails: the route resolved the mover's
        // name before it, and is done with Clerk by the time it answers.
        const roster = vi.spyOn(clerkUsers, 'usersById').mockRejectedValueOnce(new Error('Clerk is down'));

        const response = await command(commandPost(diceRoll()));
        await expect(runAfterCallbacks()).resolves.toBe(1);

        expect(response.status).toBe(200);
        expect(errors).toHaveBeenCalledWith("Couldn't resolve the roster for the post-response work on game game_1", expect.any(Error));
        expect(storedAchievementUnlocks()).toEqual([]);
        expect(sentPushes).toEqual([]);
        expect(storedGame('game_1')!.currentTurn).toBe(BOB.id);
        roster.mockRestore();
    });

    it("doesn't stop the next player being told, or fail the response, when the judge can't write", async () => {
        signIn(ANN);
        seedSnakesAndLadders();
        offer(turnEnd('snakesandladders.thirteen', (view: ISnakesAndLaddersGameStateResponse, { userId }) => squareOf(view, userId) === 13));
        failNextAchievementUnlockWrite(new Error('boom'));

        const response = await command(commandPost(diceRoll()));
        await expect(runAfterCallbacks()).resolves.toBe(1);

        expect(response.status).toBe(200);
        expect(errors).toHaveBeenCalledWith('Judging achievements for game_1 failed', expect.objectContaining({ message: 'boom' }));
        expect(storedAchievementUnlocks()).toEqual([]);
        expect(sentPushes.map(push => push.userIds)).toEqual([[BOB.id]]);
        // The move itself is saved whatever happens after it.
        expect(storedGame('game_1')!.currentTurn).toBe(BOB.id);
    });
});

describe('POST /api/game/end', () => {
    it('refuses a player the game dropped for going quiet', async () => {
        signIn(ANN);
        seedSnakesAndLadders({
            currentTurn: BOB.id,
            gameState: { turnOrder: [ANN.id, BOB.id], history: [], commandHistory: [], droppedPlayers: [ANN.id] },
        });

        const response = await end(jsonPost('/api/game/end', { gameId: 'game_1' }));

        expect(response.status).toBe(403);
        expect(storedGame('game_1')!.complete).toBe(false);
    });

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
        const move = await command(commandPost(diceRoll()));
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
