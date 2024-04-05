'use client'

import { InvitationResponse } from "@/utils/mongodb/InvitationData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Moment from 'react-moment';

export default function IncomingInviteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [inviteList, setInviteList] = useState([] as InvitationResponse[]);

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

    const handleAccept = (inviteId: `${string}-${string}-${string}-${string}-${string}`) => {
        fetch('/api/invite/accept', {
            method: "POST",
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({inviteId})
        })
        .then(response => response.json())
        .then(data => setInviteList(data.inviteList));
    }

    return (
        <>
            <h2>Incoming Invites</h2>
            <ul>
                {inviteList.map((invite: InvitationResponse) => (
                    <li key={invite.inviteId} onClick={() => handleAccept(invite.inviteId)}><Moment fromNow>{invite.timestamp}</Moment>: {invite.sender}</li>
                ))}
            </ul>
        </>
    );
}
