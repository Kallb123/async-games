'use client'
import React from 'react';
import ActionButton from '@/components/ui/ActionButton';
import BuildRow, { BuildRowProps } from '@/components/ui/BuildRow';
import PendingTag from '@/components/ui/PendingTag';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import { useResettingState } from '@/utils/hooks/useResettingState';
import { BannedIsletAction, BannedIsletDiscard, BannedIsletEndTurn } from '@/utils/apiModels/GameLogic';
import type { IBannedIsletSpecificGameStateResponse } from '@/games/BannedIslet/apiModels';
import {
    CARDS_TO_CAPTURE,
    HAND_LIMIT,
    cardGlyph,
    cardName,
    isTreasureCard,
    tileName,
    treasureGlyph,
    treasureName,
    BannedIsletCardId,
} from '@/games/BannedIslet/board';
import { countCards, treasureAt } from '@/games/BannedIslet/rules';
import { pluralize } from '@/utils/ui/text';

/** The two actions that need a tile picked on the board before they can be sent (§8). */
export type BannedIsletBoardMode = 'move' | 'shoreUp';

// Every choice in this sheet is one shared `BuildRow`, described as data so a
// sixth kind of action is a line in an array rather than another copy of the
// markup — and so the two lists below (the actions, and the cards a give
// offers) render through the same thing.
type ActionRow = BuildRowProps & { key: string };

function ActionRows({ rows }: { rows: ActionRow[] }) {
    return (
        <div className="ag-build-list">
            {rows.map(({ key, ...row }) => <BuildRow key={key} {...row} />)}
        </div>
    );
}

interface DiscardPickerProps {
    hand: BannedIsletCardId[];
    submitCommand: SubmitCommand;
    pendingTarget: string | null;
    submitting: boolean;
}

/**
 * The hand-limit discard (§10): pick the cards to let go of, and sending them
 * closes the turn the draw left open.
 *
 * Chosen by **position in the hand** rather than by card id, because §10's
 * cards carry no serial number — five Ember Crown cards are five of the same
 * card, and a player trimming a hand of four of them is choosing which two
 * copies go, which an id-keyed selection cannot express. The command takes the
 * ids back out at send time, where a repeated id means "two of those".
 *
 * Every row is the shared `BuildRow` the rest of this sheet is built from, so
 * a card in the picker and a card in a Give looks and behaves the same way.
 */
function DiscardPicker({ hand, submitCommand, pendingTarget, submitting }: DiscardPickerProps) {
    // Keyed on the hand itself, so the selection clears the moment the discard
    // lands (and the next player's turn can never inherit one).
    const [chosen, setChosen] = useResettingState<number[]>([], hand.join(','));
    const mustDiscard = Math.max(0, hand.length - HAND_LIMIT);
    const enough = chosen.length === mustDiscard;

    return (
        <div className="ag-actionsheet">
            <p className="ag-action-hint" style={{ marginTop: 0 }}>
                🗂 You are holding {hand.length} cards. Let {pluralize(mustDiscard, 'card')} go to get back to the {HAND_LIMIT}-card limit.
            </p>
            <ActionRows rows={hand.map((card, index) => {
                const selected = chosen.includes(index);
                return {
                    key: `${card}-${index}`,
                    icon: cardGlyph(card),
                    name: cardName(card),
                    active: selected,
                    disabled: submitting,
                    tag: selected ? 'Letting go' : 'Keep',
                    tagMuted: !selected,
                    onClick: () => setChosen(selected ? chosen.filter(i => i !== index) : [...chosen, index]),
                };
            })} />
            <ActionButton
                className="ag-btn ag-btn--primary ag-btn--block"
                style={{ marginTop: 10 }}
                disabled={!enough || submitting}
                pending={pendingTarget === 'discard'}
                pendingLabel="Discarding…"
                onClick={() => {
                    const cmd = new BannedIsletDiscard();
                    cmd.cardIds = chosen.map(index => hand[index]);
                    submitCommand(cmd, undefined, 'discard');
                }}
            >
                {enough ? `Discard ${pluralize(chosen.length, 'card')}` : `Pick ${mustDiscard - chosen.length} more`}
            </ActionButton>
        </div>
    );
}

interface BannedIsletActionsProps {
    gs: IBannedIsletSpecificGameStateResponse;
    myUserId: string;
    /**
     * Whether the viewer is the one actually playing. The sheet is shown
     * off-turn too, made inert by `ReadOnlyPanel`, so that a waiting player
     * reads what they *will* be able to do (AGENTS.md) — but `phase` and the
     * action counter belong to whoever is playing, not to the reader, so the
     * two turn-closing sheets below are the viewer's own or nobody's.
     */
    isMyTurn: boolean;
    /** Which of the two tile-picking actions is armed, if either. */
    mode: BannedIsletBoardMode | null;
    onModeChange: (mode: BannedIsletBoardMode | null) => void;
    /** How many tiles each armed action can currently reach — 0 disables its row. */
    targetCounts: Record<BannedIsletBoardMode, number>;
    submitCommand: SubmitCommand;
    pendingTarget: string | null;
    submitting: boolean;
}

/**
 * §8's action catalogue as a turn sheet: one row per verb, each saying what it
 * would cost and how much of it is available right now. Move and Shore Up arm
 * the board (BannedIsletBoard highlights the legal tiles; a tap there submits
 * the command); Capture and Give a Treasure Card have no tile to choose, so
 * they submit from the row itself.
 *
 * Every legality question is asked of `rules.ts` — the same module the server's
 * `Execute` decides with — rather than re-derived here, so a row the sheet
 * offers is never a command the server refuses (docs/new-game.md, "Isomorphic
 * rules modules").
 *
 * Off-turn the whole sheet is made inert by `ReadOnlyPanel` on the page: a
 * waiting player reads what they *will* be able to do rather than being shown
 * nothing (AGENTS.md). That is the only thing `isMyTurn` is for — it keeps the
 * two sheets that *close* a turn (the End Turn button and the hand-limit
 * picker) off a reader's screen, since `phase` and `actionsLeft` describe
 * whoever is playing rather than whoever is looking.
 *
 * Once the three actions are spent the sheet becomes the End Turn button, and
 * if the two cards drawn push the hand past the limit it becomes the discard
 * picker instead — the two phases the player doesn't control, each of them the
 * only thing the screen will let them do next (§7, §10).
 */
export default function BannedIsletActions({
    gs,
    myUserId,
    isMyTurn,
    mode,
    onModeChange,
    targetCounts,
    submitCommand,
    pendingTarget,
    submitting,
}: BannedIsletActionsProps) {
    const me = gs.playerStates[myUserId];

    // Which teammate a card is being handed to, mid-pick. Keyed on the actions
    // left so it clears itself the moment one is spent — which is both the
    // successful give and the start of anybody's next turn.
    const [giveTo, setGiveTo] = useResettingState<string | null>(null, `${myUserId}:${me?.actionsLeft ?? 0}`);

    if (!me) return null;

    // ── Over the hand limit (§10, §16): the island is waiting on this, and
    //     nothing else on the turn can happen until the hand is back down.
    //     BannedIsletEndTurn has already drawn and put the game in this phase;
    //     BannedIsletDiscard is what closes it and runs the flood. ──
    if (isMyTurn && gs.phase === 'discard') {
        return (
            <DiscardPicker
                hand={me.hand}
                submitCommand={submitCommand}
                pendingTarget={pendingTarget}
                submitting={submitting}
            />
        );
    }

    // ── Out of actions (§7 Phase 1): the only thing left is to hand the turn
    //     to the island. Deliberately its own command rather than something
    //     the third action does for you (§21.4). ──
    if (isMyTurn && me.actionsLeft <= 0) {
        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    ⏭ Out of actions — end your turn to draw two cards and let the sea take its turn.
                </p>
                <ActionButton
                    className="ag-btn ag-btn--primary ag-btn--block"
                    disabled={submitting}
                    pending={pendingTarget === 'endTurn'}
                    pendingLabel="Ending turn…"
                    onClick={() => submitCommand(new BannedIsletEndTurn(), undefined, 'endTurn')}
                >
                    End turn
                </ActionButton>
            </div>
        );
    }

    const actionsLeft = me.actionsLeft;
    // Nothing in the sheet can be sent while an action is in flight, once the
    // three are spent, or during a hand-limit discard — the same three refusals
    // BannedIsletAction.Execute opens with, so a row never offers a command the
    // server would reject.
    const blocked = submitting || actionsLeft <= 0 || gs.phase !== 'actions';
    const here = gs.positions[me.position];
    // §8 Give a Treasure Card is face to face: both pawns on the same tile.
    // (The Messenger's exception to that is §12's, and arrives with the roles.)
    const mates = Object.values(gs.playerStates).filter(p => p.userId !== myUserId && p.position === me.position);
    const myTreasureCards = me.hand.filter(isTreasureCard);

    function send(apply: (cmd: BannedIsletAction) => void, target: string) {
        const cmd = new BannedIsletAction();
        apply(cmd);
        submitCommand(cmd, undefined, target);
    }

    // The card-picking sheet, once a teammate has been chosen: which of my
    // treasure cards crosses the tile. Only treasure cards move (§10's
    // specials are played from their own holder's hand).
    const giveMate = mates.find(p => p.userId === giveTo);
    if (giveMate) {
        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    Which card goes to {giveMate.username}?
                </p>
                <ActionRows rows={myTreasureCards.map(card => {
                    const target = `give:${giveMate.userId}:${card}`;
                    return {
                        key: target,
                        icon: cardGlyph(card),
                        name: cardName(card),
                        cost: `${countCards(me.hand, card)} in hand`,
                        disabled: blocked,
                        pending: pendingTarget === target,
                        tag: pendingTarget === target ? <PendingTag label="Giving" /> : 'Give',
                        onClick: () => send(cmd => {
                            cmd.kind = 'giveCard';
                            cmd.targetUserId = giveMate.userId;
                            cmd.cardId = card;
                        }, target),
                    };
                })} />
                <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={() => setGiveTo(null)}>↩ Cancel</button>
            </div>
        );
    }

    const rows: ActionRow[] = [
        {
            key: 'move',
            icon: '🚶',
            name: 'Move',
            cost: 'Step to a neighbouring tile',
            disabled: targetCounts.move === 0 || blocked,
            active: mode === 'move',
            tag: targetCounts.move === 0 ? 'Nowhere to go' : `${targetCounts.move} ${targetCounts.move === 1 ? 'tile' : 'tiles'}`,
            tagMuted: targetCounts.move === 0,
            onClick: () => onModeChange(mode === 'move' ? null : 'move'),
        },
        {
            key: 'shoreUp',
            icon: '🪣',
            name: 'Shore up',
            cost: 'Pump a flooded tile back to dry — this one or a neighbour',
            disabled: targetCounts.shoreUp === 0 || blocked,
            active: mode === 'shoreUp',
            tag: targetCounts.shoreUp === 0 ? 'Nothing flooded' : `${targetCounts.shoreUp} ${targetCounts.shoreUp === 1 ? 'tile' : 'tiles'}`,
            tagMuted: targetCounts.shoreUp === 0,
            onClick: () => onModeChange(mode === 'shoreUp' ? null : 'shoreUp'),
        },
    ];

    // §8 Capture a Treasure: only ever offered on one of that treasure's own
    // two tiles, so the row appears when you are standing on one and says how
    // far off the four cards you are while you aren't there yet.
    const treasure = treasureAt(gs.positions, me.position);
    if (treasure && !gs.treasures[treasure]) {
        const held = countCards(me.hand, treasure);
        const enough = held >= CARDS_TO_CAPTURE;
        rows.push({
            key: 'capture',
            icon: treasureGlyph(treasure),
            name: `Capture the ${treasureName(treasure)}`,
            cost: `Hand over ${CARDS_TO_CAPTURE} ${treasureName(treasure)} cards`,
            disabled: !enough || blocked,
            pending: pendingTarget === 'capture',
            tag: pendingTarget === 'capture'
                ? <PendingTag label="Capturing" />
                : enough ? 'Capture' : `${held}/${CARDS_TO_CAPTURE}`,
            tagMuted: !enough,
            onClick: () => send(cmd => { cmd.kind = 'capture'; }, 'capture'),
        });
    }

    mates.forEach(mate => {
        rows.push({
            key: `give:${mate.userId}`,
            icon: '🤝',
            name: `Give a card to ${mate.username}`,
            cost: `You are both on ${tileName(here.tile)}`,
            disabled: myTreasureCards.length === 0 || blocked,
            tag: myTreasureCards.length === 0 ? 'No treasure cards' : 'Choose',
            tagMuted: myTreasureCards.length === 0,
            onClick: () => setGiveTo(mate.userId),
        });
    });

    return (
        <div className="ag-actionsheet">
            <p className="ag-action-hint" style={{ marginTop: 0 }}>
                {actionsLeft > 0
                    ? `${actionsLeft} of 3 actions left — tap one, then a tile on the island.`
                    : 'No actions left this turn.'}
            </p>

            <ActionRows rows={rows} />

            <ActionButton
                className="ag-btn ag-btn--light ag-btn--block"
                style={{ marginTop: 10 }}
                disabled={blocked}
                pending={pendingTarget === 'pass'}
                pendingLabel="Passing…"
                onClick={() => send(cmd => { cmd.kind = 'pass'; }, 'pass')}
            >
                ⏭ Pass — give up the rest of the turn
            </ActionButton>
        </div>
    );
}
