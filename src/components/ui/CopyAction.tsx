'use client'
import { useState } from 'react';

/**
 * A section heading's "Copy" link — `RefreshAction`'s sibling, for handing a
 * section's contents to the clipboard. `text` is only built on the click, so a
 * big export costs nothing until someone asks for it. Reads "Copied" for a
 * moment after, or "Copy failed" where the browser refuses the clipboard.
 */
export default function CopyAction({ label = 'Copy', text }: { label?: string; text: () => string }) {
    const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text());
            setState('copied');
        } catch {
            setState('failed');
        }
        setTimeout(() => setState('idle'), 1500);
    };
    return (
        <button type="button" className="ag-section-action" onClick={copy} aria-live="polite">
            {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
        </button>
    );
}
