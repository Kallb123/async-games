'use client'

import Image from "next/image";
import { useState } from "react";
import { avatarColor, initials } from "@/utils/ui/avatar";

interface AvatarProps {
    // The person's name, or null/undefined when we don't have one yet — the
    // badge then shows a silhouette rather than a letter from a placeholder.
    name: string | null | undefined;
    // A real profile picture (see profileImageUrl). Falls back to the
    // initials badge when absent, or if the image fails to load.
    imageUrl?: string | null;
    size?: number;
    ring?: string;
}

export default function Avatar({ name, imageUrl, size = 36, ring }: AvatarProps) {
    const { bg, fg } = avatarColor(name);
    const [imageFailed, setImageFailed] = useState(false);
    const border = ring ? `${Math.max(2, Math.round(size * 0.05))}px solid ${ring}` : undefined;

    if (imageUrl && !imageFailed) {
        return (
            <Image
                className="ag-avatar"
                src={imageUrl}
                alt=""
                width={size}
                height={size}
                style={{ width: size, height: size, objectFit: "cover", border }}
                onError={() => setImageFailed(true)}
            />
        );
    }

    const label = initials(name);

    return (
        <div
            className="ag-avatar"
            style={{
                width: size,
                height: size,
                background: bg,
                color: fg,
                fontSize: Math.round(size * 0.38),
                border,
            }}
        >
            {label || <Silhouette size={size} />}
        </div>
    );
}

// The stand-in for a person we can't name yet: their profile still loading,
// or a name the server never sent. A head and shoulders says "somebody"
// without pretending to be an initial.
function Silhouette({ size }: { size: number }) {
    return (
        <svg
            width={Math.round(size * 0.62)}
            height={Math.round(size * 0.62)}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
        >
            <circle cx="12" cy="8" r="4.2" />
            <path d="M12 14c-4 0-7.2 2.4-7.6 5.5a.9.9 0 0 0 .9 1h13.4a.9.9 0 0 0 .9-1C19.2 16.4 16 14 12 14Z" />
        </svg>
    );
}
