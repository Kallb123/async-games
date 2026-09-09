import React from 'react';

/** The side of a `marker` badge, in px — pass it as the `Avatar` `size`. The
 *  source of truth for the badge's size: the list publishes it to CSS as
 *  `--ag-recap-marker-size` below, and the `--markers` rail and divider offsets
 *  in `ag-theme.css` are `calc`'d from that, so nothing has to be kept in step
 *  by hand. */
export const RECAP_MARKER_SIZE = 26;

interface RecapTimelineEventBase {
    id: string;
    title: React.ReactNode;
    detail?: React.ReactNode;
    /** Rendered on the right of the title row, e.g. a reaction picker. */
    trailing?: React.ReactNode;
    /** A labelled divider rendered above this entry, breaking the connecting
     *  rail — the in-game chat thread's "new messages" line above the first
     *  message that arrived since the panel was last opened. */
    dividerBefore?: React.ReactNode;
}

/**
 * One entry, marked either way but never neither — `tsc` refuses an entry
 * carrying both or nothing, which would otherwise render an invisible dot.
 *
 * - `dotColour`: the plain dot, normally the acting player's colour.
 * - `marker`: something richer standing in the dot's place — the chat thread's
 *   sender avatar, ringed in their seat colour. All or nothing *per list*: one
 *   marker widens the whole timeline's marker column (`--markers`), so a dot
 *   row mixed in among marker rows would sit off the rail. That part is prose,
 *   not types; every list today is one or the other.
 */
export type RecapTimelineEvent = RecapTimelineEventBase & (
    | { dotColour: string; marker?: never }
    | { marker: React.ReactNode; dotColour?: never }
);

interface RecapTimelineProps {
    events: RecapTimelineEvent[];
    /** The tighter in-game scale, for a reference strip rather than a whole screen. */
    compact?: boolean;
}

// A thread of things that happened, each dotted in the colour of whoever did it:
// the turn recap's "since you were last here" list and the in-game match history
// are the same picture at two sizes, so they are the same component.
//
// An entry can carry a `marker` instead of that dot — the chat thread puts the
// sender's `Avatar` there, ringed in their seat colour. The rail and the unread
// divider then move over to clear the wider badge, which is what `--markers` on
// the list is for; the timeline itself is otherwise unchanged. A marker is sized
// by `RECAP_MARKER_SIZE`, which the geometry in `ag-theme.css` is derived from,
// so the two can't drift.
//
// Forwards its `<ol>` (the scrollable element in compact mode) so a caller like
// the chat panel can read/set scroll position — e.g. to follow new messages.
const RecapTimeline = React.forwardRef<HTMLOListElement, RecapTimelineProps>(
    function RecapTimeline({ events, compact = false }, ref) {
        const hasMarkers = events.some(event => event.marker);
        const className = `ag-recap-timeline${compact ? ' ag-recap-timeline--compact' : ''}${hasMarkers ? ' ag-recap-timeline--markers' : ''}`;
        // The badge size travels to the CSS that positions the rail and the
        // divider around it, so `RECAP_MARKER_SIZE` is the only place it is
        // written down (the stylesheet's own value is a fallback).
        const markerSize = hasMarkers
            ? { '--ag-recap-marker-size': `${RECAP_MARKER_SIZE}px` } as React.CSSProperties
            : undefined;
        return (
            <ol ref={ref} className={className} style={markerSize}>
                {events.map((event) => (
                    <React.Fragment key={event.id}>
                        {event.dividerBefore && (
                            <li className="ag-recap-divider" role="separator">
                                <span className="ag-recap-divider-label">{event.dividerBefore}</span>
                            </li>
                        )}
                        <li className="ag-recap-event">
                            {event.marker
                                ? <span className="ag-recap-marker">{event.marker}</span>
                                : <span className="ag-recap-dot" style={{ background: event.dotColour }} />}
                            <div className="ag-recap-event-card">
                                <div className="ag-recap-event-row">
                                    <div className="ag-recap-event-title">{event.title}</div>
                                    {event.trailing}
                                </div>
                                {event.detail && <div className="ag-recap-event-detail">{event.detail}</div>}
                            </div>
                        </li>
                    </React.Fragment>
                ))}
            </ol>
        );
    }
);

export default RecapTimeline;
