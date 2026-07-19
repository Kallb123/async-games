'use client'

import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import moment from 'moment';

export default function OutgoingInviteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
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

            fetch('/api/user/outgoinginvites')
            .then(response => response.json())
            .then(data => {if (data && data.inviteList) setInviteList(data.inviteList)})
            .catch(error => console.error('Failed to load outgoing invites', error));
        }
    }

    const handleCancel = async (inviteId: `${string}-${string}-${string}-${string}-${string}`) => {
        fetch('/api/invite/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inviteId })
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to cancel invite');
            return response.json();
        })
        .then(() => refreshContent())
        .catch(error => console.error('Failed to cancel invite', error));
    }

    if (inviteList.length === 0) return null;

    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">Awaiting response</h2>
            </div>
            <div className="ag-list">
                {inviteList.map((invite) => (
                    <div key={invite.inviteId} className="ag-list-row">
                        <div style={{
                            width: 8, height: 8, borderRadius: "50%", flex: "none",
                            background: "oklch(0.75 0.03 60)", outline: "1.5px dashed oklch(0.7 0.05 60)", outlineOffset: 2,
                        }} />
                        <div className="ag-list-row-main">
                            <div style={{ font: "600 13px/1.35 var(--ag-font)" }}>
                                Invite to <strong style={{ fontWeight: 800 }}>{invite.userList.join(", ")}</strong>
                                <span style={{ color: "var(--ag-ink-soft)", fontWeight: 500 }}> · {invite.gameFriendlyName}</span>
                            </div>
                            <div className="ag-list-row-sub">Sent {moment(invite.timestamp).fromNow()}</div>
                        </div>
                        <button type="button" className="ag-link-muted" onClick={() => handleCancel(invite.inviteId)}>Cancel</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
