import { IDiceCitiesInvitationData } from "@/app/api/newgame/dicecities/route";
import { DiceCitiesGameData } from "@/utils/mongodb/GameData";
import { randomUUID } from "crypto";

export async function CreateDiceCitiesGame(invite: IDiceCitiesInvitationData, userIdList: string[]): Promise<DiceCitiesGameData> {
    const turnOrder = userIdList;
    const gameData: DiceCitiesGameData = {
        gameId: randomUUID(),
        gameType: invite.gameType,
        userIdList,
        turnTimer: invite.turnTimer,
        currentTurn: turnOrder[0],
        lastTurnTimestamp: (new Date()).toISOString(),
        gameState: {
            turnOrder,
            history: [],
            bankCards: []
        },
        enabledDocks: invite.enabledDocks,
        enabledBillionaireRow: invite.enabledBillionaireRow
    }
    return gameData;
}
