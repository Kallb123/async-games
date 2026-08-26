'use client'
import { useEffect } from 'react';
import ErrorScreen from '@/components/ui/ErrorScreen';

/**
 * The error boundary for everything under the root layout.
 *
 * There wasn't one. A component that threw while rendering — a game board
 * reading a field off state that hadn't arrived, a malformed response — took
 * the whole tree down to Next's built-in fallback, which in production says
 * "Application error: a client-side exception has occurred" and offers no way
 * out. On a phone, with no address bar to retype a URL into, that is the end
 * of the session.
 *
 * `reset` re-renders the segment, which is genuinely enough for the errors
 * this catches most often: a stale fetch, a race on first paint.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
    useEffect(() => {
        console.error('Unhandled render error', error);
    }, [error]);

    return (
        <ErrorScreen
            title="That didn't go to plan"
            message="Something broke while drawing this screen. Your games are safe — nothing here had chance to change them."
            onRetry={reset}
            digest={error.digest}
        />
    );
}
