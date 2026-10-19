'use client'
import ListRow from '@/components/ui/ListRow';
import ListSection from '@/components/ui/ListSection';
import CopyAction from '@/components/ui/CopyAction';
import RefreshAction from '@/components/ui/RefreshAction';
import Section from '@/components/ui/Section';
import Stat from '@/components/ui/Stat';
import { useRefreshableData } from '@/utils/hooks/useRefreshableData';
import type { AdminPerformanceResponse } from '@/app/api/admin/performance/route';
import { performanceWindowQuery } from '@/utils/performanceWindow';
import { formatPerformanceValue as value, fromDateTimeLocal, performanceMarkdown, toDateTimeLocal } from '@/utils/ui/performance';
import { useState } from 'react';

const HOUR_MS = 60 * 60 * 1000;
/** The "since" choices. A preset counts back from the moment it was picked (or the report was refreshed), so a refetch of the same url reads the same window. */
const WINDOWS = [
  { id: '24h', label: 'Last 24 hours', ms: 24 * HOUR_MS },
  { id: '7d', label: 'Last 7 days', ms: 7 * 24 * HOUR_MS },
  { id: '30d', label: 'Last 30 days', ms: 30 * 24 * HOUR_MS },
] as const;
const CUSTOM = 'custom';
/**
 * The "from build" choice that follows the window: only builds made after it
 * opened. A build is named by when it was built, so that is the window's start
 * as a build time. It reaches any build, where the list holds only the newest
 * few: a busy week of deploys can push the one a checkpoint wants off it.
 */
const WINDOW_BUILDS = 'window';

/** `2026-10-10 08:30`: a build or first-seen time, to the minute, in UTC like the build stamp itself. */
const minute = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

/** Production timing percentiles over a window the admin picks (seven days by default), without player or game identifiers. */
export default function AdminPerformance() {
  const [route, setRoute] = useState('all');
  const [metric, setMetric] = useState('all');
  const [windowId, setWindowId] = useState<string>('7d');
  const [anchor, setAnchor] = useState(() => new Date());
  const [custom, setCustom] = useState('');
  const [build, setBuild] = useState('');
  const preset = WINDOWS.find(choice => choice.id === windowId);
  // An unfinished custom time asks for no `since`, which is the server's default of seven days.
  const since = preset ? new Date(anchor.getTime() - preset.ms) : fromDateTimeLocal(custom);
  const buildFilter = build === WINDOW_BUILDS ? since?.toISOString() ?? null : build || null;
  const { data, isLoading, isRefreshing, refresh } = useRefreshableData<AdminPerformanceResponse>(`/api/admin/performance?${performanceWindowQuery(since, buildFilter)}`);
  // A preset counts back from `anchor`, so refreshing one moves the anchor (which changes the url, and refetches) rather than asking again for a window that has aged.
  const refreshWindow = () => preset ? setAnchor(new Date()) : refresh();
  const pickWindow = (id: string) => {
    setAnchor(new Date());
    // A custom time starts from the window that was on screen, so the field is never empty to begin with.
    if (id === CUSTOM && since) setCustom(toDateTimeLocal(since));
    setWindowId(id);
  };
  const routes = [...new Set(data?.summaries.map(row => row.route) ?? [])].sort();
  const metrics = [...new Set(data?.summaries.map(row => row.name) ?? [])].sort();
  const rows = data?.summaries.filter(row => (route === 'all' || row.route === route) && (metric === 'all' || row.name === metric)) ?? [];
  return <>
    <Section label="Performance" isLoading={isLoading} action={<span className="ag-section-actions">{data && <CopyAction label="Copy as Markdown" text={() => performanceMarkdown(data)} />}<RefreshAction onClick={refreshWindow} /></span>}>
      <div className="ag-stat-row"><Stat value={data?.totalSamples ?? '—'} label="Samples" /><Stat value={data?.summaries.length ?? '—'} label="Metric / route pairs" /></div>
      <p className="ag-hint">Anonymous browser and API timings. p75 is the main comparison. Journey timings (auth, first data, usable, navigation) run from the tap or page load and are split cold (a page load) and warm (an in-app navigation). API timings (server spans, api_*, response bytes, session retries) are split into a screen’s entry fetch and its later refreshes. The CLS, LCP and INP phases are split by the part of the page they name. Journey timings after a screen’s data arrived, and the cache metrics, are also split by where that data came from: a cache hit, a prefetch, a prefetch still in flight (joined), or a miss.</p>
      <div className="ag-field-row">
        <label>Since <select className="ag-select" value={windowId} onChange={event => pickWindow(event.target.value)}>{WINDOWS.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}<option value={CUSTOM}>Custom date and time</option></select></label>
        {!preset && <label>From <input className="ag-input" type="datetime-local" value={custom} onChange={event => setCustom(event.target.value)} /></label>}
        <label>From build <select className="ag-select" value={build} onChange={event => setBuild(event.target.value)}><option value="">Any build</option><option value={WINDOW_BUILDS}>Built since the window start</option>{data?.builds.map(row => <option key={row.build} value={row.build}>{`${minute(row.build)} · first seen ${minute(row.firstSeen)} · ${row.samples} samples`}</option>)}</select></label>
      </div>
      {data && <p className="ag-hint">Showing samples since {new Date(data.since).toLocaleString()}{data.build ? ` from builds made ${minute(data.build)} UTC or later (clients still on an older cached version, and samples with no build, are left out)` : ' from any build'}. The build list is the newest deploys in the last 30 days.</p>}
      {data && <div className="ag-field-row"><label>Route <select className="ag-select" value={route} onChange={event => setRoute(event.target.value)}><option value="all">All routes</option>{routes.map(value => <option key={value}>{value}</option>)}</select></label><label>Metric <select className="ag-select" value={metric} onChange={event => setMetric(event.target.value)}><option value="all">All metrics</option>{metrics.map(value => <option key={value}>{value}</option>)}</select></label></div>}
    </Section>
    {data && <ListSection label="Timing percentiles" isLoading={false} isRefreshing={isRefreshing} skeletonRows={0} empty={<div className="ag-empty">No performance samples yet. Use the app, then refresh.</div>}>
      {rows.map(row => ({ row, parts: [row.name, row.route, row.cache, row.request, row.region, row.dataSource].filter(Boolean) })).map(({ row, parts }) => <ListRow key={parts.join('-')} title={parts.join(' · ')} sub={`${row.samples} samples · median ${value(row.name, row.median)} · p95 ${value(row.name, row.p95)}`} action={<strong>p75 {value(row.name, row.p75)}</strong>} />)}
    </ListSection>}
  </>;
}
