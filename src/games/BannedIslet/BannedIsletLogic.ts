import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IBannedIsletGameData, IBannedIsletPlayerState, IBannedIsletSpecificGameState } from "@/games/BannedIslet/BannedIsletModels";
import {
    ACTIONS_PER_TURN,
    CARDS_TO_CAPTURE,
    BannedIsletCardId,
    cardName,
    isTreasureCard,
    tileName,
    treasureName,
} from "@/games/BannedIslet/board";
import {
    capturableTreasureAt,
    isEscapeReady,
    legalMoves,
    legalShoreUps,
} from "@/games/BannedIslet/rules";
import { playerHistory, userToken } from "@/utils/games/history";
import { pluralize } from "@/utils/ui/text";

// ═══════════════════════════════════════════════════════════════════════════
//  BANNED ISLET
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/banned-islet.md §21.6 PR 3: the action phase. One parameterised
// BannedIsletAction covering all five verbs of §8, following §21.4's "four
// command classes, not fifteen", and every one of them decided by rules.ts
// rather than by re-deriving adjacency or capture eligibility here.
//
// The game is winnable and unloseable at this point, deliberately: the action
// economy is testable while nothing is fighting back. §4.2's four defeats all
// need an island that floods, which is PR 5's BannedIsletEndTurn, and the last
// clause of §4.1's win needs a Helicopter Lift to play, which is PR 8's
// BannedIsletPlayCard.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

function playerState(gs: IBannedIsletSpecificGameState, userId: string): IBannedIsletPlayerState | undefined {
    return gs.players.get(userId);
}

// §8 Move: one step to an orthogonally adjacent tile that is still there.
// `legalMoves` is the same list the client's action picker offers, so a move
// the picker wouldn't draw is a move Execute won't take (docs/new-game.md,
// "Isomorphic rules modules").
function applyMove(gs: IBannedIsletSpecificGameState, ps: IBannedIsletPlayerState, target: number): string | null {
    if (!legalMoves(gs.positions, ps.position).includes(target)) return null;
    const from = tileName(gs.positions[ps.position].tile);
    ps.position = target;
    return `moved from ${from} to ${tileName(gs.positions[target].tile)}`;
}

// §8 Shore Up: flip this tile or a neighbour from flooded back to dry — the
// only action in the game that gives ground back, and never one that un-sinks
// (§9.1). A dry target is illegal rather than a no-op (§16), which is exactly
// what `legalShoreUps` listing only the flooded ones expresses.
function applyShoreUp(gs: IBannedIsletSpecificGameState, ps: IBannedIsletPlayerState, target: number): string | null {
    if (!legalShoreUps(gs.positions, ps.position).includes(target)) return null;
    gs.positions[target].state = 'dry';
    return `shored up ${tileName(gs.positions[target].tile)}`;
}

// §8 Give a Treasure Card: the game's only transfer, and a face-to-face one —
// both pawns on the same tile. The Messenger (§12) is the exception that makes
// that rule matter and arrives with the rest of the roles in PR 7.
//
// Only a treasure card moves: §10's specials are played from their holder's
// own hand rather than traded, and Waters Rise! is never held at all.
function applyGiveCard(
    gs: IBannedIsletSpecificGameState,
    senderId: string,
    ps: IBannedIsletPlayerState,
    targetUserId: string | null,
    card: BannedIsletCardId | null,
): string | null {
    if (!targetUserId || targetUserId === senderId) return null;
    const target = playerState(gs, targetUserId);
    if (!target || target.position !== ps.position) return null;
    if (!card || !isTreasureCard(card)) return null;

    const index = ps.hand.indexOf(card);
    if (index < 0) return null;

    ps.hand.splice(index, 1);
    target.hand.push(card);
    return `gave their ${cardName(card)} card to ${userToken(targetUserId)}`;
}

// §8 Capture a Treasure: four matching cards, standing on either of that
// treasure's tiles. The treasure it claims is derived rather than named by the
// command — `capturableTreasureAt` already answers "which treasure, if any"
// for the action picker, so there is no second field for a client to disagree
// with. §8's discard happens as part of the action, which is why §16 can say a
// capture is free of hand-limit concerns.
function applyCapture(gs: IBannedIsletSpecificGameState, ps: IBannedIsletPlayerState): string | null {
    const treasure = capturableTreasureAt(gs.positions, ps.position, ps.hand, gs.treasures);
    if (!treasure) return null;

    for (let paid = 0; paid < CARDS_TO_CAPTURE; paid++) {
        ps.hand.splice(ps.hand.indexOf(treasure), 1);
        gs.treasureDiscard.push(treasure);
    }
    gs.treasures[treasure] = true;
    return `captured the ${treasureName(treasure)} at ${tileName(gs.positions[ps.position].tile)}`;
}

@serializable
export class BannedIsletGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "BannedIslet";
    friendlyName: string = "Banned Islet";
    icon: string = "";
    url: string = "bannedislet";
    readonly className: string = "BannedIsletGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const data = gameData as IBannedIsletGameData;
        const order = data.gameState.turnOrder;
        const next = order[(order.indexOf(data.currentTurn) + 1) % order.length];
        data.currentTurn = next;

        // §21.4: `actionsLeft` refills at the *start* of the new current
        // player's turn, not the end of the previous one — what lets a plan
        // cross from one player to the next without stalling on an exhausted
        // counter. The Pilot's once-a-turn flight (§12) resets the same way,
        // so PR 7 has nothing to add here.
        const nextPs = playerState(data.specificGameState, next);
        if (nextPs) {
            nextPs.actionsLeft = ACTIONS_PER_TURN;
            nextPs.pilotFlightUsed = false;
        }
    }

    CheckGameOver(gameData: IGameData): boolean {
        const data = gameData as IBannedIsletGameData;
        // §4.2's four defeats can only be detected mid-resolution, inside the
        // flood phase — they arrive in PR 5 and will mutate complete/endReason
        // there, the way Outbreak's endInTeamLoss does. This stays the
        // pass-through the command route calls after every command.
        if (data.complete) return true;

        const gs = data.specificGameState;
        const pawns = [...gs.players.values()].map(ps => ps.position);
        if (!isEscapeReady(gs.positions, gs.treasures, pawns)) return false;

        // §4.1: all four treasures aboard and the whole team on an unsunk
        // Beacon Pier. The fourth clause — a Helicopter Lift actually played —
        // is what makes this an action taken rather than a state reached, and
        // PR 8 moves the ending into BannedIsletPlayCard when the card exists
        // to play. Until then reaching the state is the win.
        //
        // A co-op result, so no single id can be the winner: finishGame reads
        // 'teamwin' as one shared ending for the whole roster.
        data.complete = true;
        data.winner = '';
        data.endReason = 'teamwin';
        data.currentTurn = '';
        data.gameState.history.unshift({ text: 'All four treasures are off the island and the team is clear of the water — they win!' });
        return true;
    }
}

// ─── BannedIsletAction ──────────────────────────────────────────────────────

/** §8's action catalogue, plus the two role kinds that aren't one of those (§21.4). The role kinds arrive with the roles themselves, in PR 7. */
export type BannedIsletActionKind = 'move' | 'shoreUp' | 'giveCard' | 'capture' | 'pass';

@serializable
export class BannedIsletAction implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    kind: BannedIsletActionKind = 'pass';
    /** move / shoreUp: the grid position to step onto or dry out. */
    target: number = -1;
    /** giveCard: the teammate the card moves to. */
    targetUserId: string | null = null;
    /** giveCard: which treasure card moves. A capture names no card — four of the tile's own is the only possible payment (§8). */
    cardId: BannedIsletCardId | null = null;
    readonly className = 'BannedIsletAction';

    // Player-facing summary for the turn-review scrubber (TurnNavControls),
    // shown next to the sender's name so it reads as "<name> · <this>". Built
    // from the command's own fields rather than the fuller history line
    // Execute writes, since those also name the tile the pawn came *from*,
    // which isn't knowable here.
    myString() {
        switch (this.kind) {
            case 'move': return 'moved';
            case 'shoreUp': return 'shored up a tile';
            case 'giveCard': return this.cardId ? `gave their ${cardName(this.cardId)} card to a teammate` : 'gave a card to a teammate';
            case 'capture': return 'captured a treasure';
            case 'pass': return 'passed';
            default: return 'took an action';
        }
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IBannedIsletGameData;
        const gs = data.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        // A turn held open for a hand-limit discard (§10) is not a turn that
        // can still act — the phase arrives with the draw, in PR 5.
        if (gs.phase !== 'actions') return INVALID;
        if (ps.actionsLeft <= 0) return INVALID;

        let historyLine: string | null;
        switch (this.kind) {
            case 'move':
                historyLine = applyMove(gs, ps, this.target);
                break;
            case 'shoreUp':
                historyLine = applyShoreUp(gs, ps, this.target);
                break;
            case 'giveCard':
                historyLine = applyGiveCard(gs, this.senderId, ps, this.targetUserId, this.cardId);
                break;
            case 'capture':
                historyLine = applyCapture(gs, ps);
                break;
            case 'pass':
                historyLine = `passed, forfeiting ${pluralize(ps.actionsLeft, 'action')}`;
                break;
            default:
                historyLine = null;
        }
        if (historyLine === null) return INVALID;

        // §8: every action costs one of the three — except Pass, which
        // forfeits the *rest* of them rather than one, which is the one place
        // this catalogue differs from Outbreak's.
        ps.actionsLeft = this.kind === 'pass' ? 0 : ps.actionsLeft - 1;
        data.gameState.history.unshift(playerHistory(this.senderId, historyLine));

        // Never ends the turn itself, even on the third action (§21.4): only
        // BannedIsletEndTurn may, and it is the only command in the game that
        // touches a deck. Folding Phase 2 and Phase 3 in here would fire the
        // flood deck inside a plan that nothing accounted for (§21.5).
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
