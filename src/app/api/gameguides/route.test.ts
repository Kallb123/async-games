import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());

import { currentUser } from '@clerk/nextjs/server';
import { metadataWrites, rawPost, resetApiRouteStubs, signIn, signInUnresolvable } from '@/utils/testing/apiRoute';
import { GET, POST } from './route';

const USER = 'user_reader';
const post = (game: unknown = 'realmarena', kind: unknown = 'tutorial') => POST(rawPost('/api/gameguides', JSON.stringify({ game, kind, userId: 'user_other' })));

beforeEach(async () => {
    await resetApiRouteStubs();
});

describe('/api/gameguides', () => {
    it('returns 401 for signed-out reads and writes so session retry can run', async () => {
        expect((await GET()).status).toBe(401);
        expect((await post()).status).toBe(401);
        expect(metadataWrites).toHaveLength(0);
    });

    it('returns 401 when the current account can no longer be resolved', async () => {
        signInUnresolvable(USER);
        expect((await GET()).status).toBe(401);
    });

    it('reads legacy lists together with new per-game flags without migrating or losing history', async () => {
        signIn({ id: USER, privateMetadata: {
            seenGameGuides: ['outbreak', 5, 'realmarena'],
            seenGameTutorials: ['racecars'],
            gameIntroProgress: {
                seenGameGuides: { realmarena: true, dicecities: true, firesout: false },
                seenGameTutorials: { realmarena: true, dicecities: 'true' },
            },
        } });
        expect(await (await GET()).json()).toEqual({
            seen: ['outbreak', 'realmarena', 'dicecities'],
            seenTutorials: ['racecars', 'realmarena'],
        });
        expect(metadataWrites).toHaveLength(0);
    });

    it.each([null, [], 'bad', { seenGameGuides: [], seenGameTutorials: null }])('ignores malformed stored progress: %j', async progress => {
        signIn({ id: USER, privateMetadata: { gameIntroProgress: progress } });
        expect(await (await GET()).json()).toEqual({ seen: [], seenTutorials: [] });
    });

    it.each(['forward', 'reverse'])('preserves concurrent saves across lists and games (%s order)', async order => {
        signIn({ id: USER, privateMetadata: {
            seenGameGuides: ['outbreak'],
            seenGameTutorials: ['racecars'],
            notificationTokens: [{ token: 'test-token' }],
        } });
        const dismissals = [
            { game: 'realmarena', kind: 'guide', key: 'seenGameGuides' },
            { game: 'realmarena', kind: 'tutorial', key: 'seenGameTutorials' },
            { game: 'dicecities', kind: 'tutorial', key: 'seenGameTutorials' },
            { game: 'realmarena', kind: 'tutorial', key: 'seenGameTutorials' },
        ];
        if (order === 'reverse') dismissals.reverse();
        const responses = await Promise.all(dismissals.map(({ game, kind }) => post(game, kind)));
        expect(responses.map(response => response.status)).toEqual([200, 200, 200, 200]);
        expect(metadataWrites).toEqual(dismissals.map(({ game, key }) => ({
            userId: USER,
            // Only one monotonic flag may be patched. Never write snapshots of
            // arrays or sibling metadata, even if they were read moments ago.
            privateMetadata: { gameIntroProgress: { [key]: { [game]: true } } },
        })));
        const progress = await (await GET()).json();
        expect(progress.seen).toEqual(['outbreak', 'realmarena']);
        expect(progress.seenTutorials).toEqual(expect.arrayContaining(['racecars', 'realmarena', 'dicecities']));
        expect(progress.seenTutorials).toHaveLength(3);
        expect((await currentUser())?.privateMetadata.notificationTokens).toEqual([{ token: 'test-token' }]);
    });

    it('keeps the POST response compatible with legacy readers', async () => {
        signIn({ id: USER, privateMetadata: { seenGameTutorials: ['racecars'] } });
        expect(await (await post()).json()).toEqual({ seen: ['racecars', 'realmarena'] });
    });

    it.each(['constructor', '__proto__', 'toString', 'not-a-game', null, 5])('rejects an unregistered game: %j', async game => {
        signIn({ id: USER });
        expect((await post(game)).status).toBe(400);
        expect(metadataWrites).toHaveLength(0);
    });

    it('defaults kind to guide without letting it select an arbitrary metadata key', async () => {
        signIn({ id: USER });
        expect((await post('realmarena', 'unlocked')).status).toBe(200);
        expect(metadataWrites[0]).toEqual({ userId: USER, privateMetadata: {
            gameIntroProgress: { seenGameGuides: { realmarena: true } },
        } });
    });
});
