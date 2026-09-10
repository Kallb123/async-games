'use client'
import React, { useCallback, useState } from 'react';
import { usePrefersReducedMotion } from '@/utils/hooks/usePrefersReducedMotion';
import type { IChatAttachment } from '@/utils/chat';

/**
 * The tallest a GIF is drawn, in px. A thread row is a reference strip, not a
 * viewer: without a cap a portrait GIF takes the whole panel and pushes the
 * conversation off the screen. Paired with `max-width: 100%` in the stylesheet,
 * so a wide GIF is bounded by the row and a tall one by this.
 */
const MAX_CHAT_GIF_HEIGHT = 220;

interface ChatGifProps {
    /**
     * The GIF to draw, or `undefined` for a message that should have had one
     * and doesn't — a stored attachment the chat GET refused on the way out
     * (docs/chat-gifs.md §4e). Optional rather than required so the degraded
     * caption has exactly one home: the same "GIF unavailable" line answers an
     * attachment that never arrived and one whose image fails to load, instead
     * of the caller growing a second copy of it.
     */
    attachment?: IChatAttachment;
    /**
     * Set by the picker's result grid: the GIF becomes a button that picks it.
     *
     * It is what tells the two callers apart, and both differences follow from
     * it. A thread row draws the GIF at its own size, capped so a tall one
     * can't take the panel; a grid cell is a thumbnail, so it takes the cell's
     * width and the stylesheet crops it. And a result is *selected* rather than
     * played — a reduced-motion player in the picker sees the still frame with
     * no play button, because the tap is already spoken for; the thread's own
     * tap-to-play is where they watch it.
     */
    onSelect?: () => void;
}

/**
 * One GIF, in the thread and in the picker's result grid.
 *
 * Three rules, each of which is a decision rather than a detail
 * (docs/chat-gifs.md §6):
 *
 * - **A plain `<img>`, not `next/image`.** The optimiser doesn't optimise
 *   animated images, the provider already serves a correctly sized variant, and
 *   routing it through `/_next/image` would bill us to pass bytes through
 *   unchanged. That is also why `next.config.mjs`'s `remotePatterns` doesn't
 *   name the provider.
 * - **The box is reserved from the stored dimensions**, before the image loads.
 *   §7 is the whole reason the dimensions are on the message at all.
 * - **`prefers-reduced-motion` gets the still frame**, and a tap plays it. For
 *   animated content that is the accessibility requirement, not a nicety.
 */
export default function ChatGif({ attachment, onSelect }: ChatGifProps) {
    // State, not a one-off read: the choice of frame drives what is rendered,
    // so a player who turns the setting on mid-thread gets the still frame
    // without reloading.
    const reduceMotion = usePrefersReducedMotion();
    const [playing, setPlaying] = useState(false);
    const [failed, setFailed] = useState(false);
    const play = useCallback(() => setPlaying(true), []);

    // The word this attachment is called in its own captions — "GIF" or
    // "meme" (docs/chat-gifs.md §12). Read off `provider` rather than passed
    // in, because the two kinds share this one component and every caller
    // already has the attachment in hand. Falls back to "GIF" when there is no
    // attachment to ask — the common case for a degraded message, and the
    // label this component always used before a second kind existed.
    const label = attachment?.provider === 'klipy-meme' ? 'Meme' : 'GIF';

    // A message with no usable attachment degrades to a caption rather than an
    // empty row — the same answer for one the GET refused, and for one whose
    // URL 404s in the browser (a provider expiring it, a host we no longer
    // allow). `Avatar` falls back to its initials badge the same way.
    if (!attachment || failed) {
        return <div className="ag-chat-gif-missing">{label} unavailable</div>;
    }

    const { url, stillUrl, width, height, alt } = attachment;
    // The drawn width, so `aspect-ratio` can derive the height at layout time.
    // Capped by MAX_CHAT_GIF_HEIGHT rather than letting the stylesheet cap the
    // height directly: a `max-height` on an `aspect-ratio` box shrinks the
    // height without the width, which is a squashed GIF. Never wider than the
    // GIF really is, so a small one isn't upscaled, and never wider than the
    // row, which `max-width: 100%` handles (the height follows it down,
    // because the ratio is doing the work).
    const drawnWidth = Math.min(width, Math.round((width / height) * MAX_CHAT_GIF_HEIGHT));
    // A grid cell sets its own width, so the ratio derives the height from that
    // instead and every cell in a row lines up; `.ag-gif-grid` caps how tall one
    // may get, which crops rather than squashes because the image covers its box.
    const box: React.CSSProperties = {
        width: onSelect ? '100%' : drawnWidth,
        aspectRatio: `${width} / ${height}`,
    };
    // Both frames are the same size, so the still and the animation swap inside
    // the same reserved box and the row's height never moves.
    const frame = (
        /* eslint-disable-next-line @next/next/no-img-element -- next/image does
           not optimise animated images, and the provider already serves a
           correctly sized variant; routing it through /_next/image would bill
           us to pass the same bytes through unchanged (docs/chat-gifs.md §6). */
        <img
            src={reduceMotion && !playing ? stillUrl : url}
            alt={alt || label}
            // A page of history is fifty rows; fetching fifty of these the
            // player hasn't scrolled to yet is the heaviest thing this app
            // would do.
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );

    if (onSelect) {
        return (
            <button type="button" className="ag-chat-gif" style={box} onClick={onSelect} aria-label={`Send ${label}: ${alt || label}`}>
                {frame}
            </button>
        );
    }

    if (reduceMotion && !playing) {
        // A button, not a div with an onClick: playing an animation is an
        // action, and it has to be reachable from the keyboard. A meme has no
        // motion to withhold — `reduceMotion` is never true for one, since its
        // `url` and `stillUrl` are the same static file — so this branch is
        // reached by a GIF alone in practice, but the label still reads right
        // if that ever changes.
        return (
            <button type="button" className="ag-chat-gif" style={box} onClick={play} aria-label={`Play ${label}: ${alt || label}`}>
                {frame}
                <span className="ag-chat-gif-play" aria-hidden>▶</span>
            </button>
        );
    }

    return <div className="ag-chat-gif" style={box}>{frame}</div>;
}
