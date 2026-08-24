'use client'
import { use, useState } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { SolitaireDraw, SolitaireMoveCard, SolitaireUndo, SolitaireAutoSolve } from "@/utils/apiModels/GameLogic";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import Stat from "@/components/ui/Stat";
import ActionButton from "@/components/ui/ActionButton";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useGameData } from "@/utils/hooks/useGameData";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useElapsedSeconds } from "@/utils/hooks/useElapsedSeconds";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useToast } from "@/components/ToastContext";
import { ISolitaireGameDataResponse } from "@/games/Solitaire/apiModels";
import { SolitaireZoneRef, getLegalMoves, hasAnyLegalMove, hasHiddenTableauCards, foundationCardCount, formatDuration } from "@/games/Solitaire/rules";
import SolitaireBoard from "@/games/Solitaire/components/SolitaireBoard";
import SolitaireVictoryScreen from "@/games/Solitaire/components/SolitaireVictoryScreen";
import MatchHistory from "@/components/games/MatchHistory";

export default function GameSolitaire({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [showLog, setShowLog] = useState(false);
    const { showToast } = useToast();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ISolitaireGameDataResponse>(gameId);

    const { endGame } = useEndGame(gameId);

    const state = gameData?.specificGameState;
    const complete = gameData?.complete ?? false;

    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<ISolitaireGameDataResponse>(gameId, user, setGameData, getGameData);

    const handleDraw = () => submitCommand(new SolitaireDraw(), undefined, 'draw');
    const handleUndo = () => submitCommand(new SolitaireUndo(), undefined, 'undo');
    const handleAutoSolve = () => submitCommand(new SolitaireAutoSolve(), undefined, 'autoSolve');
    const handleMove = (source: SolitaireZoneRef, destination: SolitaireZoneRef, count: number) => {
        const command = new SolitaireMoveCard();
        command.source = source;
        command.destination = destination;
        command.count = count;
        // No target: the board tracks the tapped card itself and skins it from
        // `submitting`, so there's nothing here for a target key to match.
        submitCommand(command);
    };

    const handleHint = () => {
        if (!state) return;
        const moves = getLegalMoves({ waste: state.waste, foundations: state.foundations, tableau: state.tableau, stockCount: state.stockCount });
        const best = moves.find(m => m.recommended);
        if (best) {
            showToast(`${best.label} — ${best.reason}`, 'info', 'Hint');
        } else if (state.stockCount > 0 || state.waste.length > 0) {
            showToast('No move stands out — try drawing from the stock.', 'info', 'Hint');
        } else {
            showToast('No legal moves left on the board.', 'info', 'Hint');
        }
    };

    // Stops once the game is solved, so the victory screen's scoring receipt
    // doesn't re-derive a "final" score every second while it's being read.
    const elapsedSeconds = useElapsedSeconds(state?.startedAt, !complete);
    const foundationCount = state ? foundationCardCount(state.foundations) : 0;
    const stalemated = !!state && !complete && !hasAnyLegalMove({ waste: state.waste, foundations: state.foundations, tableau: state.tableau, stockCount: state.stockCount });
    const autoSolveAvailable = !!state && !complete && !hasHiddenTableauCards(state.tableau);

    let subtitle: React.ReactNode = 'Loading…';
    if (state) {
        const drawLabel = state.drawMode === 'DRAW_3' ? 'Draw-3' : 'Draw-1';
        subtitle = complete ? '🏆 Solved!' : `${drawLabel} · your move`;
    }

    const menuOptions: GameOption[] = [
        {
            key: 'history',
            label: 'Turn history',
            icon: '📜',
            active: showLog,
            onClick: () => setShowLog(v => !v),
        },
        ...(!complete ? [{
            key: 'end',
            label: 'End game',
            icon: '🏳️',
            danger: true,
            onClick: endGame,
        }] : []),
    ];
    const optionsMenu = state ? <GameOptionsMenu options={menuOptions} /> : undefined;

    return (
        <GameShell title="Solitaire" subtitle={subtitle} right={optionsMenu} syncing={submitting}>
            <FcmTokenComp />

            {state && (
                <div className="ag-stat-row" style={{ padding: '0 16px', marginTop: 12 }}>
                    <Stat value={state.score} label="score" />
                    <Stat value={state.moves} label="moves" />
                    <Stat value={formatDuration(elapsedSeconds)} label="time" />
                    <Stat value={`${foundationCount}/52`} label="home" />
                </div>
            )}

            {state && !complete && (
                <SolitaireBoard state={state} disabled={submitting} onDraw={handleDraw} onMove={handleMove} />
            )}

            {stalemated && (
                <div className="ag-section">
                    <p className="ag-hint">No legal moves left. Undo a move or end the game to start a new deal.</p>
                </div>
            )}

            {autoSolveAvailable && (
                <div className="ag-section">
                    <ActionButton
                        className="ag-btn ag-btn--primary ag-btn--block"
                        onClick={handleAutoSolve}
                        disabled={submitting}
                        pending={pendingTarget === 'autoSolve'}
                        pendingLabel="Playing it out…"
                    >
                        🪄 Auto-solve
                    </ActionButton>
                    <p className="ag-hint" style={{ textAlign: 'center' }}>Every card is face-up — the rest can be played out automatically.</p>
                </div>
            )}

            {state && !complete && (
                <div className="ag-section" style={{ display: 'flex', gap: 8 }}>
                    <ActionButton
                        className="ag-btn ag-btn--primary"
                        style={{ flex: 1 }}
                        onClick={handleDraw}
                        disabled={submitting || (state.stockCount === 0 && state.waste.length === 0)}
                        pending={pendingTarget === 'draw'}
                        pendingLabel="Drawing…"
                    >
                        Draw
                    </ActionButton>
                    <ActionButton
                        className="ag-btn ag-btn--light"
                        onClick={handleUndo}
                        disabled={submitting || !state.canUndo}
                        pending={pendingTarget === 'undo'}
                        pendingLabel="Undoing…"
                    >
                        Undo
                    </ActionButton>
                    <button type="button" className="ag-btn ag-btn--light" onClick={handleHint}>Hint</button>
                </div>
            )}

            {state && complete && <SolitaireVictoryScreen state={state} elapsedSeconds={elapsedSeconds} />}

            {showLog && (
                <MatchHistory entries={gameData?.gameState?.history ?? []} />
            )}
        </GameShell>
    );
}
