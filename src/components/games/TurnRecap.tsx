'use client'
import React from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/utils/ui/time';
import { useNowToTheMinute } from '@/utils/hooks/useNow';
import ReactionPicker from '@/components/ui/ReactionPicker';

export interface TurnRecapEvent {
    id: string;
    glyph?: string;
    title: string;
    detail?: string;
    timestamp: string;
    dotColour: string;
    /** The reaction already sent for this action (there's only ever the viewer's), or null. */
    reaction?: string | null;
}

interface TurnRecapProps {
    header: { name: string; accent: string; glyph?: string };
    summary: { headline: string; subline: string };
    events: TurnRecapEvent[];
    tip?: { glyph: string; text: string } | null;
    cta: { label: string; onClick: () => void };
    /** Where the header's back control goes. Defaults to the home dashboard. */
    backHref?: string;
    /** Called when the player reacts to one action in the timeline. Omit to hide reactions entirely. */
    onReact?: (eventId: string, reaction: string) => void;
}

// Named theme accents get a design-system class; a raw hex accent is applied
// inline. Keeps the recap header tinted like the rest of the game's chrome.
const ACCENT_CLASSES = new Set(['terracotta', 'green', 'gold', 'purple']);

// The game-agnostic "since you were last here" recap screen: a dark header, a
// welcome-back headline, a player-coloured timeline of what happened while you
// were away, an optional strategic tip, and a call-to-action into the board.
// One component, every game — driven entirely by props.
export default function TurnRecap({ header, summary, events, tip, cta, backHref = '/', onReact }: TurnRecapProps) {
    const now = useNowToTheMinute();
    const accentClass = ACCENT_CLASSES.has(header.accent) ? `ag-accent-${header.accent}` : undefined;
    const accentStyle = accentClass ? undefined : { background: header.accent };

    return (
        <div className="ag-recap">
            <div className="ag-recap-head">
                <Link
                    className={`ag-recap-glyph ${accentClass ?? ''}`}
                    style={accentStyle}
                    href={backHref}
                    aria-label="Back"
                >
                    {header.glyph ?? '←'}
                </Link>
                <div className="ag-recap-head-main">
                    <div className="ag-recap-game">{header.name}</div>
                    <div className="ag-recap-since">Since your last turn</div>
                </div>
            </div>

            <div className="ag-recap-body">
                <h1 className="ag-recap-headline">{summary.headline}</h1>
                <p className="ag-recap-subline">{summary.subline}</p>

                <ol className="ag-recap-timeline">
                    {events.map((event) => {
                        const when = formatRelativeTime(event.timestamp, now);
                        const detail = [event.detail, when].filter(Boolean).join(' · ');
                        return (
                            <li key={event.id} className="ag-recap-event">
                                <span className="ag-recap-dot" style={{ background: event.dotColour }} />
                                <div className="ag-recap-event-card">
                                    <div className="ag-recap-event-row">
                                        <div className="ag-recap-event-title">
                                            {event.title}
                                            {event.glyph ? ` ${event.glyph}` : ''}
                                        </div>
                                        {onReact && (
                                            <ReactionPicker
                                                reacted={event.reaction}
                                                onReact={(reaction) => onReact(event.id, reaction)}
                                            />
                                        )}
                                    </div>
                                    {detail && <div className="ag-recap-event-detail">{detail}</div>}
                                </div>
                            </li>
                        );
                    })}
                </ol>

                {tip && (
                    <div className="ag-recap-tip">
                        <span className="ag-recap-tip-glyph">{tip.glyph}</span>
                        <span className="ag-recap-tip-text">{tip.text}</span>
                    </div>
                )}

                <button className="ag-btn ag-btn--primary ag-btn--block ag-recap-cta" onClick={cta.onClick}>
                    {cta.label}
                </button>
            </div>
        </div>
    );
}
