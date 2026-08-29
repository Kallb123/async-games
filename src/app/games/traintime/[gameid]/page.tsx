'use client'
import { use, useMemo, useState } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ITrainTimeGameDataResponse, ITrainTimeSpecificGameStateResponse } from "@/games/TrainTime/apiModels";
import {
    ClaimContext,
    LONG_HAUL_BONUS,
    ROUTES,
    TRAINS_PER_PLAYER,
    TrainTimeCardColour,
    claimableRouteIds,
    longestRun,
    routeName,
    totalScore,
} from "@/games/TrainTime/board";
import TrainTimeBoard from "@/games/TrainTime/components/TrainTimeBoard";
import TrainTimeActions, { TrainTimeAction } from "@/games/TrainTime/components/TrainTimeActions";
import TrainTimeClaimSheet from "@/games/TrainTime/components/TrainTimeClaimSheet";
import TrainTimeTicketSheet from "@/games/TrainTime/components/TrainTimeTicketSheet";
import TrainTimeTicketPanel, { TrainTimeTicketGroup } from "@/games/TrainTime/components/TrainTimeTicketPanel";
import TrainTimeScoreSheet, { TrainTimeScoreRow } from "@/games/TrainTime/components/TrainTimeScoreSheet";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
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
import { TrainTimeClaimRoute, TrainTimeDrawTickets, TrainTimeKeepTickets } from "@/utils/apiModels/GameLogic";
import { TRACK_PALETTE } from "@/games/TrainTime/ui";
import { playerColour, playerColourForId } from "@/utils/ui/playerColours";
import { pluralize } from "@/utils/ui/text";
import { abandonedGameStatus, nameForUserId } from "@/utils/ui/players";
import MatchHistory from "@/components/games/MatchHistory";

// Trains at or below this leave a player one big route from ending the game —
// the standings ring them so everybody can see the clock running down.
const LOW_TRAINS = 6;

export default function GameTrainTime({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [showLog, setShowLog] = useState(false);
    const [showTickets, setShowTickets] = useState(false);

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ITrainTimeGameDataResponse>(gameId);
    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<ITrainTimeGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    // Turn review steps back through the real turns of the match; the board,
    // the standings and the log all render whichever point is being viewed.
    const nav = useTurnNavigation<ITrainTimeSpecificGameStateResponse>(gameId, {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    });

    // "Since you were last here": on open, if turns elapsed since our last move,
    // show the recap intro before the board. Dismissing (or the CTA) reveals it.
    const recap = useTurnRecap(gameId);

    // Games dealt before the starting snapshot existed can't be replayed, so
    // they never offer the review controls.
    const recapAvailable = gameData?.recapAvailable ?? false;

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    const displayedCurrentTurn = nav.displayedCurrentTurn;
    // Reviewing a past turn is read-only, so every interactive path hangs off
    // this rather than off whose turn it is.
    const isMyTurn = nav.isLive && user?.id === displayedCurrentTurn && !complete;
    const myUserId = user?.id ?? '';
    const usernameList = useMemo(() => gameData?.usernameList ?? [], [gameData?.usernameList]);
    const userIdList = useMemo(() => gameData?.userIdList ?? [], [gameData?.userIdList]);
    const playerCount = usernameList.length;
    const me = gs?.playerStates[myUserId];

    // Everything the player picked for this turn resets when the turn moves on
    // or a route goes off the board under them.
    const turnKey = `${displayedCurrentTurn}:${gs?.routeOwners.filter(Boolean).length}`;
    const [selectedRouteId, setSelectedRouteId] = useResettingState<number | null>(null, turnKey);
    const [action, setAction] = useResettingState<TrainTimeAction>('draw', turnKey);
    const [claiming, setClaiming] = useResettingState(false, `${turnKey}:${selectedRouteId}`);
    // Which tickets are being kept on the keep-or-return sheet, and which one is
    // being read in the tickets panel. Both light their cities up on the map;
    // closing the panel, like the turn moving on, puts the lit one out.
    const [keeping, setKeeping] = useResettingState<number[]>([], turnKey);
    const [openTicketId, setOpenTicketId] = useResettingState<number | null>(null, `${turnKey}:${showTickets}`);

    // One claim context for the screen — the board highlights from it and the
    // claim sheet prices against it.
    const claimContext: ClaimContext | null = useMemo(() => {
        if (!gs || !me) return null;
        return { routeOwners: gs.routeOwners, playerCount, hand: gs.myHand, trains: me.trains, playerId: myUserId };
    }, [gs, me, myUserId, playerCount]);

    // A draw already started this turn is one action, so nothing is claimable
    // until it finishes.
    const claimableRoutes = useMemo(
        () => (claimContext && isMyTurn && gs?.myDrawsThisTurn === 0 ? claimableRouteIds(claimContext) : new Set<number>()),
        [claimContext, isMyTurn, gs?.myDrawsThisTurn],
    );

    const playerName = (userId?: string): string => nameForUserId(gameData, userId);
    const currentTurnUsername = playerName(displayedCurrentTurn);
    const displayedWinner = nav.displayedWinner;
    const currentUserWon = complete && !!user?.id && user.id === displayedWinner;
    const sharedWin = complete && displayedWinner === '';
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, playerName(gameData?.forfeitedBy));

    const claimRoute = (payment: TrainTimeCardColour[]) => {
        if (selectedRouteId === null) return;
        const command = new TrainTimeClaimRoute();
        command.routeId = selectedRouteId;
        command.cards = payment;
        submitCommand(command, () => setSelectedRouteId(null), 'claim');
    };

    const keepTickets = (ticketIds: number[]) => {
        const command = new TrainTimeKeepTickets();
        command.keep = ticketIds;
        // Kept tickets move into the panel, where they'd otherwise still read as
        // picked — the choice is over, so the picks go with it.
        submitCommand(command, () => setKeeping([]), 'keep-tickets');
    };

    const toggleKeep = (ticketId: number) =>
        setKeeping(keeping.includes(ticketId) ? keeping.filter(id => id !== ticketId) : [...keeping, ticketId]);

    function selectRoute(routeId: number) {
        setSelectedRouteId(routeId);
        setAction('claim');
    }

    // ── What the player is being asked for ───────────────────────────────────
    // Claiming gets a screen of its own (design 14b); the ticket choice takes
    // the action panel instead, because the map is what a ticket is judged
    // against. Either way it has to be answered before the turn moves on.
    const claimSheetRoute = claiming && selectedRouteId !== null ? ROUTES[selectedRouteId] : null;
    const ticketChoice = isMyTurn && (gs?.myPendingTickets.length ?? 0) > 0;
    // Nobody finishes setup holding no tickets, so an empty pile means this
    // offer is the opening deal — the same rule the server scores it by.
    const settingUp = (me?.ticketCount ?? 0) === 0;

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
            subtitle = sharedWin ? '🤝 Shared win' : currentUserWon ? '🏆 You won!' : `${playerName(displayedWinner)} won`;
        } else if (ticketChoice) {
            subtitle = settingUp ? 'Setup · keep your tickets' : 'Destination tickets';
        } else if (claimSheetRoute) {
            subtitle = `Claim route · ${routeName(claimSheetRoute)}`;
        } else {
            const lastLap = gs.finalRoundPending ? ' · last lap' : '';
            subtitle = isMyTurn
                ? <>Your move · <span className="ag-hi">one action</span>{lastLap}</>
                : <>{currentTurnUsername}&apos;s move{lastLap}</>;
        }
    }

    // ── Players ──────────────────────────────────────────────────────────────
    // The standings, the ticket reveal and the final score sheet are all
    // per-player lists over the same seating order, so the join happens once.
    const players = gs
        ? userIdList.flatMap((userId, i) => {
            const ps = gs.playerStates[userId];
            return ps
                ? [{ userId, username: ps.username, ps, colour: playerColour(i), isMe: userId === myUserId }]
                : [];
        })
        : [];

    // ── The Long Haul race (§7) ──────────────────────────────────────────────
    // Claimed routes are public, so every player's longest continuous run is
    // too. The board sends them live; the bonus itself isn't settled until the
    // game is scored.
    const myRun = me?.longestRun ?? 0;
    const bestRun = Math.max(0, ...players.map(({ ps }) => ps.longestRun));
    // What claiming the selected route would do to that run, so the claim sheet
    // can price the bonus alongside the points.
    const runAfterClaim = useMemo(() => {
        if (!gs || selectedRouteId === null) return myRun;
        const owners = [...gs.routeOwners];
        owners[selectedRouteId] = myUserId;
        return longestRun(owners, myUserId);
    }, [gs, selectedRouteId, myUserId, myRun]);

    const scoreEntries: ScoreEntry[] = players.map(({ userId, username, ps, colour, isMe }) => {
        const isActive = userId === displayedCurrentTurn && !complete;
        return {
            id: userId,
            name: isMe ? 'You' : username,
            color: colour,
            sub: `${ps.trains} tr. · 🃏 ${ps.handCount}`,
            // The ticket swing and the Long Haul bonus are both 0 until the
            // game is scored, so this is route points during play and the
            // final total afterwards.
            score: totalScore(ps),
            isMe,
            isActive,
            warn: ps.trains <= LOW_TRAINS && !complete,
        };
    });

    const menuOptions: GameOption[] = [
        ...(recap.hasRecap ? [{
            key: 'recap',
            label: 'Show last recap',
            icon: '🔁',
            onClick: recap.reshow,
        }] : []),
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

    // ── The ticket strip: one bar per ticket, sized by what it's worth ───────
    const myTickets = gs?.myTickets ?? [];
    const ticketsDone = myTickets.filter(t => t.complete).length;
    const ticketBars = myTickets.length > 0
        ? (
            <span className="ag-tt-ticket-bars">
                {myTickets.map(ticket => (
                    <span
                        key={ticket.id}
                        className={`ag-tt-ticket-bar${ticket.complete ? ' ag-tt-ticket-bar--done' : ''}`}
                        style={{ flex: ticket.points }}
                    />
                ))}
            </span>
        )
        : <span className="ag-tt-stat-suffix">none yet</span>;

    // A game that was abandoned or ended early is complete without ever having
    // been scored, so the reveal keys off the scoring flag, not completion.
    const scored = gs?.scored ?? false;

    // Tickets are secret while the game runs and face-up once it's scored (§10).
    const ticketGroups: TrainTimeTicketGroup[] = scored
        ? players.flatMap(({ username, ps, isMe }): TrainTimeTicketGroup[] => (
            ps.tickets
                ? [{ title: isMe ? 'Your tickets' : `${username}’s tickets`, tickets: ps.tickets }]
                : []
        ))
        : [{ title: 'Your tickets', tickets: myTickets }];

    // The cities lit up on the map: both ends of every ticket picked out right
    // now, whether that's a keep on the ticket sheet or one opened in the panel.
    // A stale pick can't match anything, so putting a ticket down puts its
    // cities out with it.
    const highlightedCities = new Set(
        [...(gs?.myPendingTickets ?? []), ...ticketGroups.flatMap(group => group.tickets)]
            .filter(ticket => ticket.id === openTicketId || keeping.includes(ticket.id))
            .flatMap(ticket => [ticket.cityA, ticket.cityB]));

    // The end-of-game breakdown. Who won is the server's call, not the sheet's.
    const scoreRows: TrainTimeScoreRow[] = scored
        ? players.map(({ ps, colour, isMe }) => ({
            player: ps,
            colour,
            isMe,
            isWinner: !!displayedWinner && ps.userId === displayedWinner,
        }))
        : [];

    let boardTag: string | null = null;
    if (gs && isMyTurn && !complete) {
        if (ticketChoice) boardTag = `🎫 keep at least ${gs.myTicketsToKeep}`;
        else if (gs.myDrawsThisTurn > 0) boardTag = '🃏 one more card to take';
        else if (claimableRoutes.size > 0) boardTag = `◆ ${pluralize(claimableRoutes.size, 'route')} claimable`;
        else boardTag = '◆ nothing claimable — draw cards';
    }

    // Recap intro: a standalone welcome-back screen shown before the board when
    // it's our turn and moves happened while we were away.
    if (recap.show) {
        return (
            <TurnRecapScreen
                recap={recap.recap!}
                cta="Take your turn →"
                onDismiss={recap.dismiss}
                onReact={recap.react}
            />
        );
    }

    return (
        <GameShell
            title="Train Time"
            subtitle={subtitle}
            right={claimSheetRoute
                ? <button type="button" className="ag-game-topbar-btn" aria-label="Close" onClick={() => setClaiming(false)}>✕</button>
                : gs ? <GameOptionsMenu options={menuOptions} /> : undefined}
            syncing={submitting}
            className="ag-game--traintime"
        >
            <FcmTokenComp />

            {/* The claim sheet is a screen of its own (design 14b): its dark
                route header runs straight off the top bar, with the standings
                out of the way until the player comes back to the map. */}
            {!claimSheetRoute && scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && me && !claimSheetRoute && (
                <div className="ag-stat-row">
                    <Stat
                        value={ticketBars}
                        label={`Tickets · ${ticketsDone}/${gs.myTickets.length} done`}
                        onClick={() => setShowTickets(v => !v)}
                        pressed={showTickets}
                    />
                    <Stat
                        value={<>{me.trains}<span className="ag-tt-stat-suffix">of {TRAINS_PER_PLAYER}</span></>}
                        label="Trains"
                    />
                    {/* The third tile is the Long Haul race (design 14a). The
                        deck and discard counts live on the face-up row, which
                        is on screen whenever it's a player's turn to draw. */}
                    <Stat
                        value={<>
                            {myRun}
                            <span className="ag-tt-stat-suffix">
                                {myRun > 0 && myRun === bestRun ? `you lead · +${LONG_HAUL_BONUS}` : `best ${bestRun}`}
                            </span>
                        </>}
                        label="Longest"
                    />
                </div>
            )}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
                        : sharedWin ? 'A dead heat — the win is shared. 🤝'
                        : currentUserWon ? 'You won! 🎉' : `${playerName(displayedWinner)} built the better network.`}
                    gameId={gameId}
                    gameUrl="traintime"
                    usernameList={usernameList}
                    userIdList={userIdList}
                    myUserId={myUserId}
                    turnTimer={gameData?.turnTimer}
                />
            )}

            {gs && claimSheetRoute && me ? (
                <TrainTimeClaimSheet
                    route={claimSheetRoute}
                    hand={gs.myHand}
                    me={me}
                    runAfterClaim={runAfterClaim}
                    onClaim={claimRoute}
                    onBack={() => setClaiming(false)}
                    pending={pendingTarget === 'claim'}
                />
            ) : gs && (
                <>
                    <TrainTimeScoreSheet rows={scoreRows} sharedWin={sharedWin} />

                    {(showTickets || scored) && (
                        <TrainTimeTicketPanel
                            groups={ticketGroups}
                            selectedTicketId={openTicketId}
                            onSelectTicket={id => setOpenTicketId(id === openTicketId ? null : id)}
                            scored={scored}
                        />
                    )}

                    <div className="ag-board-area">
                        <TrainTimeBoard
                            routeOwners={gs.routeOwners}
                            colourForOwner={(owner) => playerColourForId(owner, userIdList)}
                            nameForOwner={playerName}
                            claimableRoutes={claimableRoutes}
                            highlightClaimable={action === 'claim'}
                            selectedRouteId={selectedRouteId}
                            highlightedCities={highlightedCities}
                            onRouteClick={isMyTurn && !submitting ? selectRoute : undefined}
                            boardTag={boardTag}
                        />
                        <div className="ag-tt-legend">
                            {players.map(({ userId, username, ps, colour, isMe }) => (
                                <span key={userId} className="ag-tt-legend-item">
                                    <span className="ag-tt-legend-rail" style={{ background: colour }} />
                                    {isMe ? 'You' : username} {ps.routesClaimed}
                                </span>
                            ))}
                            <span className="ag-tt-legend-item">
                                <span className="ag-tt-legend-rail" style={{ background: TRACK_PALETTE.grey.fill }} />
                                open {gs.routeOwners.filter(o => o === null).length}
                            </span>
                        </div>
                    </div>

                    {ticketChoice ? (
                        <TrainTimeTicketSheet
                            tickets={gs.myPendingTickets}
                            mustKeep={gs.myTicketsToKeep}
                            settingUp={settingUp}
                            chosen={keeping}
                            onToggle={toggleKeep}
                            onKeep={keepTickets}
                            pending={pendingTarget === 'keep-tickets'}
                        />
                    ) : isMyTurn && (
                        <TrainTimeActions
                            gs={gs}
                            myUserId={myUserId}
                            action={action}
                            setAction={setAction}
                            selectedRouteId={selectedRouteId}
                            onClaim={() => setClaiming(true)}
                            claimableCount={claimableRoutes.size}
                            onDrawTickets={() => submitCommand(new TrainTimeDrawTickets(), undefined, 'tickets')}
                            submitCommand={submitCommand}
                            pendingTarget={pendingTarget}
                        />
                    )}

                    {recapAvailable && (
                        <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} usernames={usernameList} />
                    )}

                    {showLog && (
                        <MatchHistory entries={nav.displayedHistory} usernames={usernameList} />
                    )}
                </>
            )}
        </GameShell>
    );
}
