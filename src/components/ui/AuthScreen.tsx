import type { ReactNode } from "react";
import Brand from "@/components/ui/Brand";

/**
 * Shell for a screen with no signed-in account behind it: brand lockup, hero
 * copy, a centred slot below. Built for the screens that mount a Clerk card
 * (sign in, sign up) — Clerk owns everything inside the card, themed once in
 * `utils/ui/clerkAppearance.ts`, so those screens have left to own only the
 * copy above it and which component they mount — but the same lockup fits
 * any screen a visitor with no account lands on, like /join's guest variant,
 * which mounts its own name-and-code form instead of a Clerk component.
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
