'use client'
import { use, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand, SolitaireDraw, SolitaireMoveCard, SolitaireUndo } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import { useGameData } from "@/utils/hooks/useGameData";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useToast } from "@/components/ToastContext";
import { ISolitaireGameDataResponse } from "@/games/Solitaire/apiModels";
import { SolitaireZoneRef, getLegalMoves, hasAnyLegalMove } from "@/games/Solitaire/rules";
import { formatDuration } from "@/games/Solitaire/ui";
import SolitaireBoard from "@/games/Solitaire/components/SolitaireBoard";
import SolitaireVictoryScreen from "@/games/Solitaire/components/SolitaireVictoryScreen";

export default function GameSolitaire({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [showLog, setShowLog] = useState(false);
    const router = useRouter();
    const { showToast } = useToast();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ISolitaireGameDataResponse>(gameId);

    useEffect(() => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
            const unlocked = user?.publicMetadata.unlocked;
            if (unlocked !== true) {
                router.push('/unlockaccess');
            }
            getGameData();
        }
    }, [isLoaded]);

    usePushEvents(TURN_ADVANCED_EVENTS, () => getGameData(), { refreshOnVisible: true });

    const { endGame } = useEndGame(gameId);

    const state = gameData?.specificGameState;
    const complete = gameData?.complete ?? false;

    // Live-tick the on-board clock once a second while the game is in progress.
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (complete) return;
        const id = setInterval(() => forceTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [complete]);

    const submitCommand = (command: IGameCommand) => {
        if (!user) {
            console.error("Unable to send command whilst not logged in");
            return;
        }
        command.gameId = gameId;
        command.senderId = user.id;
        command.senderUsername = user.username || user.firstName || user.id;
        fetch('/api/game/command', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command)
        })
            .then(response => response.ok ? response.json() : null)
            .then((data: ICommandResponse | null) => {
                if (data?.gameData) {
                    setGameData(data.gameData as ISolitaireGameDataResponse);
                }
            });
    };

    const handleDraw = () => submitCommand(new SolitaireDraw());
    const handleUndo = () => submitCommand(new SolitaireUndo());
    const handleMove = (source: SolitaireZoneRef, destination: SolitaireZoneRef, count: number) => {
        const command = new SolitaireMoveCard();
        command.source = source;
        command.destination = destination;
        command.count = count;
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

    const elapsedSeconds = state ? Math.max(0, Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000)) : 0;
    const foundationCount = state
        ? Object.values(state.foundations).reduce((total, pile) => total + pile.length, 0)
        : 0;
    const stalemated = !!state && !complete && !hasAnyLegalMove({ waste: state.waste, foundations: state.foundations, tableau: state.tableau, stockCount: state.stockCount });

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
        <GameShell title="Solitaire" subtitle={subtitle} right={optionsMenu}>
            <FcmTokenComp />

            {state && (
                <div className="ag-stat-row" style={{ padding: '0 16px', marginTop: 12 }}>
                    <div className="ag-stat"><div className="ag-stat-num">{state.score}</div><div className="ag-stat-label">score</div></div>
                    <div className="ag-stat"><div className="ag-stat-num">{state.moves}</div><div className="ag-stat-label">moves</div></div>
                    <div className="ag-stat"><div className="ag-stat-num">{formatDuration(elapsedSeconds)}</div><div className="ag-stat-label">time</div></div>
                    <div className="ag-stat"><div className="ag-stat-num">{foundationCount}/52</div><div className="ag-stat-label">home</div></div>
                </div>
            )}

            {state && !complete && (
                <SolitaireBoard state={state} onDraw={handleDraw} onMove={handleMove} />
            )}

            {stalemated && (
                <div className="ag-section">
                    <p className="ag-hint">No legal moves left. Undo a move or end the game to start a new deal.</p>
                </div>
            )}

            {state && !complete && (
                <div className="ag-section" style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="ag-btn ag-btn--primary" style={{ flex: 1 }} onClick={handleDraw} disabled={state.stockCount === 0 && state.waste.length === 0}>
                        Draw
                    </button>
                    <button type="button" className="ag-btn ag-btn--light" onClick={handleUndo} disabled={!state.canUndo}>Undo</button>
                    <button type="button" className="ag-btn ag-btn--light" onClick={handleHint}>Hint</button>
                </div>
            )}

            {state && complete && <SolitaireVictoryScreen state={state} />}

            {showLog && (
                <div className="ag-log">
                    <ul className="ag-log-list">
                        {(gameData?.gameState?.history ?? []).map((h, i) => (
                            <li key={i} className="ag-log-item">{h}</li>
                        ))}
                        {(gameData?.gameState?.history ?? []).length === 0 && (
                            <li className="ag-log-item">No moves yet.</li>
                        )}
                    </ul>
                </div>
            )}
        </GameShell>
    );
}
