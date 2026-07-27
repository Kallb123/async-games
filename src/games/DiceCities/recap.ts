import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import { IDiceCitiesDiceRollOutcome } from "@/utils/apiModels/GameLogic";
import { DiceCitiesCards, DiceCitiesCardIds } from "@/games/DiceCities/cards";
import { LANDMARKS, landmarkCount } from "@/games/DiceCities/ui";
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
    const base = {
        id: command.id,
        commandId: command.id,
        timestamp: command.timestamp,
        actorId: command.senderId,
        actorUsername: name,
    };

    // ── Dice roll (and Radio Tower re-roll): the turn's headline beat. ──────────
    if (
        command.className === "DiceCitiesRequestDiceRoll" ||
        command.className === "DiceCitiesRequestRadioTowerReroll"
    ) {
        const roll = outcome as IDiceCitiesDiceRollOutcome;
        const total = roll.roll2 ? roll.roll1 + roll.roll2 : roll.roll1;
        const dicePart = roll.roll2 ? ` (${roll.roll1}+${roll.roll2})` : "";
        const reroll = command.className === "DiceCitiesRequestRadioTowerReroll";

        // moneyChanges is a live Map keyed by userId: the roller's own net plus
        // every coin a café/restaurant/stadium moved between players this roll.
        const changes = roll.moneyChanges instanceof Map ? roll.moneyChanges : new Map<string, number>();
        const rollerNet = changes.get(command.senderId) ?? 0;
        const affectedIds = [...changes.entries()].filter(([, v]) => v !== 0).map(([id]) => id);

        let detail: string;
        if (rollerNet > 0) detail = `+${rollerNet}🪙`;
        else if (rollerNet < 0) detail = `${rollerNet}🪙`;
        else detail = "no coins";

        return [
            {
                ...base,
                type: reroll ? "dc_reroll" : "dc_roll",
                glyph: "🎲",
                title: `${name} ${reroll ? "re-rolled" : "rolled"} ${total}${dicePart}`,
                detail,
                affectedIds,
            },
        ];
    }

    // ── Landmark unlocked: progress toward the four-landmark win. ───────────────
    const landmarkCardId = LANDMARK_BY_COMMAND[command.className];
    if (landmarkCardId) {
        const card = DiceCitiesCards[landmarkCardId];
        const roller = playerByUserId(next.specificGameState as IDiceCitiesGameStateResponse, command.senderId);
        const built = roller ? landmarkCount(roller) : 0;
        const won = built >= LANDMARKS.length;
        return [
            {
                ...base,
                type: "dc_landmark",
                glyph: won ? "🏆" : "🏛️",
                title: won
                    ? `${name} built the ${card.title} — all four landmarks!`
                    : `${name} unlocked the ${card.title}`,
                detail: won ? "winner!" : `${built}/${LANDMARKS.length} landmarks`,
            },
        ];
    }

    // ── Establishment bought. ───────────────────────────────────────────────────
    if (command.className === "DiceCitiesRequestCardPurchase") {
        const cardId = (command as unknown as { cardId: string }).cardId;
        const card = DiceCitiesCards[cardId];
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

    // Passes, and the mid-roll TV Station / Business Center selection steps, don't
    // earn their own recap row — the roll they belong to already captures the swing.
    return [];
}

function summarize(events: IGameEvent[], forUserId: string): IRecapSummary {
    const rolls = events.filter((e) => e.type === "dc_roll" || e.type === "dc_reroll").length;
    const landmarks = events.filter((e) => e.type === "dc_landmark");
    const won = landmarks.some((e) => e.detail === "winner!");
    // Did any roll move coins to or from the viewer while they were away?
    const touchedYou = events.some((e) => e.affectedIds?.includes(forUserId));

    let tail = ".";
    if (won) {
        tail = " — and someone's already claimed all four landmarks. 🏆";
    } else if (landmarks.length) {
        tail = landmarks.length > 1
            ? " — landmarks are going up fast."
            : " — a rival unlocked a landmark.";
    } else if (touchedYou) {
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

    // LANDMARKS is already in cost order (Train Station → Radio Tower).
    const next = LANDMARKS.find((l) => !me[l.flag]);
    if (!next) return null; // all four built — nothing left to nudge.

    const card = DiceCitiesCards[next.cardId];
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
