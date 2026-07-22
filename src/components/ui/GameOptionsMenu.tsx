'use client'
import React, { useEffect, useRef, useState } from 'react';

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
}

/**
 * The shared game-options control for the top-bar's right slot: a triple-dot
 * (kebab) button that opens a dropdown of per-game actions — replay the last
 * recap, toggle the turn-history list, end the game, etc. Every game reuses
 * this and just supplies its own `options`.
 */
export default function GameOptionsMenu({ options, label = 'Game options' }: GameOptionsMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // Close on outside click or Escape while the menu is open.
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (options.length === 0) return null;

    return (
        <div className="ag-gom" ref={rootRef}>
            <button
                type="button"
                className={`ag-game-topbar-btn${open ? ' ag-game-topbar-btn--on' : ''}`}
                onClick={() => setOpen(v => !v)}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
            >⋮</button>

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
