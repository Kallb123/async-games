'use client'

import { InvitationResponse } from "@/utils/mongodb/InvitationData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Moment from 'react-moment';

export default function OutgoingInviteList() {
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

          fetch('/api/user/outgoinginvites')
          .then(response => response.json())
          .then(data => setInviteList(data.inviteList));
      }
    }, [isLoaded]);

    return (
        <>
            <h2>Awaiting Response</h2>
            <ul>
                {inviteList.map((invite: InvitationResponse) => (
                    <li key={invite.inviteId}><Moment fromNow>{invite.timestamp}</Moment>: {invite.userList.map(user => (<span key={user}>{user}</span>))}</li>
                ))}
            </ul>
        </>
    );
}
