import { InvitationData } from "./InvitationData"
import { auth, clerkClient } from "@clerk/nextjs";
import { DiceCitiesInvitationData } from "@/app/api/newgame/dicecities/route";
import { CreateDiceCitiesGame } from "@/games/DiceCities/DiceCitiesInit";

export interface GameData {
    gameId: `${string}-${string}-${string}-${string}-${string}`,
    gameType: string,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string,
    lastTurnTimestamp: string,
    gameState: GameState
}

export interface GameState {
    turnOrder: string[],
    history: string[]
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
    gameState: DiceCitiesGameState
}

export interface DiceCitiesGameState extends GameState {
    bankCards: any[]
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
            const userIdList = userList.map(user => user.id).concat(invite.senderId);
            return await CreateDiceCitiesGame(diceCitiesInvite, userIdList);
            break;
        default:
            throw new Error(`GameType not recognised: ${invite.gameType}`);
            break;
    }
}
