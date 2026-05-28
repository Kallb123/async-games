'use client'

import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import moment from 'moment';
import { useToast } from "@/components/ToastContext";

export default function IncomingInviteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const { showToast } = useToast();
    const [inviteList, setInviteList] = useState([] as IInvitationResponse[]);

    useEffect(() => {
        window.addEventListener('NewInvite', () => {
            console.log(`IncomingInviteList message received: NewInvite`);
            refreshContent();
        });
        window.addEventListener('InviteAccepted', () => {
            console.log(`IncomingInviteList message received: InviteAccepted`);
            refreshContent();
        });
        window.addEventListener('GameStart', () => {
            console.log(`IncomingInviteList message received: GameStart`);
            refreshContent();
        });

        refreshContent();
    }, [isLoaded]);

    const refreshContent = async () => {
        console.log('Refresh incoming invite');
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
    
            // Use `user` to render user details or create UI elements
            const unlocked = user?.publicMetadata.unlocked;
          
            if (unlocked !== true) {
              router.push('/unlockaccess');
            }

            console.log("Attempting to update incoming invite list");
            fetch('/api/user/incominginvites')
            .then(response => response.json())
            .then(data => {if (data && data.inviteList) setInviteList(data.inviteList);});
        } else {
            console.log("Refresh failed, isLoaded", isLoaded);
        }
    }

    const handleAccept = (inviteId: `${string}-${string}-${string}-${string}-${string}`) => {
        fetch('/api/invite/accept', {
            method: "POST",
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({inviteId})
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to accept invite');
            }
            return response.json();
        })
        .then(data => {
            if (data.gameStarted) {
                showToast('Game is starting! Redirecting you now...', 'success', 'Game Started');
                router.push(`/games/${data.gameUrl}/${data.gameId}`);
            } else {
                showToast('Invite accepted! Waiting for other players to accept.', 'success', 'Invite Accepted');
                refreshContent();
            }
        })
        .catch(() => {
            showToast('Failed to accept the invite. Please try again.', 'danger');
        });
    }

    return (
        <>
            <h2>Incoming Invites</h2>
            {inviteList.map((invite: IInvitationResponse) => (
                <div key={invite.inviteId}>
                    <span style={{fontWeight: "bold"}}>{invite.sender}</span> has invited you to play <span style={{fontWeight: "bold"}}>{invite.gameFriendlyName}</span><br />
                    <span>{moment(invite.timestamp).fromNow()}</span> - <a href="#" onClick={() => handleAccept(invite.inviteId)}>Accept</a> or <a href="#">Decline</a>
                </div>
            ))}
        </>
    );
}
