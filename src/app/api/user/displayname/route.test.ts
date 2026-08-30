import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());

import { POST } from './route';
import { ANN, jsonPost, metadataWrites, resetApiRouteStubs, signIn } from '@/utils/testing/apiRoute';
import { DISPLAY_NAME_RULE, MAX_DISPLAY_NAME_LENGTH } from '@/utils/users/displayName';
import { consumeRateLimit } from '@/utils/rateLimit';

const post = (displayName: unknown) => POST(jsonPost('/api/user/displayname', { displayName }));

/** A guest, who has no handle to fall back on. */
const GUEST = {
    id: 'user_guest_1',
    username: 'guest_2f81c0d4a9b34e6789012345678901ab',
    publicMetadata: { guest: true, displayName: 'Dave' },
};

beforeEach(async () => {
    await resetApiRouteStubs();
});

describe('POST /api/user/displayname', () => {
    it('refuses anyone who is not signed in', async () => {
        expect((await post('Dave')).status).toBe(400);
        expect(metadataWrites).toHaveLength(0);
    });

    it('stores the name a signed-in player chose', async () => {
        signIn(ANN);

        expect((await post('Dave the Destroyer')).status).toBe(200);
        expect(metadataWrites).toEqual([
            { userId: ANN.id, publicMetadata: { displayName: 'Dave the Destroyer' } },
        ]);
    });

    it('trims what it stores', async () => {
        signIn(ANN);

        await post('  Dave  ');

        expect(metadataWrites[0].publicMetadata).toEqual({ displayName: 'Dave' });
    });

    it('leaves the rest of the metadata bag alone', async () => {
        // The same bag carries `guest` and `unlocked`. A write that replaced it
        // would sign a player out of the app or turn them back into a guest.
        signIn({ ...ANN, publicMetadata: { unlocked: true } });

        await post('Dave');

        expect(metadataWrites[0].publicMetadata).not.toHaveProperty('unlocked');
    });

    it('refuses a name the display-name rule rejects', async () => {
        signIn(ANN);

        expect((await post('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1))).status).toBe(400);
        expect((await post('<script>')).status).toBe(400);
        expect((await post("'.-"))).toMatchObject({ status: 400 });
        expect(metadataWrites).toHaveLength(0);
    });

    it('says why it refused, in the body', async () => {
        // statusText is empty over HTTP/2, so a refusal that lived only there
        // would reach the player as their caller's generic fallback — and a
        // sentence with a dash in it throws outright on the way into a header.
        signIn(ANN);

        const response = await post('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1));

        expect(await response.json()).toEqual({ error: DISPLAY_NAME_RULE });
    });

    it('spends the caller allowance before reading them from Clerk', async () => {
        // The refusals below the rate limit are the cheap ones to spam, and
        // currentUser() is a Backend API call — so metering has to come first
        // or a bad body is a free way to burn Clerk quota.
        signIn(ANN);
        vi.mocked(consumeRateLimit).mockResolvedValueOnce(false);

        expect((await post('Dave')).status).toBe(429);
        expect(metadataWrites).toHaveLength(0);
    });

    it('refuses a body with no name in it at all', async () => {
        signIn(ANN);

        expect((await post(undefined)).status).toBe(400);
        expect((await post(42)).status).toBe(400);
        expect(metadataWrites).toHaveLength(0);
    });

    it('lets a player with a handle clear their display name', async () => {
        signIn({ ...ANN, publicMetadata: { displayName: 'Dave' } });

        expect((await post('')).status).toBe(200);
        // null rather than "", so chosenName sees an absence rather than
        // having to read an empty string as one.
        expect(metadataWrites[0].publicMetadata).toEqual({ displayName: null });
    });

    it('refuses to leave a guest with no name at all', async () => {
        signIn(GUEST);

        expect((await post('')).status).toBe(400);
        expect(metadataWrites).toHaveLength(0);
    });

    it('lets a guest change the name they typed', async () => {
        signIn(GUEST);

        expect((await post('Amy')).status).toBe(200);
        expect(metadataWrites[0].publicMetadata).toEqual({ displayName: 'Amy' });
    });
});
