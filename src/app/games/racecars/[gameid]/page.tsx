'use client'
import { use } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { RaceCarsMove } from "@/utils/apiModels/GameLogic";
import type { IRaceCarsGameDataResponse, IRaceCarsSpecificGameStateResponse } from "@/games/RaceCars/apiModels";
import RaceCarsBoard from "@/games/RaceCars/components/RaceCarsBoard";
import RaceCarsActions from "@/games/RaceCars/components/RaceCarsActions";
import { MIN_MOVE_ROWS, spaceKey, trackById } from "@/games/RaceCars/board";
import { moveOptions } from "@/games/RaceCars/rules";
import { positionOf, rowsBehindLeader, rulesState, standings, wearSummary } from "@/games/RaceCars/ui";
import GameShell from "@/components/ui/GameShell";
import GameGuideModal from "@/components/ui/GameGuideModal";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import TurnNavControls from "@/components/games/TurnNavControls";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useGameGuide } from "@/utils/hooks/useGameGuide";
import { useHistoryReactions } from "@/utils/hooks/useHistoryReactions";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { guideForGame } from "@/utils/ui/gameGuides";
import { playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus, isPlayersTurn, nameForUserId, scoreboardSeatOrder } from "@/utils/ui/players";
import { pluralize } from "@/utils/ui/text";

export default function GameRaceCars({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IRaceCarsGameDataResponse>(gameId);
    const historyReact = useHistoryReactions(gameId, user?.id, setGameData, getGameData);
    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<IRaceCarsGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    // Turn review steps back through the match's recorded commands. `canPlan`
    // is false permanently and by design (§23.5): a planner would resolve one
    // hypothetical roll and show a driver a concrete board they will not get,
    // when the decision this game asks for is which *band* to bet on. The reach
    // band in the turn sheet is what ships instead. `plannableCommands` stays
    // empty on the replay adapter for the second, harder reason — the timeline
    // route deliberately does not strip recorded randomness, so an entry there
    // would accept a driver's own chosen die.
    const nav = useTurnNavigation<IRaceCarsSpecificGameStateResponse>(gameId, {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    });
    const recapAvailable = gameData?.recapAvailable ?? false;

    // The how-to-play popup, shown the first time this account opens a race and
    // from the ⋮ menu after that. The guide itself lands in PR 8 (§23.7); until
    // `GAME_GUIDES` has a Race Cars entry there is nothing to show, so neither
    // the menu row nor the popup renders and nothing is marked seen.
    const guide = guideForGame('racecars');
    const gameGuide = useGameGuide('racecars');

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    const displayedCurrentTurn = nav.displayedCurrentTurn;
    const isMyTurn = isPlayersTurn(nav.isLive, user, displayedCurrentTurn) && !complete;
    const myUserId = user?.id ?? '';
    const usernameList = gameData?.usernameList ?? [];
    const userIdList = gameData?.userIdList ?? [];
    const scoreboardOrder = scoreboardSeatOrder(gameData, myUserId);
    const me = gs?.playerStates[myUserId];

    // §11's brake spend, dialled in before the destination is tapped and sent
    // with it on one `RaceCarsMove`. It lives up here rather than in the turn
    // sheet because the spaces the board makes tappable are the roll *minus*
    // it, and it resets whenever the turn moves on so a dialled-in spend can
    // never carry into the next roll.
    const [brake, setBrake] = useResettingState(0, `${displayedCurrentTurn}:${me?.roll ?? ''}`);

    // §11 bounds the spend at what is in the pool and at leaving one row to
    // drive; `RaceCarsMove` refuses anything outside that, so the screen is
    // clamped to the same window rather than allowed to build a command the
    // server will only throw away.
    const appliedBrake = me?.roll == null ? 0 : Math.min(brake, Math.max(0, Math.min(me.brakes, me.roll - MIN_MOVE_ROWS)));

    // Where this move may finish, straight off the same pure rules the command
    // validates against (§23.4) — so a space the board offers is a space
    // `RaceCarsMove` accepts, and the two can never drift. Worked out once and
    // handed to the turn sheet as well: the board's tappable set and the sheet's
    // "tap one of N" are two readings of this one answer, and computing it twice
    // is how they come to disagree about a road that traffic has closed.
    const options = gs && me && isMyTurn && me.phase === 'move' && me.roll !== null
        ? moveOptions(rulesState(gs), myUserId, me.roll - appliedBrake)
        : null;
    const validSpaces = new Set((options?.spaces ?? []).map(space => spaceKey(space.row, space.lane)));

    function chooseDestination(row: number, lane: number) {
        if (!isMyTurn || submitting) return;
        const command = new RaceCarsMove();
        command.row = row;
        command.lane = lane;
        command.brake = appliedBrake;
        submitCommand(command, undefined, `move:${row}:${lane}`);
    }

    const currentTurnUsername = nameForUserId(gameData, displayedCurrentTurn);
    const abandoned = abandonedGameStatus(complete, gameData?.endReason);
    const order = gs ? standings(gs) : [];

    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
            subtitle = `🏁 ${nameForUserId(gameData, gameData?.winner)} takes the flag`;
        } else if (isMyTurn) {
            subtitle = me?.phase === 'move' && me.roll !== null
                ? <><span className="ag-hi">Your move</span> · rolled {me.roll} — pick a space</>
                : <><span className="ag-hi">Your move</span> · pick a gear</>;
        } else {
            subtitle = <>{currentTurnUsername}&apos;s move · round {gs.round + 1}</>;
        }
    }

    const scoreEntries: ScoreEntry[] = gs
        ? scoreboardOrder.flatMap((userId): ScoreEntry[] => {
            const ps = gs.playerStates[userId];
            if (!ps) return [];
            return [{
                id: userId,
                name: userId === myUserId ? 'You' : ps.username,
                color: playerColourForId(userId, userIdList),
                sub: wearSummary(ps.gear, ps.tyres, ps.brakes, ps.gearbox),
                // §4.2's classification, which is the only score this game
                // keeps — and the race number beside it is §19's second
                // identity channel, printed on the car as well as here.
                score: <>P{positionOf(order, userId)} <span className="ag-rc-racenum">#{ps.raceNumber}</span></>,
                isMe: userId === myUserId,
                isActive: userId === displayedCurrentTurn && !complete,
                // A car that has spun is missing its next turn, which is worth
                // the ring: nothing else on this pill says so.
                warn: ps.skipNextTurn,
            }];
        })
        : [];

    const menuOptions: GameOption[] = [
        ...(guide ? [{
            key: 'guide',
            label: 'Game guide',
            icon: '📖',
            onClick: gameGuide.openGuide,
        }] : []),
        ...(!complete ? [{
            key: 'end',
            label: 'End game',
            icon: '🏳️',
            danger: true,
            onClick: endGame,
        }] : []),
    ];

    const gap = gs && me ? rowsBehindLeader(gs, myUserId) : 0;

    return (
        <GameShell
            title="Race Cars"
            subtitle={subtitle}
            options={gs ? menuOptions : undefined}
            syncing={submitting}
            log={{ entries: nav.displayedHistory, userIdList, viewerId: myUserId, onReact: nav.isLive ? historyReact : undefined }}
            chat={{ gameId, userIdList, usernameList }}
            className="ag-game--racecars"
        >
            <FcmTokenComp />

            {guide && gameGuide.open && <GameGuideModal guide={guide} onClose={gameGuide.closeGuide} />}

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && me && (
                <div className="ag-stat-row">
                    <Stat value={`${Math.min(me.lapsCompleted + 1, gs.laps)}/${gs.laps}`} label={gs.laps === 1 ? 'Lap' : 'Laps'} />
                    <Stat value={gap === 0 ? 'Leader' : `−${gap}`} label={gap === 0 ? 'Position' : 'Rows off the lead'} />
                </div>
            )}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
                        : gameData?.winner === myUserId
                            ? 'You take the chequered flag! 🏁'
                            : `${nameForUserId(gameData, gameData?.winner)} takes the chequered flag.`}
                    gameId={gameId}
                    gameUrl="racecars"
                    usernameList={usernameList}
                    userIdList={userIdList}
                    myUserId={myUserId}
                    turnTimer={gameData?.turnTimer}
                />
            )}

            {gs && (
                <>
                    <div className="ag-board-area">
                        <RaceCarsBoard
                            gs={gs}
                            userIdList={userIdList}
                            validSpaces={validSpaces}
                            onSpaceClick={isMyTurn && !submitting ? chooseDestination : undefined}
                            boardTag={options ? `Choose where to stop · ${pluralize(options.spaces.length, 'space')}` : null}
                        />
                    </div>

                    {nav.isLive && !complete && (
                        <RaceCarsActions
                            gs={gs}
                            myUserId={myUserId}
                            brake={appliedBrake}
                            setBrake={setBrake}
                            options={options}
                            submitCommand={submitCommand}
                            pendingTarget={pendingTarget}
                            readOnly={!isMyTurn}
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
