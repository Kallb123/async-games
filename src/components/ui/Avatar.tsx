'use client'

import { avatarColor, initials } from "@/utils/ui/avatar";

interface AvatarProps {
    name: string | null | undefined;
    size?: number;
    ring?: string;
}

export default function Avatar({ name, size = 36, ring }: AvatarProps) {
    const { bg, fg } = avatarColor(name);
    return (
        <div
            className="ag-avatar"
            style={{
                width: size,
                height: size,
                background: bg,
                color: fg,
                fontSize: Math.round(size * 0.38),
                border: ring ? `${Math.max(2, Math.round(size * 0.05))}px solid ${ring}` : undefined,
            }}
        >
            {initials(name)}
        </div>
    );
}
