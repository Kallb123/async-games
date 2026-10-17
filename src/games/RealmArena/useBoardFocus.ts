import { useMemo, useState } from "react";
import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import { ACTION_POINTS, isStanding, type BattleState, type Fighter } from "./rules";
import { boardFocus, reachFocus, type BoardFocusArea, type BoardFollow } from "./ui";

interface BoardFocusSource {
    field: Battlefield;
    fighters: readonly Fighter[];
    sides?: BattleState["sides"];
    rulesVersion?: number;
    selected?: Fighter;
    /** Whose turn it is: a character of theirs frames the reach of the AP it has left, anyone else's a full turn's. */
    acting?: string | null;
    /** The squad being placed, and which of it is picked up. */
    sealed?: readonly { square: Square }[] | null;
    placing?: { selected: number | null } | null;
    follow?: BoardFollow | null;
    home?: { squares: readonly Square[]; key: string } | null;
    refocus?: number;
    /** Something is playing over the board. */
    playing: boolean;
}

/**
 * Where the battlefield's view goes and when what it plays may start, however
 * the board is drawn: the region to bring into view (`boardFocus`, in
 * squares, for the board to project), whether a playback is held while the
 * view glides there (`held`, until the board says it has all but landed,
 * `onFocused`), and whether the camera follows a walk too long to frame
 * (`tracks`). A selected character's reach is a search over the whole map, so
 * it's only redone when the selection or the board moves.
 */
export function useBoardFocus({ field, fighters, sides, rulesVersion, selected, acting, sealed, placing, follow, home, refocus = 0, playing }: BoardFocusSource): {
    area: BoardFocusArea | null;
    held: boolean;
    onFocused: (key: string) => void;
    tracks: boolean;
} {
    const reach = useMemo(
        () => selected && isStanding(selected) ? reachFocus({ field, fighters: [...fighters], sides, rulesVersion }, selected, acting === selected.owner ? selected.ap : ACTION_POINTS) : null,
        [field, fighters, sides, rulesVersion, selected, acting],
    );
    // A character picked up to place is brought close enough to tap a square beside it.
    const pickedUp = placing?.selected != null ? sealed?.[placing.selected] : undefined;
    const area = boardFocus(field, { follow, pickedUp, selected, reach, home, refocus });
    // What the board plays waits for the view to get there: an action plays
    // only once the glide to it has landed, so nothing happens while the
    // board is still moving.
    const [landed, setLanded] = useState<string | null>(null);
    const held = playing && !!area && landed !== area.key;
    const tracks = !!follow && !("aim" in follow) && !!follow.track && playing && !held;
    return { area, held, onFocused: setLanded, tracks };
}
