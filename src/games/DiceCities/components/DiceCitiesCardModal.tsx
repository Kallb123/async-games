'use client'

import { Modal } from 'react-bootstrap';
import { useCloseRequest } from '@/utils/hooks/useCloseRequest';
import type { IDiceCitiesCard } from '@/games/DiceCities/apiModels';
import { ACTIVATION_META, activationFor, rollLabel } from '@/games/DiceCities/ui';
import CardArt from '@/games/DiceCities/components/CardArt';
import type { DiceCitiesTheme } from '@/games/DiceCities/themes';

interface DiceCitiesCardModalProps {
    card: IDiceCitiesCard;
    /** Only for what a landmark is called on this board — the card names and
     *  illustrates itself. */
    theme: DiceCitiesTheme;
    onClose: () => void;
}

/**
 * One card, big enough to read. The illustrations are whole card faces — the
 * roll number, the name, the cost and the rules text are all printed on them —
 * so at the thumbnail size a city or a market grid can afford, none of that is
 * legible. `ZoomableCardArt` is what opens it, so a surface showing card art
 * gets the popup without wiring any of it up.
 *
 * The rules text is repeated under the art because the source images are only
 * 162px wide: blown up they read, but not crisply.
 */
export default function DiceCitiesCardModal({ card, theme, onClose }: DiceCitiesCardModalProps) {
    useCloseRequest(true, onClose);
    const activation = ACTIVATION_META[activationFor(card)];
    const rolls = rollLabel(card);

    return (
        <Modal show onHide={onClose} dialogClassName="ag-modal" centered>
            <Modal.Header closeButton>
                <Modal.Title>{card.title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <CardArt card={card} className="ag-dc-card-big" />
                <div className="ag-dc-card-facts">
                    {rolls && <span className="ag-dc-card-fact">🎲 {rolls}</span>}
                    <span className="ag-dc-card-fact">{card.cost}🪙</span>
                    {card.type === 'landmark'
                        ? <span className="ag-dc-card-fact">{theme.words.landmark}</span>
                        : (
                            <span className="ag-dc-card-fact">
                                <span className="ag-dc-legend-dot" style={{ background: activation.color }} />
                                pays {activation.label}
                            </span>
                        )}
                </div>
                <p className="ag-hint ag-hint--tight">{card.text}</p>
            </Modal.Body>
            <Modal.Footer>
                <button type="button" className="ag-btn ag-btn--primary" onClick={onClose}>Close</button>
            </Modal.Footer>
        </Modal>
    );
}
