'use client'
import React, { useEffect, useState } from 'react';
import ChatGif from '@/components/ui/ChatGif';
import PanelHead from '@/components/ui/PanelHead';
import Skeleton from '@/components/ui/Skeleton';
import { fetchWithSessionRetry } from '@/utils/hooks/fetchWithSessionRetry';
import { IChatAttachment, MAX_GIF_QUERY_LENGTH } from '@/utils/chat';
import type { IGifSearchResponse } from '@/app/api/gif/search/route';

/**
 * How long the box sits still before a search goes out.
 *
 * A picker that searched per keystroke would be the chattiest thing in the app
 * by an order of magnitude — "surprised" is nine requests for one search. This
 * is the client's half of that; the route's rate limit is the half that
 * actually holds (docs/chat-gifs.md §5).
 */
const SEARCH_DEBOUNCE_MS = 400;

/** Placeholder cells on the first load, so the panel opens at roughly its real
 *  height instead of growing under the composer a moment later. */
const SKELETON_CELLS = 8;

/** The catalogue's name, as a player reads it. One constant because it appears
 *  twice — the search field and the credit under the grid — and the two saying
 *  different things is how a screen reader ends up announcing a field nobody
 *  else can see the label of. */
const GIF_PROVIDER_NAME = 'KLIPY';

interface GifPickerProps {
    /** A result was tapped — send it. */
    onSelect: (attachment: IChatAttachment) => void;
    /** Dismisses the picker; the composer's own GIF button toggles it too. */
    onClose: () => void;
    /** True while a send is in flight, so the grid can say so and a second tap
     *  can't queue a second GIF while the first is still going. */
    sending: boolean;
    /** The last tap was refused or failed. A tap that sends closes the picker,
     *  so the only thing left on screen after a failed one would otherwise be
     *  the grid it was tapped in — indistinguishable from a dead tap. */
    sendFailed: boolean;
}

/** What the grid is showing. Stale results stay on screen while the next search
 *  runs — a grid that blanked on every keystroke would flicker for the whole
 *  time somebody was typing — so "loading" is only ever a *first* load (of the
 *  panel, or of a retry). */
type PickerState = 'loading' | 'ready' | 'unavailable';

/**
 * The GIF picker: a search box and a grid of results, opened from the chat
 * composer (docs/chat-gifs.md §5, §6).
 *
 * It fetches for itself rather than taking its data from a hook in `GameShell`
 * the way the thread does. The reason the thread's fetch lives up there is the
 * unread dot, which has to know about messages while the panel is *shut*;
 * nothing outside this component has any use for a page of search results, and
 * they are worth nothing the moment it closes.
 *
 * There is no failure state that stops a player chatting: a provider wobble, a
 * missing API key, a spent rate limit and a network error all land on the same
 * "GIFs unavailable" line, and the composer underneath carries on exactly as it
 * did before this feature existed.
 */
export default function GifPicker({ onSelect, onClose, sending, sendFailed }: GifPickerProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<IChatAttachment[]>([]);
    const [state, setState] = useState<PickerState>('loading');
    // Bumped by "Try again", so the effect below re-runs for the same term.
    // Without it the only way out of `unavailable` is a keystroke: a panel that
    // opened during a five-second wobble at the provider — or while the
    // limiter's own Mongo write was failing, which the route deliberately
    // degrades to the same answer — would read "GIFs unavailable" for as long as
    // it stayed open, with nothing to press.
    const [attempt, setAttempt] = useState(0);

    // The term actually searched for, and what the effect is keyed on rather
    // than the raw box: `cat` and `cat ` are one search, so a trailing space (or
    // a typed-then-deleted one) doesn't spend a request from a budget of sixty.
    const term = query.trim().slice(0, MAX_GIF_QUERY_LENGTH);

    // The debounce and the request in one effect, keyed on the term: React tears
    // the previous one down on every keystroke, which is exactly the "cancel the
    // pending search" the debounce needs, and the `cancelled` flag covers a
    // request that was already in flight when the player typed again (or closed
    // the picker). Nothing is set during the effect itself — a state write there
    // is what `react-hooks/set-state-in-effect` refuses, and it isn't wanted
    // anyway: the previous results stay put until the next ones land.
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            // Trending, not a search — `q` is left off entirely rather than sent
            // empty, so the route's own "no term means featured" branch is the
            // one thing deciding it.
            const path = term ? `/api/gif/search?${new URLSearchParams({ q: term })}` : '/api/gif/search';
            const response = await fetchWithSessionRetry(path, () => cancelled);
            if (cancelled) {
                return;
            }
            if (!response || !response.ok) {
                // Includes the 429 a very fast typist can reach: the honest
                // answer to a player is the same either way — no pictures just
                // now, and the thread is unaffected.
                setState('unavailable');
                return;
            }
            try {
                const body = await response.json() as IGifSearchResponse;
                if (cancelled) {
                    return;
                }
                setResults(body.results ?? []);
                setState(body.unavailable ? 'unavailable' : 'ready');
            } catch (error) {
                // The `cancelled` check belongs here too, and it is the one place
                // it is easy to forget: reading the body can fail *after* a later
                // search has already landed (the helper's own timeout aborts the
                // body stream as well as the request), and a dead run flipping
                // the panel to "unavailable" would replace results that are
                // perfectly good with an outage message no keystroke asked for.
                if (cancelled) {
                    return;
                }
                console.error('Failed to read GIF search results', error);
                setState('unavailable');
            }
        }, term ? SEARCH_DEBOUNCE_MS : 0);

        // The opening load has no keystroke to wait for, hence the 0 above —
        // clearing it still cancels it if the picker is shut before it fires.
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [term, attempt]);

    const retry = () => {
        setState('loading');
        setAttempt(count => count + 1);
    };

    return (
        <div className="ag-gif-picker">
            <PanelHead title="GIFs" subtitle="Tap one to send it" onClose={onClose} closeLabel="Close GIF picker" />
            <input
                className="ag-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${GIF_PROVIDER_NAME}…`}
                maxLength={MAX_GIF_QUERY_LENGTH}
                aria-label={`Search ${GIF_PROVIDER_NAME} for a GIF`}
            />
            {/* A failed send, said out loud. Above the grid rather than in place
                of it, because the grid is still the thing to try again with. */}
            {sendFailed && (
                <div className="ag-log-empty" role="status">Couldn&apos;t send that GIF. Try again, or pick another.</div>
            )}
            {state === 'unavailable' ? (
                <div className="ag-gif-unavailable">
                    <div className="ag-log-empty">GIFs unavailable. You can still send a message.</div>
                    <button type="button" className="ag-pill-action" onClick={retry}>Try again</button>
                </div>
            ) : state === 'loading' ? (
                <div className="ag-gif-grid" aria-hidden>
                    {Array.from({ length: SKELETON_CELLS }).map((_, index) => (
                        <Skeleton key={index} width="100%" height={90} radius={10} />
                    ))}
                </div>
            ) : results.length === 0 ? (
                <div className="ag-log-empty">No GIFs match that.</div>
            ) : (
                <div className={`ag-gif-grid${sending ? ' ag-gif-grid--busy' : ''}`} aria-busy={sending}>
                    {results.map((result) => (
                        <ChatGif
                            // Unique by construction: the catalogue's own key is
                            // (provider, mediaId), and the route maps one result
                            // per id.
                            key={`${result.provider}:${result.mediaId}`}
                            attachment={result}
                            onSelect={() => onSelect(result)}
                        />
                    ))}
                </div>
            )}
            {/* Naming the catalogue is a condition of using it — KLIPY's API
                terms ask for the mark in the search field and beside the
                content, which is what the placeholder above and this line are.
                Text rather than their logo: this app ships no third-party
                brand art, and a wordmark in the app's own type is the version
                that survives a theme change. `ag-hint` because that is what
                the app's fine print already is, everywhere else. */}
            <div className="ag-hint ag-hint--right">GIFs by {GIF_PROVIDER_NAME}</div>
        </div>
    );
}
