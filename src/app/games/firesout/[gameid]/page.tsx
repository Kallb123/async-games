'use client'
import { use, useState } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { FiresOutAction, IFiresOutEndTurnOutcome } from "@/utils/apiModels/GameLogic";
import type { IFiresOutGameDataResponse } from "@/games/FiresOut/apiModels";
import FiresOutBoard from "@/games/FiresOut/components/FiresOutBoard";
import FiresOutActions, { FiresOutBoardMode } from "@/games/FiresOut/components/FiresOutActions";
import FiresOutAdvanceFireResult, { AdvanceFireDisplay, buildAdvanceFireDisplay } from "@/games/FiresOut/components/FiresOutAdvanceFireResult";
import GameShell from "@/components/ui/GameShell";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import ReadOnlyPanel from "@/components/ui/ReadOnlyPanel";
import Stat from "@/components/ui/Stat";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { VICTIMS_LOST_TO_LOSE, VICTIMS_TO_WIN } from "@/games/FiresOut/board";
import { legalChopTargets, legalDeckGunTargets, legalDoorTargets, legalDriveTargets, legalExtinguishTargets, legalMoveTargets, totalDamage } from "@/games/FiresOut/rules";
import { abandonedGameStatus, isPlayersTurn, nameForUserId } from "@/utils/ui/players";
import { playerColourForId } from "@/utils/ui/playerColours";

// fires-out-gdd.md §17.6 step 5: the board screen. Turn recap and the crew
// planner are deliberately later steps (11 and 13) — this reads gameData
// straight off the live command route, the way Solitaire's single-player
// screen does, rather than through useTurnNavigation/useTurnRecap.
export default function GameFiresOut({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IFiresOutGameDataResponse>(gameId);
    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<IFiresOutGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    const gs = gameData?.specificGameState;
    const complete = gameData?.complete ?? false;
    const userIdList = gameData?.userIdList ?? [];
    const usernameList = gameData?.usernameList ?? [];
    const myUserId = user?.id ?? '';
    const nameOrYou = (ownerId: string, name: string): string => ownerId === myUserId ? 'You' : name;
    const isMyTurn = isPlayersTurn(true, user, gameData?.currentTurn) && !complete;
    const activeFf = gs?.firefighters[gs.activeFirefighter];

    // What the board is targeting right now, if anything — reset whenever the
    // active figure changes so a stale pick from the previous turn (or the
    // previous firefighter, mid multi-figure round) never lingers into it.
    const targetKey = `${gameData?.currentTurn}-${gs?.activeFirefighter ?? ''}`;
    const [mode, setMode] = useResettingState<FiresOutBoardMode | null>(null, targetKey);
    const [carryOnMove, setCarryOnMove] = useResettingState(false, targetKey);

    const carrying = !!activeFf?.carrying;
    const ownPoi = gs && activeFf ? gs.spaces[activeFf.space].poi : null;
    const showCarryToggle = !carrying && !!ownPoi?.revealed && !!ownPoi.victim;

    const experienced = gs?.ruleset === 'experienced';
    // §12.1: which vehicle (if either) the active figure is standing at right
    // now — the only thing that decides what 'drive' can target and which
    // vehicle the command names (§17.6 step 9).
    const vehicleHere: 'engine' | 'ambulance' | null =
        !gs || !activeFf ? null
            : activeFf.space === gs.engine ? 'engine'
                : activeFf.space === gs.ambulance ? 'ambulance'
                    : null;

    const targetCounts = { move: 0, door: 0, extinguish: 0, chop: 0, drive: 0, deckGun: 0 };
    let validSpaces = new Set<number>();
    if (gs && activeFf && isMyTurn) {
        targetCounts.move = legalMoveTargets(gs.spaces, gs.edges, activeFf, carrying || (showCarryToggle && carryOnMove)).length;
        targetCounts.door = legalDoorTargets(gs.edges, activeFf).length;
        targetCounts.extinguish = legalExtinguishTargets(gs.spaces, activeFf).length;
        targetCounts.chop = legalChopTargets(gs.edges, activeFf).length;
        if (experienced) {
            targetCounts.drive = vehicleHere ? legalDriveTargets(activeFf, gs[vehicleHere]).length : 0;
            targetCounts.deckGun = legalDeckGunTargets(gs.firefighters, activeFf, gs.engine).length;
        }

        if (mode === 'move') validSpaces = new Set(legalMoveTargets(gs.spaces, gs.edges, activeFf, carrying || (showCarryToggle && carryOnMove)));
        else if (mode === 'door') validSpaces = new Set(legalDoorTargets(gs.edges, activeFf));
        else if (mode === 'extinguish') validSpaces = new Set(legalExtinguishTargets(gs.spaces, activeFf));
        else if (mode === 'chop') validSpaces = new Set(legalChopTargets(gs.edges, activeFf));
        else if (mode === 'drive' && vehicleHere) validSpaces = new Set(legalDriveTargets(activeFf, gs[vehicleHere]));
        else if (mode === 'deckGun') validSpaces = new Set(legalDeckGunTargets(gs.firefighters, activeFf, gs.engine));
    }

    function handleSpaceClick(space: number) {
        if (!mode) return;
        const command = new FiresOutAction();
        command.kind = mode;
        command.target = space;
        if (mode === 'move') command.carry = carryOnMove;
        if (mode === 'drive' && vehicleHere) command.vehicle = vehicleHere;
        submitCommand(command, () => setMode(null), `space:${space}`);
    }

    // The Advance Fire payoff screen (§17.6 step 7) — lives here, not inside
    // FiresOutActions, so it survives the endTurn command handing the turn
    // (and often activeFirefighter's owner) to someone else.
    const [advanceFireResult, setAdvanceFireResult] = useState<AdvanceFireDisplay | null>(null);

    function handleEndTurn() {
        const command = new FiresOutAction();
        command.kind = 'endTurn';
        submitCommand(command, (response) => {
            setMode(null);
            setCarryOnMove(false);
            const advance = (response.outcome as IFiresOutEndTurnOutcome).advanceFire;
            if (advance) {
                setAdvanceFireResult(buildAdvanceFireDisplay(command.id, advance,
                    ownerId => nameOrYou(ownerId, nameForUserId(response.gameData, ownerId))));
            }
        }, 'endTurn');
    }

    const scoreEntries: ScoreEntry[] = (gs?.firefighters ?? []).map((ff) => ({
        id: ff.ownerId,
        name: nameOrYou(ff.ownerId, ff.username),
        color: playerColourForId(ff.ownerId, userIdList),
        sub: `${ff.apLeft} AP${ff.bankedAp > 0 ? ` · ${ff.bankedAp} banked` : ''}${ff.carrying === 'victim' ? ' · 🧍 carrying' : ''}`,
        score: ff.apLeft,
        isMe: ff.ownerId === myUserId,
        isActive: ff.ownerId === activeFf?.ownerId,
    }));

    const abandoned = abandonedGameStatus(complete, gameData?.endReason, nameForUserId(gameData, gameData?.forfeitedBy));

    let subtitle: React.ReactNode = 'Loading…';
    if (gameData) {
        subtitle = abandoned
            ? abandoned.subtitle
            : complete
                ? 'Game over'
                : isMyTurn ? "Your turn" : `${nameForUserId(gameData, gameData?.currentTurn)}'s turn`;
    }

    const menuOptions: GameOption[] = [
        ...(!complete ? [{
            key: 'end',
            label: 'End game',
            icon: '🏳️',
            danger: true,
            onClick: endGame,
        }] : []),
    ];

    return (
        <GameShell
            title="Fires Out!"
            subtitle={subtitle}
            options={gameData ? menuOptions : undefined}
            syncing={submitting}
            log={{ entries: gameData?.gameState?.history ?? [], userIdList }}
            chat={{ gameId, userIdList, usernameList }}
            className="ag-game--firesout"
        >
            <FcmTokenComp />

            {gs && (
                <>
                    <GameScoreboard entries={scoreEntries} />

                    <div className="ag-stat-row">
                        <Stat value={`${gs.rescued}/${VICTIMS_TO_WIN}`} label="rescued" />
                        <Stat value={`${gs.lost}/${VICTIMS_LOST_TO_LOSE}`} label="lost" />
                        <Stat value={totalDamage(gs.edges)} label="damage" />
                        <Stat value={gs.poiPoolCount} label="POI left" />
                        {gs.ruleset === 'experienced' && <Stat value={gs.hotspotReserve} label="hot spots left" />}
                    </div>

                    {!complete && (
                        <FiresOutBoard
                            spaces={gs.spaces}
                            edges={gs.edges}
                            firefighters={gs.firefighters}
                            userIdList={userIdList}
                            activeFirefighter={gs.activeFirefighter}
                            validSpaces={validSpaces}
                            onSpaceClick={isMyTurn && !submitting ? handleSpaceClick : undefined}
                            engine={experienced ? gs.engine : undefined}
                            ambulance={experienced ? gs.ambulance : undefined}
                        />
                    )}

                    {!complete && (
                        <ReadOnlyPanel readOnly={!isMyTurn}>
                            <FiresOutActions
                                apLeft={activeFf?.apLeft ?? 0}
                                bankedAp={activeFf?.bankedAp ?? 0}
                                mode={mode}
                                onModeChange={setMode}
                                targetCounts={targetCounts}
                                showCarryToggle={showCarryToggle}
                                carryOnMove={carryOnMove}
                                onCarryOnMoveChange={setCarryOnMove}
                                onEndTurn={handleEndTurn}
                                submitting={submitting}
                                endTurnPending={pendingTarget === 'endTurn'}
                                experienced={experienced}
                            />
                        </ReadOnlyPanel>
                    )}

                    {complete && (
                        <GameFinishBanner
                            message={abandoned
                                ? abandoned.message
                                : gameData?.endReason === 'teamwin' ? 'The crew rescued everyone! 🎉' : "The crew couldn't make it out in time."}
                            gameId={gameId}
                            gameUrl="firesout"
                            usernameList={usernameList}
                            userIdList={userIdList}
                            myUserId={myUserId}
                            turnTimer={gameData?.turnTimer}
                        />
                    )}

                    {advanceFireResult && (
                        <FiresOutAdvanceFireResult
                            key={advanceFireResult.id}
                            result={advanceFireResult}
                            onDismiss={() => setAdvanceFireResult(null)}
                        />
                    )}
                </>
            )}
        </GameShell>
    );
}
