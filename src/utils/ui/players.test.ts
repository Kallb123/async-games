import { describe, expect, it } from 'vitest';
import { currentUsername, displayName, fullName, personalName, profileHeading, readableName } from './players';

describe('readableName', () => {
    it('prefers a real player\'s username', () => {
        expect(readableName({ username: 'dave', firstName: 'David' })).toBe('dave');
    });

    it('falls back to a real player\'s first name', () => {
        expect(readableName({ username: null, firstName: 'David' })).toBe('David');
    });

    it('falls back to the fallback for a real player with neither', () => {
        expect(readableName({ username: null, firstName: null })).toBe('Someone');
    });

    it('shows a guest by the name they typed, not their account username', () => {
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

describe('currentUsername', () => {
    it('prefers a real player\'s username', () => {
        expect(currentUsername({ username: 'dave', firstName: 'David', id: 'user_1' })).toBe('dave');
    });

    it('shows a guest by the name they typed, not their account username', () => {
        expect(currentUsername({
            username: 'guest_abc123',
            firstName: 'Dave',
            id: 'user_guest_1',
            publicMetadata: { guest: true },
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
    it("prefers a registered player's first name over their handle", () => {
        expect(personalName({ username: 'dave', firstName: 'David' })).toBe('David');
    });

    it('falls back to the handle when they gave no first name', () => {
        expect(personalName({ username: 'dave', firstName: null })).toBe('dave');
    });

    it('shows a guest the name they typed, never their account username', () => {
        expect(personalName({
            username: 'guest_abc123',
            firstName: 'Dave',
            publicMetadata: { guest: true },
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

describe('fullName', () => {
    it('joins the real name a registered player gave', () => {
        expect(fullName({ username: 'dave', firstName: 'David', lastName: 'Smith' })).toBe('David Smith');
    });

    it('is empty for a guest, whose firstName is a display name not a real one', () => {
        expect(fullName({
            username: 'guest_abc123',
            firstName: 'Dave',
            publicMetadata: { guest: true },
        })).toBe('');
    });

    it('is empty when there is no name and no user', () => {
        expect(fullName({ username: 'dave', firstName: null, lastName: null })).toBe('');
        expect(fullName(null)).toBe('');
    });
});

describe('displayName', () => {
    it('pairs the real name with the handle', () => {
        expect(displayName({ username: 'dave', firstName: 'David', lastName: 'Smith' })).toBe('David Smith (dave)');
    });

    it('is the handle alone when they gave no real name', () => {
        expect(displayName({ username: 'dave', firstName: null, lastName: null })).toBe('dave');
    });

    it('never prints the word "null" for a player with no handle', () => {
        expect(displayName({ username: null, firstName: 'David', lastName: 'Smith' })).toBe('David Smith');
        expect(displayName({ username: null, firstName: null, lastName: null })).toBe('Player');
    });

    it('is the name a guest typed, not their account username', () => {
        expect(displayName({
            username: 'guest_abc123',
            firstName: 'Dave',
            publicMetadata: { guest: true },
        })).toBe('Dave');
    });
});

describe('profileHeading', () => {
    it('heads a registered player with their name, handle and real name', () => {
        expect(profileHeading({ username: 'dave', firstName: 'David', lastName: 'Smith' }, 'You')).toEqual({
            name: 'David',
            handle: 'dave',
            noHandleLabel: undefined,
            fullName: 'David Smith',
        });
    });

    it('heads a guest with the name they typed and says what they are', () => {
        expect(profileHeading({
            username: 'guest_abc123',
            firstName: 'Dave',
            publicMetadata: { guest: true },
        }, 'You')).toEqual({
            name: 'Dave',
            handle: null,
            noHandleLabel: 'Guest account',
            fullName: '',
        });
    });

    it('is all placeholders until the user arrives', () => {
        expect(profileHeading(null, 'You')).toEqual({
            name: null,
            handle: null,
            noHandleLabel: undefined,
            fullName: '',
        });
    });
});
