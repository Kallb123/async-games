'use client'

import Avatar from "@/components/ui/Avatar";

interface ProfileIdentityProps {
    name: string;
    username: string | null | undefined;
    imageUrl?: string | null;
    fullName?: string;
}

// Avatar + display name + "@username · Full Name" header. Shared by a
// player's own profile and a friend's read-only profile.
export default function ProfileIdentity({ name, username, imageUrl, fullName }: ProfileIdentityProps) {
    return (
        <div className="ag-section" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={name} imageUrl={imageUrl} size={64} ring="var(--ag-terracotta)" />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "800 24px/1.1 var(--ag-font)", color: "var(--ag-ink)" }}>{name}</div>
                <div style={{ font: "500 12px var(--ag-font)", color: "var(--ag-ink-soft)" }}>
                    {username ? `@${username}` : "No username"}{fullName ? ` · ${fullName}` : ""}
                </div>
            </div>
        </div>
    );
}
