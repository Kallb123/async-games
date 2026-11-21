// What the dashboard reads of a Realm Arena battle: whose turn it is, said so a
// game waiting on the computer's warbands reads as "The enemy's turn" and never
// as a player's, or as a faction a random enemy still hides.

import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());

import { GameDataModel, type IGameDataDocument } from '@/utils/mongodb/GameData';
import { gameDataModelFor } from '@/utils/mongodb/mongodb';
import type { UserDirectory } from '@/utils/users/clerk';

const directory: UserDirectory = {
    name: userId => (userId ? `name:${userId}` : ''),
    imageUrl: () => null,
};

function summaryOf(currentTurn: string, extra: Record<string, unknown> = {}) {
    const plain = {
        gameId: '00000000-0000-4000-8000-000000000001',
        kind: 'RealmArenaGameData',
        gameType: { gameId: 'gt', gameType: 'RealmArena', friendlyName: 'Realm Arena', icon: 'i.png', url: 'realmarena', className: 'RealmArenaGameType' },
        userIdList: ['ann', 'bob'],
        turnTimer: '3 days',
        currentTurn,
        lastTurnTimestamp: '2026-03-04T05:06:07.000Z',
        complete: false,
        specificGameState: { enemy: 'swarm' },
        ...extra,
    };
    return (GameDataModel.hydrate(plain) as IGameDataDocument).CreateResponse(directory);
}

describe('Realm Arena summary', () => {
    it('is built by its own discriminator', () => {
        expect(gameDataModelFor('RealmArena')).toBeDefined();
    });

    it("names a warband's turn \"The enemy\", whatever the faction", () => {
        const summary = summaryOf('ai:0');
        expect(summary.currentTurn).toBe('ai:0');
        expect(summary.currentTurnUsername).toBe('The enemy');
    });

    it("still names a player's turn from the directory, and keeps the rest of the generic summary", () => {
        const summary = summaryOf('bob');
        expect(summary.currentTurnUsername).toBe('name:bob');
        expect(summary.usernameList).toEqual(['name:ann', 'name:bob']);
        expect(summary.friendlyName).toBe('Realm Arena');
    });
});
