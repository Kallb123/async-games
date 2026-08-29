'use client'

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/components/ToastContext";
import { clerkErrorMessage } from "@/utils/users/clerkErrors";

// Taken off `useUser` rather than imported: @clerk/types isn't a direct
// dependency, and this is the same resource every caller already holds.
type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>;

/** What the player is told, either way the write goes. */
interface SaveCopy {
    success: string;
    /** Heading on the success toast, when it wants one. */
    title?: string;
    /** Shown when Clerk has nothing more specific to say. */
    failure: string;
}

/**
 * Writing one field to the signed-in Clerk user — a picture, a username —
 * with the four things every such write needs around it: the in-flight flag
 * that stops a double submit, the reload that makes the new value current,
 * a success toast and a failure that reaches the player as a sentence.
 *
 * The reload is deliberately best-effort. By the time it runs the write has
 * already landed, so a failure there is a stale screen, not a failed save,
 * and reporting it as one would be a lie.
 *
 * Returns whether the write landed, so a caller can close its editor on the
 * way out.
 */
export function useClerkUserSave() {
    const { user } = useUser();
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    const save = async (write: (user: ClerkUser) => Promise<unknown>, copy: SaveCopy): Promise<boolean> => {
        if (!user || isSaving) return false;
        setIsSaving(true);
        try {
            await write(user);
            await user.reload().catch(error => console.error('Failed to reload the user', error));
            showToast(copy.success, 'success', copy.title);
            return true;
        } catch (error) {
            console.error('Failed to save the Clerk user', error);
            // Clerk's own sentence when it wrote one ("That username is
            // taken."), which is always more use than the caller's fallback.
            showToast(clerkErrorMessage(error, copy.failure), 'danger');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    return { user, isSaving, save };
}
