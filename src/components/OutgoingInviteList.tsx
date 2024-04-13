'use client'

import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Moment from 'react-moment';

export default function OutgoingInviteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [inviteList, setInviteList] = useState([] as IInvitationResponse[]);

    useEffect(() => {
        window.addEventListener('NewInvite', () => {
            console.log(`OutgoingInviteList message received: NewInvite`);
            refreshContent();
        });
        window.addEventListener('InviteAccepted', () => {
            console.log(`OutgoingInviteList message received: InviteAccepted`);
            refreshContent();
        });
        window.addEventListener('GameStart', () => {
            console.log(`OutgoingInviteList message received: GameStart`);
            refreshContent();
        });

        refreshContent();
    }, [isLoaded]);

    const refreshContent = async () => {
        console.log('Refresh outgoing invite');
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
            .then(data => {if (data && data.inviteList) setInviteList(data.inviteList)});
        }
    }

    return (
        <>
            <h2>Awaiting Response</h2>
            <ul>
                {inviteList.map((invite: IInvitationResponse) => (
                    <li key={invite.inviteId}><Moment fromNow>{invite.timestamp}</Moment>: {invite.userList.map(user => (<span key={user}>{user}</span>))}</li>
                ))}
            </ul>
        </>
    );
}
