import { NextRequest, NextResponse } from 'next/server';
import { IChatAttachment, normaliseAttachment } from '@/utils/chat';
import { IProviderSearchResponse, KlipyItem, pickFile, runProviderSearch } from '@/utils/gif/klipySearch';

// The picker's data: a proxied GIF search (docs/chat-gifs.md §5).
//
// It is a proxy for two reasons, and the second is the interesting one. The
// obvious one is that the provider's API key must not ship to the client. The
// other is that this route is the **moderation boundary** of the whole feature:
// it is the only thing that writes the GifCatalogue, and the chat POST will
// attach a GIF only if a row is there. So a player can send an item our own
// filtered search served to somebody — not merely a real KLIPY slug, which they
// could name directly from a query the filter would have blocked (§4b vs §4c).
//
// Everything that makes that true is pinned in `runProviderSearch` and the
// config below rather than taken from the caller: the content filter, the
// media variants, the page size and the upstream host. The one thing the
// caller chooses is a search term.
//
// This route only decides what makes a *GIF* search a GIF search — which
// KLIPY endpoint, which formats, which provider a result is catalogued under.
// The mechanics of proxying a KLIPY category (auth, rate limits, envelope
// parsing, the ad filter, the catalogue write, the cache headers) live in
// `runProviderSearch`, shared with the meme route beside it (§12).

/** What the picker renders, and exactly what a message stores. Re-exported
 *  from the shared module under this route's own name, so `GifPicker` keeps
 *  importing `IGifSearchResponse` from here. */
export type IGifSearchResponse = IProviderSearchResponse;

/** How many results a page of the picker holds. Ours, not the caller's — it is
 *  also how many catalogue rows one search writes (§5b), which is why it is
 *  applied to what comes *back* as well as to what we ask for. */
const GIF_SEARCH_PAGE_SIZE = 24;

/** Searches per window, per account and (separately) per IP. Generous, because
 *  a type-ahead picker is genuinely chatty; small enough that it is not worth
 *  anybody's while to farm accounts for it. */
const GIF_SEARCH_LIMIT = 60;
const GIF_SEARCH_WINDOW_MS = 5 * 60_000;

/**
 * The formats we ask for, and the only ones we render.
 *
 * `gif` is the animated file and `jpg` its first frame — which is what
 * `prefers-reduced-motion` shows and what a tap plays from (§6). KLIPY also
 * offers `webp`, `mp4` and `webm`; none of them is asked for, because a
 * variant we don't render is a variant we'd have to decide about later.
 */
const GIF_FORMATS = ['gif', 'jpg'] as const;

/**
 * One of the provider's items as an attachment, or `null` if it isn't one we
 * will store.
 *
 * The checking is `normaliseAttachment`'s, not this function's: it is already
 * the thing that decides whether a set of these seven fields may be put in
 * front of a player, and it is already run again when a catalogue row is copied
 * onto a message and once more on the way out to the thread. Running it *here*
 * is what makes §4d's host assertion real — the point where a URL first crosses
 * from the provider into our data — and reusing it is why there is one host
 * list rather than one per gate.
 *
 * `mediaId` is the item's **slug** rather than its numeric `id`, because the
 * slug is what KLIPY's own share, items and report endpoints are keyed by — so
 * the thing we remember is the thing we can talk to them about later (§5, §9).
 */
function toAttachment(item: KlipyItem): IChatAttachment | null {
    const animated = pickFile(item, 'gif');
    const still = pickFile(item, 'jpg');
    return normaliseAttachment({
        provider: 'klipy',
        mediaId: item?.slug,
        url: animated?.url,
        stillUrl: still?.url,
        width: animated?.width,
        height: animated?.height,
        alt: item?.title,
    });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    return runProviderSearch(request, {
        category: 'gifs',
        limiterPrefix: 'gifSearch',
        logLabel: 'GIF search',
        formats: GIF_FORMATS,
        contentFilter: 'high',
        pageSize: GIF_SEARCH_PAGE_SIZE,
        limit: GIF_SEARCH_LIMIT,
        windowMs: GIF_SEARCH_WINDOW_MS,
        toAttachment,
    });
}
