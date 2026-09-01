import { describe, expect, it } from 'vitest';
import { countTurns } from './turnCount';
import type { IGameCommand } from '../apiModels/gameCommand';

// Only senderId matters to countTurns; the rest of a command is irrelevant here.
const by = (senderId: string) => ({ senderId } as IGameCommand);

describe('countTurns', () => {
    it('is zero for a game nobody has moved in', () => {
        expect(countTurns([])).toBe(0);
    });

    it('counts one command as one turn', () => {
        expect(countTurns([by('u1')])).toBe(1);
    });

    it('collapses a multi-command turn to a single turn', () => {
        // One player rolls, builds, builds, ends — four commands, one turn.
        expect(countTurns([by('u1'), by('u1'), by('u1'), by('u1')])).toBe(1);
    });

    it('counts a turn each time play passes to another player', () => {
        expect(countTurns([by('u1'), by('u2'), by('u1'), by('u2')])).toBe(4);
    });

    it('counts multi-command turns from alternating players correctly', () => {
        // u1 takes a three-command turn, then u2 takes a two-command turn: two turns.
        expect(countTurns([by('u1'), by('u1'), by('u1'), by('u2'), by('u2')])).toBe(2);
    });

    it('treats a solo game whose turn never passes as one turn', () => {
        expect(countTurns([by('solo'), by('solo'), by('solo')])).toBe(1);
    });
});
