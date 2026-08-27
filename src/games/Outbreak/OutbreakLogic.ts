import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════════════════════════
//  OUTBREAK
// ═══════════════════════════════════════════════════════════════════════════
//
// The command surface (OutbreakAction, OutbreakPlayEvent, OutbreakEndTurn,
// OutbreakDiscard) lands across docs/games/outbreak-gdd.md §21.6 steps 4, 6
// and 10. OutbreakGameType exists ahead of all of them because
// OutbreakInvitationModel.CreateGame (see OutbreakModels.ts) needs one to
// construct a game with — every IGameData carries a gameType from creation.
// CheckEndTurn/CheckGameOver are stubs until a command exists that can end a
// turn or cure a disease.

@serializable
export class OutbreakGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "Outbreak";
    friendlyName: string = "Outbreak";
    icon: string = "";
    url: string = "outbreak";
    readonly className: string = "OutbreakGameType";

    CheckEndTurn(_gameData: IGameData, _commandOutcome: ICommandOutcome): void {
        // No command can report turnOver yet — §21.6 step 4 adds OutbreakAction.
    }

    CheckGameOver(_gameData: IGameData): boolean {
        // Nothing can cure a disease yet, so the game never ends on its own —
        // §21.6 step 4 adds the all-cured check.
        return false;
    }
}
