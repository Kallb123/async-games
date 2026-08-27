import Brand from "@/components/ui/Brand";
import Skeleton from "@/components/ui/Skeleton";

/**
 * `page.tsx` awaits `auth()` (and, when a code is in the URL, a lobby-preview
 * lookup for `generateMetadata`) before it can render — worst case
 * `PREVIEW_BUDGET_MS` (2.5s) — so this is what a tap on a join link shows
 * immediately instead of a frozen tab. Same shell as `AuthScreen`, which
 * `JoinForm` itself mounts, so the handover doesn't jump.
 */
export default function Loading() {
    return (
        <main>
            <div className="ag-topbar">
                <Brand />
            </div>
            <div className="ag-hero" aria-hidden>
                <Skeleton width="70%" height={28} />
                <Skeleton width="90%" height={16} style={{ marginTop: 12 }} />
            </div>
            <div className="ag-section ag-section--center" aria-hidden>
                <Skeleton width="100%" height={44} radius={12} />
            </div>
        </main>
    );
}
