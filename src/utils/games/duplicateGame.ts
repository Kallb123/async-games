import { randomUUID } from 'crypto';
import { IGameDataDocument } from '@/utils/mongodb/GameData';
import { gameDataModelFor } from '@/utils/mongodb/mongodb';
import { uuidString } from '@/utils/apiModels/GameDataApi';

/**
 * The fields a copy must not inherit from the game it was copied from: the
 * document's own identity, the version the optimistic-concurrency check
 * asserts, the game id (the copy gets a fresh one), the lobby the original
 * started from, and the discriminator key (the model the copy is built from
 * stamps its own).
 */
const NOT_COPIED = ['_id', '__v', 'gameId', 'inviteId', 'kind'] as const;

/**
 * Copy a game — same players, same turn, same state — into a brand new game
 * with its own id, so the two can be played apart. A dev-only tool: it's how
 * you get a second run at an interesting position without setting one up move
 * by move (see docs/environments.md).
 *
 * The copy is a deep one. `toObject` clones every nested value the document
 * holds — the history, the private `commandHistory` replay log, the game's own
 * `specificGameState` and its Maps — so no array or object is shared between
 * the two documents and a turn played in one can't be seen in the other. It is
 * also what re-reads a game's state through its schema rather than field by
 * field, so a game that adds state to itself is copied without a line here.
 *
 * The turn clock restarts: a copy inherits the position, not the deadline.
 * Copying `lastTurnTimestamp` would hand a game whose turn was nearly up a copy
 * the sweep expires before anyone can play it, and copying `missedTurnCounts`
 * is the same deadline in another form — a copy of a game whose current player
 * had already missed two turns would be abandoned outright on its first tick
 * (MAX_CONSECUTIVE_MISSED_TURNS, see the turntimer cron) rather than rotating
 * the turn. Both start again from nothing, which is the opposite of the point.
 *
 * Not copied: the game's chat thread, its reactions and its read markers.
 * Those live in their own collections keyed by game id, and a copy is a fresh
 * table rather than a transcript of the old one.
 *
 * @param game the game to copy, as loaded from its own discriminator model
 * @returns the saved copy, or null for a game whose type no longer has a model
 *          registered — dev data outlives registries, and a renamed or removed
 *          game is a refusal the caller can word rather than a 500
 */
export async function duplicateGame(game: IGameDataDocument): Promise<IGameDataDocument | null> {
    // The same one lookup `startGameFromInvitation` uses, so a new game needs
    // no line here either.
    const gameDataModel = gameDataModelFor(game.gameType.gameType);
    if (!gameDataModel) {
        return null;
    }

    // flattenMaps so a Map the schema holds comes back as a plain object, which
    // the copy's schema then casts into a Map of its own.
    const copied: Record<string, unknown> = game.toObject({ flattenMaps: true, depopulate: true });
    for (const field of NOT_COPIED) {
        delete copied[field];
    }

    const duplicate = new gameDataModel({
        ...copied,
        gameId: randomUUID() as uuidString,
        lastTurnTimestamp: new Date().toISOString(),
        timerWarningNotificationSent: false,
        missedTurnCounts: {},
    }) as IGameDataDocument;

    await duplicate.save();
    return duplicate;
}
