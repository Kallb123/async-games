import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import { IDiceCitiesDiceRollOutcome } from "@/utils/apiModels/GameLogic";
import type { IDiceCitiesTvStationOutcome, IDiceCitiesBusinessCenterOutcome } from "@/utils/apiModels/GameLogic";
import { DiceCitiesCardIds, HARBOUR_BONUS, HARBOUR_MIN_ROLL } from "@/games/DiceCities/cards";
import { diceCitiesTheme, DiceCitiesTheme } from "@/games/DiceCities/themes";
import { coinChangeParts, LANDMARKS, landmarkCount } from "@/games/DiceCities/ui";
import type { IDiceCitiesGameStateResponse } from "@/games/DiceCities/apiModels";
import { playerByUserId } from "@/games/DiceCities/DiceCitiesModels";

// The four win-condition landmarks, keyed by the command that unlocks each, so a
// replayed unlock command becomes a "built the <landmark>" recap event.
const LANDMARK_BY_COMMAND: Record<string, string> = {
    DiceCitiesRequestUnlockTrainStation: DiceCitiesCardIds.TRAIN_STATION,
    DiceCitiesRequestUnlockShoppingMall: DiceCitiesCardIds.SHOPPING_MALL,
    DiceCitiesRequestUnlockAmusementPark: DiceCitiesCardIds.AMUSEMENT_PARK,
    DiceCitiesRequestUnlockRadioTower: DiceCitiesCardIds.RADIO_TOWER,
};

// A roll's full payout, named rather than netted: every steal or bank payout
// it moved, so a Cafe robbing the roller reads as "Bob +1🪙, Alice -1🪙"
// instead of only the roller's own line disappearing into "no coins" if
// theirs happened to net to zero. Every reader of this recap sees the same
// text, so - unlike the live board's version of this line - nobody gets "You".
function coinChangeDetail(changes: Map<string, number>, state: IDiceCitiesGameStateResponse | undefined, theme: DiceCitiesTheme): string {
    const parts = coinChangeParts(changes, (userId) => playerByUserId(state, userId)?.username ?? "someone");
    return parts.length ? parts.join(", ") : `no ${theme.words.coins}`;
}

// Turns one replayed Dice Cities command into zero or more recap events. The
// meaningful beats are the roll (whose money movement already folds in every
// café/restaurant steal via the recorded moneyChanges), each establishment
// bought, and each of the four landmarks unlocked — the win-condition race.
function toEvents(
    _prev: ITurnSnapshot,
    next: ITurnSnapshot,
    command: IGameCommand,
    outcome: ICommandOutcome
): IGameEvent[] {
    const name = command.senderUsername;
    // The theme the game was played in, read off the state the replay engine
    // just rebuilt — so a recap names the cards the way the board did, and an
    // event replayed from a game older than themes reads as it always did.
    const state = next.specificGameState as IDiceCitiesGameStateResponse | undefined;
    const theme = diceCitiesTheme(state?.theme);
    const base = {
        id: command.id,
        commandId: command.id,
        timestamp: command.timestamp,
        actorId: command.senderId,
        actorUsername: name,
    };

    // ── Dice roll (and Radio Tower re-roll): the turn's headline beat. ──────────
    // A Harbour owner's 10+ roll pays out one step later, when they take or
    // decline the +2, so that command carries the beat instead.
    if (
        (command.className === "DiceCitiesRequestDiceRoll" || command.className === "DiceCitiesRequestRadioTowerReroll") &&
        state?.awaitingHarbourChoice
    ) {
        return [];
    }
    if (
        command.className === "DiceCitiesRequestDiceRoll" ||
        command.className === "DiceCitiesRequestRadioTowerReroll" ||
        command.className === "DiceCitiesRequestHarbourBonus"
    ) {
        const roll = outcome as IDiceCitiesDiceRollOutcome;
        const total = roll.roll2 ? roll.roll1 + roll.roll2 : roll.roll1;
        const dicePart = roll.roll2 ? ` (${roll.roll1}+${roll.roll2})` : "";
        const reroll = command.className === "DiceCitiesRequestRadioTowerReroll";
        const harbour = command.className === "DiceCitiesRequestHarbourBonus";

        // moneyChanges is a live Map keyed by userId: the roller's own net plus
        // every coin a café/restaurant/stadium moved between players this roll.
        const changes = roll.moneyChanges instanceof Map ? roll.moneyChanges : new Map<string, number>();
        const affectedIds = [...changes.entries()].filter(([, v]) => v !== 0).map(([id]) => id);
        const detail = coinChangeDetail(changes, state, theme);

        // The Harbour's +2 lands on the dice that were already thrown, so its
        // event tells the whole story: what came up, and what it became.
        const tookHarbourBonus = harbour && (command as unknown as { addBonus?: boolean }).addBonus === true;
        const title = tookHarbourBonus
            ? `${name} rolled ${total}${dicePart}, ${theme.cards[DiceCitiesCardIds.HARBOUR].title} +${HARBOUR_BONUS} → ${total + HARBOUR_BONUS}`
            : `${name} ${reroll ? "re-rolled" : "rolled"} ${total}${dicePart}`;

        return [
            {
                ...base,
                type: reroll ? "dc_reroll" : "dc_roll",
                glyph: tookHarbourBonus ? "⚓" : "🎲",
                title,
                detail,
                affectedIds,
            },
        ];
    }

    // ── Harbour built: a Docks landmark, but never part of the win race. ───────
    if (command.className === "DiceCitiesRequestUnlockHarbour") {
        return [
            {
                ...base,
                type: "dc_harbour",
                glyph: "⚓",
                title: `${name} built the ${theme.cards[DiceCitiesCardIds.HARBOUR].title}`,
                detail: `+${HARBOUR_BONUS} on a ${HARBOUR_MIN_ROLL} or better`,
            },
        ];
    }

    // ── Landmark unlocked: progress toward the four-landmark win. ───────────────
    const landmarkCardId = LANDMARK_BY_COMMAND[command.className];
    if (landmarkCardId) {
        const card = theme.cards[landmarkCardId];
        const roller = playerByUserId(state, command.senderId);
        const built = roller ? landmarkCount(roller) : 0;
        const won = built >= LANDMARKS.length;
        return [
            {
                ...base,
                type: "dc_landmark",
                glyph: won ? "🏆" : "🏛️",
                title: won
                    ? `${name} built the ${card.title} — all four ${theme.words.landmarks}!`
                    : `${name} unlocked the ${card.title}`,
                detail: won ? "winner!" : `${built}/${LANDMARKS.length} ${theme.words.landmarks}`,
            },
        ];
    }

    // ── Establishment bought. ───────────────────────────────────────────────────
    if (command.className === "DiceCitiesRequestCardPurchase") {
        const cardId = (command as unknown as { cardId: string }).cardId;
        const card = theme.cards[cardId];
        if (!card) return [];
        return [
            {
                ...base,
                type: "dc_buy",
                glyph: "🏬",
                title: `${name} bought a ${card.title}`,
                detail: `${card.cost}🪙`,
            },
        ];
    }

    // ── TV Station: coins stolen from a chosen opponent, mid-roll. ─────────────
    // Unlike the café/restaurant steals folded into the roll's own moneyChanges,
    // this is a separate follow-up command - so it needs its own event, and
    // only once the steal has actually happened (the outcome carries no
    // stolenFromId while the selection is still outstanding).
    if (command.className === "DiceCitiesRequestTvStationSelection") {
        const tv = outcome as IDiceCitiesTvStationOutcome;
        if (!tv.stolenFromId) return [];
        const victim = playerByUserId(state, tv.stolenFromId);
        return [
            {
                ...base,
                type: "dc_tvsteal",
                glyph: "📺",
                title: `${name} used the ${theme.cards[DiceCitiesCardIds.TV_STATION].title} to steal from ${victim?.username ?? "an opponent"}`,
                detail: `${tv.stolenAmount ?? 0}🪙`,
                affectedIds: [command.senderId, tv.stolenFromId],
            },
        ];
    }

    // ── Business Center: a card swapped for one of an opponent's. ──────────────
    // Either selection command can be the one that completes the trade
    // (whichever side picks last), so both are checked here the same way -
    // only the one carrying the finished swap's fields produces an event.
    if (
        command.className === "DiceCitiesRequestBusinessCenterOwnSelection" ||
        command.className === "DiceCitiesRequestBusinessCenterOpponentSelection"
    ) {
        const bc = outcome as IDiceCitiesBusinessCenterOutcome;
        if (!bc.tradedWithId || !bc.gaveCardId || !bc.receivedCardId) return [];
        const gave = theme.cards[bc.gaveCardId];
        const received = theme.cards[bc.receivedCardId];
        if (!gave || !received) return [];
        const opponent = playerByUserId(state, bc.tradedWithId);
        return [
            {
                ...base,
                type: "dc_bctrade",
                glyph: "🔄",
                title: `${name} used the ${theme.cards[DiceCitiesCardIds.BUSINESS_CENTER].title} to steal ${opponent?.username ?? "an opponent"}'s ${received.title}`,
                detail: `gave a ${gave.title} for it`,
                affectedIds: [command.senderId, bc.tradedWithId],
            },
        ];
    }

    // Passes don't earn their own recap row.
    return [];
}

// Deliberately app-voiced rather than themed: `summarize` is handed the events
// and nothing else - no game state, so no theme to read - and the recap card's
// headline is the app talking to a player between games rather than the board
// talking about this one. The event rows above it carry the themed names.
function summarize(events: IGameEvent[], forUserId: string): IRecapSummary {
    const rolls = events.filter((e) => e.type === "dc_roll" || e.type === "dc_reroll").length;
    const landmarks = events.filter((e) => e.type === "dc_landmark");
    const won = landmarks.some((e) => e.detail === "winner!");
    // Was the viewer the mark of a TV Station steal or a Business Center trade
    // while they were away? Called out ahead of the generic dice swing below,
    // since "someone made off with your property" is worth surfacing on its own.
    const stolenFromYou = events.some((e) => (e.type === "dc_tvsteal" || e.type === "dc_bctrade") && e.affectedIds?.includes(forUserId));
    // Did any roll move coins to or from the viewer while they were away?
    const diceTouchedYou = events.some((e) => (e.type === "dc_roll" || e.type === "dc_reroll") && e.affectedIds?.includes(forUserId));

    let tail = ".";
    if (won) {
        tail = " — and someone's already claimed all four landmarks. 🏆";
    } else if (landmarks.length) {
        tail = landmarks.length > 1
            ? " — landmarks are going up fast."
            : " — a rival unlocked a landmark.";
    } else if (stolenFromYou) {
        tail = " — and someone made off with your property.";
    } else if (diceTouchedYou) {
        tail = " — and the dice touched your coin purse.";
    }

    return {
        headline: "Your roll again 👋",
        subline: `${rolls} roll${rolls === 1 ? "" : "s"} happened while you were away${tail}`,
    };
}

// Points the viewer at the cheapest landmark they haven't built yet: whether they
// can already afford it, or how many coins short they are. Deterministic, no model.
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
    const state = liveState as IDiceCitiesGameStateResponse | undefined;
    const me = playerByUserId(state, forUserId);
    if (!me) return null;
    const theme = diceCitiesTheme(state?.theme);

    // LANDMARKS is already in cost order (Train Station → Radio Tower).
    const next = LANDMARKS.find((l) => !me[l.flag]);
    if (!next) return null; // all four built — nothing left to nudge.

    const card = theme.cards[next.cardId];
    if (me.money >= card.cost) {
        return {
            glyph: "🏛️",
            text: `You've got ${me.money}🪙 — enough to build the ${card.title} (${card.cost}🪙) and edge toward the win.`,
        };
    }
    return {
        glyph: "🪙",
        text: `You're on ${me.money}🪙; save ${card.cost - me.money} more for the ${card.title} (${card.cost}🪙).`,
    };
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters.
export const diceCitiesRecapAdapter: IRecapAdapter = {
    className: "DiceCitiesGameType",
    toEvents,
    summarize,
    tip,
};
