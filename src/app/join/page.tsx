import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import JoinForm from "./JoinForm";
import { APP_NAME, OG_IMAGE, shareImage } from "@/utils/app";
import { gameShareCard } from "@/utils/ui/games";
import { readJoinCodeParam } from "@/utils/games/joinCode";
import { DiceRoll } from "@/utils/games/DiceRoll";
import { randomGuestName } from "@/utils/games/guestName";
import { invitedYouTo, seatsCta } from "@/utils/games/lobby";
import { LobbyPreview, allowLobbyPreview, findLobbyPreview } from "@/utils/games/lobbyPreview";
import { clientIp } from "@/utils/rateLimit";

// What a join link looks like when it lands in a chat rather than a browser.
//
// The link is how the code actually travels (docs/account-less-play.md §4),
// and every one of them used to unfurl as the same "Async Games — Best Async
// Gaming Platform" card the whole site shares: nothing about who sent it,
// which game it opens, or whether there is still room. Everyone in the group
// chat sees the preview; only the person who taps sees the lobby. So the
// preview says what the lobby says — through the same read the guest screen
// makes (`findLobbyPreview`) and in the same words (`lobby.ts`) — and points
// at a share card drawn in that game's own colours.
//
// A code that opens nothing falls back to the generic card rather than saying
// so: an unfurl is a stranger's crawler, and "no such lobby" is exactly what a
// code-guesser is asking for.
const GENERIC: Metadata = {
    title: "Join a game",
    description: "Got a code from a friend? Take your seat and play a turn whenever you have five minutes.",
};

// Nothing here is allowed to fail the page or hold it up. The screen below
// renders the same whether this lookup answers or not, so a database that is
// down or slow costs the link its card and nothing else.
//
// The first version let the lookup throw, and took the whole page down with it
// — a 500, and no preview at all, which is the opposite of what a preview is
// for. What made it throw was the throttle querying Mongo before anything had
// connected, and that is fixed at its source in `rateLimit.ts`.
//
// The budget is not belt-and-braces on top of that fix. An unreachable Mongo
// doesn't fail fast: `dbConnect` sits in the driver's server-selection timeout
// (30s by default), which is longer than the crawler waits, longer than a
// person waits, and longer than the function is allowed to live. Measured, not
// assumed — without this the same request hangs for 30s instead of answering
// in 2.5 with the generic card.
const PREVIEW_BUDGET_MS = 2500;

async function previewFor(joinCode: string): Promise<LobbyPreview | null> {
    // Failures are logged and turned into "no preview" on the lookup itself,
    // so a race the timeout wins can't swallow one — or leave the rejection
    // of the promise it abandoned unhandled.
    const lookup = (async () => {
        if (!(await allowLobbyPreview('lobby-unfurl', clientIp(await headers())))) return null;
        return await findLobbyPreview(joinCode);
    })().catch((error: unknown) => {
        console.error(error);
        return null;
    });

    // Cleared however the race ends, so a lookup that answers straight away
    // doesn't leave a timer behind on every request this page serves.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), PREVIEW_BUDGET_MS); });
    try {
        return await Promise.race([lookup, expired]);
    } finally {
        clearTimeout(timeout);
    }
}

interface JoinPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: JoinPageProps): Promise<Metadata> {
    const joinCode = readJoinCodeParam(await searchParams);
    if (!joinCode) return GENERIC;

    const lobby = await previewFor(joinCode);
    if (!lobby) return GENERIC;

    const title = invitedYouTo(lobby.sender, lobby.gameFriendlyName);
    const description = [`${seatsCta(lobby.openSeatCount)}.`, lobby.meta?.tagline].filter(Boolean).join(' ');
    // The game's own card, drawn once by `npm run icons` and served from
    // `public/` — what changes per lobby (who, the code, the seats) is in the
    // title and description above, so there is nothing here to render per
    // request. A game with no card yet falls back to the site's.
    const image = shareImage(
        lobby.meta ? gameShareCard(lobby.meta.url) : OG_IMAGE,
        `${title} — join code ${joinCode}.`,
    );

    return {
        title,
        description,
        // A live lobby is temporary — it expires and its code goes back in
        // the pool — so there is nothing here worth a search engine keeping.
        robots: { index: false },
        openGraph: { type: "website", siteName: APP_NAME, title, description, images: [image] },
        twitter: { card: "summary_large_image", title, description, images: [image] },
    };
}

/**
 * Who the join screen is for, decided here rather than in the browser.
 *
 * /join is two screens — the guest lockup for a visitor with no account, the
 * code box for a player who has one — and the browser can't tell them apart
 * until Clerk has loaded. Deciding it in the client meant the screen rendered
 * nothing at all until then: a blank page, on the one route in the app that
 * strangers arrive at cold from a link in a chat app. The session cookie the
 * middleware has already read says which screen it is, so the first paint can
 * be that screen — server-rendered, rather than an empty shell waiting on
 * JavaScript.
 *
 * `auth()` makes the route dynamic, which `generateMetadata` above already
 * did: reading the search params and looking the lobby up is not something
 * that can be done ahead of the request either.
 *
 * `JoinForm` still corrects itself from Clerk once it loads, for the session
 * the cookie claims and the browser then rejects.
 *
 * The guest form's random starting name and die face are drawn here for the
 * same reason: what the server renders and what the browser renders on its
 * first pass have to be the same name, and `Math.random()` called on both
 * ends is not.
 */
export default async function Join() {
    const { userId } = await auth();

    return <JoinForm initiallySignedIn={!!userId} initialName={randomGuestName()} initialDie={DiceRoll(6)} />;
}
