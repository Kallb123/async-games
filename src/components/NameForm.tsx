'use client'

import { useState } from "react";
import ActionButton from "@/components/ui/ActionButton";
import DisplayNameField from "@/components/ui/DisplayNameField";
import { useToast } from "@/components/ToastContext";
import { useClerkUserSave } from "@/utils/hooks/useClerkUserSave";
import { chosenName, isGuest, publicHandle, readableName } from "@/utils/ui/players";
import { DISPLAY_NAME_RULE, MAX_DISPLAY_NAME_LENGTH, isValidDisplayName } from "@/utils/users/displayName";
import { MAX_USERNAME_LENGTH, USERNAME_RULE, isValidUsername } from "@/utils/users/username";

const SAVE_TIMEOUT_MS = 30000;

// Changing what a player is called: their display name — the free-text name
// every other player sees — and the handle they are found and invited by.
//
// One form for both because they are one question — "what should people call
// me?" — asked at two levels of formality, and answering it should not mean
// finding two editors. They are not one *write*, though, and deliberately so:
//
//  - The handle is a field on the signed-in Clerk user, written from the
//    browser the way useProfilePicture writes a picture. Clerk enforces
//    uniqueness on the write, so a taken one comes back as
//    form_identifier_exists and reaches the player as the sentence Clerk wrote
//    for it — and, because it is a sensitive field, Clerk can step the player
//    up to re-verify first. Both would be lost if the server wrote it instead.
//  - The display name is the one string the whole table reads, so it goes
//    through POST /api/user/displayname, where it is validated and rate
//    limited rather than being whatever the browser sent.
//
// The handle goes first: it is the half that can be refused. Losing that race
// leaves both names as they were, rather than renaming the player and then
// telling them the save failed.
export default function NameForm({ onSaved }: {
    /** Closes the editor once the new name is live. */
    onSaved?: () => void;
}) {
    // The guard, the reload that makes the new handle current everywhere it
    // shows, the toast pair and the in-flight flag are the same things a
    // profile picture needs, so they live in the shared hook.
    const { user, isSaving, save } = useClerkUserSave();
    const { showToast } = useToast();
    const [isSavingName, setIsSavingName] = useState(false);
    // A guest's handle is the account id createGuest() minted rather than
    // anything they picked, so there is nothing there for them to edit — and
    // publicHandle, not user.username, is what keeps that id off the screen.
    // The whole guest rule lives here, which is why the profile page's button
    // is unconditional.
    const guest = !!user && isGuest(user);
    // Their chosen name, which is empty for anyone still going by their
    // handle — the box then opens on the handle itself, since that is the
    // name people currently see them under and the one they are editing away
    // from. A guest has no handle, so theirs opens on the name they typed at
    // the join screen.
    const currentName = chosenName(user) ?? '';
    const currentHandle = publicHandle(user) ?? '';

    const [name, setName] = useState(currentName || readableName(user, ''));
    const [handle, setHandle] = useState(currentHandle);

    const nextName = name.trim();
    const nextHandle = handle.trim();
    const nameChanged = nextName !== currentName;
    const handleChanged = !guest && nextHandle !== currentHandle;
    // An empty display name means "just go by my handle", so it is only
    // allowed to somebody who has one. Asked of the handle rather than of the
    // guest flag on purpose: a player who claimed their account before
    // /api/user/claim started minting handles has no flag and no handle
    // either, and blanking their name would leave them nameless. The route
    // refuses the same thing server-side — this is the half that says so
    // before they press the button.
    // Asked only of a name they actually changed. A display name minted before
    // today's rule — the lobby's "Dave (2)", suffixed past the length cap —
    // would otherwise fail this and disable Save for a player who only came
    // here to edit their username, with nothing on screen saying why.
    const nameValid = !nameChanged || (nextName ? isValidDisplayName(nextName) : !!currentHandle);
    // The same player is not made to invent a handle before they can fix their
    // display name — only one they have, or one they typed, has to be valid.
    const handleValid = guest || (!nextHandle && !currentHandle) || isValidUsername(nextHandle);
    const busy = isSaving || isSavingName;
    const canSave = !!user && !busy && (nameChanged || handleChanged) && nameValid && handleValid;

    // The server owns this one, so the toast reports what the route said went
    // wrong rather than guessing. A reload afterwards for the same reason
    // useClerkUserSave does one: the new name has to be current everywhere it
    // shows, and a failure there is a stale screen, not a failed save.
    const saveDisplayName = async (): Promise<boolean> => {
        setIsSavingName(true);
        try {
            const response = await fetch('/api/user/displayname', {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: nextName }),
                // Without a deadline a stalled connection never settles, the
                // `finally` below never runs, and the editor sits disabled
                // behind its own in-flight flag with nothing said.
                signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
            });
            if (!response.ok) {
                // The route puts its refusal in the body: statusText is empty
                // over HTTP/2, so reading that alone would turn "that name is
                // too long" into "something went wrong".
                const said = await response.json().catch(() => null);
                showToast(said?.error || "Couldn't save your display name. Please try again.", 'danger');
                return false;
            }
            await user?.reload().catch(error => console.error('Failed to reload the user', error));
            return true;
        } catch (error) {
            console.error('Failed to save the display name', error);
            showToast("Couldn't save your display name. Please try again.", 'danger');
            return false;
        } finally {
            setIsSavingName(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!canSave) return;

        // The refusable half first (see the note above the component).
        if (handleChanged && !(await save(user => user.update({ username: nextHandle }), {
            // Its own toast only when it is the only thing that moved —
            // otherwise the one below speaks for both.
            success: nameChanged ? undefined : `Friends can invite you as @${nextHandle} now.`,
            title: 'Username changed',
            failure: "Couldn't change your username. Please try again.",
        }))) return;

        if (nameChanged) {
            if (!await saveDisplayName()) return;
            // What they will be called now, resolved by the same rule every
            // other player's screen will run rather than a second guess at the
            // order — so clearing a display name reports the handle it falls
            // back to.
            const now = readableName({
                publicMetadata: { guest, displayName: nextName },
                username: nextHandle,
            });
            showToast(`You're ${now} now.`, 'success', 'Name changed');
        }

        onSaved?.();
    };

    return (
        <form onSubmit={handleSubmit} className="ag-card ag-form-card">
            <DisplayNameField
                id="profile-display-name"
                label="Display name"
                value={name}
                onChange={setName}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                placeholder="Your name"
                disabled={busy}
                hint={`This is what other players see. ${DISPLAY_NAME_RULE}${currentHandle ? ' Leave it empty to go by your username instead.' : ''}`}
            />
            {!guest && (
                <DisplayNameField
                    id="profile-username"
                    label="Username"
                    value={handle}
                    onChange={setHandle}
                    maxLength={MAX_USERNAME_LENGTH}
                    placeholder="yourname"
                    disabled={busy}
                    hint={`This is how friends find and invite you. ${USERNAME_RULE}`}
                />
            )}
            <ActionButton
                type="submit"
                className="ag-btn ag-btn--primary ag-btn--block"
                pending={busy}
                pendingLabel="Saving…"
                disabled={!canSave}
            >
                Save name
            </ActionButton>
        </form>
    );
}
