import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IBannedIsletGameData } from "@/games/BannedIslet/BannedIsletModels";

// ═══════════════════════════════════════════════════════════════════════════
//  BANNED ISLET
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/banned-islet.md §21.6 PR 2: the game type and a skeleton action,
// so a created game has something to persist as its `gameType` and the
// registries have something to check. §21.4's four command classes arrive with
// the phases they belong to — the action phase in PR 3, the draw and flood
// phases in PR 5, special cards in PR 8.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

@serializable
export class BannedIsletGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "BannedIslet";
    friendlyName: string = "Banned Islet";
    icon: string = "";
    url: string = "bannedislet";
    readonly className: string = "BannedIsletGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const data = gameData as IBannedIsletGameData;
        const order = data.gameState.turnOrder;
        data.currentTurn = order[(order.indexOf(data.currentTurn) + 1) % order.length];
        // `actionsLeft` refills here, at the *start* of the new current
        // player's turn (§21.4) — in PR 3, alongside the actions that spend it.
        // Nothing can end a turn until then, so there is nothing to refill yet.
    }

    CheckGameOver(gameData: IGameData): boolean {
        // §4.1's win needs actions to capture a treasure with (PR 3) and a
        // Helicopter Lift to play (PR 8); §4.2's four losses need an island
        // that floods (PR 5). Until then nothing can finish a game, and this
        // is the pass-through the command route calls after every command.
        return gameData.complete;
    }
}

// ─── BannedIsletAction ──────────────────────────────────────────────────────

/** §8's action catalogue, plus the two role kinds that aren't one of those (§21.4). The role kinds arrive with the roles themselves, in PR 7. */
export type BannedIsletActionKind = 'move' | 'shoreUp' | 'giveCard' | 'capture' | 'pass';

@serializable
export class BannedIsletAction implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    kind: BannedIsletActionKind = 'pass';
    readonly className = 'BannedIsletAction';

    myString() {
        return 'took an action';
    }

    // The skeleton of §21.4's first command class. PR 3 fills it in — move,
    // shore up, give a card, capture and pass, all five validating through
    // rules.ts rather than re-deriving adjacency or capture eligibility a
    // second time. Until then every action is refused, which is what an
    // unplayable game should do rather than mutate state it has no rules for.
    async Execute(_gameData: IGameData): Promise<ICommandOutcome> {
        return INVALID;
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
