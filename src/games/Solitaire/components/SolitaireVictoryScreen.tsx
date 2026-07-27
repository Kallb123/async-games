'use client'
import PlayingCard from '@/components/ui/PlayingCard';
import { ICard, SUITS } from '@/utils/games/Cards';
import { ISolitaireGameStateResponse } from '@/games/Solitaire/apiModels';
import { computeFinalScore, computeTimePenalty } from '@/games/Solitaire/rules';
import { formatDuration } from '@/games/Solitaire/ui';

interface SolitaireVictoryScreenProps {
    state: ISolitaireGameStateResponse;
}

// The doc's "solve screen" (mock 7c): the solo stand-in for a turn recap —
// victory hero, a Microsoft-rules scoring receipt, and a telemetry grid
// reusing the existing .ag-stat-row/.ag-stat classes (see src/app/profile/page.tsx).
export default function SolitaireVictoryScreen({ state }: SolitaireVictoryScreenProps) {
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000));
    const timePenalty = computeTimePenalty(elapsedSeconds);
    const finalScore = computeFinalScore(state.score, elapsedSeconds);
    const foundationYield = SUITS.reduce((total, suit) => total + state.foundations[suit].length, 0);
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
            <div className="ag-turn-card" style={{ textAlign: 'center', padding: '24px 18px' }}>
                <div style={{ font: '800 24px/1.1 var(--ag-font)', color: 'var(--ag-ink)' }}>You solved it! 🎉</div>
                <div className="ag-hint" style={{ marginTop: 4 }}>
                    All 52 cards home — a clean {state.drawMode === 'DRAW_3' ? 'Draw-3' : 'Draw-1'} finish.
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 16 }}>
                    {kings.map((king) => <PlayingCard key={king.suit} card={king} />)}
                </div>
            </div>

            <div className="ag-card" style={{ textAlign: 'center', marginTop: 14 }}>
                <div className="ag-section-label">Final score · Microsoft rules</div>
                <div style={{ font: '800 40px/1 var(--ag-font)', color: 'var(--ag-terracotta)', marginTop: 4 }}>{finalScore}</div>
            </div>

            <div className="ag-list" style={{ marginTop: 12 }}>
                {breakdown.map((row, i) => (
                    <div key={i} className="ag-list-row">
                        <div className="ag-list-row-main"><div className="ag-list-row-title">{row.label}</div></div>
                        <div style={{ font: '800 13px var(--ag-font)', color: row.value < 0 ? '#c0392b' : 'var(--ag-green)' }}>
                            {row.value >= 0 ? `+${row.value}` : row.value}
                        </div>
                    </div>
                ))}
            </div>

            <div className="ag-section-label" style={{ marginTop: 16 }}>This game</div>
            <div className="ag-stat-row" style={{ flexWrap: 'wrap' }}>
                <div className="ag-stat"><div className="ag-stat-num">{formatDuration(elapsedSeconds)}</div><div className="ag-stat-label">time</div></div>
                <div className="ag-stat"><div className="ag-stat-num">{state.moves}</div><div className="ag-stat-label">moves</div></div>
                <div className="ag-stat"><div className="ag-stat-num">{state.undoCount}</div><div className="ag-stat-label">undos</div></div>
                <div className="ag-stat"><div className="ag-stat-num">{foundationYield}/52</div><div className="ag-stat-label">foundation</div></div>
                <div className="ag-stat"><div className="ag-stat-num">{state.stockRecycleCount}</div><div className="ag-stat-label">recycles</div></div>
                <div className="ag-stat"><div className="ag-stat-num">{efficiency}%</div><div className="ag-stat-label">efficiency</div></div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                <a href="/newgame/solitaire" className="ag-btn ag-btn--primary" style={{ flex: 1, textAlign: 'center' }}>New deal</a>
                <a href="/" className="ag-btn ag-btn--light" style={{ textAlign: 'center' }}>Back home</a>
            </div>
        </div>
    );
}
