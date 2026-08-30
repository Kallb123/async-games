import { describe, expect, it } from 'vitest';
import { currentUsername, displayName, finishedGameCopy, personalName, profileHeading, publicHandle, readableName, seatOrderFrom } from './players';

describe('readableName', () => {
    it('prefers the display name a player chose over their handle', () => {
        expect(readableName({ username: 'dave', publicMetadata: { displayName: 'Dave the Destroyer' } }))
            .toBe('Dave the Destroyer');
    });

    it('goes by the handle of a player who chose no display name', () => {
        expect(readableName({ username: 'dave' })).toBe('dave');
    });

    it("never shows a registered player's leftover Clerk first name", () => {
        // firstName is only the legacy home of a *guest's* typed name. A
        // registered player who still has one from Clerk's signup form is
        // known by their handle until they choose a display name.
        expect(readableName({ username: 'dave', firstName: 'David' })).toBe('dave');
    });

    it('falls back to the fallback for a real player with neither', () => {
        expect(readableName({ username: null, firstName: null })).toBe('Someone');
    });

    it('shows a guest the name they typed, not their account username', () => {
        expect(readableName({
            username: 'guest_abc123',
            publicMetadata: { guest: true, displayName: 'Dave' },
        })).toBe('Dave');
    });

    it('names a guest minted before display names by their firstName', () => {
        // The last resort, and only ever reached by someone with no handle:
        // for them firstName really is the name they typed at the join screen.
        expect(readableName({
            username: 'guest_abc123',
            firstName: 'Dave',
            publicMetadata: { guest: true },
        })).toBe('Dave');
    });

    it('falls back for a guest with no name set yet', () => {
        expect(readableName({ username: 'guest_abc123', firstName: null, publicMetadata: { guest: true } }, 'Someone')).toBe('Someone');
    });

    it('is null-safe', () => {
        expect(readableName(null)).toBe('Someone');
        expect(readableName(undefined)).toBe('Someone');
    });
});

describe('publicHandle', () => {
    it('gives the handle a registered player chose', () => {
        expect(publicHandle({ username: 'dave', firstName: 'David' })).toBe('dave');
    });

    it('gives a guest none rather than their account id', () => {
        expect(publicHandle({ username: 'guest_abc123', publicMetadata: { guest: true } })).toBeNull();
    });

    it('gives none for a claimed guest whose username is still an account id', () => {
        // /api/user/claim clears publicMetadata.guest, so the flag alone would
        // call this a chosen handle. A player who claimed before the claim
        // route started minting one still carries the minted account id.
        expect(publicHandle({
            username: 'guest_2f81c0d4a9b34e6789012345678901ab',
            firstName: 'Dave',
        })).toBeNull();
    });

    it('leaves a handle somebody actually picked alone', () => {
        expect(publicHandle({ username: 'guest_dave', firstName: 'Dave' })).toBe('guest_dave');
    });
});

describe('currentUsername', () => {
    it('prefers the display name a player chose over their handle', () => {
        expect(currentUsername({ username: 'dave', id: 'user_1', publicMetadata: { displayName: 'Dave' } })).toBe('Dave');
    });

    it('goes by the handle of a player who chose no display name', () => {
        expect(currentUsername({ username: 'dave', firstName: 'David', id: 'user_1' })).toBe('dave');
    });

    it('shows a guest by the name they typed, not their account username', () => {
        expect(currentUsername({
            username: 'guest_abc123',
            id: 'user_guest_1',
            publicMetadata: { guest: true, displayName: 'Dave' },
        })).toBe('Dave');
    });

    it('falls back to id for a guest with no name set yet', () => {
        expect(currentUsername({ username: 'guest_abc123', firstName: null, id: 'user_guest_1', publicMetadata: { guest: true } })).toBe('user_guest_1');
    });

    it('is null-safe', () => {
        expect(currentUsername(null)).toBe('');
        expect(currentUsername(undefined)).toBe('');
    });
});

describe('personalName', () => {
    it("shows a player the same name everyone else sees them under", () => {
        expect(personalName({ username: 'dave', publicMetadata: { displayName: 'Dave' } })).toBe('Dave');
    });

    it('falls back to the handle when they chose no display name', () => {
        expect(personalName({ username: 'dave', firstName: 'David' })).toBe('dave');
    });

    it('shows a guest the name they typed, never their account username', () => {
        expect(personalName({
            username: 'guest_abc123',
            publicMetadata: { guest: true, displayName: 'Dave' },
        })).toBe('Dave');
    });

    it('falls back for a guest with no name rather than showing their account username', () => {
        expect(personalName({
            username: 'guest_abc123',
            firstName: null,
            publicMetadata: { guest: true },
        }, 'You')).toBe('You');
    });

    it('is null until there is a user, so a badge stays a silhouette', () => {
        expect(personalName(null, 'You')).toBeNull();
        expect(personalName(undefined)).toBeNull();
        expect(personalName({ username: null, firstName: null })).toBeNull();
    });
});

describe('displayName', () => {
    it('pairs the name they chose with the handle you invite them by', () => {
        expect(displayName({ username: 'dave', publicMetadata: { displayName: 'Dave the Destroyer' } }))
            .toBe('Dave the Destroyer (@dave)');
    });

    it('is the handle alone when they chose no display name', () => {
        // Not "dave (@dave)": the handle is already the name they go by.
        expect(displayName({ username: 'dave' })).toBe('dave');
    });

    it('never prints the word "null" for a player with no handle', () => {
        expect(displayName({ username: null, publicMetadata: { displayName: 'Dave' } })).toBe('Dave');
        expect(displayName({ username: null, firstName: null })).toBe('Player');
    });

    it('is the name a guest typed, not their account username', () => {
        expect(displayName({
            username: 'guest_abc123',
            publicMetadata: { guest: true, displayName: 'Dave' },
        })).toBe('Dave');
    });
});

describe('profileHeading', () => {
    it('heads a registered player with the name they chose and their handle', () => {
        expect(profileHeading({
            username: 'dave',
            publicMetadata: { displayName: 'Dave the Destroyer' },
        }, 'You')).toEqual({
            name: 'Dave the Destroyer',
            handle: 'dave',
            noHandleLabel: undefined,
        });
    });

    it('heads a player who chose no display name with their handle', () => {
        expect(profileHeading({ username: 'dave' }, 'You')).toEqual({
            name: 'dave',
            handle: 'dave',
            noHandleLabel: undefined,
        });
    });

    it('heads a guest with the name they typed and says what they are', () => {
        expect(profileHeading({
            username: 'guest_abc123',
            publicMetadata: { guest: true, displayName: 'Dave' },
        }, 'You')).toEqual({
            name: 'Dave',
            handle: null,
            noHandleLabel: 'Guest account',
        });
    });

    it('is all placeholders until the user arrives', () => {
        expect(profileHeading(null, 'You')).toEqual({
            name: null,
            handle: null,
            noHandleLabel: undefined,
        });
    });
});

describe('finishedGameCopy', () => {
    it('names the winner of a game somebody won', () => {
        expect(finishedGameCopy({ winner: 'Priya', endReason: 'win' })).toBe('Priya won');
    });

    it('says a co-op table won or lost together, without naming anyone', () => {
        expect(finishedGameCopy({ winner: '', endReason: 'teamwin' })).toBe('The team won');
        expect(finishedGameCopy({ winner: '', endReason: 'teamloss' })).toBe('The team lost');
    });

    it('reuses the abandoned-game wording for a game nobody stayed for', () => {
        expect(finishedGameCopy({ winner: '', endReason: 'abandoned', forfeitedBy: 'Priya' }))
            .toBe('Ended — Priya went quiet');
    });

    it('has nothing to add to a game that simply ended', () => {
        // The two screens word "nobody won" differently, so this is theirs to fill in.
        expect(finishedGameCopy({ winner: '', endReason: 'ended' })).toBeNull();
    });
});

describe('seatOrderFrom', () => {
    const seats = ['a', 'b', 'c', 'd'];

    it('starts the list at the viewer and keeps the turn cycle running from there', () => {
        expect(seatOrderFrom(seats, 'c')).toEqual(['c', 'd', 'a', 'b']);
    });

    it('leaves the list alone when the viewer already sits first', () => {
        expect(seatOrderFrom(seats, 'a')).toEqual(seats);
    });

    it('leaves the list alone for someone who is not seated', () => {
        expect(seatOrderFrom(seats, 'zzz')).toEqual(seats);
        expect(seatOrderFrom(seats, null)).toEqual(seats);
    });
});
