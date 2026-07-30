'use client'
import PlayingCard from '@/components/ui/PlayingCard';
import Link from "next/link";
import Stat from '@/components/ui/Stat';
import { ICard, SUITS } from '@/utils/games/Cards';
import { ISolitaireGameStateResponse } from '@/games/Solitaire/apiModels';
import { computeFinalScore, computeTimePenalty, foundationCardCount, formatDuration } from '@/games/Solitaire/rules';
import { useElapsedSeconds } from '@/utils/hooks/useElapsedSeconds';

interface SolitaireVictoryScreenProps {
    state: ISolitaireGameStateResponse;
}

// The doc's "solve screen" (mock 7c): the solo stand-in for a turn recap —
// victory hero, a Microsoft-rules scoring receipt, and a telemetry grid
// reusing the existing Stat/.ag-stat-row primitive (see src/app/profile/page.tsx).
export default function SolitaireVictoryScreen({ state }: SolitaireVictoryScreenProps) {
    const elapsedSeconds = useElapsedSeconds(state.startedAt);
    const timePenalty = computeTimePenalty(elapsedSeconds);
    const finalScore = computeFinalScore(state.score, elapsedSeconds);
    const foundationYield = foundationCardCount(state.foundations);
    const penalizedRecycles = Math.max(0, state.stockRecycleCount - 2);
    const efficiency = Math.round(Math.min(1, state.tableauCardsTurned / 21) * 100);

    const breakdown: { label: string; value: number }[] = [
        { label: `Cards to foundation · ${state.cardsToFoundationCount} × 10`, value: state.cardsToFoundationCount * 10 },
        { label: `Tableau cards turned · ${state.tableauCardsTurned} × 5`, value: state.tableauCardsTurned * 5 },
        { label: `Waste → tableau · ${state.wasteToTableauCount} × 5`, value: state.wasteToTableauCount * 5 },
    ];
    if (state.foundationToTableauCount > 0) {
        breakdown.push({ label: `Foundation → tableau · ${state.foundationToTableauCount} × −15`, value: state.foundationToTableauCount * -15 });
    }
    if (penalizedRecycles > 0) {
        breakdown.push({ label: `Stock recycle · ${penalizedRecycles} × −20`, value: penalizedRecycles * -20 });
    }
    if (timePenalty > 0) {
        breakdown.push({ label: `Time penalty · ${elapsedSeconds}s elapsed`, value: -timePenalty });
    }

    const kings: ICard[] = SUITS.map((suit) => ({ rank: 13, suit, faceUp: true }));

    return (
        <div className="ag-section" style={{ paddingBottom: 24 }}>
            <div className="ag-turn-card ag-solitaire-victory-hero">
                <div className="ag-solitaire-victory-title">You solved it! 🎉</div>
                <div className="ag-hint" style={{ marginTop: 4 }}>
                    All 52 cards home — a clean {state.drawMode === 'DRAW_3' ? 'Draw-3' : 'Draw-1'} finish.
                </div>
                <div className="ag-solitaire-victory-kings">
                    {kings.map((king) => <PlayingCard key={king.suit} card={king} />)}
                </div>
            </div>

            <div className="ag-card ag-solitaire-score-card">
                <div className="ag-section-label">Final score · Microsoft rules</div>
                <div className="ag-solitaire-score-num">{finalScore}</div>
            </div>

            <div className="ag-list" style={{ marginTop: 12 }}>
                {breakdown.map((row, i) => (
                    <div key={i} className="ag-list-row">
                        <div className="ag-list-row-main"><div className="ag-list-row-title">{row.label}</div></div>
                        <div className={`ag-solitaire-breakdown-value${row.value < 0 ? ' ag-solitaire-breakdown-value--negative' : ''}`}>
                            {row.value >= 0 ? `+${row.value}` : row.value}
                        </div>
                    </div>
                ))}
            </div>

            <div className="ag-section-label" style={{ marginTop: 16 }}>This game</div>
            <div className="ag-stat-row" style={{ flexWrap: 'wrap' }}>
                <Stat value={formatDuration(elapsedSeconds)} label="time" />
                <Stat value={state.moves} label="moves" />
                <Stat value={state.undoCount} label="undos" />
                <Stat value={`${foundationYield}/52`} label="foundation" />
                <Stat value={state.stockRecycleCount} label="recycles" />
                <Stat value={`${efficiency}%`} label="efficiency" />
            </div>

            <div className="ag-solitaire-victory-actions">
                <Link href="/newgame/solitaire" className="ag-btn ag-btn--primary" style={{ flex: 1 }}>New deal</Link>
                <Link href="/" className="ag-btn ag-btn--light">Back home</Link>
            </div>
        </div>
    );
}
