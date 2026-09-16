// Integration tests over GET /api/lobby/[inviteId] — the request the lobby
// screen repeats every ten seconds while people are arriving, and the one
// that has to tell three things apart: a lobby still filling up, a lobby that
// became a game, and a lobby that is simply over.
//
// The middle one used to be a 404 the screen interpreted, followed by a second
// request to a route of its own. Folding that lookup in here makes the
// difference between "it started" and "it's gone" the server's answer rather
// than the client's inference, and these pin down that it stays scoped: an
// inviteId belonging to somebody else's game must read as gone, not as a game
// id handed out.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('next/server', async () => (await import('@/utils/testing/afterStub')).nextServerStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());

import { ANN, BOB, get, resetApiRouteStubs, seedSnakesAndLadders, signIn, stubClerkUsers } from '@/utils/testing/apiRoute';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { GET as lobby } from './[inviteId]/route';

const INVITE_ID = '22222222-2222-2222-2222-222222222222';

/** The route's own params, which Next hands it as a promise. */
function params(inviteId = INVITE_ID) {
    return { params: Promise.resolve({ inviteId }) };
}

/**
 * A lobby the caller has a seat at, as the route's scoped `findOne` would
 * return it — enough of an invitation for `invitationToResponse` to describe.
 * The invitation collection has no store in the shared harness (nothing else
 * reads it from a route test), so this route's one lookup is stubbed directly.
 */
function seedLobby(invite: Partial<IInvitationDataDocument> = {}) {
    vi.spyOn(InvitationModel, 'findOne').mockReturnValue({
        exec: async () => ({
            inviteId: INVITE_ID,
            senderId: ANN.id,
            userIdList: [{ userId: BOB.id, inviteAccepted: false }],
            timestamp: '2026-01-01T00:00:00.000Z',
            gameFriendlyName: 'Snakes and Ladders',
            joinCode: 'PLUM',
            ...invite
        })
    } as ReturnType<typeof InvitationModel.findOne>);
}

/** No invitation with that id — it was consumed by a start, or it expired. */
function noLobby() {
    vi.spyOn(InvitationModel, 'findOne').mockReturnValue({
        exec: async () => null
    } as ReturnType<typeof InvitationModel.findOne>);
}

beforeEach(async () => {
    await resetApiRouteStubs();
    stubClerkUsers(ANN, BOB);
});

describe('GET /api/lobby/[inviteId]', () => {
    it('answers with the lobby while it is still one', async () => {
        signIn(ANN);
        seedLobby();

        const response = await lobby(get(`/api/lobby/${INVITE_ID}`), params());

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.isHost).toBe(true);
        expect(body.invite.joinCode).toBe('PLUM');
        expect(body.invite.userList).toEqual([{ name: 'bob', accepted: false, userId: BOB.id }]);
        // Not a lobby that has gone anywhere yet, so nothing sends the screen
        // to a board.
        expect(body.startedGame).toBeUndefined();
    });

    it('answers with the game the lobby became, rather than a 404', async () => {
        signIn(ANN);
        noLobby();
        seedSnakesAndLadders({ inviteId: INVITE_ID });

        const response = await lobby(get(`/api/lobby/${INVITE_ID}`), params());

        // A 200 on purpose: this is the transition every lobby makes, and a
        // 404 is an error in the browser's console whatever the client makes
        // of it.
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            success: true,
            startedGame: { gameId: 'game_1', gameUrl: 'snakesandladders' }
        });
    });

    it('404s a lobby that ended without becoming a game', async () => {
        signIn(ANN);
        noLobby();

        const response = await lobby(get(`/api/lobby/${INVITE_ID}`), params());

        expect(response.status).toBe(404);
    });

    it('404s a game the caller is not playing in, rather than handing out its id', async () => {
        // The inviteId names a real, live game — but of somebody else's. It is
        // guessable enough that this must read exactly as a lobby that never
        // existed does.
        signIn({ id: 'user_stranger', username: 'stranger' });
        noLobby();
        seedSnakesAndLadders({ inviteId: INVITE_ID });

        const response = await lobby(get(`/api/lobby/${INVITE_ID}`), params());

        expect(response.status).toBe(404);
    });

    it('401s a caller with no session, so a refreshing cookie retries', async () => {
        noLobby();

        const response = await lobby(get(`/api/lobby/${INVITE_ID}`), params());

        expect(response.status).toBe(401);
    });
});
