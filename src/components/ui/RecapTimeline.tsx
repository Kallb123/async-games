import React from 'react';

export interface RecapTimelineEvent {
    id: string;
    /** The dot beside the entry — normally the acting player's colour. */
    dotColour: string;
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
export default function RecapTimeline({ events, compact = false }: RecapTimelineProps) {
    return (
        <ol className={`ag-recap-timeline${compact ? ' ag-recap-timeline--compact' : ''}`}>
            {events.map((event) => (
                <React.Fragment key={event.id}>
                    {event.dividerBefore && (
                        <li className="ag-recap-divider" role="separator">
                            <span className="ag-recap-divider-label">{event.dividerBefore}</span>
                        </li>
                    )}
                    <li className="ag-recap-event">
                        <span className="ag-recap-dot" style={{ background: event.dotColour }} />
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
