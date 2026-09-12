'use client'
import TurnRecap, { TurnRecapEvent } from '@/components/games/TurnRecap';
import type { IBannedIsletPlayerStateResponse } from '@/games/BannedIslet/apiModels';
import type { IBannedIsletFloodLogEntry, IBannedIsletSwim } from '@/games/BannedIslet/rules';
import { LOSING_WATER_LEVEL, tileName } from '@/games/BannedIslet/board';
import { meta } from '@/games/BannedIslet/meta';
import { playerColourForId } from '@/utils/ui/playerColours';
import { pluralize } from '@/utils/ui/text';

interface BannedIsletEndTurnScreenProps {
    floodLog: IBannedIsletFloodLogEntry[];
    /** Every seat, so a swim row can name and colour the pawn it moved. */
    playerStates: { [userId: string]: IBannedIsletPlayerStateResponse };
    /** Player ids in join order — pawn colours follow it, matching the board. */
    userIdList: string[];
    /** The island as it stands now, so a swim row can say which tile the pawn surfaced on. */
    tileAt: (position: number) => string;
    onDismiss: () => void;
}

// The two dots the island itself earns: a tile that only flooded is still
// there, a tile that sank is a hole. Both are read alongside the glyph rather
// than instead of it (§17), so the timeline stays legible in greyscale.
const FLOODED_DOT = meta.accent;
const SUNK_DOT = '#0b3b46';

/** One swim, as its own row — §21.3: the app decided this, so it is never a silent pawn teleport. */
function swimEvent(swim: IBannedIsletSwim, id: string, name: string, colour: string, tileAt: (position: number) => string): TurnRecapEvent {
    if (swim.to === null) {
        return {
            id,
            dotColour: colour,
            glyph: '💀',
            title: `${name} went into the water with nowhere to swim`,
            detail: 'Every tile around them was already gone.',
        };
    }
    return {
        id,
        dotColour: colour,
        glyph: '🏊',
        title: `${name} swam to ${tileAt(swim.to)}`,
        detail: 'One Move on their own turn puts them back where they meant to be.',
    };
}

/**
 * One log entry as one or more timeline rows. Every line here mirrors the
 * wording BannedIsletLogic.ts already wrote to `gameState.history` for the
 * same event, so this screen and the turn log a player can still scroll back
 * through tell the same story.
 */
function eventsFor(
    entry: IBannedIsletFloodLogEntry,
    index: number,
    playerStates: { [userId: string]: IBannedIsletPlayerStateResponse },
    userIdList: string[],
    tileAt: (position: number) => string,
): TurnRecapEvent[] {
    const id = `${index}`;

    if (entry.kind === 'watersRise') {
        if (entry.floodRateAfter === undefined) {
            return [{
                id,
                dotColour: SUNK_DOT,
                glyph: '💀',
                title: `Waters Rise! The meter reached ${LOSING_WATER_LEVEL}`,
                detail: 'The sea wins.',
            }];
        }
        return [{
            id,
            dotColour: SUNK_DOT,
            glyph: '📈',
            title: `Waters Rise! The water meter climbs to level ${entry.waterLevelAfter}`,
            detail: `${pluralize(entry.shuffledBack ?? 0, 'flood card')} go back on top of the deck — the island now loses ${pluralize(entry.floodRateAfter, 'tile')} a turn.`,
        }];
    }

    if (entry.kind === 'reshuffle') {
        return [{
            id,
            dotColour: FLOODED_DOT,
            glyph: '🔁',
            title: 'The flood deck ran dry',
            detail: `${pluralize(entry.shuffledBack ?? 0, 'card')} shuffled back into it, and the draw carried on.`,
        }];
    }

    const name = tileName(entry.tile!);
    if (entry.outcome !== 'sunk') {
        return [{ id, dotColour: FLOODED_DOT, glyph: '🌊', title: `${name} floods`, detail: 'One more flood card and it is gone.' }];
    }

    const sinking: TurnRecapEvent = {
        id,
        dotColour: SUNK_DOT,
        glyph: '🕳️',
        title: `${name} sinks for good`,
        detail: 'Its flood card leaves the game, so the deck closes in on what is left.',
    };
    const swims = (entry.swims ?? []).map((swim, i) => swimEvent(
        swim,
        `${id}-swim-${i}`,
        playerStates[swim.userId]?.username ?? 'A player',
        playerColourForId(swim.userId, userIdList),
        tileAt,
    ));
    return [sinking, ...swims];
}

function summaryFor(floodLog: IBannedIsletFloodLogEntry[]): { headline: string; subline: string } {
    const sunk = floodLog.filter(e => e.kind === 'flood' && e.outcome === 'sunk');
    const flooded = floodLog.filter(e => e.kind === 'flood' && e.outcome === 'flooded').length;
    const drowned = floodLog.some(e => e.swims?.some(s => s.to === null));
    const rise = floodLog.find(e => e.kind === 'watersRise');

    if (drowned) {
        return { headline: '💀 Nowhere to swim', subline: 'A tile went under with a pawn on it and no land in reach.' };
    }
    if (rise && rise.floodRateAfter === undefined) {
        return { headline: '💀 The sea wins', subline: `The water meter reached ${LOSING_WATER_LEVEL}.` };
    }
    if (rise) {
        return {
            headline: '🌊 Waters Rise!',
            subline: 'Everything the island has already suffered is back on top of the deck.',
        };
    }
    if (sunk.length > 0) {
        return {
            headline: '🕳️ The island is smaller',
            subline: `${sunk.map(e => tileName(e.tile!)).join(' and ')} ${sunk.length === 1 ? 'is' : 'are'} gone for good.`,
        };
    }
    if (flooded > 0) {
        return { headline: 'The tide comes in', subline: `${pluralize(flooded, 'tile')} went under water — each of them one card from sinking.` };
    }
    return { headline: 'The tide holds', subline: 'The sea had nothing left to draw this turn.' };
}

/**
 * The end-of-turn reveal: what the draw and flood phases just did, shown to
 * the player who caused them the instant BannedIsletEndTurn (or the discard
 * that closed the same turn) comes back, before the board moves on.
 *
 * This is the moment §1's pitch is actually delivered — *a deck that deletes
 * the floor under your feet* — so it gets a screen rather than a toast.
 * Reusing the "since you were last here" shell (`TurnRecap`) rather than
 * building a third one, exactly as `OutbreakEndTurnScreen` does: the two are
 * the same picture (a dark header, a headline, a timeline), just for a
 * different stretch of time.
 */
export default function BannedIsletEndTurnScreen({
    floodLog,
    playerStates,
    userIdList,
    tileAt,
    onDismiss,
}: BannedIsletEndTurnScreenProps) {
    return (
        <TurnRecap
            header={{ name: meta.name, accent: meta.accent, glyph: meta.glyph }}
            since="This turn"
            summary={summaryFor(floodLog)}
            events={floodLog.flatMap((entry, index) => eventsFor(entry, index, playerStates, userIdList, tileAt))}
            cta={{ label: 'Back to the island', onClick: onDismiss }}
        />
    );
}
