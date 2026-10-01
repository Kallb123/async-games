'use client'
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import IncomingInviteList from "@/components/IncomingInvitesList";
import OutgoingInviteList from "@/components/OutgoingInviteList";
import MyTurnList from "@/components/MyTurnList";
import TheirTurnList from "@/components/TheirTurnList";
import MyCompleteList from "@/components/MyCompleteList";
import { useDashboard } from "@/utils/hooks/useDashboard";
import AppRail from "@/components/ui/AppRail";
import WhatsNew from "@/components/ui/WhatsNew";
import PullToRefresh from "@/components/ui/PullToRefresh";
import Link from "next/link";
import KingdomBuilderWorldList from "@/components/KingdomBuilderWorldList";
import { useEffect, useRef } from "react";

/**
 * The signed-in home screen. `HomeScreen` decides who gets this and who gets
 * `Landing` — starting from the session cookie the server read, so a visitor
 * with no account never sees these skeletons flash past on their way to the
 * landing page, and someone with games waiting sees them in the first paint
 * rather than after Clerk has loaded in the browser.
 *
 * The guard stays for the locked-out account it sends to /unlockaccess; the
 * signed-out case is `HomeScreen`'s, so this never renders `Landing` itself.
 *
 * The children of `.ag-desk` are the desktop layout (design §16a): the platform
 * rail, the column of things waiting on you, the panel of things that aren't,
 * and the release notes, which sit under the queue rather than in the panel.
 * Below 900px the grid is a single column and they fall back into the order the
 * phone has always shown — which is why the split is made where it is, with
 * nothing needing to be reordered to get there.
 *
 * `.ag-desk` itself dissolves at that breakpoint (`display: contents`) so the
 * grid can also place the notification footer, which the root layout renders
 * beside this screen rather than inside it. Keep `app/loading.tsx` in step with
 * this shape.
 */
export default function Dashboard() {
    useAuthGuard({ allowSignedOut: true });
    const { dashboard, isLoading, isRefreshing, refresh } = useDashboard();
    const reportedUsable = useRef(false);
    useEffect(() => {
        if (!isLoading && !reportedUsable.current) {
            reportedUsable.current = true;
            requestAnimationFrame(() => window.__agPerformanceMark?.('dashboard_usable'));
        }
    }, [isLoading]);

    return (
        <main className="ag-desk">
            <FcmTokenComp />
            {/* A pull asks the same one fetch the poll does, and so starts the
                poll's countdown again (see `useRefreshableData`). */}
            <PullToRefresh onRefresh={refresh} />

            {/* The dashboard's one sign that it is waiting on the network — first
                load and every background refresh alike — is the bar under the
                header, not a shimmer over each list. */}
            <AppRail busy={isLoading || isRefreshing} myTurn={dashboard.myTurn} theirTurn={dashboard.theirTurn} worlds={dashboard.worlds} />

            <div className="ag-desk-col ag-desk-col--main">
                <MyTurnList games={dashboard.myTurn} isLoading={isLoading} />
                <IncomingInviteList invites={dashboard.incoming} isLoading={isLoading} onChanged={refresh} />
                <TheirTurnList games={dashboard.theirTurn} isLoading={isLoading} />
                <KingdomBuilderWorldList worlds={dashboard.worlds} isLoading={isLoading} />
            </div>

            <aside className="ag-desk-col ag-desk-col--side">
                <OutgoingInviteList invites={dashboard.outgoing} isLoading={isLoading} onChanged={refresh} />
                <MyCompleteList games={dashboard.completed} isLoading={isLoading} limit={10} />

                <div className="ag-section ag-btn-row" style={{ marginTop: 8 }}>
                    <Link href="/newgame" aria-label="New game" className="ag-cta ag-cta--dark">
                        <div className="ag-cta-main">
                            <div className="ag-cta-title">New game</div>
                            <div className="ag-cta-sub">Pick from the library</div>
                        </div>
                    </Link>
                    <Link href="/profile?tab=friends" aria-label="Your friends" className="ag-cta" style={{ border: "2px solid var(--ag-dark)", color: "var(--ag-ink)" }}>
                        <div className="ag-cta-main">
                            <div className="ag-cta-title">Friends</div>
                            <div className="ag-cta-sub">Challenge someone</div>
                        </div>
                    </Link>
                </div>
            </aside>

            {/* Last on a phone, exactly where it has always been — and on a
                wide screen under the queue rather than in the panel, because
                the panel is things to act on and this is reading matter. Its
                own region so the grid can put it there without it having to
                move in the running order a phone sees. */}
            <div className="ag-desk-col ag-desk-col--notes">
                <WhatsNew />
            </div>
        </main>
    );
}
