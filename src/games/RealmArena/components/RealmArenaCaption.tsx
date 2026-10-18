'use client'
import type { RulesContext } from "@/games/RealmArena/rulesets";
import React, { useMemo } from 'react';
import type { Playback } from '@/games/RealmArena/components/RealmArenaBoard';
import { captionAt, eventLines, type CaptionCue } from '@/games/RealmArena/ui';
import type { Fighter } from '@/games/RealmArena/rules';
import { usePlaybackValue } from '@/utils/hooks/usePlayback';

// What the board says over its frame rather than on the battlefield, in HTML
// outside the zoom so it stays put as the board pans: the isometric board and
// the 3D one wear the same two.

/** How much of the foot of the frame a playback's caption takes, with its gap from the edge, in pixels: kept clear by the view framing the action (`BoardZoomFocus.inset`). */
export const CAPTION_INSET = 44;

/**
 * What the playback is doing, in a sentence, as each event lands: the pill at
 * the foot of the frame (`.ag-ra-caption`), which is outside the zoom so it
 * stays put as the board pans. An event the action's lines pass over (a move
 * broken by an overwatch shot is told once) says nothing of its own, so the
 * last sentence stays up until one that does. It keeps the final one when the
 * clock has run out — a review step rests showing what happened — and renders
 * only when the sentence changes (`usePlaybackValue`). Keyed by the playback
 * where it is mounted, so a new one starts from nothing rather than from the
 * last one's closing line. `fighters` is the board after the action, which is
 * what `eventLines` names everyone from.
 */
export function PlaybackCaption({ playback, fighters, viewerId, nameFor, context }: { context?: RulesContext; playback: Playback; fighters: readonly Fighter[]; viewerId: string; nameFor: (userId: string) => string }) {
    const { cues, sentences } = useMemo(() => {
        const sentences = new Map(eventLines(playback.events, fighters, viewerId, nameFor, context).map(line => [line.event, line.sentence]));
        return { cues: playback.cues.filter((cue): cue is CaptionCue => cue.kind === 'caption' && sentences.has(cue.event)), sentences };
    }, [playback.events, playback.cues, fighters, viewerId, nameFor, context]);
    const sentence = usePlaybackValue(ms => {
        const cue = captionAt(cues, ms);
        return cue ? sentences.get(cue.event) ?? null : null;
    });
    return (
        <div className="ag-ra-caption" role="status" aria-live="polite">
            {sentence && <span key={sentence}>{sentence}</span>}
        </div>
    );
}

/**
 * Something happened, but not anywhere the viewer can see: a question mark over
 * the frame, not the board, so it stays in the middle as the board pans and
 * zooms. The layer fades in and out as a step comes and goes; the mark in it,
 * keyed by the step, settles in afresh for each. Nothing when `unplaced` is
 * undefined (the board isn't a review); a null one is a review step in sight.
 */
export function UnplacedMark({ unplaced }: { unplaced: string | null | undefined }) {
    if (unplaced === undefined) return null;
    return (
        <div className={`ag-ra-unplaced${unplaced ? ' ag-ra-unplaced--on' : ''}`} aria-hidden="true">
            <span key={unplaced ?? undefined}>?</span>
        </div>
    );
}
