'use client'
import OfferCard from '@/components/ui/OfferCard';
import { useToast } from '@/components/ToastContext';
import { shareOrCopyLink } from '@/utils/ui/share';

interface ResumeLinkOfferProps {
    url: string;
}

/**
 * A guest's durable handle back into the game they just joined
 * (docs/account-less-play.md §2/§15): a Clerk sign-in token, good for as long
 * as the guest account it signs back into. Shown once, right after sign-up —
 * nothing stores it, so there's nowhere to show it from a second time.
 *
 * `OfferCard` supplies the surface, same as the install and notification
 * pitches this guest will see next on the same trip through `BottomBanner`.
 */
export default function ResumeLinkOffer({ url }: ResumeLinkOfferProps) {
    const { showToast } = useToast();

    const handleSave = async () => {
        const result = await shareOrCopyLink(url, "My way back into the game I just joined on Async Games.");
        if (result === 'copied') showToast('Link copied!', 'success');
        if (result === 'failed') showToast('Could not copy — save it from your browser instead.', 'danger');
    };

    return (
        <OfferCard
            title="Save your way back in"
            action={
                <button type="button" className="ag-btn ag-btn--light" onClick={handleSave}>
                    Save link
                </button>
            }
        >
            Closing the tab? This link signs you straight back in.
        </OfferCard>
    );
}
