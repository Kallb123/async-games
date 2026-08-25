'use client'
import Link from 'next/link';
import Brand from '@/components/ui/Brand';

interface ErrorScreenProps {
    /** The headline. Short, and in the player's language, not the stack's. */
    title: string;
    /** A sentence on what happened and what they can do about it. */
    message: string;
    /** Wired to an error boundary's `reset`, when there is one to offer. */
    onRetry?: () => void;
    /** Shown small and monospaced under the message — Next's `error.digest`,
     *  which is the only handle on a production error whose message has been
     *  stripped. Nothing to act on, but it makes a bug report answerable. */
    digest?: string;
}

/**
 * The screen behind every dead end: a thrown render, a 404, a route that
 * doesn't exist. One component so the three of them look like the same app
 * rather than three different failures, and so every one of them offers a way
 * back — which is the whole point. Without an error boundary a thrown render
 * leaves Next's own bare "Application error: a client-side exception has
 * occurred", with no route home and nothing to report.
 *
 * Same shell as `AuthScreen` and `LegalPage`: a `<main>` inside the root
 * layout's `.ag-app` column (never a second one of its own), the brand bar,
 * then an `.ag-hero` lockup.
 */
export default function ErrorScreen({ title, message, onRetry, digest }: ErrorScreenProps) {
    return (
        <main>
            <div className="ag-topbar">
                <Brand />
            </div>
            <div className="ag-hero">
                <h1 className="ag-hero-title">{title}</h1>
                <p className="ag-hero-sub">{message}</p>
                {digest && <p className="ag-digest">{digest}</p>}
            </div>
            <div className="ag-section">
                <div className="ag-btn-row">
                    {onRetry && (
                        <button type="button" className="ag-btn ag-btn--dark ag-btn--block" onClick={onRetry}>
                            Try again
                        </button>
                    )}
                    <Link className="ag-btn ag-btn--light ag-btn--block" href="/">
                        Back to my games
                    </Link>
                </div>
            </div>
        </main>
    );
}
