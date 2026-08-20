'use client'
import { InstallMethod, promptInstall } from '@/utils/hooks/useInstallPrompt';

interface InstallOfferProps {
    method: InstallMethod;
    /** Extra classes for the card. The bottom banner uses this to lay its
     *  floating-strip geometry over the card, rather than restating the card. */
    className?: string;
    /** When given, the card ends with a dismiss button. */
    onDismiss?: () => void;
}

/**
 * The install pitch as a finished card — the title, one line of explanation,
 * and (where the browser has one to open) the button that opens the install
 * dialog.
 *
 * Owns its own `ag-cta` surface deliberately: the bottom `InstallBanner` and
 * the Settings screen both render it, and if each supplied the surface itself
 * the two would only match by coincidence.
 */
export default function InstallOffer({ method, className, onDismiss }: InstallOfferProps) {
    return (
        <div className={`ag-cta ag-cta--dark${className ? ` ${className}` : ''}`}>
            <div className="ag-cta-main">
                <div className="ag-cta-title">Install Async Games</div>
                <div className="ag-cta-sub">
                    {method === 'manual'
                        ? 'In Safari, tap Share, then “Add to Home Screen”.'
                        : 'Add it to your home screen for one-tap turns.'}
                </div>
            </div>
            {method === 'prompt' && (
                <button type="button" className="ag-btn ag-btn--light" onClick={promptInstall}>
                    Install
                </button>
            )}
            {onDismiss && (
                <button
                    type="button"
                    className="ag-install-dismiss"
                    onClick={onDismiss}
                    aria-label="Dismiss install prompt"
                >
                    &times;
                </button>
            )}
        </div>
    );
}
