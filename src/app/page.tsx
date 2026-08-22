'use client'
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import IncomingInviteList from "@/components/IncomingInvitesList";
import OutgoingInviteList from "@/components/OutgoingInviteList";
import MyTurnList from "@/components/MyTurnList";
import TheirTurnList from "@/components/TheirTurnList";
import MyCompleteList from "@/components/MyCompleteList";
import Avatar from "@/components/ui/Avatar";
import Landing from "@/components/Landing";
import Brand from "@/components/ui/Brand";
import Link from "next/link";
import { profileImageUrl } from "@/utils/ui/avatar";

export default function Home() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  // The one screen anonymous visitors are allowed to stay on: rather than
  // bounce them to /login, show them what the platform is.
  const { user, isLoaded } = useAuthGuard({ allowSignedOut: true });

  if (isLoaded && !user) {
    return <Landing />;
  }

  const displayName = user?.firstName || user?.username || "there";

  return (
    <main>
      <FcmTokenComp />

      <div className="ag-topbar">
        <Brand />
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "center" }}>
          <Link href="/newgame" aria-label="New game" style={{ borderRadius: "50%", background: "var(--ag-green)", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>+</Link>
          <Link href="/profile" aria-label="Your profile">
            <Avatar name={displayName} imageUrl={profileImageUrl(user)} size={40} ring="var(--ag-terracotta)" />
          </Link>
        </div>
      </div>

      <MyTurnList />
      <IncomingInviteList />
      <TheirTurnList />
      <OutgoingInviteList />
      <MyCompleteList limit={10} />

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
    </main>
  );
}
