import { beforeEach, describe, expect, it, vi } from 'vitest';

// Clerk's own client is the thing under test here — specifically that we never
// hand it an empty filter, because it answers one with the whole user list.
const getUserList = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
    clerkClient: async () => ({ users: { getUserList } }),
}));

// Safe as a plain import: vitest hoists the vi.mock above it, so ./clerk
// never pulls in the real Clerk client.
import { usersById, usersByUsername, userIdListToUsernameList } from './clerk';

describe('Clerk user lookups', () => {
    beforeEach(() => {
        getUserList.mockReset();
        // What a real instance would return for a filter Clerk ignores: every
        // user it has, not the nothing the caller asked for.
        getUserList.mockResolvedValue({ data: [{ id: 'user_someone_else', username: 'someoneelse' }] });
    });

    it('never asks Clerk to resolve an empty username list', async () => {
        expect(await usersByUsername([])).toEqual([]);
        expect(getUserList).not.toHaveBeenCalled();
    });

    it('never asks Clerk to resolve an empty userId list', async () => {
        expect(await usersById([])).toEqual([]);
        expect(getUserList).not.toHaveBeenCalled();
    });

    it('still resolves a list that has names in it', async () => {
        const users = await usersByUsername(['someoneelse']);
        expect(getUserList).toHaveBeenCalledWith({ username: ['someoneelse'] });
        expect(users.map(u => u.id)).toEqual(['user_someone_else']);
    });

    it('leaves an empty seat list empty rather than naming strangers', async () => {
        expect(await userIdListToUsernameList([])).toEqual([]);
        expect(getUserList).not.toHaveBeenCalled();
    });
});
