'use client'
import { useEffect } from 'react';
import { SRGB } from '@/utils/ui/colours';

/**
 * The last resort: an error thrown by the root layout itself, which `error.tsx`
 * sits inside and therefore cannot catch.
 *
 * This boundary *replaces* the root layout, so nothing it normally provides is
 * here — not the font, not ag-theme.css, not the providers. Everything below
 * is inline and self-contained for exactly that reason: a boundary that needs
 * the stylesheet the broken layout was going to load is a boundary that
 * renders unstyled at the worst possible moment.
 *
 * Colours come from SRGB, which exists for this — the resolved values of the
 * theme's tokens, for a renderer with no stylesheet behind it (the icon script
 * is the other one).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
    useEffect(() => {
        console.error('Unhandled root error', error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{
                margin: 0,
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
                background: SRGB.bg,
                color: SRGB.brown,
                font: "500 15px/1.5 ui-sans-serif, system-ui, sans-serif",
            }}>
                <div style={{ maxWidth: 380, textAlign: "center" }}>
                    <h1 style={{ font: "700 22px/1.3 ui-sans-serif, system-ui, sans-serif", margin: "0 0 10px" }}>
                        Async Games couldn&apos;t start
                    </h1>
                    <p style={{ margin: "0 0 20px", opacity: 0.75 }}>
                        Something went wrong before the app finished loading. Your games are safe.
                    </p>
                    {error.digest && (
                        <p style={{ margin: "0 0 20px", font: "500 11px/1.4 ui-monospace, monospace", opacity: 0.6 }}>
                            {error.digest}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={reset}
                        style={{
                            font: "600 15px/1 ui-sans-serif, system-ui, sans-serif",
                            padding: "13px 22px",
                            borderRadius: 999,
                            border: "none",
                            cursor: "pointer",
                            background: SRGB.brown,
                            color: SRGB.cream,
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
}
