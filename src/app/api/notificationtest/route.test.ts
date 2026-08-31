// The Test button's contract: it must tell a player which of the things that
// stop a notification is stopping theirs. "Sent" when nothing was, or "no
// devices" when the channel is merely switched off, sends them to fix the wrong
// thing — and this route exists precisely because the settings screen used to
// report the browser's permission and call that the answer.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/firebase/pushNotification', async () => (await import('@/utils/testing/apiRoute')).pushNotificationStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());

import { rawPost, resetApiRouteStubs, sentPushes, signIn } from '@/utils/testing/apiRoute';
import { NOTIFICATION_TEST_EVENT } from '@/utils/firebase/pushNotification';

const PATH = '/api/notificationtest';

/** The route takes no body at all — the target is the caller, never a field. */
async function sendTest() {
    const { POST } = await import('./route');
    return await POST(rawPost(PATH, ''));
}

function withDevices(count: number, preferences?: unknown) {
    signIn({
        id: 'user_tester',
        privateMetadata: {
            notificationTokens: Array.from({ length: count }, (_, i) => ({ token: `token-${i}` })),
            ...(preferences ? { notificationPreferences: preferences } : {}),
        },
    } as Parameters<typeof signIn>[0]);
}

beforeEach(async () => {
    await resetApiRouteStubs();
});

describe('POST /api/notificationtest', () => {
    it('refuses a caller who is not signed in', async () => {
        const response = await sendTest();

        expect(response.status).toBe(400);
        expect(sentPushes).toHaveLength(0);
    });

    it('says nothing was sent when no device is registered', async () => {
        withDevices(0);

        const response = await sendTest();

        expect(await response.json()).toEqual({ sent: 0, registered: 0, muted: false });
        // Nothing to reach, so nothing is asked of FCM either.
        expect(sentPushes).toHaveLength(0);
    });

    it('says the channel is muted rather than blaming the device', async () => {
        withDevices(2, { enabled: false });

        const response = await sendTest();

        expect(await response.json()).toEqual({ sent: 0, registered: 2, muted: true });
        expect(sentPushes).toHaveLength(0);
    });

    it('reports a muted channel even when notifications are otherwise on', async () => {
        withDevices(1, { enabled: true, channels: { yourTurn: false } });

        const response = await sendTest();

        expect(await response.json()).toMatchObject({ muted: true, sent: 0 });
        expect(sentPushes).toHaveLength(0);
    });

    it('sends to the caller and only the caller, and says how many devices it reached', async () => {
        withDevices(3);

        const response = await sendTest();

        expect(await response.json()).toEqual({ sent: 3, registered: 3, muted: false });
        expect(sentPushes).toHaveLength(1);
        expect(sentPushes[0].userIds).toEqual(['user_tester']);
        expect(sentPushes[0].options?.channel).toBe('yourTurn');
    });

    it('sends it under its own event, with somewhere to go', async () => {
        withDevices(1);

        await sendTest();

        // Its own event, so the test's notification has its own tag and can't
        // replace an unread turn notification.
        expect(sentPushes[0].data.event).toBe(NOTIFICATION_TEST_EVENT);
        // And it carries somewhere to go, or the tap does nothing.
        expect(sentPushes[0].data.link).toBeTruthy();
        expect(sentPushes[0].notification.title).toBeTruthy();
        expect(sentPushes[0].notification.body).toBeTruthy();
    });
});
