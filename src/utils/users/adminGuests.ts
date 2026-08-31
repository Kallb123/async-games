import { User } from "@clerk/nextjs/server";
import { GameDataModel } from "@/utils/mongodb/GameData";
import { IUserIdAcceptance, InvitationModel } from "@/utils/mongodb/InvitationData";
import { isOpenSeat, lobbyPath } from "@/utils/games/lobby";
import { gamePath } from "@/utils/ui/games";
import { buildUserDirectory, forEachClerkUser } from "@/utils/users/clerk";
import { isGuest, readableName } from "@/utils/ui/players";

/**
 * Who a guest is playing with, for the one question the admin screen exists to
 * answer: *is this the Dave who wrote in?* A guest has no email, no handle and
 * a name they typed once, so the table they are sitting at is the only thing
 * that identifies them — "Dave, in a Train Time game with Ann and Bob" is
 * checkable against what they said, where a name and an account id are not.
 */
export interface AdminGuestSeat {
    /** The game being played — "Train Time". */
    game: string;
    /** A game in progress, one that has finished, or a lobby yet to start. */
    state: 'live' | 'finished' | 'lobby';
    /** Everyone else at that table, named as the app names them. */
    others: string[];
    /** Where the seat is, so the admin can open it and look. */
    href: string;
}

export interface AdminGuestDto {
    userId: string;
    /** The name the other players see them under, collision tags and all. */
    name: string;
    /** ISO strings — the browser owns the formatting, as everywhere else.
     *  Null for a timestamp Clerk didn't give us, which is not the same as a
     *  guest who has never been seen. */
    createdAt: string | null;
    lastActiveAt: string | null;
    seats: AdminGuestSeat[];
}

export interface IAdminGuestsResponse {
    guests: AdminGuestDto[];
    /** How many Clerk users were walked to find them. */
    scanned: number;
    /** More guests matched than the page below returns. */
    truncated: boolean;
}

export interface IAdminGuestResumeRequest {
    /** The guest account to mint a link for. */
    userId: string;
}

export interface IAdminGuestResumeResponse {
    /** The link to send the guest. Signs them back in as that account. */
    resumeUrl: string;
    /** Who it signs in, echoed back so the admin can check the row they
     *  pressed is the guest they meant before they paste it anywhere. */
    name: string;
    /** When it stops working, as an ISO string. */
    expiresAt: string;
}

// Guest-ness lives in Clerk, not Mongo (docs/account-less-play.md §3), so
// finding guests means walking the instance — the same walk the staleguests
// sweep makes. Capped so that what comes back is a page of rows an admin can
// actually read, and so the Mongo and Clerk lookups that decorate them stay
// bounded however many guests the instance is holding: narrow the search
// rather than scroll.
const ADMIN_GUEST_LIMIT = 25;

// A game the app can no longer name — nothing writes one today, but a row
// missing its game is still a row worth showing the seats of.
const UNKNOWN_GAME_NAME = "Unknown game";

// What the search box matches. The name is the useful half — it is what the
// player will tell you — and the id is there for a follow-up on a guest whose
// row an admin has already seen.
function matchesSearch(user: User, needle: string): boolean {
    if (!needle) return true;
    // `readableName` only to *decide* whether this row is wanted — the name
    // the response shows comes from the directory below, which is the one that
    // can tell two Daves apart.
    return readableName(user).toLowerCase().includes(needle) || user.id.toLowerCase().includes(needle);
}

// Clerk types its timestamps as epoch milliseconds, but a page of rows is not
// worth losing to one that isn't: an unreadable timestamp reads as "no idea"
// rather than throwing on `toISOString`.
function isoTime(value: number | null | undefined): string | null {
    const when = value ? new Date(value) : null;
    return when && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
}

/** The fields the seat lines need, and nothing else — no board state, no
 *  command history (see findSweepCandidates for why that matters). */
interface GuestGame {
    gameId: string;
    userIdList: string[];
    complete: boolean;
    // `lean()` applies no schema defaults, so this is whatever the document
    // actually holds — read defensively below rather than assumed.
    gameType?: { friendlyName?: string, url?: string };
}

interface GuestLobby {
    inviteId: string;
    senderId: string;
    userIdList: IUserIdAcceptance[];
    gameFriendlyName: string;
}

/**
 * The unclaimed guest accounts, newest first, each with the tables they are
 * sitting at (docs/admin-tools.md).
 *
 * Two Mongo reads for the whole page rather than two per guest, and one Clerk
 * directory for every name on the screen at once — the same shape
 * `buildDashboard` uses, and for the same reason: a page of rows that resolves
 * its own names row by row is a page of round trips.
 */
export async function listGuestAccounts(search: string): Promise<IAdminGuestsResponse> {
    const needle = search.trim().toLowerCase();

    const matches: User[] = [];
    const scanned = await forEachClerkUser(async user => {
        if (isGuest(user) && matchesSearch(user, needle)) {
            matches.push(user);
        }
    });

    matches.sort((a, b) => b.createdAt - a.createdAt);
    const page = matches.slice(0, ADMIN_GUEST_LIMIT);
    const guestIds = page.map(user => user.id);

    // `$in: []` matches nothing, which is the right answer for a search that
    // found no guests — so this needs no empty-page branch of its own.
    const [games, lobbies] = await Promise.all([
        GameDataModel.find({ userIdList: { $in: guestIds } })
            .select('gameId userIdList complete gameType -_id')
            .lean<GuestGame[]>()
            .exec(),
        InvitationModel.find({ 'userIdList.userId': { $in: guestIds } })
            .select('inviteId senderId userIdList gameFriendlyName -_id')
            .lean<GuestLobby[]>()
            .exec(),
    ]);

    const directory = await buildUserDirectory([
        ...guestIds,
        ...games.flatMap(game => game.userIdList),
        ...lobbies.flatMap(lobby => [lobby.senderId, ...lobby.userIdList.map(seat => seat.userId)]),
    ]);

    // Open seats have a placeholder id rather than a player (OPEN_SEAT_ID), so
    // they are left out rather than named — a lobby half full of them would
    // otherwise read as a table of "Unknown player".
    const othersAtLobby = (lobby: GuestLobby, guestId: string) =>
        [lobby.senderId, ...lobby.userIdList.filter(seat => !isOpenSeat(seat)).map(seat => seat.userId)]
            .filter(userId => userId !== guestId)
            .map(userId => directory.name(userId));

    const seatsFor = (guestId: string): AdminGuestSeat[] => [
        ...games.filter(game => game.userIdList.includes(guestId)).map(game => ({
            game: game.gameType?.friendlyName ?? UNKNOWN_GAME_NAME,
            state: game.complete ? 'finished' as const : 'live' as const,
            others: game.userIdList.filter(userId => userId !== guestId).map(userId => directory.name(userId)),
            // The result page is the fallback as well as the finished-game
            // answer: it needs only the gameId, so a game whose type didn't
            // come back is still a link rather than a dead `/games//id`.
            href: game.complete || !game.gameType?.url
                ? `/games/result/${game.gameId}`
                : gamePath(game.gameType.url, game.gameId),
        })),
        ...lobbies.filter(lobby => lobby.userIdList.some(seat => seat.userId === guestId)).map(lobby => ({
            game: lobby.gameFriendlyName,
            state: 'lobby' as const,
            others: othersAtLobby(lobby, guestId),
            href: lobbyPath(lobby.inviteId),
        })),
    ];

    return {
        guests: page.map(user => ({
            userId: user.id,
            name: directory.name(user.id),
            createdAt: isoTime(user.createdAt),
            // Clerk only knows this for a guest who has signed in since it
            // started recording it; null reads as "no idea", not "never".
            lastActiveAt: isoTime(user.lastActiveAt),
            seats: seatsFor(user.id),
        })),
        scanned,
        truncated: matches.length > page.length,
    };
}
