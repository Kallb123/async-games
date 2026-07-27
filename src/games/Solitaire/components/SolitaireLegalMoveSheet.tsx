'use client'
import { Modal } from 'react-bootstrap';
import PlayingCard from '@/components/ui/PlayingCard';
import { ICard, rankLabel, suitSymbol } from '@/utils/games/Cards';
import { ISolitaireLegalMove } from '@/games/Solitaire/rules';

interface SolitaireLegalMoveSheetProps {
    card: ICard;
    moves: ISolitaireLegalMove[];
    onChoose: (move: ISolitaireLegalMove) => void;
    onCancel: () => void;
}

// The tap-to-move destination picker (design doc mock 7b): a modal listing
// every legal destination for the tapped card, reusing the same
// Modal/ag-modal pattern already used for in-game pickers elsewhere
// (SettlementsAndCitiesActions' trade modal).
export default function SolitaireLegalMoveSheet({ card, moves, onChoose, onCancel }: SolitaireLegalMoveSheetProps) {
    const cardLabel = card.rank && card.suit ? `${rankLabel(card.rank)}${suitSymbol(card.suit)}` : 'card';

    return (
        <Modal show onHide={onCancel} dialogClassName="ag-modal" centered>
            <Modal.Header closeButton>
                <Modal.Title>Legal moves for {cardLabel}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {moves.length === 0 && (
                    <p className="ag-hint">No legal moves for this card right now.</p>
                )}
                {moves.length > 0 && (
                    <div className="ag-list">
                        {moves.map((move, i) => (
                            <button
                                key={i}
                                type="button"
                                className="ag-list-row ag-list-row--button"
                                onClick={() => onChoose(move)}
                                style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left' }}
                            >
                                <PlayingCard card={card} size={34} />
                                <div className="ag-list-row-main">
                                    <div className="ag-list-row-title">{move.label}</div>
                                    <div className="ag-list-row-sub">
                                        {move.reason}
                                        {move.recommended && ' · Recommended'}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </Modal.Body>
            <Modal.Footer>
                <button type="button" className="ag-btn ag-btn--light" onClick={onCancel}>Cancel</button>
            </Modal.Footer>
        </Modal>
    );
}
