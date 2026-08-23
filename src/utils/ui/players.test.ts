import { describe, expect, it } from 'vitest';
import { currentUsername, readableName } from './players';

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
