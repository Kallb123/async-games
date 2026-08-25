import type { Metadata } from "next";
import { headers } from "next/headers";
import JoinForm from "./JoinForm";
import { APP_NAME } from "@/utils/app";
import { readJoinCodeParam } from "@/utils/games/joinCode";
import { invitedYouTo, seatsCta } from "@/utils/games/lobby";
import { LOBBY_UNFURL_SCOPE, allowLobbyPreview, findLobbyPreview } from "@/utils/games/lobbyPreview";
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

interface JoinPageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: JoinPageProps): Promise<Metadata> {
    const joinCode = readJoinCodeParam(await searchParams);
    if (!joinCode) return GENERIC;

    // Same throttle as every other public look at a lobby, on its own counter
    // (see lobbyPreview.ts) — a crawler that has run out of budget gets the
    // generic card, which is invisible to the player either way.
    if (!(await allowLobbyPreview(LOBBY_UNFURL_SCOPE, clientIp(await headers())))) return GENERIC;

    const lobby = await findLobbyPreview(joinCode);
    if (!lobby) return GENERIC;

    const title = invitedYouTo(lobby.sender, lobby.gameFriendlyName);
    const description = [`${seatsCta(lobby.openSeatCount)}.`, lobby.meta?.tagline].filter(Boolean).join(' ');
    const image = {
        url: `/api/og/join/${joinCode}`,
        width: 1200,
        height: 630,
        alt: `${title} — join code ${joinCode}.`,
    };

    return {
        title,
        description,
        // A live lobby is gone within the hour and its code goes back in the
        // pool, so there is nothing here worth a search engine keeping.
        robots: { index: false },
        openGraph: { type: "website", siteName: APP_NAME, title, description, images: [image] },
        twitter: { card: "summary_large_image", title, description, images: [image.url] },
    };
}

export default function Join() {
    return <JoinForm />;
}
