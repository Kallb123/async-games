'use client'

import { Modal } from 'react-bootstrap';
import { useCloseRequest } from '@/utils/hooks/useCloseRequest';

/** A headed block of explanatory copy. */
export interface InfoSection {
    heading: string;
    body: string;
}

interface InfoModalProps {
    title: string;
    sections: InfoSection[];
    onClose: () => void;
    /** The dismiss button's label. "Got it" unless a sheet wants its own word. */
    closeLabel?: string;
}

/**
 * The explain-something popup: a title, a handful of headed sections, and one
 * button to dismiss it. `GameGuideModal` and `NotificationHelp` are both this
 * with their own copy, which is why the shell lives here rather than in either
 * of them — a third explainer should be a `sections` array, not a third modal.
 *
 * `useCloseRequest` is what makes Android's back gesture close the sheet
 * instead of leaving the screen behind it.
 */
export default function InfoModal({ title, sections, onClose, closeLabel = 'Got it' }: InfoModalProps) {
    useCloseRequest(true, onClose);

    return (
        <Modal show onHide={onClose} dialogClassName="ag-modal">
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {sections.map((section) => (
                    <div className="ag-info-section" key={section.heading}>
                        <div className="ag-info-section-title">{section.heading}</div>
                        <p className="ag-hint ag-hint--tight">{section.body}</p>
                    </div>
                ))}
            </Modal.Body>
            <Modal.Footer>
                <button type="button" className="ag-btn ag-btn--primary" onClick={onClose}>{closeLabel}</button>
            </Modal.Footer>
        </Modal>
    );
}
