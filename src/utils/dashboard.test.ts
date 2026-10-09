// buildDashboard's per-game unread chat count (docs/in-game-chat.md §13.5) —
// the commit the phase exists for: a player who has muted the chat channel
// now learns there is something to read without opening the game.
//
// The other four collections buildDashboard reads (invitations and completed
// results) are stubbed to empty here, since they have their own tests
// elsewhere; what this file guards is the count, exercised across several
// live games at once so the aggregate's one-$or-clause-per-game shape is
// proven independent per game, not just correct for a single one.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());

import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { InvitationModel } from '@/utils/mongodb/InvitationData';
import { ChatMessageModel } from '@/utils/mongodb/ChatMessageData';
import { KingdomBuilderSettlementModel } from '@/games/KingdomBuilder';
import {
    ANN, BOB, resetApiRouteStubs, seedChatMessage, seedChatReadMarker, seedSnakesAndLadders, stubClerkUsers,
} from '@/utils/testing/apiRoute';
import { buildDashboard, completedGameResults } from './dashboard';
import { DASHBOARD_COMPLETED_LIMIT } from './apiModels/GameDataApi';
import type { IDashboardResponse } from './apiModels/GameDataApi';

/** Every game on the dashboard, keyed by id, whichever of the two turn lists
 *  it landed in — the count doesn't care whose turn it is. */
function unreadCounts(dashboard: IDashboardResponse): Record<string, number | undefined> {
    return Object.fromEntries(
        [...dashboard.myTurn, ...dashboard.theirTurn].map(game => [game.gameId, game.unreadChatCount])
    );
}

beforeEach(async () => {
    await resetApiRouteStubs();
    stubClerkUsers(ANN, BOB);
    vi.spyOn(InvitationModel, 'find').mockReturnValue({ exec: async () => [] } as never);
    vi.spyOn(GameResultModel, 'find').mockReturnValue({ sort: () => ({ limit: () => ({ exec: async () => [] }), exec: async () => [] }) } as never);
    vi.spyOn(KingdomBuilderSettlementModel, 'find').mockReturnValue({
        select: () => ({ lean: async () => [] }),
    } as never);
});

describe('buildDashboard unread chat counts', () => {
    it("answers each live game's unread count independently", async () => {
        // A game with messages since the marker.
        seedSnakesAndLadders({ gameId: 'game_unread' });
        seedChatReadMarker({ gameId: 'game_unread', userId: ANN.id, readAt: '2026-01-01T00:00:00.000Z' });
        seedChatMessage({ messageId: 'm1', gameId: 'game_unread', senderId: BOB.id, text: 'hi', timestamp: '2026-01-02T00:00:00.000Z' });
        seedChatMessage({ messageId: 'm2', gameId: 'game_unread', senderId: BOB.id, text: 'you there?', timestamp: '2026-01-03T00:00:00.000Z' });

        // A game read right up to the newest message.
        seedSnakesAndLadders({ gameId: 'game_read' });
        seedChatMessage({ messageId: 'm3', gameId: 'game_read', senderId: BOB.id, text: 'hi', timestamp: '2026-01-02T00:00:00.000Z' });
        seedChatReadMarker({ gameId: 'game_read', userId: ANN.id, readAt: '2026-01-02T00:00:00.000Z' });

        // A game whose only message since the beginning of time is the
        // viewer's own — no marker needed, because you never have unread mail
        // from yourself.
        seedSnakesAndLadders({ gameId: 'game_own_message' });
        seedChatMessage({ messageId: 'm4', gameId: 'game_own_message', senderId: ANN.id, text: 'gg', timestamp: '2026-01-02T00:00:00.000Z' });

        // A game the viewer has never opened the thread of at all.
        seedSnakesAndLadders({ gameId: 'game_no_marker' });
        seedChatMessage({ messageId: 'm5', gameId: 'game_no_marker', senderId: BOB.id, text: 'hi', timestamp: '2026-01-02T00:00:00.000Z' });

        const dashboard = await buildDashboard(ANN.id);
        const counts = unreadCounts(dashboard);

        expect(counts.game_unread).toBe(2);
        expect(counts.game_read).toBe(0);
        expect(counts.game_own_message).toBe(0);
        expect(counts.game_no_marker).toBe(1);
    });

    it('answers zero rather than leaving the field out for a game with no chat at all', async () => {
        seedSnakesAndLadders({ gameId: 'game_silent' });

        const dashboard = await buildDashboard(ANN.id);

        expect(unreadCounts(dashboard).game_silent).toBe(0);
    });

    it('still answers the turn lists when the chat count read fails', async () => {
        seedSnakesAndLadders({ gameId: 'game_1' });
        seedChatMessage({ messageId: 'm1', gameId: 'game_1', senderId: BOB.id, text: 'hi', timestamp: '2026-01-02T00:00:00.000Z' });
        vi.spyOn(ChatMessageModel, 'aggregate').mockRejectedValue(new Error('Mongo hiccup'));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const dashboard = await buildDashboard(ANN.id);

        // A wrong badge, not a dead dashboard: the game is still there, just
        // with no count rather than a thrown request.
        expect(dashboard.myTurn).toHaveLength(1);
        expect(unreadCounts(dashboard).game_1).toBe(0);
    });

    it('still answers the turn lists when the Kingdom Builder read fails', async () => {
        seedSnakesAndLadders({ gameId: 'game_1' });
        vi.mocked(KingdomBuilderSettlementModel.find).mockImplementation(() => {
            throw new Error('Kingdom Builder Mongo hiccup');
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        const dashboard = await buildDashboard(ANN.id);

        expect(dashboard.myTurn).toHaveLength(1);
        expect(dashboard.worlds).toEqual([]);
    });
});

describe('buildDashboard world invitations', () => {
    it("drops a world invitation from Invites once the player has joined the world, and keeps it until then", async () => {
        const invite = (accepted: boolean) => ({
            inviteId: '33333333-3333-4333-8333-333333333333',
            senderId: ANN.id,
            userIdList: [{ userId: BOB.id, inviteAccepted: accepted }],
            timestamp: '2026-01-01T00:00:00.000Z',
            gameFriendlyName: 'Kingdom Builder',
            worldId: '64b000000000000000000001',
        });

        vi.spyOn(InvitationModel, 'find').mockReturnValue({ exec: async () => [invite(false)] } as never);
        expect((await buildDashboard(BOB.id)).incoming).toHaveLength(1);

        vi.spyOn(InvitationModel, 'find').mockReturnValue({ exec: async () => [invite(true)] } as never);
        expect((await buildDashboard(BOB.id)).incoming).toEqual([]);
    });
});

describe('buildDashboard finished games', () => {
    /** `n` results, newest first, behind a GameResult find that honours `.limit()` like the driver. */
    function stubResults(n: number) {
        const limits: (number | undefined)[] = [];
        const projections: unknown[] = [];
        const results = Array.from({ length: n }, (_, i) => ({
            gameId: `done_${i}`, url: 'snakesandladders', winner: ANN.id, endReason: 'win',
            endedAt: `2026-02-${String(28 - i).padStart(2, '0')}T00:00:00.000Z`,
        }));
        vi.spyOn(GameResultModel, 'find').mockImplementation(((_filter: unknown, projection: unknown) => {
            projections.push(projection);
            let cap = results.length;
            const query = {
                sort: () => query,
                limit: (count: number) => { limits.push(count); cap = count; return query; },
                exec: async () => results.slice(0, cap),
            };
            return query;
        }) as never);
        return { limits, projections };
    }

    it('asks for one more than the screen shows, and hands the extra row back', async () => {
        const { limits } = stubResults(DASHBOARD_COMPLETED_LIMIT + 5);

        const dashboard = await buildDashboard(ANN.id);

        expect(limits).toEqual([DASHBOARD_COMPLETED_LIMIT + 1]);
        expect(dashboard.completed).toHaveLength(DASHBOARD_COMPLETED_LIMIT + 1);
        // Newest first: the cap trims the oldest, not the newest.
        expect(dashboard.completed[0].gameId).toBe('done_0');
    });

    it('hands back no extra row when the screen shows every finished game', async () => {
        // MyCompleteList offers "See all" only when it is handed more rows than
        // its limit, so exactly that many must come back as exactly that many.
        stubResults(DASHBOARD_COMPLETED_LIMIT);

        expect((await buildDashboard(ANN.id)).completed).toHaveLength(DASHBOARD_COMPLETED_LIMIT);
    });

    it('reads only the fields a finished-game row uses, and the full history route reads them all', async () => {
        const { projections } = stubResults(2);

        await buildDashboard(ANN.id);
        await completedGameResults(ANN.id);

        expect(projections).toHaveLength(2);
        for (const projection of projections) {
            expect(Object.keys(projection as object).sort()).toEqual(
                ['endDetail', 'endReason', 'endedAt', 'forfeitedBy', 'gameId', 'url', 'winner']);
        }
    });

    it('returns every finished game when no limit is given', async () => {
        const { limits } = stubResults(DASHBOARD_COMPLETED_LIMIT + 5);

        expect(await completedGameResults(ANN.id)).toHaveLength(DASHBOARD_COMPLETED_LIMIT + 5);
        expect(limits).toEqual([]);
    });
});

describe('buildDashboard timing', () => {
    it('times the chat count and the Kingdom Builder read as spans of their own, side by side', async () => {
        seedSnakesAndLadders({ gameId: 'game_1' });
        const spans: string[] = [];
        const open: string[] = [];
        let overlapped = false;

        await buildDashboard(ANN.id, async (name, work) => {
            spans.push(name);
            open.push(name);
            if (open.includes('unread_chat') && open.includes('kb_worlds')) overlapped = true;
            try { return await work(); } finally { open.splice(open.indexOf(name), 1); }
        });

        expect(spans).toEqual(expect.arrayContaining(['mongo_query', 'player_directory', 'unread_chat', 'kb_worlds', 'response_build']));
        expect(overlapped).toBe(true);
    });
});
