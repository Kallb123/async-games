'use client'

import { useUser } from "@clerk/nextjs";
import { currentUsername } from "@/utils/ui/players";

export default function CurrentUserInfo() {
    const { user, isLoaded } = useUser();
    // Clerk's user is the only input here, so the label is derived on render
    // rather than copied into state by an effect
    // (react-hooks/set-state-in-effect). The same name everyone else sees them
    // under, since that is now the only name there is.
    const visibleName = isLoaded ? currentUsername(user) : 'Loading';

    return (
        <div>
            Signed in as <span title={user?.id} style={{ fontWeight: 700 }}>{visibleName}</span>
            {user?.publicMetadata.unlocked === true ? "" : " · locked"}
        </div>
    );
}
