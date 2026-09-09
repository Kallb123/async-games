import type { ReactNode } from "react";
import type { GameResultEventIcon } from "@/utils/apiModels/GameDataApi";

// Every icon is drawn on this square and centred in it, so the one transform
// below scales and places any of them.
const ICON_BOX = 16;

// How big a marker is drawn, in a chart's own SVG units. Exported because
// LineChart stacks markers that share a round a marker's height apart, and
// two numbers that have to agree are one number.
export const CHART_EVENT_ICON_SIZE = 11;

// The event markers a result-page chart can draw, as monochrome shapes on the
// 16×16 ICON_BOX. Monochrome is the whole point: the marker takes the colour
// of the chart line it belongs to (see ChartEventIcon), which the emoji these
// replaced could never do. Keyed by GameResultEventIcon, so a new icon name
// on the wire won't type-check until it has been drawn here.
const ICON_ART: Record<GameResultEventIcon, ReactNode> = {
    // A landmark: pediment, three columns, plinth.
    landmark: (
        <>
            <path d="M8 1 15 5.4H1z" />
            <path d="M2.6 6.8h2.2v6.4H2.6zM6.9 6.8h2.2v6.4H6.9zM11.2 6.8h2.2v6.4h-2.2z" />
            <path d="M1 13.6h14v1.8H1z" />
        </>
    ),
    // An explosion: an eight-pointed burst.
    explosion: (
        <path d="M8 0.4 9.5 4.4 13.4 2.6 11.6 6.5 15.6 8 11.6 9.5 13.4 13.4 9.5 11.6 8 15.6 6.5 11.6 2.6 13.4 4.4 9.5 0.4 8 4.4 6.5 2.6 2.6 6.5 4.4z" />
    ),
    // A rescue: the medical cross an ambulance wears.
    rescue: <path d="M6.2 1.6h3.6v4.6h4.6v3.6H9.8v4.6H6.2V9.8H1.6V6.2h4.6z" />,
    // An epidemic: a germ — a round body with eight knob-tipped spikes, the
    // microbe Outbreak's own meta glyph wears. One path rather than a shape
    // per part, so the outline .ag-chart-event-icon draws follows the whole
    // silhouette instead of seaming every spike onto the body.
    epidemic: (
        <path d="M3.7 8a4.3 4.3 0 1 0 8.6 0a4.3 4.3 0 1 0-8.6 0 M10.7 10.4 13.9 11.1 14.3 9.9 11.6 8.2z M13.35 10.7a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0 M8.2 11.6 9.9 14.3 11.1 13.9 10.4 10.7z M9.55 14.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0 M5.6 10.7 4.9 13.9 6.1 14.3 7.8 11.6z M4.15 14.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0 M4.4 8.2 1.7 9.9 2.1 11.1 5.3 10.4z M0.35 10.7a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0 M5.3 5.6 2.1 4.9 1.7 6.1 4.4 7.8z M0.35 5.3a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0 M7.8 4.4 6.1 1.7 4.9 2.1 5.6 5.3z M4.15 1.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0 M10.4 5.3 11.1 2.1 9.9 1.7 8.2 4.4z M9.55 1.5a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0 M11.6 7.8 14.3 6.1 13.9 4.9 10.7 5.6z M13.35 5.3a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0" />
    ),
};

interface ChartEventIconProps {
    icon: GameResultEventIcon;
    /** Centre of the marker, in the host chart's own SVG coordinates. */
    x: number;
    y: number;
    /** The colour to paint it — the chart line's colour. Falls back to the
     * page's soft ink for an event that belongs to no one line. */
    color?: string;
    /** Hover text, the same way the rest of the chart labels a mark. */
    title?: string;
}

// One event marker on a result-page chart (a landmark bought, an explosion, a
// rescue, an epidemic), drawn as SVG inside the chart's own <svg> so it lands
// in chart coordinates and — unlike the emoji it replaces — takes the colour
// of the line it marks.
export default function ChartEventIcon({ icon, x, y, color, title }: ChartEventIconProps) {
    const offset = CHART_EVENT_ICON_SIZE / 2;
    return (
        <g
            className="ag-chart-event-icon"
            transform={`translate(${x - offset} ${y - offset}) scale(${CHART_EVENT_ICON_SIZE / ICON_BOX})`}
            style={color ? { color } : undefined}
        >
            {title && <title>{title}</title>}
            {ICON_ART[icon]}
        </g>
    );
}
