'use client'

import { useState } from "react";
import PasswordField from "@/components/ui/PasswordField";
import ActionButton from "@/components/ui/ActionButton";
import { useClerkUserSave } from "@/utils/hooks/useClerkUserSave";

// A password isn't the only way in — signing in with Google or Microsoft
// never sets one — so `user.passwordEnabled` decides which form this shows:
// a first password with nothing to prove ownership of yet, or a change that
// has to prove the old one first. The write itself, the in-flight flag, the
// reload and the toast pair are all `useClerkUserSave` — the same "one field
// on the signed-in Clerk user" shape NameForm's username write and
// useProfilePicture already go through, which also means a stale session
// gets Clerk's own step-up prompt rather than a bare failure.
export default function PasswordSettingsForm() {
    const { user, isSaving, save } = useClerkUserSave();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');

    if (!user) return null;
    const hasPassword = user.passwordEnabled;

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const saved = await save(
            u => u.updatePassword({
                newPassword,
                currentPassword: hasPassword ? currentPassword : undefined,
                // Defence in depth: a password change is also the moment a
                // player worried about a stolen session reaches for, so it
                // signs every other device out rather than leaving one live.
                signOutOfOtherSessions: true,
            }),
            {
                success: hasPassword ? "Your password has been changed." : "You can now sign in with a password too.",
                title: hasPassword ? "Password changed" : "Password added",
                failure: "Couldn't save that password. Please try again.",
            },
        );
        if (saved) {
            setCurrentPassword('');
            setNewPassword('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="ag-card ag-form-card">
            {hasPassword && (
                <PasswordField
                    id="current-password"
                    label="Current password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    autoComplete="current-password"
                    disabled={isSaving}
                />
            )}
            <PasswordField
                id="new-password"
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                minLength={8}
                disabled={isSaving}
            />
            <ActionButton
                type="submit"
                className="ag-btn ag-btn--primary ag-btn--block"
                pending={isSaving}
                pendingLabel="Saving…"
            >
                {hasPassword ? "Change password" : "Add password"}
            </ActionButton>
        </form>
    );
}
