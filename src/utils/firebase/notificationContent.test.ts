import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IGameData } from '@/utils/mongodb/GameData';
import type { IEventFeed, IGameEvent } from '@/utils/games/recap';

// The recap engine is exercised by each game's own recap tests; here it's stubbed
// so these tests are about the copy, not about replaying a real game.
const buildEventFeed = vi.hoisted(() => vi.fn());
vi.mock('@/utils/games/recap', () => ({ buildEventFeed }));

import {
    buildFriendAcceptedNotification,
    buildFriendInviteNotification,
    buildGameInviteNotification,
    buildGameLostNotification,
    buildGameWonNotification,
    buildNudgeNotification,
    buildReactionNotification,
    buildTeamResultNotification,
    buildTurnExpiringNotification,
    buildYourTurnNotification,
} from './notificationContent';

const NO_RECAP: IEventFeed = { hasRecap: false, events: [], summary: null, tip: null };

function event(overrides: Partial<IGameEvent> = {}): IGameEvent {
    return {
        id: 'e1',
        commandId: 'c1',
        timestamp: '2026-07-21T09:00:00.000Z',
        actorId: 'u2',
        actorUsername: 'Priya',
        type: 'sl_ladder',
        glyph: '🪜',
        title: 'Priya rolled 3, climbed a ladder',
        detail: '51 → 55 → up to 68',
        ...overrides,
    };
}

function game(overrides: Partial<IGameData> = {}): IGameData {
    return {
        gameId: 'g1',
        gameType: { friendlyName: 'Snakes and Ladders', url: 'snakesandladders' },
        userIdList: ['u1', 'u2'],
        currentTurn: 'u1',
        lastTurnTimestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        gameState: { turnOrder: ['u1', 'u2'], history: [], commandHistory: [] },
        complete: false,
        winner: '',
        ...overrides,
    } as unknown as IGameData;
}

const names = { u1: 'Kal', u2: 'Priya' };

describe('your turn notification', () => {
    beforeEach(() => {
        buildEventFeed.mockReset();
        buildEventFeed.mockResolvedValue(NO_RECAP);
    });

    it('names the game in the title so a player with several games knows which one', async () => {
        const push = await buildYourTurnNotification(game(), 'u1', names);
        expect(push.title).toBe('Your move in Snakes and Ladders');
    });

    it('leads the body with the last thing that happened', async () => {
        buildEventFeed.mockResolvedValue({ ...NO_RECAP, hasRecap: true, events: [event()] });

        const push = await buildYourTurnNotification(game(), 'u1', names);
        expect(push.body).toBe('🪜 Priya rolled 3, climbed a ladder — 51 → 55 → up to 68.');
    });

    it('counts the other missed moves instead of listing them', async () => {
        buildEventFeed.mockResolvedValue({
            ...NO_RECAP,
            hasRecap: true,
            events: [event({ id: 'e0' }), event({ id: 'e1' }), event({ id: 'e2', title: 'Priya hit a snake', detail: undefined })],
        });

        const push = await buildYourTurnNotification(game(), 'u1', names);
        expect(push.body).toBe('🪜 Priya hit a snake, plus 2 more moves while you were away.');
    });

    it('falls back to the newest history line for games with no recap adapter', async () => {
        const push = await buildYourTurnNotification(
            game({ gameState: { turnOrder: [], history: ['Priya guessed 4 pegs'], commandHistory: [] } } as Partial<IGameData>),
            'u1',
            names
        );
        expect(push.body).toBe('Priya guessed 4 pegs.');
    });

    it('degrades to the history line when the recap engine throws', async () => {
        buildEventFeed.mockRejectedValue(new Error('cannot replay this game'));

        const push = await buildYourTurnNotification(
            game({ gameState: { turnOrder: [], history: ['Priya built a settlement'], commandHistory: [] } } as Partial<IGameData>),
            'u1',
            names
        );
        expect(push.body).toBe('Priya built a settlement.');
    });

    it('falls back to a generic prompt when there is nothing to report', async () => {
        const push = await buildYourTurnNotification(game(), 'u1', names);
        expect(push.body).toBe('The board is waiting on your move.');
    });

    it('says a game has just started rather than describing setup', async () => {
        const push = await buildYourTurnNotification(game(), 'u1', names, { gameJustStarted: true });
        expect(push.body).toContain(`you're first to play`);
        expect(buildEventFeed).not.toHaveBeenCalled();
    });

    it('says who timed out when the turn arrived by expiry', async () => {
        const push = await buildYourTurnNotification(game(), 'u1', names, { timedOutName: 'Priya' });
        expect(push.body).toBe('Priya ran out of time, so the turn passes to you.');
    });

    it('truncates a runaway event title', async () => {
        buildEventFeed.mockResolvedValue({ ...NO_RECAP, hasRecap: true, events: [event({ title: 'x'.repeat(300), detail: undefined, glyph: undefined })] });

        const push = await buildYourTurnNotification(game(), 'u1', names);
        expect(push.body?.length).toBe(140);
        expect(push.body?.endsWith('…')).toBe(true);
    });

    it('uses the game its own artwork, never another game icon', async () => {
        expect((await buildYourTurnNotification(game(), 'u1', names)).imageUrl).toBeUndefined();

        const diceCities = game({ gameType: { friendlyName: 'Dice Cities', url: 'dicecities' } } as Partial<IGameData>);
        expect((await buildYourTurnNotification(diceCities, 'u1', names)).imageUrl).toContain('/art/dicecities/icon.png');
    });
});

describe('other push copy', () => {
    it('sells the game with its tagline on an invite', () => {
        const push = buildGameInviteNotification('Priya', 'Snakes and Ladders');
        expect(push.title).toBe('Priya challenged you to Snakes & Ladders');
        expect(push.body).toBe('Climb the ladders, dodge the snakes, race to 100. Tap to accept and get playing.');
    });

    it('still invites for a game with no metadata entry', () => {
        const push = buildGameInviteNotification('Priya', 'Tiddlywinks');
        expect(push.title).toBe('Priya challenged you to Tiddlywinks');
        expect(push.body).toBe('Tap to accept and get playing.');
    });

    it('tells the winner who they beat and how long it took', () => {
        const won = buildGameWonNotification(game({ gameState: { turnOrder: [], history: [], commandHistory: new Array(34) } } as Partial<IGameData>), ['Priya']);
        expect(won.title).toBe('🏆 You won Snakes and Ladders!');
        expect(won.body).toBe('You beat Priya in 34 moves. Line up a rematch?');
    });

    it('names the winner and offers a rematch to everyone else', () => {
        const lost = buildGameLostNotification(game({ gameState: { turnOrder: [], history: [], commandHistory: new Array(34) } } as Partial<IGameData>), 'Priya');
        expect(lost.title).toBe('Priya won Snakes and Ladders');
        expect(lost.body).toContain('34 moves');
    });

    it('reports a game that ended with no winner', () => {
        const drawn = buildGameLostNotification(game(), '');
        expect(drawn.title).toBe('Snakes and Ladders is over');
        expect(drawn.body).toContain('no winner');
    });

    it('tells a co-op table it won together', () => {
        const won = buildTeamResultNotification(game({ gameState: { turnOrder: [], history: [], commandHistory: new Array(34) } } as Partial<IGameData>), true);
        expect(won.title).toBe('🏆 Your team won Snakes and Ladders!');
        expect(won.body).toBe('You pulled it off together in 34 moves. Another run?');
    });

    it('tells a co-op table it lost together, naming nobody', () => {
        const lost = buildTeamResultNotification(game({ gameState: { turnOrder: [], history: [], commandHistory: new Array(34) } } as Partial<IGameData>), false);
        expect(lost.title).toBe('Your team lost Snakes and Ladders');
        expect(lost.body).toBe('It got away from you after 34 moves. Try again?');
    });

    it('says how long a nudger has been waiting', () => {
        const push = buildNudgeNotification('Priya', game());
        expect(push.title).toBe('👉 Priya is waiting on you');
        expect(push.body).toBe(`It's been 3 hours since your turn came round in Snakes and Ladders.`);
    });

    it('puts the time left in the expiry warning title', () => {
        const push = buildTurnExpiringNotification(game(), '10 minutes');
        expect(push.title).toBe('⏳ 10 minutes left in Snakes and Ladders');
    });

    it('says which move a reaction landed on', () => {
        const push = buildReactionNotification('Priya', '🎉', 'Kal rolled 3, climbed a ladder');
        expect(push.title).toBe('Priya reacted 🎉');
        expect(push.body).toBe('To your move: Kal rolled 3, climbed a ladder');
    });

    it('points friend requests at playing together', () => {
        expect(buildFriendInviteNotification('Priya').title).toBe('Priya wants to be friends');
        expect(buildFriendAcceptedNotification('Priya').body).toContain('challenge them to a game');
    });
});
