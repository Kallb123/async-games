'use client'

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/components/ToastContext";
import ActionButton from "@/components/ui/ActionButton";

// Adding an email and password to the guest account the player already is
// (docs/account-less-play.md step 16). Nothing about the account's id
// changes, so this is the only step claiming needs — the write itself is
// server-side (/api/user/claim), since it swaps the guest's throwaway
// placeholder email for the real one in the same pass rather than leaving it
// behind as a second address.
export default function ClaimAccountForm() {
    const { user } = useUser();
    const { showToast } = useToast();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [claiming, setClaiming] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (claiming) return;
        setClaiming(true);

        try {
            const response = await fetch('/api/user/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (!response.ok) {
                const { error } = await response.json().catch(() => ({}));
                throw new Error(error ?? "Couldn't save your account. Please try again.");
            }

            // The claim was written with Clerk's backend client, so this
            // browser's copy of the user still says guest until reloaded —
            // same reload PasswordForm does after the unlock write.
            await user?.reload();
            showToast("This account is yours to keep now.", 'success', 'Account saved');
            setEmail('');
            setPassword('');
        } catch (error) {
            console.error('Failed to claim account', error);
            const message = error instanceof Error ? error.message : "Couldn't save your account. Please try again.";
            showToast(message, 'danger');
        } finally {
            setClaiming(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="ag-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
                <label htmlFor="claim-email" className="ag-section-label" style={{ display: "block", marginBottom: 8 }}>Email</label>
                <input
                    id="claim-email"
                    className="ag-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                />
            </div>
            <div>
                <label htmlFor="claim-password" className="ag-section-label" style={{ display: "block", marginBottom: 8 }}>Password</label>
                <input
                    id="claim-password"
                    className="ag-input"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                />
            </div>
            <ActionButton
                type="submit"
                className="ag-btn ag-btn--primary ag-btn--block"
                pending={claiming}
                pendingLabel="Saving…"
            >
                Save account
            </ActionButton>
        </form>
    );
}
