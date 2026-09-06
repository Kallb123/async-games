import { describe, expect, it } from 'vitest';
import { GAME_META } from './games';
import { GAME_THEMES, themeIdFor, themesForGame } from './gameThemes';

describe('the theme registry', () => {
    it('keys every entry by a real game slug', () => {
        for (const gameUrl of Object.keys(GAME_THEMES)) {
            expect(GAME_META[gameUrl], `${gameUrl} is not a game in GAME_META`).toBeDefined();
        }
    });

    it('gives every theme a unique id within its game', () => {
        for (const [gameUrl, themes] of Object.entries(GAME_THEMES)) {
            const ids = themes.map(theme => theme.id);
            expect(new Set(ids).size, `${gameUrl} has duplicate theme ids: ${ids.join(', ')}`).toBe(ids.length);
        }
    });

    it('offers a choice wherever it lists a game at all', () => {
        // One theme is the same as none, and ThemeSelect renders nothing for
        // it — an entry like that is a half-finished theme, not a feature.
        for (const [gameUrl, themes] of Object.entries(GAME_THEMES)) {
            expect(themes.length, `${gameUrl} lists only one theme`).toBeGreaterThan(1);
        }
    });
});

describe('themesForGame', () => {
    it('has nothing to offer for a game that is not themed', () => {
        expect(themesForGame('snakesandladders')).toEqual([]);
    });
});

describe('themeIdFor', () => {
    it('keeps a theme the game actually has', () => {
        expect(themeIdFor('dicecities', 'wasteland')).toBe('wasteland');
    });

    it('falls back to the default rather than rejecting anything else', () => {
        // The first theme in a game's list is its default.
        const fallback = themesForGame('dicecities')[0].id;
        expect(themeIdFor('dicecities', undefined)).toBe(fallback);
        expect(themeIdFor('dicecities', 'a-theme-we-withdrew')).toBe(fallback);
        // A client can send anything; none of it is worth a 400 over.
        expect(themeIdFor('dicecities', { id: 'wasteland' })).toBe(fallback);
        expect(themeIdFor('dicecities', 42)).toBe(fallback);
    });

    it('stores nothing at all for a game with no themes', () => {
        expect(themeIdFor('snakesandladders', 'wasteland')).toBeUndefined();
    });
});
