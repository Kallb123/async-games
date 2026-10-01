'use client'
import { use, useState } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IRealmArenaGameDataResponse } from "@/games/RealmArena/apiModels";
import RealmArenaBoard from "@/games/RealmArena/components/RealmArenaBoard";
import RealmArenaFighterCard from "@/games/RealmArena/components/RealmArenaFighterCard";
import RealmArenaMusterSheet from "@/games/RealmArena/components/RealmArenaMusterSheet";
import RealmArenaResults from "@/games/RealmArena/components/RealmArenaResults";
import RealmArenaTurnEnd from "@/games/RealmArena/components/RealmArenaTurnEnd";
import RealmArenaTurnSheet, { actTarget } from "@/games/RealmArena/components/RealmArenaTurnSheet";
import { useMusterDraft } from "@/games/RealmArena/useMusterDraft";
import { useTurnDraft } from "@/games/RealmArena/useTurnDraft";
import { battlefieldById } from "@/games/RealmArena/maps";
import { ACTION_POINTS, centreHolders, isStanding, type Action, type BattleEvent, type BattleState } from "@/games/RealmArena/rules";
import { fighterName } from "@/games/RealmArena/ui";
import type { IRealmArenaActOutcome } from "@/games/RealmArena/RealmArenaLogic";
import GameShell from "@/components/ui/GameShell";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useHistoryReactions } from "@/utils/hooks/useHistoryReactions";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { RealmArenaAct, RealmArenaEndTurn, RealmArenaMuster } from "@/utils/apiModels/GameLogic";
import { playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus, isPlayersTurn, nameForUserId, scoreboardSeatOrder } from "@/utils/ui/players";

/**
 * Realm Arena's board screen (docs/games/realm-arena.md §17.3 PR 5): the
 * battlefield, the squads on it, the scores, the round and whose turn it is.
 * Tapping a character selects it, brings the view to it and shows what it can
 * do. On their muster turn a player picks and places their squad here (PR 6),
 * and on a battle turn lines up each action on the board and sends it, sees
 * what it did as it comes back, and ends the turn (PR 7). Replay and recap
 * arrive with PR 8's adapter.
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
    const { submitCommand, pendingTarget } = useSubmitCommand<IRealmArenaGameDataResponse>(gameId, user, setGameData, getGameData, gameData);

    const gs = gameData?.specificGameState;
    const complete = gameData?.complete ?? false;
    const myUserId = user?.id ?? '';
    const isMyTurn = isPlayersTurn(true, user, gameData?.currentTurn) && !complete;
    const usernameList = gameData?.usernameList ?? [];
    const userIdList = gameData?.userIdList ?? [];
    const seats = gameData?.gameState?.turnOrder ?? [];
    const field = battlefieldById(gs?.map ?? '');

    const playerName = (userId?: string): string => userId === myUserId ? 'You' : nameForUserId(gameData, userId);
    const colourFor = (userId: string): string => playerColourForId(userId, userIdList);
    const currentTurnName = nameForUserId(gameData, gameData?.currentTurn);
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, nameForUserId(gameData, gameData?.forfeitedBy));
    const winnerName = nameForUserId(gameData, gameData?.winner);
    const currentUserWon = complete && !!myUserId && myUserId === gameData?.winner;
    const mustering = gs?.phase === 'muster';
    const fighters = gs?.fighters ?? [];
    const selected = fighters.find(fighter => fighter.id === selectedId);

    const mySeat = seats.indexOf(myUserId);
    const turnKey = `${gameData?.currentTurn ?? ''}:${gs?.phase ?? ''}`;
    const draft = useMusterDraft(field, mySeat, seats.length, gs?.budget ?? 0, turnKey);
    const musterTurn = mustering && isMyTurn && !gs?.myMuster;
    const placement = musterTurn ? draft.placement : null;
    const muster = () => {
        if (!placement) return;
        const command = new RealmArenaMuster();
        command.picks = placement.picks;
        submitCommand(command, undefined, 'muster');
    };

    // A battle turn: a run of actions, one command each so every result is
    // seen before the next is chosen, then the end of the turn (§17.2).
    const battleTurn = !!gs && !mustering && isMyTurn;
    const battle: BattleState = { field, fighters };
    const actor = battleTurn && selected && selected.owner === myUserId && isStanding(selected) ? selected : null;
    const [lastEvents, setLastEvents] = useResettingState<BattleEvent[]>([], turnKey);
    const [keepStill, setKeepStill] = useResettingState<number[]>([], turnKey);
    const act = (action: Action) => {
        const command = new RealmArenaAct();
        command.action = action;
        submitCommand(command, response => setLastEvents((response.outcome as IRealmArenaActOutcome).events ?? []), actTarget(action));
    };
    const turn = useTurnDraft(battle, myUserId, actor, turnKey, act);
    const endTurn = () => {
        const command = new RealmArenaEndTurn();
        command.keepStill = keepStill;
        submitCommand(command, undefined, 'endTurn');
    };
    // A tap on a character aims the action lined up, when it can; otherwise it selects.
    const tapFighter = (id: number) => {
        if (turn?.tapFighter(id)) return;
        setSelectedId(current => current === id ? null : id);
    };

    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
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
        return userId === gameData?.currentTurn ? 'mustering' : 'waiting';
    };
    const scoreEntries: ScoreEntry[] = gs
        ? scoreboardSeatOrder(gameData, myUserId).map((userId): ScoreEntry => {
            const squad = fighters.filter(fighter => fighter.owner === userId);
            const sub = mustering ? musterSub(userId) : `${squad.filter(isStanding).length}/${squad.length} standing`;
            return {
                id: userId,
                name: playerName(userId),
                color: colourFor(userId),
                sub,
                score: gs.scores[userId] ?? 0,
                isMe: userId === myUserId,
                isActive: userId === gameData?.currentTurn && !complete,
            };
        })
        : [];

    const holders = centreHolders({ field, fighters });
    const centre = holders.length === 0 ? 'Empty' : holders.length > 1 ? 'Contested' : playerName(holders[0]);

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
            title="Realm Arena"
            subtitle={subtitle}
            options={gs ? menuOptions : undefined}
            busy={loadingGame}
            log={{ entries: gameData?.gameState?.history ?? [], userIdList, oldestFirst: true, viewerId: myUserId, onReact: historyReact }}
            chat={{ gameId, userIdList, usernameList }}
            className="ag-game--realmarena"
        >
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && (
                <div className="ag-stat-row">
                    <Stat value={mustering ? 'Muster' : `${gs.round}/${gs.battleRounds}`} label={mustering ? 'Phase' : 'Round'} />
                    <Stat value={centre} label="Centre" />
                    <Stat value={gs.budget} label="Points each" />
                </div>
            )}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
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
                            sealed={placement?.picks ?? gs.myMuster}
                            seats={seats}
                            colourFor={colourFor}
                            nameFor={playerName}
                            selected={selected}
                            onSelect={tapFighter}
                            placing={placement && { zone: draft.zone, selected: placement.selected, onTap: draft.tap }}
                            aiming={turn && {
                                reach: turn.reach,
                                path: turn.path,
                                area: turn.area,
                                candidates: turn.candidates,
                                aimed: turn.targets,
                                flagged: turn.reactions.map(reaction => reaction.watcher.id),
                                onSquare: turn.tapSquare,
                            }}
                        />
                    </div>

                    {musterTurn && (
                        <RealmArenaMusterSheet draft={draft} budget={gs.budget} onMuster={muster} pending={pendingTarget === 'muster'} />
                    )}

                    {/* Nothing about anyone else's squad is on the wire until
                        every squad has mustered (§17.2), so there is nothing
                        to show here but who is mustering. */}
                    {mustering && !isMyTurn && !complete && mySeat >= 0 && (
                        <div className="ag-section">
                            <div className="ag-empty">
                                {gs.myMuster
                                    ? `Your squad is sealed. ${currentTurnName} is mustering, and you'll see each other's squads when they're done.`
                                    : `${currentTurnName} is mustering. You muster next, and neither squad is seen until both have.`}
                            </div>
                        </div>
                    )}

                    {battleTurn && lastEvents.length > 0 && (
                        <RealmArenaResults events={lastEvents} fighters={fighters} viewerId={myUserId} nameFor={playerName} />
                    )}

                    {battleTurn && !selected && (
                        <div className="ag-section">
                            <p className="ag-hint ag-hint--tight">Tap one of your squad on the board to act with it. Each has its own {ACTION_POINTS} AP.</p>
                        </div>
                    )}

                    {selected && (
                        <RealmArenaFighterCard fighter={selected} label={`${fighterName(fighters, selected)} · ${playerName(selected.owner)}`}>
                            {turn && <RealmArenaTurnSheet draft={turn} battle={battle} player={myUserId} nameFor={playerName} pendingTarget={pendingTarget} />}
                        </RealmArenaFighterCard>
                    )}

                    {battleTurn && (
                        <RealmArenaTurnEnd
                            fighters={fighters}
                            player={myUserId}
                            keepStill={keepStill}
                            onKeepStill={setKeepStill}
                            onEndTurn={endTurn}
                            pending={pendingTarget === 'endTurn'}
                            disabled={pendingTarget !== null}
                        />
                    )}
                </>
            )}
        </GameShell>
    );
}
