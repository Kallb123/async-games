'use client'

import { useState } from "react";
import { useUser, useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { useToast } from "@/components/ToastContext";
import { clerkErrorMessage } from "@/utils/users/clerkErrors";

// Taken off `useUser` rather than imported: @clerk/types isn't a direct
// dependency, and this is the same resource every caller already holds.
type ClerkUser = NonNullable<ReturnType<typeof useUser>['user']>;

/** What the player is told, either way the write goes. */
interface SaveCopy {
    /**
     * Omit to land the write without a toast — for a caller making this write
     * one of two and reporting both itself, where two confirmations for one
     * press would be one too many.
     */
    success?: string;
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
 * Sensitive writes — changing a username is one — need recent verification,
 * so Clerk rejects a stale session with a reverification hint the second time
 * around ("You need to provide additional verification…"). Running every write
 * through useReverification turns that hint into Clerk's own step-up modal and
 * retries the write once it's satisfied, instead of surfacing it as a failure.
 *
 * Returns whether the write landed, so a caller can close its editor on the
 * way out.
 */
export function useClerkUserSave() {
    const { user } = useUser();
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    // Passing `user` through rather than closing over it keeps the fetcher
    // honest about needing one, and lets the guard below own the null check.
    const runWrite = useReverification(
        (write: (user: ClerkUser) => Promise<unknown>, target: ClerkUser) => write(target),
    );

    const save = async (write: (user: ClerkUser) => Promise<unknown>, copy: SaveCopy): Promise<boolean> => {
        if (!user || isSaving) return false;
        setIsSaving(true);
        try {
            await runWrite(write, user);
            await user.reload().catch(error => console.error('Failed to reload the user', error));
            if (copy.success) showToast(copy.success, 'success', copy.title);
            return true;
        } catch (error) {
            // Closing the reverification modal is a deliberate "not now", not a
            // failed save — leave the field as it was without a scary toast.
            if (isReverificationCancelledError(error)) return false;
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
