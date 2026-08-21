'use client'
import { ReactNode } from 'react';

interface OfferCardProps {
    title: string;
    /** One line on what the user gets out of saying yes. */
    children: ReactNode;
    /** The button that acts on the offer, where there is one to press. Offers
     *  that cannot be acted on from script (iOS install, blocked notifications)
     *  pass nothing and let the copy carry the instructions. */
    action?: ReactNode;
    /** Extra classes for the card. The bottom banner uses this to lay its
     *  floating-strip geometry over the card, rather than restating the card. */
    className?: string;
    /** When given, the card ends with a dismiss button. */
    onDismiss?: () => void;
    dismissLabel?: string;
}

/**
 * A dark pitch card: title, one line of why, an optional button, an optional
 * dismiss.
 *
 * Owns the `ag-cta` surface for every offer the app makes — install the app,
 * turn on notifications — so the bottom banner and the Settings screen render
 * the same card rather than matching each other by coincidence. The offers
 * themselves (`InstallOffer`, `NotificationOffer`) supply only the copy and the
 * action; anything true of all of them belongs here.
 */
export default function OfferCard({ title, children, action, className, onDismiss, dismissLabel }: OfferCardProps) {
    return (
        <div className={`ag-cta ag-cta--dark${className ? ` ${className}` : ''}`}>
            <div className="ag-cta-main">
                <div className="ag-cta-title">{title}</div>
                <div className="ag-cta-sub">{children}</div>
            </div>
            {action}
            {onDismiss && (
                <button
                    type="button"
                    className="ag-banner-dismiss"
                    onClick={onDismiss}
                    aria-label={dismissLabel}
                >
                    &times;
                </button>
            )}
        </div>
    );
}
