/**
 * The public legal pages (`/privacy`, `/terms`) and the details they and the
 * footers around the app share.
 *
 * Kept here so the address a reader is told to write to, the date the
 * documents claim to have been updated, and the list of pages the footers
 * link to all live in one place rather than being retyped per page.
 */

export const LEGAL_PAGES = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
] as const;

/** Where privacy requests, deletion requests and legal notices go. */
export const LEGAL_CONTACT = "privacy@asyncgames.com";

/** Shown at the top of both documents. Bump when either one changes. */
export const LEGAL_UPDATED = "21 August 2026";
