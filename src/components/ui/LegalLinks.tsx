import { Fragment } from "react";
import Link from "next/link";
import { LEGAL_PAGES, LegalHref } from "@/utils/ui/legal";

/**
 * The "Privacy · Terms" pair an `.ag-footer` carries. `omit` drops one link —
 * the legal pages themselves use it so a document doesn't link to itself.
 */
export default function LegalLinks({ omit }: { omit?: LegalHref }) {
    return (
        <div className="ag-legal-links">
            {LEGAL_PAGES.filter(page => page.href !== omit).map((page, index) => (
                <Fragment key={page.href}>
                    {index > 0 && <span aria-hidden="true"> · </span>}
                    <Link href={page.href}>{page.label}</Link>
                </Fragment>
            ))}
        </div>
    );
}
