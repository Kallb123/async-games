import { beforeEach, describe, expect, it, vi } from 'vitest';

const createUser = vi.fn();
const deleteUser = vi.fn();
const createSignInToken = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
    clerkClient: async () => ({
        users: { createUser, deleteUser },
        signInTokens: { createSignInToken },
    }),
}));

// Safe as a plain import: vitest hoists the vi.mock above it.
import { createGuest, deleteGuest, unclaimedGuestsOf } from './guest';

describe('createGuest', () => {
    beforeEach(() => {
        createUser.mockReset();
        createSignInToken.mockReset();
        createUser.mockResolvedValue({ id: 'user_guest_1' });
        createSignInToken.mockResolvedValue({ token: 'a-sign-in-token' });
    });

    it('creates a Clerk user flagged as a guest, with no password required', async () => {
        await createGuest('Dave');

        expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
            firstName: 'Dave',
            skipPasswordRequirement: true,
            publicMetadata: { guest: true },
        }));
    });

    it('gives every guest a distinct username', async () => {
        await createGuest('Dave');
        await createGuest('Amy');

        const usernames = createUser.mock.calls.map(([params]) => params.username);
        expect(new Set(usernames).size).toBe(2);
    });

    it('gives every guest a throwaway email address matching their username', async () => {
        await createGuest('Dave');

        const [{ username, emailAddress }] = createUser.mock.calls[0];
        expect(emailAddress).toEqual([`${username}@guests.asyncgames.com`]);
    });

    it('mints a sign-in token for the new user and hands back the ticket', async () => {
        const guest = await createGuest('Dave');

        expect(createSignInToken).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_guest_1' }));
        expect(guest).toEqual({ userId: 'user_guest_1', ticket: 'a-sign-in-token', resumeTicket: 'a-sign-in-token' });
    });

    it('mints the resume ticket with a longer expiry than the join ticket', async () => {
        await createGuest('Dave');

        const expiries = createSignInToken.mock.calls.map(([params]) => params.expiresInSeconds);
        expect(expiries).toHaveLength(2);
        expect(Math.max(...expiries)).toBeGreaterThan(Math.min(...expiries));
    });
});

describe('deleteGuest', () => {
    beforeEach(() => {
        deleteUser.mockReset();
    });

    it('deletes the Clerk user by id', async () => {
        await deleteGuest('user_guest_1');

        expect(deleteUser).toHaveBeenCalledWith('user_guest_1');
    });
});

describe('unclaimedGuestsOf', () => {
    it('picks out only the players flagged as guests', () => {
        const users = [
            { id: 'user_real', username: 'dave', firstName: null, publicMetadata: {} },
            { id: 'user_guest_1', username: 'guest_abc123', firstName: 'Dave', publicMetadata: { guest: true } },
        ] as any;

        const { unclaimedPlayerIds, guestNames } = unclaimedGuestsOf(users);

        expect(unclaimedPlayerIds).toEqual(['user_guest_1']);
        expect(guestNames).toEqual(new Map([['user_guest_1', 'Dave']]));
    });

    it('is empty for a roster with no guests', () => {
        const users = [{ id: 'user_real', username: 'dave', publicMetadata: {} }] as any;

        expect(unclaimedGuestsOf(users)).toEqual({ unclaimedPlayerIds: [], guestNames: new Map() });
    });
});
