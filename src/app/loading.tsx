import Brand from "@/components/ui/Brand";
import { SkeletonTurnCard } from "@/components/ui/Skeleton";

/**
 * `page.tsx` calls `auth()` to decide between `Dashboard` and `Landing`,
 * which makes `/` dynamic — Next shows this instantly on navigation while
 * that decision is made server-side, instead of leaving the click looking
 * like it did nothing until the response streams back. Same topbar shell as
 * `ErrorScreen`/`AuthScreen` so it reads as this app from the first frame,
 * then turn-card shapes since a signed-in player's dashboard is the more
 * common destination — neutral either way, so nothing here has to guess
 * which screen wins.
 */
export default function Loading() {
    return (
        <main>
            <div className="ag-topbar">
                <Brand />
            </div>
            <div className="ag-stack" aria-hidden>
                <SkeletonTurnCard />
                <SkeletonTurnCard />
            </div>
        </main>
    );
}
