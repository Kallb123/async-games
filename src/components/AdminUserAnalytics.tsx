'use client'

import ListRow from '@/components/ui/ListRow';
import ListSection from '@/components/ui/ListSection';
import Section from '@/components/ui/Section';
import Stat from '@/components/ui/Stat';
import { useRefreshableData } from '@/utils/hooks/useRefreshableData';
import { pluralize } from '@/utils/ui/text';
import type { AdminAnalyticsBreakdownEntry, IAdminAnalyticsResponse } from '@/utils/users/adminAnalytics';

function shareOf(count: number, total: number): string {
    return total > 0 ? `${Math.round((count / total) * 100)}%` : '—';
}

function Breakdown({ label, entries, totalDevices, isRefreshing }: {
    label: string;
    entries: AdminAnalyticsBreakdownEntry[];
    totalDevices: number;
    isRefreshing: boolean;
}) {
    return (
        <ListSection
            label={label}
            isLoading={false}
            isRefreshing={isRefreshing}
            skeletonRows={0}
            empty={<div className="ag-empty">No registered devices yet.</div>}
        >
            {entries.map(entry => (
                <ListRow
                    key={entry.label}
                    title={entry.label}
                    action={<span>{pluralize(entry.count, 'device')} · {shareOf(entry.count, totalDevices)}</span>}
                />
            ))}
        </ListSection>
    );
}

/**
 * A read-only snapshot of the registered push devices across every account —
 * what platforms and browsers players are actually on (docs/admin-tools.md).
 * Generated on the fly from `GET /api/admin/analytics` rather than kept in
 * sync anywhere, since this is a screen an admin opens rarely.
 */
export default function AdminUserAnalytics() {
    const { data, isLoading, isRefreshing, status, refresh } = useRefreshableData<IAdminAnalyticsResponse>('/api/admin/analytics');

    return (
        <>
            <Section
                label="User analytics"
                isLoading={isLoading}
                action={<button type="button" className="ag-section-action" onClick={refresh}>Refresh</button>}
            >
                {status !== null && status >= 400 ? (
                    <div className="ag-empty">Couldn&apos;t load the analytics.</div>
                ) : (
                    <>
                        <div className="ag-stat-row">
                            <Stat value={data?.totalDevices ?? '—'} label="Registered devices" />
                            <Stat value={data?.usersWithDevices ?? '—'} label="Accounts with a device" />
                            <Stat value={data?.scannedUsers ?? '—'} label="Accounts scanned" />
                        </div>
                        <p className="ag-hint">
                            Built from every account&apos;s registered push devices — a device is counted once
                            per account, and one player on two devices counts as two.
                        </p>
                    </>
                )}
            </Section>

            {data && status !== null && status < 400 && (
                <>
                    <Breakdown label="Desktop vs. mobile" entries={data.byType} totalDevices={data.totalDevices} isRefreshing={isRefreshing} />
                    <Breakdown label="Operating system" entries={data.byOs} totalDevices={data.totalDevices} isRefreshing={isRefreshing} />
                    <Breakdown label="Browser" entries={data.byBrowser} totalDevices={data.totalDevices} isRefreshing={isRefreshing} />
                </>
            )}
        </>
    );
}
