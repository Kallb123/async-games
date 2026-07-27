'use client'
import { useState } from 'react';
import PlayingCard from '@/components/ui/PlayingCard';
import { ICard, Suit } from '@/utils/games/Cards';
import { ISolitaireGameStateResponse } from '@/games/Solitaire/apiModels';
import { getLegalMoves, ISolitaireLegalMove, SolitaireZoneRef } from '@/games/Solitaire/rules';
import SolitaireLegalMoveSheet from './SolitaireLegalMoveSheet';

const FOUNDATION_ORDER: Suit[] = ['S', 'H', 'C', 'D'];

interface SolitaireBoardProps {
    state: ISolitaireGameStateResponse;
    disabled?: boolean;
    onDraw: () => void;
    onMove: (source: SolitaireZoneRef, destination: SolitaireZoneRef, count: number) => void;
}

interface Selection {
    source: SolitaireZoneRef;
    count: number;
    card: ICard;
    moves: ISolitaireLegalMove[];
}

/**
 * The Klondike board: stock/waste, four foundations, seven tableau columns.
 * Tapping a movable card opens a sheet of legal destinations (SolitaireLegalMoveSheet)
 * rather than drag-and-drop, per the design doc.
 */
export default function SolitaireBoard({ state, disabled = false, onDraw, onMove }: SolitaireBoardProps) {
    const [selection, setSelection] = useState<Selection | null>(null);

    const legalMoveState = { waste: state.waste, foundations: state.foundations, tableau: state.tableau, stockCount: state.stockCount };

    const select = (source: SolitaireZoneRef, count: number, card: ICard) => {
        if (disabled) return;
        const moves = getLegalMoves(legalMoveState).filter((m) => matchesSource(m.source, source) && m.count === count);
        setSelection({ source, count, card, moves });
    };

    const handleChoose = (move: ISolitaireLegalMove) => {
        onMove(move.source, move.destination, move.count);
        setSelection(null);
    };

    const wasteFan = state.waste.slice(-3);

    return (
        <div className="ag-solitaire-felt">
            <div className="ag-solitaire-toprow">
                <div className="ag-solitaire-stockwaste">
                    <div style={{ position: 'relative' }}>
                        {state.stockCount > 0 ? (
                            <PlayingCard card={{ faceUp: false }} onClick={disabled ? undefined : onDraw} />
                        ) : (
                            <PlayingCard placeholder={state.waste.length > 0 ? '↻' : ''} onClick={disabled ? undefined : (state.waste.length > 0 ? onDraw : undefined)} />
                        )}
                        <div className="ag-solitaire-stockcount">{state.stockCount}</div>
                    </div>
                    <div className="ag-solitaire-wastefan">
                        {wasteFan.length === 0 && <PlayingCard />}
                        {wasteFan.map((card, i) => {
                            const isTop = i === wasteFan.length - 1;
                            return (
                                <div key={i} className="ag-solitaire-wastecard" style={{ left: i * 14 }}>
                                    <PlayingCard
                                        card={card}
                                        onClick={isTop ? () => select({ zone: 'waste' }, 1, card) : undefined}
                                        selected={isTop && selection?.source.zone === 'waste'}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="ag-solitaire-foundations">
                    {FOUNDATION_ORDER.map((suit) => {
                        const pile = state.foundations[suit];
                        const top = pile[pile.length - 1];
                        return (
                            <PlayingCard
                                key={suit}
                                card={top}
                                placeholder={top ? undefined : { S: '♠', H: '♥', C: '♣', D: '♦' }[suit]}
                                onClick={top ? () => select({ zone: 'foundation', suit }, 1, top) : undefined}
                                selected={selection?.source.zone === 'foundation' && selection.source.suit === suit}
                            />
                        );
                    })}
                </div>
            </div>

            <div className="ag-solitaire-tableau">
                {state.tableau.map((column, colIndex) => (
                    <div key={colIndex} className="ag-solitaire-column">
                        {column.length === 0 && <PlayingCard />}
                        {column.map((card, cardIndex) => {
                            const count = column.length - cardIndex;
                            const isSelected = selection?.source.zone === 'tableau' && selection.source.column === colIndex && selection.count === count;
                            return (
                                <div key={cardIndex} className="ag-solitaire-stackcard">
                                    <PlayingCard
                                        card={card}
                                        onClick={card.faceUp ? () => select({ zone: 'tableau', column: colIndex }, count, card) : undefined}
                                        selected={isSelected}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            {selection && (
                <SolitaireLegalMoveSheet
                    card={selection.card}
                    moves={selection.moves}
                    onChoose={handleChoose}
                    onCancel={() => setSelection(null)}
                />
            )}
        </div>
    );
}

function matchesSource(a: SolitaireZoneRef, b: SolitaireZoneRef): boolean {
    if (a.zone !== b.zone) return false;
    if (a.zone === 'tableau' && b.zone === 'tableau') return a.column === b.column;
    if (a.zone === 'foundation' && b.zone === 'foundation') return a.suit === b.suit;
    return true;
}
