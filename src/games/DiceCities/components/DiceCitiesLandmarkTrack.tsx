import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCardIds } from "@/games/DiceCities/cards";
import { buildableLandmarks, LANDMARKS } from "@/games/DiceCities/ui";
import type { DiceCitiesTheme } from "@/games/DiceCities/themes";
import ZoomableCardArt from "@/games/DiceCities/components/ZoomableCardArt";
import { capitalise } from "@/utils/ui/text";
import { playerColourForId } from "@/utils/ui/playerColours";

interface DiceCitiesLandmarkTrackProps {
    /** Every city at the table, in the order the stack below shows them. */
    seats: IDiceCitiesPlayerStateResponse[];
    /** Seat order, so a player's colour matches the scoreboard and the log. */
    userIdList: string[];
    /** The viewer's seat. Empty for a spectator, who then owns no tile. */
    myUserId: string;
    /** Docks games add the Harbour to the track. */
    enabledDocks: boolean;
    /** The theme this game is played in: it names every card on the track and
     *  the nouns the head line uses. */
    theme: DiceCitiesTheme;
}

/**
 * The landmark track — one tile per landmark, shared by the whole table.
 *
 * A city's establishments are open-ended and differ wildly from player to
 * player, which is why each gets a panel of its own below this. Landmarks are
 * the opposite: the same four (five with the Docks) fixed slots for everybody.
 * That makes the table's progress a matrix rather than a list each, and one
 * shared track is both smaller than a track per city and the only version that
 * answers "who is about to win, and on what" at a glance. Each tile still
 * reports the viewer's own progress in its styling, exactly as it did when
 * this lived in `DiceCitiesBoard`; the pips underneath add everyone else.
 *
 * See docs/games/dice-cities.md §11.4.
 */
export default function DiceCitiesLandmarkTrack({ seats, userIdList, myUserId, enabledDocks, theme }: DiceCitiesLandmarkTrackProps) {
    const words = theme.words;
    return (
        <div className="ag-dc-landmarks">
            <div className="ag-dc-landmarks-head">
                {capitalise(words.landmarks)} · build all {LANDMARKS.length} to win
                {enabledDocks ? ` · the ${theme.cards[DiceCitiesCardIds.HARBOUR].title} is a bonus` : ""}
            </div>
            <div className="ag-dc-landmark-row">
                {buildableLandmarks(enabledDocks).map(({ cardId, flag }) => {
                    const card = theme.cards[cardId];
                    const builders = seats.filter((s) => s[flag]);
                    const built = builders.some((b) => b.userId === myUserId);
                    return (
                        <div
                            key={cardId}
                            className={`ag-dc-landmark${built ? " ag-dc-landmark--built" : ""}`}
                        >
                            <ZoomableCardArt card={card} theme={theme} className="ag-dc-landmark-icon" />
                            <div className="ag-dc-landmark-name">{card.title}</div>
                            <div className="ag-dc-landmark-cost">{built ? "✓ built" : `${card.cost}🪙`}</div>
                            {/* One pip per seat, always in the same position on
                                every tile: read across a tile for who holds
                                that landmark, down a column for what one player
                                has. Filled means built and hollow means not, so
                                shape carries the state and colour is left to
                                carry identity. The row is one `img` to
                                assistive tech, labelled with the same thing in
                                words, rather than a pip each to wade through. */}
                            <div
                                className="ag-dc-pips"
                                role="img"
                                aria-label={builders.length > 0
                                    ? `${card.title}: built by ${builders.map((b) => b.userId === myUserId ? "you" : b.username).join(", ")}`
                                    : `${card.title}: nobody has built it`}
                            >
                                {seats.map((s) => (
                                    <span
                                        key={s.userId}
                                        className={`ag-dc-pip${s[flag] ? " ag-dc-pip--built" : ""}${s.userId === myUserId ? " ag-dc-pip--me" : ""}`}
                                        style={{ color: playerColourForId(s.userId, userIdList) }}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
