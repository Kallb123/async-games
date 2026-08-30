import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { ISACSpecificGameStateResponse, ISACPlayerStateResponse } from "@/games/SettlementsAndCities/apiModels";
import type { SAC_Resource } from "@/games/SettlementsAndCities/board";
import { NO_RESOURCES } from "@/games/SettlementsAndCities/board";
import { playerByUserId } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";

type SACState = ISACSpecificGameStateResponse;

// Hand *size* is public, and it's all these deltas need — the response only
// carries a hand's composition for the viewer.
function totalResources(ps: ISACPlayerStateResponse | undefined): number {
    return ps?.resourceCount ?? 0;
}

// Compares a player's resource total between two snapshots (by userId).
function resourceDelta(prev: SACState | undefined, next: SACState | undefined, userId: string): number {
    return totalResources(playerByUserId(next, userId)) - totalResources(playerByUserId(prev, userId));
}

// Detects a longest-road / largest-army handover triggered by this command and
// turns it into its own recap row — a big swing worth calling out separately from
// the build/knight that caused it. The dot is the new holder; the previous holder
// (if any) is the "affected" player who just lost the bonus.
function bonusChangeEvent(
    prev: SACState,
    next: SACState,
    command: IGameCommand,
    key: "longestRoadOwner" | "largestArmyOwner"
): IGameEvent | null {
    // Owners are userIds; the previous holder loses the bonus. Resolve their
    // display name for the copy through whichever snapshot still lists them.
    const before = prev[key];
    const after = next[key];
    if (!after || after === before) return null;
    const lostBy = before ?? undefined;
    const lostByName = lostBy
        ? (playerByUserId(next, lostBy)?.username ?? playerByUserId(prev, lostBy)?.username)
        : undefined;
    const isRoad = key === "longestRoadOwner";
    return {
        id: `${command.id}-${key}`,
        commandId: command.id,
        timestamp: command.timestamp,
        actorId: command.senderId,
        actorUsername: command.senderUsername,
        type: isRoad ? "sac_longest_road" : "sac_largest_army",
        glyph: isRoad ? "🛣️" : "⚔️",
        title: `${command.senderUsername} claimed ${isRoad ? "the Longest Road" : "the Largest Army"}`,
        detail: lostByName ? `taken from ${lostByName} · +2 VP` : "+2 VP",
        affectedIds: lostBy ? [lostBy] : undefined,
    };
}

// Turns one replayed Settlements & Cities command into zero or more recap events.
// Since the viewer's window spans every opponent's full turn, we surface only the
// meaningful beats — rolls, the robber, builds, dev cards, and bonus handovers —
// and skip the low-signal chatter (roads, maritime trades, end-turn).
function toEvents(
    prev: ITurnSnapshot,
    next: ITurnSnapshot,
    command: IGameCommand,
    _outcome: ICommandOutcome
): IGameEvent[] {
    const prevState = prev.specificGameState as SACState;
    const nextState = next.specificGameState as SACState;
    const name = command.senderUsername;
    const base = {
        id: command.id,
        commandId: command.id,
        timestamp: command.timestamp,
        actorId: command.senderId,
        actorUsername: name,
    };

    const events: IGameEvent[] = [];

    switch (command.className) {
        case "SACRollDice": {
            const roll = nextState.lastRoll ?? 0;
            if (roll === 7) {
                // A 7 sends the robber and forces discards; flag anyone who lost cards.
                const losers = Object.values(nextState.playerStates)
                    .filter((p) => resourceDelta(prevState, nextState, p.userId) < 0)
                    .map((p) => p.userId);
                events.push({
                    ...base,
                    type: "sac_roll_seven",
                    glyph: "🎲",
                    title: `${name} rolled a 7`,
                    detail: losers.length ? "robber stirs · cards discarded" : "robber stirs",
                    affectedIds: losers,
                });
            } else {
                const gainers = Object.values(nextState.playerStates)
                    .filter((p) => resourceDelta(prevState, nextState, p.userId) > 0)
                    .map((p) => p.userId);
                events.push({
                    ...base,
                    type: "sac_roll",
                    glyph: "🎲",
                    title: `${name} rolled a ${roll}`,
                    detail: gainers.length ? "resources dealt out" : "no one collected",
                    affectedIds: gainers,
                });
            }
            break;
        }

        case "SACMoveRobber": {
            const victimId = (command as unknown as { stealFromUserId: string | null }).stealFromUserId;
            const victim = victimId ? playerByUserId(nextState, victimId) : undefined;
            events.push({
                ...base,
                type: "sac_robber",
                glyph: "🥷",
                title: victim ? `${name} moved the robber and stole a card` : `${name} moved the robber`,
                detail: victim ? `from ${victim.username}` : undefined,
                affectedIds: victimId ? [victimId] : undefined,
            });
            break;
        }

        case "SACBuildSettlement": {
            const me = playerByUserId(nextState, command.senderId);
            events.push({
                ...base,
                type: "sac_settlement",
                glyph: "🏠",
                title: `${name} built a settlement`,
                detail: me ? `${me.visibleVP} VP` : undefined,
            });
            break;
        }

        case "SACBuildCity": {
            const me = playerByUserId(nextState, command.senderId);
            events.push({
                ...base,
                type: "sac_city",
                glyph: "🏙️",
                title: `${name} upgraded to a city`,
                detail: me ? `${me.visibleVP} VP` : undefined,
            });
            break;
        }

        case "SACBuyDevCard": {
            events.push({ ...base, type: "sac_devcard", glyph: "🃏", title: `${name} bought a development card` });
            break;
        }

        case "SACPlayKnight": {
            const me = playerByUserId(nextState, command.senderId);
            events.push({
                ...base,
                type: "sac_knight",
                glyph: "⚔️",
                title: `${name} played a Knight`,
                detail: me ? `${me.knightsPlayed} knight${me.knightsPlayed === 1 ? "" : "s"} played` : undefined,
            });
            break;
        }

        case "SACPlayRoadBuilding": {
            events.push({ ...base, type: "sac_progress", glyph: "🛣️", title: `${name} played Road Building` });
            break;
        }

        case "SACPlayYearOfPlenty": {
            events.push({ ...base, type: "sac_progress", glyph: "🌾", title: `${name} played Year of Plenty` });
            break;
        }

        case "SACPlayMonopoly": {
            const resource = (command as unknown as { resource: SAC_Resource }).resource;
            // Everyone whose stock of that resource fell was robbed by the monopoly.
            const affectedIds = Object.values(nextState.playerStates)
                .filter((p) => p.userId !== command.senderId)
                // Monopoly's only effect is moving that one resource, so a
                // drop in a player's total hand size is exactly a player who
                // handed some over — no need for the composition, which is
                // only sent for the viewer anyway.
                .filter((p) => resourceDelta(prevState, nextState, p.userId) < 0)
                .map((p) => p.userId);
            events.push({
                ...base,
                type: "sac_monopoly",
                glyph: "🎩",
                title: `${name} played Monopoly on ${resource}`,
                detail: affectedIds.length ? "swept the table" : undefined,
                affectedIds,
            });
            break;
        }

        // Setup placements, road builds, maritime trades and end-turn are
        // intentionally silent — too granular to earn a recap row on their own.
        default:
            break;
    }

    // A longest-road / largest-army handover can ride on top of the command that
    // caused it (a road, a settlement, or a knight), so check independently.
    const lr = bonusChangeEvent(prevState, nextState, command, "longestRoadOwner");
    if (lr) events.push(lr);
    const la = bonusChangeEvent(prevState, nextState, command, "largestArmyOwner");
    if (la) events.push(la);

    return events;
}

function summarize(events: IGameEvent[], forUserId: string): IRecapSummary {
    const rolls = events.filter((e) => e.type === "sac_roll" || e.type === "sac_roll_seven").length;
    const builds = events.filter((e) => e.type === "sac_settlement" || e.type === "sac_city").length;
    const robbedYou = events.some((e) => e.type === "sac_robber" && e.affectedIds?.includes(forUserId));
    const monopolisedYou = events.some((e) => e.type === "sac_monopoly" && e.affectedIds?.includes(forUserId));
    const bonusTaken = events.some((e) => e.type === "sac_longest_road" || e.type === "sac_largest_army");

    let tail = ".";
    if (robbedYou) {
        tail = " — and the robber paid you a visit. 🥷";
    } else if (monopolisedYou) {
        tail = " — someone monopolised a resource out of your hand.";
    } else if (bonusTaken) {
        tail = " — a bonus card changed hands.";
    } else if (builds) {
        tail = builds > 1 ? " — the board's filling up fast." : " — a rival expanded.";
    }

    return {
        headline: "Your move 👋",
        subline: `${rolls} turn${rolls === 1 ? "" : "s"} passed while you were away${tail}`,
    };
}

// Nudges the viewer toward the best build they can already afford, or reminds them
// how close they are to the victory target. Deterministic, no model call.
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
    const state = liveState as SACState | undefined;
    const me = playerByUserId(state, forUserId);
    if (!me) return null;
    const r = me.resources ?? NO_RESOURCES;

    if (me.remainingCities > 0 && r.grain >= 2 && r.ore >= 3) {
        return { glyph: "🏙️", text: "You can afford a city (2🌾 + 3⛏️) — upgrade a settlement for +1 VP." };
    }
    if (me.remainingSettlements > 0 && r.brick >= 1 && r.lumber >= 1 && r.wool >= 1 && r.grain >= 1) {
        return { glyph: "🏠", text: "You can afford a settlement (🧱🪵🐑🌾) — claim a new spot for +1 VP." };
    }
    if (r.wool >= 1 && r.grain >= 1 && r.ore >= 1) {
        return { glyph: "🃏", text: "You can buy a development card (🐑🌾⛏️) — it might be a hidden victory point." };
    }
    const target = state?.victoryTarget ?? 10;
    const need = target - me.visibleVP;
    if (need > 0) {
        return { glyph: "🎯", text: `You're on ${me.visibleVP} VP — ${need} more to reach ${target} and win.` };
    }
    return null;
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters. Recap only surfaces for games
// created after recap support (buildTimeline throws otherwise; the engine treats
// that as "no recap"), inheriting SAC's existing recapAvailable gate.
export const settlementsAndCitiesRecapAdapter: IRecapAdapter = {
    className: "SettlementsAndCitiesGameType",
    toEvents,
    summarize,
    tip,
};
