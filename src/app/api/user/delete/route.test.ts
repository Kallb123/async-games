// The chat half of account deletion, and the achievement-unlock half. Every
// collection is spied rather than stubbed with a store: what matters here is
// which filters the route deletes by, and in particular that a player's lines
// go from threads that outlive their account — a Kingdom Builder world they are
// still in, or one they left — and that their unlocks go by user, never by
// game, so other players' unlocks from the same games stay theirs.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteUser = vi.fn(async () => undefined);
vi.mock('@clerk/nextjs/server', () => ({
    auth: async () => ({ userId: 'user_ann' }),
    clerkClient: async () => ({ users: { deleteUser } }),
}));
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());

import { NextRequest } from 'next/server';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { InvitationModel } from '@/utils/mongodb/InvitationData';
import { FriendshipModel } from '@/utils/mongodb/FriendshipData';
import { ReactionModel } from '@/utils/mongodb/ReactionData';
import { ChatMessageModel } from '@/utils/mongodb/ChatMessageData';
import { ChatReadModel } from '@/utils/mongodb/ChatReadData';
import { AchievementUnlockModel } from '@/utils/mongodb/AchievementUnlockData';
import { POST } from './route';

const query = (value: unknown) => ({ exec: async () => value }) as never;

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(GameDataModel, 'find').mockReturnValue(query([{ gameId: 'game_1' }]));
    for (const model of [GameDataModel, GameResultModel, InvitationModel, FriendshipModel, ReactionModel, ChatMessageModel, ChatReadModel, AchievementUnlockModel]) {
        vi.spyOn(model, 'deleteMany').mockReturnValue(query({}));
    }
    vi.spyOn(InvitationModel, 'find').mockReturnValue(query([]));
    vi.spyOn(InvitationModel, 'updateMany').mockReturnValue(query({}));
});

describe('POST /api/user/delete', () => {
    it('erases every chat line and read marker of the player, in threads that outlive them too', async () => {
        const messages = vi.spyOn(ChatMessageModel, 'deleteMany').mockReturnValue(query({}));
        const reads = vi.spyOn(ChatReadModel, 'deleteMany').mockReturnValue(query({}));

        const response = await POST(new NextRequest('http://localhost/api/user/delete', { method: 'POST' }));

        expect(response.status).toBe(200);
        // Their games' whole threads, which go with the games...
        expect(messages).toHaveBeenCalledWith({ gameId: { $in: ['game_1'] } });
        expect(reads).toHaveBeenCalledWith({ gameId: { $in: ['game_1'] } });
        // ...and their own lines and markers everywhere else, found by no roster.
        expect(messages).toHaveBeenCalledWith({ senderId: 'user_ann' });
        expect(reads).toHaveBeenCalledWith({ userId: 'user_ann' });
        expect(deleteUser).toHaveBeenCalledWith('user_ann');
    });

    it('erases the player\'s achievement unlocks by user alone, not by game', async () => {
        const unlocks = vi.mocked(AchievementUnlockModel.deleteMany);

        const response = await POST(new NextRequest('http://localhost/api/user/delete', { method: 'POST' }));

        expect(response.status).toBe(200);
        // Keyed by the player alone: an unlock belongs to them, not to the table,
        // so there is no game id in it for a co-player's row to be caught by.
        expect(unlocks).toHaveBeenCalledTimes(1);
        expect(unlocks).toHaveBeenCalledWith({ userId: 'user_ann' });
    });
});
