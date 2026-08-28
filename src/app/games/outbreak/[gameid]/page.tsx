'use client'
import { use, useState } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IOutbreakGameDataResponse, IOutbreakSpecificGameStateResponse } from "@/games/Outbreak/apiModels";
import OutbreakBoard from "@/games/Outbreak/components/OutbreakBoard";
import OutbreakActions from "@/games/Outbreak/components/OutbreakActions";
import OutbreakHands from "@/games/Outbreak/components/OutbreakHands";
import OutbreakInfectionDiscard from "@/games/Outbreak/components/OutbreakInfectionDiscard";
import OutbreakEventTray, { OutbreakEventTargeting } from "@/games/Outbreak/components/OutbreakEventTray";
import OutbreakEndTurnScreen from "@/games/Outbreak/components/OutbreakEndTurnScreen";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecapScreen from "@/components/games/TurnRecapScreen";
import MatchHistory from "@/components/games/MatchHistory";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { SubmitCommand, useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { IOutbreakInfectionPhaseOutcome, OutbreakAction, OutbreakPlayEvent } from "@/utils/apiModels/GameLogic";
import { HAND_LIMIT, IOutbreakInfectionLogEntry, OutbreakMoveType, getLegalMoves, infectionRateFor, stationCityIds } from "@/games/Outbreak/rules";
import { CITIES, DISEASE_COLORS, DISEASE_COLOR_DEFS, EVENT_CARD_AIRLIFT, EVENT_CARD_GOVERNMENT_GRANT, MAX_RESEARCH_STATIONS } from "@/games/Outbreak/board";
import { playerColour } from "@/utils/ui/playerColours";
import { abandonedGameStatus, currentUsername } from "@/utils/ui/players";

// What the map is being used to pick right now: a movement destination, or
// the destination/target an in-flight event card still needs. One state
// covers both — like movement, only the page owns the board's click handler
// — with `OutbreakEventTray` driving the event half via onStartTargeting.
type BoardTarget = { kind: 'move'; type: OutbreakMoveType } | OutbreakEventTargeting;

export default function GameOutbreak({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [showLog, setShowLog] = useState(false);

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IOutbreakGameDataResponse>(gameId);
    const { submitCommand: rawSubmitCommand, submitting, pendingTarget } = useSubmitCommand<IOutbreakGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    // End-of-turn screen: whichever command just finished the draw/infect
    // phase (OutbreakEndTurn, or a discard/event card that ducked the hand
    // limit) hands back what it drew and what it did on its own outcome —
    // see IOutbreakInfectionPhaseOutcome. Every submit goes through this one
    // wrapper so it's caught regardless of which control fired it.
    const [turnResult, setTurnResult] = useState<IOutbreakInfectionLogEntry[] | null>(null);
    const submitCommand: SubmitCommand = (command, callback, target) =>
        rawSubmitCommand(command, (r) => {
            const infectionLog = (r.outcome as IOutbreakInfectionPhaseOutcome).infectionLog;
            if (infectionLog?.length) setTurnResult(infectionLog);
            callback?.(r);
        }, target);

    // Turn review steps back through the real turns of the match; the board,
    // the hands and the log all render whichever point is being viewed. The
    // crew planner (§21.6 step 13) is what turns planning on — until then
    // OutbreakActions never appears while reviewing, so canPlan stays false.
    const nav = useTurnNavigation<IOutbreakSpecificGameStateResponse>(gameId, {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    });
    const recapAvailable = gameData?.recapAvailable ?? false;

    // "Since you were last here": the away-time narrative is the board
    // getting worse (docs/games/outbreak-gdd.md §3, §21.6 step 12) — shown
    // before the board whenever it's our turn and something happened while
    // we were away.
    const recap = useTurnRecap(gameId);

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    const displayedCurrentTurn = nav.displayedCurrentTurn;
    const isMyTurn = nav.isLive && !!user && user.id === displayedCurrentTurn && !complete;
    const myUsername = currentUsername(user);
    const usernameList = gameData?.usernameList ?? [];
    const me = gs?.playerStates[myUsername];

    // What the board is targeting right now, if anything — reset whenever the
    // turn changes so a stale pick from a previous player never lingers into
    // someone else's turn.
    const [boardTarget, setBoardTarget] = useResettingState<BoardTarget | null>(null, `${displayedCurrentTurn}`);
    const eventTargeting = boardTarget && boardTarget.kind !== 'move' ? boardTarget : null;

    // Which city a tapped hand/discard card is ringing on the board right
    // now — purely a lookup aid, reset alongside the move/event target above
    // so a stale ring never carries into someone else's turn.
    const [highlightedCityId, setHighlightedCityId] = useResettingState<number | null>(null, `${displayedCurrentTurn}`);
    function handleCardTap(cityId: number) {
        setHighlightedCityId(highlightedCityId === cityId ? null : cityId);
    }

    const validCities = new Set<number>();
    if (gs && me && isMyTurn && boardTarget) {
        if (boardTarget.kind === 'move') {
            const legal = getLegalMoves({ currentCity: me.city, hand: me.hand, researchStations: stationCityIds(gs.cities) });
            legal.filter(m => m.type === boardTarget.type).forEach(m => validCities.add(m.destination));
        } else if (boardTarget.kind === 'governmentGrant' && boardTarget.destination === undefined) {
            gs.cities.forEach((c, id) => { if (!c.station) validCities.add(id); });
        } else if (boardTarget.kind === 'airlift' && boardTarget.targetUserId !== undefined) {
            const targetCity = Object.values(gs.playerStates).find(p => p.userId === boardTarget.targetUserId)?.city;
            gs.cities.forEach((_, id) => { if (id !== targetCity) validCities.add(id); });
        }
    }

    function handleCityClick(cityId: number) {
        if (!gs || !isMyTurn || !boardTarget) return;

        if (boardTarget.kind === 'move') {
            const cmd = new OutbreakAction();
            cmd.kind = boardTarget.type;
            cmd.destination = cityId;
            submitCommand(cmd, () => setBoardTarget(null), 'move');
            return;
        }

        if (boardTarget.kind === 'governmentGrant' && boardTarget.destination === undefined) {
            if (stationCityIds(gs.cities).length >= MAX_RESEARCH_STATIONS) {
                // All six stations are down — the tray takes over from here to
                // pick which one to relocate, rather than the map.
                setBoardTarget({ ...boardTarget, destination: cityId });
                return;
            }
            const cmd = new OutbreakPlayEvent();
            cmd.kind = 'play';
            cmd.cardId = EVENT_CARD_GOVERNMENT_GRANT;
            cmd.destination = cityId;
            submitCommand(cmd, () => setBoardTarget(null), `event:governmentGrant:${cityId}`);
            return;
        }

        if (boardTarget.kind === 'airlift' && boardTarget.targetUserId !== undefined) {
            const cmd = new OutbreakPlayEvent();
            cmd.kind = 'play';
            cmd.cardId = EVENT_CARD_AIRLIFT;
            cmd.targetUserId = boardTarget.targetUserId;
            cmd.destination = cityId;
            submitCommand(cmd, () => setBoardTarget(null), `event:airlift:${cityId}`);
        }
    }

    const boardTag = !boardTarget ? null
        : boardTarget.kind === 'move' ? 'Choose a destination'
        : boardTarget.kind === 'governmentGrant' && boardTarget.destination === undefined ? 'Choose a station city'
        : boardTarget.kind === 'airlift' && boardTarget.targetUserId !== undefined ? 'Choose a destination'
        : null;

    const currentTurnUsername = gs
        ? Object.values(gs.playerStates).find(p => p.userId === displayedCurrentTurn)?.username ?? displayedCurrentTurn
        : displayedCurrentTurn;

    const abandoned = abandonedGameStatus(complete, gameData?.endReason);

    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
            subtitle = gameData?.endReason === 'teamloss' ? '💀 The team lost' : '🎉 The team won!';
        } else if (isMyTurn && gs.phase === 'discard') {
            subtitle = <span className="ag-hi">Discard down to {HAND_LIMIT}</span>;
        } else if (isMyTurn && gs.phase === 'forecast') {
            subtitle = <span className="ag-hi">🔮 Forecast — set the order</span>;
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
            const isActive = ps.userId === displayedCurrentTurn && !complete;
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
    const optionsMenu = gs ? <GameOptionsMenu options={menuOptions} /> : undefined;

    // Recap intro: a standalone welcome-back screen shown before the board
    // when it's our turn and moves happened while we were away.
    if (recap.show) {
        return (
            <TurnRecapScreen
                recap={recap.recap!}
                cta="See the damage →"
                onDismiss={recap.dismiss}
                onReact={recap.react}
            />
        );
    }

    // End-of-turn screen: what the draw and infect phases just did to us,
    // shown once before the board moves on to whoever's turn it is now.
    if (turnResult) {
        return (
            <OutbreakEndTurnScreen
                infectionLog={turnResult}
                onDismiss={() => setTurnResult(null)}
            />
        );
    }

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
                            boardTag={boardTag}
                            highlightedCityId={highlightedCityId}
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

                    {isMyTurn && !complete && (gs.phase === 'actions' || gs.phase === 'discard') && (
                        <OutbreakEventTray
                            gs={gs}
                            myUsername={myUsername}
                            usernameList={usernameList}
                            submitCommand={submitCommand}
                            pendingTarget={pendingTarget}
                            targeting={eventTargeting}
                            onStartTargeting={t => setBoardTarget(t)}
                            onCancelTargeting={() => setBoardTarget(null)}
                        />
                    )}

                    {isMyTurn && !complete && (
                        <OutbreakActions
                            gs={gs}
                            myUsername={myUsername}
                            moveMode={boardTarget?.kind === 'move' ? boardTarget.type : null}
                            setMoveMode={m => setBoardTarget(m ? { kind: 'move', type: m } : null)}
                            submitCommand={submitCommand}
                            pendingTarget={pendingTarget}
                        />
                    )}

                    <OutbreakInfectionDiscard
                        infectionDiscard={gs.infectionDiscard}
                        onCardTap={handleCardTap}
                        highlightedCityId={highlightedCityId}
                    />

                    <OutbreakHands
                        playerStates={gs.playerStates}
                        usernameList={usernameList}
                        myUsername={myUsername}
                        onCardTap={handleCardTap}
                        highlightedCityId={highlightedCityId}
                    />

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
