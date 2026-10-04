import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIRST_COMMAND_VERSION, GAME_META, availableGames, gamePath, isGameScreen, partySizeErrorMessage, partySizeRange, shareImageForGame } from './games';
import { OG_IMAGE } from '@/utils/app';
import { UNVERSIONED_COMMAND } from '@/utils/apiModels/gameCommand';

describe('partySizeErrorMessage', () => {
    const meta = { name: 'Dice Cities', players: '2–6 players', minPlayers: 2, maxPlayers: 6 };

    it('accepts a party inside the bounds, at either edge', () => {
        expect(partySizeErrorMessage(meta, 2)).toBeNull();
        expect(partySizeErrorMessage(meta, 4)).toBeNull();
        expect(partySizeErrorMessage(meta, 6)).toBeNull();
    });

    it('rejects a party outside them, phrased for the player', () => {
        expect(partySizeErrorMessage(meta, 1)).toBe('Dice Cities supports 2–6 players');
        expect(partySizeErrorMessage(meta, 7)).toBe('Dice Cities supports 2–6 players');
    });

    it('takes a real GameMeta — the host plus one is a party of two', () => {
        expect(partySizeErrorMessage(GAME_META.dicecities, 2)).toBeNull();
    });
});

describe('partySizeRange', () => {
    it('reads the bounds off the numbers, not off the display copy', () => {
        // The two used to be the same string, so `players` was quoted directly.
        // They part company for a game with a mode that skips the invite flow:
        // Fires Out's card says "1–6 players" because you can play it alone,
        // while the crew game it invites you to is 2-6 — and quoting `players`
        // told a host of one that their party was supported while the button
        // refusing them said otherwise.
        expect(partySizeRange(GAME_META.firesout)).toBe('2–6 players');
        expect(GAME_META.firesout.players).toBe('1–6 players');
        expect(partySizeErrorMessage(GAME_META.firesout, 1)).toBe('Fires Out! supports 2–6 players');
    });

    it('says "1 player" rather than "1–1 players" for a game that only ever has one', () => {
        expect(partySizeRange(GAME_META.solitaire)).toBe('1 player');
    });

    it('matches the display copy for every game whose modes all go through the invite flow', () => {
        for (const [slug, meta] of Object.entries(GAME_META)) {
            if (slug === 'firesout') continue; // the one game the two deliberately differ for
            expect(partySizeRange(meta), slug).toBe(meta.players.replace('-', '–'));
        }
    });
});

describe('isGameScreen', () => {
    it('recognises a board and the result screen that follows it', () => {
        expect(isGameScreen(gamePath('dicecities', 'abc123'))).toBe(true);
        expect(isGameScreen('/games/worlddomination/abc123')).toBe(true);
        expect(isGameScreen('/games/result/abc123')).toBe(true);
    });

    it('does not count the lists and lobbies around a game as one', () => {
        // `/games/completed` is the one `/games/...` path that is a list rather
        // than a game, and it is exactly the screen a player who is missing
        // their turns should be warned on.
        expect(isGameScreen('/games/completed')).toBe(false);
        expect(isGameScreen('/')).toBe(false);
        expect(isGameScreen('/newgame/dicecities')).toBe(false);
        expect(isGameScreen('/lobby/abc123')).toBe(false);
        expect(isGameScreen('/settings')).toBe(false);
    });
});

describe('shareImageForGame', () => {
    const drawn = new Set(['dicecities']);

    it("uses the game's own card when one has been drawn", () => {
        expect(shareImageForGame('dicecities', drawn)).toBe('/icons/og-game-dicecities.png');
    });

    it('falls back to the general Async Games card for a game with no card yet', () => {
        expect(shareImageForGame('undrawn', drawn)).toBe(OG_IMAGE);
    });

    it('falls back to the general card when the game is unknown', () => {
        expect(shareImageForGame(undefined, drawn)).toBe(OG_IMAGE);
    });
});

describe('command versions', () => {
    // A typo here makes the command route refuse every move in the game, or
    // buildTimeline refuse to replay any of it (docs/command-versions.md).
    it.each(Object.values(GAME_META).map(meta => [meta.url, meta] as const))('%s names a replayable range that includes its current version', (_, meta) => {
        const version = meta.commandVersion ?? FIRST_COMMAND_VERSION;
        const oldest = meta.oldestReplayableCommandVersion ?? UNVERSIONED_COMMAND;
        expect(Number.isInteger(version) && version >= FIRST_COMMAND_VERSION).toBe(true);
        expect(Number.isInteger(oldest) && oldest >= UNVERSIONED_COMMAND && oldest <= version).toBe(true);
    });
});

describe('availableGames', () => {
    // A game of its own, so the test doesn't change meaning as real games ship.
    beforeEach(() => {
        GAME_META.unfinished = { ...GAME_META.realmarena, url: 'unfinished', available: false };
    });
    afterEach(() => {
        delete GAME_META.unfinished;
    });

    it('leaves out a game still being built, so nothing counts or lists it', () => {
        expect(availableGames()).not.toContain(GAME_META.unfinished);
        expect(availableGames()).toEqual(Object.values(GAME_META).filter(game => game.available));
    });
});
