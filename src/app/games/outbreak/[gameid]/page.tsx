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
import OutbreakInfectionRateScale from "@/games/Outbreak/components/OutbreakInfectionRateScale";
import OutbreakRoleIntro from "@/games/Outbreak/components/OutbreakRoleIntro";
import { guide as outbreakGuide } from "@/games/Outbreak/guide";
import GameShell from "@/components/ui/GameShell";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameGuideModal from "@/components/ui/GameGuideModal";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecapScreen from "@/components/games/TurnRecapScreen";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useGameGuide } from "@/utils/hooks/useGameGuide";
import { SubmitCommand, useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { IOutbreakInfectionPhaseOutcome, OutbreakAction, OutbreakPlayEvent } from "@/utils/apiModels/GameLogic";
import { HAND_LIMIT, IOutbreakInfectionLogEntry, OutbreakMoveType, getLegalMoves, infectionRateFor, stationCityIds } from "@/games/Outbreak/rules";
import { CITIES, DISEASE_COLORS, DISEASE_COLOR_DEFS, EVENT_CARD_AIRLIFT, EVENT_CARD_GOVERNMENT_GRANT, MAX_RESEARCH_STATIONS } from "@/games/Outbreak/board";
import { playerColour } from "@/utils/ui/playerColours";
import { abandonedGameStatus, isPlayersTurn, nameForUserId } from "@/utils/ui/players";

// What the map is being used to pick right now: a movement destination, or
// the destination/target an in-flight event card still needs. One state
// covers both — like movement, only the page owns the board's click handler
// — with `OutbreakEventTray` driving the event half via onStartTargeting.
type BoardTarget =
    | { kind: 'move'; type: OutbreakMoveType }
    // Operations Expert (§11): the once-per-turn flight from a station to any
    // city, with the city card chosen in OutbreakActions already picked.
    | { kind: 'opsFlight'; cardId: number }
    // Dispatcher (§11): moving a chosen teammate's pawn by a chosen move type
    // (paid from her hand), or sending a chosen pawn to a city another occupies.
    | { kind: 'dispatchMove'; type: OutbreakMoveType; moverUserId: string }
    | { kind: 'dispatchRelocate'; moverUserId: string }
    | OutbreakEventTargeting;

export default function GameOutbreak({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [showInfectionScale, setShowInfectionScale] = useState(false);

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

    // Turn review steps back through the match's real actions (one per played
    // command, not one per turn); the board, the hands and the log all render
    // whichever point is being viewed. The crew planner (§21.6 step 13) is
    // what turns planning on — until then
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

    // The "how to play" popup: shown automatically the first time this
    // account opens an Outbreak match, and on demand from the game-options
    // menu — see useGameGuide.
    const gameGuide = useGameGuide('outbreak');

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    const displayedCurrentTurn = nav.displayedCurrentTurn;
    const isMyTurn = isPlayersTurn(nav.isLive, user, displayedCurrentTurn) && !complete;
    const myUserId = user?.id ?? '';
    const usernameList = gameData?.usernameList ?? [];
    const userIdList = gameData?.userIdList ?? [];
    // Outbreak's running order is drawn at random at setup (see
    // OutbreakModels.ts's CreateGame) and need not match userIdList's join
    // order — OutbreakHands needs the real one for seating and turn markers.
    const turnOrder = gameData?.gameState?.turnOrder ?? [];
    const me = gs?.playerStates[myUserId];

    // What the board is targeting right now, if anything — reset whenever the
    // turn changes so a stale pick from a previous player never lingers into
    // someone else's turn.
    const [boardTarget, setBoardTarget] = useResettingState<BoardTarget | null>(null, `${displayedCurrentTurn}`);
    const eventTargeting = boardTarget && (boardTarget.kind === 'airlift' || boardTarget.kind === 'governmentGrant') ? boardTarget : null;

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
        } else if (boardTarget.kind === 'opsFlight') {
            gs.cities.forEach((_, id) => { if (id !== me.city) validCities.add(id); });
        } else if (boardTarget.kind === 'dispatchMove') {
            const mover = Object.values(gs.playerStates).find(p => p.userId === boardTarget.moverUserId);
            if (mover) {
                const legal = getLegalMoves({ currentCity: mover.city, hand: me.hand, researchStations: stationCityIds(gs.cities) });
                legal.filter(m => m.type === boardTarget.type).forEach(m => validCities.add(m.destination));
            }
        } else if (boardTarget.kind === 'dispatchRelocate') {
            const mover = Object.values(gs.playerStates).find(p => p.userId === boardTarget.moverUserId);
            if (mover) {
                Object.values(gs.playerStates).forEach(p => { if (p.userId !== mover.userId && p.city !== mover.city) validCities.add(p.city); });
            }
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

        if (boardTarget.kind === 'opsFlight') {
            const cmd = new OutbreakAction();
            cmd.kind = 'opsExpertFlight';
            cmd.destination = cityId;
            cmd.cardId = boardTarget.cardId;
            submitCommand(cmd, () => setBoardTarget(null), 'opsFlight');
            return;
        }

        if (boardTarget.kind === 'dispatchMove') {
            const cmd = new OutbreakAction();
            cmd.kind = boardTarget.type;
            cmd.destination = cityId;
            cmd.targetUserId = boardTarget.moverUserId;
            submitCommand(cmd, () => setBoardTarget(null), 'dispatchMove');
            return;
        }

        if (boardTarget.kind === 'dispatchRelocate') {
            const cmd = new OutbreakAction();
            cmd.kind = 'dispatcherRelocate';
            cmd.destination = cityId;
            cmd.targetUserId = boardTarget.moverUserId;
            submitCommand(cmd, () => setBoardTarget(null), 'dispatchRelocate');
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
        : boardTarget.kind === 'opsFlight' ? 'Choose a destination'
        : boardTarget.kind === 'dispatchMove' || boardTarget.kind === 'dispatchRelocate' ? 'Choose a destination'
        : boardTarget.kind === 'governmentGrant' && boardTarget.destination === undefined ? 'Choose a station city'
        : boardTarget.kind === 'airlift' && boardTarget.targetUserId !== undefined ? 'Choose a destination'
        : null;

    const currentTurnUsername = nameForUserId(gameData, displayedCurrentTurn);

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
        ? userIdList.flatMap((userId, i): ScoreEntry[] => {
            const ps = gs.playerStates[userId];
            if (!ps) return [];
            const isMe = userId === myUserId;
            const isActive = ps.userId === displayedCurrentTurn && !complete;
            return [{
                id: userId,
                name: isMe ? 'You' : ps.username,
                color: playerColour(i),
                sub: isActive ? `${ps.actionsLeft} actions · ${CITIES[ps.city].name}` : CITIES[ps.city].name,
                score: ps.hand.length,
                isMe,
                isActive,
                // Tapping a player rings the city they're standing in — reusing
                // the same board highlight a tapped card lights up.
                onClick: () => handleCardTap(ps.city),
                highlighted: highlightedCityId === ps.city,
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
            key: 'guide',
            label: 'Game guide',
            icon: '📖',
            onClick: gameGuide.openGuide,
        },
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
        <GameShell title="Outbreak" subtitle={subtitle} options={gs ? menuOptions : undefined} syncing={submitting} log={{ entries: nav.displayedHistory, userIdList }} chat={{ gameId, userIdList, usernameList }} className="ag-game--outbreak">
            <FcmTokenComp />

            {/* Game guide before role guide — a player needs to know the game
                before their role in it (see useGameGuide's `loaded`/`open`
                docs), so the role welcome waits for this one to have
                answered and to not be showing. */}
            {me && gameGuide.loaded && !gameGuide.open && <OutbreakRoleIntro gameId={gameId} myUserId={myUserId} role={me.role} />}
            {gameGuide.open && <GameGuideModal guide={outbreakGuide} onClose={gameGuide.closeGuide} />}

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && (
                <>
                    <div className="ag-stat-row">
                        <Stat value={`${gs.outbreaks}/8`} label="Outbreaks" />
                        <Stat
                            value={infectionRateFor(gs.infectionRateIndex)}
                            label="Infection rate"
                            onClick={() => setShowInfectionScale(v => !v)}
                            pressed={showInfectionScale}
                        />
                        {/* Cubes left is a per-colour supply, not one pool: the
                            game is lost the moment a single colour runs out
                            (rules.ts isCubeExhaustionLoss), so the tile shows
                            the four counts in their own colours rather than a
                            total that hides the one about to hit zero. */}
                        <Stat
                            value={
                                <span className="ag-ob-cubetally">
                                    {DISEASE_COLORS.map(color => (
                                        <span
                                            key={color}
                                            className="ag-ob-cubetally-n"
                                            style={{ color: DISEASE_COLOR_DEFS[color].inkHex }}
                                            aria-label={`${DISEASE_COLOR_DEFS[color].name}: ${gs.cubesLeft[color]}`}
                                        >
                                            {gs.cubesLeft[color]}
                                        </span>
                                    ))}
                                </span>
                            }
                            label="Cubes left"
                        />
                    </div>
                    {showInfectionScale && <OutbreakInfectionRateScale infectionRateIndex={gs.infectionRateIndex} />}
                </>
            )}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
                        : gameData?.endReason === 'teamloss'
                            // Which §4.2 defeat it was, in the words the game
                            // logged it in (endInTeamLoss). There are three of
                            // them, and "the outbreak overwhelmed the team"
                            // names none — that generic line is only the
                            // fallback for a game that ended before the
                            // reason was recorded.
                            ? gameData.endDetail
                                ? `The team lost — ${gameData.endDetail}.`
                                : 'The outbreak overwhelmed the team.'
                            : 'The team cured every disease! 🎉'}
                    gameId={gameId}
                    gameUrl="outbreak"
                    usernameList={usernameList}
                    userIdList={userIdList}
                    myUserId={myUserId}
                    turnTimer={gameData?.turnTimer}
                />
            )}

            {gs && (
                <>
                    <div className="ag-board-area">
                        <OutbreakBoard
                            cities={gs.cities}
                            playerStates={gs.playerStates}
                            userIdList={userIdList}
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
                            myUserId={myUserId}
                            userIdList={userIdList}
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
                            myUserId={myUserId}
                            userIdList={userIdList}
                            moveMode={boardTarget?.kind === 'move' ? boardTarget.type : null}
                            setMoveMode={m => setBoardTarget(m ? { kind: 'move', type: m } : null)}
                            opsFlightActive={boardTarget?.kind === 'opsFlight'}
                            onStartOpsFlight={cardId => setBoardTarget({ kind: 'opsFlight', cardId })}
                            dispatchBoard={
                                boardTarget?.kind === 'dispatchMove' ? { moverUserId: boardTarget.moverUserId, mode: 'move' }
                                : boardTarget?.kind === 'dispatchRelocate' ? { moverUserId: boardTarget.moverUserId, mode: 'relocate' }
                                : null
                            }
                            onStartDispatchMove={(type, moverUserId) => setBoardTarget({ kind: 'dispatchMove', type, moverUserId })}
                            onStartDispatchRelocate={moverUserId => setBoardTarget({ kind: 'dispatchRelocate', moverUserId })}
                            onCancelBoardTarget={() => setBoardTarget(null)}
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
                        userIdList={userIdList}
                        turnOrder={turnOrder}
                        myUserId={myUserId}
                        activeUserId={complete ? null : displayedCurrentTurn}
                        onCardTap={handleCardTap}
                        highlightedCityId={highlightedCityId}
                    />

                    {recapAvailable && (
                        <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} userIdList={userIdList} />
                    )}
                </>
            )}
        </GameShell>
    );
}
