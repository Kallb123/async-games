/**
 * The green "active now" marker: this player took a turn in the last few
 * minutes (see `isRecentlyActive`). Sits on the corner of whatever it is a
 * marker for — the host only has to be a positioned box (`ag-avatar-stack`),
 * the same arrangement `ThumbBadge` uses.
 *
 * A colour on its own tells a screen reader nothing, and tells a colour-blind
 * reader very little, so the dot carries the label rather than leaving the row
 * to repeat it in text.
 */
export default function ActiveDot({ label = "Active now" }: { label?: string }) {
    return <span className="ag-active-dot" role="img" aria-label={label} title={label} />;
}
