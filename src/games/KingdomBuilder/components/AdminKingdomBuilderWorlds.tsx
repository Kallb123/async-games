'use client'

import { useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import ListRow from '@/components/ui/ListRow';
import ListSection from '@/components/ui/ListSection';
import RefreshAction from '@/components/ui/RefreshAction';
import { useToast } from '@/components/ToastContext';
import { useJsonMutation } from '@/utils/hooks/useJsonMutation';
import { useRefreshableData } from '@/utils/hooks/useRefreshableData';
import { useNowToTheMinute } from '@/utils/hooks/useNow';
import { formatRelativeTime } from '@/utils/ui/time';

import type {
    AdminKingdomBuilderWorld,
    AdminKingdomBuilderWorldRequest,
    AdminKingdomBuilderWorldsResponse,
} from '../adminWorlds';

const ENDPOINT = '/api/admin/kingdombuilder-worlds';

const END_REASON_LABEL: Record<NonNullable<AdminKingdomBuilderWorld['endReason']>, string> = {
    host: 'by its host',
    abandoned: 'when its last player left',
    admin: 'by an admin',
};

// "4/6 players · tick 212 · opened 3d ago", then how it ended if it has.
// The relative times are absent before hydration (see `useNowToTheMinute`).
function worldLine(world: AdminKingdomBuilderWorld, now: number | null): string {
    const ended = world.endedAt
        && ['ended', formatRelativeTime(world.endedAt, now), world.endReason && END_REASON_LABEL[world.endReason]].filter(Boolean).join(' ');
    const opened = formatRelativeTime(world.createdAt, now);
    return [`${world.playerCount}/${world.seatCount} players`, `tick ${world.currentTick}`, opened && `opened ${opened}`, ended]
        .filter(Boolean)
        .join(' · ');
}

/**
 * Every Kingdom Builder world (docs/admin-tools.md, GDD §9.1), newest first,
 * with a control to end one or remove it outright — the tool for clearing out
 * test worlds that nobody will come back to end themselves.
 */
export default function AdminKingdomBuilderWorlds() {
    const { showToast } = useToast();
    const now = useNowToTheMinute();
    const [busy, setBusy] = useState<string | null>(null);
    const { data, setData, isLoading, isRefreshing, refresh } = useRefreshableData<AdminKingdomBuilderWorldsResponse>(ENDPOINT);

    const { submit, isPending, message } = useJsonMutation<AdminKingdomBuilderWorldsResponse>(ENDPOINT, "Could not change that world. Please try again.");

    const act = async (world: AdminKingdomBuilderWorld, action: AdminKingdomBuilderWorldRequest['action']) => {
        if (isPending) return;
        const question = action === 'delete'
            ? `Delete world ${world.seed} and every settlement in it? This can't be undone.`
            : `End world ${world.seed} for its ${world.playerCount} player${world.playerCount === 1 ? '' : 's'}? This can't be undone.`;
        if (!window.confirm(question)) return;
        setBusy(world.worldId);
        const body: AdminKingdomBuilderWorldRequest = { worldId: world.worldId, action };
        const worlds = await submit(body);
        setBusy(null);
        if (worlds) {
            setData(worlds);
            showToast(action === 'delete' ? 'World deleted.' : 'World ended.', 'success');
        }
    };

    return (
        <ListSection
            label="Worlds"
            showCount
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            action={<RefreshAction onClick={refresh} />}
            empty={<div className="ag-empty">{data === null ? "Couldn't load the worlds." : 'No worlds yet.'}</div>}
            hint={message ?? undefined}
        >
            {(data?.worlds ?? []).map(world => (
                <ListRow
                    key={world.worldId}
                    icon={world.endedAt ? '⏹' : '🏰'}
                    title={<>{world.seed}{world.endedAt && <span className="ag-tag">Ended</span>}</>}
                    sub={worldLine(world, now)}
                    action={world.endedAt
                        ? <ActionButton className="ag-btn ag-btn--danger" pending={busy === world.worldId} pendingLabel="Deleting…" disabled={isPending} onClick={() => act(world, 'delete')}>Delete</ActionButton>
                        : <ActionButton className="ag-btn ag-btn--light" pending={busy === world.worldId} pendingLabel="Ending…" disabled={isPending} onClick={() => act(world, 'end')}>End</ActionButton>}
                />
            ))}
        </ListSection>
    );
}
