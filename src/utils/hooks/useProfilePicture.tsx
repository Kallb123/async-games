'use client'

import { useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/components/ToastContext";
import { profileImageUrl } from "@/utils/ui/avatar";

// What Clerk's image endpoint accepts, and the size it caps an upload at.
// Checked here so a rejected file gets a sentence the player can act on
// instead of a failed request.
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

// The "change my profile picture" flow, shared by whatever wants to start it.
// Clerk already hosts profile pictures (that's where the SSO ones come from),
// so an upload is one call on the signed-in user resource — no upload endpoint,
// no bucket, and no new field: `hasImage` flips true and every avatar in the
// app picks the picture up through profileImageUrl.
//
// Returns the hidden file input to render, so a caller only has to place it and
// wire `openPicker` to whatever the player clicks.
export function useProfilePicture() {
    const { user } = useUser();
    const { showToast } = useToast();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isSaving, setIsSaving] = useState(false);

    const save = async (file: File | null, successMessage: string) => {
        if (!user || isSaving) return;
        setIsSaving(true);
        try {
            await user.setProfileImage({ file });
            // Re-read the user so `imageUrl`/`hasImage` are current: every
            // avatar on screen renders from them. The picture is already saved
            // by this point, so a failure here is a stale avatar, not a failed
            // upload — don't report it as one.
            await user.reload().catch(error => console.error('Failed to reload the user', error));
            showToast(successMessage, 'success', 'Profile picture');
        } catch (error) {
            console.error('Failed to update the profile picture', error);
            showToast('Could not update your picture. Please try again.', 'danger');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFile = (file: File) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
            showToast('That file type is not supported — use a PNG, JPEG, GIF or WebP image.', 'warning');
            return;
        }
        if (file.size > MAX_BYTES) {
            showToast('That image is too big — pick one under 10MB.', 'warning');
            return;
        }
        save(file, 'Profile picture updated!');
    };

    return {
        /** True while an upload or removal is in flight. */
        isSaving,
        /** True once the player has a picture — SSO-supplied or uploaded. */
        hasPicture: profileImageUrl(user) !== null,
        /** Opens the file picker; wire this to the avatar. */
        openPicker: () => inputRef.current?.click(),
        removePicture: () => save(null, 'Profile picture removed.'),
        /** Render this anywhere inside the screen — it is not visible. */
        fileInput: (
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                hidden
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Clear the input first: picking the same file twice in a
                    // row has to fire another change event.
                    e.target.value = "";
                    if (file) handleFile(file);
                }}
            />
        ),
    };
}
