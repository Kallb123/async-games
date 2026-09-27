// One circular 2D badge on the world map, from the badge kit in
// /art-masters/kingdombuilder/v2/badges. Each scene's painted inside is a PNG
// (built by `npm run kb-atlas`); what changes from one badge to the next —
// a village's owner colour on its ring, and a level shield — is drawn here as
// a few live shapes, so any seat colour and any level cost no extra art.
//
// Drawn in the kit's own 100×100 badge space and scaled to `size` world units,
// so the shield below is the generator's `build()` markup, copied verbatim.
// The hex values are the kit's art, not UI colours, which is why they aren't
// design-system tokens.

export type MapBadgeKind = "village" | "barbarian" | "forest" | "quarry" | "iron" | "plot";

const OUTLINE = "#2b2320";
const NUMERALS = ["I", "II", "III", "IV", "V"];
/** The badge's disc, in badge units: the centre sits above the middle to leave room for its shadow. */
const CENTRE_Y = 48;
const RING_RADIUS = 45;
/** How far the badge reaches out from the map point it stands on, as a share of `size`. */
export const MAP_BADGE_RADIUS = (RING_RADIUS + 1.5) / 100;

/** The kit's `autoInk`: dark numerals on a light shield, white on a dark one. */
function inkOn(hex: string): string {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160 ? OUTLINE : "#ffffff";
}

/** The level shield in the badge's top-right, coloured like the kit's village or barbarian one. */
function LevelShield({ level, fill, ink, trim }: { level: number; fill: string; ink: string; trim: string }) {
    const numeral = NUMERALS[level - 1];
    if (!numeral) return null;
    const fontSize = numeral.length > 2 ? 13 : 16;
    return <>
        <path d="M66 6 H94 V20 Q94 32 80 38 Q66 32 66 20 Z" fill={fill} stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
        <path d="M69.5 9.5 H90.5 V20 Q90.5 29.5 80 34.2 Q69.5 29.5 69.5 20 Z" fill="none" stroke={trim} strokeWidth={1.4} />
        <text x={80} y={fontSize > 14 ? 27 : 26} textAnchor="middle" fontFamily="'Trajan Pro', 'Cinzel', Georgia, 'Times New Roman', serif"
            fontWeight={700} fontSize={fontSize} letterSpacing={-0.5} fill={ink}>{numeral}</text>
    </>;
}

/**
 * A badge centred on a map point. `colour` is a village's owner, painted on its
 * ring and its shield; `level` (1–5) adds the shield. Barbarian badges keep
 * the kit's red so they always read as the enemy.
 */
export default function MapBadge({ kind, x, y, size, colour, level }: {
    kind: MapBadgeKind;
    x: number;
    y: number;
    size: number;
    colour?: string;
    level?: number;
}) {
    const scale = size / 100;
    const isVillage = kind === "village";
    const ring = colour ?? "#ffffff";
    return (
        <g transform={`translate(${x - size / 2} ${y - CENTRE_Y * scale}) scale(${scale})`}>
            {/* The disc is the badge's tap target, round like the badge rather than its image's square; only a village's shows, as its owner's ring. */}
            <circle cx={50} cy={CENTRE_Y} r={RING_RADIUS} fill={isVillage ? ring : "transparent"} />
            <g pointerEvents="none">
                <image href={`/art/kingdombuilder/v2/badges/${kind}.png`} width={100} height={100} />
                {level !== undefined && (isVillage
                    ? <LevelShield level={level} fill={ring} ink={inkOn(ring)} trim="#c9a24a" />
                    : kind === "barbarian" && <LevelShield level={level} fill="#a8322f" ink="#ffffff" trim="#e3b23c" />)}
            </g>
        </g>
    );
}
