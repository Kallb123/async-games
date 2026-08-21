'use client'
import OfferCard from '@/components/ui/OfferCard';
import { InstallMethod, promptInstall } from '@/utils/hooks/useInstallPrompt';

interface InstallOfferProps {
    method: InstallMethod;
    className?: string;
    onDismiss?: () => void;
}

/**
 * The install pitch: the copy, and (where the browser has one to open) the
 * button that opens the install dialog. `OfferCard` supplies the surface.
 *
 * iOS has no install dialog to open, so `manual` gets the instructions rather
 * than a button that would do nothing.
 */
export default function InstallOffer({ method, className, onDismiss }: InstallOfferProps) {
    return (
        <OfferCard
            title="Install Async Games"
            className={className}
            onDismiss={onDismiss}
            dismissLabel="Dismiss install prompt"
            action={method === 'prompt' && (
                <button type="button" className="ag-btn ag-btn--light" onClick={promptInstall}>
                    Install
                </button>
            )}
        >
            {method === 'manual'
                ? 'In Safari, tap Share, then “Add to Home Screen”.'
                : 'Add it to your home screen for one-tap turns.'}
        </OfferCard>
    );
}
