'use client'

import { InvitationData } from "@/utils/mongodb/InvitationData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function OutgoingInviteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [inviteList, setInviteList] = useState([] as InvitationData[]);

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

          fetch('/api/user/outgoinginvites')
          .then(response => response.json())
          .then(data => setInviteList(data.inviteList));
      }
    }, [isLoaded]);

    return (
        <>
            <h2>Awaiting Response</h2>
            <ul>
                {inviteList.map((invite: InvitationData) => (
                    <li key={invite.inviteId}>{invite.timestamp} {invite.userIdList.map(user => (<span key={user.userId}>{user.userId}</span>))}</li>
                ))}
            </ul>
        </>
    );
}
