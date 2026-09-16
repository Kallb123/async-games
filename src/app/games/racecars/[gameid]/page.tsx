'use client'
import { use } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { RaceCarsMove, RaceCarsSlipstream } from "@/utils/apiModels/GameLogic";
import type { IRaceCarsGameDataResponse, IRaceCarsSpecificGameStateResponse } from "@/games/RaceCars/apiModels";
import RaceCarsBoard from "@/games/RaceCars/components/RaceCarsBoard";
import RaceCarsActions from "@/games/RaceCars/components/RaceCarsActions";
import RaceCarsEndMoveScreen from "@/games/RaceCars/components/RaceCarsEndMoveScreen";
import { MIN_MOVE_STEPS, SLIPSTREAM_STEPS, spaceKey } from "@/games/RaceCars/board";
import { moveOptions, unavoidableOilDestinations } from "@/games/RaceCars/rules";
import type { IRaceCarsArrivalOutcome } from "@/games/RaceCars/RaceCarsLogic";
import { positionOf, rowsBehindLeader, rulesState, standings, wearSummary } from "@/games/RaceCars/ui";
import GameShell from "@/components/ui/GameShell";
import GameGuideModal from "@/components/ui/GameGuideModal";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecapScreen from "@/components/games/TurnRecapScreen";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useGameGuide } from "@/utils/hooks/useGameGuide";
import { useHistoryReactions } from "@/utils/hooks/useHistoryReactions";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useOutcomeReveal } from "@/utils/hooks/useOutcomeReveal";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
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

    const { gameData, setGameData, getGameData, loading: loadingGame } = useGameData<IRaceCarsGameDataResponse>(gameId);
    const historyReact = useHistoryReactions(gameId, user?.id, setGameData, getGameData);
    const { submitCommand: rawSubmitCommand, submitting, pendingTarget } = useSubmitCommand<IRaceCarsGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    // The end-of-move reveal (§23.7 PR 5): whichever of the two moving commands
    // just resolved hands back what the corner made of the roll, and whether a
    // tow is on offer — see IRaceCarsArrivalOutcome. The hook wraps every
    // submit, so it is caught whether the tap came from the circuit or from the
    // turn sheet; a shift carries no arrival and falls straight through.
    const { submitCommand, reveal, dismiss: dismissReveal } =
        useOutcomeReveal(rawSubmitCommand, (outcome) => (outcome as IRaceCarsArrivalOutcome).arrival);

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

    // "Since you were last here": the away-time narrative is the order
    // changing (§23.5) — shown before the board on open when moves happened
    // while this driver was away, exactly as every other recap-carrying game
    // wires it (see useTurnRecap).
    const recap = useTurnRecap(gameId, { viewerId: user?.id, setGameData, getGameData });

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

    // §11 bounds the spend at what is in the pool and at leaving one space to
    // drive; `RaceCarsMove` refuses anything outside that, so the screen is
    // clamped to the same window rather than allowed to build a command the
    // server will only throw away.
    const appliedBrake = me?.roll == null ? 0 : Math.min(brake, Math.max(0, Math.min(me.brakes, me.roll - MIN_MOVE_STEPS)));

    // How far the car is being asked to travel right now: §7 step 2's rolled
    // move less the brakes dialled in, or §12's fixed three-space tow. Null
    // whenever this driver is not choosing a destination at all.
    const towing = !!me && isMyTurn && me.phase === 'slipstream';
    const distance = !gs || !me || !isMyTurn ? null
        : towing ? SLIPSTREAM_STEPS
        : me.phase === 'move' && me.roll !== null ? me.roll - appliedBrake
        : null;

    // Where this leg may finish, straight off the same pure rules the commands
    // validate against (§23.4) — so a space the board offers is a space the
    // server accepts, and the two can never drift. Worked out once and handed
    // to the turn sheet as well: the board's tappable set and the sheet's "tap
    // one of N" are two readings of this one answer, and computing it twice is
    // how they come to disagree about a road that traffic has closed.
    const options = gs && distance !== null ? moveOptions(rulesState(gs), myUserId, distance) : null;
    const validSpaces = new Set((options?.spaces ?? []).map(space => spaceKey(space.row, space.lane)));
    const unavoidableOilSpaces = gs && distance !== null ? unavoidableOilDestinations(rulesState(gs), myUserId, distance) : new Set<string>();

    // One tap on the circuit, whichever leg of the turn it is: §12's tow is a
    // move and is chosen the same way, so the board learns nothing new about
    // the phase and this is the one place that branches on it.
    function chooseDestination(row: number, lane: number) {
        if (!isMyTurn || submitting) return;
        if (towing) {
            const tow = new RaceCarsSlipstream();
            tow.tow = { row, lane };
            submitCommand(tow, undefined, `tow:${row}:${lane}`);
            return;
        }
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
            subtitle = towing
                ? <><span className="ag-hi">Your move</span> · slipstream — take the tow or wave it away</>
                : me?.phase === 'move' && me.roll !== null
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
                //
                // Once the flag is out the recorded classification is the
                // answer rather than a fresh reading of the road: the winner is
                // sitting on row 2 of a lap they will never finish.
                score: <>P{ps.finishedPosition ?? positionOf(order, userId)} <span className="ag-rc-racenum">#{ps.raceNumber}</span></>,
                isMe: userId === myUserId,
                isActive: userId === displayedCurrentTurn && !complete,
                // A car that has spun is missing its next turn, which is worth
                // the ring: nothing else on this pill says so.
                warn: ps.skipNextTurn,
            }];
        })
        : [];

    const menuOptions: GameOption[] = [
        ...(recap.hasRecap ? [{
            key: 'recap',
            label: 'Show last recap',
            icon: '🔁',
            onClick: recap.reshow,
        }] : []),
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

    // Shown once, over the board, the instant a move comes back — and never
    // while stepping back through the match, where the timeline is the story.
    //
    // The tow offer is re-read off the live board rather than trusted from the
    // response that opened the screen: a turn the sweep has already moved past
    // no longer has a decision in it, and a prompt for one somebody else has
    // made is worse than no prompt. What the corner made of the roll does not
    // go stale and still reads.
    if (recap.show) {
        return (
            <TurnRecapScreen
                recap={recap.recap!}
                cta="See the grid →"
                onDismiss={recap.dismiss}
                viewerId={user?.id}
                onReact={recap.react}
            />
        );
    }

    if (reveal && gs && nav.isLive) {
        return (
            <RaceCarsEndMoveScreen
                trackId={gs.trackId}
                roll={reveal.roll}
                arrival={reveal.towOffered && !towing ? { ...reveal, towOffered: false } : reveal}
                onDismiss={dismissReveal}
            />
        );
    }

    return (
        <GameShell
            title="Race Cars"
            subtitle={subtitle}
            options={gs ? menuOptions : undefined}
            busy={submitting || loadingGame || nav.loading}
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
                            unavoidableOilSpaces={unavoidableOilSpaces}
                            onSpaceClick={isMyTurn && !submitting ? chooseDestination : undefined}
                            boardTag={options
                                ? `${towing ? 'Take the tow' : 'Choose where to stop'} · ${pluralize(options.spaces.length, 'space')}`
                                : null}
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
