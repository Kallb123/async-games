import { clerkClient } from '@clerk/nextjs/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { InvitationModel } from '@/utils/mongodb/InvitationData';
import { normaliseJoinCode } from '@/utils/games/joinCode';
import { openSeats } from '@/utils/games/lobby';
import { readableName } from '@/utils/ui/players';
import { GameMeta, metaForGame } from '@/utils/ui/games';
import { consumeRateLimit } from '@/utils/rateLimit';

// What a join code tells someone who hasn't taken a seat yet
// (docs/account-less-play.md §4/§14): whose lobby, which game, how much room
// is left — and nothing more, so a wrong guess at a code learns only "a lobby
// exists or it doesn't".
//
// Two readers share this one lookup: `GET /api/lobby/code/<CODE>` (the guest
// screen's live preview) and `/join`'s `generateMetadata` (what a shared link
// unfurls to in a chat app). One read, so the two can never describe the same
// lobby differently.
export interface LobbyPreview {
    /** The code as stored, however the caller happened to spell it. */
    joinCode: string;
    sender: string;
    gameFriendlyName: string;
    openSeatCount: number;
    /** The game's art, accent and tagline — absent for a game with no entry. */
    meta?: GameMeta;
}

// A public read is a cheaper enumeration oracle than the join route beside it
// — taking a seat is self-limiting in a way looking never is — so every way of
// looking is throttled per IP on the same terms.
const PREVIEW_RATE_LIMIT = 30;
const PREVIEW_RATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * Whether this IP may look up another lobby. `scope` keeps each way of asking
 * on its own counter, so a guest whose screen is fetching the JSON preview
 * doesn't spend the budget the same visit's link unfurl needs.
 */
export function allowLobbyPreview(scope: string, identifier: string): Promise<boolean> {
    return consumeRateLimit(scope, identifier, PREVIEW_RATE_LIMIT, PREVIEW_RATE_WINDOW_MS);
}

/** The live lobby a code opens, or null when it opens nothing. */
export async function findLobbyPreview(code: string): Promise<LobbyPreview | null> {
    const joinCode = normaliseJoinCode(code);
    if (!joinCode) return null;

    await dbConnect();

    const lobby = await InvitationModel.findOne({ joinCode, expiresAt: { $gt: new Date() } }).exec();
    if (!lobby) return null;

    const sender = await (await clerkClient()).users.getUser(lobby.senderId);

    return {
        joinCode,
        sender: readableName(sender),
        gameFriendlyName: lobby.gameFriendlyName,
        openSeatCount: openSeats(lobby).length,
        meta: metaForGame({ url: lobby.gameType.toLowerCase(), friendlyName: lobby.gameFriendlyName }),
    };
}
