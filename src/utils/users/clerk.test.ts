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
        expect(getUserList).toHaveBeenCalledWith({ username: ['someoneelse'], limit: 100 });
        expect(users.map(u => u.id)).toEqual(['user_someone_else']);
    });

    it('always tells Clerk how many users it wants', async () => {
        // Clerk's GET /users answers with ten when nothing says otherwise —
        // a default, not a cap — so an unlimited filtered lookup silently
        // resolved the first ten ids and left the rest unresolved.
        await usersById(['user_a', 'user_b']);
        expect(getUserList).toHaveBeenCalledWith({ userId: ['user_a', 'user_b'], limit: 100 });
    });

    it('pages a lookup bigger than one Clerk page', async () => {
        const ids = Array.from({ length: 250 }, (_, i) => `user_${i}`);
        getUserList.mockImplementation(async ({ userId }: { userId: string[] }) => ({
            data: userId.map((id: string) => ({ id, username: id })),
        }));

        const users = await usersById(ids);

        expect(getUserList).toHaveBeenCalledTimes(3);
        expect(users.map(u => u.id)).toEqual(ids);
        // Every chunk asks for a page, and no chunk is bigger than one.
        for (const [{ userId, limit }] of getUserList.mock.calls) {
            expect(limit).toBe(100);
            expect(userId.length).toBeLessThanOrEqual(100);
        }
    });

    it('leaves an empty seat list empty rather than naming strangers', async () => {
        expect(await userIdListToUsernameList([])).toEqual([]);
        expect(getUserList).not.toHaveBeenCalled();
    });

    it('shows a guest by the name they typed, not their account id', async () => {
        getUserList.mockResolvedValue({
            data: [{ id: 'user_guest_1', username: 'guest_abc123', firstName: 'Dave', publicMetadata: { guest: true } }],
        });

        expect(await userIdListToUsernameList(['user_guest_1'])).toEqual(['Dave']);
    });
});
