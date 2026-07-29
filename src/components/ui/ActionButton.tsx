'use client'
import React from 'react';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** True while this button's own command is in flight. */
    pending?: boolean;
    /** Present-tense verb the button takes on once the command is in flight
     *  ("Rolling the dice…"). Kept short — it replaces the label in place. */
    pendingLabel: string;
}

/**
 * Any button that sends a command. It presses in the instant it's tapped, then
 * swaps its label for the verb with a moving hairline underneath, so the player
 * can see the command left the device (see the command-feedback block in
 * ag-theme.css for the timing). Style it with the usual .ag-btn classes via
 * `className` — this only adds the pending behaviour on top.
 */
export default function ActionButton({
    pending = false,
    pendingLabel,
    className = '',
    disabled,
    children,
    ...rest
}: ActionButtonProps) {
    return (
        <button
            type="button"
            className={`${className}${pending ? ' ag-btn--pending' : ''}`}
            disabled={disabled || pending}
            aria-busy={pending || undefined}
            {...rest}
        >
            <span className="ag-btn-body">{children}</span>
            {pending && (
                <>
                    <span className="ag-btn-pending-verb">
                        <span className="ag-spinner" />
                        {pendingLabel}
                    </span>
                    <span className="ag-btn-pending-bar" />
                </>
            )}
        </button>
    );
}
