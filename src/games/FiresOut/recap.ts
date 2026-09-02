import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome, IFiresOutEndTurnOutcome, FiresOutActionKind } from "@/utils/apiModels/GameLogic";
import type { IFiresOutSpecificGameStateResponse } from "@/games/FiresOut/apiModels";
import { VICTIMS_LOST_TO_LOSE, VICTIMS_TO_WIN } from "@/games/FiresOut/board";
import { specialistDef, SpecialistId } from "@/games/FiresOut/rules";
import { pluralize } from "@/utils/ui/text";

// §7's away-time story is the fire, not the crew's own choices — "the fire
// advanced once per crewmate since you last looked" (§17.6 step 11) — so this
// leans on IFiresOutEndTurnOutcome.advanceFire (already the structured, fully
// resolved summary of a chain of Advance Fire/flare-ups — FiresOutLogic.ts's
// applyEndTurn) rather than re-deriving it from a snapshot diff. The crew's
// own good news (a reveal, a rescue, a hazmat cleared, a Specialist swap)
// reads off the `target`/`specialist` every command already carries, the same
// way World Domination's recap reads a command's own fields rather than
// diffing territories.
const FO_REVEAL = "fo_reveal";
const FO_RESCUE = "fo_rescue";
const FO_HAZMAT = "fo_hazmat";
const FO_CREWCHANGE = "fo_crewchange";
const FO_SMOKE = "fo_smoke";
const FO_FIRE = "fo_fire";
const FO_EXPLOSION = "fo_explosion";
const FO_KNOCKDOWN = "fo_knockdown";
const FO_VICTIM_LOST = "fo_victimlost";
const FO_REPLENISH = "fo_replenish";
const FO_WIN = "fo_win";
const FO_LOSS = "fo_loss";

function state(snapshot: ITurnSnapshot): IFiresOutSpecificGameStateResponse {
    return snapshot.specificGameState as IFiresOutSpecificGameStateResponse;
}

const RESOLUTION_TYPE = { smoke: FO_SMOKE, fire: FO_FIRE, explosion: FO_EXPLOSION } as const;
const RESOLUTION_GLYPH = { smoke: '💨', fire: '🔥', explosion: '💥' } as const;
const RESOLUTION_VERB = { smoke: 'smoke filled', fire: 'fire caught at', explosion: 'an explosion tore through' } as const;

/**
 * Turns one replayed FiresOutAction into its recap row(s). Every command
 * carries `kind` and (for move/reveal) `target`, so the crew's own actions are
 * read straight off the command rather than diffed out of two snapshots; only
 * 'endTurn' needs its outcome, since Advance Fire is the one thing not chosen
 * by whoever's turn it is.
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
    const act = command as unknown as { kind: FiresOutActionKind; target?: number; specialist?: SpecialistId };

    switch (act.kind) {
        // Doors, extinguishing and chopping are this game's equivalent of a
        // Catan road — routine housekeeping that would drown out the beats
        // that matter — so only the two hidden-information payoffs (a POI
        // flipped face up) and the rescue/hazmat-disposal a move can trigger
        // get their own row.
        case 'move':
        case 'reveal': {
            const space = act.target;
            const poi = space !== undefined ? nextState.spaces[space]?.poi : undefined;
            const wasRevealed = space !== undefined ? prevState.spaces[space]?.poi?.revealed : undefined;
            if (poi?.revealed && !wasRevealed) {
                events.push({
                    ...base,
                    type: FO_REVEAL,
                    glyph: poi.victim ? '🧍' : '❓',
                    title: poi.victim
                        ? `${name} found a victim at space ${space}`
                        : `${name} found a false alarm at space ${space}`,
                });
            }
            const rescued = nextState.rescued - prevState.rescued;
            if (rescued > 0) {
                events.push({
                    ...base,
                    id: `${command.id}:rescue`,
                    type: FO_RESCUE,
                    glyph: '🚑',
                    title: `${name} rescued a victim! (${nextState.rescued}/${VICTIMS_TO_WIN})`,
                });
            }
            break;
        }

        case 'disposeHazmat':
            events.push({
                ...base,
                type: FO_HAZMAT,
                glyph: '☣️',
                title: `${name} removed a hazmat on the spot`,
            });
            break;

        case 'crewChange':
            if (act.specialist) {
                events.push({
                    ...base,
                    type: FO_CREWCHANGE,
                    glyph: '🔄',
                    title: `${name} swapped to the ${specialistDef(act.specialist).label}`,
                });
            }
            break;

        // Extinguish, chop, doors, drive and the deck gun are all routine
        // upkeep — the deck gun's own effect is "cleared threat", not a beat
        // worth a row of its own.
        default:
            break;
    }

    // ── The fire, the one thing nobody at the table chose (§7) ──────────────
    const advance = (outcome as IFiresOutEndTurnOutcome).advanceFire;
    if (advance) {
        const flareNote = advance.flareUpCount > 0 ? ` — chained into ${pluralize(advance.flareUpCount, 'flare-up')}` : '';
        events.push({
            ...base,
            id: `${command.id}:advance`,
            type: RESOLUTION_TYPE[advance.resolution],
            glyph: RESOLUTION_GLYPH[advance.resolution],
            title: `Advance Fire: rolled ${advance.rolls.d6},${advance.rolls.d8} — ${RESOLUTION_VERB[advance.resolution]} space ${advance.target}${flareNote}`,
        });

        if (advance.knockedDownOwnerIds.length > 0) {
            events.push({
                ...base,
                id: `${command.id}:knockdown`,
                type: FO_KNOCKDOWN,
                glyph: '🤕',
                title: `${pluralize(advance.knockedDownOwnerIds.length, 'firefighter')} knocked down and carried outside`,
                affectedIds: advance.knockedDownOwnerIds,
            });
        }

        if (advance.victimsLost > 0) {
            events.push({
                ...base,
                id: `${command.id}:lost`,
                type: FO_VICTIM_LOST,
                glyph: '💔',
                title: `${pluralize(advance.victimsLost, 'victim')} lost to the fire (${nextState.lost}/${VICTIMS_LOST_TO_LOSE})`,
            });
        }

        if (advance.poiPlaced > 0) {
            events.push({
                ...base,
                id: `${command.id}:replenish`,
                type: FO_REPLENISH,
                glyph: '📋',
                title: `Replenish: ${pluralize(advance.poiPlaced, 'new POI marker')} placed`,
            });
        }
    }

    // ── The ending, however it lands, regardless of which command caused it ──
    if (next.complete && !prev.complete) {
        const won = nextState.rescued >= VICTIMS_TO_WIN;
        events.push({
            ...base,
            id: `${command.id}:ending`,
            type: won ? FO_WIN : FO_LOSS,
            glyph: won ? '🎉' : '💀',
            title: won ? `${VICTIMS_TO_WIN} victims rescued — the crew wins!` : (next.history[0]?.text ?? 'The crew has lost.'),
            affectedIds: nextState.firefighters.map(ff => ff.ownerId),
        });
    }

    return events;
}

function summarize(events: IGameEvent[], _forUserId: string): IRecapSummary {
    const explosions = events.filter(e => e.type === FO_EXPLOSION).length;
    const knockdowns = events.some(e => e.type === FO_KNOCKDOWN);
    const victimsLost = events.some(e => e.type === FO_VICTIM_LOST);
    const rescues = events.filter(e => e.type === FO_RESCUE).length;
    const lost = events.some(e => e.type === FO_LOSS);
    const won = events.some(e => e.type === FO_WIN);
    const beats = events.filter(e => e.type !== FO_WIN && e.type !== FO_LOSS).length;

    let tail = '.';
    if (lost) {
        tail = ' — and the crew couldn’t make it out in time. 💀';
    } else if (won) {
        tail = ' — and the crew rescued everyone! 🎉';
    } else if (victimsLost) {
        tail = ' — the crew lost someone to the fire.';
    } else if (explosions > 0) {
        tail = ` — ${pluralize(explosions, 'explosion')} rocked the building.`;
    } else if (knockdowns) {
        tail = ' — a firefighter was knocked down and carried outside.';
    } else if (rescues > 0) {
        tail = rescues > 1 ? ' — more victims made it out.' : ' — another victim made it out.';
    }

    return {
        headline: 'Your turn again 👋',
        subline: `${pluralize(beats, 'thing', 'things')} happened while you were away${tail}`,
    };
}

// Points the viewer at the most urgent open thread: a revealed victim still
// waiting to be carried out, since finding one is only half the job (§10.1-
// 10.2) — falling back to how close the building is to collapse (§5) when
// nothing is waiting.
function tip(liveState: unknown, _forUserId: string): IRecapTip | null {
    const gs = liveState as IFiresOutSpecificGameStateResponse | undefined;
    if (!gs) return null;

    const waitingVictims = gs.spaces.filter(s => s.poi?.revealed && s.poi.victim).length;
    if (waitingVictims > 0) {
        return {
            glyph: '🧍',
            text: `${pluralize(waitingVictims, 'revealed victim')} still waiting to be carried out.`,
        };
    }

    const hazmats = gs.spaces.filter(s => s.hazmat).length;
    if (hazmats > 0) {
        return {
            glyph: '☣️',
            text: `${pluralize(hazmats, 'hazmat')} still on the board — clear it before it catches.`,
        };
    }

    return null;
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters.
export const firesOutRecapAdapter: IRecapAdapter = {
    className: "FiresOutGameType",
    toEvents,
    summarize,
    tip,
};
