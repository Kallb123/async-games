'use client'

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/components/ToastContext";
import ActionButton from "@/components/ui/ActionButton";
import DisplayNameField from "@/components/ui/DisplayNameField";
import { clerkErrorMessage } from "@/utils/users/clerkErrors";
import { MAX_USERNAME_LENGTH, USERNAME_RULE, isValidUsername } from "@/utils/users/username";

// Changing the handle a player is known and invited by. A username is one
// field on the signed-in user resource, so this writes it with Clerk's
// frontend client the way useProfilePicture writes a picture — no API route,
// nothing server-side to add. (Claiming an account is server-side because it
// juggles a placeholder email, a real one and a password; this is not that.)
//
// Clerk enforces uniqueness on the write, so a taken handle comes back as
// form_identifier_exists and reaches the player as the sentence Clerk wrote
// for it rather than a generic failure.
export default function UsernameForm({ onSaved }: {
    /** Closes the editor once the new handle is live. */
    onSaved?: () => void;
}) {
    const { user } = useUser();
    const { showToast } = useToast();
    const current = user?.username ?? '';
    const [username, setUsername] = useState(current);
    const [saving, setSaving] = useState(false);

    const next = username.trim();
    const canSave = !!user && next !== current && isValidUsername(next);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (saving || !canSave) return;
        setSaving(true);

        try {
            await user.update({ username: next });
            // Every name on screen is resolved from the signed-in user, so
            // re-read it before saying the change landed. The handle is
            // already saved by this point, so a failure here is a stale
            // header, not a failed rename — don't report it as one.
            await user.reload().catch(error => console.error('Failed to reload the user', error));
            showToast(`You're @${next} now.`, 'success', 'Username changed');
            onSaved?.();
        } catch (error) {
            console.error('Failed to change the username', error);
            showToast(clerkErrorMessage(error, "Couldn't change your username. Please try again."), 'danger');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="ag-card ag-form-card">
            <DisplayNameField
                id="profile-username"
                label="Username"
                value={username}
                onChange={setUsername}
                maxLength={MAX_USERNAME_LENGTH}
                placeholder="yourname"
                disabled={saving}
            />
            <p className="ag-hint" style={{ margin: 0 }}>
                This is how friends find and invite you. {USERNAME_RULE}
            </p>
            <ActionButton
                type="submit"
                className="ag-btn ag-btn--primary ag-btn--block"
                pending={saving}
                pendingLabel="Saving…"
                disabled={!canSave}
            >
                Save username
            </ActionButton>
        </form>
    );
}
