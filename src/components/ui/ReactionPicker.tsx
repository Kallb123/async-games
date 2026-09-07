'use client'
import React from 'react';
import { useDismissablePopup } from '@/utils/hooks/useDismissablePopup';
import { REACTION_TEXT_OPTIONS, REACTION_EMOJI_OPTIONS } from '@/utils/reactions';

// The trigger's own face, drawn rather than typed — a plain smiley kept
// deliberately mono (a stroked outline in the current text colour) rather
// than a coloured emoji, so the control that opens the reaction picker reads
// as a neutral "react" affordance and not as any one reaction already chosen.
function SmileyIcon() {
    return (
        <svg
            viewBox="0 0 20 20"
            width="1.1em"
            height="1.1em"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            <circle cx="10" cy="10" r="7.6" />
            <circle cx="7.2" cy="8.2" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="12.8" cy="8.2" r="0.9" fill="currentColor" stroke="none" />
            <path d="M6.6 12c1 1.3 2.3 2 3.4 2s2.4-.7 3.4-2" />
        </svg>
    );
}

interface ReactionPickerProps {
    /** Already-sent reaction for this action, if any — renders as a sent pill instead of the trigger. */
    reacted?: string | null;
    /**
     * Invoked with the chosen reaction; the popup closes immediately. Omit for
     * a read-only pill (e.g. showing a reaction someone else sent) — the picker
     * trigger is never rendered in that case, only the `reacted` pill.
     */
    onReact?: (reaction: string) => void;
    /** Overrides the `reacted` pill's aria-label (defaults to "You reacted …"). */
    reactedLabel?: string;
}

/**
 * The grey smiley control on a recap or match-history entry: opens a small
 * anchored popup of canned phrases plus an emoji row. Reuses the game-options
 * kebab menu's open/outside-click/Escape shell and its `.ag-gom-*` popup/row
 * styling — only the emoji row is a genuinely new layout. Once *this* player
 * has reacted, renders their own reaction as a fixed pill instead — one
 * reaction per player per action is allowed, so a caller renders one
 * `ReactionPicker` per player who reacted (or could still react).
 */
export default function ReactionPicker({ reacted, onReact, reactedLabel }: ReactionPickerProps) {
    const { open, setOpen, rootRef } = useDismissablePopup<HTMLDivElement>();

    const choose = (reaction: string) => {
        setOpen(false);
        onReact?.(reaction);
    };

    if (reacted) {
        return <span className="ag-pill-action ag-pill-action--solid" aria-label={reactedLabel ?? `You reacted ${reacted}`}>{reacted}</span>;
    }

    if (!onReact) {
        return null;
    }

    return (
        <div className="ag-gom" ref={rootRef}>
            <button
                type="button"
                className="ag-pill-action ag-reaction-trigger"
                onClick={() => setOpen(v => !v)}
                aria-label="React to this"
                aria-haspopup="menu"
                aria-expanded={open}
            ><SmileyIcon /></button>

            {open && (
                <div className="ag-gom-menu" role="menu">
                    {REACTION_TEXT_OPTIONS.map((text) => (
                        <button
                            key={text}
                            type="button"
                            role="menuitem"
                            className="ag-gom-item"
                            onClick={() => choose(text)}
                        >
                            <span className="ag-gom-item-label">{text}</span>
                        </button>
                    ))}
                    <div className="ag-reaction-menu-emojis">
                        {REACTION_EMOJI_OPTIONS.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                role="menuitem"
                                className="ag-reaction-menu-emoji"
                                onClick={() => choose(emoji)}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
