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
import Link from "next/link";

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
 * The three children of `.ag-desk` are the desktop layout (design §16a): the
 * platform rail, the column of things waiting on you, and the panel of things
 * that aren't. Below `--ag-desk-min` the grid is a single column and they fall
 * back into the order the phone has always shown — which is why the split is
 * made where it is, with nothing needing to be reordered to get there. Keep
 * `app/loading.tsx` in step with this shape.
 */
export default function Dashboard() {
    useAuthGuard({ allowSignedOut: true });
    const { dashboard, isLoading, isRefreshing, refresh } = useDashboard();

    return (
        <main className="ag-desk">
            <FcmTokenComp />

            <AppRail myTurn={dashboard.myTurn} theirTurn={dashboard.theirTurn} />

            <div className="ag-desk-col ag-desk-col--main">
                <MyTurnList games={dashboard.myTurn} isLoading={isLoading} isRefreshing={isRefreshing} />
                <IncomingInviteList invites={dashboard.incoming} isLoading={isLoading} isRefreshing={isRefreshing} onChanged={refresh} />
                <TheirTurnList games={dashboard.theirTurn} isLoading={isLoading} isRefreshing={isRefreshing} />
            </div>

            <aside className="ag-desk-col ag-desk-col--side">
                <OutgoingInviteList invites={dashboard.outgoing} isLoading={isLoading} isRefreshing={isRefreshing} onChanged={refresh} />
                <MyCompleteList games={dashboard.completed} isLoading={isLoading} isRefreshing={isRefreshing} limit={10} />

                <div className="ag-section ag-btn-row" style={{ marginTop: 8 }}>
                    <Link href="/newgame" aria-label="New game" className="ag-cta ag-cta--dark">
                        <div className="ag-cta-main">
                            <div className="ag-cta-title">New game</div>
                            <div className="ag-cta-sub">Pick from the library</div>
                        </div>
                    </Link>
                    <Link href="/profile" aria-label="Your profile" className="ag-cta" style={{ border: "2px solid var(--ag-dark)", color: "var(--ag-ink)" }}>
                        <div className="ag-cta-main">
                            <div className="ag-cta-title">Friends</div>
                            <div className="ag-cta-sub">Challenge someone</div>
                        </div>
                    </Link>
                </div>

                <WhatsNew />
            </aside>
        </main>
    );
}
