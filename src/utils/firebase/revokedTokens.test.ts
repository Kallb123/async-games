import { describe, expect, it } from 'vitest';
import { deadTokensByUser } from './revokedTokens';

describe('deadTokensByUser', () => {
    const targets = [
        { userId: 'user_a', token: 'a-phone' },
        { userId: 'user_a', token: 'a-laptop' },
        { userId: 'user_b', token: 'b-phone' },
    ];

    it('collects revoked tokens per user, matching results by index', () => {
        const dead = deadTokensByUser(targets, [
            { success: true },
            { success: false, error: { code: 'messaging/registration-token-not-registered' } },
            { success: false, error: { code: 'messaging/invalid-registration-token' } },
        ]);

        expect(dead.get('user_a')).toEqual(['a-laptop']);
        expect(dead.get('user_b')).toEqual(['b-phone']);
    });

    it('leaves devices alone for transient or payload errors', () => {
        const dead = deadTokensByUser(targets, [
            { success: false, error: { code: 'messaging/server-unavailable' } },
            { success: false, error: { code: 'messaging/invalid-argument' } },
            { success: false, error: { code: 'messaging/internal-error' } },
        ]);

        expect(dead.size).toBe(0);
    });

    it('groups several dead tokens belonging to the same user', () => {
        const dead = deadTokensByUser(targets, [
            { success: false, error: { code: 'messaging/registration-token-not-registered' } },
            { success: false, error: { code: 'messaging/registration-token-not-registered' } },
            { success: true },
        ]);

        expect([...dead]).toEqual([['user_a', ['a-phone', 'a-laptop']]]);
    });
});
