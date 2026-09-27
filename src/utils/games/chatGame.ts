import { kingdomBuilderMemberIds, KingdomBuilderWorldModel } from "@/games/KingdomBuilder/KingdomBuilderWorldModel";
import { KingdomBuilderSettlementModel } from "@/games/KingdomBuilder/KingdomBuilderSettlementModel";
import { meta as kingdomBuilderMeta } from "@/games/KingdomBuilder/meta";
import { GameDataModel } from "@/utils/mongodb/GameData";
import { Types } from "mongoose";

export interface ChatGame {
    userIdList: string[];
    /** IDs exposed in responses; worlds use seat keys so Clerk ids stay private. */
    senderIdList: string[];
    friendlyName: string;
    url: string;
    path: string;
    /** Earliest message this caller may read (late-joining worlds only). */
    joinedAt?: string;
}

/**
 * Resolve the small, public slice of a game that chat needs. Kingdom Builder
 * worlds live outside the turn-based GameData collection, but their chat still
 * uses the same messages, read markers and access-control path as every match.
 */
export async function chatGame(gameId: string, userId?: string): Promise<ChatGame | null> {
    const game = await GameDataModel.findOne({ gameId }).exec();
    if (game) {
        return {
            userIdList: game.userIdList,
            senderIdList: game.userIdList,
            friendlyName: game.gameType.friendlyName,
            url: game.gameType.url,
            path: `/games/${game.gameType.url}/${gameId}`,
        };
    }

    if (!Types.ObjectId.isValid(gameId)) return null;
    const world = await KingdomBuilderWorldModel.findById(gameId)
        .select({ roster: 1, hostId: 1 })
        .lean();
    if (!world) return null;

    let legacyOwnerIds: string[] = [];
    if (!world.roster?.length) {
        const settlements = await KingdomBuilderSettlementModel.find({ worldId: gameId })
            .select({ ownerId: 1 })
            .lean<Array<{ ownerId: string }>>();
        legacyOwnerIds = settlements.map(settlement => settlement.ownerId);
    }
    const seat = userId ? world.roster?.find((entry: { userId: string }) => entry.userId === userId) : undefined;
    const userIdList = kingdomBuilderMemberIds(world, legacyOwnerIds);
    return {
        userIdList,
        senderIdList: userIdList.map((_memberId, seatIndex) => String(seatIndex)),
        friendlyName: kingdomBuilderMeta.name,
        url: kingdomBuilderMeta.url,
        path: `/kingdombuilder/${gameId}`,
        ...(seat?.joinedAt ? { joinedAt: new Date(seat.joinedAt).toISOString() } : {}),
    };
}
