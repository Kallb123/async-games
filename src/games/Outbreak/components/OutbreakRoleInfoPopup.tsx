'use client'

import { Modal } from 'react-bootstrap';
import { useCloseRequest } from '@/utils/hooks/useCloseRequest';
import type { OutbreakRoleDef } from '@/games/Outbreak/board';

interface OutbreakRoleInfoPopupProps {
    role: OutbreakRoleDef;
    // An optional lead-in shown above the ability — the welcome popup that
    // greets a player with the role they've been dealt uses it to say so.
    intro?: string;
    onClose: () => void;
}

// Tapping a player's role name in OutbreakHands opens this — the §11 ability
// text, otherwise only readable by digging through the GDD. It also fronts the
// first-visit welcome (OutbreakRoleIntro), which passes an `intro`.
export default function OutbreakRoleInfoPopup({ role, intro, onClose }: OutbreakRoleInfoPopupProps) {
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
