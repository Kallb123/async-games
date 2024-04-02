'use client'

import { useUser } from "@clerk/nextjs";

export default function CurrentUserInfo() {
    const { user, isLoaded } = useUser();

    return (
        <div>
            <p>
            Hello {user?.firstName} {user?.lastName}. Unlocked: {user?.publicMetadata.unlocked === true ? "Yes" : "No"}
            </p>
        </div>
    );
}
