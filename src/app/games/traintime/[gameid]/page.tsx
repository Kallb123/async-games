'use client'
import { use, useMemo, useState } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ITrainTimeGameDataResponse } from "@/games/TrainTime/apiModels";
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
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { TrainTimeClaimRoute, TrainTimeDrawTickets, TrainTimeKeepTickets } from "@/utils/apiModels/GameLogic";
import { TRACK_PALETTE } from "@/games/TrainTime/ui";
import { playerColour } from "@/utils/ui/playerColours";
import { pluralize } from "@/utils/ui/text";
import { abandonedGameStatus, currentUsername } from "@/utils/ui/players";

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

    const gs = gameData?.specificGameState;
    const complete = gameData?.complete ?? false;
    const isMyTurn = user?.id === gameData?.currentTurn && !complete;
    const myUsername = currentUsername(user);
    const usernameList = useMemo(() => gameData?.usernameList ?? [], [gameData?.usernameList]);
    const playerCount = usernameList.length;
    const me = gs?.playerStates[myUsername];

    // Everything the player picked for this turn resets when the turn moves on
    // or a route goes off the board under them.
    const turnKey = `${gameData?.currentTurn}:${gs?.routeOwners.filter(Boolean).length}`;
    const [selectedRouteId, setSelectedRouteId] = useResettingState<number | null>(null, turnKey);
    const [action, setAction] = useResettingState<TrainTimeAction>('draw', turnKey);
    const [claiming, setClaiming] = useResettingState(false, `${turnKey}:${selectedRouteId}`);

    // One claim context for the screen — the board highlights from it and the
    // claim sheet prices against it.
    const claimContext: ClaimContext | null = useMemo(() => {
        if (!gs || !me) return null;
        return { routeOwners: gs.routeOwners, playerCount, hand: gs.myHand, trains: me.trains, playerId: myUsername };
    }, [gs, me, myUsername, playerCount]);

    // A draw already started this turn is one action, so nothing is claimable
    // until it finishes.
    const claimableRoutes = useMemo(
        () => (claimContext && isMyTurn && gs?.myDrawsThisTurn === 0 ? claimableRouteIds(claimContext) : new Set<number>()),
        [claimContext, isMyTurn, gs?.myDrawsThisTurn],
    );

    const playerName = (userId?: string): string => {
        if (!userId || !gs) return userId ?? '';
        return Object.values(gs.playerStates).find(p => p.userId === userId)?.username ?? userId;
    };
    const currentTurnUsername = playerName(gameData?.currentTurn);
    const currentUserWon = complete && !!user?.id && user.id === gameData?.winner;
    const sharedWin = complete && gameData?.winner === '';
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
        submitCommand(command, undefined, 'keep-tickets');
    };

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
            subtitle = sharedWin ? '🤝 Shared win' : currentUserWon ? '🏆 You won!' : `${playerName(gameData?.winner)} won`;
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
        ? usernameList.flatMap((username, i) => {
            const ps = gs.playerStates[username];
            return ps
                ? [{ username, ps, colour: playerColour(i), isMe: username === myUsername }]
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
        owners[selectedRouteId] = myUsername;
        return longestRun(owners, myUsername);
    }, [gs, selectedRouteId, myUsername, myRun]);

    const scoreEntries: ScoreEntry[] = players.map(({ username, ps, colour, isMe }) => {
        const isActive = username === currentTurnUsername && !complete;
        return {
            id: username,
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

    const menuOptions: GameOption[] = !complete ? [{
        key: 'end',
        label: 'End game',
        icon: '🏳️',
        danger: true,
        onClick: endGame,
    }] : [];

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

    // The end-of-game breakdown. Who won is the server's call, not the sheet's.
    const scoreRows: TrainTimeScoreRow[] = scored
        ? players.map(({ ps, colour, isMe }) => ({
            player: ps,
            colour,
            isMe,
            isWinner: !!gameData?.winner && ps.userId === gameData.winner,
        }))
        : [];

    let boardTag: string | null = null;
    if (gs && isMyTurn && !complete) {
        if (ticketChoice) boardTag = `🎫 keep at least ${gs.myTicketsToKeep}`;
        else if (gs.myDrawsThisTurn > 0) boardTag = '🃏 one more card to take';
        else if (claimableRoutes.size > 0) boardTag = `◆ ${pluralize(claimableRoutes.size, 'route')} claimable`;
        else boardTag = '◆ nothing claimable — draw cards';
    }

    return (
        <GameShell
            title="Train Time"
            subtitle={subtitle}
            right={claimSheetRoute
                ? <button type="button" className="ag-game-topbar-btn" aria-label="Close" onClick={() => setClaiming(false)}>✕</button>
                : gs && menuOptions.length > 0 ? <GameOptionsMenu options={menuOptions} /> : undefined}
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
                        : currentUserWon ? 'You won! 🎉' : `${playerName(gameData?.winner)} built the better network.`}
                    gameId={gameId}
                    gameUrl="traintime"
                    usernameList={usernameList}
                    myUsername={myUsername}
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
                        <TrainTimeTicketPanel groups={ticketGroups} scored={scored} />
                    )}

                    <div className="ag-board-area">
                        <TrainTimeBoard
                            routeOwners={gs.routeOwners}
                            usernameToColour={(username) => playerColour(usernameList.indexOf(username))}
                            claimableRoutes={claimableRoutes}
                            highlightClaimable={action === 'claim'}
                            selectedRouteId={selectedRouteId}
                            onRouteClick={isMyTurn && !submitting ? selectRoute : undefined}
                            boardTag={boardTag}
                        />
                        <div className="ag-tt-legend">
                            {players.map(({ username, ps, colour, isMe }) => (
                                <span key={username} className="ag-tt-legend-item">
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
                            onKeep={keepTickets}
                            pending={pendingTarget === 'keep-tickets'}
                        />
                    ) : isMyTurn && (
                        <TrainTimeActions
                            gs={gs}
                            myUsername={myUsername}
                            action={action}
                            setAction={setAction}
                            selectedRouteId={selectedRouteId}
                            onClaim={() => setClaiming(true)}
                            claimableCount={claimableRoutes.size}
                            onDrawTickets={() => submitCommand(new TrainTimeDrawTickets(), undefined, 'tickets')}
                            showLog={showLog}
                            onToggleLog={() => setShowLog(v => !v)}
                            submitCommand={submitCommand}
                            pendingTarget={pendingTarget}
                        />
                    )}

                    {showLog && (
                        <div className="ag-log">
                            <ul className="ag-log-list">
                                {gameData?.gameState?.history?.map((entry, i) => (
                                    <li key={i} className="ag-log-item">{entry}</li>
                                ))}
                                {!gameData?.gameState?.history?.length && (
                                    <li className="ag-log-item">No moves yet.</li>
                                )}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </GameShell>
    );
}
