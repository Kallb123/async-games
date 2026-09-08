import type { IFiresOutFirefighterResponse } from '@/games/FiresOut/apiModels';
import { playerColour, playerColourForId } from '@/utils/ui/playerColours';

// Who a figure *is*, as far as any screen showing one is concerned — the
// board's pawns, the scoreboard's pills, the Advance Fire payoff screen's
// knockdown line and the Fire Captain's "directing…" label all ask here
// (fires-out-gdd.md §17.2 gap 3, §17.6 step 12). Pure presentation, so it
// lives beside the game's other pure modules rather than inside the board
// component that happens to draw the pawns.

/** The bit of a figure these two need: who owns it and what that player is called. */
type Figure = Pick<IFiresOutFirefighterResponse, 'ownerId' | 'username'>;

/**
 * Is this board §1's solitaire mode — several figures in one player's hands?
 *
 * Asked of the roster rather than of `userIdList.length`, because "every
 * figure has the same owner" is the property that actually matters here and a
 * seat count is only a proxy for it. It is also the very predicate the
 * turn-timeout adapter uses to decide a turn it cannot resolve
 * (`utils/games/turnTimeout.ts`), so the two agree about what a solo board is
 * by construction rather than by coincidence.
 */
export function isSoloCrew(firefighters: readonly Figure[]): boolean {
    return firefighters.length > 1 && firefighters.every(ff => ff.ownerId === firefighters[0].ownerId);
}

/**
 * The name and the colour the figure at `index` is shown by.
 *
 * A crew board takes both from the figure's *owner*, which is the colour and
 * the name every other surface already uses for that player: the log, the
 * recap, the scoreboard's seat order. A solitaire crew has one owner for every
 * figure, so doing that there would paint the whole crew a single colour and
 * label all six of them "You" — §17.2 gap 3's index into `firefighters` is the
 * only thing that tells one from another, so it is what names and colours
 * them. `playerColour` has exactly six colours and `MAX_SOLO_CREW` is six, so
 * a solo crew never wraps.
 *
 * Takes the whole roster rather than one figure so it can answer `isSoloCrew`
 * itself; an index past the end is answered rather than thrown on, since a
 * screen may ask before its game data has loaded.
 *
 * `viewerId` is optional because a board tooltip wants the player's real name
 * where a scoreboard pill wants "You".
 */
export function figureIdentity(
    index: number,
    firefighters: readonly Figure[],
    userIdList: string[],
    viewerId?: string,
): { name: string; colour: string } {
    if (isSoloCrew(firefighters)) {
        return { name: `Firefighter ${index + 1}`, colour: playerColour(index) };
    }
    const ff = firefighters[index];
    return {
        name: ff?.ownerId === viewerId ? 'You' : (ff?.username ?? ''),
        colour: playerColourForId(ff?.ownerId, userIdList),
    };
}
