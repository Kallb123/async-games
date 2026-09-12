'use client'

import { Modal } from 'react-bootstrap';
import { useCloseRequest } from '@/utils/hooks/useCloseRequest';

/**
 * The two things every game's role table already carries, and the only two this
 * card shows. Both Outbreak's `OutbreakRoleDef` and Banned Islet's
 * `IBannedIsletRoleDef` satisfy it as they are, so neither has to reshape its
 * own data to use this.
 */
export interface RoleInfo {
    name: string;
    /** Written in the player's language, because this is where they read it. */
    ability: string;
}

interface RoleInfoPopupProps {
    role: RoleInfo;
    /**
     * An optional lead-in above the ability — the welcome that greets a player
     * with the role they have been dealt uses it to say so.
     */
    intro?: string;
    onClose: () => void;
}

/**
 * What a role lets you do, on a card. Tapping a player's role name in a hands
 * panel opens it, which is otherwise information only the design document has —
 * and in a co-op that plans around who can do what, every seat's ability needs
 * to be readable, not just your own.
 *
 * Shared rather than per-game: it started as Outbreak's, and Banned Islet's six
 * roles wanted exactly the same card. A second copy is the signal to extract the
 * first (AGENTS.md), and there is nothing game-specific left in it — a game
 * passes a name and a sentence.
 */
export default function RoleInfoPopup({ role, intro, onClose }: RoleInfoPopupProps) {
    useCloseRequest(true, onClose);

    return (
        <Modal show onHide={onClose} dialogClassName="ag-modal">
            <Modal.Header closeButton>
                <Modal.Title>{role.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {intro && <p className="ag-hint">{intro}</p>}
                <p className="ag-hint">{role.ability}</p>
            </Modal.Body>
            <Modal.Footer>
                <button type="button" className="ag-btn ag-btn--primary" onClick={onClose}>Close</button>
            </Modal.Footer>
        </Modal>
    );
}
