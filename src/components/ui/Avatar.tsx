'use client'

import Image from "next/image";
import { useState } from "react";
import { avatarColor, initials } from "@/utils/ui/avatar";

interface AvatarProps {
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
            {initials(name)}
        </div>
    );
}
