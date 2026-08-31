// The admin tooling's two routes (docs/admin-tools.md), and mostly the gate on
// them: one hands out a list of accounts, the other hands out a way *into* one,
// so who may call them and whose account may be minted for are the two things
// worth holding down with tests.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/rateLimit', async () => (await import('@/utils/testing/apiRoute')).rateLimitStub());

import { GET } from './guests/route';
import { POST } from './guests/resume/route';
import {
    ANN,
    BOB,
    get,
    jsonPost,
    mintedSignInTokens,
    resetApiRouteStubs,
    signIn,
    stubClerkUsers,
} from '@/utils/testing/apiRoute';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { InvitationModel } from '@/utils/mongodb/InvitationData';
import { OPEN_SEAT_ID } from '@/utils/games/lobby';
import { GUEST_RESUME_TICKET_TTL_SECONDS } from '@/utils/users/guest';
import type { IAdminGuestResumeResponse, IAdminGuestsResponse } from '@/utils/users/adminGuests';

const ADMIN = { id: 'user_admin', username: 'admin', publicMetadata: { unlocked: true, admin: true } };
const DAVE = {
    id: 'user_guest_dave',
    username: 'guest_2f81c0d4a9b34e6789012345678901ab',
    publicMetadata: { guest: true, displayName: 'Dave' },
    createdAt: Date.parse('2026-08-01T00:00:00.000Z'),
};
const SAM = {
    id: 'user_guest_sam',
    username: 'guest_9a71b0d4a9b34e6789012345678901cd',
    publicMetadata: { guest: true, displayName: 'Sam' },
    createdAt: Date.parse('2026-08-02T00:00:00.000Z'),
};

/** The two collections the guest list reads, standing in for Mongo — the test
 *  game store only looks a game up by id (see apiRoute.ts). */
function stubSeats(games: unknown[], lobbies: unknown[]) {
    const query = (rows: unknown[]) => ({ select: () => ({ lean: () => ({ exec: async () => rows }) }) });
    vi.spyOn(GameDataModel, 'find').mockReturnValue(query(games) as never);
    vi.spyOn(InvitationModel, 'find').mockReturnValue(query(lobbies) as never);
}

const listGuests = async (query = '') => {
    const response = await GET(get(`/api/admin/guests?q=${encodeURIComponent(query)}`));
    return { status: response.status, body: await response.json() as IAdminGuestsResponse };
};

const mintLink = (userId: unknown) => POST(jsonPost('/api/admin/guests/resume', { userId }));

beforeEach(async () => {
    await resetApiRouteStubs();
    stubSeats([], []);
});

describe('GET /api/admin/guests', () => {
    it('refuses a caller who is not signed in', async () => {
        expect((await listGuests()).status).toBe(403);
    });

    it('refuses a signed-in player who is not an admin', async () => {
        signIn({ ...ANN, publicMetadata: { unlocked: true } });

        expect((await listGuests()).status).toBe(403);
    });

    it('lists the unclaimed guests, newest first, and nobody else', async () => {
        signIn(ADMIN);
        stubClerkUsers(ANN, DAVE, SAM);

        const { status, body } = await listGuests();

        expect(status).toBe(200);
        expect(body.guests.map(guest => guest.name)).toEqual(['Sam', 'Dave']);
    });

    it('names the game and the players a guest is sitting with', async () => {
        // The point of the screen: "Dave" is not an identification, "Dave in a
        // Train Time game with Ann" is.
        signIn(ADMIN);
        stubClerkUsers(ANN, BOB, DAVE);
        stubSeats(
            [{
                gameId: 'game_1',
                userIdList: [DAVE.id, ANN.id],
                complete: false,
                gameType: { friendlyName: 'Train Time', url: 'traintime' },
            }],
            [{
                inviteId: 'lobby-1',
                senderId: BOB.id,
                userIdList: [{ userId: DAVE.id, inviteAccepted: true }, { userId: OPEN_SEAT_ID, inviteAccepted: false }],
                gameFriendlyName: 'Outbreak',
            }],
        );

        const { body } = await listGuests();

        expect(body.guests[0].seats).toEqual([
            { game: 'Train Time', state: 'live', others: ['ann'], href: '/games/traintime/game_1' },
            // The unclaimed seat is left out rather than named: it is a
            // placeholder id, not a player.
            { game: 'Outbreak', state: 'lobby', others: ['bob'], href: '/lobby/lobby-1' },
        ]);
    });

    it('still answers for a guest Clerk gave no timestamps for', async () => {
        // One unreadable timestamp shouldn't cost the whole page of rows.
        signIn(ADMIN);
        stubClerkUsers({ ...DAVE, createdAt: undefined as unknown as number });

        const { status, body } = await listGuests();

        expect(status).toBe(200);
        expect(body.guests).toEqual([expect.objectContaining({ createdAt: null, lastActiveAt: null, seats: [] })]);
    });

    it('searches by the name a guest played under', async () => {
        signIn(ADMIN);
        stubClerkUsers(DAVE, SAM);

        expect((await listGuests('dav')).body.guests.map(guest => guest.userId)).toEqual([DAVE.id]);
        expect((await listGuests('nobody')).body.guests).toEqual([]);
    });
});

describe('POST /api/admin/guests/resume', () => {
    it('refuses a caller who is not an admin', async () => {
        signIn({ ...ANN, publicMetadata: { unlocked: true } });
        stubClerkUsers(DAVE);

        expect((await mintLink(DAVE.id)).status).toBe(403);
        expect(mintedSignInTokens).toEqual([]);
    });

    it('refuses a body with no user id', async () => {
        signIn(ADMIN);

        expect((await mintLink(undefined)).status).toBe(400);
        expect(mintedSignInTokens).toEqual([]);
    });

    it('answers 404 for an account Clerk has never heard of', async () => {
        signIn(ADMIN);

        expect((await mintLink('user_nobody')).status).toBe(404);
        expect(mintedSignInTokens).toEqual([]);
    });

    it('refuses to mint a link for a registered account', async () => {
        // The line that keeps this a recovery tool rather than an
        // impersonation one: a guest has no credentials and a link is their
        // designed way in; a real account has a password and a reset flow.
        signIn(ADMIN);
        stubClerkUsers({ ...ANN, publicMetadata: { unlocked: true } });

        const response = await mintLink(ANN.id);

        expect(response.status).toBe(400);
        expect(response.statusText).toBe('Not a guest account');
        expect(mintedSignInTokens).toEqual([]);
    });

    it('mints a resume link for a guest, good for as long as their first one was', async () => {
        signIn(ADMIN);
        stubClerkUsers(DAVE);

        const response = await mintLink(DAVE.id);
        const body = await response.json() as IAdminGuestResumeResponse;

        expect(response.status).toBe(200);
        expect(mintedSignInTokens).toEqual([
            { userId: DAVE.id, expiresInSeconds: GUEST_RESUME_TICKET_TTL_SECONDS },
        ]);
        // The same `/join?resume=…` link the join route hands a brand-new
        // guest, so a returning one arrives at the screen that knows what to
        // do with it.
        expect(body.resumeUrl).toBe(`https://async.games/join?resume=ticket_${DAVE.id}_1`);
        expect(body.name).toBe('Dave');
        expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
    });
});
