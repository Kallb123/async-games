import { describe, expect, it } from 'vitest';
import { accentHex, accentVar } from './colours';
import { GAME_META } from './games';

// The two accent maps are the same four colours twice — one for the browser,
// one for the share card's renderer — so the thing worth guarding is that a
// game can't name an accent only one of them knows about. Both fall through to
// the raw value for a bespoke hex, which means a missing entry doesn't throw,
// it just silently hands `var(--ag-…)` to a rasteriser that can't resolve it.
describe('a game accent resolves in both forms', () => {
    it.each(Object.entries(GAME_META))('%s', (_slug, meta) => {
        expect(accentVar(meta.accent)).toMatch(/^(var\(--ag-[a-z]+\)|#[0-9a-f]{3,8})$/i);
        expect(accentHex(meta.accent)).toMatch(/^#[0-9a-f]{3,8}$/i);
    });
});
