'use client'
import { useToast } from "@/components/ToastContext";
import { buildJoinHref } from "@/utils/games/joinCode";
import { formatRemainingUntil } from "@/utils/games/TurnTimer";
import { useNowToTheMinute } from "@/utils/hooks/useNow";
import { shareOrCopyLink } from "@/utils/ui/share";

interface JoinCodeCardProps {
    /** Absent while it loads, which draws the card as a row of dots. */
    joinCode?: string;
    /** Named in the shared message, for the chat apps that show only its text. */
    gameFriendlyName?: string;
    /** When the code stops working, as an ISO string. */
    expiresAt?: string;
    /** What happens once the code has expired — "the lobby closes" by default. */
    expiryConsequence?: string;
}

/**
 * The big tap-to-share join code: the card, the share-or-copy link it hands
 * over, and the lines under it saying what the link does and how long the
 * code lasts. A lobby waits on it, and so does a Kingdom Builder world that
 * still has seats to fill.
 *
 * What the card hands over is the code's second form: a link that opens
 * /join with the code already in the box (docs/account-less-play.md §4).
 * "Go to the site, tap Join, type PLUM" is three instructions a friend can
 * abandon at any one of them; a link is one tap, and it is a strict superset
 * of the code it contains. The code stays on screen, large, for whoever is
 * sitting opposite and typing it.
 *
 * A code that quietly stopped working is the one thing a host can't explain
 * to the friend still typing it in, so the deadline is on screen from the
 * start rather than only in the toast that follows it.
 */
export default function JoinCodeCard({ joinCode, gameFriendlyName, expiresAt, expiryConsequence = "the lobby closes" }: JoinCodeCardProps) {
    const { showToast } = useToast();
    const now = useNowToTheMinute();
    const expiresIn = expiresAt ? formatRemainingUntil(expiresAt, now) : null;

    const handleShare = async () => {
        if (!joinCode) return;
        const url = `${window.location.origin}${buildJoinHref(joinCode)}`;
        // Names the game in the shared message too: where a chat app renders the
        // link preview the card says it, but a plain-text paste is all some of
        // them show.
        const result = await shareOrCopyLink(url, `Join my ${gameFriendlyName} game — the code is ${joinCode}.`);
        if (result === 'copied') showToast('Link copied!', 'success');
        if (result === 'failed') showToast('Could not copy — share the code instead.', 'danger');
    };

    return (
        <div className="ag-section">
            <button
                type="button"
                className="ag-card ag-joincode-card"
                onClick={handleShare}
                disabled={!joinCode}
            >
                <div className="ag-section-label">
                    Tap to share
                </div>
                <div className="ag-joincode" style={{ "--ag-joincode-size": "44px", marginTop: 4 } as React.CSSProperties}>
                    {joinCode ?? "····"}
                </div>
            </button>
            <p className="ag-hint ag-hint--center">Sends a link that opens straight onto an open seat — or read the code out.</p>
            {expiresIn && <p className="ag-hint ag-hint--center">Works for another {expiresIn}, then {expiryConsequence}.</p>}
        </div>
    );
}
