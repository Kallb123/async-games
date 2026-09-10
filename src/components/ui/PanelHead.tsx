import React from 'react';

interface PanelHeadProps {
    /** What the panel is. */
    title: string;
    /** The dim line under it — the chat and history panels use it to say which
     *  end of the list is newest, since the two run in opposite directions. */
    subtitle?: React.ReactNode;
    /** Dismisses the panel. The top-bar toggle that opened it does the same. */
    onClose: () => void;
    /** What the ✕ is called, for a screen reader: "Close chat", not "Close" —
     *  a board can have two of these panels open at once. */
    closeLabel: string;
}

/**
 * The title row every dismissible `.ag-log` panel opens with: a title, an
 * optional dim subtitle, and its own ✕ on the right.
 *
 * The markup was written out three times — the chat thread, the turn-history
 * log and the GIF picker — sharing only a stylesheet class, which is the case
 * AGENTS.md calls a defect rather than reuse. Sharing the component instead
 * means the fourth panel cannot forget the `type="button"` or the ✕'s
 * `aria-label`.
 */
export default function PanelHead({ title, subtitle, onClose, closeLabel }: PanelHeadProps) {
    return (
        <div className="ag-panel-head">
            <div>
                <div className="ag-hand-title">{title}</div>
                {subtitle !== undefined && <div className="ag-panel-subtitle">{subtitle}</div>}
            </div>
            <button type="button" className="ag-panel-close" onClick={onClose} aria-label={closeLabel}>✕</button>
        </div>
    );
}
