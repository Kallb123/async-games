import { describe, expect, it } from 'vitest';
import { LOBBY_MAX_TTL_MS, LOBBY_MIN_TTL_MS, OPEN_SEAT_CLAIM_FILTER, OPEN_SEAT_ID, invitedYouTo, isOpenSeat, isSeatedAt, lobbyTtlMs, notSeatedFilter, openSeats, pendingSeatFor, seatsCta, seatsLeftLabel } from './lobby';
import { UNLIMITED_TURN_TIMER } from './TurnTimer';

describe('isOpenSeat', () => {
    it('is true for the placeholder seat id', () => {
        expect(isOpenSeat({ userId: OPEN_SEAT_ID, inviteAccepted: false })).toBe(true);
    });

    it('is false for a real user id', () => {
        expect(isOpenSeat({ userId: 'user_2abc123', inviteAccepted: false })).toBe(false);
        expect(isOpenSeat({ userId: 'user_2abc123', inviteAccepted: true })).toBe(false);
    });
});

describe('openSeats', () => {
    it('returns only the placeholder entries', () => {
        const invite = {
            userIdList: [
                { userId: 'user_host', inviteAccepted: true },
                { userId: OPEN_SEAT_ID, inviteAccepted: false },
                { userId: 'user_named', inviteAccepted: false },
                { userId: OPEN_SEAT_ID, inviteAccepted: false },
            ],
        };
        expect(openSeats(invite)).toEqual([
            { userId: OPEN_SEAT_ID, inviteAccepted: false },
            { userId: OPEN_SEAT_ID, inviteAccepted: false },
        ]);
    });

    it('is empty when every seat is claimed', () => {
        const invite = {
            userIdList: [
                { userId: 'user_a', inviteAccepted: true },
                { userId: 'user_b', inviteAccepted: false },
            ],
        };
        expect(openSeats(invite)).toEqual([]);
    });

    it('is empty for an invitation with no seats at all', () => {
        expect(openSeats({ userIdList: [] })).toEqual([]);
    });
});

describe('OPEN_SEAT_CLAIM_FILTER', () => {
    it('matches on the same placeholder id isOpenSeat checks', () => {
        expect(OPEN_SEAT_CLAIM_FILTER).toEqual({ 'userIdList.userId': OPEN_SEAT_ID });
    });
});

describe('isSeatedAt', () => {
    const lobby = {
        senderId: 'user_host',
        userIdList: [
            { userId: 'user_named', inviteAccepted: false },
            { userId: 'user_claimed', inviteAccepted: true },
            { userId: OPEN_SEAT_ID, inviteAccepted: false },
        ],
    };

    it('is true for the host, who holds no seat of their own', () => {
        expect(isSeatedAt(lobby, 'user_host')).toBe(true);
    });

    it('is true for a named invitee who has not accepted yet', () => {
        expect(isSeatedAt(lobby, 'user_named')).toBe(true);
    });

    it('is true for a seat already claimed', () => {
        expect(isSeatedAt(lobby, 'user_claimed')).toBe(true);
    });

    it('is false for someone with no place at the lobby', () => {
        expect(isSeatedAt(lobby, 'user_stranger')).toBe(false);
    });
});

describe('notSeatedFilter', () => {
    it('excludes the claimant as host and as any seat', () => {
        expect(notSeatedFilter('user_a')).toEqual({
            senderId: { $ne: 'user_a' },
            $expr: { $not: [{ $in: ['user_a', '$userIdList.userId'] }] },
        });
    });

    it('leaves the open-seat path to OPEN_SEAT_CLAIM_FILTER, so the positional `$` stays unambiguous', () => {
        expect(Object.keys(notSeatedFilter('user_a'))).not.toContain('userIdList.userId');
    });
});

describe('pendingSeatFor', () => {
    const lobby = {
        userIdList: [
            { userId: 'user_named', inviteAccepted: false },
            { userId: 'user_claimed', inviteAccepted: true },
        ],
    };

    it('finds a seat still waiting on its player', () => {
        expect(pendingSeatFor(lobby, 'user_named')).toEqual({ userId: 'user_named', inviteAccepted: false });
    });

    it('is undefined for a seat already accepted', () => {
        expect(pendingSeatFor(lobby, 'user_claimed')).toBeUndefined();
    });

    it('is undefined for someone with no seat at all — the host included', () => {
        expect(pendingSeatFor(lobby, 'user_host')).toBeUndefined();
    });
});

describe('seatsLeftLabel', () => {
    it('pluralises the seats', () => {
        expect(seatsLeftLabel(1)).toBe('1 seat left');
        expect(seatsLeftLabel(3)).toBe('3 seats left');
    });
});

describe('seatsCta', () => {
    it('invites them into the room thats left', () => {
        expect(seatsCta(2)).toBe('2 seats left — tap to take one');
    });

    it('stops inviting once there is none', () => {
        expect(seatsCta(0)).toBe('Every seat in this one is taken');
    });
});

describe('invitedYouTo', () => {
    it('names the host and the game, the one way the app phrases it', () => {
        expect(invitedYouTo('Dave', 'Train Time')).toBe('Dave invited you to Train Time');
    });
});

describe('lobbyTtlMs', () => {
    const HOUR_MS = 60 * 60 * 1000;

    it('gives a brisk game the floor rather than its own short timer', () => {
        expect(lobbyTtlMs('10m')).toBe(LOBBY_MIN_TTL_MS);
        expect(lobbyTtlMs('30m')).toBe(LOBBY_MIN_TTL_MS);
        expect(lobbyTtlMs('1h')).toBe(LOBBY_MIN_TTL_MS);
    });

    it('lasts as long as one turn once that is longer than the floor', () => {
        expect(lobbyTtlMs('6h')).toBe(6 * HOUR_MS);
        expect(lobbyTtlMs('3d')).toBe(3 * 24 * HOUR_MS);
    });

    it('caps an unlimited timer rather than letting the code live forever', () => {
        expect(lobbyTtlMs(UNLIMITED_TURN_TIMER)).toBe(LOBBY_MAX_TTL_MS);
    });

    it('never exceeds the ceiling, and never falls below the floor', () => {
        for (const timer of ['10m', '30m', '1h', '3h', '6h', '12h', '1d', '3d', '7d', UNLIMITED_TURN_TIMER, 'nonsense']) {
            expect(lobbyTtlMs(timer)).toBeGreaterThanOrEqual(LOBBY_MIN_TTL_MS);
            expect(lobbyTtlMs(timer)).toBeLessThanOrEqual(LOBBY_MAX_TTL_MS);
        }
    });
});
