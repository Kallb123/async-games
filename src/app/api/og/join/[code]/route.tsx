import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { OG_IMAGE } from '@/utils/app';
import { LOBBY_UNFURL_SCOPE, allowLobbyPreview, findLobbyPreview } from '@/utils/games/lobbyPreview';
import { clientIp } from '@/utils/rateLimit';
import { CARD_HEIGHT, CARD_WIDTH, JoinShareCard } from './JoinShareCard';

// The share card a join link's preview points at (see `/join`'s
// `generateMetadata`), drawn per lobby rather than the one generic card every
// link on the site used to show — `OG_IMAGE`, which is still what everything
// else uses and what this falls back to.
//
// A route handler rather than the App Router's `opengraph-image` convention
// because the code is a query param (`/join?code=PLUM`,
// docs/account-less-play.md §4) and that convention is only ever handed route
// params, never search params.

// Satori fetches an `<img src>` itself, and a failure there tears down the
// whole render mid-stream where nothing can catch it. Fetching first means a
// missing icon costs the card its artwork and nothing else.
async function inlineImage(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const body = Buffer.from(await response.arrayBuffer()).toString('base64');
        return `data:${response.headers.get('content-type') ?? 'image/png'};base64,${body}`;
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    // The generic card for anything this can't or shouldn't draw: a code that
    // opens nothing, and an IP looking at more lobbies than sharing a link
    // needs. The card is the same enumeration oracle the preview route is, so
    // it answers to the same throttle — it just degrades to the plain card
    // instead of erroring, because the only thing reading it is a crawler.
    const genericCard = () => NextResponse.redirect(new URL(OG_IMAGE, request.url));

    if (!(await allowLobbyPreview(LOBBY_UNFURL_SCOPE, clientIp(request.headers)))) {
        return genericCard();
    }

    const { code } = await params;
    const lobby = await findLobbyPreview(code);
    if (!lobby) {
        return genericCard();
    }

    const art = lobby.meta?.art ? await inlineImage(new URL(lobby.meta.art, request.url).toString()) : null;

    return new ImageResponse(
        <JoinShareCard {...lobby} art={art} />,
        {
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            // Seats fill while the link sits in a chat, and the lobby itself is
            // gone within the hour (LOBBY_TTL_MS), so a card is worth reusing
            // for a minute and no longer.
            headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
        },
    );
}
