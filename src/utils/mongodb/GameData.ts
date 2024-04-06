import { randomUUID } from "crypto";
import { InvitationData } from "./InvitationData"
import { auth, clerkClient } from "@clerk/nextjs";
import { DiceCitiesInvitationData } from "@/app/api/newgame/dicecities/route";

export interface GameData {
    gameId: `${string}-${string}-${string}-${string}-${string}`,
    gameType: string,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    lastTurnTimestamp: string,
    gameState: string
}

export interface GameResponse {
    gameId: `${string}-${string}-${string}-${string}-${string}`,
    usernameList: string[],
    turnTimer: string,
    currentTurn: string
}

export interface DiceCitiesGameData extends GameData {
    enabledDocks: boolean,
    enabledBillionaireRow: boolean,
}

export async function GameCreator(invite: InvitationData): Promise<GameData> {
    const userList = await clerkClient.users.getUserList({
      userId: invite.userIdList.map(uid => uid.userId)
    });
    const authResponse = auth();
    if (!authResponse.userId) {
        throw new Error("User not signed in?");
    }
    
    switch (invite.gameType) {
        case "DiceCities":
            const diceCitiesInvite = invite as DiceCitiesInvitationData;
            const gameData: DiceCitiesGameData = {
                gameId: randomUUID(),
                gameType: invite.gameType,
                userIdList: userList.map(user => user.id).concat(invite.senderId),
                turnTimer: invite.turnTimer,
                currentTurn: authResponse.userId,
                lastTurnTimestamp: (new Date()).toISOString(),
                gameState: "",
                enabledDocks: diceCitiesInvite.enabledDocks,
                enabledBillionaireRow: diceCitiesInvite.enabledBillionaireRow
            }
            return gameData;
            break;
        default:
            throw new Error(`GameType not recognised: ${invite.gameType}`);
            break;
    }
}
