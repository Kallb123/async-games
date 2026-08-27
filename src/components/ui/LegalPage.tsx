import type { ReactNode } from "react";
import Brand from "@/components/ui/Brand";
import LegalLinks from "@/components/ui/LegalLinks";
import { LEGAL_UPDATED, LegalHref } from "@/utils/ui/legal";

/**
 * Shell for the two public documents (`/privacy`, `/terms`).
 *
 * These are the only long-form text screens in the app, and they render for
 * signed-out visitors — no auth guard, no data fetching. All they need is the
 * standard top bar, a hero, and the `.ag-prose` block the body is written in,
 * so the shell owns that and each page owns only its words.
 */
export default function LegalPage({
    title,
    summary,
    href,
    children,
}: {
    title: string;
    summary: string;
    /** This page's own path, so the footer links to the *other* document. */
    href: LegalHref;
    children: ReactNode;
}) {
    return (
        <main>
            {/* The app's own name, not the document's — the hero below already
                names the document, and a visitor who landed here from a search
                result needs to know whose policy they're reading. Brand links
                home on its own, so this is also the way back. */}
            <div className="ag-topbar">
                <Brand />
            </div>

            <div className="ag-hero">
                <h1 className="ag-hero-title">{title}</h1>
                <p className="ag-hero-sub">{summary}</p>
            </div>

            <div className="ag-section">
                <div className="ag-callout">Last updated: {LEGAL_UPDATED}</div>
            </div>

            <div className="ag-section ag-prose">{children}</div>

            <div className="ag-footer">
                <LegalLinks omit={href} />
            </div>
        </main>
    );
}
