'use client'
import { use, useState } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IRealmArenaGameDataResponse } from "@/games/RealmArena/apiModels";
import RealmArenaBoard from "@/games/RealmArena/components/RealmArenaBoard";
import RealmArenaFighterCard from "@/games/RealmArena/components/RealmArenaFighterCard";
import { battlefieldById } from "@/games/RealmArena/maps";
import { centreHolders, isStanding } from "@/games/RealmArena/rules";
import GameShell from "@/components/ui/GameShell";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useHistoryReactions } from "@/utils/hooks/useHistoryReactions";
import { playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus, isPlayersTurn, nameForUserId, scoreboardSeatOrder } from "@/utils/ui/players";

/**
 * Realm Arena's board screen (docs/games/realm-arena.md §17.3 PR 5), read-only
 * for now: the battlefield, the squads on it, the scores, the round and whose
 * turn it is. Tapping a character selects it, brings the view to it and shows
 * what it can do. Mustering (PR 6) and taking a turn (PR 7) act on this same
 * screen; replay and recap arrive with PR 8's adapter.
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
    const currentUserWon = complete && !!myUserId && myUserId === gameData?.winner;
    const mustering = gs?.phase === 'muster';
    const fighters = gs?.fighters ?? [];
    const selected = fighters.find(fighter => fighter.id === selectedId);

    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
            subtitle = currentUserWon ? '🏆 You won!' : `${nameForUserId(gameData, gameData?.winner)} won`;
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
    const scoreEntries: ScoreEntry[] = gs
        ? scoreboardSeatOrder(gameData, myUserId).map((userId): ScoreEntry => {
            const squad = fighters.filter(fighter => fighter.owner === userId);
            const sub = mustering
                ? gs.mustered.includes(userId) ? '✔ mustered' : userId === gameData?.currentTurn ? 'mustering' : 'waiting'
                : `${squad.filter(isStanding).length}/${squad.length} standing`;
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
                        : currentUserWon ? 'You held the field! 🎉' : `${nameForUserId(gameData, gameData?.winner)} held the field.`}
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
                            sealed={gs.myMuster}
                            seats={seats}
                            colourFor={colourFor}
                            nameFor={playerName}
                            selectedId={selectedId}
                            onSelect={id => setSelectedId(current => current === id ? null : id)}
                        />
                    </div>

                    {selected && <RealmArenaFighterCard fighter={selected} ownerName={playerName(selected.owner)} />}
                </>
            )}
        </GameShell>
    );
}
