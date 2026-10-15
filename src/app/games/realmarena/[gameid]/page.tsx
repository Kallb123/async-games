'use client'
import { use, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IRealmArenaGameDataResponse, IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome, RealmArenaPartState } from "@/games/RealmArena/apiModels";
import type { AimFollow, Playback } from "@/games/RealmArena/components/RealmArenaBoard";
import RealmArenaPlayBoard from "@/games/RealmArena/components/RealmArenaPlayBoard";
import RealmArenaFighterCard from "@/games/RealmArena/components/RealmArenaFighterCard";
import RealmArenaMusterSheet from "@/games/RealmArena/components/RealmArenaMusterSheet";
import RealmArenaResults from "@/games/RealmArena/components/RealmArenaResults";
import RealmArenaTargets from "@/games/RealmArena/components/RealmArenaTargets";
import RealmArenaTurnEnd, { RealmArenaWatchSwitches } from "@/games/RealmArena/components/RealmArenaTurnEnd";
import RealmArenaTurnSheet, { actTarget, RealmArenaAim } from "@/games/RealmArena/components/RealmArenaTurnSheet";
import RealmArenaUnits from "@/games/RealmArena/components/RealmArenaUnits";
import { guide as realmArenaGuide } from "@/games/RealmArena/guide";
import { tutorial as realmArenaTutorial } from "@/games/RealmArena/tutorial";
import { useMusterDraft } from "@/games/RealmArena/useMusterDraft";
import { enemyNameOf, RA_SOLO_PARAM, REALM_ONLY } from "@/games/RealmArena/characters";
import { rematchFlag } from "@/utils/ui/rematch";
import { reachAfter, useTurnDraft } from "@/games/RealmArena/useTurnDraft";
import { battlefieldOf } from "@/games/RealmArena/maps";
import { ACTION_POINTS, armouredTeam, battleFrom, centreHolders, ENEMY_SIDE, isStanding, isWarband, sideScore, stoutTeam, TEAM_SIDE, warbandsFor, type Action, type BattleEvent, type Fighter } from "@/games/RealmArena/rules";
import { actionFollow, battleCues, centreInSight, endOf, coopColourOf, ENEMY_COLOUR, fighterName, friendlySquares, isFollowedPart, isUnplaced, partFollow, partLabel, reviewParts, STEP_BEAT_MS, STEP_MIN_MS, TEAM_COLOUR, TEAM_NAME, unseenSquares, waveLineOf, withPartState } from "@/games/RealmArena/ui";
import type { IRealmArenaOutcome } from "@/games/RealmArena/RealmArenaLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
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
import { usePrefersReducedMotion } from "@/utils/hooks/usePrefersReducedMotion";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { useScrollIntoViewOnOpen } from "@/utils/hooks/useScrollIntoViewOnOpen";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { RealmArenaAct, RealmArenaEndTurn, RealmArenaMuster, RealmArenaUndo } from "@/utils/apiModels/GameLogic";
import { tutorialRun } from "@/utils/ui/gameTutorials";
import { playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus, finishedGameCopy, isPlayersTurn, nameForUserId, scoreboardSeatOrder } from "@/utils/ui/players";
import { capitalise } from "@/utils/ui/text";

/** The viewer's own action or End turn played over the board as it comes back: one playback, or a co-op End turn's parts one after another (`index`), resting a beat between (`rested`). */
interface OwnPlayback {
    playbacks: { playback: Playback; follow: AimFollow | ReturnType<typeof actionFollow>; state?: RealmArenaPartState }[];
    index: number;
    rested: boolean;
}

/** The viewer's own playback once the board has played the one with `key`: the last let go of, an earlier part resting its beat before the next. */
function ownPlayed(current: OwnPlayback | null, key: string): OwnPlayback | null {
    if (current?.playbacks[current.index]?.playback.key !== key) return current;
    return current.index >= current.playbacks.length - 1 ? null : { ...current, rested: true };
}

/** How long past its end a part of the viewer's own playback waits to be told it has played, before it is let go of anyway: room for the glide to it, however slow. */
const OWN_STUCK_MS = 4000;

/** The sender's step for a command, as a review gets it (a co-op End turn's parts included), when the response carries one. */
const stepOf = (response: ICommandResponse): IRealmArenaStepOutcome | undefined => (response as { step?: IRealmArenaStepOutcome }).step;

/**
 * Realm Arena's board screen (docs/games/realm-arena.md §17.3 PR 5): the
 * battlefield, the squads on it, the scores, the round and whose turn it is.
 * Tapping a character selects it, brings the view to it and shows what it can
 * do. On their muster turn a player picks and places their squad here (PR 6),
 * and on a battle turn lines up each action on the board and sends it, sees
 * what it did as it comes back, and ends the turn (PR 7). A player coming
 * back to their turn is told what happened while they were away, and anyone
 * can step back through the match one action at a time, the view following
 * each action as it goes (PR 8), or press Play and watch it play itself
 * forward, every action animated in turn — a co-op End turn's warband acting
 * one action at a time, from the step's `parts` (§26.2).
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

    // With reduced motion the board draws no walk and no flight, so neither
    // takes any time in what it plays.
    const still = usePrefersReducedMotion();

    // Planning is out by design (§17.3 PR 8): every attack worth planning
    // needs a roll, and the turn sheet already shows the odds of one before
    // it's sent. So the review steps back through the match, and no further.
    const nav = useTurnNavigation<IRealmArenaSpecificGameStateResponse, IRealmArenaStepOutcome>(gameId, {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? '',
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? '',
        history: gameData?.gameState?.history ?? [],
    }, {
        // Play rests on a step until the page says it has played, every part
        // of an End turn included (`stepEnded`, below): the board says when
        // each part has, so play never moves on before it has.
        awaitsStepEnd: true,
    });
    const recap = useTurnRecap(gameId, { viewerId: user?.id, setGameData, getGameData });
    // The first-match welcome: the guided tour, with the guide behind it in ⋮.
    const gameIntro = useGameIntro('realmarena');

    // A step with parts (a co-op End turn holding the enemy's turn) is shown
    // one part at a time, whenever it is shown: each part's cues play over the
    // board as it left the part before, and the board is drawn as that part
    // left it (§26.2). Any other step is the one part. Live shows none.
    // A part moves on once it has played: the board says so (`played`, below)
    // and the part rests a beat. A part with nothing to play rests a moment
    // instead, and so does the opening step, which has no parts at all. Played
    // by hand a step's parts follow one another just the same; only its last
    // part going by ends a step, and only auto-play moves on from that.
    const previous = nav.previousSnapshot;
    const stepOutcome = nav.displayedOutcome;
    const stepFighters = nav.displayedState?.fighters;
    const stepMap = nav.displayedState?.map ?? '';
    const parts = useMemo(
        () => !nav.isLive && previous ? reviewParts(stepMap, stepOutcome, previous.specificGameState, stepFighters, { still }) : [],
        [nav.isLive, previous, stepMap, stepOutcome, stepFighters, still],
    );
    const stepNow = `${nav.mode}:${nav.viewIndex}`;
    const [reached, setReached] = useResettingState(0, stepNow);
    // The playback the board has told us has played, for the step on screen
    // only: a key left over from another step can't move this one on.
    const [playedKey, setPlayedKey] = useResettingState<string | null>(null, stepNow);
    const partIndex = Math.min(reached, Math.max(0, parts.length - 1));
    const part = parts[partIndex];
    const partKey = `step:${nav.viewIndex}:${partIndex}`;
    const partPlays = !nav.isLive && !!part && part.cues.length > 0;
    const lastPart = partIndex >= parts.length - 1;
    const { playing, stepEnded, viewIndex } = nav;
    useEffect(() => {
        if (nav.isLive || (partPlays && playedKey !== partKey)) return;
        const rested = setTimeout(() => {
            if (!lastPart) setReached(partIndex + 1);
            else if (playing) stepEnded(viewIndex);
        }, partPlays ? STEP_BEAT_MS : STEP_MIN_MS);
        return () => clearTimeout(rested);
    }, [nav.isLive, partPlays, playedKey, partKey, lastPart, partIndex, playing, stepEnded, viewIndex, setReached]);
    // What the viewer's own last action or End turn did, played over the board
    // as it comes back (§26.1), from where everyone stood — and the cover that
    // stood — when it was sent. An ordinary action is one playback. A co-op
    // End turn comes back with the warband's whole turn, and plays one part per
    // warband action, the same as the review does: each its own playback, its
    // own view and the board as that part left it (`state`, absent on the last,
    // whose board is the live one), one after another (`index`), resting a beat
    // between (`rested`, once the board has said the one on screen has played).
    // Gone once the board says the last has played (`played`, below) — and gone
    // on leaving live for a review, whether or not the board had played it, so
    // coming back doesn't play it again.
    // The view stays on the action itself while it plays — the target the
    // player picked, the route a move took, or whatever it touched —
    // rather than going where the selection or the board's resting view would
    // next take it, so a shot isn't played from further out than it was aimed
    // and a long walk doesn't start off the frame. That is worked out as the
    // action is sent, and goes when the playback does.
    const [own, setOwn] = useState<OwnPlayback | null>(null);
    // Reset during render rather than by `useResettingState`, whose value would
    // come back on returning to the mode it was held in.
    const [ownMode, setOwnMode] = useState(nav.mode);
    if (ownMode !== nav.mode) {
        setOwnMode(nav.mode);
        setOwn(null);
    }
    // Nor does it outlast the board: the recap screen takes the board's place,
    // and coming back from it shouldn't play the turn the recap has just told.
    if (recap.show && own) setOwn(null);
    const ownNow = own?.playbacks[own.index] ?? null;
    const ownRested = !!own?.rested;
    const ownIndex = own?.index ?? 0;
    useEffect(() => {
        if (!ownRested) return;
        const rested = setTimeout(() => {
            setOwn(current => current && current.index === ownIndex ? { ...current, index: ownIndex + 1, rested: false } : current);
        }, STEP_BEAT_MS);
        return () => clearTimeout(rested);
    }, [ownRested, ownIndex]);
    // What the part playing left on the board, over the snapshot's own, so the
    // board, the units, the scores and the stats all agree with what plays —
    // live, the part of the viewer's own End turn on screen.
    const viewed = nav.displayedState;
    const liveState = nav.isLive ? ownNow?.state : undefined;
    const gs = viewed && part ? withPartState(viewed, part.state) : viewed && liveState ? withPartState(viewed, liveState) : viewed;
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
    // Solo is co-op with a team of one (§30.6).
    const solo = coop && seats.length === 1;
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
    // In co-op, the viewer's own green, a teammate's blue and the enemy's red; else each player's own colour.
    const colourFor = (owner: string): string => coop ? coopColourOf(myUserId, owner) : playerColourForId(owner, userIdList);
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
    const draft = useMusterDraft(field, mySeat, gs?.budget ?? 0, gs?.mastery?.[myUserId] ?? {}, gs?.factions ?? REALM_ONLY, turnKey);
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
        command.faction = draft.faction;
        submitCommand(command, undefined, 'muster');
    };

    // A target picked from the turn sheet's list brings the view to it and
    // whoever is aiming at it, and keeps it there until the character acts,
    // another is selected, a box is tapped or a review is stepped into.
    const pickKey = `${turnKey}:${nav.isLive}:${refocus}:${selected ? `${selected.id}:${selected.square}:${selected.ap}:${selected.hp}` : ''}`;
    const [picked, setPicked] = useResettingState<AimFollow | null>(null, pickKey);

    // A battle turn: a run of actions, one command each so every result is
    // seen before the next is chosen, then the end of the turn (§17.2).
    // Not while a part of the viewer's own End turn is being played over the
    // board as it stood then: there is nothing to act on until it has played.
    const battleTurn = !!gs && !mustering && isMyTurn && !liveState;
    // In fog of war, the battle as the viewer's squad sees it (§27): the
    // response holds only who it can see, and the clouds it can see whose
    // throwers it can't. The fog lifts once the battle is over.
    const fogged = !!gs?.fog && !complete;
    const clouds = gs?.clouds ?? [];
    const battle = battleFrom(field, { fighters, fog: fogged, clouds, seats, coop, rulesVersion: gs?.rulesVersion, armoured: armouredTeam(gs?.mission, gs?.rulesVersion, gs?.enemy) });
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
    const ownPlayback = ownNow?.playback ?? null;
    const play = (key: string, events: BattleEvent[], after: readonly Fighter[], step?: IRealmArenaStepOutcome) => {
        // A response that lands once the viewer has gone to the review is played
        // nowhere: back in live, it is simply the board as it stands.
        if (!nav.isLive) return;
        if (step?.parts?.length) {
            // A co-op End turn: one playback per warband action, each from the
            // board the part before it left. A part with nothing to play is
            // dropped; the next one's `before` already chains from its board.
            const friendlyAfter = (state: readonly Fighter[]) => friendlySquares(state, myUserId, coop);
            const entries = reviewParts(map, step, { fighters, blasted: gs?.blasted ?? [] }, after, { still })
                .filter(part => part.cues.length > 0)
                .map((part, i) => {
                    const partKey = `${key}:${i}`;
                    const left = part.state?.fighters ?? after;
                    return {
                        playback: { key: partKey, cues: part.cues, events: part.events, field: part.field, before: part.before.fighters },
                        follow: partFollow(part, left, friendlyAfter(left), false, partKey, still),
                        state: part.state,
                    };
                });
            return setOwn(entries.length > 0 ? { playbacks: entries, index: 0, rested: false } : null);
        }
        const cues = battleCues(field, events, fighters, after, { still });
        if (cues.length === 0) return setOwn(null);
        const to = picked ?? actionFollow(field, events, fighters, after, `play:${key}`, still);
        setOwn({ playbacks: [{ playback: { key, cues, events, field, before: fighters }, follow: to }], index: 0, rested: false });
    };
    // The board has played the playback with this key through to its end (the
    // view's glide to it included): live, that is the viewer's own action, which
    // is let go — or, of a co-op End turn's parts, one that rests its beat before
    // the next; in a review, it is the part on screen, which then rests its beat.
    const played = (key: string) => {
        if (nav.isLive) setOwn(current => ownPlayed(current, key));
        else setPlayedKey(key);
    };
    // A part the board never says has played — a view that never lands, say —
    // is let go of anyway, a while after it should have ended, so the turn's
    // controls, hidden while a part of the viewer's own End turn plays, can't
    // stay hidden.
    const ownKey = ownNow?.playback.key;
    const ownEnd = ownNow ? endOf(ownNow.playback.cues) : 0;
    useEffect(() => {
        if (!ownKey) return;
        const stuck = setTimeout(() => setOwn(current => ownPlayed(current, ownKey)), ownEnd + OWN_STUCK_MS);
        return () => clearTimeout(stuck);
    }, [ownKey, ownEnd]);
    const act = (action: Action) => {
        const command = new RealmArenaAct();
        command.action = action;
        submitCommand(command, response => {
            const events = (response.outcome as IRealmArenaOutcome).events ?? [];
            setLastEvents(events);
            play(command.id, events, (response.gameData as IRealmArenaGameDataResponse).specificGameState.fighters, stepOf(response));
            // A character with nothing left to do this turn — its last AP spent,
            // on watch, hunkered down or knocked out on the way — is let go of.
            const after = (response.gameData as IRealmArenaGameDataResponse).specificGameState.fighters.find(fighter => fighter.id === action.fighter);
            if (!after || after.ap === 0 || !isStanding(after)) setSelectedId(current => current === action.fighter ? null : current);
        }, actTarget(action));
    };
    const turn = useTurnDraft(battle, myUserId, actor, turnKey, act);
    const focusTarget = (target: Fighter) => {
        if (selected) setPicked({ aim: { caster: selected.square, target: target.square }, key: `target:${target.id}:${Date.now()}` });
    };
    const endTurn = () => {
        // AP left unspent is a turn ended by mistake as often as on purpose,
        // so it's asked about — even where it would go on watch.
        const unspent = fighters.filter(fighter => fighter.owner === myUserId && isStanding(fighter) && fighter.ap > 0);
        if (unspent.length > 0) {
            const left = unspent.map(fighter => `${capitalise(fighterName(fighters, fighter))} (${fighter.ap} AP)`).join(', ');
            if (!window.confirm(`Still to spend: ${left}. End your turn anyway?`)) return;
        }
        const command = new RealmArenaEndTurn();
        command.keepStill = keepStill;
        // Burning, as the next player's turn begins (§20.2).
        submitCommand(command, response => play(command.id, (response.outcome as IRealmArenaOutcome).events ?? [], (response.gameData as IRealmArenaGameDataResponse).specificGameState.fighters, stepOf(response)), 'endTurn');
    };
    // What the undone action did is no longer what happened, so its results go too.
    const undo = () => submitCommand(new RealmArenaUndo(), () => {
        setLastEvents([]);
        setOwn(null);
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
    const reach = nav.isLive && !liveState && selected && selected.owner === myUserId && isStanding(selected) && !mustering && !complete
        ? reachAfter(battle, selected, turn?.after)
        : null;

    // Stepping through the match, the view goes to each action as it comes.
    // A move is framed over the whole path the viewer saw of it (`moveFrame`),
    // as close as all of it fits — a route round a wall included, and where in
    // fog of war it came into sight or went out of it, just the stretch they
    // saw; a walk too long to frame is followed instead (`track`): framed where
    // it starts, with the camera keeping the walker in the middle as it goes.
    // Anything else is framed just fit and close round whoever acted and
    // whoever it reached (`toldSquares`), as a target picked to aim at is, live
    // or in a review — or, told nothing that places it, every character it
    // changed, as deep as they all still fit. A step that handed the turn on
    // moved everyone's AP, not anyone in particular — and so for the hand-off
    // part of an End turn, but not for the enemy's actions before it, which
    // are followed. One that ended the battle hands it to nobody, and is
    // followed: it's the blow that decided it. Where there's nothing to
    // follow, or what a step touched is spread over more than half the
    // battlefield (`spreadWide`), the view goes to the viewer's own side
    // instead, just fit, rather than out to the whole board; a move is always
    // kept, since it's known. Live, it goes to a target picked from the turn
    // sheet's list instead, and while the viewer's own action plays, to that.
    // Each part is its own key, so the view glides again for each. The viewer's
    // own co-op End turn is followed the same way, a part at a time (`play`).
    const friendly = friendlySquares(fighters, myUserId, coop);
    const handedOn = !!previous && previous.currentTurn !== currentTurn && currentTurn !== '';
    const followed = !!part && isFollowedPart(part, handedOn);
    const stepKey = `${nav.viewIndex}:${partIndex}`;
    const follow = !nav.isLive
        ? !previous || !part ? null : partFollow(part, fighters, friendly, handedOn, stepKey, still)
        : ownNow?.follow ?? picked;
    // A followed step the board can't point to — something happened out of
    // sight, which cost the viewer something they were told of — says so with
    // a "?" over the board for as long as it is shown, while the view rests on
    // the viewer's own side as above. Never live.
    const unplaced = !nav.isLive && previous && part && isUnplaced(part, fighters, followed) ? stepKey : null;
    // And plays what each step — each part of one — did as it's stepped to
    // (§26.1), whoever took it.
    const playback: Playback | null = nav.isLive ? ownPlayback
        : partPlays ? { key: partKey, cues: part.cues, events: part.events, field: part.field, before: part.before.fighters } : null;
    // Which part of the step the dock says it is on, for a step with several.
    const stepDetail = parts.length > 1 ? partLabel(parts, partIndex, enemyName) : undefined;

    // Playing the review brings the board into view as it starts — from the
    // dock's Play or the recap screen's replay, whose board mounts a moment
    // after. The top bar sticks and the dock is pinned, so the board is
    // scrolled to below the one (`scroll-margin-top`) and above the other.
    const boardRef = useScrollIntoViewOnOpen(nav.playing && !!gs);

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
    const enemyStanding = standingLine(fighters.filter(fighter => isWarband(fighter.owner)), fogged);
    // In Hold Out the enemy's line also says when its next wave comes (§30.3)
    // and how many it brings (§30.11). The round before it lands, the board
    // lights up where it will.
    const waveDue = gs?.nextWave !== undefined && gs.nextWave.round === gs.round + 1;
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
            sub: mustering ? 'musters last' : gs.mission === 'holdOut' && !complete ? `${enemyStanding} · ${waveLineOf(gs.nextWave, gs.round)}` : enemyStanding,
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
                replay={myUserId ? {
                    label: '▶︎ Replay from your last turn',
                    onClick: () => {
                        recap.dismiss();
                        nav.playFromLastTurnOf(myUserId);
                    },
                } : undefined}
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
                    // A solo battle has nobody to invite again, so its rematch comes back to Solo.
                    extraParams={solo ? rematchFlag(RA_SOLO_PARAM, true) : undefined}
                />
            )}

            {gs && (
                <>
                    <div className="ag-board-area" ref={boardRef}>
                        <RealmArenaPlayBoard
                            field={field}
                            fighters={fighters}
                            fogGhosts={gs.ghosts}
                            unseen={unseen}
                            clouds={clouds}
                            sides={battle.sides}
                            sealed={placement?.picks ?? gs.myMuster}
                            owners={coop ? [...seats, ...warbandsFor(seats)] : seats}
                            waveDue={waveDue}
                            showCentre={gs.mission !== 'holdOut'}
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
                                hpChange: turn.hpChange,
                                flagged: turn.reactions.map(reaction => reaction.watcher.id),
                                onSquare: turn.tapSquare,
                            }}
                            refocus={refocus}
                            acting={!mustering && !complete ? currentTurn : null}
                            follow={follow}
                            // Nothing selected, picked up or followed rests on the viewer's
                            // own side: how the board opens, and where it comes back to on
                            // returning to live. Letting a character go — deselecting it, or
                            // the page doing so after its last AP — comes back here too:
                            // that's the "doesn't know where to zoom" case. The key holds
                            // for the mode, so the frame doesn't jitter as units move.
                            home={{ squares: friendly, key: `home:${nav.mode}` }}
                            odds={reach?.options}
                            coverAt={reach?.previewing ? turn?.after?.square : null}
                            overlay={reach && <RealmArenaTargets reach={reach} fighters={fighters} viewerId={myUserId} nameFor={playerName} />}
                            playback={playback}
                            onPlayed={played}
                            unplaced={unplaced}
                        />
                    </div>

                    {/* What's used most sits nearest the board (§17.3 PR 7):
                        End turn, then whatever is lined up and who it could be
                        aimed at, then the selected character's actions, all
                        ahead of the squad. */}
                    {battleTurn && (
                        <div className="ag-section ag-stack">
                            <RealmArenaTurnEnd
                                onEndTurn={endTurn}
                                onDeselect={selected ? () => setSelectedId(null) : undefined}
                                canUndo={gs.canUndo}
                                onUndo={undo}
                                undoPending={pendingTarget === 'undo'}
                                pending={pendingTarget === 'endTurn'}
                                disabled={pendingTarget !== null}
                            />
                            {turn
                                ? <RealmArenaAim draft={turn} battle={battle} player={myUserId} nameFor={playerName} pendingTarget={pendingTarget} onFocus={focusTarget} />
                                : <p className="ag-hint">Tap one of your units below, or on the board, to act with it. Each has its own {ACTION_POINTS} AP.</p>}
                        </div>
                    )}

                    {selected && (
                        <RealmArenaFighterCard fighter={selected} battle={battle} label={`${fighterName(fighters, selected)} · ${playerName(selected.owner)}`}>
                            {turn && <RealmArenaTurnSheet draft={turn} battle={battle} player={myUserId} pendingTarget={pendingTarget} />}
                        </RealmArenaFighterCard>
                    )}

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
                                {solo
                                    ? `You fight alone against ${gs.enemy ? enemyName : 'an unknown enemy, drawn at random'}, with a warband of theirs opposite you.`
                                    : gs.enemy
                                    ? `You fight together against ${enemyName}, with a warband of theirs opposite each of you.`
                                    : 'You fight together against an unknown enemy, drawn at random: you\'ll learn who it is when one of its characters is first seen.'}
                            </p>
                        </div>
                    )}

                    {musterTurn && (
                        <RealmArenaMusterSheet draft={draft} budget={gs.budget} colour={colourFor(myUserId)} onPick={pickUp} onMuster={muster} pending={pendingTarget === 'muster'} stout={stoutTeam(gs.mission, gs.rulesVersion)} />
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

                    {battleTurn && (
                        <RealmArenaWatchSwitches fighters={fighters} player={myUserId} keepStill={keepStill} onKeepStill={setKeepStill} disabled={pendingTarget !== null} />
                    )}

                    <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} canPlay userIdList={userIdList} stepDetail={stepDetail} />
                </>
            )}
        </GameShell>
    );
}
