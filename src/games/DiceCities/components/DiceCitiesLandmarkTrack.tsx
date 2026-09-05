import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import { buildableLandmarks } from "@/games/DiceCities/ui";
import ZoomableCardArt from "@/games/DiceCities/components/ZoomableCardArt";
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
export default function DiceCitiesLandmarkTrack({ seats, userIdList, myUserId, enabledDocks }: DiceCitiesLandmarkTrackProps) {
    const me = seats.find((s) => s.userId === myUserId);

    return (
        <div className="ag-dc-landmarks">
            <div className="ag-dc-landmarks-head">
                Landmarks · build all 4 to win{enabledDocks ? " · the Harbour is a bonus" : ""}
            </div>
            <div className="ag-dc-landmark-row">
                {buildableLandmarks(enabledDocks).map(({ cardId, flag }) => {
                    const card = DiceCitiesCards[cardId];
                    const built = Boolean(me?.[flag]);
                    const builders = seats.filter((s) => s[flag]);
                    return (
                        <div
                            key={cardId}
                            className={`ag-dc-landmark${built ? " ag-dc-landmark--built" : ""}`}
                        >
                            <ZoomableCardArt card={card} className="ag-dc-landmark-icon" />
                            <div className="ag-dc-landmark-name">{card.title}</div>
                            <div className="ag-dc-landmark-cost">{built ? "✓ built" : `${card.cost}🪙`}</div>
                            {/* One pip per seat, always in the same position on
                                every tile: read across a tile for who holds
                                that landmark, down a column for what one player
                                has. Filled means built and hollow means not, so
                                shape carries the state and colour is left to
                                carry identity. The pips themselves are hidden
                                from assistive tech in favour of the one label
                                on the row, which says the same thing in words. */}
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
                                        aria-hidden="true"
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
