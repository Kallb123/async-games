// The win/loss/draw rule, which lives in exactly one function on purpose:
// "recent form" reads it per match and getPlayerStats folds every match
// through it for the W/L/D on a profile, so a case that is wrong here is
// wrong in both places at once — and used to be wrong in only one of them,
// when the profile totals were a second copy of the rule in Mongo `$cond`.

import { describe, expect, it } from 'vitest';
import { outcomeFor } from './GameResultData';

const ANN = 'user_ann';
const BOB = 'user_bob';

describe('outcomeFor', () => {
    it('gives the win to whoever is named as the winner, and a loss to everyone else', () => {
        expect(outcomeFor({ winner: ANN, endReason: 'win' }, ANN)).toBe('win');
        expect(outcomeFor({ winner: ANN, endReason: 'win' }, BOB)).toBe('loss');
    });

    it('reads a game nobody won as a draw', () => {
        expect(outcomeFor({ winner: '', endReason: 'ended' }, ANN)).toBe('draw');
    });

    it('takes the loss off the player who stopped turning up, not the table', () => {
        const abandoned = { winner: '', endReason: 'abandoned' as const, forfeitedBy: BOB };
        expect(outcomeFor(abandoned, BOB)).toBe('loss');
        expect(outcomeFor(abandoned, ANN)).toBe('draw');
    });

    it('gives a co-op table one result: everybody won, or everybody lost', () => {
        expect(outcomeFor({ winner: '', endReason: 'teamwin' }, ANN)).toBe('win');
        expect(outcomeFor({ winner: '', endReason: 'teamwin' }, BOB)).toBe('win');
        // Not the draw an empty winner would otherwise have read as.
        expect(outcomeFor({ winner: '', endReason: 'teamloss' }, ANN)).toBe('loss');
        expect(outcomeFor({ winner: '', endReason: 'teamloss' }, BOB)).toBe('loss');
    });

    it('still reads a result recorded before endReason existed', () => {
        expect(outcomeFor({ winner: ANN }, ANN)).toBe('win');
        expect(outcomeFor({ winner: ANN }, BOB)).toBe('loss');
        expect(outcomeFor({ winner: '' }, ANN)).toBe('draw');
    });

    it('reads a record with no winner field at all the way it reads an empty one', () => {
        // `winner` has no schema default, so an old record may carry none —
        // which means nobody won it, not that everybody lost it.
        expect(outcomeFor({}, ANN)).toBe('draw');
    });
});
