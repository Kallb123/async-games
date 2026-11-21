// The turn-timer sweep's `$or` branches (actionableTurnFilter), read the way
// Mongo would read them. The test game store and TurnTimer.test.ts both need
// to ask "would this branch pick this game up?", and a second spelling of that
// is how the two would drift apart, so it lives here once.
//
// Test-only: test files import it; app code never does.

import { isComputerTurnBranch, type ActionableTurnBranch } from '@/utils/games/TurnTimer';

/** A game as a branch reads it: `turnTimer`, `currentTurn` and `lastTurnTimestamp`, whatever else it holds. */
export type SweepBranchGame = object;

/** Whether `branch` has the shape actionableTurnFilter produces, for a store that must not match an unrelated `$or`. */
export function isSweepBranch(branch: unknown): branch is ActionableTurnBranch {
    const candidate = branch as { turnTimer?: unknown, currentTurn?: { $gte?: unknown, $lte?: unknown }, lastTurnTimestamp?: { $lte?: unknown } } | null;
    return (typeof candidate?.turnTimer === 'string'
        || (typeof candidate?.currentTurn?.$gte === 'string' && candidate.currentTurn.$gte === candidate.currentTurn.$lte))
        && typeof candidate?.lastTurnTimestamp?.$lte === 'string';
}

/** Whether `branch` matches `game`: its timer (or the computer's seat) and an upper bound on the turn's start. */
export function sweepBranchMatches(branch: ActionableTurnBranch, subject: SweepBranchGame): boolean {
    const game = subject as { turnTimer?: unknown, currentTurn?: unknown, lastTurnTimestamp?: unknown };
    const onBranch = isComputerTurnBranch(branch)
        ? String(game.currentTurn ?? '') >= branch.currentTurn.$gte && String(game.currentTurn ?? '') <= branch.currentTurn.$lte
        : branch.turnTimer === game.turnTimer;
    return onBranch && String(game.lastTurnTimestamp) <= branch.lastTurnTimestamp.$lte;
}
