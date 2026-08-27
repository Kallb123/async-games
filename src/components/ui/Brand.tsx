import Link from "next/link";

// The mark is drawn once, by `scripts/generate-icons.mjs`, which emits this
// file alongside the favicon and app icons — so the logo on screen can't drift
// from the logo in the tab.
const MARK = "/icons/icon.svg";
const MARK_SIZE = 34;

/**
 * The mark and the wordmark locked up together — what every screen that shows
 * the app's own name (rather than a page title) puts in its top bar. Links
 * home, since it's the only brand mark some screens (like a guest's /join)
 * show at all.
 */
export default function Brand() {
    return (
        <Link href="/" className="ag-topbar-title" aria-label="Async Games home">
            {/* eslint-disable-next-line @next/next/no-img-element -- a 500-byte
                inline-drawn SVG has nothing for next/image to optimise. */}
            <img src={MARK} alt="" width={MARK_SIZE} height={MARK_SIZE} style={{ flex: "none" }} />
            <span className="ag-wordmark">Async Games</span>
        </Link>
    );
}
