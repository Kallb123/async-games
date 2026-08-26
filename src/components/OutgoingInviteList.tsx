'use client'

import { IInvitationResponse } from "@/utils/mongodb/InvitationData";
import moment from 'moment';
import Link from "next/link";
import ListSection from "@/components/ui/ListSection";
import { lobbyPath } from "@/utils/games/lobby";
import type { RefreshableState } from "@/utils/hooks/useRefreshableData";

interface OutgoingInviteListProps extends RefreshableState {
    invites: IInvitationResponse[];
    /** Re-reads the dashboard after this list changes something. */
    onChanged: () => void;
}

export default function OutgoingInviteList({ invites, isLoading, isRefreshing, onChanged }: OutgoingInviteListProps) {

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
        .then(() => onChanged())
        .catch(error => console.error('Failed to cancel invite', error));
    }

    return (
        <ListSection
            label="Awaiting response"
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            skeletonIcon="dot"
        >
            {invites.map((invite) => {
                const summary = (
                    <>
                        <div style={{ font: "600 13px/1.35 var(--ag-font)" }}>
                            Invite to <strong style={{ fontWeight: 800 }}>{invite.userList.join(", ")}</strong>
                            <span style={{ color: "var(--ag-ink-soft)", fontWeight: 500 }}> · {invite.gameFriendlyName}</span>
                        </div>
                        <div className="ag-list-row-sub">
                            Sent {moment(invite.timestamp).fromNow()}
                            {/* Says the row goes somewhere: every other row in
                                this list is a dead end, so a lobby's has to
                                offer the trip rather than leave it to be
                                guessed at. */}
                            {invite.joinCode && " · tap for the code"}
                        </div>
                    </>
                );
                return (
                    <div key={invite.inviteId} className="ag-list-row">
                        <div style={{
                            width: 8, height: 8, borderRadius: "50%", flex: "none",
                            background: "oklch(0.75 0.03 60)", outline: "1.5px dashed oklch(0.7 0.05 60)", outlineOffset: 2,
                        }} />
                        {/* An open lobby is the one invite here with a screen of
                            its own — the code to share and the seats filling up.
                            The host lands on it when they create the lobby, and
                            this row is how they get back to it afterwards. A
                            plain invite has nothing to go to, so it stays a
                            row rather than growing a link to nowhere. */}
                        {invite.joinCode
                            ? (
                                <Link href={lobbyPath(invite.inviteId)} className="ag-list-row-main">
                                    {summary}
                                </Link>
                            )
                            : <div className="ag-list-row-main">{summary}</div>}
                        <button type="button" className="ag-link-muted" onClick={() => handleCancel(invite.inviteId)}>Cancel</button>
                    </div>
                );
            })}
        </ListSection>
    );
}
