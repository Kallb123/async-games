'use client'

import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import moment from 'moment';
import { Spinner } from "react-bootstrap";

export default function OutgoingInviteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [inviteList, setInviteList] = useState([] as IInvitationResponse[]);
    const [isLoading, setIsLoading] = useState(false);

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

            setIsLoading(true);
            fetch('/api/user/outgoinginvites')
            .then(response => response.json())
            .then(data => {if (data && data.inviteList) setInviteList(data.inviteList)})
            .catch(error => console.error('Failed to load outgoing invites', error))
            .finally(() => setIsLoading(false));
        }
    }

    const handleCancel = async (inviteId: `${string}-${string}-${string}-${string}-${string}`) => {
        fetch('/api/invite/cancel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ inviteId })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to cancel invite');
            }
            return response.json();
        })
        .then(() => refreshContent())
        .catch(error => console.error('Failed to cancel invite', error));
    }

    return (
        <>
            <h2>Awaiting Response</h2>
            {isLoading && <Spinner animation="border" role="status" size="sm"><span className="visually-hidden">Loading...</span></Spinner>}
            {inviteList.map((invite: IInvitationResponse) => (
                <div key={invite.inviteId}>
                    You invited <span style={{fontWeight: "bold"}}>{invite.userList.map(user => (<span key={user}>{user}</span>))}</span> to play <span style={{fontWeight: "bold"}}>{invite.gameFriendlyName}</span><br />
                    <span>{moment(invite.timestamp).fromNow()}</span>
                    <button type="button" className="btn btn-link p-0 ms-2" onClick={() => handleCancel(invite.inviteId)}>Cancel invite</button>
                </div>
            ))}
        </>
    );
}
