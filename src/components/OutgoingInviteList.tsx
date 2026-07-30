'use client'

import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import moment from 'moment';
import ListSection from "@/components/ui/ListSection";
import { INVITE_EVENTS } from "@/utils/hooks/usePushEvents";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";

export default function OutgoingInviteList() {
    const { data, isLoading, isRefreshing, refresh } = useRefreshableData<{ inviteList: IInvitationResponse[] }>(
        '/api/user/outgoinginvites',
        INVITE_EVENTS,
    );

    const inviteList = data?.inviteList ?? [];

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
        .then(() => refresh())
        .catch(error => console.error('Failed to cancel invite', error));
    }

    return (
        <ListSection
            label="Awaiting response"
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            hasItems={inviteList.length > 0}
            skeletonAvatar={false}
        >
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
        </ListSection>
    );
}
