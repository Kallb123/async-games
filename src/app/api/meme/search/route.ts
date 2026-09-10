import { NextRequest, NextResponse } from 'next/server';
import { IChatAttachment, normaliseAttachment } from '@/utils/chat';
import { IProviderSearchResponse, KlipyItem, pickFile, runProviderSearch } from '@/utils/gif/klipySearch';

// The meme picker's data: a proxied search of KLIPY's `/static-memes/`
// category, sitting beside `/api/gif/search` (docs/chat-gifs.md §12).
//
// Everything §5 says about the GIF route applies here unchanged: this route
// is the moderation boundary for memes exactly as the GIF one is for GIFs —
// the only writer of a meme's catalogue row, so the chat POST will attach one
// only if this route has already served it under our own pinned filter. The
// mechanics (auth, rate limits, envelope parsing, the ad filter, the
// catalogue write, the cache headers) live in `runProviderSearch`, shared
// with the GIF route; this file only says what makes a *meme* search a meme
// search.

/** What the picker renders, and exactly what a message stores. */
export type IMemeSearchResponse = IProviderSearchResponse;

/** Kept equal to the GIF picker's page size rather than independently tuned —
 *  there is no reason a meme grid should hold a different number of results,
 *  and one constant is one less thing to keep in step. */
const MEME_SEARCH_PAGE_SIZE = 24;

/** Its own budget, not shared with the GIF picker's `gifSearch-*` limiters
 *  (see `limiterPrefix` below) — a player switching between the two pickers
 *  should not find one has starved the other's quota. */
const MEME_SEARCH_LIMIT = 60;
const MEME_SEARCH_WINDOW_MS = 5 * 60_000;

/**
 * The formats we ask for, and the only one we render.
 *
 * `png`, not `jpg` — the meme category's files come as `png`/`webp` per tier,
 * unlike the GIF category's `gif`/`jpg` (confirmed against a live response
 * after asking for `jpg` silently dropped every result: KLIPY answered, but
 * every item's `file.<tier>` had no `jpg` key for `pickFile` to find, so
 * `toAttachment` returned `null` for all of them). `webp` is the smaller file
 * and is not asked for, matching the GIF route's own "no variant we don't
 * render" rule — a static PNG is plenty small for a meme.
 *
 * A meme is a static image — the "image button" beside the GIF one, not a
 * second animated picker — so one format is enough. There is no still frame
 * distinct from the full image the way an animated GIF has one; the same
 * file is used for both `url` and `stillUrl` below.
 */
const MEME_FORMATS = ['png'] as const;

/**
 * One of the provider's meme items as an attachment, or `null` if it isn't
 * one we will store.
 *
 * `normaliseAttachment` does the actual checking — see the note on the GIF
 * route's `toAttachment`, which applies here unchanged. `url` and `stillUrl`
 * are the same file: a meme has no separate still frame to fall back to, and
 * `ChatGif` already treats "both frames the same size" as the ordinary case.
 */
function toAttachment(item: KlipyItem): IChatAttachment | null {
    const image = pickFile(item, 'png');
    return normaliseAttachment({
        provider: 'klipy-meme',
        mediaId: item?.slug,
        url: image?.url,
        stillUrl: image?.url,
        width: image?.width,
        height: image?.height,
        alt: item?.title,
    });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    return runProviderSearch(request, {
        category: 'static-memes',
        limiterPrefix: 'memeSearch',
        logLabel: 'Meme search',
        formats: MEME_FORMATS,
        contentFilter: 'high',
        pageSize: MEME_SEARCH_PAGE_SIZE,
        limit: MEME_SEARCH_LIMIT,
        windowMs: MEME_SEARCH_WINDOW_MS,
        toAttachment,
    });
}
