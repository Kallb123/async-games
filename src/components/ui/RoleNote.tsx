'use client'

import { useState } from 'react';
import RoleInfoPopup, { RoleInfo } from '@/components/ui/RoleInfoPopup';

interface RoleNoteProps {
    role: RoleInfo;
}

/**
 * A seat's role name on a hands panel, tappable for what it lets that player
 * do — the trailing `note` a `PlayerHandSeat` carries, and the `RoleInfoPopup`
 * it opens, as one piece.
 *
 * The popup was shared before this was, which left both hands panels holding
 * their own copy of the same "which role's card is open" state and the same
 * button markup. Owning the state here instead means a game with roles writes
 * one line — `note: <RoleNote role={roleDef(ps.role)} />` — and a third game
 * copies nothing.
 *
 * The state is per note rather than per panel, which is why this is a component
 * and not a hook: only one can be open at a time anyway (the popup is modal),
 * and a seat that owns its own open flag needs no wrapper element around the
 * panel to hang a shared one on.
 */
export default function RoleNote({ role }: RoleNoteProps) {
    const [open, setOpen] = useState(false);

    return (
        <>
            {open && <RoleInfoPopup role={role} onClose={() => setOpen(false)} />}
            <button
                type="button"
                className="ag-hand-note ag-hand-note--tappable"
                onClick={() => setOpen(true)}
            >
                {role.name} ⓘ
            </button>
        </>
    );
}
