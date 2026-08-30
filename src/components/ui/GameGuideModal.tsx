'use client'

import { Modal } from 'react-bootstrap';
import { useCloseRequest } from '@/utils/hooks/useCloseRequest';
import type { GameGuide } from '@/utils/ui/gameGuides';

interface GameGuideModalProps {
    guide: GameGuide;
    onClose: () => void;
}

/**
 * The how-to-play popup shared by every game: a title plus a handful of
 * headed sections. Driven by `useGameGuide`, which opens this automatically
 * the first time a game not yet in the account's seen list is entered, and
 * on demand from the game-options menu's "Game guide" row.
 */
export default function GameGuideModal({ guide, onClose }: GameGuideModalProps) {
    useCloseRequest(true, onClose);

    return (
        <Modal show onHide={onClose} dialogClassName="ag-modal">
            <Modal.Header closeButton>
                <Modal.Title>{guide.title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {guide.sections.map((section) => (
                    <div className="ag-guide-section" key={section.heading}>
                        <div className="ag-guide-section-title">{section.heading}</div>
                        <p className="ag-hint ag-hint--tight">{section.body}</p>
                    </div>
                ))}
            </Modal.Body>
            <Modal.Footer>
                <button type="button" className="ag-btn ag-btn--primary" onClick={onClose}>Got it</button>
            </Modal.Footer>
        </Modal>
    );
}
