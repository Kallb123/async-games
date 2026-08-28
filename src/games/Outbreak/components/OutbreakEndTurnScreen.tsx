'use client'
import TurnRecap, { TurnRecapEvent } from '@/components/games/TurnRecap';
import type { IOutbreakInfectionLogEntry } from '@/games/Outbreak/rules';
import { CITIES, DISEASE_COLOR_DEFS } from '@/games/Outbreak/board';
import { describeOutbreakChain } from '@/games/Outbreak/narration';
import { meta } from '@/games/Outbreak/meta';
import { pluralize } from '@/utils/ui/text';

interface OutbreakEndTurnScreenProps {
    infectionLog: IOutbreakInfectionLogEntry[];
    onDismiss: () => void;
}

// A card drawn with no colour to dot it by (One Quiet Night's skip, or an
// epidemic whose Infect step found the deck empty) falls back to the game's
// own accent rather than any one disease's.
const NEUTRAL_DOT = meta.accent;

// One log entry's row: title, detail and the dot colour it earns. Every case
// mirrors the exact wording OutbreakLogic.ts already wrote to gameState.history
// for the same event, so the story here matches the turn log a player can
// still scroll back through.
function eventFor(entry: IOutbreakInfectionLogEntry, index: number): TurnRecapEvent {
    const id = `${index}`;
    const dotColour = entry.color ? DISEASE_COLOR_DEFS[entry.color].hex : NEUTRAL_DOT;

    if (entry.kind === 'quietNight') {
        return { id, dotColour, glyph: '🌙', title: 'One Quiet Night skipped the Infect Cities phase' };
    }

    if (entry.kind === 'epidemic') {
        const base: TurnRecapEvent = { id, dotColour, glyph: '📈', title: `Epidemic! The infection rate rises to ${entry.rateAfter}` };
        if (entry.cityId === undefined) return base;
        const cityName = CITIES[entry.cityId].name;
        switch (entry.outcome) {
            case 'eradicated':
                return { ...base, detail: `Drew ${cityName} — already eradicated, no effect` };
            case 'contained':
                return { ...base, detail: `Drew ${cityName} — contained by the Quarantine Specialist` };
            case 'outbreak':
                return { ...base, detail: `${cityName} was already saturated — outbreak! ${describeOutbreakChain(entry.outbreakChain)}` };
            default:
                return { ...base, detail: `Infects ${cityName} with 3 cubes of ${DISEASE_COLOR_DEFS[entry.color!].name}` };
        }
    }

    // kind === 'infect'
    const cityName = CITIES[entry.cityId!].name;
    const colorName = DISEASE_COLOR_DEFS[entry.color!].name;
    switch (entry.outcome) {
        case 'eradicated':
            return { id, dotColour, glyph: '🧬', title: `${cityName} drawn — ${colorName} is already eradicated`, detail: 'No effect' };
        case 'contained':
            return { id, dotColour, glyph: '🛡️', title: `${cityName} contained by the Quarantine Specialist`, detail: `${colorName} infection blocked` };
        case 'outbreak':
            return {
                id, dotColour, glyph: '💥',
                title: `Outbreak in ${cityName}!`,
                detail: describeOutbreakChain(entry.outbreakChain),
            };
        default:
            return { id, dotColour, glyph: '🦠', title: `${cityName} infected with ${colorName}` };
    }
}

function summaryFor(log: IOutbreakInfectionLogEntry[]): { headline: string; subline: string } {
    const outbreaks = log.filter(e => e.outcome === 'outbreak').length;
    const epidemics = log.filter(e => e.kind === 'epidemic').length;
    const contained = log.filter(e => e.outcome === 'contained').length;
    const placed = log.filter(e => e.outcome === 'placed').length;

    if (outbreaks > 0) {
        return { headline: '💥 Outbreak!', subline: `${pluralize(outbreaks, 'outbreak')} hit the board this turn.` };
    }
    if (epidemics > 0) {
        return { headline: '📈 Epidemic!', subline: 'The infection rate just climbed.' };
    }
    if (log.some(e => e.kind === 'quietNight')) {
        return { headline: '🌙 A quiet night', subline: 'One Quiet Night skipped the Infect Cities phase entirely.' };
    }
    if (contained > 0 && placed === 0) {
        return { headline: '🛡️ Held the line', subline: `The Quarantine Specialist blocked every infection drawn this turn.` };
    }
    if (placed > 0) {
        return { headline: 'Turn resolved', subline: `${pluralize(placed, 'city was', 'cities were')} infected this turn.` };
    }
    return { headline: 'Turn resolved', subline: 'Every card drawn had already been dealt with.' };
}

// The end-of-turn screen: what the draw and infect phases just did, for the
// player who caused them — shown the instant OutbreakEndTurn (or a
// hand-limit discard/event that finishes the same phase) comes back, before
// the board moves on. Reuses the "since you were last here" recap shell
// (TurnRecap) rather than a bespoke screen, since the two are the same
// picture — a dark header, a headline, a timeline — just for a different
// stretch of time.
export default function OutbreakEndTurnScreen({ infectionLog, onDismiss }: OutbreakEndTurnScreenProps) {
    return (
        <TurnRecap
            header={{ name: meta.name, accent: meta.accent, glyph: meta.glyph }}
            since="This turn"
            summary={summaryFor(infectionLog)}
            events={infectionLog.map(eventFor)}
            cta={{ label: 'Back to the board', onClick: onDismiss }}
        />
    );
}
