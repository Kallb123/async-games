'use client'
import TurnRecap from '@/components/games/TurnRecap';
import type { IRecapResponse } from '@/app/api/game/[gameid]/recap/route';

interface TurnRecapScreenProps {
    /** The fetched recap. `useTurnRecap`'s `show` is what says it's ready. */
    recap: IRecapResponse;
    /** The button back into the board — the one line each game words itself. */
    cta: string;
    onDismiss: () => void;
    onReact: (eventId: string, reaction: string) => void;
}

// The "since you were last here" screen as every game shows it: the recap the
// API sent, mapped onto TurnRecap's props. Games differ only in the wording of
// the call-to-action, so that's the only prop a page passes beyond the recap.
// The payload is guaranteed by the hook's `show` — a game must not render this
// on its own guess.
export default function TurnRecapScreen({ recap, cta, onDismiss, onReact }: TurnRecapScreenProps) {
    return (
        <TurnRecap
            header={recap.header!}
            summary={recap.summary!}
            events={(recap.events ?? []).map((event) => ({
                id: event.id,
                glyph: event.glyph,
                title: event.title,
                detail: event.detail,
                timestamp: event.timestamp,
                dotColour: event.dotColour,
                reaction: event.reaction,
            }))}
            chat={recap.chat}
            tip={recap.tip}
            cta={{ label: cta, onClick: onDismiss }}
            onReact={onReact}
        />
    );
}
