'use client'
import ListRow from '@/components/ui/ListRow';
import ListSection from '@/components/ui/ListSection';
import CopyAction from '@/components/ui/CopyAction';
import RefreshAction from '@/components/ui/RefreshAction';
import Section from '@/components/ui/Section';
import Stat from '@/components/ui/Stat';
import { useRefreshableData } from '@/utils/hooks/useRefreshableData';
import type { AdminPerformanceResponse } from '@/app/api/admin/performance/route';
import { formatPerformanceValue as value, performanceMarkdown } from '@/utils/ui/performance';
import { useState } from 'react';

/** Seven-day production timing percentiles, without player or game identifiers. */
export default function AdminPerformance() {
  const [route, setRoute] = useState('all');
  const [metric, setMetric] = useState('all');
  const { data, isLoading, isRefreshing, refresh } = useRefreshableData<AdminPerformanceResponse>('/api/admin/performance');
  const routes = [...new Set(data?.summaries.map(row => row.route) ?? [])].sort();
  const metrics = [...new Set(data?.summaries.map(row => row.name) ?? [])].sort();
  const rows = data?.summaries.filter(row => (route === 'all' || row.route === route) && (metric === 'all' || row.name === metric)) ?? [];
  return <>
    <Section label="Performance" isLoading={isLoading} action={<span className="ag-section-actions">{data && <CopyAction label="Copy as Markdown" text={() => performanceMarkdown(data)} />}<RefreshAction onClick={refresh} /></span>}>
      <div className="ag-stat-row"><Stat value={data?.totalSamples ?? '—'} label="Samples (7 days)" /><Stat value={data?.summaries.length ?? '—'} label="Metric / route pairs" /></div>
      <p className="ag-hint">Anonymous browser and API timings. p75 is the main comparison.</p>
      {data && <div className="ag-field-row"><label>Route <select value={route} onChange={event => setRoute(event.target.value)}><option value="all">All routes</option>{routes.map(value => <option key={value}>{value}</option>)}</select></label><label>Metric <select value={metric} onChange={event => setMetric(event.target.value)}><option value="all">All metrics</option>{metrics.map(value => <option key={value}>{value}</option>)}</select></label></div>}
    </Section>
    {data && <ListSection label="Timing percentiles" isLoading={false} isRefreshing={isRefreshing} skeletonRows={0} empty={<div className="ag-empty">No performance samples yet. Use the app, then refresh.</div>}>
      {rows.map(row => <ListRow key={`${row.name}-${row.route}`} title={`${row.name} · ${row.route}`} sub={`${row.samples} samples · median ${value(row.name, row.median)} · p95 ${value(row.name, row.p95)}`} action={<strong>p75 {value(row.name, row.p75)}</strong>} />)}
    </ListSection>}
  </>;
}
