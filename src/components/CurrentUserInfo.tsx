'use client'

import { useUser } from "@clerk/nextjs";
import { currentUsername, fullName } from "@/utils/ui/players";

// Clerk's user is the only input here, so the label is derived on render rather
// than copied into state by an effect (react-hooks/set-state-in-effect).
// Through players.ts rather than spelled out: a guest has no real name and no
// handle worth showing, only the name they typed at the join screen.
function nameFor(user: ReturnType<typeof useUser>['user']): string {
    return fullName(user) || currentUsername(user);
}

export default function CurrentUserInfo() {
    const { user, isLoaded } = useUser();
    const visibleName = isLoaded ? nameFor(user) : 'Loading';

    return (
        <div>
            Signed in as <span title={user?.id} style={{ fontWeight: 700 }}>{visibleName}</span>
            {user?.publicMetadata.unlocked === true ? "" : " · locked"}
        </div>
    );
}
