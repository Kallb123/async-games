'use client'

import { DiceCitiesInvitationData } from "@/app/api/newgame/dicecities/route";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function IncomingInviteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [inviteList, setInviteList] = useState([] as DiceCitiesInvitationData[]);

    useEffect(() => {
      if (isLoaded) {
          if (!user) {
              router.push('/login');
          }
  
          // Use `user` to render user details or create UI elements
          const unlocked = user?.publicMetadata.unlocked;
        
          if (unlocked !== true) {
            router.push('/unlockaccess');
          }

          fetch('/api/user/incominginvites')
          .then(response => response.json())
          .then(data => setInviteList(data.inviteList));
      }
    }, [isLoaded]);

    return (
        <>
            <h2>Incoming Invites</h2>
            <ul>
                {inviteList.map((invite: DiceCitiesInvitationData) => (
                    <li key={invite.inviteId}>{invite.timestamp} {invite.senderId}</li>
                ))}
            </ul>
        </>
    );
}
