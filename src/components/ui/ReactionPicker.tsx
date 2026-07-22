'use client'
import React from 'react';
import { useDismissablePopup } from '@/utils/hooks/useDismissablePopup';
import { REACTION_TEXT_OPTIONS, REACTION_EMOJI_OPTIONS } from '@/utils/reactions';

interface ReactionPickerProps {
    /** Already-sent reaction for this action, if any — renders as a sent pill instead of the trigger. */
    reacted?: string | null;
    /** Invoked with the chosen reaction; the popup closes immediately. */
    onReact: (reaction: string) => void;
}

/**
 * The 💬 control on a recap timeline entry: opens a small anchored popup of
 * canned phrases plus an emoji row. Reuses the game-options kebab menu's
 * open/outside-click/Escape shell and its `.ag-gom-*` popup/row styling —
 * only the emoji row is a genuinely new layout. Once a reaction has been
 * sent, renders it as a fixed pill instead — only one reaction per action
 * is allowed.
 */
export default function ReactionPicker({ reacted, onReact }: ReactionPickerProps) {
    const { open, setOpen, rootRef } = useDismissablePopup<HTMLDivElement>();

    const choose = (reaction: string) => {
        setOpen(false);
        onReact(reaction);
    };

    if (reacted) {
        return <span className="ag-pill-action ag-pill-action--solid" aria-label={`You reacted ${reacted}`}>{reacted}</span>;
    }

    return (
        <div className="ag-gom" ref={rootRef}>
            <button
                type="button"
                className="ag-pill-action"
                onClick={() => setOpen(v => !v)}
                aria-label="React to this"
                aria-haspopup="menu"
                aria-expanded={open}
            >💬</button>

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
