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
    // An epidemic: the biohazard mark's three lobes. Just the lobes — a core
    // between them merges into one blob at the size the chart draws these at,
    // where three separate discs still read as a cluster.
    epidemic: (
        <>
            <circle cx={8} cy={3} r={3.3} />
            <circle cx={12.3} cy={10.5} r={3.3} />
            <circle cx={3.7} cy={10.5} r={3.3} />
        </>
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
