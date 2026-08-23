'use client'

import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import moment from 'moment';
import { useToast } from "@/components/ToastContext";
import Avatar from "@/components/ui/Avatar";
import ListSection from "@/components/ui/ListSection";
import ThumbBadge from "@/components/ui/ThumbBadge";
import { metaForGame } from "@/utils/ui/games";
import { INVITE_EVENTS } from "@/utils/hooks/usePushEvents";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { useEnterStartedGame } from "@/utils/hooks/useEnterStartedGame";

export default function IncomingInviteList() {
    const { showToast } = useToast();
    const enterStartedGame = useEnterStartedGame();
    const { data, isLoading, isRefreshing, refresh } = useRefreshableData<{ inviteList: IInvitationResponse[] }>(
        '/api/user/incominginvites',
        INVITE_EVENTS,
    );

    const inviteList = data?.inviteList ?? [];

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
                enterStartedGame(data.gameUrl, data.gameId);
            } else {
                showToast('Invite accepted! Waiting for other players to accept.', 'success', 'Invite Accepted');
                refresh();
            }
        })
        .catch(() => showToast('Failed to accept the invite. Please try again.', 'danger'));
    }

    return (
        <ListSection
            label="Invites"
            showCount
            isLoading={isLoading}
            isRefreshing={isRefreshing}
        >
            {inviteList.map((invite) => {
                const meta = metaForGame({ friendlyName: invite.gameFriendlyName });
                return (
                    <div key={invite.inviteId} className="ag-list-row">
                        <div className="ag-avatar-stack">
                            <Avatar name={invite.sender} imageUrl={invite.senderImageUrl} size={34} />
                            {meta && <ThumbBadge meta={meta} />}
                        </div>
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
                );
            })}
        </ListSection>
    );
}
