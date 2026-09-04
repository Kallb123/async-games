import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICE_CITIES_THEMES, DEFAULT_DICE_CITIES_THEME, diceCitiesTheme } from './themes';
import { DiceCitiesCards } from './cards';
import type { IDiceCitiesCard } from './apiModels';

// The fields a theme is allowed to touch: what the card is called, what its
// rules text says, and which set of faces it is drawn from. Everything else on
// a card is the rules — see docs/games/dice-cities.md §11: "No costs,
// activation numbers, colours, icons, limits or win conditions change".
const THEMED_FIELDS: (keyof IDiceCitiesCard)[] = ['title', 'text', 'art'];

// `/public`, so the art check below can be a real one.
const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public');

describe.each(DICE_CITIES_THEMES.map(theme => [theme.name, theme] as const))('the %s theme', (_name, theme) => {
    it('carries the whole deck, and nothing that is not in it', () => {
        expect(Object.keys(theme.cards).sort()).toEqual(Object.keys(DiceCitiesCards).sort());
    });

    it('changes only what a card is called, never what it does', () => {
        for (const [cardId, base] of Object.entries(DiceCitiesCards)) {
            const themed = theme.cards[cardId];
            for (const field of Object.keys(base) as (keyof IDiceCitiesCard)[]) {
                if (THEMED_FIELDS.includes(field)) continue;
                expect(themed[field], `${theme.id} changed ${field} on ${base.title}`).toEqual(base[field]);
            }
        }
    });

    it('has a picture on disk for every card it names', () => {
        // Reads the filesystem on purpose. A theme's `artDir` and its folder of
        // faces are added by hand, in two separate places, and every way of
        // getting that wrong — pointing at a folder that isn't there yet,
        // shipping 25 of the 26 files, misnaming one (the Train Station's face
        // is `station.png`, not `train-station.png`) — type-checks, lints and
        // builds clean, then serves a 400 from /_next/image on a real board.
        // Comparing the path to the expression that built it would catch none
        // of it.
        const missing = Object.values(theme.cards)
            .filter(card => !existsSync(path.join(publicRoot, card.art)))
            .map(card => `${card.title} (${card.art})`);
        expect(missing, `${theme.id} has no art for: ${missing.join(', ')}`).toEqual([]);
    });
});

describe('the Rust & Bottlecaps theme', () => {
    const wasteland = diceCitiesTheme('wasteland');

    it('renames every card in the game', () => {
        // A card added to cards.ts without a wasteland name would silently keep
        // its Japanese one and sit in the middle of the wasteland market — so
        // this fails here instead, naming the cards still to be written.
        const unrenamed = Object.entries(DiceCitiesCards)
            .filter(([cardId, base]) => wasteland.cards[cardId].title === base.title)
            .map(([, base]) => base.title);
        expect(unrenamed, `no wasteland name for: ${unrenamed.join(', ')}`).toEqual([]);
    });

    it('spends its own vocabulary rather than the base game\'s', () => {
        expect(wasteland.words.coins).toBe('caps');
        // Every renamed card's rules text should talk in that vocabulary too:
        // a Brahmin Pen that pays "1 coin from the bank" is half-themed.
        const stillOnCoins = Object.values(wasteland.cards)
            .filter(card => /\bcoins?\b/.test(card.text))
            .map(card => card.title);
        expect(stillOnCoins, `still paid in coins: ${stillOnCoins.join(', ')}`).toEqual([]);
    });
});

describe('diceCitiesTheme', () => {
    it('answers with the game as it shipped for anything it does not recognise', () => {
        // Games created before themes existed have no stored id at all.
        expect(diceCitiesTheme(undefined)).toBe(DEFAULT_DICE_CITIES_THEME);
        expect(diceCitiesTheme(null)).toBe(DEFAULT_DICE_CITIES_THEME);
        expect(diceCitiesTheme('a-theme-we-withdrew')).toBe(DEFAULT_DICE_CITIES_THEME);
    });

    it('leaves the default theme naming the cards exactly as cards.ts does', () => {
        for (const [cardId, base] of Object.entries(DiceCitiesCards)) {
            // Art aside, which every theme resolves to a path of its own.
            expect(DEFAULT_DICE_CITIES_THEME.cards[cardId]).toEqual({
                ...base,
                art: `/art/dicecities/japanese/${base.art}`,
            });
        }
    });
});
