import type { ReactNode } from "react";
import Link from "next/link";
import BackLink from "@/components/ui/BackLink";
import LegalLinks from "@/components/ui/LegalLinks";
import { LEGAL_UPDATED } from "@/utils/ui/legal";

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
    href: string;
    children: ReactNode;
}) {
    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <BackLink href="/" label="Back home" />
                    <span className="ag-wordmark">{title}</span>
                </div>
            </div>

            <div className="ag-hero">
                <h1 className="ag-hero-title">{title}</h1>
                <p className="ag-hero-sub">{summary}</p>
            </div>

            <div className="ag-section">
                <div className="ag-callout">Last updated: {LEGAL_UPDATED}</div>
            </div>

            <div className="ag-prose">{children}</div>

            <div className="ag-footer">
                <LegalLinks omit={href} /> <span aria-hidden="true">·</span> <Link href="/">Home</Link>
            </div>
        </main>
    );
}
