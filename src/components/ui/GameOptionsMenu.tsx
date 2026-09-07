'use client'
import React from 'react';
import { useDismissablePopup } from '@/utils/hooks/useDismissablePopup';

export interface GameOption {
    /** Stable key for React. */
    key: string;
    /** Row label. */
    label: React.ReactNode;
    /** Optional leading glyph/emoji. */
    icon?: React.ReactNode;
    /** Invoked when the row is chosen; the menu closes afterwards. */
    onClick: () => void;
    /** Toggle rows: highlight the row and show a check when the toggle is on. */
    active?: boolean;
    /** Destructive rows (e.g. surrender) render in a warning colour. */
    danger?: boolean;
    /** Disable the row (still shown, but not clickable). */
    disabled?: boolean;
}

interface GameOptionsMenuProps {
    /** Rows to show in the dropdown, top to bottom. */
    options: GameOption[];
    /** Accessible label for the trigger button. */
    label?: string;
    /** What the trigger button shows. Defaults to the kebab dots. */
    trigger?: React.ReactNode;
    /** Class on the trigger button, for a menu that hangs off something other
     *  than a top-bar icon button (the dev badge). The open state adds a
     *  `--on` modifier to whatever this is, the same way the default does. */
    triggerClassName?: string;
}

/**
 * The shared game-options control for the top-bar's right slot: a triple-dot
 * (kebab) button that opens a dropdown of per-game actions — replay the last
 * recap, toggle the turn-history list, end the game, etc. Every game reuses
 * this and just supplies its own `options`.
 *
 * `trigger`/`triggerClassName` let a second menu in the same bar hang off a
 * different button — the dev deployment's 🚧 DEV badge (`DevGameMenu`) — with
 * the same dropdown, the same dismiss behaviour and the same rows.
 */
export default function GameOptionsMenu({ options, label = 'Game options', trigger = '⋮', triggerClassName = 'ag-game-topbar-btn' }: GameOptionsMenuProps) {
    const { open, setOpen, rootRef } = useDismissablePopup<HTMLDivElement>();

    if (options.length === 0) return null;

    return (
        <div className="ag-gom" ref={rootRef}>
            <button
                type="button"
                className={`${triggerClassName}${open ? ` ${triggerClassName}--on` : ''}`}
                onClick={() => setOpen(v => !v)}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
            >{trigger}</button>

            {open && (
                <div className="ag-gom-menu" role="menu">
                    {options.map((opt) => (
                        <button
                            key={opt.key}
                            type="button"
                            role="menuitem"
                            className={`ag-gom-item${opt.active ? ' ag-gom-item--active' : ''}${opt.danger ? ' ag-gom-item--danger' : ''}`}
                            disabled={opt.disabled}
                            onClick={() => {
                                setOpen(false);
                                opt.onClick();
                            }}
                        >
                            {opt.icon != null && <span className="ag-gom-item-icon" aria-hidden="true">{opt.icon}</span>}
                            <span className="ag-gom-item-label">{opt.label}</span>
                            {opt.active && <span className="ag-gom-item-check" aria-hidden="true">✓</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
