'use client'
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import GameLibrary from "@/components/ui/GameLibrary";
import BackLink from "@/components/ui/BackLink";
import Link from "next/link";

export default function NewGame() {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  useAuthGuard();

  return (
    <main>
      <div className="ag-topbar">
        <div className="ag-topbar-title">
          <BackLink href="/" label="Back home" />
          <span className="ag-wordmark">The library</span>
        </div>
        <Link href="/join" className="ag-pill-action">Have a code?</Link>
      </div>

      <GameLibrary hrefFor={game => `/newgame/${game.url}`} />

      <FcmTokenComp />
    </main>
  );
}
