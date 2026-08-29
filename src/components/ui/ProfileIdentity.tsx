'use client'

import { ReactNode } from "react";
import Avatar from "@/components/ui/Avatar";
import Skeleton from "@/components/ui/Skeleton";
import type { ProfileHeading } from "@/utils/ui/players";

// The name/handle/subtitle half comes straight from `profileHeading`, so the
// two screens that show a profile spread one value in rather than deriving
// four props apiece — and a guest reads the same on both.
interface ProfileIdentityProps extends ProfileHeading {
    imageUrl?: string | null;
    /** When set, the avatar becomes the button that starts the picture flow. */
    onAvatarClick?: () => void;
    /** Shows a spinner over the avatar while the new picture is saving. */
    avatarBusy?: boolean;
    /** Controls rendered under the name — e.g. "Edit username", "Remove photo". */
    action?: ReactNode;
}

// Avatar + display name + "@handle · Full Name" header. Shared by a
// player's own profile and a friend's read-only profile; only your own
// passes the editing props, so a friend's avatar stays a plain badge.
// With no name yet the whole header is a placeholder — silhouette badge and
// skeleton lines — rather than a stand-in word and its initial.
export default function ProfileIdentity({
    name, handle, noHandleLabel = "No username", imageUrl, fullName, onAvatarClick, avatarBusy, action,
}: ProfileIdentityProps) {
    const avatar = <Avatar name={name} imageUrl={imageUrl} size={64} ring="var(--ag-terracotta)" />;

    return (
        <div className="ag-section" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {onAvatarClick
                ? (
                    <button
                        type="button"
                        className="ag-avatar-stack ag-avatar-edit"
                        onClick={onAvatarClick}
                        disabled={avatarBusy}
                        aria-busy={avatarBusy || undefined}
                        aria-label={imageUrl ? "Change your profile picture" : "Add a profile picture"}
                    >
                        {avatar}
                        <span className="ag-avatar-edit-badge" aria-hidden="true">
                            {avatarBusy ? <span className="ag-spinner ag-spinner--sm" /> : "📷"}
                        </span>
                    </button>
                )
                : avatar}
            <div style={{ flex: 1, minWidth: 0 }} aria-busy={!name || undefined}>
                {name
                    ? (
                        <>
                            <div style={{ font: "800 24px/1.1 var(--ag-font)", color: "var(--ag-ink)" }}>{name}</div>
                            <div style={{ font: "500 12px var(--ag-font)", color: "var(--ag-ink-soft)" }}>
                                {handle ? `@${handle}` : noHandleLabel}{fullName ? ` · ${fullName}` : ""}
                            </div>
                        </>
                    )
                    : (
                        <>
                            <Skeleton width={150} height={20} />
                            <Skeleton width={100} height={11} style={{ marginTop: 8 }} />
                        </>
                    )}
                {action && <div style={{ marginTop: 6, display: "flex", gap: 12 }}>{action}</div>}
            </div>
        </div>
    );
}
