'use client'
import Link from 'next/link';
import OfferCard from '@/components/ui/OfferCard';

interface ClaimAccountOfferProps {
    className?: string;
    onDismiss?: () => void;
}

/**
 * The claim pitch, shown once a guest has something to lose (their first
 * turn, tracked by useGuestMoved) — `OfferCard` supplies the surface, and the
 * button hands off to the actual email/password form on Settings rather than
 * a second copy of it here.
 */
export default function ClaimAccountOffer({ className, onDismiss }: ClaimAccountOfferProps) {
    return (
        <OfferCard
            title="Keep this account"
            className={className}
            onDismiss={onDismiss}
            dismissLabel="Dismiss save-account prompt"
            action={
                <Link href="/settings" className="ag-btn ag-btn--light">
                    Save account
                </Link>
            }
        >
            Add an email and password and everything you&apos;ve played stays yours — no new sign-up.
        </OfferCard>
    );
}
