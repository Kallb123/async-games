import type { IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";

/**
 * Flags a game's whole `specificGameState` as changed. Mongoose doesn't track
 * mutations inside a `Schema.Types.Mixed` path, only reassignment of it (see
 * docs/new-game.md's Mixed-field gotcha), so every command of a game that keeps
 * any of its state Mixed ends here. A replay's plain object has no
 * `markModified`, so it's a no-op there.
 */
export function markDirty(gameData: IGameData): void {
    (gameData as unknown as Partial<IGameDataDocument>).markModified?.('specificGameState');
}
