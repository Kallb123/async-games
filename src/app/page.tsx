'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import IncomingInviteList from "@/components/IncomingInvitesList";
import OutgoingInviteList from "@/components/OutgoingInviteList";
import MyTurnList from "@/components/MyTurnList";
import TheirTurnList from "@/components/TheirTurnList";
import MyCompleteList from "@/components/MyCompleteList";
import Avatar from "@/components/ui/Avatar";

export default function Home() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded) {
        if (!user) {
            router.push('/login');
            return;
        }

        const unlocked = user?.publicMetadata.unlocked;
        if (unlocked !== true) {
          router.push('/unlockaccess');
        }
    }
  }, [isLoaded, user]);

  const displayName = user?.firstName || user?.username || "there";

  return (
    <main>
      <FcmTokenComp />

      <div className="ag-topbar">
        <div className="ag-topbar-title">
          <span className="ag-wordmark">Async Games</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "center" }}>
          <a href="/newgame" aria-label="New game" style={{ borderRadius: "50%", background: "var(--ag-green)", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>+</a>
          <a href="/profile" aria-label="Your profile">
            <Avatar name={displayName} size={40} ring="var(--ag-terracotta)" />
          </a>
        </div>
      </div>

      <MyTurnList />
      <IncomingInviteList />
      <TheirTurnList />
      <OutgoingInviteList />
      <MyCompleteList />

      <div className="ag-section" style={{ marginTop: 8, display: "flex", gap: 10 }}>
        <a href="/newgame" aria-label="New game" className="ag-cta ag-cta--dark" style={{ flex: 1 }}>
          <div className="ag-cta-main">
            <div className="ag-cta-title">New game</div>
            <div className="ag-cta-sub">Pick from the library</div>
          </div>
        </a>
        <a href="/profile" aria-label="Your profile" className="ag-cta" style={{ flex: 1, border: "2px solid var(--ag-dark)", color: "var(--ag-ink)" }}>
          <div className="ag-cta-main">
            <div className="ag-cta-title">Friends</div>
            <div className="ag-cta-sub">Challenge someone</div>
          </div>
        </a>
      </div>
    </main>
  );
}
