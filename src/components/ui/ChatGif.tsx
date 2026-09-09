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
}

/**
 * One GIF, in the thread and (later) in the picker's result grid.
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
export default function ChatGif({ attachment }: ChatGifProps) {
    // State, not a one-off read: the choice of frame drives what is rendered,
    // so a player who turns the setting on mid-thread gets the still frame
    // without reloading.
    const reduceMotion = usePrefersReducedMotion();
    const [playing, setPlaying] = useState(false);
    const [failed, setFailed] = useState(false);
    const play = useCallback(() => setPlaying(true), []);

    // A message with no usable GIF degrades to a caption rather than an empty
    // row — the same answer for an attachment the GET refused, and for one
    // whose URL 404s in the browser (a provider expiring it, a host we no
    // longer allow). `Avatar` falls back to its initials badge the same way.
    if (!attachment || failed) {
        return <div className="ag-chat-gif-missing">GIF unavailable</div>;
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
    const box: React.CSSProperties = { width: drawnWidth, aspectRatio: `${width} / ${height}` };
    // Both frames are the same size, so the still and the animation swap inside
    // the same reserved box and the row's height never moves.
    const frame = (
        /* eslint-disable-next-line @next/next/no-img-element -- next/image does
           not optimise animated images, and the provider already serves a
           correctly sized variant; routing it through /_next/image would bill
           us to pass the same bytes through unchanged (docs/chat-gifs.md §6). */
        <img
            src={reduceMotion && !playing ? stillUrl : url}
            alt={alt || 'GIF'}
            // A page of history is fifty rows; fetching fifty GIFs the player
            // hasn't scrolled to yet is the heaviest thing this app would do.
            loading="lazy"
            onError={() => setFailed(true)}
        />
    );

    if (reduceMotion && !playing) {
        // A button, not a div with an onClick: playing an animation is an
        // action, and it has to be reachable from the keyboard.
        return (
            <button type="button" className="ag-chat-gif" style={box} onClick={play} aria-label={`Play GIF: ${alt || 'GIF'}`}>
                {frame}
                <span className="ag-chat-gif-play" aria-hidden>▶</span>
            </button>
        );
    }

    return <div className="ag-chat-gif" style={box}>{frame}</div>;
}
