"use client"

import { useRouter } from 'next/navigation'
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/components/ToastContext";
import ActionButton from "@/components/ui/ActionButton";

export default function PasswordForm() {
    const [password, setPassword] = useState('');
    const [unlocking, setUnlocking] = useState(false);
    const router = useRouter();
    const { user } = useUser();
    const { showToast } = useToast();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (unlocking) return;
      setUnlocking(true);

      try {
        const response = await fetch('/api/unlock', {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({password})
        });

        if (!response.ok) {
            const { error } = await response.json().catch(() => ({}));
            throw new Error(error ?? 'Incorrect password. Please try again.');
        }

        // The unlock was written with Clerk's *backend* client, so the copy of
        // the user this browser holds still says locked. Navigating on it sends
        // `useAuthGuard` straight back here — reload it first.
        await user?.reload();

        router.push('/');
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'Incorrect password. Please try again.';
        showToast(message, 'danger', 'Access Denied');
        setUnlocking(false);
      }
    }

    return (
        <form onSubmit={handleSubmit} className="ag-card ag-form-card">
            <div>
                <label htmlFor="access-password" className="ag-section-label ag-field-label">Access password</label>
                <input
                    id="access-password"
                    className="ag-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    required
                />
            </div>
            <ActionButton
                type="submit"
                className="ag-btn ag-btn--primary ag-btn--block"
                pending={unlocking}
                pendingLabel="Unlocking…"
            >
                Unlock
            </ActionButton>
        </form>
    );
}
