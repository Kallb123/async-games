'use client'

import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import moment from 'moment';
import { useToast } from "@/components/ToastContext";
import Avatar from "@/components/ui/Avatar";

export default function IncomingInviteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const { showToast } = useToast();
    const [inviteList, setInviteList] = useState([] as IInvitationResponse[]);

    useEffect(() => {
        window.addEventListener('NewInvite', () => refreshContent());
        window.addEventListener('InviteAccepted', () => refreshContent());
        window.addEventListener('GameStart', () => refreshContent());

        refreshContent();
    }, [isLoaded]);

    const refreshContent = async () => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
            const unlocked = user?.publicMetadata.unlocked;
            if (unlocked !== true) {
                router.push('/unlockaccess');
            }

            fetch('/api/user/incominginvites')
            .then(response => response.json())
            .then(data => {if (data && data.inviteList) setInviteList(data.inviteList);})
            .catch(error => console.error('Failed to load incoming invites', error));
        }
    }

    const handleAccept = (inviteId: `${string}-${string}-${string}-${string}-${string}`) => {
        fetch('/api/invite/accept', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({inviteId})
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to accept invite');
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
        .catch(() => showToast('Failed to accept the invite. Please try again.', 'danger'));
    }

    if (inviteList.length === 0) return null;

    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">Invites · {inviteList.length}</h2>
            </div>
            <div className="ag-list">
                {inviteList.map((invite) => (
                    <div key={invite.inviteId} className="ag-list-row">
                        <Avatar name={invite.sender} size={34} />
                        <div className="ag-list-row-main">
                            <div style={{ font: "500 13px/1.4 var(--ag-font)", color: "var(--ag-ink)" }}>
                                <strong style={{ fontWeight: 800 }}>{invite.sender}</strong> invited you to<br />
                                <strong style={{ fontWeight: 800 }}>{invite.gameFriendlyName}</strong>
                                <span style={{ color: "var(--ag-ink-softer)", fontWeight: 500 }}> · {moment(invite.timestamp).fromNow()}</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="ag-pill-action ag-pill-action--accept"
                            onClick={() => handleAccept(invite.inviteId)}
                        >
                            Accept
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
