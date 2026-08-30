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
import { createGuest, deleteGuest, isGuestPlaceholderEmail, unclaimedGuestsOf } from './guest';
import { isGuestPlaceholderUsername } from '@/utils/ui/players';

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
            skipPasswordRequirement: true,
            // The name they typed goes in the same field a registered player
            // sets from their profile, so claiming an account keeps the name
            // they have been playing under rather than moving it.
            publicMetadata: { guest: true, displayName: 'Dave' },
        }));
    });

    it('gives every guest a distinct username', async () => {
        await createGuest('Dave');
        await createGuest('Amy');

        const usernames = createUser.mock.calls.map(([params]) => params.username);
        expect(new Set(usernames).size).toBe(2);
    });

    it('holds no real name for a guest', async () => {
        // A guest's typed name is a display name, not a first name — the app
        // stopped keeping Clerk's name fields at all, and writing one here
        // would be the last place still doing it.
        await createGuest('Dave');

        const [params] = createUser.mock.calls[0];
        expect(params).not.toHaveProperty('firstName');
        expect(params).not.toHaveProperty('lastName');
    });

    it('mints a username publicHandle will recognise as an account id', async () => {
        // The two halves of one contract: guest.ts mints the shape, players.ts
        // matches it. Without this, a guest who claims their account (which
        // clears publicMetadata.guest) starts showing their account id as a
        // handle the moment either side drifts.
        await createGuest('Dave');

        const [{ username }] = createUser.mock.calls[0];
        expect(isGuestPlaceholderUsername(username)).toBe(true);
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

describe('isGuestPlaceholderEmail', () => {
    it('matches an address on the throwaway guest domain', () => {
        expect(isGuestPlaceholderEmail('guest_abc123@guests.asyncgames.com')).toBe(true);
    });

    it('does not match a real address, even on a similar domain', () => {
        expect(isGuestPlaceholderEmail('dave@example.com')).toBe(false);
        expect(isGuestPlaceholderEmail('dave@asyncgames.com')).toBe(false);
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
