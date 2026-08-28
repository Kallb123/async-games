'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IOutbreakGameDataResponse } from "@/games/Outbreak/apiModels";
import OutbreakBoard from "@/games/Outbreak/components/OutbreakBoard";
import OutbreakActions from "@/games/Outbreak/components/OutbreakActions";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { OutbreakAction } from "@/utils/apiModels/GameLogic";
import { HAND_LIMIT, OutbreakMoveType, getLegalMoves, infectionRateFor, stationCityIds } from "@/games/Outbreak/rules";
import { CITIES, DISEASE_COLORS, DISEASE_COLOR_DEFS } from "@/games/Outbreak/board";
import { playerColour } from "@/utils/ui/playerColours";
import { abandonedGameStatus, currentUsername } from "@/utils/ui/players";

export default function GameOutbreak({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IOutbreakGameDataResponse>(gameId);
    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<IOutbreakGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    const gs = gameData?.specificGameState;
    const complete = gameData?.complete ?? false;
    const currentTurn = gameData?.currentTurn ?? '';
    const isMyTurn = !!user && user.id === currentTurn && !complete;
    const myUsername = currentUsername(user);
    const usernameList = gameData?.usernameList ?? [];
    const me = gs?.playerStates[myUsername];

    // The movement kind currently targeted on the board, if any — reset
    // whenever the turn changes so a stale pick from a previous player never
    // lingers into someone else's turn.
    const [moveMode, setMoveMode] = useResettingState<OutbreakMoveType | null>(null, `${currentTurn}`);

    const validCities = new Set<number>();
    if (gs && me && isMyTurn && moveMode) {
        const legal = getLegalMoves({ currentCity: me.city, hand: me.hand, researchStations: stationCityIds(gs.cities) });
        legal.filter(m => m.type === moveMode).forEach(m => validCities.add(m.destination));
    }

    function handleCityClick(cityId: number) {
        if (!isMyTurn || !moveMode) return;
        const cmd = new OutbreakAction();
        cmd.kind = moveMode;
        cmd.destination = cityId;
        submitCommand(cmd, () => setMoveMode(null), 'move');
    }

    const currentTurnUsername = gs
        ? Object.values(gs.playerStates).find(p => p.userId === currentTurn)?.username ?? currentTurn
        : currentTurn;

    const abandoned = abandonedGameStatus(complete, gameData?.endReason);

    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
            subtitle = gameData?.endReason === 'teamloss' ? '💀 The team lost' : '🎉 The team won!';
        } else if (isMyTurn && gs.phase === 'discard') {
            subtitle = <span className="ag-hi">Discard down to {HAND_LIMIT}</span>;
        } else {
            subtitle = isMyTurn
                ? <><span className="ag-hi">Your move</span> · {me?.actionsLeft ?? 0} actions left</>
                : <>{currentTurnUsername}&apos;s move</>;
        }
    }

    const scoreEntries: ScoreEntry[] = gs
        ? usernameList.flatMap((username, i): ScoreEntry[] => {
            const ps = gs.playerStates[username];
            if (!ps) return [];
            const isMe = username === myUsername;
            const isActive = ps.userId === currentTurn && !complete;
            return [{
                id: username,
                name: isMe ? 'You' : username,
                color: playerColour(i),
                sub: isActive ? `${ps.actionsLeft} actions · ${CITIES[ps.city].name}` : CITIES[ps.city].name,
                score: ps.hand.length,
                isMe,
                isActive,
            }];
        })
        : [];

    const menuOptions: GameOption[] = [
        ...(!complete ? [{
            key: 'end',
            label: 'End game',
            icon: '🏳️',
            danger: true,
            onClick: endGame,
        }] : []),
    ];
    const optionsMenu = gs ? <GameOptionsMenu options={menuOptions} /> : undefined;

    return (
        <GameShell title="Outbreak" subtitle={subtitle} right={optionsMenu} syncing={submitting} className="ag-game--outbreak">
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && (
                <div className="ag-stat-row">
                    <Stat value={`${gs.outbreaks}/8`} label="Outbreaks" />
                    <Stat value={infectionRateFor(gs.infectionRateIndex)} label="Infection rate" />
                    <Stat value={DISEASE_COLORS.reduce((sum, c) => sum + gs.cubesLeft[c], 0)} label="Cubes left" />
                </div>
            )}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
                        : gameData?.endReason === 'teamloss' ? 'The outbreak overwhelmed the team.' : 'The team cured every disease! 🎉'}
                    gameId={gameId}
                    gameUrl="outbreak"
                    usernameList={usernameList}
                    myUsername={myUsername}
                    turnTimer={gameData?.turnTimer}
                />
            )}

            {gs && (
                <>
                    <div className="ag-board-area">
                        <OutbreakBoard
                            cities={gs.cities}
                            playerStates={gs.playerStates}
                            usernameList={usernameList}
                            validCities={validCities}
                            onCityClick={isMyTurn && !complete && !submitting ? handleCityClick : undefined}
                            boardTag={moveMode ? 'Choose a destination' : null}
                        />
                    </div>

                    <div className="ag-reslegend">
                        {DISEASE_COLORS.map(color => (
                            <div key={color} className="ag-reslegend-pill">
                                <span className="ag-reslegend-dot" style={{ background: DISEASE_COLOR_DEFS[color].hex }} />
                                <span>
                                    {DISEASE_COLOR_DEFS[color].name}
                                    {gs.cures[color] === 'cured' && ' · cured'}
                                    {gs.cures[color] === 'eradicated' && ' · eradicated'}
                                </span>
                            </div>
                        ))}
                    </div>

                    {isMyTurn && !complete && (
                        <OutbreakActions
                            gs={gs}
                            myUsername={myUsername}
                            moveMode={moveMode}
                            setMoveMode={setMoveMode}
                            submitCommand={submitCommand}
                            pendingTarget={pendingTarget}
                        />
                    )}
                </>
            )}
        </GameShell>
    );
}
