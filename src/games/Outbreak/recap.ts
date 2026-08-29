import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome, IOutbreakInfectionPhaseOutcome } from "@/utils/apiModels/GameLogic";
import { playerByUserId } from "@/utils/apiModels/GameDataApi";
import type { IOutbreakSpecificGameStateResponse } from "@/games/Outbreak/apiModels";
import {
    CITIES,
    DISEASE_COLORS,
    DISEASE_COLOR_DEFS,
    EVENT_CARD_AIRLIFT,
    EVENT_CARD_FORECAST,
    EVENT_CARD_GOVERNMENT_GRANT,
    EVENT_CARD_ONE_QUIET_NIGHT,
    EVENT_CARD_RESILIENT_POPULATION,
    eventCardName,
    isCityCardId,
    OutbreakDiseaseColor,
} from "@/games/Outbreak/board";
import type { IOutbreakInfectionLogEntry } from "@/games/Outbreak/rules";
import { canDiscoverCure, infectionRateFor } from "@/games/Outbreak/rules";
import { cityList, outbreakCascadeSteps } from "@/games/Outbreak/narration";
import { pluralize } from "@/utils/ui/text";

// §3's whole emotional arc is the board getting worse while the team fights
// back, so recap leans on that rather than a blow-by-blow of every action:
// cures and stations (the team pushing back), epidemics/outbreaks/new
// infection (the board deteriorating), and the five event cards (pressure
// valves) each get a row. Plain movement, Share Knowledge, Treat Disease and
// passing are the game's equivalent of Settlements & Cities' roads — too
// granular to earn a row of their own.
const OB_CURE = "ob_cure";
const OB_STATION = "ob_station";
const OB_EPIDEMIC = "ob_epidemic";
const OB_OUTBREAK = "ob_outbreak";
const OB_INFECT = "ob_infect";
const OB_CONTAINED = "ob_contained";
const OB_AIRLIFT = "ob_airlift";
const OB_GRANT = "ob_grant";
const OB_QUIET_NIGHT = "ob_quiet_night";
const OB_FORECAST = "ob_forecast";
const OB_RESILIENT = "ob_resilient";
const OB_RETRIEVE = "ob_retrieve";
const OB_WIN = "ob_win";
const OB_LOSS = "ob_loss";

function state(snapshot: ITurnSnapshot): IOutbreakSpecificGameStateResponse {
    return snapshot.specificGameState as IOutbreakSpecificGameStateResponse;
}

function totalCubes(gs: IOutbreakSpecificGameStateResponse): number {
    return gs.cities.reduce(
        (sum, c) => sum + DISEASE_COLORS.reduce((s, color) => s + c.cubes[color], 0),
        0,
    );
}

function curedEverything(gs: IOutbreakSpecificGameStateResponse): boolean {
    return DISEASE_COLORS.every(color => gs.cures[color] !== 'none');
}

// One outbreak log entry as a phrase that names where it landed. A lone burst
// reads "Lagos overflowed onto Kinshasa and Khartoum"; a chain reaction walks
// city by city — "Lagos cascaded: Lagos → Kinshasa; Kinshasa → Johannesburg" —
// reusing the same cascade spine the end-of-turn screen prints (narration.ts).
function describeOutbreakEntry(entry: IOutbreakInfectionLogEntry): string {
    const origin = CITIES[entry.cityId!].name;
    const chain = entry.outbreakChain ?? [];
    if (chain.length > 1) {
        return `${origin} cascaded: ${outbreakCascadeSteps(chain)}`;
    }
    const infected = chain[0]?.infected ?? [];
    return infected.length > 0 ? `${origin} overflowed onto ${cityList(infected)}` : `${origin} outbroke`;
}

// The cities a non-outbreak infect phase put cubes on, with a "×n" when the
// same city was hit more than once — so "the board got worse" says where.
function describePlacements(entries: IOutbreakInfectionLogEntry[]): string {
    const counts = new Map<number, number>();
    for (const e of entries) counts.set(e.cityId!, (counts.get(e.cityId!) ?? 0) + 1);
    return [...counts.entries()]
        .map(([cityId, n]) => (n > 1 ? `${CITIES[cityId].name} (×${n})` : CITIES[cityId].name))
        .join(', ');
}

/**
 * Turns one replayed Outbreak command into its recap row(s). Most of the
 * drama isn't in what a player chose — it's in what the deck did to them, so
 * OutbreakEndTurn (the only command touching a deck) reads the *diff* between
 * snapshots rather than re-deriving it from the command itself.
 */
function toEvents(
    prev: ITurnSnapshot,
    next: ITurnSnapshot,
    command: IGameCommand,
    outcome: ICommandOutcome
): IGameEvent[] {
    const prevState = state(prev);
    const nextState = state(next);
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
        // ── The team fighting back ────────────────────────────────────────
        case "OutbreakAction": {
            const act = command as unknown as { kind: string; color: OutbreakDiseaseColor | null };
            if (act.kind === 'cure' && act.color) {
                const eradicated = nextState.cures[act.color] === 'eradicated';
                events.push({
                    ...base,
                    type: OB_CURE,
                    glyph: eradicated ? '🧬' : '🧪',
                    title: `${name} discovered the cure for ${DISEASE_COLOR_DEFS[act.color].name}!`,
                    detail: eradicated ? 'and it’s already eradicated — no cubes left on the board' : `${DISEASE_COLOR_DEFS[act.color].region} is safe`,
                });
            } else if (act.kind === 'buildStation') {
                const me = playerByUserId(nextState, command.senderId);
                const cityName = me ? CITIES[me.city]?.name : undefined;
                events.push({
                    ...base,
                    type: OB_STATION,
                    glyph: '🏥',
                    title: cityName ? `${name} built a research station in ${cityName}` : `${name} built a research station`,
                });
            }
            break;
        }

        // ── Event cards (§12): each is a different pressure released ─────
        case "OutbreakPlayEvent": {
            const cmd = command as unknown as {
                kind: string;
                cardId: number | null;
                destination: number | null;
                infectionCardId: number | null;
            };
            if (cmd.kind === 'play' && cmd.cardId !== null) {
                switch (cmd.cardId) {
                    case EVENT_CARD_AIRLIFT:
                        events.push({
                            ...base,
                            type: OB_AIRLIFT,
                            glyph: '✈️',
                            title: `${name} played Airlift`,
                            detail: cmd.destination !== null ? `moved a teammate to ${CITIES[cmd.destination].name}` : undefined,
                        });
                        break;
                    case EVENT_CARD_GOVERNMENT_GRANT:
                        events.push({
                            ...base,
                            type: OB_GRANT,
                            glyph: '🏥',
                            title: `${name} played Government Grant`,
                            detail: cmd.destination !== null ? `a free research station in ${CITIES[cmd.destination].name}` : undefined,
                        });
                        break;
                    case EVENT_CARD_ONE_QUIET_NIGHT:
                        events.push({
                            ...base,
                            type: OB_QUIET_NIGHT,
                            glyph: '🌙',
                            title: `${name} played One Quiet Night`,
                            detail: 'the next Infect Cities phase will be skipped',
                        });
                        break;
                    case EVENT_CARD_FORECAST:
                        events.push({
                            ...base,
                            type: OB_FORECAST,
                            glyph: '🔮',
                            title: `${name} played Forecast`,
                            detail: 'peeked at the top of the infection deck and set a new order',
                        });
                        break;
                    case EVENT_CARD_RESILIENT_POPULATION:
                        events.push({
                            ...base,
                            type: OB_RESILIENT,
                            glyph: '🛡️',
                            title: `${name} played Resilient Population`,
                            detail: cmd.infectionCardId !== null ? `removed ${CITIES[cmd.infectionCardId].name} from the infection discard pile for good` : undefined,
                        });
                        break;
                    default:
                        break;
                }
            } else if (cmd.kind === 'retrieve' && cmd.cardId !== null) {
                events.push({
                    ...base,
                    type: OB_RETRIEVE,
                    glyph: '♻️',
                    title: `${name} retrieved ${eventCardName(cmd.cardId)} from the discard pile`,
                    detail: 'stored for later, off the hand limit',
                });
            }
            // 'forecastOrder' is the second half of the Forecast played above —
            // no new information for the table, so it stays silent.
            break;
        }

        // Movement, Share Knowledge, Treat Disease, passing and discarding
        // down to the hand limit are this game's equivalent of a road build —
        // routine enough that they'd drown out the beats that matter.
        default:
            break;
    }

    // ── The board deteriorating (§3, §7 phases 2-3) ───────────────────────
    // Narrated from the infection log rather than a before/after cube count.
    // The log is the only record of *where* each draw landed, so this is what
    // lets the recap name the cities an outbreak overflowed onto and walk a
    // cascade burst by burst — a plain cube delta can only say "the board got
    // worse". Read on every command class, not just OutbreakEndTurn, since a
    // hand-limit OutbreakDiscard or an OutbreakPlayEvent can be the command
    // that finishes the draw phase and runs Phase 3; every other command has no
    // `infectionLog`, so this structurally no-ops for them.
    const log = (outcome as IOutbreakInfectionPhaseOutcome).infectionLog ?? [];

    const epidemics = log.filter(e => e.kind === 'epidemic').length;
    if (epidemics > 0) {
        events.push({
            ...base,
            id: `${command.id}:epidemic`,
            type: OB_EPIDEMIC,
            glyph: '📈',
            title: epidemics > 1
                ? `Epidemic! Twice — the infection rate jumps to ${infectionRateFor(nextState.infectionRateIndex)}`
                : `Epidemic! The infection rate rises to ${infectionRateFor(nextState.infectionRateIndex)}`,
            detail: 'the infection discard pile is reshuffled onto the deck',
        });
    }

    const outbreaks = log.filter(e => e.outcome === 'outbreak');
    if (outbreaks.length > 0) {
        // The marker climbs once per city that overflowed — a single card can
        // set off a whole cascade of them — so count the total from the marker
        // itself, and let the detail spell out where each one spread.
        const bursts = nextState.outbreaks - prevState.outbreaks;
        events.push({
            ...base,
            id: `${command.id}:outbreak`,
            type: OB_OUTBREAK,
            glyph: '💥',
            title: `${pluralize(bursts, 'outbreak')} — the marker is now ${nextState.outbreaks}/8`,
            detail: outbreaks.map(describeOutbreakEntry).join(' · '),
        });
    } else {
        const placed = log.filter(e => e.outcome === 'placed');
        if (placed.length > 0) {
            const cubesDelta = totalCubes(nextState) - totalCubes(prevState);
            events.push({
                ...base,
                id: `${command.id}:infect`,
                type: OB_INFECT,
                glyph: '🦠',
                title: `The board got worse — ${pluralize(cubesDelta, 'new cube')} placed`,
                detail: describePlacements(placed),
            });
        }
    }

    // ── The Quarantine Specialist quietly earning her keep ────────────────
    // A card she contains places no cube and triggers no outbreak, so a
    // before/after cube count can't tell it apart from nothing having been
    // drawn at all — the infection log is the only place that records it.
    const contained = log.filter(e => e.outcome === 'contained');
    if (contained.length > 0) {
        events.push({
            ...base,
            id: `${command.id}:contained`,
            type: OB_CONTAINED,
            glyph: '🛡️',
            title: `The Quarantine Specialist blocked ${pluralize(contained.length, 'infection')}`,
            detail: contained.map(e => CITIES[e.cityId!].name).join(', '),
        });
    }

    // ── The ending, however it lands, regardless of which command caused it ──
    if (next.complete && !prev.complete) {
        const won = curedEverything(nextState);
        events.push({
            ...base,
            id: `${command.id}:ending`,
            type: won ? OB_WIN : OB_LOSS,
            glyph: won ? '🎉' : '💀',
            title: won ? 'All four diseases are cured — the team wins!' : (next.history[0]?.text ?? 'The team has lost.'),
            affectedIds: Object.values(nextState.playerStates).map(p => p.userId),
        });
    }

    return events;
}

function summarize(events: IGameEvent[], _forUserId: string): IRecapSummary {
    const cures = events.filter(e => e.type === OB_CURE).length;
    const outbreaks = events.filter(e => e.type === OB_OUTBREAK).length;
    const epidemics = events.filter(e => e.type === OB_EPIDEMIC).length;
    const contained = events.some(e => e.type === OB_CONTAINED);
    const lost = events.some(e => e.type === OB_LOSS);
    const won = events.some(e => e.type === OB_WIN);
    const beats = events.filter(e => e.type !== OB_WIN && e.type !== OB_LOSS).length;

    let tail = '.';
    if (lost) {
        tail = ' — and the team lost. 💀';
    } else if (won) {
        tail = ' — and the team cured everything! 🎉';
    } else if (outbreaks > 0) {
        tail = ` — ${pluralize(outbreaks, 'outbreak')} rocked the board.`;
    } else if (epidemics > 0) {
        tail = ' — an epidemic hit, and the rate is climbing.';
    } else if (cures > 0) {
        tail = cures > 1 ? ' — the team found more cures.' : ' — the team found a cure.';
    } else if (contained) {
        tail = ' — the Quarantine Specialist held the line. 🛡️';
    }

    return {
        headline: 'Your move again 👋',
        subline: `${pluralize(beats, 'thing', 'things')} happened while you were away${tail}`,
    };
}

// Points the viewer at the single best thing to do: a cure their hand already
// pays for, or — failing that — the hottest city on the board, since a stack
// closest to 3 cubes of an uncured colour is closest to the next outbreak.
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
    const gs = liveState as IOutbreakSpecificGameStateResponse | undefined;
    if (!gs) return null;
    const me = playerByUserId(gs, forUserId);
    if (!me) return null;

    for (const color of DISEASE_COLORS) {
        if (gs.cures[color] !== 'none') continue;
        const handColorCount = me.hand.filter(id => isCityCardId(id) && CITIES[id].color === color).length;
        if (canDiscoverCure({
            atResearchStation: gs.cities[me.city]?.station ?? false,
            handColorCount,
            isScientist: me.role === 'scientist',
        })) {
            return {
                glyph: '🧪',
                text: `Your hand already pays for the ${DISEASE_COLOR_DEFS[color].name} cure — get to a research station and discover it.`,
            };
        }
    }

    let worst: { cityId: number; count: number } | null = null;
    for (let cityId = 0; cityId < gs.cities.length; cityId++) {
        for (const color of DISEASE_COLORS) {
            if (gs.cures[color] === 'eradicated') continue;
            const count = gs.cities[cityId].cubes[color];
            if (count > 0 && (!worst || count > worst.count)) worst = { cityId, count };
        }
    }
    if (worst) {
        return {
            glyph: '🦠',
            text: `${CITIES[worst.cityId].name} is sitting on ${pluralize(worst.count, 'cube')} — treat it before it outbreaks.`,
        };
    }

    return null;
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters.
export const outbreakRecapAdapter: IRecapAdapter = {
    className: "OutbreakGameType",
    toEvents,
    summarize,
    tip,
};
