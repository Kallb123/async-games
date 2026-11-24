'use client'
import ListRow from '@/components/ui/ListRow';
import ListSection from '@/components/ui/ListSection';
import { HOLD_OUT_STAR_INFO, HOLD_OUT_STARS, starLine, starMark, type HoldOutStar } from '@/games/RealmArena/rules';

/**
 * The stars a won Hold Out earned (realm-arena-hold-out.md §6), under the
 * finished board: every star, earned or missed, with what earns it.
 */
export default function RealmArenaStars({ stars }: { stars: readonly HoldOutStar[] }) {
    return (
        <ListSection label={`Stars · ${starLine(stars)}`} isLoading={false}>
            {HOLD_OUT_STARS.map(star => (
                <ListRow
                    key={star}
                    icon={starMark(stars, star)}
                    title={HOLD_OUT_STAR_INFO[star].name}
                    sub={HOLD_OUT_STAR_INFO[star].reason}
                    muted={!stars.includes(star)}
                />
            ))}
        </ListSection>
    );
}
