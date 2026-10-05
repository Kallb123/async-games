'use client'
import { use, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IRealmArenaGameDataResponse, IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome } from "@/games/RealmArena/apiModels";
import RealmArenaBoard, { type Playback } from "@/games/RealmArena/components/RealmArenaBoard";
import RealmArenaFighterCard from "@/games/RealmArena/components/RealmArenaFighterCard";
import RealmArenaMusterSheet from "@/games/RealmArena/components/RealmArenaMusterSheet";
import RealmArenaResults from "@/games/RealmArena/components/RealmArenaResults";
import RealmArenaTargets from "@/games/RealmArena/components/RealmArenaTargets";
import RealmArenaTurnEnd from "@/games/RealmArena/components/RealmArenaTurnEnd";
import RealmArenaTurnSheet, { actTarget } from "@/games/RealmArena/components/RealmArenaTurnSheet";
import RealmArenaUnits from "@/games/RealmArena/components/RealmArenaUnits";
import { guide as realmArenaGuide } from "@/games/RealmArena/guide";
import { tutorial as realmArenaTutorial } from "@/games/RealmArena/tutorial";
import { useMusterDraft } from "@/games/RealmArena/useMusterDraft";
import { enemyNameOf, musterSize } from "@/games/RealmArena/characters";
import { reachAfter, useTurnDraft } from "@/games/RealmArena/useTurnDraft";
import { battlefieldOf } from "@/games/RealmArena/maps";
import { ACTION_POINTS, battleFrom, centreHolders, ENEMY_SIDE, isStanding, isWarband, sideScore, TEAM_SIDE, warbandsFor, type Action, type BattleEvent, type Fighter } from "@/games/RealmArena/rules";
import { actionSquares, battleCues, centreInSight, ENEMY_COLOUR, fighterName, PLAYBACK_MS, TEAM_COLOUR, TEAM_NAME, unseenSquares } from "@/games/RealmArena/ui";
import type { IRealmArenaOutcome } from "@/games/RealmArena/RealmArenaLogic";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecapScreen from "@/components/games/TurnRecapScreen";
import GameShell from "@/components/ui/GameShell";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameIntro } from "@/utils/hooks/useGameIntro";
import { useGameData } from "@/utils/hooks/useGameData";
import { useHistoryReactions } from "@/utils/hooks/useHistoryReactions";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { RealmArenaAct, RealmArenaEndTurn, RealmArenaMuster, RealmArenaUndo } from "@/utils/apiModels/GameLogic";
import { tutorialRun } from "@/utils/ui/gameTutorials";
import { playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus, finishedGameCopy, isPlayersTurn, nameForUserId, scoreboardSeatOrder } from "@/utils/ui/players";
import { capitalise } from "@/utils/ui/text";

/**
 * Realm Arena's board screen (docs/games/realm-arena.md §17.3 PR 5): the
 * battlefield, the squads on it, the scores, the round and whose turn it is.
 * Tapping a character selects it, brings the view to it and shows what it can
 * do. On their muster turn a player picks and places their squad here (PR 6),
 * and on a battle turn lines up each action on the board and sends it, sees
 * what it did as it comes back, and ends the turn (PR 7). A player coming
 * back to their turn is told what happened while they were away, and anyone
 * can step back through the match one action at a time, the view following
 * each action as it goes (PR 8).
 */
export default function GameRealmArena({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData, loading: loadingGame } = useGameData<IRealmArenaGameDataResponse>(gameId);
    const historyReact = useHistoryReactions(gameId, user?.id, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    // A tap on a unit's box brings the view to it, even when it's already selected.
    const [refocus, setRefocus] = useState(0);
    const selectUnit = (id: number) => {
        setSelectedId(id);
        setRefocus(n => n + 1);
    };
    const { submitCommand, pendingTarget } = useSubmitCommand<IRealmArenaGameDataResponse>(gameId, user, setGameData, getGameData, gameData);

    // Planning is out by design (§17.3 PR 8): every attack worth planning
    // needs a roll, and the turn sheet already shows the odds of one before
    // it's sent. So the review steps back through the match, and no further.
    const nav = useTurnNavigation<IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome>(gameId, {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? '',
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? '',
        history: gameData?.gameState?.history ?? [],
    });
    const recap = useTurnRecap(gameId, { viewerId: user?.id, setGameData, getGameData });
    // The first-match welcome: the guided tour, with the guide behind it in ⋮.
    const gameIntro = useGameIntro('realmarena');

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    const currentTurn = nav.displayedCurrentTurn;
    const myUserId = user?.id ?? '';
    const isMyTurn = isPlayersTurn(nav.isLive, user, currentTurn) && !complete;
    const usernameList = gameData?.usernameList ?? [];
    const userIdList = gameData?.userIdList ?? [];
    const turnOrder = gameData?.gameState?.turnOrder;
    // Held still between renders, as the sight sweep below is kept by it.
    const seats = useMemo(() => turnOrder ?? [], [turnOrder]);
    // The map with whatever has been blasted cleared from it (§22), as the
    // rules read it. Keyed on the squares rather than the array, which is a
    // new one on every refresh, so it's rebuilt — and the board lays its
    // ground out again — only when something more is blasted.
    const blastedKey = (gs?.blasted ?? []).join(',');
    const map = gs?.map ?? '';
    const field = useMemo(() => battlefieldOf(map, blastedKey ? blastedKey.split(',').map(Number) : []), [map, blastedKey]);

    // In co-op the players are one side against the computer's warbands (§29.6),
    // and every squad musters 80 points (§29.1).
    const coop = !!gs?.coop;
    // The enemy goes by its faction's name, or "the enemy" until a random one is seen (§29.3).
    const enemyName = enemyNameOf(gs?.enemy);
    // Whoever owns a character or holds the centre: a player, a warband by the
    // enemy's name and in one colour whichever it is, or in co-op a side.
    const playerName = (owner?: string): string => {
        if (owner === myUserId) return 'You';
        if (owner === TEAM_SIDE) return TEAM_NAME;
        if (owner === ENEMY_SIDE || (owner && isWarband(owner))) return enemyName;
        return nameForUserId(gameData, owner);
    };
    const colourFor = (owner: string): string => isWarband(owner) ? ENEMY_COLOUR : playerColourForId(owner, userIdList);
    const currentTurnName = nameForUserId(gameData, currentTurn);
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, nameForUserId(gameData, gameData?.forfeitedBy));
    const winnerName = nameForUserId(gameData, nav.displayedWinner);
    // A co-op battle ends for the whole team (§29.5), in the words every co-op result uses.
    const teamWon = gameData?.endReason === 'teamwin';
    const teamEnding = (endDetail?: string) => finishedGameCopy({ winner: '', endReason: gameData?.endReason, endDetail });
    const currentUserWon = complete && !!myUserId && myUserId === nav.displayedWinner;
    const mustering = gs?.phase === 'muster';
    const fighters = gs?.fighters ?? [];
    const selected = fighters.find(fighter => fighter.id === selectedId);

    const mySeat = seats.indexOf(myUserId);
    // The live turn, not the one a review shows, so stepping back through the
    // match and returning leaves anything lined up as it was.
    const turnKey = `${gameData?.currentTurn ?? ''}:${gameData?.specificGameState?.phase ?? ''}`;
    const draft = useMusterDraft(field, mySeat, musterSize(seats.length, coop), gs?.budget ?? 0, gs?.mastery?.[myUserId] ?? {}, turnKey);
    const musterTurn = mustering && isMyTurn && !gs?.myMuster;
    const placement = musterTurn ? draft.placement : null;
    // A box in the placing list picks that one up and brings the view to it, even when it already was.
    const pickUp = (index: number) => {
        draft.select(index);
        setRefocus(n => n + 1);
    };
    const muster = () => {
        if (!placement) return;
        const command = new RealmArenaMuster();
        command.picks = placement.picks;
        submitCommand(command, undefined, 'muster');
    };

    // A battle turn: a run of actions, one command each so every result is
    // seen before the next is chosen, then the end of the turn (§17.2).
    const battleTurn = !!gs && !mustering && isMyTurn;
    // In fog of war, the battle as the viewer's squad sees it (§27): the
    // response holds only who it can see, and the clouds it can see whose
    // throwers it can't. The fog lifts once the battle is over.
    const fogged = !!gs?.fog && !complete;
    const clouds = gs?.clouds ?? [];
    const battle = battleFrom(field, { fighters, fog: fogged, clouds, seats, coop });
    // Every square the viewer's squad can't see, dimmed on the board: a
    // sweep of sight lines, so only redone when someone moves or cover goes.
    const shown = gs?.fighters;
    const unseen = useMemo(
        () => fogged && !mustering && mySeat >= 0 ? unseenSquares(battleFrom(field, { fighters: shown ?? [], fog: true, seats, coop }), myUserId) : null,
        [fogged, mustering, mySeat, field, shown, myUserId, seats, coop],
    );
    const actor = battleTurn && selected && selected.owner === myUserId && isStanding(selected) ? selected : null;
    const [lastEvents, setLastEvents] = useResettingState<BattleEvent[]>([], turnKey);
    const [keepStill, setKeepStill] = useResettingState<number[]>([], turnKey);
    // What the viewer's own last action or End turn did, played over the board
    // as it comes back (§26.1), from where everyone stood — and the cover that
    // stood — when it was sent.
    // Gone once it has had its time, whether or not the board was showing it,
    // so coming back from a review doesn't play it again.
    const [ownPlayback, setOwnPlayback] = useState<Playback | null>(null);
    const play = (key: string, events: BattleEvent[]) => {
        const cues = battleCues(events, fighters);
        setOwnPlayback(cues.length > 0 ? { key, cues, field } : null);
    };
    useEffect(() => {
        if (!ownPlayback) return;
        const played = setTimeout(() => setOwnPlayback(null), PLAYBACK_MS);
        return () => clearTimeout(played);
    }, [ownPlayback]);
    const act = (action: Action) => {
        const command = new RealmArenaAct();
        command.action = action;
        submitCommand(command, response => {
            const events = (response.outcome as IRealmArenaOutcome).events ?? [];
            setLastEvents(events);
            play(command.id, events);
        }, actTarget(action));
    };
    const turn = useTurnDraft(battle, myUserId, actor, turnKey, act);
    // A target picked from the turn sheet's list brings the view to it and
    // whoever is aiming at it, and keeps it there until the character acts,
    // another is selected, a box is tapped or a review is stepped into.
    const pickKey = `${turnKey}:${nav.isLive}:${refocus}:${selected ? `${selected.id}:${selected.square}:${selected.ap}:${selected.hp}` : ''}`;
    const [picked, setPicked] = useResettingState<{ squares: number[]; key: string } | null>(null, pickKey);
    const focusTarget = (target: Fighter) => {
        if (selected) setPicked({ squares: [selected.square, target.square], key: `target:${target.id}:${Date.now()}` });
    };
    const endTurn = () => {
        const command = new RealmArenaEndTurn();
        command.keepStill = keepStill;
        // Burning, as the next player's turn begins (§20.2).
        submitCommand(command, response => play(command.id, (response.outcome as IRealmArenaOutcome).events ?? []), 'endTurn');
    };
    // What the undone action did is no longer what happened, so its results go too.
    const undo = () => submitCommand(new RealmArenaUndo(), () => {
        setLastEvents([]);
        setOwnPlayback(null);
    }, 'undo');
    // A tap on a character aims the action lined up, when it can; otherwise it selects.
    const tapFighter = (id: number) => {
        if (turn?.tapFighter(id)) return;
        setSelectedId(current => current === id ? null : id);
    };

    // What the viewer's own selected character could hit, from the end of a
    // lined-up move while there is one: listed over the board's foot, and
    // each enemy's odds worn on its figure. Live only: a review shows what
    // happened, not what could.
    const reach = nav.isLive && selected && selected.owner === myUserId && isStanding(selected) && !mustering && !complete
        ? reachAfter(battle, selected, turn?.after)
        : null;

    // Stepping through the match, the view goes to each action as it comes.
    // A step that handed the turn on moved everyone's AP, not anyone in
    // particular, so the view stays where it is. One that ended the battle
    // hands it to nobody, and is followed: it's the blow that decided it.
    // Live, it goes to a target picked from the turn sheet's list instead.
    const previous = nav.previousSnapshot;
    const follow = !nav.isLive
        ? previous && (previous.currentTurn === currentTurn || currentTurn === '')
            ? { squares: actionSquares(previous.specificGameState.fighters, fighters), key: String(nav.viewIndex) }
            : null
        : picked;
    // And plays what each step did as it's stepped to (§26.1), whoever took it.
    const stepEvents = nav.displayedOutcome?.events;
    const stepCues = previous && stepEvents ? battleCues(stepEvents, previous.specificGameState.fighters) : [];
    const playback: Playback | null = nav.isLive ? ownPlayback
        : previous && stepCues.length > 0 ? { key: `step:${nav.viewIndex}`, cues: stepCues, field: battlefieldOf(map, previous.specificGameState.blasted) } : null;

    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete && coop) {
            subtitle = `${teamWon ? '🏆 ' : ''}${teamEnding()}`;
        } else if (complete) {
            subtitle = currentUserWon ? '🏆 You won!' : `${winnerName} won`;
        } else if (mustering) {
            subtitle = isMyTurn
                ? <><span className="ag-hi">Your move</span> · muster your squad</>
                : <>{currentTurnName} is mustering</>;
        } else {
            const round = `round ${gs.round} of ${gs.battleRounds}`;
            subtitle = isMyTurn
                ? <><span className="ag-hi">Your move</span> · {round}</>
                : <>{currentTurnName}&apos;s move · {round}</>;
        }
    }

    // Until every squad has mustered, nothing about anyone's squad is on the
    // wire but the viewer's own (§17.2), so the strip says only who has.
    const musterSub = (userId: string): string => {
        if (gs?.mustered.includes(userId)) return '✔ mustered';
        return userId === currentTurn ? 'mustering' : 'waiting';
    };
    const dropped = gameData?.gameState?.droppedPlayers ?? [];
    // How many of a squad stand — or, in fog of war, all the viewer knows of
    // anyone else's: how many of it they can see (§27).
    const standingLine = (squad: Fighter[], hidden: boolean): string => hidden
        ? `${squad.filter(isStanding).length} in sight`
        : `${squad.filter(isStanding).length}/${squad.length} standing`;
    // What the strip says under a player: how their muster or their squad stands.
    // A dropped player's squad has left the battlefield; their score stands (§17.4 B2).
    const squadSub = (userId: string): string => mustering ? musterSub(userId)
        : dropped.includes(userId) ? 'left the battle'
        : standingLine(fighters.filter(fighter => fighter.owner === userId), fogged && userId !== myUserId);
    const seatOrder = scoreboardSeatOrder(gameData, myUserId);
    const scores = gs?.scores ?? {};
    const nextWave = gs?.mission === 'holdOut' ? gs.round + (3 - ((gs.round - 1) % 3)) : undefined;
    // In co-op the strip is the team's total against the enemy's (§29.9), each
    // player's share under the team's, and how each one stands once it's opened.
    const scoreEntries: ScoreEntry[] = !gs ? [] : coop ? [
        {
            id: TEAM_SIDE,
            name: capitalise(TEAM_NAME),
            color: TEAM_COLOUR,
            sub: seatOrder.map(userId => `${playerName(userId)} ${scores[userId] ?? 0}`).join(' · '),
            detail: seatOrder.map(userId => <div key={userId}>{playerName(userId)} · {scores[userId] ?? 0} · {squadSub(userId)}</div>),
            score: sideScore(battle, scores, TEAM_SIDE),
            isMe: true,
        },
        {
            id: ENEMY_SIDE,
            name: capitalise(enemyName),
            color: ENEMY_COLOUR,
            sub: mustering ? 'musters last' : gs.mission === 'holdOut'
                ? `${standingLine(fighters.filter(fighter => isWarband(fighter.owner)), fogged)} · ${nextWave && nextWave <= gs.battleRounds ? `next wave ${nextWave}` : 'final wave landed'}`
                : standingLine(fighters.filter(fighter => isWarband(fighter.owner)), fogged),
            score: sideScore(battle, scores, ENEMY_SIDE),
        },
    ] : seatOrder.map(userId => ({
        id: userId,
        name: playerName(userId),
        color: colourFor(userId),
        sub: squadSub(userId),
        score: scores[userId] ?? 0,
        isMe: userId === myUserId,
        isActive: userId === currentTurn && !complete,
    }));

    // The tour's signals (src/games/RealmArena/tutorial.ts says what each one
    // means), frozen on whichever hold when it opens.
    const tutorial = tutorialRun(realmArenaTutorial, {
        mustering: musterTurn,
        sealed: mustering && !musterTurn,
        battle: !!gs && !mustering,
        myTurn: battleTurn,
        selected: !!actor,
    }, { active: nav.isLive && !complete });

    const holders = centreHolders(battle);
    // In fog of war, nobody seen there isn't nobody there (§27).
    const centre = holders.length === 0 ? (centreInSight(battle, myUserId) ? 'Empty' : 'Unseen') : holders.length > 1 ? 'Contested' : capitalise(playerName(holders[0]));

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

    if (recap.show) {
        return (
            <TurnRecapScreen
                recap={recap.recap!}
                cta="See the battlefield →"
                onDismiss={recap.dismiss}
                viewerId={user?.id}
                onReact={recap.react}
            />
        );
    }

    return (
        <GameShell
            title="Realm Arena"
            subtitle={subtitle}
            options={gs ? menuOptions : undefined}
            busy={loadingGame || nav.loading}
            log={{ entries: nav.displayedHistory, userIdList, oldestFirst: true, viewerId: myUserId, onReact: nav.isLive ? historyReact : undefined }}
            chat={{ gameId, userIdList, usernameList }}
            className="ag-game--realmarena"
            guide={realmArenaGuide}
            tutorial={tutorial}
            intro={gameIntro}
        >
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && (
                <div className="ag-stat-row" data-tour="ra-stats">
                    <Stat value={mustering ? 'Muster' : `${gs.round}/${gs.battleRounds}`} label={mustering ? 'Phase' : 'Round'} />
                    <Stat value={centre} label="Centre" />
                    <Stat value={gs.budget} label="Points each" />
                </div>
            )}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
                        : coop ? `${teamEnding(gameData?.endDetail)}${teamWon ? ' 🎉' : '.'}`
                        : currentUserWon ? 'You held the field! 🎉' : `${winnerName} held the field.`}
                    gameId={gameId}
                    gameUrl="realmarena"
                    usernameList={usernameList}
                    userIdList={userIdList}
                    myUserId={myUserId}
                    turnTimer={gameData?.turnTimer}
                />
            )}

            {gs && (
                <>
                    <div className="ag-board-area">
                        <RealmArenaBoard
                            field={field}
                            fighters={fighters}
                            fogGhosts={gs.ghosts}
                            unseen={unseen}
                            clouds={clouds}
                            sides={battle.sides}
                            sealed={placement?.picks ?? gs.myMuster}
                            owners={coop ? [...seats, ...warbandsFor(seats)] : seats}
                            viewerId={myUserId}
                            colourFor={colourFor}
                            nameFor={playerName}
                            selected={selected}
                            onSelect={tapFighter}
                            placing={placement && { zone: draft.zone, selected: placement.selected, onTap: draft.tap }}
                            aiming={turn && {
                                reach: turn.reach,
                                range: turn.range,
                                path: turn.path,
                                area: turn.area,
                                blasts: turn.blasts,
                                candidates: turn.candidates,
                                aimed: turn.targets,
                                flagged: turn.reactions.map(reaction => reaction.watcher.id),
                                onSquare: turn.tapSquare,
                            }}
                            refocus={refocus}
                            acting={!mustering && !complete ? currentTurn : null}
                            follow={follow}
                            odds={reach?.options}
                            overlay={reach && <RealmArenaTargets reach={reach} fighters={fighters} viewerId={myUserId} nameFor={playerName} />}
                            playback={playback}
                        />
                    </div>

                    {!mustering && (
                        <RealmArenaUnits
                            battle={battle}
                            player={myUserId}
                            colourFor={colourFor}
                            acting={battleTurn}
                            showReach={!complete}
                            selectedId={selected?.id ?? null}
                            onSelect={selectUnit}
                        />
                    )}

                    {/* Whom the team fights (§29.3): named from the start when
                        the host picked it, and unknown when Random drew it. */}
                    {mustering && coop && (
                        <div className="ag-section">
                            <p className="ag-hint ag-hint--tight">
                                {gs.enemy
                                    ? `You fight together against ${enemyName}, with a warband of theirs opposite each of you.`
                                    : 'You fight together against an unknown enemy, drawn at random: you\'ll learn who it is when one of its characters is first seen.'}
                            </p>
                        </div>
                    )}

                    {musterTurn && (
                        <RealmArenaMusterSheet draft={draft} budget={gs.budget} colour={colourFor(myUserId)} onPick={pickUp} onMuster={muster} pending={pendingTarget === 'muster'} />
                    )}

                    {/* Nothing about anyone else's squad is on the wire until
                        every squad has mustered (§17.2), so there is nothing
                        to show here but who is mustering. */}
                    {mustering && !isMyTurn && !complete && mySeat >= 0 && (
                        <div className="ag-section">
                            <div className="ag-empty">
                                {gs.myMuster
                                    ? `Your squad is sealed. ${currentTurnName} is mustering, and you'll see every squad once everyone has.`
                                    : `${currentTurnName} is mustering. Your turn to muster is coming, and no squad is seen until every player has.`}
                            </div>
                        </div>
                    )}

                    {battleTurn && lastEvents.length > 0 && (
                        <RealmArenaResults events={lastEvents} fighters={fighters} viewerId={myUserId} nameFor={playerName} />
                    )}

                    {battleTurn && !selected && (
                        <div className="ag-section">
                            <p className="ag-hint ag-hint--tight">Tap one of your units above, or on the board, to act with it. Each has its own {ACTION_POINTS} AP.</p>
                        </div>
                    )}

                    {selected && (
                        <RealmArenaFighterCard fighter={selected} label={`${fighterName(fighters, selected)} · ${playerName(selected.owner)}`}>
                            {turn && <RealmArenaTurnSheet draft={turn} battle={battle} player={myUserId} nameFor={playerName} pendingTarget={pendingTarget} onFocus={focusTarget} />}
                        </RealmArenaFighterCard>
                    )}

                    {battleTurn && (
                        <RealmArenaTurnEnd
                            fighters={fighters}
                            player={myUserId}
                            keepStill={keepStill}
                            onKeepStill={setKeepStill}
                            onEndTurn={endTurn}
                            canUndo={gs.canUndo}
                            onUndo={undo}
                            undoPending={pendingTarget === 'undo'}
                            pending={pendingTarget === 'endTurn'}
                            disabled={pendingTarget !== null}
                        />
                    )}

                    <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} userIdList={userIdList} />
                </>
            )}
        </GameShell>
    );
}
