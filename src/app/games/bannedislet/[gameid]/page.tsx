'use client'
import { use, useState } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { BannedIsletAction, IBannedIsletFloodPhaseOutcome } from "@/utils/apiModels/GameLogic";
import type { IBannedIsletGameDataResponse, IBannedIsletSpecificGameStateResponse } from "@/games/BannedIslet/apiModels";
import BannedIsletBoard from "@/games/BannedIslet/components/BannedIsletBoard";
import BannedIsletActions, { BannedIsletPick } from "@/games/BannedIslet/components/BannedIsletActions";
import BannedIsletHands from "@/games/BannedIslet/components/BannedIsletHands";
import BannedIsletFloodDiscard from "@/games/BannedIslet/components/BannedIsletFloodDiscard";
import BannedIsletEndTurnScreen from "@/games/BannedIslet/components/BannedIsletEndTurnScreen";
import GameShell from "@/components/ui/GameShell";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameGuideModal from "@/components/ui/GameGuideModal";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import ReadOnlyPanel from "@/components/ui/ReadOnlyPanel";
import Stat from "@/components/ui/Stat";
import TurnNavControls from "@/components/games/TurnNavControls";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useGameGuide } from "@/utils/hooks/useGameGuide";
import { useHistoryReactions } from "@/utils/hooks/useHistoryReactions";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { SubmitCommand, useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { ACTIONS_PER_TURN, HAND_LIMIT, LOSING_WATER_LEVEL, POSITION_COUNT, roleDef, tileName, BannedIsletTileId } from "@/games/BannedIslet/board";
import {
    IBannedIsletFloodLogEntry,
    giveCardTargets,
    moveTargets,
    navigatorMoveTargets,
    pilotFlightAvailable,
    pilotFlightTargets,
    positionOfTile,
    shoreUpTargets,
    shoreUpsPerAction,
} from "@/games/BannedIslet/rules";
import { guideForGame } from "@/utils/ui/gameGuides";
import { playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus, isPlayersTurn, nameForUserId, scoreboardSeatOrder } from "@/utils/ui/players";

// docs/games/banned-islet.md §21.6 PR 4: the board screen, first pass — enough
// of the island on screen to play §8's action phase by hand, so every PR after
// this one is playtestable as it lands. Built in the shape of Outbreak's board
// page, which is to say almost entirely out of the shared kit: the shell, the
// scoreboard, the stat row, the options menu, the finish banner and the turn
// scrubber are all the same components every other game wears, re-tinted under
// `.ag-game--bannedislet` rather than rebuilt.
//
// PR 5 adds the two phases the player doesn't control, and with them the two
// screens this page deferred: the end-of-turn reveal — the moment §1's pitch
// is actually delivered, so it is a screen rather than a prompt — and the
// flood discard, which §21.4 is emphatic must be rendered rather than hidden,
// because reading it is the one skill §14.2 rewards.
//
// One thing is still deliberately missing, with a PR of its own: **no recap**.
// `useTurnRecap`/`TurnRecapScreen` are the away-time narrative and arrive with
// `recap.ts`. The scrubber below is a different thing and does work today —
// `recapAvailable` says the opening island has been stored since setup, and PR
// 5 registered the replay adapter that turns it into a timeline. It stays
// wired with `canPlan={false}` until the route planner opts this game in.
export default function GameBannedIslet({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IBannedIsletGameDataResponse>(gameId);
    const historyReact = useHistoryReactions(gameId, user?.id, setGameData, getGameData);
    const { submitCommand: rawSubmitCommand, submitting, pendingTarget } = useSubmitCommand<IBannedIsletGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    // The end-of-turn reveal: whichever command ran the flood phase hands back
    // what the sea did on its own outcome (IBannedIsletFloodPhaseOutcome) —
    // BannedIsletEndTurn, or the BannedIsletDiscard that closed the same turn.
    // Every submit goes through this one wrapper so it is caught whichever
    // control fired it.
    const [turnResult, setTurnResult] = useState<IBannedIsletFloodLogEntry[] | null>(null);
    const submitCommand: SubmitCommand = (command, callback, target) =>
        rawSubmitCommand(command, (r) => {
            const floodLog = (r.outcome as IBannedIsletFloodPhaseOutcome).floodLog;
            if (floodLog?.length) setTurnResult(floodLog);
            callback?.(r);
        }, target);

    // Turn review steps back through the match's real actions (one per played
    // command, not one per turn); the board, the hands and the log all render
    // whichever point is being viewed.
    const nav = useTurnNavigation<IBannedIsletSpecificGameStateResponse>(gameId, {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    });
    const recapAvailable = gameData?.recapAvailable ?? false;

    // The "how to play" popup: shown automatically the first time this account
    // opens a Banned Islet match, and on demand from the game-options menu.
    // The guide itself is written in a later PR — until it exists there is
    // nothing to open, so neither the modal nor its menu row draws.
    const gameGuide = useGameGuide('bannedislet');
    const guide = guideForGame('bannedislet');

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    const displayedCurrentTurn = nav.displayedCurrentTurn;
    const isMyTurn = isPlayersTurn(nav.isLive, user, displayedCurrentTurn) && !complete;
    const myUserId = user?.id ?? '';
    const usernameList = gameData?.usernameList ?? [];
    const userIdList = gameData?.userIdList ?? [];
    // The running order is dealt at setup and need not match userIdList's join
    // order — the hands and the scoreboard both need the real one.
    const turnOrder = gameData?.gameState?.turnOrder ?? [];
    const scoreboardOrder = scoreboardSeatOrder(gameData, myUserId);
    const me = gs?.playerStates[myUserId];

    // Which tile-picking action is armed, if any — and, for the two that act on
    // something other than the viewer's own pawn, what they are acting on (§12).
    // Reset whenever the turn changes, so a stale pick never lingers into
    // somebody else's turn.
    const [pick, setPick] = useResettingState<BannedIsletPick | null>(null, `${displayedCurrentTurn}`);

    // Which tile a tapped flood-discard card is ringing on the island right
    // now — purely a lookup aid on a board of 24 shuffled names, reset
    // alongside the pick above so a stale ring never carries into somebody
    // else's turn.
    const [highlightedTile, setHighlightedTile] = useResettingState<BannedIsletTileId | null>(null, `${displayedCurrentTurn}`);

    // The only legality questions this screen asks, all of them asked of
    // rules.ts and every one of them given my own role — so the tiles the board
    // lights up are exactly the ones `Execute` would accept, roles included
    // (docs/new-game.md, "Isomorphic rules modules"). The counts feed the action
    // sheet's rows and the sets feed the board's tappable tiles, so the two can
    // never disagree about what a Pilot or an Engineer may do.
    const moveReach = gs && me ? moveTargets(gs.positions, me.position, me.role) : [];
    const shoreReach = gs && me ? shoreUpTargets(gs.positions, me.position, me.role) : [];
    const flightReach = gs && me && pilotFlightAvailable(me.role, me.pilotFlightUsed)
        ? pilotFlightTargets(gs.positions, me.position)
        : [];
    // §8 / §12: who I can hand a treasure card to — my own tile, or anywhere at
    // all if I am the Messenger.
    const giveMates = gs && me
        ? giveCardTargets(Object.values(gs.playerStates).map(p => ({ userId: p.userId, position: p.position })), myUserId, me.role)
        : [];
    // §12 Navigator: how far each teammate's own pawn could be sent, keyed by
    // seat — both the rows that offer it and the tiles the board lights up once
    // one is chosen.
    const navigatorReach: Record<string, number[]> = {};
    if (gs && me && me.role === 'navigator') {
        for (const p of Object.values(gs.playerStates)) {
            if (p.userId === myUserId) continue;
            navigatorReach[p.userId] = navigatorMoveTargets(gs.positions, p.position, p.role);
        }
    }

    function positionsFor(current: BannedIsletPick): number[] {
        switch (current.mode) {
            case 'move': return moveReach;
            // §12 Engineer, mid-pick: the tile already banked is not offered a
            // second time — one action dries two *different* tiles.
            case 'shoreUp': return current.first === undefined ? shoreReach : shoreReach.filter(p => p !== current.first);
            case 'pilotFlight': return flightReach;
            case 'navigatorMove': return current.userId ? navigatorReach[current.userId] ?? [] : [];
        }
    }

    const validPositions = new Set<number>(!isMyTurn || !pick ? [] : positionsFor(pick));

    function sendAction(apply: (cmd: BannedIsletAction) => void, target: string) {
        const cmd = new BannedIsletAction();
        apply(cmd);
        submitCommand(cmd, () => setPick(null), target);
    }

    function handlePositionClick(position: number) {
        if (!pick || !me) return;
        // §12 Engineer: the first tap banks a tile and the board keeps asking,
        // because one action dries two. It only waits when there is a second
        // tile to wait for — otherwise the tap is the whole shore up, and
        // `applyShoreUp` treats a missing second target as "up to two".
        if (pick.mode === 'shoreUp' && pick.first === undefined
            && shoreUpsPerAction(me.role) > 1 && shoreReach.length > 1) {
            setPick({ mode: 'shoreUp', first: position });
            return;
        }
        sendAction(cmd => {
            cmd.kind = pick.mode;
            cmd.target = pick.first ?? position;
            if (pick.first !== undefined) cmd.secondTarget = position;
            if (pick.mode === 'navigatorMove') cmd.targetUserId = pick.userId ?? null;
        }, pick.mode);
    }

    let boardTag: string | null = null;
    if (isMyTurn && pick && gs) {
        switch (pick.mode) {
            case 'move': boardTag = 'Choose a tile to move to'; break;
            case 'pilotFlight': boardTag = 'Choose any tile on the island to fly to'; break;
            case 'navigatorMove':
                boardTag = `Choose where to send ${pick.userId ? nameForUserId(gameData, pick.userId) : 'them'}`;
                break;
            case 'shoreUp':
                boardTag = pick.first === undefined
                    ? 'Choose a flooded tile to shore up'
                    : `Choose a second flooded tile to dry with ${tileName(gs.positions[pick.first].tile)}`;
                break;
        }
    }

    const currentTurnUsername = nameForUserId(gameData, displayedCurrentTurn);
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, nameForUserId(gameData, gameData?.forfeitedBy));

    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
            subtitle = gameData?.endReason === 'teamloss' ? '💀 The team lost' : '🎉 The team escaped!';
        } else if (isMyTurn && gs.phase === 'discard') {
            subtitle = <span className="ag-hi">Discard down to {HAND_LIMIT}</span>;
        } else if (isMyTurn) {
            subtitle = <><span className="ag-hi">Your move</span> · {me?.actionsLeft ?? 0} actions left</>;
        } else {
            subtitle = <>{currentTurnUsername}&apos;s move</>;
        }
    }

    const scoreEntries: ScoreEntry[] = gs
        ? scoreboardOrder.flatMap((userId): ScoreEntry[] => {
            const ps = gs.playerStates[userId];
            if (!ps) return [];
            const isActive = userId === displayedCurrentTurn && !complete;
            return [{
                id: userId,
                name: userId === myUserId ? 'You' : ps.username,
                color: playerColourForId(userId, userIdList),
                sub: roleDef(ps.role).name,
                // Actions left reads as a score only on the seat whose turn it
                // is; everyone else is holding a full three they can't spend.
                score: isActive ? `${ps.actionsLeft}/${ACTIONS_PER_TURN}` : '—',
                isMe: userId === myUserId,
                isActive,
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

    const tilesLeft = gs ? gs.positions.filter(p => p.state !== 'sunk').length : 0;

    // The end-of-turn reveal: what the draw and flood phases just did to the
    // island, shown once before the board moves on to whoever is up now.
    if (turnResult && gs) {
        return (
            <BannedIsletEndTurnScreen
                floodLog={turnResult}
                playerStates={gs.playerStates}
                userIdList={userIdList}
                tileAt={position => tileName(gs.positions[position].tile)}
                onDismiss={() => setTurnResult(null)}
            />
        );
    }

    return (
        <GameShell
            title="Banned Islet"
            subtitle={subtitle}
            options={gs ? menuOptions : undefined}
            syncing={submitting}
            log={{ entries: nav.displayedHistory, userIdList, viewerId: myUserId, onReact: nav.isLive ? historyReact : undefined }}
            chat={{ gameId, userIdList, usernameList }}
            className="ag-game--bannedislet"
        >
            <FcmTokenComp />

            {guide && gameGuide.open && <GameGuideModal guide={guide} onClose={gameGuide.closeGuide} />}

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && (
                <>
                    <div className="ag-stat-row">
                        <Stat value={`${gs.waterLevel}/${LOSING_WATER_LEVEL}`} label="Water level" />
                        <Stat value={`${tilesLeft}/${POSITION_COUNT}`} label="Tiles left" />
                    </div>

                    {complete && (
                        <GameFinishBanner
                            message={abandoned
                                ? abandoned.message
                                : gameData?.endReason === 'teamloss'
                                    // Which of §4.2's four defeats it was, in
                                    // the words the game logged it in. The
                                    // generic line is only the fallback for a
                                    // game that ended before one was recorded.
                                    ? gameData.endDetail
                                        ? `The team lost — ${gameData.endDetail}.`
                                        : 'The sea took the island.'
                                    : 'Four relics off a sinking island, and everyone aboard! 🎉'}
                            gameId={gameId}
                            gameUrl="bannedislet"
                            usernameList={usernameList}
                            userIdList={userIdList}
                            myUserId={myUserId}
                            turnTimer={gameData?.turnTimer}
                        />
                    )}

                    <div className="ag-board-area">
                        <BannedIsletBoard
                            positions={gs.positions}
                            playerStates={gs.playerStates}
                            userIdList={userIdList}
                            treasures={gs.treasures}
                            validPositions={validPositions}
                            onPositionClick={isMyTurn && !submitting ? handlePositionClick : undefined}
                            boardTag={boardTag}
                            activeUserId={complete ? null : displayedCurrentTurn}
                            highlightedPosition={highlightedTile ? positionOfTile(gs.positions, highlightedTile) : null}
                        />
                    </div>

                    {!complete && (
                        <ReadOnlyPanel readOnly={!isMyTurn}>
                            <BannedIsletActions
                                gs={gs}
                                // Off-turn the sheet still reads from the
                                // viewer's own seat — what *they* will be able
                                // to do — rather than the current player's.
                                myUserId={myUserId}
                                isMyTurn={isMyTurn}
                                pick={pick}
                                onPickChange={setPick}
                                targetCounts={{
                                    move: moveReach.length,
                                    shoreUp: shoreReach.length,
                                    pilotFlight: flightReach.length,
                                }}
                                giveMates={giveMates}
                                navigatorReach={navigatorReach}
                                onShoreUpFirstOnly={first => sendAction(cmd => {
                                    cmd.kind = 'shoreUp';
                                    cmd.target = first;
                                }, 'shoreUp')}
                                submitCommand={submitCommand}
                                pendingTarget={pendingTarget}
                                submitting={submitting}
                            />
                        </ReadOnlyPanel>
                    )}

                    {/* The team's only forecast (§14.2), and public by §21.4 —
                        every card in it is a tile the sea has already bitten,
                        and the next Waters Rise! puts the whole pile back on
                        top of the deck. */}
                    <BannedIsletFloodDiscard
                        floodDiscard={gs.floodDiscard}
                        positions={gs.positions}
                        floodDeckCount={gs.floodDeckCount}
                        onTileTap={tile => setHighlightedTile(highlightedTile === tile ? null : tile)}
                        highlightedTile={highlightedTile}
                    />

                    {/* Every hand is public (§2), so these are outside the
                        ReadOnlyPanel above: there is nothing here to take out
                        of play on anybody's turn. */}
                    <BannedIsletHands
                        playerStates={gs.playerStates}
                        userIdList={userIdList}
                        turnOrder={turnOrder}
                        myUserId={myUserId}
                        activeUserId={complete ? null : displayedCurrentTurn}
                    />

                    {recapAvailable && (
                        <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} userIdList={userIdList} />
                    )}
                </>
            )}
        </GameShell>
    );
}
