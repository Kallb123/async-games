'use client'

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export default function CurrentUserInfo() {
    const { user, isLoaded } = useUser();
    const [visibleName, setVisibleName] = useState('Loading');

    useEffect(() => {
        if (isLoaded) {
            if (user?.firstName) {
                if (user?.lastName) {
                    setVisibleName(`${user?.firstName} ${user?.lastName}`);
                } else {
                    setVisibleName(`${user?.firstName}`);
                }
            } else if (user?.username) {
                setVisibleName(`${user?.username}`);
            } else {
                setVisibleName(`${user?.id}`);
            }
        }
    }, [isLoaded, user]);

    return (
        <div>
            <p>
                Hello {visibleName}. Unlocked: {user?.publicMetadata.unlocked === true ? "Yes" : "No"}
            </p>
        </div>
    );
}
