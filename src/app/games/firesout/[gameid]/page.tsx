'use client'
import { use, useState } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { FiresOutAction, IFiresOutEndTurnOutcome } from "@/utils/apiModels/GameLogic";
import type { IFiresOutGameDataResponse, IFiresOutSpecificGameStateResponse } from "@/games/FiresOut/apiModels";
import FiresOutBoard from "@/games/FiresOut/components/FiresOutBoard";
import FiresOutActions, { FiresOutBoardMode } from "@/games/FiresOut/components/FiresOutActions";
import FiresOutAdvanceFireResult, { AdvanceFireDisplay, buildAdvanceFireDisplay } from "@/games/FiresOut/components/FiresOutAdvanceFireResult";
import GameShell from "@/components/ui/GameShell";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import ReadOnlyPanel from "@/components/ui/ReadOnlyPanel";
import Stat from "@/components/ui/Stat";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecapScreen from "@/components/games/TurnRecapScreen";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { VICTIMS_LOST_TO_LOSE, VICTIMS_TO_WIN } from "@/games/FiresOut/board";
import {
    canCrewChange,
    canDisposeHazmatOnSite,
    canTreat,
    legalChopTargets,
    legalDeckGunTargets,
    legalDoorTargets,
    legalDriveTargets,
    legalExtinguishTargets,
    legalMoveTargets,
    legalRevealTargets,
    specialistDef,
    SpecialistId,
    totalDamage,
    VehicleId,
} from "@/games/FiresOut/rules";
import { abandonedGameStatus, isPlayersTurn, nameForUserId } from "@/utils/ui/players";
import { playerColourForId } from "@/utils/ui/playerColours";

// fires-out-gdd.md §17.6 step 5 (board), step 11 (turn recap). The crew
// planner is still a later step (13) — useTurnNavigation is wired with
// canPlan={false}, the same way Outbreak's board waits on its own step 13.
export default function GameFiresOut({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IFiresOutGameDataResponse>(gameId);
    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<IFiresOutGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    // Turn review steps back through the match's real actions (one per played
    // command, not one per figure's whole turn); the board, scoreboard and log
    // all render whichever point is being viewed. The crew planner (step 13)
    // is what turns planning on — until then FiresOutActions never appears
    // while reviewing, so canPlan stays false (isMyTurn below already gates
    // every submit handler on nav.isLive).
    const nav = useTurnNavigation<IFiresOutSpecificGameStateResponse>(gameId, {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    });
    const recapAvailable = gameData?.recapAvailable ?? false;

    // "Since you were last here": the fire advanced once per crewmate since
    // you last looked (§7, §17.6 step 11) — shown before the board whenever
    // it's our turn and something happened while we were away.
    const recap = useTurnRecap(gameId);

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    const displayedCurrentTurn = nav.displayedCurrentTurn;
    const userIdList = gameData?.userIdList ?? [];
    const usernameList = gameData?.usernameList ?? [];
    const myUserId = user?.id ?? '';
    const nameOrYou = (ownerId: string, name: string): string => ownerId === myUserId ? 'You' : name;
    const isMyTurn = isPlayersTurn(nav.isLive, user, displayedCurrentTurn) && !complete;
    const activeFf = gs?.firefighters[gs.activeFirefighter];

    // What the board is targeting right now, if anything — reset whenever the
    // active figure changes so a stale pick from the previous turn (or the
    // previous firefighter, mid multi-figure round) never lingers into it.
    const targetKey = `${displayedCurrentTurn}-${gs?.activeFirefighter ?? ''}`;
    const [mode, setModeRaw] = useResettingState<FiresOutBoardMode | null>(null, targetKey);
    const [carryOnMove, setCarryOnMove] = useResettingState(false, targetKey);
    // §11: a Fire Captain may direct a teammate's firefighter instead of
    // their own — the owner id of who's being directed, or null for
    // themselves. Only ever set while mode === 'move' (tap a teammate's
    // scoreboard pill, then a board space), and cleared whenever the mode
    // changes away from 'move' so it can't linger into a door/chop/etc.
    const [directing, setDirecting] = useResettingState<string | null>(null, targetKey);
    function setMode(next: FiresOutBoardMode | null) {
        setModeRaw(next);
        if (next !== 'move') setDirecting(null);
    }

    // §11, §17.6 step 10: who a 'move' actually acts on — the Fire Captain
    // themselves, or the teammate they're directing (resolveMover,
    // FiresOutLogic.ts, mirrors Outbreak's Dispatcher/targetUserId).
    // Reachability, carry pickup and the AP cost preview all follow the
    // *mover*; only the AP itself is paid by the active firefighter.
    const mover = (directing && gs && gs.firefighters.find(f => f.ownerId === directing)) || activeFf;

    const carrying = !!mover?.carrying;
    const ownSpace = gs && mover ? gs.spaces[mover.space] : null;
    // §8, §11: what a plain (non-Paramedic) 'move' with carry:true would pick
    // up leaving this space — a revealed victim takes priority over a hazmat
    // sharing the same space, matching applyMove's own pickup priority
    // (FiresOutLogic.ts). Null once already carrying/escorting something, or
    // when there's nothing here to pick up at all.
    const carryToggleKind: 'victim' | 'hazmat' | null =
        carrying ? null
            : ownSpace?.poi?.revealed && ownSpace.poi.victim ? 'victim'
                : ownSpace?.hazmat ? 'hazmat'
                    : null;
    const showCarryToggle = carryToggleKind !== null;

    const experienced = gs?.ruleset === 'experienced';
    // §12.1: which vehicle (if either) the active figure is standing at right
    // now — the only thing that decides what 'drive' can target and which
    // vehicle the command names (§17.6 step 9). Never directed — only 'move'
    // can be (§11's table: command AP funds moving a teammate, not driving).
    const vehicleHere: VehicleId | null =
        !gs || !activeFf ? null
            : activeFf.space === gs.engine ? 'engine'
                : activeFf.space === gs.ambulance ? 'ambulance'
                    : null;
    // Where 'drive' can put the vehicle the active figure is standing at.
    const driveTargets: number[] = !gs || !activeFf || !vehicleHere ? [] : legalDriveTargets(activeFf, gs, vehicleHere);

    const targetCounts = { move: 0, door: 0, extinguish: 0, chop: 0, drive: 0, deckGun: 0, reveal: 0 };
    let validSpaces = new Set<number>();
    if (gs && activeFf && mover && isMyTurn) {
        targetCounts.move = legalMoveTargets(gs.spaces, gs.edges, mover, carrying || (showCarryToggle && carryOnMove)).length;
        targetCounts.door = legalDoorTargets(gs.edges, activeFf).length;
        targetCounts.extinguish = legalExtinguishTargets(gs.spaces, activeFf).length;
        targetCounts.chop = legalChopTargets(gs.edges, activeFf).length;
        if (experienced) {
            targetCounts.drive = driveTargets.length;
            targetCounts.deckGun = legalDeckGunTargets(gs.firefighters, activeFf, gs.engine).length;
            targetCounts.reveal = legalRevealTargets(gs.spaces, activeFf).length;
        }

        if (mode === 'move') validSpaces = new Set(legalMoveTargets(gs.spaces, gs.edges, mover, carrying || (showCarryToggle && carryOnMove)));
        else if (mode === 'door') validSpaces = new Set(legalDoorTargets(gs.edges, activeFf));
        else if (mode === 'extinguish') validSpaces = new Set(legalExtinguishTargets(gs.spaces, activeFf));
        else if (mode === 'chop') validSpaces = new Set(legalChopTargets(gs.edges, activeFf));
        else if (mode === 'drive') validSpaces = new Set(driveTargets);
        else if (mode === 'deckGun') validSpaces = new Set(legalDeckGunTargets(gs.firefighters, activeFf, gs.engine));
        else if (mode === 'reveal') validSpaces = new Set(legalRevealTargets(gs.spaces, activeFf));
    }

    // §11, §17.6 step 10: treat, on-site hazmat disposal and crew change all
    // target the active firefighter's own space (or nothing) rather than a
    // board click, so they're plain submit buttons in FiresOutActions
    // instead of arming the board — see that component's header comment.
    const showTreat = experienced && !!gs && !!activeFf && canTreat(gs.spaces, activeFf);
    const showDisposeHazmat = experienced && !!gs && !!activeFf && canDisposeHazmatOnSite(gs.spaces, activeFf);
    const showCrewChange = experienced && !!gs && !!activeFf && canCrewChange(gs.ruleset, activeFf, gs.engine);
    // §11: only a Fire Captain has anyone to direct, and only while picking
    // a move — tapping a teammate's scoreboard pill sets `directing`.
    const canDirect = isMyTurn && mode === 'move' && activeFf?.specialist === 'fireCaptain';

    function handleSpaceClick(space: number) {
        if (!mode) return;
        const command = new FiresOutAction();
        command.kind = mode;
        command.target = space;
        if (mode === 'move') {
            command.carry = carryOnMove;
            if (directing) command.targetUserId = directing;
        }
        if (mode === 'drive' && vehicleHere) command.vehicle = vehicleHere;
        submitCommand(command, () => { setMode(null); }, `space:${space}`);
    }

    function handleTreat() {
        const command = new FiresOutAction();
        command.kind = 'treat';
        submitCommand(command, undefined, 'treat');
    }

    function handleDisposeHazmat() {
        const command = new FiresOutAction();
        command.kind = 'disposeHazmat';
        submitCommand(command, undefined, 'disposeHazmat');
    }

    function handleCrewChange(specialist: SpecialistId) {
        const command = new FiresOutAction();
        command.kind = 'crewChange';
        command.specialist = specialist;
        submitCommand(command, undefined, 'crewChange');
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

    const carryingLabel: Record<'victim' | 'hazmat' | 'escort', string> = {
        victim: '🧍 carrying', hazmat: '☣️ carrying', escort: '🚶 escorting',
    };
    const scoreEntries: ScoreEntry[] = (gs?.firefighters ?? []).map((ff) => ({
        id: ff.ownerId,
        name: nameOrYou(ff.ownerId, ff.username),
        color: playerColourForId(ff.ownerId, userIdList),
        sub: [
            experienced ? specialistDef(ff.specialist).label : null,
            `${ff.apLeft} AP${ff.bankedAp > 0 ? ` · ${ff.bankedAp} banked` : ''}`,
            ff.carrying ? carryingLabel[ff.carrying] : null,
        ].filter(Boolean).join(' · '),
        score: ff.apLeft,
        isMe: ff.ownerId === myUserId,
        isActive: ff.ownerId === activeFf?.ownerId,
        // §11: a Fire Captain picking a move may tap a teammate's pill here
        // to direct their firefighter instead of their own (§17.6 step 10)
        // — tapping it again returns control to themselves.
        onClick: canDirect && ff.ownerId !== activeFf?.ownerId
            ? () => setDirecting(directing === ff.ownerId ? null : ff.ownerId)
            : undefined,
        highlighted: canDirect && directing === ff.ownerId,
    }));

    const abandoned = abandonedGameStatus(complete, gameData?.endReason, nameForUserId(gameData, gameData?.forfeitedBy));

    let subtitle: React.ReactNode = 'Loading…';
    if (gameData) {
        subtitle = abandoned
            ? abandoned.subtitle
            : complete
                ? 'Game over'
                : isMyTurn ? "Your turn" : `${nameForUserId(gameData, displayedCurrentTurn)}'s turn`;
    }

    const menuOptions: GameOption[] = [
        ...(recap.hasRecap ? [{
            key: 'recap',
            label: 'Show last recap',
            icon: '🔁',
            onClick: recap.reshow,
        }] : []),
        ...(!complete ? [{
            key: 'end',
            label: 'End game',
            icon: '🏳️',
            danger: true,
            onClick: endGame,
        }] : []),
    ];

    // Recap intro: a standalone welcome-back screen shown before the board
    // when it's our turn and moves happened while we were away.
    if (recap.show) {
        return (
            <TurnRecapScreen
                recap={recap.recap!}
                cta="See the fire →"
                onDismiss={recap.dismiss}
                onReact={recap.react}
            />
        );
    }

    return (
        <GameShell
            title="Fires Out!"
            subtitle={subtitle}
            options={gameData ? menuOptions : undefined}
            syncing={submitting}
            log={{ entries: nav.displayedHistory, userIdList }}
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
                                carryToggleKind={carryToggleKind}
                                carryOnMove={carryOnMove}
                                onCarryOnMoveChange={setCarryOnMove}
                                onEndTurn={handleEndTurn}
                                submitting={submitting}
                                endTurnPending={pendingTarget === 'endTurn'}
                                experienced={experienced}
                                specialist={activeFf?.specialist ?? 'generalist'}
                                directingName={directing ? nameOrYou(directing, nameForUserId(gameData, directing)) : null}
                                showTreat={showTreat}
                                onTreat={handleTreat}
                                treatPending={pendingTarget === 'treat'}
                                showDisposeHazmat={showDisposeHazmat}
                                onDisposeHazmat={handleDisposeHazmat}
                                disposeHazmatPending={pendingTarget === 'disposeHazmat'}
                                showCrewChange={showCrewChange}
                                onCrewChange={handleCrewChange}
                                crewChangePending={pendingTarget === 'crewChange'}
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

                    {recapAvailable && (
                        <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} userIdList={userIdList} />
                    )}
                </>
            )}
        </GameShell>
    );
}
