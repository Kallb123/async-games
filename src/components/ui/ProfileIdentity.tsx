'use client'

import { ReactNode } from "react";
import Avatar from "@/components/ui/Avatar";

interface ProfileIdentityProps {
    name: string;
    username: string | null | undefined;
    imageUrl?: string | null;
    fullName?: string;
    /** When set, the avatar becomes the button that starts the picture flow. */
    onAvatarClick?: () => void;
    /** Shows a spinner over the avatar while the new picture is saving. */
    avatarBusy?: boolean;
    /** Control rendered under the name — e.g. "Remove photo". */
    action?: ReactNode;
}

// Avatar + display name + "@username · Full Name" header. Shared by a
// player's own profile and a friend's read-only profile; only your own
// passes the editing props, so a friend's avatar stays a plain badge.
export default function ProfileIdentity({
    name, username, imageUrl, fullName, onAvatarClick, avatarBusy, action,
}: ProfileIdentityProps) {
    const avatar = <Avatar name={name} imageUrl={imageUrl} size={64} ring="var(--ag-terracotta)" />;

    return (
        <div className="ag-section" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {onAvatarClick
                ? (
                    <button
                        type="button"
                        className="ag-avatar-edit"
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
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "800 24px/1.1 var(--ag-font)", color: "var(--ag-ink)" }}>{name}</div>
                <div style={{ font: "500 12px var(--ag-font)", color: "var(--ag-ink-soft)" }}>
                    {username ? `@${username}` : "No username"}{fullName ? ` · ${fullName}` : ""}
                </div>
                {action && <div style={{ marginTop: 6 }}>{action}</div>}
            </div>
        </div>
    );
}
