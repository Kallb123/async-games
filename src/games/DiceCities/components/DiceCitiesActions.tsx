import type { ICommandResponse } from "@/app/api/game/command/route";
import { IDiceCitiesCard, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCardIds, HARBOUR_BONUS } from "@/games/DiceCities/cards";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import {
    DiceCitiesRequestBusinessCenterOpponentSelection,
    DiceCitiesRequestBusinessCenterOwnSelection,
    DiceCitiesRequestCardPurchase,
    DiceCitiesRequestDiceRoll,
    DiceCitiesRequestHarbourBonus,
    DiceCitiesRequestPassTurn,
    DiceCitiesRequestRadioTowerReroll,
    DiceCitiesRequestTvStationSelection,
    DiceCitiesRequestUnlockAmusementPark,
    DiceCitiesRequestUnlockHarbour,
    DiceCitiesRequestUnlockRadioTower,
    DiceCitiesRequestUnlockShoppingMall,
    DiceCitiesRequestUnlockTrainStation,
    IDiceCitiesDiceRollOutcome,
    IGameCommand,
} from "@/utils/apiModels/GameLogic";
import { ACTIVATION_META, activationFor, buildableLandmarks, rollLabel, yieldLabel } from "@/games/DiceCities/ui";
import type { DiceCitiesTheme } from "@/games/DiceCities/themes";
import CardArt from "@/games/DiceCities/components/CardArt";
import ZoomableCardArt from "@/games/DiceCities/components/ZoomableCardArt";
import type { SubmitCommand } from "@/utils/hooks/useSubmitCommand";
import Dice from "@/components/ui/Dice";
import ActionButton from "@/components/ui/ActionButton";
import PendingTag from "@/components/ui/PendingTag";
import { capitalise } from "@/utils/ui/text";
import { useEffect, useRef, useState } from "react";

interface DiceCitiesActionsProps {
    gameState: IDiceCitiesGameStateResponse;
    myState: IDiceCitiesPlayerStateResponse;
    opponents: IDiceCitiesPlayerStateResponse[];
    /**
     * The theme this game is played in. `theme.cards` is the card table every
     * lookup below goes through — same keys as `DiceCitiesCards`, themed names
     * and rules text — and `theme.words` names the coins, the bank and the
     * landmark track in the copy around them.
     */
    theme: DiceCitiesTheme;
    submitCommand: SubmitCommand;
    /** The `target` of the in-flight command, so only the tapped control or card
     *  shows as processing. Null when nothing is in flight — which also means it
     *  doubles as "is the sheet busy?", since every command here carries one. */
    pendingTarget: string | null;
    /**
     * Off your turn the market is all that is left of the sheet — the dice and
     * the build buttons need a turn to be any use. `ReadOnlyPanel` makes what
     * is left inert.
     */
    readOnly?: boolean;
}

// The unlock command for each of the four win-condition landmarks, keyed by the
// player-state flag that records it — so the market can wire one button per row.
const LANDMARK_UNLOCK: Record<string, new () => IGameCommand> = {
    doubleUnlocked: DiceCitiesRequestUnlockTrainStation,
    bonusDiningAndStore: DiceCitiesRequestUnlockShoppingMall,
    rerollDoubles: DiceCitiesRequestUnlockAmusementPark,
    oneReroll: DiceCitiesRequestUnlockRadioTower,
    harbourUnlocked: DiceCitiesRequestUnlockHarbour,
};

export default function DiceCitiesActions({ gameState, myState, opponents, theme, submitCommand, pendingTarget, readOnly = false }: DiceCitiesActionsProps) {
    const cards = theme.cards;
    const words = theme.words;
    // The four cards this sheet names in its own copy rather than in a list —
    // the two mid-turn selections it takes over the screen for, the landmark
    // that unlocks the second die, and the one that offers the +2. Read off the
    // themed table so the prompt and the card the player is holding agree.
    const harbourCard = cards[DiceCitiesCardIds.HARBOUR];
    const tvStationCard = cards[DiceCitiesCardIds.TV_STATION];
    const businessCentreCard = cards[DiceCitiesCardIds.BUSINESS_CENTER];
    const trainStationCard = cards[DiceCitiesCardIds.TRAIN_STATION];
    // A command is in flight — disable the sheet so a double-tap can't fire two
    // commands before the first response lands.
    const busy = pendingTarget !== null;
    // Which die count the player has selected for their next roll.
    const [diceCount, setDiceCount] = useState<1 | 2>(myState.lastDiceSelection);
    // The most recent roll, kept locally so the dice + total stay on screen
    // through the build step (rolling does not advance the turn). `bonus` is the
    // Harbour's +2 once taken, so the total on screen is the one that paid out.
    const [roll, setRoll] = useState<{ roll1: number; roll2: number | null; bonus: number } | null>(null);
    const [rolling, setRolling] = useState(false);
    const [face, setFace] = useState<{ a: number; b: number }>({ a: 1, b: 1 });
    const tumble = useRef<ReturnType<typeof setInterval> | null>(null);

    // Tumble the dice for a beat, then settle on the real values.
    const animateRoll = (r: { roll1: number; roll2: number | null }) => {
        setRoll({ ...r, bonus: 0 });
        setRolling(true);
        if (tumble.current) clearInterval(tumble.current);
        tumble.current = setInterval(() => {
            setFace({ a: 1 + Math.floor(Math.random() * 6), b: 1 + Math.floor(Math.random() * 6) });
        }, 90);
        setTimeout(() => {
            if (tumble.current) clearInterval(tumble.current);
            setFace({ a: r.roll1, b: r.roll2 ?? 1 });
            setRolling(false);
        }, 850);
    };
    useEffect(() => () => { if (tumble.current) clearInterval(tumble.current); }, []);

    const send = (command: IGameCommand, target: string, after?: (r: ICommandResponse) => void) => {
        submitCommand(command, after, target);
    };

    const doRoll = (double: boolean) => {
        const command = new DiceCitiesRequestDiceRoll();
        command.doubleDice = double;
        send(command, "roll", (response) => {
            const outcome = response.outcome as IDiceCitiesDiceRollOutcome | undefined;
            if (typeof outcome?.roll1 === "number") animateRoll({ roll1: outcome.roll1, roll2: outcome.roll2 ?? null });
        });
    };

    const doReroll = () => {
        send(new DiceCitiesRequestRadioTowerReroll(), "reroll", (response) => {
            const outcome = response.outcome as IDiceCitiesDiceRollOutcome | undefined;
            if (typeof outcome?.roll1 === "number") animateRoll({ roll1: outcome.roll1, roll2: outcome.roll2 ?? null });
        });
    };

    // Answers the Harbour's offer on a parked 10-or-better roll. Taking it pays
    // the table out at the higher total, so the dice on screen gain the +2.
    const answerHarbour = (addBonus: boolean) => {
        const command = new DiceCitiesRequestHarbourBonus();
        command.addBonus = addBonus;
        send(command, `harbour:${addBonus ? "add" : "keep"}`, () => {
            if (addBonus) setRoll((r) => (r ? { ...r, bonus: HARBOUR_BONUS } : r));
        });
    };

    const buyCard = (cardId: uuidString) => {
        const command = new DiceCitiesRequestCardPurchase();
        command.cardId = cardId;
        send(command, `build:${cardId}`);
    };

    const unlockLandmark = (flag: string) => {
        const Command = LANDMARK_UNLOCK[flag];
        if (Command) send(new Command(), `landmark:${flag}`);
    };

    const pass = () => send(new DiceCitiesRequestPassTurn(), "endTurn");

    // ── The market, shared by the build step and the waiting view ───────────
    // What is on offer and what it costs is public, so a player waiting for
    // their turn reads it here — and it is the very block they build from once
    // the dice come round to them.
    const buyable = [...gameState.bankCards].sort(
        (a, b) => cards[a.card].rollNumber[0] - cards[b.card].rollNumber[0],
    );
    const unbuiltLandmarks = buildableLandmarks(gameState.enabledDocks).filter((l) => !myState[l.flag]);
    const marketSheet = (
        <>
            <div className="ag-dc-market-head">
                <span className="ag-dc-market-title">{readOnly ? words.market : `${words.market} · build one`}</span>
                <CoinPill amount={gameState.bankMoney} label={`in ${words.bank}`} pill />
                <CoinPill amount={myState.money} pill />
            </div>

            <div className="ag-dc-market-grid ag-pending-group">
                {buyable.map((cc) => {
                    const card = cards[cc.card];
                    const disabled = purchaseDisabled(card, cc.amount, myState) || busy;
                    const pending = pendingTarget === `build:${cc.card}`;
                    return (
                        <div
                            key={cc.card}
                            className={`ag-dc-market-card${pending ? ' ag-pending-skin' : ''}`}
                            style={{ borderTopColor: ACTIVATION_META[activationFor(card)].color }}
                        >
                            <div className="ag-dc-market-card-top">
                                <ZoomableCardArt card={card} theme={theme} className="ag-dc-market-icon" />
                                {pending
                                    ? <PendingTag label="Building" />
                                    : <span className="ag-dc-market-roll">🎲 {rollLabel(card)}</span>}
                            </div>
                            <div className="ag-dc-market-name">{card.title}</div>
                            <div className="ag-dc-market-yield">{yieldLabel(card)} · ×{cc.amount} left</div>
                            <button
                                className="ag-dc-build-btn"
                                disabled={disabled}
                                onClick={() => buyCard(cc.card as uuidString)}
                            >
                                Build · {card.cost}🪙
                            </button>
                        </div>
                    );
                })}
            </div>

            {unbuiltLandmarks.length > 0 && (
                <div className="ag-dc-landmark-buys ag-pending-group">
                    {unbuiltLandmarks.map(({ cardId, flag }) => {
                        const card = cards[cardId];
                        const disabled = card.cost > myState.money || busy;
                        const pending = pendingTarget === `landmark:${flag}`;
                        return (
                            <button
                                key={cardId}
                                className={`ag-build-row ag-dc-landmark-buy${pending ? ' ag-pending-skin' : ''}`}
                                disabled={disabled}
                                onClick={() => unlockLandmark(flag as string)}
                            >
                                <CardArt card={card} className="ag-icon-box ag-dc-landmark-buy-icon" />
                                <span className="ag-build-main">
                                    <span className="ag-build-name">{capitalise(words.landmark)} · {card.title}</span>
                                    <span className="ag-build-cost">{card.text}</span>
                                </span>
                                {pending
                                    ? <PendingTag label="Building" />
                                    : <span className="ag-build-tag">{card.cost}🪙</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </>
    );

    // Off your turn that market is the whole sheet.
    if (readOnly) return <div className="ag-actionsheet ag-dc-market">{marketSheet}</div>;

    // ── Pending selections take over the sheet until resolved ────────────────
    if (gameState.awaitingHarbourChoice) {
        // Read the parked dice off the game state rather than the local roll, so
        // the choice survives a refresh or a hand-off between devices.
        const dice = [gameState.harbourRoll1 ?? 0, ...(gameState.harbourRoll2 != null ? [gameState.harbourRoll2] : [])];
        const rolled = dice.reduce((a, b) => a + b, 0);
        return (
            <div className="ag-actionsheet">
                <SelectionHead
                    icon="⚓"
                    title={harbourCard.title}
                    sub={`You rolled ${rolled}. The ${harbourCard.title} can add ${HARBOUR_BONUS} to it.`}
                />
                <RollReadout values={dice} headline={`Total ${rolled}`} sub="nobody is paid until you decide" />
                <div className="ag-dc-pick-list ag-pending-group">
                    <PickRow
                        label={`Add +${HARBOUR_BONUS} · make it ${rolled + HARBOUR_BONUS}`}
                        pending={pendingTarget === "harbour:add"}
                        pendingLabel="Sending"
                        disabled={busy}
                        onClick={() => answerHarbour(true)}
                    />
                    <PickRow
                        label={`Keep ${rolled}`}
                        pending={pendingTarget === "harbour:keep"}
                        pendingLabel="Sending"
                        disabled={busy}
                        onClick={() => answerHarbour(false)}
                    />
                </div>
            </div>
        );
    }

    if (gameState.awaitingTSSelection) {
        return (
            <div className="ag-actionsheet">
                <SelectionHead icon="📺" title={tvStationCard.title} sub={tvStationCard.text} />
                <div className="ag-dc-pick-list ag-pending-group">
                    {opponents.map((op) => (
                        <PickRow
                            key={op.userId}
                            label={op.username}
                            meta={`${op.money}🪙`}
                            pending={pendingTarget === `steal:${op.userId}`}
                            pendingLabel="Taking"
                            disabled={busy}
                            onClick={() => {
                                const command = new DiceCitiesRequestTvStationSelection();
                                command.selectedUser = op.userId;
                                command.selectedUserName = op.username;
                                send(command, `steal:${op.userId}`);
                            }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (gameState.awaitingBCSelectionOwn) {
        const mine = myState.cards.filter((cc) => cc.amount > 0 && cards[cc.card].type !== "landmark");
        return (
            <div className="ag-actionsheet">
                <SelectionHead
                    icon="🏢"
                    title={businessCentreCard.title}
                    sub={`Choose one of your ${words.establishments} to give away.`}
                />
                <CardPickGrid
                    cards={mine.map((cc) => cards[cc.card])}
                    disabled={busy}
                    isPending={(cardId) => pendingTarget === `give:${cardId}`}
                    onPick={(cardId) => {
                        const command = new DiceCitiesRequestBusinessCenterOwnSelection();
                        command.selectedCard = cardId;
                        send(command, `give:${cardId}`);
                    }}
                />
            </div>
        );
    }

    if (gameState.awaitingBCSelectionOpponent) {
        return (
            <div className="ag-actionsheet">
                <SelectionHead
                    icon="🏢"
                    title={businessCentreCard.title}
                    sub={`Choose an opponent's ${words.establishment} to take.`}
                />
                {opponents.map((op) => {
                    const theirs = op.cards.filter((cc) => cc.amount > 0 && cards[cc.card].type !== "landmark");
                    if (theirs.length === 0) return null;
                    return (
                        <div key={op.userId} className="ag-dc-pick-group">
                            <div className="ag-dc-pick-group-name">{op.username}</div>
                            <CardPickGrid
                                cards={theirs.map((cc) => cards[cc.card])}
                                disabled={busy}
                                isPending={(cardId) => pendingTarget === `take:${op.userId}:${cardId}`}
                                onPick={(cardId) => {
                                    const command = new DiceCitiesRequestBusinessCenterOpponentSelection();
                                    command.selectedUser = op.userId;
                                    command.selectedCard = cardId;
                                    send(command, `take:${op.userId}:${cardId}`);
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ── Pre-roll: coin bank + dice picker + roll ─────────────────────────────
    if (!gameState.hasRolled) {
        const canDouble = myState.doubleUnlocked;
        const effectiveDice = canDouble ? diceCount : 1;
        return (
            <div className="ag-dc-bank ag-pending-group">
                <div className="ag-dc-bank-head">
                    <CoinPill amount={myState.money} label={words.coins} />
                    <CoinPill amount={gameState.bankMoney} label={`in ${words.bank}`} pill />
                    <span className="ag-dc-bank-note">
                        {canDouble
                            ? `${trainStationCard.title} lets you roll 2 dice`
                            : `Build the ${trainStationCard.title} to roll 2 dice`}
                    </span>
                </div>
                <div className="ag-dc-dice-picker">
                    <button
                        className={`ag-dc-dice-opt${effectiveDice === 1 ? " ag-dc-dice-opt--on" : ""}`}
                        onClick={() => setDiceCount(1)}
                    >
                        <span className="ag-dc-dice-mini">⚀</span> 1 die
                    </button>
                    <button
                        className={`ag-dc-dice-opt${effectiveDice === 2 ? " ag-dc-dice-opt--on" : ""}${canDouble ? "" : " ag-dc-dice-opt--locked"}`}
                        onClick={() => canDouble && setDiceCount(2)}
                        disabled={!canDouble}
                    >
                        <span className="ag-dc-dice-mini">⚁</span> 2 dice{canDouble ? "" : " 🔒"}
                    </button>
                </div>
                <ActionButton
                    className="ag-btn ag-btn--primary ag-btn--block ag-btn--roll"
                    onClick={() => doRoll(effectiveDice === 2)}
                    disabled={busy}
                    pending={pendingTarget === "roll"}
                    pendingLabel={`Rolling ${effectiveDice === 2 ? "2 dice" : "1 die"}…`}
                >
                    🎲 Roll {effectiveDice === 2 ? "2 dice" : "1 die"}
                </ActionButton>
            </div>
        );
    }

    // ── Post-roll: dice result + market ──────────────────────────────────────
    const total = roll ? roll.roll1 + (roll.roll2 ?? 0) + roll.bonus : null;
    const canReroll = myState.oneReroll && !gameState.hasReRolled;

    return (
        <div className="ag-dc-post">
            {roll && (
                <RollReadout
                    values={roll.roll2 != null
                        ? [rolling ? face.a : roll.roll1, rolling ? face.b : roll.roll2]
                        : [rolling ? face.a : roll.roll1]}
                    rolling={rolling}
                    headline={rolling ? "Rolling…" : `Total ${total}${roll.bonus > 0 ? ` (${harbourCard.title} +${roll.bonus})` : ""}`}
                    sub={rolling ? "the dice are tumbling" : "payouts are in — build one, or end your turn"}
                />
            )}

            {gameState.awaitingDoubleReroll && (
                <div className="ag-callout ag-dc-callout">🎉 Doubles! You&apos;ll take another turn after this one.</div>
            )}

            <div className="ag-actionsheet ag-dc-market">
                {marketSheet}

                {canReroll && (
                    <ActionButton
                        className="ag-btn ag-btn--light ag-btn--block ag-dc-reroll"
                        onClick={doReroll}
                        disabled={busy}
                        pending={pendingTarget === "reroll"}
                        pendingLabel="Re-rolling…"
                    >
                        🎲 Re-roll the dice
                    </ActionButton>
                )}

                <ActionButton
                    className="ag-btn ag-btn--success ag-btn--block"
                    onClick={pass}
                    disabled={busy}
                    pending={pendingTarget === "endTurn"}
                    pendingLabel="Ending your turn…"
                >
                    ✓ End turn
                </ActionButton>
                <p className="ag-action-hint">Building or ending passes the dice to the next player.</p>
            </div>
        </div>
    );
}

// Disabled when: not affordable, out of stock, or at the per-player own-limit.
function purchaseDisabled(card: IDiceCitiesCard, stock: number, myState: IDiceCitiesPlayerStateResponse): boolean {
    if (stock === 0) return true;
    if (card.cost > myState.money) return true;
    const owned = myState.cards.find((cc) => cc.card === card.cardId)?.amount ?? 0;
    if (owned >= card.ownLimit) return true;
    return false;
}

// The gold coin count, used for both a player's purse and the bank's remaining
// supply so the two always read as the same kind of number.
function CoinPill({ amount, label, pill }: { amount: number; label?: string; pill?: boolean }) {
    return (
        <span className={`ag-dc-coins${pill ? " ag-dc-coins--pill" : ""}`}>
            <span className="ag-dc-coins-icon">🪙</span>
            <span className="ag-dc-coins-num">{amount}</span>
            {label && <span className="ag-dc-coins-label">{label}</span>}
        </span>
    );
}

// The dice a roll landed on with its headline underneath — shown once while the
// Harbour decision is pending, and again over the market after payouts land.
function RollReadout({ values, headline, sub, rolling }: {
    values: number[];
    headline: string;
    sub: string;
    rolling?: boolean;
}) {
    return (
        <div className="ag-dc-roll">
            <Dice values={values} size={40} rolling={rolling} />
            <div className="ag-dc-roll-main">
                <div className="ag-dc-roll-total">{headline}</div>
                <div className="ag-dc-roll-sub">{sub}</div>
            </div>
        </div>
    );
}

// One tappable row in a pick list: an opponent to rob, or an answer to the
// Harbour's offer. The card-shaped variant of the same idea is CardPickGrid.
function PickRow({ label, meta, pending, pendingLabel, disabled, onClick }: {
    label: string;
    /** Trailing detail, e.g. how many coins the opponent is holding. */
    meta?: string;
    pending: boolean;
    pendingLabel: string;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            className={`ag-dc-pick-row${pending ? ' ag-pending-skin' : ''}`}
            disabled={disabled}
            onClick={onClick}
        >
            <span className="ag-dc-pick-name">{label}</span>
            {pending
                ? <PendingTag label={pendingLabel} />
                : meta && <span className="ag-dc-pick-meta">{meta}</span>}
        </button>
    );
}

function SelectionHead({ icon, title, sub }: { icon: string; title: string; sub: string }) {
    return (
        <div className="ag-dc-pick-head">
            <span className="ag-dc-pick-head-icon">{icon}</span>
            <div>
                <div className="ag-dc-pick-head-title">{title}</div>
                <div className="ag-dc-pick-head-sub">{sub}</div>
            </div>
        </div>
    );
}

function CardPickGrid({ cards, disabled, isPending, onPick }: {
    /** The themed cards to offer — already named and illustrated. */
    cards: IDiceCitiesCard[];
    disabled: boolean;
    /** True for the card whose command is in flight — it wears the pending skin. */
    isPending: (cardId: uuidString) => boolean;
    onPick: (cardId: uuidString) => void;
}) {
    return (
        <div className="ag-dc-pick-grid ag-pending-group">
            {cards.map((card, i) => {
                const cardId = card.cardId;
                const pending = isPending(cardId);
                return (
                    <button
                        key={`${cardId}-${i}`}
                        className={`ag-dc-pick-card${pending ? ' ag-pending-skin' : ''}`}
                        disabled={disabled}
                        onClick={() => onPick(cardId)}
                    >
                        <CardArt card={card} className="ag-dc-pick-card-icon" />
                        {pending
                            ? <PendingTag label="Sending" />
                            : <span className="ag-dc-pick-card-name">{card.title}</span>}
                    </button>
                );
            })}
        </div>
    );
}
