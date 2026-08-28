'use client'

import { Modal } from 'react-bootstrap';
import { useCloseRequest } from '@/utils/hooks/useCloseRequest';
import type { OutbreakRoleDef } from '@/games/Outbreak/board';

interface OutbreakRoleInfoPopupProps {
    role: OutbreakRoleDef;
    onClose: () => void;
}

// Tapping a player's role name in OutbreakHands opens this — the §11 ability
// text, otherwise only readable by digging through the GDD.
export default function OutbreakRoleInfoPopup({ role, onClose }: OutbreakRoleInfoPopupProps) {
    useCloseRequest(true, onClose);

    return (
        <Modal show onHide={onClose} dialogClassName="ag-modal">
            <Modal.Header closeButton>
                <Modal.Title>{role.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p className="ag-hint">{role.ability}</p>
            </Modal.Body>
            <Modal.Footer>
                <button type="button" className="ag-btn ag-btn--primary" onClick={onClose}>Close</button>
            </Modal.Footer>
        </Modal>
    );
}
