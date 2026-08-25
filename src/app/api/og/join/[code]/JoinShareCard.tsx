/* eslint-disable @next/next/no-img-element --
   This JSX is never mounted in a browser: satori rasterises it into a PNG, and
   next/image renders a DOM <img> it has no way to draw. */
import { GameMeta } from '@/utils/ui/games';
import { SRGB, accentHex } from '@/utils/ui/colours';
import { truncate } from '@/utils/ui/text';
import { INVITED_YOU_TO, seatsCta } from '@/utils/games/lobby';

// The picture a shared join link unfurls to in a chat app: whose game, which
// game, and the code itself, drawn in that game's own colour. Kept apart from
// the route beside it so the drawing can be looked at without a lobby to read.
//
// Every colour is an sRGB value from `colours.ts` rather than an `ag-*` class
// or an `oklch()` token, because there is no stylesheet behind this — satori
// resolves neither.

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

// Long enough to say something, short enough that nothing overflows the card.
const MAX_SENDER = 28;
const MAX_GAME_NAME = 26;
const MAX_TAGLINE_BESIDE_ART = 64;
const MAX_TAGLINE = 76;

export interface JoinShareCardProps {
    joinCode: string;
    sender: string;
    gameFriendlyName: string;
    openSeatCount: number;
    meta?: GameMeta;
    /** The game's artwork as a data URI — see the route's `inlineImage`. */
    art?: string | null;
}

export function JoinShareCard({ joinCode, sender, gameFriendlyName, openSeatCount, meta, art }: JoinShareCardProps) {
    const accent = accentHex(meta?.accent ?? 'terracotta');
    return (
        <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex', background: SRGB.brown, color: SRGB.cream }}>
            {/* The game's colour, edge to edge, so the card is recognisably
                *this* game's before a word of it is read. */}
            <div style={{ width: 24, height: CARD_HEIGHT, background: accent }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '52px 64px' }}>
                <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: -0.6, color: SRGB.inkSoft }}>
                    Async Games
                </div>

                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {art && <img src={art} alt="" width={168} height={168} style={{ borderRadius: 36, marginRight: 40 }} />}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', fontSize: 34, color: SRGB.inkSoft }}>
                            {truncate(sender, MAX_SENDER)} {INVITED_YOU_TO}
                        </div>
                        <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, letterSpacing: -2, color: SRGB.cream, marginTop: 6 }}>
                            {truncate(gameFriendlyName, MAX_GAME_NAME)}
                        </div>
                        {meta && (
                            <div style={{ display: 'flex', fontSize: 27, color: SRGB.inkSoft, marginTop: 16 }}>
                                {truncate(meta.tagline, art ? MAX_TAGLINE_BESIDE_ART : MAX_TAGLINE)}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {/* The letter-spacing hangs off the last glyph, so the
                        padding is trimmed on the right to keep the code
                        looking centred in its pill. */}
                    <div style={{
                        display: 'flex', background: accent, color: SRGB.brown, fontSize: 58, fontWeight: 800,
                        letterSpacing: 8, padding: '14px 30px 14px 38px', borderRadius: 22,
                    }}>
                        {joinCode}
                    </div>
                    <div style={{
                        display: 'flex', marginLeft: 28, fontSize: 32, fontWeight: 700, color: SRGB.cream,
                        background: SRGB.brownLift, padding: '16px 30px', borderRadius: 999,
                    }}>
                        {seatsCta(openSeatCount)}
                    </div>
                </div>
            </div>
        </div>
    );
}
