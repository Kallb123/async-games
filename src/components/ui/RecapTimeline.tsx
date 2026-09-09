import React from 'react';

/** The side of a `marker` badge, in px — pass it as the `Avatar` `size`. The
 *  `--markers` rail and divider offsets in `ag-theme.css` are `calc`'d from
 *  `--ag-recap-marker-size`, which this has to match: change one, change both. */
export const RECAP_MARKER_SIZE = 26;

export interface RecapTimelineEvent {
    id: string;
    /** The dot beside the entry — normally the acting player's colour. Ignored
     *  when `marker` is given. */
    dotColour?: string;
    /** Stands in the plain dot's place when a colour alone isn't enough to say
     *  whose entry this is — the chat thread's sender avatar, ringed in their
     *  seat colour. All or nothing per list: one marker widens the whole
     *  timeline's marker column (see `--markers` below), so a dot row mixed in
     *  among marker rows would sit off the rail. */
    marker?: React.ReactNode;
    title: React.ReactNode;
    detail?: React.ReactNode;
    /** Rendered on the right of the title row, e.g. a reaction picker. */
    trailing?: React.ReactNode;
    /** A labelled divider rendered above this entry, breaking the connecting
     *  rail — the in-game chat thread's "new messages" line above the first
     *  message that arrived since the panel was last opened. */
    dividerBefore?: React.ReactNode;
}

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
        return (
            <ol ref={ref} className={className}>
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
