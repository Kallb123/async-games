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

describe('telling two players with the same display name apart', () => {
    beforeEach(() => {
        getUserList.mockReset();
    });

    // A seated player as Clerk hands them back: the name they chose lives in
    // publicMetadata, and `displayName: null` is somebody still going by their
    // handle.
    const seat = (id: string, displayName: string | null, username: string | null, guest = false) =>
        ({ id, username, publicMetadata: { guest, ...(displayName ? { displayName } : {}) } });

    const seated = (...users: ReturnType<typeof seat>[]) => {
        getUserList.mockResolvedValue({ data: users });
        return userIdListToUsernameList(users.map(u => u.id));
    };

    it('leaves a name nobody else is using alone', async () => {
        expect(await seated(seat('user_1', 'Dave', 'dave'), seat('user_2', 'Alice', 'alice')))
            .toEqual(['Dave', 'Alice']);
    });

    it('tags both Daves with the handle behind them', async () => {
        expect(await seated(seat('user_1', 'Dave', 'dave'), seat('user_2', 'Dave', 'daveb')))
            .toEqual(['Dave (@dave)', 'Dave (@daveb)']);
    });

    it('leaves the odd one out alone while tagging the pair', async () => {
        expect(await seated(
            seat('user_1', 'Dave', 'dave'),
            seat('user_2', 'Dave', 'daveb'),
            seat('user_3', 'Alice', 'alice'),
        )).toEqual(['Dave (@dave)', 'Dave (@daveb)', 'Alice']);
    });

    it('numbers a colliding guest rather than showing their account id', async () => {
        // Nobody in the group keeps the bare name. Leaving the guest bare made
        // the tell exactly backwards: the player who could not be tagged read
        // as the real one, which is the wrong answer when they are the one who
        // renamed themselves to match.
        expect(await seated(
            seat('user_1', 'Dave', 'dave'),
            seat('user_guest_1', 'Dave', 'guest_abc123', true),
        )).toEqual(['Dave (@dave)', 'Dave (1)']);
    });

    it('numbers two colliding guests, neither of whom has a handle', async () => {
        expect(await seated(
            seat('user_guest_1', 'Dave', 'guest_abc123', true),
            seat('user_guest_2', 'Dave', 'guest_def456', true),
        )).toEqual(['Dave (1)', 'Dave (2)']);
    });

    it('gives a numbered player the same number on every request', async () => {
        // Numbered in userId order rather than in the order Clerk answered, or
        // two guests would swap numbers between one screen and the next.
        const first = await seated(
            seat('user_guest_2', 'Dave', 'guest_def456', true),
            seat('user_guest_1', 'Dave', 'guest_abc123', true),
        );
        expect(first).toEqual(['Dave (2)', 'Dave (1)']);
    });

    it('tags names a reader cannot tell apart, whatever the bytes say', async () => {
        // A Cyrillic "а" renders as a Latin one, so this is one name to
        // everybody reading the seat list and has to be counted as one.
        expect(await seated(
            seat('user_1', 'Dave', 'dave'),
            seat('user_2', 'D\u0430ve', 'daveb'),
        )).toEqual(['Dave (@dave)', 'D\u0430ve (@daveb)']);
    });

    it('does not make a player collide with themselves', async () => {
        getUserList.mockResolvedValue({ data: [seat('user_1', 'Dave', 'dave'), seat('user_1', 'Dave', 'dave')] });

        expect(await userIdListToUsernameList(['user_1'])).toEqual(['Dave']);
    });

    it('falls back to the handle of a player who set no display name', async () => {
        expect(await seated(seat('user_1', null, 'dave'), seat('user_2', 'Amy', 'amy')))
            .toEqual(['dave', 'Amy']);
    });

    it('tags a collision a reader would see, not one strcmp would', async () => {
        // "dave" beside "Dave" is two rows a seat list renders as the same
        // person, so the count folds case — and each tag still carries the
        // name as its owner wrote it.
        expect(await seated(seat('user_1', null, 'dave'), seat('user_2', 'Dave', 'daveb')))
            .toEqual(['dave (@dave)', 'Dave (@daveb)']);
    });

    it('names a guest minted before display names by their firstName', async () => {
        getUserList.mockResolvedValue({
            data: [{ id: 'user_guest_1', username: 'guest_abc123', firstName: 'Dave', publicMetadata: { guest: true } }],
        });

        expect(await userIdListToUsernameList(['user_guest_1'])).toEqual(['Dave']);
    });

    it('never tags with the account id of a guest who claimed their account', async () => {
        // publicMetadata.guest is cleared by /api/user/claim, but a player who
        // claimed before the claim route started minting handles still carries
        // a guest_<uuid> username. It was never a handle they chose.
        expect(await seated(
            seat('user_1', 'Dave', 'dave'),
            seat('user_2', 'Dave', 'guest_2f81c0d4a9b34e6789012345678901ab'),
        )).toEqual(['Dave (@dave)', 'Dave (1)']);
    });
});
