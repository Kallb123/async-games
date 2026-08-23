import { beforeEach, describe, expect, it, vi } from 'vitest';

const createUser = vi.fn();
const createSignInToken = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
    clerkClient: async () => ({
        users: { createUser },
        signInTokens: { createSignInToken },
    }),
}));

// Safe as a plain import: vitest hoists the vi.mock above it.
import { createGuest, unclaimedGuestsOf } from './guest';

describe('createGuest', () => {
    beforeEach(() => {
        createUser.mockReset();
        createSignInToken.mockReset();
        createUser.mockResolvedValue({ id: 'user_guest_1' });
        createSignInToken.mockResolvedValue({ token: 'a-sign-in-token' });
    });

    it('creates a Clerk user flagged as a guest, with no password required', async () => {
        await createGuest();

        expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
            skipPasswordRequirement: true,
            publicMetadata: { guest: true },
        }));
    });

    it('gives every guest a distinct username', async () => {
        await createGuest();
        await createGuest();

        const usernames = createUser.mock.calls.map(([params]) => params.username);
        expect(new Set(usernames).size).toBe(2);
    });

    it('mints a sign-in token for the new user and hands back the ticket', async () => {
        const guest = await createGuest();

        expect(createSignInToken).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user_guest_1' }));
        expect(guest).toEqual({ userId: 'user_guest_1', ticket: 'a-sign-in-token' });
    });
});

describe('unclaimedGuestsOf', () => {
    it('picks out only the players flagged as guests', () => {
        const users = [
            { id: 'user_real', username: 'dave', publicMetadata: {} },
            { id: 'user_guest_1', username: 'guest_abc123', publicMetadata: { guest: true } },
        ] as any;

        const { unclaimedPlayerIds, guestNames } = unclaimedGuestsOf(users);

        expect(unclaimedPlayerIds).toEqual(['user_guest_1']);
        expect(guestNames).toEqual(new Map([['user_guest_1', 'guest_abc123']]));
    });

    it('is empty for a roster with no guests', () => {
        const users = [{ id: 'user_real', username: 'dave', publicMetadata: {} }] as any;

        expect(unclaimedGuestsOf(users)).toEqual({ unclaimedPlayerIds: [], guestNames: new Map() });
    });
});
