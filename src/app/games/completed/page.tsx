'use client'
import { usePathname } from "next/navigation";
import BackLink from "@/components/ui/BackLink";
import MyCompleteList from "@/components/MyCompleteList";

export default function CompletedGames() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <BackLink href="/" label="Back home" />
                    <span className="ag-wordmark">Completed games</span>
                </div>
            </div>

            <MyCompleteList />
        </main>
    );
}
