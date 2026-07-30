'use client'

import { useUser } from "@clerk/nextjs";

// Clerk's user is the only input here, so the label is derived on render rather
// than copied into state by an effect (react-hooks/set-state-in-effect).
function nameFor(user: ReturnType<typeof useUser>['user']): string {
    if (user?.firstName) {
        return user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName;
    }
    return user?.username ?? `${user?.id}`;
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
