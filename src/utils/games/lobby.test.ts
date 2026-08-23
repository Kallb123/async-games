import { describe, expect, it } from 'vitest';
import { OPEN_SEAT_CLAIM_FILTER, OPEN_SEAT_ID, isOpenSeat, openSeats } from './lobby';

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
