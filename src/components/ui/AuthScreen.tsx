import type { ReactNode } from "react";
import Brand from "@/components/ui/Brand";

/**
 * Shell for the screens that mount a Clerk card (sign in, sign up).
 *
 * Clerk owns everything inside the card — it's themed once in
 * `utils/ui/clerkAppearance.ts` — so all these screens have left to own is the
 * copy above the card and which Clerk component they mount; the brand lockup
 * above it is `Brand`.
 */
export default function AuthScreen({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle: string;
    children: ReactNode;
}) {
    return (
        <main>
            <div className="ag-topbar">
                <Brand />
            </div>
            <div className="ag-hero">
                <h1 className="ag-hero-title">{title}</h1>
                <p className="ag-hero-sub">{subtitle}</p>
            </div>
            <div className="ag-section" style={{ display: "flex", justifyContent: "center" }}>
                {children}
            </div>
        </main>
    );
}
