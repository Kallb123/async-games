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
import {
    ANN, BOB, resetApiRouteStubs, seedChatMessage, seedChatReadMarker, seedSnakesAndLadders, stubClerkUsers,
} from '@/utils/testing/apiRoute';
import { buildDashboard } from './dashboard';
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
    vi.spyOn(GameResultModel, 'find').mockReturnValue({ sort: () => ({ exec: async () => [] }) } as never);
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
});
