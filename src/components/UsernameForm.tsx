'use client'

import { useState } from "react";
import ActionButton from "@/components/ui/ActionButton";
import DisplayNameField from "@/components/ui/DisplayNameField";
import { useClerkUserSave } from "@/utils/hooks/useClerkUserSave";
import { publicHandle } from "@/utils/ui/players";
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
    // The guard, the reload that makes the new handle current everywhere it
    // shows, the toasts and the in-flight flag are the same four things a
    // profile picture needs, so they live in the shared hook.
    const { user, isSaving, save } = useClerkUserSave();
    // Through publicHandle rather than user.username raw, so the box can
    // never open on the account id a guest's Clerk username actually is —
    // the screen gates on that too, but the component holds its own line.
    const current = publicHandle(user) ?? '';
    const [username, setUsername] = useState(current);

    const next = username.trim();
    const canSave = !!user && next !== current && isValidUsername(next);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!canSave) return;

        const saved = await save(user => user.update({ username: next }), {
            success: `You're @${next} now.`,
            title: 'Username changed',
            failure: "Couldn't change your username. Please try again.",
        });
        if (saved) onSaved?.();
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
                disabled={isSaving}
            />
            <p className="ag-hint" style={{ margin: 0 }}>
                This is how friends find and invite you. {USERNAME_RULE}
            </p>
            <ActionButton
                type="submit"
                className="ag-btn ag-btn--primary ag-btn--block"
                pending={isSaving}
                pendingLabel="Saving…"
                disabled={!canSave}
            >
                Save username
            </ActionButton>
        </form>
    );
}
